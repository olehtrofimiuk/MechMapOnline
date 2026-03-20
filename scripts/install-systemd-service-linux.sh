#!/usr/bin/env bash
# Install systemd unit for the MechMapOnline backend and enable it at boot.
# Requires root. Use on Linux with systemd (typical VPS; WSL may need systemd enabled).
#
# Usage (from repo root):
#   sudo ./scripts/install-systemd-service-linux.sh
#
# Optional environment:
#   MECHMAP_SERVICE_USER   Linux user to run the service (default: invoking user if sudo, else logname)
#   MECHMAP_BIND_HOST      uvicorn --host (default: 127.0.0.1; use 0.0.0.0 if no local reverse proxy)
#   MECHMAP_PORT           uvicorn --port (default: 8000)
#   MECHMAP_UNIT_NAME      systemd unit filename without path (default: mechmaponline-backend.service)
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly BACKEND_DIR="${REPO_ROOT}/backend"
readonly TEMPLATE="${SCRIPT_DIR}/systemd/mechmaponline-backend.service.template"
readonly UVICORN_BIN="${BACKEND_DIR}/.venv/bin/uvicorn"
readonly UNIT_NAME="${MECHMAP_UNIT_NAME:-mechmaponline-backend.service}"
readonly SYSTEMD_DIR="/etc/systemd/system"
readonly UNIT_PATH="${SYSTEMD_DIR}/${UNIT_NAME}"
readonly BIND_HOST="${MECHMAP_BIND_HOST:-127.0.0.1}"
readonly BIND_PORT="${MECHMAP_PORT:-8000}"

resolve_service_user() {
  if [[ -n "${MECHMAP_SERVICE_USER:-}" ]]; then
    printf '%s' "${MECHMAP_SERVICE_USER}"
    return 0
  fi
  if [[ -n "${SUDO_USER:-}" ]] && [[ "${SUDO_USER}" != "root" ]]; then
    printf '%s' "${SUDO_USER}"
    return 0
  fi
  logname 2>/dev/null || true
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "install-systemd-service-linux.sh: run as root (e.g. sudo $0)" >&2
  exit 1
fi

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "install-systemd-service-linux.sh: template missing: ${TEMPLATE}" >&2
  exit 1
fi

if [[ ! -x "${UVICORN_BIN}" ]]; then
  echo "install-systemd-service-linux.sh: uvicorn not found or not executable: ${UVICORN_BIN}" >&2
  echo "Run from repo root: ./scripts/bootstrap-backend-linux.sh" >&2
  exit 1
fi

readonly SERVICE_USER="$(resolve_service_user)"
if [[ -z "${SERVICE_USER}" ]]; then
  echo "install-systemd-service-linux.sh: could not determine service user. Set MECHMAP_SERVICE_USER." >&2
  exit 1
fi

if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  echo "install-systemd-service-linux.sh: user does not exist: ${SERVICE_USER}" >&2
  exit 1
fi

readonly SERVICE_GROUP="$(id -gn "${SERVICE_USER}")"

install -d -m 0755 "${SYSTEMD_DIR}"

sed \
  -e "s/__SERVICE_USER__/${SERVICE_USER//\//\\/}/g" \
  -e "s/__SERVICE_GROUP__/${SERVICE_GROUP//\//\\/}/g" \
  -e "s|__BACKEND_DIR__|${BACKEND_DIR//\\/\\\\}|g" \
  -e "s|__UVICORN_BIN__|${UVICORN_BIN//\\/\\\\}|g" \
  -e "s/__BIND_HOST__/${BIND_HOST//\//\\/}/g" \
  -e "s/__BIND_PORT__/${BIND_PORT//\//\\/}/g" \
  "${TEMPLATE}" >"${UNIT_PATH}"
chmod 0644 "${UNIT_PATH}"

systemctl daemon-reload
systemctl enable "${UNIT_NAME}"
systemctl restart "${UNIT_NAME}"

echo "Installed ${UNIT_PATH}" >&2
echo "Running as: ${SERVICE_USER}:${SERVICE_GROUP}" >&2
echo "Bind: ${BIND_HOST}:${BIND_PORT}" >&2
echo "" >&2
echo "Commands: systemctl status ${UNIT_NAME} | journalctl -u ${UNIT_NAME} -f" >&2
