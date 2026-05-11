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
"${PIP}" install --upgrade pip wheel setuptools >/dev/null

# Install PyTorch first (must come before sf3d's requirements so the MPS
# wheel is the one resolved against the rest of the tree).
"${PIP}" install --upgrade torch>=2.4 torchvision

# SF3D core. Their requirements.txt builds a few CUDA-tagged wheels that
# fall back to CPU/MPS gracefully — we don't pin them.
PYTORCH_ENABLE_MPS_FALLBACK=1 \
  "${PIP}" install -r "${SF3D_REPO}/requirements.txt"

# rembg ships its own ONNX runtime; SF3D's run.py uses it for background
# removal. Optional but strongly recommended for previs prop quality.
"${PIP}" install "rembg[cpu]==2.0.59" "onnxruntime>=1.17"

# ─── 4. Pre-download SF3D weights ────────────────────────────────────────────

say "Pre-downloading SF3D weights from HuggingFace (~3 GB)…"
"${PY}" - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download("stabilityai/stable-fast-3d", allow_patterns=["*.safetensors", "*.yaml", "*.json"])
print("Weights cached.")
PY

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
