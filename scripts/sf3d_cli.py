#!/usr/bin/env python3
"""
sf3d_cli.py — long-lived JSON-RPC server around Stability-AI's
Stable-Fast-3D for Scout3D.

Protocol (newline-delimited JSON, one object per line):

  ↓ stdin (requests)
    {"op": "ping"}
    {"op": "generate",
     "jobId": "...",
     "imagePath": "/abs/path/to/in.png",
     "outPath":   "/abs/path/to/out.glb",
     "removeBg":  true,           # optional, default true
     "foregroundRatio": 0.85,     # optional
     "textureResolution": 1024,   # optional
     "remesh": "none",            # optional: none|triangle|quad
     "vertexCount": -1}           # optional, -1 = no decimation

  ↑ stdout (events)
    {"kind": "ready"}
    {"kind": "pong"}
    {"kind": "progress", "jobId": "...", "pct": 5,  "step": "Loading model"}
    {"kind": "progress", "jobId": "...", "pct": 30, "step": "Removing background"}
    {"kind": "done",     "jobId": "...", "outPath": "...", "elapsedMs": 5234}
    {"kind": "error",    "jobId": "...", "message": "..."}
    {"kind": "log",      "message": "..."}

The model is loaded lazily on first `generate` so `ping` works without
holding ~6 GB of weights in unified memory. Once loaded, the model
stays resident for the lifetime of the process.

Run standalone for debugging:
    python sf3d_cli.py
    > {"op":"ping"}
    < {"kind":"pong"}
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from typing import Any

# Force MPS fallback BEFORE torch imports. Some SF3D ops aren't implemented
# on MPS yet; PyTorch silently falls back to CPU when this is set.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

# ─── Wire-protocol helpers ────────────────────────────────────────────────────


def emit(kind: str, **payload: Any) -> None:
    """Write a single newline-delimited event to stdout and flush."""
    sys.stdout.write(json.dumps({"kind": kind, **payload}) + "\n")
    sys.stdout.flush()


def log(msg: str) -> None:
    """Forward an informational line to the host as a `log` event."""
    emit("log", message=msg)


# ─── Lazy model loader ────────────────────────────────────────────────────────

_model = None
_rembg_session = None
_device: str | None = None


def _get_device() -> str:
    """Pick the best available device. MPS on Apple Silicon, else CPU."""
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _ensure_model(job_id: str) -> None:
    """Load SF3D + rembg the first time we need them."""
    global _model, _rembg_session, _device
    if _model is not None:
        return

    emit("progress", jobId=job_id, pct=3, step="Loading PyTorch")
    import torch  # noqa: F401  (already imported transitively but explicit is fine)

    _device = _get_device()
    log(f"device = {_device}")

    emit("progress", jobId=job_id, pct=8, step="Loading SF3D model")
    from sf3d.system import SF3D

    _model = SF3D.from_pretrained(
        "stabilityai/stable-fast-3d",
        config_name="config.yaml",
        weight_name="model.safetensors",
    )
    _model.to(_device)
    _model.eval()

    emit("progress", jobId=job_id, pct=15, step="Loading background remover")
    import rembg

    _rembg_session = rembg.new_session()


# ─── Generation ───────────────────────────────────────────────────────────────


def _generate(req: dict) -> None:
    """Run a single image→GLB job, emitting progress along the way."""
    job_id = req.get("jobId", "")
    image_path = req["imagePath"]
    out_path = req["outPath"]
    remove_bg = bool(req.get("removeBg", True))
    foreground_ratio = float(req.get("foregroundRatio", 0.85))
    texture_resolution = int(req.get("textureResolution", 1024))
    remesh = str(req.get("remesh", "none"))
    vertex_count = int(req.get("vertexCount", -1))

    started = time.time()

    _ensure_model(job_id)

    emit("progress", jobId=job_id, pct=25, step="Reading image")
    from PIL import Image

    image = Image.open(image_path).convert("RGBA")

    if remove_bg:
        emit("progress", jobId=job_id, pct=35, step="Removing background")
        from sf3d.utils import remove_background, resize_foreground

        image = remove_background(image, _rembg_session)
        image = resize_foreground(image, foreground_ratio)
    else:
        # SF3D still expects a centred subject, so apply the resize even when
        # the caller has already cropped — it's idempotent on a transparent
        # input that already has tight foreground bounds.
        from sf3d.utils import resize_foreground

        image = resize_foreground(image, foreground_ratio)

    emit("progress", jobId=job_id, pct=55, step="Running diffusion")
    import torch
    from contextlib import nullcontext

    autocast_ctx = (
        torch.autocast(device_type=_device, dtype=torch.bfloat16)
        if _device == "cuda"
        else nullcontext()
    )

    with torch.no_grad(), autocast_ctx:
        mesh, _ = _model.run_image(
            image,
            bake_resolution=texture_resolution,
            remesh=remesh,
            vertex_count=vertex_count,
        )

    emit("progress", jobId=job_id, pct=92, step="Writing GLB")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    mesh.export(out_path, include_normals=True)

    elapsed_ms = int((time.time() - started) * 1000)
    emit("done", jobId=job_id, outPath=out_path, elapsedMs=elapsed_ms)


# ─── Dispatch loop ────────────────────────────────────────────────────────────


def _dispatch(req: dict) -> None:
    op = req.get("op")

    if op == "ping":
        emit("pong")
        return

    if op == "generate":
        try:
            _generate(req)
        except Exception as exc:
            emit(
                "error",
                jobId=req.get("jobId", ""),
                message=f"{type(exc).__name__}: {exc}",
                traceback=traceback.format_exc(),
            )
        return

    emit("error", message=f"Unknown op: {op!r}")


def main() -> int:
    # Signal readiness immediately so the host doesn't have to wait for
    # torch to import before knowing the process is alive.
    emit("ready")

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            emit("error", message=f"Bad JSON: {exc}")
            continue
        _dispatch(req)

    return 0


if __name__ == "__main__":
    sys.exit(main())
