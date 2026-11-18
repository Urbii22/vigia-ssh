#!/usr/bin/env python3
# receptor_alertas.py - simula el canal "alertas" en local (solo para pruebas)
# Uso: python3 receptor_alertas.py [puerto]   (por defecto 8765)
# Muestra cada alerta recibida y la guarda en alertas_recibidas.jsonl
import http.server, json, sys, datetime

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

class Receptor(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            alerta = json.loads(cuerpo)
            print(f"\n[{datetime.datetime.now():%H:%M:%S}] ALERTA RECIBIDA")
            print(json.dumps(alerta, indent=2, ensure_ascii=False), flush=True)
            with open("alertas_recibidas.jsonl", "a") as f:
                f.write(json.dumps(alerta, ensure_ascii=False) + "\n")
            self.send_response(200)
        except json.JSONDecodeError:
            print("Recibido algo que no es JSON:", cuerpo[:200], flush=True)
            self.send_response(400)
        self.end_headers()

    def log_message(self, *args):
        pass

print(f"Canal 'alertas' simulado escuchando en http://127.0.0.1:{PUERTO}/  (Ctrl+C para salir)")
http.server.HTTPServer(("127.0.0.1", PUERTO), Receptor).serve_forever()
