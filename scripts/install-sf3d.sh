#!/usr/bin/env bash
#
# install-sf3d.sh — one-shot Stable-Fast-3D installer for Scout3D.
#
# Produces a self-contained Python environment at ~/.scout3d/sf3d that
# Scout3D's main process spawns at runtime to convert images into GLB
# meshes. Safe to re-run: idempotent on every step.
#
# Steps:
#   1. brew install libomp                  (SF3D's OpenMP requirement)
#   2. git clone Stability-AI/stable-fast-3d
#   3. python3.11 venv + pip install deps
#   4. pre-download SF3D weights from HuggingFace
#   5. copy sf3d_cli.py into the install dir
#   6. write .installed marker
#
# Total time: ~10 min, ~3 GB download.

set -euo pipefail

# ─── Paths ───────────────────────────────────────────────────────────────────

SCOUT3D_HOME="${HOME}/.scout3d"
SF3D_HOME="${SCOUT3D_HOME}/sf3d"
SF3D_REPO="${SF3D_HOME}/stable-fast-3d"
VENV="${SF3D_HOME}/.venv"
PY="${VENV}/bin/python"
PIP="${VENV}/bin/pip"
MARKER="${SF3D_HOME}/.installed"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_SRC="${SCRIPT_DIR}/sf3d_cli.py"

# ─── Helpers ─────────────────────────────────────────────────────────────────

say()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
warn() { printf "\n\033[1;33m⚠ %s\033[0m\n" "$*"; }
die()  { printf "\n\033[1;31m✖ %s\033[0m\n" "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

# ─── Pre-flight ──────────────────────────────────────────────────────────────

if [[ "$(uname)" != "Darwin" ]]; then
  warn "This installer targets macOS. On Linux you likely don't need libomp; on Windows use SF3D's official setup."
fi

require_cmd git
require_cmd python3.11 || die "python3.11 not found. Install via 'brew install python@3.11'."

mkdir -p "${SF3D_HOME}"

# ─── 1. OpenMP runtime ───────────────────────────────────────────────────────

say "Checking libomp (required by PyTorch on macOS)…"
if [[ "$(uname)" == "Darwin" ]]; then
  if command -v brew >/dev/null 2>&1; then
    brew list libomp >/dev/null 2>&1 || brew install libomp
  else
    warn "Homebrew not found — please install libomp manually if SF3D fails at load."
  fi
fi

# ─── 2. Clone stable-fast-3d ─────────────────────────────────────────────────

say "Fetching stable-fast-3d source…"
if [[ -d "${SF3D_REPO}/.git" ]]; then
  git -C "${SF3D_REPO}" pull --ff-only
else
  git clone --depth 1 https://github.com/Stability-AI/stable-fast-3d.git "${SF3D_REPO}"
fi

# ─── 3. Virtualenv + pip install ─────────────────────────────────────────────

say "Creating Python 3.11 venv at ${VENV}…"
if [[ ! -x "${PY}" ]]; then
  python3.11 -m venv "${VENV}"
fi

say "Installing core dependencies (this is the long step — go get coffee)…"
# Pin setuptools below 82 — torch's build pins setuptools<82 and a newer
# version raises a dependency-resolver warning that pollutes the install
# log. Pinning here is cosmetic but worth it.
"${PIP}" install --upgrade pip wheel "setuptools<82" >/dev/null

# 1. Torch first. Local C++ extensions (texture_baker, uv_unwrapper)
#    import torch in their setup.py, so it must be importable before
#    they get built. We resolve the MPS-capable wheel here.
"${PIP}" install --upgrade "torch>=2.4" torchvision

# 2. Build the two in-tree C++ extensions WITH --no-build-isolation so
#    they can see torch in our venv. PEP 517's isolated build would
#    otherwise spin up a sandbox that hides torch and the build fails
#    with "No module named 'torch'".
say "Building SF3D C++ extensions (texture_baker, uv_unwrapper)…"
(
  cd "${SF3D_REPO}"
  PYTORCH_ENABLE_MPS_FALLBACK=1 \
    "${PIP}" install --no-build-isolation ./texture_baker ./uv_unwrapper
)

# 3. Now the rest of SF3D's requirements, with the two local entries
#    stripped (already handled above). We rewrite to a temp file rather
#    than touching the repo so a future `git pull` doesn't conflict.
say "Installing the rest of the SF3D Python dependencies…"
REQS_FILTERED="$(mktemp -t sf3d_reqs.XXXXXX)"
grep -vE '^\s*\./(texture_baker|uv_unwrapper)/?\s*$' \
  "${SF3D_REPO}/requirements.txt" > "${REQS_FILTERED}"
PYTORCH_ENABLE_MPS_FALLBACK=1 \
  "${PIP}" install -r "${REQS_FILTERED}"
rm -f "${REQS_FILTERED}"

# 4. onnxruntime is rembg's silent dependency on darwin; pin a modern
#    version with MPS-friendly arm64 wheels.
"${PIP}" install "onnxruntime>=1.17"

# ─── 4. Pre-download SF3D weights ────────────────────────────────────────────
#
# stabilityai/stable-fast-3d is a gated HuggingFace repo. The user must
# (a) accept the license once at https://huggingface.co/stabilityai/stable-fast-3d
# and (b) be authenticated locally (`huggingface-cli login` or HF_TOKEN env).
# We attempt the download here but soft-fail if auth is missing — sf3d_cli.py
# will retry on first generate, so this step is purely optimistic warm-up.

say "Pre-downloading SF3D weights from HuggingFace (~3 GB)…"
set +e
"${PY}" - <<'PY'
import sys
try:
    from huggingface_hub import snapshot_download
    snapshot_download(
        "stabilityai/stable-fast-3d",
        allow_patterns=["*.safetensors", "*.yaml", "*.json"],
    )
    print("Weights cached.")
    sys.exit(0)
except Exception as exc:
    print(f"NOTE: weight pre-download skipped: {exc}", file=sys.stderr)
    sys.exit(2)
PY
HF_RC=$?
set -e

if [[ ${HF_RC} -ne 0 ]]; then
  warn "Weights were not downloaded. Most likely cause: SF3D is a gated"
  warn "HuggingFace repo. To finish setup:"
  echo "    1. Visit https://huggingface.co/stabilityai/stable-fast-3d and"
  echo "       click 'Agree and access repository' (requires a free HF account)."
  echo "    2. Create a read token at https://huggingface.co/settings/tokens"
  echo "    3. Run: ${VENV}/bin/huggingface-cli login"
  echo "       (or export HF_TOKEN=hf_… in your shell)"
  echo "    4. Re-run this installer to fetch weights."
  echo
  echo "    The rest of the install is complete — you can run Scout3D's"
  echo "    Generate-Prop modal once authentication is set up, and the"
  echo "    weights will download lazily on the first generation."
fi

# ─── 5. Copy CLI server ──────────────────────────────────────────────────────

say "Installing sf3d_cli.py shim…"
if [[ ! -f "${CLI_SRC}" ]]; then
  die "Expected to find sf3d_cli.py next to this installer at ${CLI_SRC}"
fi
cp "${CLI_SRC}" "${SF3D_HOME}/sf3d_cli.py"

# ─── 6. Marker file ──────────────────────────────────────────────────────────

cat > "${MARKER}" <<EOF
installed_at=$(date -u +%FT%TZ)
sf3d_commit=$(git -C "${SF3D_REPO}" rev-parse HEAD)
python=${PY}
EOF

say "Done."
echo
echo "  Python:       ${PY}"
echo "  CLI shim:     ${SF3D_HOME}/sf3d_cli.py"
echo "  Marker:       ${MARKER}"
echo
echo "Quick test:"
echo "  echo '{\"op\":\"ping\"}' | ${PY} ${SF3D_HOME}/sf3d_cli.py"
echo
