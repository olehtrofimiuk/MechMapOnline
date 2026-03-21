#!/usr/bin/env bash
# Build the React app into backend/web for standalone backend deployment.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}/frontend"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
  pnpm run build
else
  npm install
  npm run build
fi
echo "UI output: ${REPO_ROOT}/backend/web"
