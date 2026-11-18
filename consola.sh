#!/usr/bin/env bash
# consola.sh - arranca la consola web de Vigía SSH y la abre en el navegador
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
PUERTO="${PUERTO:-8800}"
export PUERTO

command -v jq >/dev/null || { echo "Falta jq: sudo apt install jq" >&2; exit 1; }
systemctl is-active --quiet ssh || echo "Aviso: el servicio SSH está parado (sudo systemctl start ssh)" >&2

( sleep 1.5; xdg-open "http://127.0.0.1:$PUERTO" >/dev/null 2>&1 || true ) &
exec python3 consola/servidor.py
