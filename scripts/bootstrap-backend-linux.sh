#!/usr/bin/env bash
# Install uv if needed, then create backend .venv and sync dependencies from uv.lock.
# Usage: from repo root — ./scripts/bootstrap-backend-linux.sh
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly BACKEND_DIR="${REPO_ROOT}/backend"

if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "bootstrap-backend-linux.sh: backend directory not found: ${BACKEND_DIR}" >&2
  exit 1
fi

prepend_path() {
  local dir="$1"
  case ":${PATH:-}:" in
    *":${dir}:"*) ;;
    *) export PATH="${dir}:${PATH:-}" ;;
  esac
}

readonly LOCAL_BIN_PATH_MARKER="# mechmap-bootstrap: ~/.local/bin (uv default install location)"

ensure_bashrc_includes_local_bin() {
  local bashrc="${HOME}/.bashrc"
  if [[ -f "${bashrc}" ]] && grep -Fq "${LOCAL_BIN_PATH_MARKER}" "${bashrc}"; then
    return 0
  fi
  {
    echo ""
    echo "${LOCAL_BIN_PATH_MARKER}"
    echo "if [[ -d \"\${HOME}/.local/bin\" ]]; then"
    echo "  case \":\${PATH:-}:\" in"
    echo "    *\":\${HOME}/.local/bin\":*) ;;"
    echo "    *) export PATH=\"\${HOME}/.local/bin:\${PATH:-}\" ;;"
    echo "  esac"
    echo "fi"
  } >>"${bashrc}"
  echo "bootstrap-backend-linux.sh: updated ${bashrc} so ~/.local/bin is on PATH in new shells. This shell: source ~/.bashrc" >&2
}

ensure_uv() {
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi
  prepend_path "${HOME}/.local/bin"
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi
  prepend_path "${HOME}/.cargo/bin"
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi

  echo "uv not found; installing via https://astral.sh/uv/install.sh ..." >&2
  curl -LsSf https://astral.sh/uv/install.sh | sh
  prepend_path "${HOME}/.local/bin"
  prepend_path "${HOME}/.cargo/bin"

  if ! command -v uv >/dev/null 2>&1; then
    echo "bootstrap-backend-linux.sh: uv installed but not on PATH. Add ~/.local/bin to PATH and retry." >&2
    exit 1
  fi
}

ensure_uv
echo "Syncing Python environment in ${BACKEND_DIR} ..." >&2
(cd "${BACKEND_DIR}" && uv sync --frozen)
ensure_bashrc_includes_local_bin
echo "Done. Activate with: source ${BACKEND_DIR}/.venv/bin/activate" >&2
cat >&2 <<EOF

Start the API (no uv on PATH needed — uses the venv you just synced):
  cd ${BACKEND_DIR} && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

\`uv\` is on PATH in new login/interactive shells after this script (snippet in ~/.bashrc). In this shell, either:
  source ~/.bashrc
or:
  cd ${BACKEND_DIR} && uv run uvicorn main:app --host 0.0.0.0 --port 8000
EOF
