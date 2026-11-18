#!/usr/bin/env bash
# simulador.sh - genera ataques SSH simulados EN TIEMPO REAL para probar Vigía SSH
#
# Escribe eventos con el mismo formato que `journalctl -u ssh -o json` en un
# fichero JSON Lines (por defecto datos/simulacion.jsonl). La consola, en modo
# "Simulación", lanza el motor vigia_ssh.sh sobre ese fichero: la detección es
# exactamente la misma que con el registro real.
#
# IPs de los rangos reservados para documentación (RFC 5737): no son de nadie.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$DIR/datos/simulacion.jsonl"
VELOCIDAD=1
BUCLE=0
HOST="$(hostname)"

uso() {
  cat <<EOF
Uso: $(basename "$0") [opciones]
  -o FICHERO   Fichero de salida (defecto: datos/simulacion.jsonl)
  -x FACTOR    Velocidad: 2 = el doble de rápido (defecto: 1)
  --bucle      Repetir el guion de ataques sin parar
  --limpiar    Vaciar el fichero antes de empezar
  -h           Ayuda

Guion (≈ 2 min con velocidad 1):
  · fondo     admin legítimo entrando con clave pública cada ~35 s (no alerta)
  · fondo     escáner lento: 1 intento cada ~95 s (nunca llega al umbral)
  · ataque 1  fuerza bruta rápida contra root               -> alerta
  · ataque 2  diccionario de usuarios inexistentes          -> alerta
  · ataque 3  12 fallos y luego acceso correcto (deploy)    -> alerta + CRÍTICA
  · ataque 4  se repite la fuerza bruta                     -> SIN alerta (anti-duplicados)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) DESTINO="${2:?Falta el fichero}"; shift 2 ;;
    -x) VELOCIDAD="${2:?Falta el factor}"; shift 2 ;;
    --bucle) BUCLE=1; shift ;;
    --limpiar) LIMPIAR=1; shift ;;
    -h|--help) uso; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; uso >&2; exit 2 ;;
  esac
done
[[ $VELOCIDAD =~ ^[0-9]+([.][0-9]+)?$ ]] && awk -v v="$VELOCIDAD" 'BEGIN{exit !(v>0)}' \
  || { echo "La velocidad debe ser un número > 0" >&2; exit 2; }

mkdir -p "$(dirname "$DESTINO")"
if [[ ${LIMPIAR:-0} == 1 ]]; then : > "$DESTINO"; else touch "$DESTINO"; fi

# ---------- piezas ----------
narrar() { printf '[%s] %s\n' "$(date +%T)" "$*"; }
azar()   { echo $(( RANDOM % ($2 - $1 + 1) + $1 )); }
espera() { sleep "$(awk -v s="$1" -v f="$VELOCIDAD" 'BEGIN{printf "%.2f", s/f}')"; }

evento() {  # una línea con el formato de journalctl -o json (append atómico: una sola escritura)
  jq -nc --arg t "$(date +%s%6N)" --arg m "$1" --arg h "$HOST" --arg pid "$(azar 2000 60000)" \
    '{__REALTIME_TIMESTAMP: $t, _HOSTNAME: $h, _SYSTEMD_UNIT: "ssh.service",
      _COMM: "sshd-session", SYSLOG_IDENTIFIER: "sshd-session", _PID: $pid, MESSAGE: $m}' >> "$DESTINO"
}
fallo() {   # fallo <ip> <usuario> <existe: si|no>
  if [[ $3 == si ]]; then evento "Failed password for $2 from $1 port $(azar 32768 60999) ssh2"
  else evento "Failed password for invalid user $2 from $1 port $(azar 32768 60999) ssh2"; fi
}
acceso() {  # acceso <ip> <usuario> <metodo>
  evento "Accepted $3 for $2 from $1 port $(azar 32768 60999) ssh2"
}

# ---------- escenarios ----------
fondo_admin() {
  while :; do acceso 192.168.56.10 kali publickey; espera "$(azar 25 45)"; done
}
fondo_escaner_lento() {
  while :; do
    espera "$(azar 80 110)"
    fallo 198.51.100.23 "$(shuf -n1 -e root admin ubuntu)" si
  done
}
fuerza_bruta() {
  narrar "▶ Fuerza bruta rápida desde 203.0.113.45 contra root (20 intentos)"
  for _ in $(seq 20); do fallo 203.0.113.45 root si; espera "0.$(azar 3 8)"; done
}
diccionario() {
  narrar "▶ Diccionario de usuarios desde 192.0.2.77 (8 usuarios inexistentes)"
  for u in admin test oracle postgres git ubuntu pi guest; do fallo 192.0.2.77 "$u" no; espera "$(azar 1 3)"; done
}
compromiso() {
  narrar "▶ Ataque con éxito desde 203.0.113.99: 12 fallos y después entra como deploy"
  for _ in $(seq 12); do fallo 203.0.113.99 deploy si; espera 0.8; done
  espera 4
  acceso 203.0.113.99 deploy password
  narrar "  ✖ 203.0.113.99 ha entrado como deploy (debe salir alerta CRÍTICA)"
}

guion() {
  espera 4;  fuerza_bruta
  espera 12; diccionario
  espera 12; compromiso
  espera 15
  narrar "▶ Se repite la fuerza bruta desde 203.0.113.45 (no debe salir alerta nueva)"
  fuerza_bruta
}

# ---------- arranque ----------
trap 'kill $(jobs -p) 2>/dev/null; narrar "Simulación detenida."' EXIT
narrar "Simulación iniciada → $DESTINO (velocidad x$VELOCIDAD)"
acceso 192.168.56.10 kali publickey
fondo_admin &
fondo_escaner_lento &

guion
while (( BUCLE )); do espera 45; narrar "— Nueva ronda —"; guion; done
espera 5
narrar "Guion completo."
