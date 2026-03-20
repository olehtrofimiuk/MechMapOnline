#!/usr/bin/env bash
# Install or refresh nginx reverse proxy for MechMapOnline (uvicorn upstream).
# Requires root. Tested on Debian/Ubuntu-style nginx layouts (conf.d under http).
#
# Usage:
#   sudo ./scripts/setup-nginx-linux.sh your.domain.com
#   sudo ./scripts/setup-nginx-linux.sh "your.domain.com www.your.domain.com"
#
# Optional environment:
#   MECHMAP_UPSTREAM   default 127.0.0.1:8000  (host:port for uvicorn)
#   MECHMAP_CONF_NAME  default mechmaponline.conf  (under /etc/nginx/conf.d/)
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly TEMPLATE="${SCRIPT_DIR}/nginx/mechmaponline.conf.template"
readonly DEST_DIR="/etc/nginx/conf.d"
readonly CONF_NAME="${MECHMAP_CONF_NAME:-mechmaponline.conf}"
readonly DEST_PATH="${DEST_DIR}/${CONF_NAME}"
readonly UPSTREAM="${MECHMAP_UPSTREAM:-127.0.0.1:8000}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "setup-nginx-linux.sh: run as root (e.g. sudo $0 ...)" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "usage: sudo $0 <server_name>" >&2
  echo "  server_name: one domain or several space-separated (nginx server_name)" >&2
  echo "example: sudo $0 mechmaponline.fun" >&2
  echo "example: sudo $0 'mechmaponline.fun www.mechmaponline.fun'" >&2
  exit 1
fi

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "setup-nginx-linux.sh: template missing: ${TEMPLATE}" >&2
  exit 1
fi

# Collapse multiple args into one server_name line
readonly SERVER_NAME="$*"

if ! command -v nginx >/dev/null 2>&1; then
  echo "Installing nginx ..." >&2
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y nginx
fi

install -d -m 0755 "${DEST_DIR}"

sed \
  -e "s/__SERVER_NAME__/${SERVER_NAME//\//\\/}/g" \
  -e "s/__UPSTREAM__/${UPSTREAM//\//\\/}/g" \
  "${TEMPLATE}" >"${DEST_PATH}"
chmod 0644 "${DEST_PATH}"

nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "Installed ${DEST_PATH}" >&2
echo "server_name: ${SERVER_NAME}" >&2
echo "upstream:    ${UPSTREAM}" >&2
echo "" >&2
echo "Ensure uvicorn is listening (e.g. cd ${REPO_ROOT}/backend && .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000)." >&2
echo "Then open http://${SERVER_NAME%% *}/" >&2
