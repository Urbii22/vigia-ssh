#!/usr/bin/env python3
"""
Consola Vigía SSH - servidor local (solo biblioteca estándar de Python).

Piezas:
  * Motor      -> lanza/para vigia_ssh.sh -c (el detector real, en bash).
  * Receptor   -> POST /api/alertas: el motor manda aquí sus alertas (webhook local),
                  se guardan en datos/alertas.jsonl y se reenvían, si se configura,
                  a un webhook externo (p. ej. webhook.site).
  * Observador -> sigue `journalctl -u ssh -f -o json` para mostrar cada intento en directo.
  * Flujo      -> GET /api/flujo (Server-Sent Events): empuja intentos y alertas al navegador.

Escucha solo en 127.0.0.1: la consola no es accesible desde otras máquinas.
"""
import datetime
import ipaddress
import json
import os
import queue
import re
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
WEB = Path(__file__).resolve().parent / "web"
DATOS = RAIZ / "datos"
VIGIA = RAIZ / "vigia_ssh.sh"
ESTADO = RAIZ / "estado.json"
LISTA_BLANCA = RAIZ / "lista_blanca.json"
ALERTAS = DATOS / "alertas.jsonl"
CONFIG = DATOS / "config.json"
LOG_MOTOR = DATOS / "motor.log"
SIMULADOR = RAIZ / "simulador.sh"
SIMULACION = DATOS / "simulacion.jsonl"
LOG_SIMULADOR = DATOS / "simulador.log"

HOST = "127.0.0.1"
PUERTO = int(os.environ.get("PUERTO", "8800"))
SILENCIO_SEG = 600  # el mismo valor que usa vigia_ssh.sh
NOMBRE_HOST = socket.gethostname()

CONFIG_DEFECTO = {"umbral": 5, "ventana": 5, "webhook_externo": "", "autoarranque": True,
                  "fuente": "journal"}  # fuente: "journal" (real) o "simulacion"

RE_FALLO = re.compile(r"^Failed password for (?:invalid user )?(?P<usuario>\S+) from (?P<ip>[0-9A-Fa-f.:]+)")
RE_ACCESO = re.compile(r"^Accepted \S+ for (?P<usuario>\S+) from (?P<ip>[0-9A-Fa-f.:]+)")

ESTATICOS = {
    "index.html": "text/html; charset=utf-8",
    "app.js": "text/javascript; charset=utf-8",
    "estilo.css": "text/css; charset=utf-8",
}


# ---------------------------------------------------------------- utilidades
def leer_json(ruta, defecto):
    try:
        return json.loads(ruta.read_text())
    except (OSError, ValueError):
        return defecto


def escribir_json(ruta, datos):
    tmp = ruta.with_name(ruta.name + ".tmp")
    tmp.write_text(json.dumps(datos, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(ruta)


def leer_config():
    cfg = dict(CONFIG_DEFECTO)
    cfg.update(leer_json(CONFIG, {}))
    return cfg


def leer_lista_blanca():
    datos = leer_json(LISTA_BLANCA, [])
    if isinstance(datos, dict):
        datos = datos.get("ips", [])
    return [str(ip) for ip in datos] if isinstance(datos, list) else []


def es_simulacion():
    return leer_config().get("fuente") == "simulacion"


def ssh_activo():
    try:
        r = subprocess.run(["systemctl", "is-active", "ssh"], capture_output=True, text=True, timeout=5)
        return r.stdout.strip() == "active"
    except (OSError, subprocess.SubprocessError):
        return False


def parsear_evento(linea):
    """Línea de journalctl -o json -> {t, ip, usuario, tipo} o None."""
    try:
        obj = json.loads(linea)
    except ValueError:
        return None
    msg = obj.get("MESSAGE")
    if not isinstance(msg, str):
        return None
    for regex, tipo in ((RE_FALLO, "fallo"), (RE_ACCESO, "acceso")):
        m = regex.match(msg)
        if m:
            t = int(obj.get("__REALTIME_TIMESTAMP", "0")) / 1_000_000
            return {"t": t, "ip": m["ip"], "usuario": m["usuario"], "tipo": tipo}
    return None


# ---------------------------------------------------------------- bus de eventos (SSE)
class Bus:
    def __init__(self):
        self.suscriptores = set()
        self.lock = threading.Lock()

    def suscribir(self):
        q = queue.Queue(maxsize=2000)
        with self.lock:
            self.suscriptores.add(q)
        return q

    def baja(self, q):
        with self.lock:
            self.suscriptores.discard(q)

    def publicar(self, tipo, datos):
        msg = f"event: {tipo}\ndata: {json.dumps(datos, ensure_ascii=False)}\n\n".encode()
        with self.lock:
            subs = list(self.suscriptores)
        for q in subs:
            try:
                q.put_nowait(msg)
            except queue.Full:
                pass


bus = Bus()


# ---------------------------------------------------------------- motor (vigia_ssh.sh)
class Motor:
    def __init__(self):
        self.proc = None
        self.desde = None
        self.lock = threading.Lock()

    def activo(self):
        return self.proc is not None and self.proc.poll() is None

    def iniciar(self):
        with self.lock:
            if self.activo():
                return
            cfg = leer_config()
            cmd = ["bash", str(VIGIA), "-c",
                   "-u", str(cfg["umbral"]), "-v", str(cfg["ventana"]),
                   "-w", f"http://{HOST}:{PUERTO}/api/alertas"]
            if cfg.get("fuente") == "simulacion":
                SIMULACION.touch()
                cmd += ["-f", str(SIMULACION)]  # misma detección, sobre el fichero simulado
            log = open(LOG_MOTOR, "ab")
            self.proc = subprocess.Popen(
                cmd,
                cwd=RAIZ, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                start_new_session=True,  # grupo propio: al parar matamos también journalctl
            )
            log.close()
            self.desde = time.time()
        bus.publicar("motor", self.estado())

    def detener(self):
        with self.lock:
            if self.activo():
                try:
                    os.killpg(self.proc.pid, signal.SIGTERM)
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(self.proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            self.proc = None
            self.desde = None
        bus.publicar("motor", self.estado())

    def reiniciar_si_activo(self):
        if self.activo():
            self.detener()
            self.iniciar()

    def externos(self):
        """Sesiones de vigia_ssh.sh en modo continuo lanzadas fuera de la consola
        (cada vigía crea varios subprocesos bash; se agrupan por sesión)."""
        try:
            r = subprocess.run(["pgrep", "-f", r"vigia_ssh\.sh .*(-c|--continuo)"],
                               capture_output=True, text=True, timeout=5)
        except (OSError, subprocess.SubprocessError):
            return []
        propio = self.proc.pid if self.activo() else None
        sesiones = set()
        for p in r.stdout.split():
            try:
                sid = os.getsid(int(p))
            except (ValueError, ProcessLookupError, PermissionError):
                continue
            if sid != propio:
                sesiones.add(sid)
        return sorted(sesiones)

    def estado(self):
        return {"activo": self.activo(), "desde": self.desde, "externos": len(self.externos())}


motor = Motor()


class Simulador:
    """Lanza simulador.sh, que escribe ataques ficticios en datos/simulacion.jsonl."""

    def __init__(self):
        self.proc = None
        self.lock = threading.Lock()

    def activo(self):
        return self.proc is not None and self.proc.poll() is None

    def iniciar(self):
        with self.lock:
            if self.activo():
                return
            log = open(LOG_SIMULADOR, "ab")
            self.proc = subprocess.Popen(["bash", str(SIMULADOR), "-o", str(SIMULACION)], cwd=RAIZ,
                                         stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                         start_new_session=True)
            log.close()
        bus.publicar("motor", motor.estado())

    def detener(self):
        with self.lock:
            if self.activo():
                try:
                    os.killpg(self.proc.pid, signal.SIGTERM)
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(self.proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            self.proc = None
        bus.publicar("motor", motor.estado())


simulador = Simulador()


# ---------------------------------------------------------------- alertas
alertas_lock = threading.Lock()


def leer_alertas(limite=500):
    try:
        lineas = ALERTAS.read_text().splitlines()[-limite:]
    except OSError:
        return []
    salida = []
    for l in lineas:
        try:
            salida.append(json.loads(l))
        except ValueError:
            pass
    return list(reversed(salida))  # más recientes primero


def reenviar(alerta, url):
    if not url:
        return "no"
    try:
        req = urllib.request.Request(
            url, data=json.dumps(alerta).encode(), method="POST",
            headers={"Content-Type": "application/json", "User-Agent": "vigia-ssh"})
        with urllib.request.urlopen(req, timeout=5) as r:
            return "ok" if 200 <= r.status < 300 else "error"
    except Exception:
        return "error"


def recibir_alerta(alerta):
    if not isinstance(alerta, dict) or alerta.get("tipo") != "alerta_ssh" or "ip" not in alerta:
        raise ValueError("No es una alerta_ssh válida")
    registro = {
        "id": str(time.time_ns()),
        "recibida": time.time(),
        "reenvio": reenviar(alerta, leer_config().get("webhook_externo", "")),
        "alerta": alerta,
    }
    with alertas_lock:
        with open(ALERTAS, "a") as f:
            f.write(json.dumps(registro, ensure_ascii=False) + "\n")
    bus.publicar("alerta", registro)
    return registro


# ---------------------------------------------------------------- consultas
def silenciadas():
    ahora = time.time()
    salida = []
    for ip, d in leer_json(ESTADO, {}).items():
        if not isinstance(d, dict):
            continue
        restante = SILENCIO_SEG - (ahora - float(d.get("ts", 0)))
        if restante > 0:
            salida.append({"ip": ip, "severidad": d.get("severidad"), "restante": int(restante)})
    return sorted(salida, key=lambda x: -x["restante"])


def resumen():
    return {
        "host": NOMBRE_HOST,
        "ssh": ssh_activo(),
        "motor": motor.estado(),
        "simulador": {"activo": simulador.activo()},
        "config": leer_config(),
        "lista_blanca": leer_lista_blanca(),
        "silenciadas": silenciadas(),
        "silencio_seg": SILENCIO_SEG,
        "ahora": time.time(),
    }


def actividad():
    """Intentos SSH (fallos y accesos) de los últimos 60 minutos."""
    if es_simulacion():
        desde = time.time() - 3600
        try:
            lineas = SIMULACION.read_text().splitlines()
        except OSError:
            return []
        return [e for e in map(parsear_evento, lineas) if e and e["t"] >= desde][-5000:]
    try:
        r = subprocess.run(["journalctl", "-u", "ssh", "-o", "json", "--no-pager", "--since", "-60 min"],
                           capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return []
    eventos = [e for e in map(parsear_evento, r.stdout.splitlines()) if e]
    return eventos[-5000:]


def observar_journal():
    """Hilo: emite cada intento SSH en directo por el bus."""
    while True:
        try:
            p = subprocess.Popen(["journalctl", "-u", "ssh", "-o", "json", "--no-pager", "-f", "-n", "0"],
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            for linea in p.stdout:
                ev = parsear_evento(linea)
                if ev and not es_simulacion():
                    bus.publicar("intento", ev)
        except Exception as e:
            print(f"Observador del journal: {e}", file=sys.stderr)
        time.sleep(5)


def observar_simulacion():
    """Hilo: como `tail -F` del fichero simulado; emite sus eventos en modo simulación."""
    pos = None
    while True:
        try:
            tam = SIMULACION.stat().st_size
        except OSError:
            pos = 0
            time.sleep(0.5)
            continue
        if pos is None or tam < pos:      # primer arranque: empezar al final; si se vació, desde 0
            pos = tam if pos is None else 0
        if tam > pos:
            with open(SIMULACION, "rb") as f:
                f.seek(pos)
                datos = f.read()
            corte = datos.rfind(b"\n") + 1  # solo líneas completas
            pos += corte
            if es_simulacion():
                for linea in datos[:corte].decode(errors="replace").splitlines():
                    ev = parsear_evento(linea)
                    if ev:
                        bus.publicar("intento", ev)
        time.sleep(0.3)


# ---------------------------------------------------------------- validaciones
def validar_config(d):
    cfg = leer_config()
    try:
        umbral = int(d.get("umbral", cfg["umbral"]))
        ventana = int(d.get("ventana", cfg["ventana"]))
    except (TypeError, ValueError):
        raise ValueError("Umbral y ventana deben ser números enteros")
    if not 1 <= umbral <= 1000:
        raise ValueError("El umbral debe estar entre 1 y 1000")
    if not 1 <= ventana <= 1440:
        raise ValueError("La ventana debe estar entre 1 y 1440 minutos")
    url = str(d.get("webhook_externo", cfg["webhook_externo"]) or "").strip()
    if url and not re.match(r"^https?://[^\s]+$", url):
        raise ValueError("El webhook debe empezar por http:// o https://")
    if len(url) > 500:
        raise ValueError("URL demasiado larga")
    fuente = d.get("fuente", cfg.get("fuente", "journal"))
    if fuente not in ("journal", "simulacion"):
        raise ValueError("Fuente desconocida")
    cfg.update(umbral=umbral, ventana=ventana, webhook_externo=url, fuente=fuente,
               autoarranque=bool(d.get("autoarranque", cfg["autoarranque"])))
    return cfg


def validar_ips(lista):
    if not isinstance(lista, list):
        raise ValueError("Se esperaba una lista de IPs")
    limpias = []
    for ip in lista:
        try:
            normal = str(ipaddress.ip_address(str(ip).strip()))
        except ValueError:
            raise ValueError(f"IP no válida: {ip}")
        if normal not in limpias:
            limpias.append(normal)
    return limpias


# ---------------------------------------------------------------- HTTP
class Manejador(BaseHTTPRequestHandler):
    server_version = "VigiaSSH/1.0"

    def log_message(self, *args):
        pass

    # -- respuestas
    def _json(self, datos, codigo=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def _error(self, codigo, msg):
        self._json({"error": msg}, codigo)

    def _cuerpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 1_000_000:
            raise ValueError("Petición demasiado grande")
        return json.loads(self.rfile.read(n) or b"null")

    def _origen_permitido(self):
        # Peticiones de curl (el motor) no llevan Origin; las del navegador, sí.
        origen = self.headers.get("Origin")
        return origen is None or origen in (f"http://{HOST}:{PUERTO}", f"http://localhost:{PUERTO}")

    # -- GET
    def do_GET(self):
        ruta = self.path.split("?", 1)[0]
        if ruta == "/api/flujo":
            return self._flujo()
        consultas = {"/api/resumen": resumen, "/api/alertas": leer_alertas, "/api/actividad": actividad}
        if ruta in consultas:
            return self._json(consultas[ruta]())
        nombre = "index.html" if ruta == "/" else ruta.lstrip("/")
        if nombre not in ESTATICOS:
            return self._error(404, "No encontrado")
        cuerpo = (WEB / nombre).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ESTATICOS[nombre])
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(cuerpo)

    def _flujo(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        q = bus.suscribir()
        try:
            self.wfile.write(b": conectado\n\n")
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=15)
                except queue.Empty:
                    msg = b": ping\n\n"
                self.wfile.write(msg)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            bus.baja(q)

    # -- escrituras
    def _escritura(self, metodo):
        if not self._origen_permitido():
            return self._error(403, "Origen no permitido")
        ruta = self.path.split("?", 1)[0]
        try:
            if metodo == "POST" and ruta == "/api/alertas":
                return self._json(recibir_alerta(self._cuerpo()))
            if metodo == "POST" and ruta == "/api/motor/iniciar":
                motor.iniciar()
                return self._json(motor.estado())
            if metodo == "POST" and ruta == "/api/motor/detener":
                motor.detener()
                return self._json(motor.estado())
            if metodo == "PUT" and ruta == "/api/config":
                cfg = validar_config(self._cuerpo() or {})
                escribir_json(CONFIG, cfg)
                if cfg["fuente"] != "simulacion":
                    simulador.detener()
                motor.reiniciar_si_activo()
                return self._json(resumen())
            if metodo == "PUT" and ruta == "/api/lista_blanca":
                escribir_json(LISTA_BLANCA, validar_ips((self._cuerpo() or {}).get("ips")))
                motor.reiniciar_si_activo()  # el motor lee la lista al arrancar
                return self._json(resumen())
            if metodo == "POST" and ruta == "/api/simulacion/iniciar":
                if not es_simulacion():
                    raise ValueError("Cambia la fuente de datos a «Simulación» en Ajustes")
                motor.iniciar()
                simulador.iniciar()
                return self._json(resumen())
            if metodo == "POST" and ruta == "/api/simulacion/detener":
                simulador.detener()
                return self._json(resumen())
            if metodo == "POST" and ruta == "/api/silencio/reiniciar":
                escribir_json(ESTADO, {})
                return self._json(resumen())
            if metodo == "POST" and ruta == "/api/prueba":
                cfg = leer_config()
                return self._json(recibir_alerta({
                    "tipo": "alerta_ssh", "host": NOMBRE_HOST,
                    "ts": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "ip": "203.0.113.50", "intentos": cfg["umbral"], "ventana_min": cfg["ventana"],
                    "usuarios": ["admin", "root"], "severidad": "media", "prueba": True,
                }))
            if metodo == "DELETE" and ruta == "/api/alertas":
                with alertas_lock:
                    ALERTAS.write_text("")
                return self._json({"ok": True})
        except ValueError as e:
            return self._error(400, str(e))
        return self._error(404, "No encontrado")

    def do_POST(self):
        self._escritura("POST")

    def do_PUT(self):
        self._escritura("PUT")

    def do_DELETE(self):
        self._escritura("DELETE")


# ---------------------------------------------------------------- arranque
def main():
    DATOS.mkdir(exist_ok=True)
    try:
        servidor = ThreadingHTTPServer((HOST, PUERTO), Manejador)
    except OSError:
        sys.exit(f"El puerto {PUERTO} está ocupado. Cierra el otro proceso o usa PUERTO=XXXX ./consola.sh")
    servidor.daemon_threads = True

    threading.Thread(target=observar_journal, daemon=True).start()
    threading.Thread(target=observar_simulacion, daemon=True).start()
    if leer_config().get("autoarranque", True):
        motor.iniciar()

    def salir(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, salir)

    print(f"Vigía SSH · consola en http://{HOST}:{PUERTO}  (Ctrl+C para salir)", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        simulador.detener()
        motor.detener()
        print("\nConsola detenida.")


if __name__ == "__main__":
    main()
