#!/usr/bin/env bash
# vigia_ssh.sh - Detector de fuerza bruta SSH con alertas por webhook (Ejercicio 3)
#
# Lee eventos de journalctl en JSON (o de un fichero JSON Lines), cuenta los
# "Failed password" por IP dentro de una ventana de tiempo y, si una IP llega
# al umbral, envía una alerta JSON al canal "alertas" (webhook).
#
# Fase 1: lectura journalctl / -f fichero, extracción con jq+capture, agrupado
#         por IP, umbral -u, severidad media/alta, anti-repetición (estado.json).
# Fase 2: -c modo continuo, severidad "critica" (fallos + Accepted posterior),
#         lista_blanca.json, --bloquear con nftables (con confirmación).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- configuración por defecto ----------
UMBRAL=5                 # intentos para alertar (alta a partir de 2*UMBRAL)
VENTANA_MIN=5            # ventana de análisis en minutos
SILENCIO_SEG=600         # no repetir alerta de la misma IP durante 10 min
FICHERO=""
CONTINUO=0
BLOQUEAR=0
WEBHOOK_URL="${WEBHOOK_URL:-}"
IP_PROFESOR="${IP_PROFESOR:-}"
ESTADO="${ESTADO:-$DIR/estado.json}"
LISTA_BLANCA="${LISTA_BLANCA:-$DIR/lista_blanca.json}"
HOST="$(hostname)"

uso() {
  cat <<EOF
Uso: $(basename "$0") [opciones]

  -f FICHERO       Leer eventos de un fichero JSON Lines en vez de journalctl
  -u N             Umbral de intentos fallidos por IP (defecto: $UMBRAL)
  -v MIN           Ventana de tiempo en minutos (defecto: $VENTANA_MIN)
  -w URL           Webhook del canal "alertas" (o variable WEBHOOK_URL).
                   Sin webhook, la alerta solo se imprime por pantalla.
  -c, --continuo   Modo continuo: journalctl -f (o tail -F del fichero con -f)
  --bloquear       Ofrecer bloqueo nft de la IP alertada (pide confirmación)
  -p IP            IP del profesor (obligatoria con --bloquear; nunca se bloquea)
  -h, --help       Esta ayuda

Ficheros: estado.json (IPs alertadas y cuándo), lista_blanca.json (IPs ignoradas)
EOF
}

log() { printf '[%s] %s\n' "$(date +%T)" "$*" >&2; }

# ---------- argumentos ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f) FICHERO="${2:?Falta el fichero tras -f}"; shift 2 ;;
    -u) UMBRAL="${2:?Falta el número tras -u}"; shift 2 ;;
    -v) VENTANA_MIN="${2:?Falta los minutos tras -v}"; shift 2 ;;
    -w) WEBHOOK_URL="${2:?Falta la URL tras -w}"; shift 2 ;;
    -p) IP_PROFESOR="${2:?Falta la IP tras -p}"; shift 2 ;;
    -c|--continuo) CONTINUO=1; shift ;;
    --bloquear) BLOQUEAR=1; shift ;;
    -h|--help) uso; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; uso >&2; exit 2 ;;
  esac
done

[[ $UMBRAL =~ ^[1-9][0-9]*$ ]]      || { echo "El umbral debe ser un entero > 0" >&2; exit 2; }
[[ $VENTANA_MIN =~ ^[1-9][0-9]*$ ]] || { echo "La ventana debe ser un entero > 0" >&2; exit 2; }
[[ -z $FICHERO || -r $FICHERO ]]    || { echo "No puedo leer $FICHERO" >&2; exit 1; }
if (( BLOQUEAR )) && [[ -z $IP_PROFESOR ]]; then
  echo "--bloquear exige indicar la IP del profesor con -p (o IP_PROFESOR) para no bloquearla nunca" >&2
  exit 2
fi

# estado.json: { "IP": {"ts": epoch, "cuando": "ISO", "severidad": "..."} }
if ! jq -e 'type == "object"' "$ESTADO" >/dev/null 2>&1; then echo '{}' > "$ESTADO"; fi

# lista blanca: admite ["ip", ...] o {"ips": [...]}
BLANCA='[]'
if [[ -r $LISTA_BLANCA ]]; then
  BLANCA=$(jq -c 'if type == "array" then . else (.ips // []) end' "$LISTA_BLANCA" 2>/dev/null) \
    || { log "AVISO: $LISTA_BLANCA no es JSON válido, se ignora"; BLANCA='[]'; }
fi

# ---------- análisis (jq) ----------
# Entrada: eventos JSON Lines por stdin. $1 = instante de referencia (epoch) o
# "null" para usar el último evento del fichero (útil con logs de prueba antiguos).
# Salida: una línea JSON por IP que alcanza el umbral:
#   {ip, intentos, usuarios, accesos, severidad}
analizar() {
  jq -s -c --argjson ref "$1" --argjson ventana "$VENTANA_MIN" \
           --argjson umbral "$UMBRAL" --argjson blanca "$BLANCA" '
    # 1. Normalizar: segundos epoch + mensaje (MESSAGE puede no ser texto)
    [ .[] | select(type == "object" and (.MESSAGE | type) == "string")
          | {t: ((.__REALTIME_TIMESTAMP // "0") | tonumber / 1000000 | floor), m: .MESSAGE} ] as $ev

    # 2. Ventana [fin - ventana, fin]
    | (if $ref == null then ([$ev[].t] | max // 0) else $ref end) as $fin
    | [ $ev[] | select(.t >= $fin - $ventana * 60 and .t <= $fin) ] as $ev

    # 3. Extraer usuario e IP con capture (grupos con nombre)
    | [ $ev[] | .t as $t | .m
        | capture("^Failed password for (invalid user )?(?<usuario>\\S+) from (?<ip>[0-9A-Fa-f.:]+)")
        | {usuario, ip, t: $t} ] as $fallos
    | [ $ev[] | .t as $t | .m
        | capture("^Accepted \\S+ for (?<usuario>\\S+) from (?<ip>[0-9A-Fa-f.:]+)")
        | {usuario, ip, t: $t} ] as $exitos

    # 4. Agrupar por IP, contar y deduplicar usuarios
    | $fallos | group_by(.ip) | .[]
    | (.[0].ip) as $ip
    | (map(.t) | min) as $primero
    | select(any($blanca[]; . == $ip) | not)
    | { ip: $ip,
        intentos: length,
        usuarios: (map(.usuario) | unique),
        accesos: ([ $exitos[] | select(.ip == $ip and .t >= $primero) | .usuario ] | unique) }

    # 5. Umbral y severidad
    | select(.intentos >= $umbral)
    | .severidad = (if (.accesos | length) > 0   then "critica"
                    elif .intentos >= 2 * $umbral then "alta"
                    else "media" end)
  '
}


enviar() {  # enviar <json>
  printf '%s\n' "$1"                      # la alerta siempre sale por stdout
  [[ -z $WEBHOOK_URL ]] && { log "(sin webhook: alerta solo mostrada)"; return 0; }
  if curl -fsS -m 10 -H 'Content-Type: application/json' -d "$1" "$WEBHOOK_URL" >/dev/null; then
    log "Alerta enviada al canal alertas"
  else
    log "ERROR: no se pudo enviar la alerta al webhook"; return 1
  fi
}

# ---------- bloqueo (fase 2) ----------
ip_protegida() {
  local ip=$1 propia
  [[ $ip == "$IP_PROFESOR" || $ip == 127.* || $ip == ::1 ]] && return 0
  [[ -n ${SSH_CLIENT:-} && $ip == "${SSH_CLIENT%% *}" ]] && return 0   # nuestra sesión SSH
  for propia in $(hostname -I 2>/dev/null); do [[ $ip == "$propia" ]] && return 0; done
  jq -e --arg ip "$ip" 'any(.[]; . == $ip)' <<<"$BLANCA" >/dev/null && return 0
  return 1
}

bloquear() {
  local ip=$1 resp conjunto=bl4 familia=ip
  [[ $ip == *:* ]] && { conjunto=bl6; familia=ip6; }
  if ip_protegida "$ip"; then log "NO se bloquea $ip: es protegida (profesor/propia/lista blanca)"; return 0; fi
  [[ -r /dev/tty ]] || { log "Sin terminal para confirmar; no se bloquea $ip"; return 0; }
  read -r -p "¿Bloquear $ip durante 1 h con nftables? [s/N] " resp </dev/tty || resp=""
  [[ $resp =~ ^[sS]$ ]] || { log "Bloqueo de $ip cancelado"; return 0; }

  # Tabla propia, con conjuntos con caducidad: se limpia con 'sudo nft delete table inet vigia_ssh'
  sudo nft add table inet vigia_ssh
  sudo nft add set inet vigia_ssh bl4 '{ type ipv4_addr; flags timeout; timeout 1h; }'
  sudo nft add set inet vigia_ssh bl6 '{ type ipv6_addr; flags timeout; timeout 1h; }'
  sudo nft add chain inet vigia_ssh entrada '{ type filter hook input priority -10; policy accept; }'
  if ! sudo nft list chain inet vigia_ssh entrada | grep -q '@bl4'; then
    sudo nft add rule inet vigia_ssh entrada ip saddr @bl4 drop
    sudo nft add rule inet vigia_ssh entrada ip6 saddr @bl6 drop
  fi
  sudo nft add element inet vigia_ssh "$conjunto" "{ $ip }" \
    && log "BLOQUEADA $ip ($familia, 1 h). Desbloquear: sudo nft delete element inet vigia_ssh $conjunto '{ $ip }'"
}

# ---------- procesado: umbral -> estado -> alerta ----------
procesar() {  # stdin: eventos; $1: referencia temporal (epoch o null)
  local cand ip sev ahora prev pts psev alerta
  while IFS= read -r cand; do
    ahora=$(date +%s)
    ip=$(jq -r .ip <<<"$cand")
    sev=$(jq -r .severidad <<<"$cand")

    # No repetir: misma IP alertada hace < 10 min. Única excepción: que pase a
    # "critica" (ha conseguido entrar), que es un hecho nuevo y debe avisarse.
    prev=$(jq -c --arg ip "$ip" '.[$ip] // empty' "$ESTADO")
    if [[ -n $prev ]]; then
      pts=$(jq -r '.ts' <<<"$prev"); psev=$(jq -r '.severidad' <<<"$prev")
      if (( ahora - pts < SILENCIO_SEG )) && ! [[ $sev == critica && $psev != critica ]]; then
        continue
      fi
    fi

    alerta=$(jq -c --arg host "$HOST" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                   --argjson v "$VENTANA_MIN" \
      '{tipo: "alerta_ssh", host: $host, ts: $ts, ip, intentos,
        ventana_min: $v, usuarios, severidad}' <<<"$cand")
    log "IP $ip: $(jq -r .intentos <<<"$cand") fallos -> severidad $sev"

    if enviar "$alerta"; then
      jq --arg ip "$ip" --argjson ts "$ahora" --arg sev "$sev" \
         --arg cuando "$(date -u -d "@$ahora" +%Y-%m-%dT%H:%M:%SZ)" \
         '.[$ip] = {ts: $ts, cuando: $cuando, severidad: $sev}
          | with_entries(select(.value.ts > $ts - 86400))' \
         "$ESTADO" > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
    fi
    if (( BLOQUEAR )); then bloquear "$ip"; fi
  done < <(analizar "$1")
}

# ---------- modos de ejecución ----------
modo_puntual() {
  if [[ -n $FICHERO ]]; then
    procesar null < "$FICHERO"                      # ventana = últimos N min del fichero
  else
    journalctl -u ssh -o json --no-pager --since "-${VENTANA_MIN} min" 2>/dev/null \
      | grep '^{' | procesar "$(date +%s)" || true
  fi
}

modo_continuo() {
  local linea ahora   # buf es global: la trampa EXIT se ejecuta fuera de la función
  buf=$(mktemp); trap 'rm -f "$buf" "$buf.n"' EXIT
  log "Vigilando SSH (umbral $UMBRAL, ventana $VENTANA_MIN min). Ctrl+C para salir."
  {
    if [[ -n $FICHERO ]]; then tail -n0 -F "$FICHERO" 2>/dev/null
    else journalctl -u ssh -o json --no-pager -f -n 0; fi
  } | while IFS= read -r linea; do
    # Solo interesan fallos y accesos; el resto se descarta sin analizar
    jq -e '(.MESSAGE | type) == "string" and (.MESSAGE | test("^(Failed password|Accepted )"))' \
       <<<"$linea" >/dev/null 2>&1 || continue
    printf '%s\n' "$linea" >> "$buf"
    ahora=$(date +%s)
    # Ventana deslizante: descartar eventos más antiguos que la ventana
    jq -c --argjson ini $(( ahora - VENTANA_MIN * 60 )) \
       'select((.__REALTIME_TIMESTAMP | tonumber / 1000000) >= $ini)' "$buf" > "$buf.n" \
       && mv "$buf.n" "$buf"
    procesar "$ahora" < "$buf"
  done
}

if (( CONTINUO )); then modo_continuo; else modo_puntual; fi
