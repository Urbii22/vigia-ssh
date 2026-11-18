# Vigía SSH

**Detector de ataques de fuerza bruta contra SSH, con alertas en tiempo real y una consola web.**

Cuando alguien intenta entrar en tu máquina por SSH probando contraseñas una y otra vez, Vigía SSH lo detecta, avisa **una sola vez** (sin llenarte de alertas repetidas) y te enseña en una página web qué está pasando: quién ataca, con qué usuarios lo intenta y si ha conseguido entrar.

🎬 **[Ver el vídeo-anuncio (59 s)](https://github.com/Urbii22/vigia-ssh/releases/download/v1.0/vigia-ssh-anuncio.mp4)**

> Proyecto del Ejercicio 3 (detector de fuerza bruta SSH con alertas). Uso exclusivo en el laboratorio y con permiso.

---

## Índice
1. [Qué hace](#1-qué-hace)
2. [Requisitos](#2-requisitos)
3. [Instalación](#3-instalación)
4. [Puesta en marcha en 1 minuto](#4-puesta-en-marcha-en-1-minuto)
5. [Probarlo](#5-probarlo)
6. [La consola, pantalla a pantalla](#6-la-consola-pantalla-a-pantalla)
7. [Usarlo solo desde la terminal](#7-usarlo-solo-desde-la-terminal)
8. [Cómo funciona por dentro](#8-cómo-funciona-por-dentro)
9. [Ficheros del proyecto](#9-ficheros-del-proyecto)
10. [Problemas frecuentes](#10-problemas-frecuentes)
11. [Limitaciones y próximos pasos](#11-limitaciones-y-próximos-pasos)

---

## 1. Qué hace

- **Lee el registro de SSH** del sistema (`journalctl`), donde queda apuntado cada intento de acceso.
- **Cuenta los fallos por IP** dentro de una ventana de tiempo (por defecto, 5 minutos).
- **Avisa** si una IP llega al umbral (por defecto, 5 fallos):

| Severidad | Cuándo |
|---|---|
| **Media** | la IP llega al umbral (5 fallos) |
| **Alta** | la IP llega al doble del umbral (10 fallos) |
| **Crítica** | la IP falla muchas veces **y después consigue entrar** (posible contraseña adivinada) |

- **No repite alertas:** después de avisar de una IP, no vuelve a avisar de ella durante 10 minutos. La única excepción es que pase a **crítica**.
- **Envía la alerta** en JSON a un *webhook*, es decir, a una URL que recibe avisos. Puede ser la propia consola, un servidor del aula o un servicio como webhook.site.
- **Lista blanca:** las IPs de confianza que pongas ahí nunca generan alerta.

Ejemplo de alerta:
```json
{
  "tipo": "alerta_ssh",
  "host": "kali-g3",
  "ts": "2026-11-18T18:18:48Z",
  "ip": "10.0.3.15",
  "intentos": 5,
  "ventana_min": 5,
  "usuarios": ["root"],
  "severidad": "media"
}
```

---

## 2. Requisitos

Funciona en **Kali Linux** o en cualquier Debian/Ubuntu con systemd. Necesitas:

| Herramienta | Para qué | ¿Viene en Kali? |
|---|---|---|
| `bash`, `curl` | ejecutar el motor y enviar alertas | sí |
| `jq` | procesar el JSON de los registros | normalmente sí |
| `python3` (3.8 o superior) | la consola web; **sin librerías extra** | sí |
| `openssh-server` | el servicio SSH que se vigila | sí |
| `hydra` | *(opcional)* lanzar ataques de prueba reales | sí |
| Un navegador | ver la consola | sí |

Si te falta algo:
```bash
sudo apt update && sudo apt install -y jq curl python3 openssh-server hydra
```

**Permiso para leer el registro.** Tu usuario debe estar en el grupo `adm` (en Kali lo está por defecto). Para comprobarlo:
```bash
id | grep -o adm        # si sale "adm", todo bien
```
Si no sale nada: `sudo usermod -aG adm $USER`, y después cierra la sesión y vuelve a entrar.

No hace falta conexión a Internet, salvo que quieras enviar alertas a webhook.site.

---

## 3. Instalación

1. Copia la carpeta del proyecto donde quieras, por ejemplo con `git clone`, un USB o un zip.
2. Entra en ella y dale permisos de ejecución a los scripts:
   ```bash
   cd Practica_18_11_2026
   chmod +x *.sh
   ```

Con esto basta: no hay que compilar nada ni instalar dependencias de Python.

---

## 4. Puesta en marcha en 1 minuto

```bash
# 1. Enciende el servicio SSH (es lo que vamos a vigilar)
sudo systemctl start ssh

# 2. Arranca la consola (el navegador se abre solo)
./consola.sh
```

Si el navegador no se abre, entra a mano en **http://127.0.0.1:8800**.

Arriba a la derecha debe aparecer un punto verde con **«Vigilando»**. Para apagarlo todo, pulsa `Ctrl+C` en la terminal donde lanzaste `./consola.sh`.

> **Importante:** si cambias algún archivo del proyecto (o actualizas a una versión nueva), **para la consola con `Ctrl+C` y vuelve a lanzarla**. Recargar el navegador no basta.

---

## 5. Probarlo

Hay dos formas: con **ataques simulados**, que es lo más fácil y lo ideal para una demo, o con **ataques reales** usando hydra.

### Opción A: simulación (recomendada para empezar)

No necesitas otra máquina ni hydra. El simulador genera ataques ficticios en tiempo real, desde varias IPs, con el mismo formato que el registro real de SSH.

1. En la consola, ve a **Ajustes → Fuente de datos**, elige **«Simulación (ataques ficticios)»** y pulsa **Guardar**. Arriba aparecerá la etiqueta **SIMULACIÓN**.
2. En **Anti-duplicados**, pulsa **«Reiniciar memoria»** para empezar de cero.
3. Pulsa **«Lanzar simulación»** y observa la pantalla durante unos 2 minutos.

Qué vas a ver:

| Qué simula | Qué debe pasar |
|---|---|
| Fuerza bruta rápida contra `root` desde 203.0.113.45 | 1 alerta **Media** |
| Diccionario de 8 usuarios inexistentes desde 192.0.2.77 | 1 alerta **Media** con los usuarios probados |
| 12 fallos desde 203.0.113.99 **y después entra** como `deploy` | alerta Media y después **Crítica**; «Accesos correctos» se pone en rojo |
| Se repite la fuerza bruta desde 203.0.113.45 | **ninguna alerta nueva** (anti-duplicados) |
| Escáner lento: 1 intento cada ~95 s | nunca llega al umbral, solo aparece en «Actividad» |
| Un administrador entrando normalmente | aparece como «Acceso», sin alerta |

Las IPs de la simulación pertenecen a rangos reservados para ejemplos (RFC 5737), así que no son de nadie.

Para volver a los datos reales: **Fuente de datos → «Registro SSH real»** y **Guardar**.

### Opción B: ataque real con hydra

Hazlo **solo contra máquinas del laboratorio y con permiso**.

1. Fuente de datos: **«Registro SSH real»**.
2. Averigua la IP de la máquina vigilada: `hostname -I`.
3. **Desde otra máquina del aula** (o desde la misma, para probar):
   ```bash
   hydra -l root -P lista_corta.txt -t 4 ssh://IP_DE_LA_MAQUINA
   ```
4. En la consola verás entrar cada intento en directo y, al quinto fallo, **una alerta**.
5. Repite el ataque antes de 10 minutos: **no debe salir ninguna alerta nueva**.
6. *(Opcional)* Para provocar la alerta **crítica**, entra después con un usuario y una contraseña reales desde la misma IP: `ssh usuario@IP_DE_LA_MAQUINA`.

`lista_corta.txt` es una lista de 12 contraseñas típicas incluida en el proyecto.

### Recibir las alertas en otra web (webhook.site)

1. Abre https://webhook.site y copia tu «Your unique URL».
2. Pégala en **Ajustes → Webhook externo** y pulsa **Guardar**.
3. Pulsa **«Enviar alerta de prueba»**: la alerta aparecerá en la consola y en webhook.site. En la columna «Canal» pondrá «Consola + webhook».

> webhook.site es público: cualquiera que tenga tu URL ve lo que envías. No mandes datos sensibles.

---

## 6. La consola, pantalla a pantalla

| Zona | Qué muestra |
|---|---|
| **Barra superior** | equipo, fuente de datos (real o simulación), estado del servicio SSH, conexión en directo, botón **Iniciar/Detener** y cambio de tema claro/oscuro |
| **Indicadores** | intentos fallidos, IPs atacantes, alertas por severidad y accesos correctos (en rojo si alguien entra tras fallar) |
| **Gráfico** | intentos fallidos por minuto en la última hora |
| **Principales orígenes** | las IPs que más fallan, con cuántos usuarios distintos han probado |
| **Alertas** | historial: hora, IP, intentos, usuarios, severidad y si se reenvió al webhook. **Ignorar IP** la añade a la lista blanca. **Bloquear** está reservado para la fase de defensa |
| **Actividad en directo** | cada intento SSH según llega |
| **Ajustes** | fuente de datos, umbral, ventana, webhook externo, simulador, lista blanca y memoria anti-duplicados |

Al guardar los ajustes, el motor se reinicia solo con los valores nuevos.

---

## 7. Usarlo solo desde la terminal

La consola es opcional: el motor `vigia_ssh.sh` funciona por sí solo.

```bash
./vigia_ssh.sh -h                                  # ayuda
./vigia_ssh.sh                                     # analiza los últimos 5 min del registro y sale
./vigia_ssh.sh -c                                  # modo continuo: vigila en tiempo real
./vigia_ssh.sh -c -w https://webhook.site/XXXX     # ...y envía las alertas a esa URL
./vigia_ssh.sh -u 10 -v 2                          # umbral 10 fallos, ventana de 2 minutos
```

Para probar sin ningún ataque, usa un registro de ejemplo:
```bash
./genera_muestra.sh                    # crea muestra_ssh.jsonl con ataques ficticios
./vigia_ssh.sh -f muestra_ssh.jsonl    # lo analiza: salen alertas media, alta y crítica
```

| Opción | Significado |
|---|---|
| `-f FICHERO` | leer de un fichero JSON Lines en vez del registro del sistema |
| `-u N` | umbral de fallos (por defecto 5) |
| `-v MIN` | ventana de tiempo en minutos (por defecto 5) |
| `-w URL` | webhook al que enviar las alertas (sin él, solo se muestran por pantalla) |
| `-c` | modo continuo (tiempo real) |
| `--bloquear -p IP_PROFESOR` | ofrece bloquear la IP con nftables durante 1 h (pide confirmación; nunca bloquea al profesor, tus IPs ni la lista blanca). Para deshacerlo: `sudo nft delete table inet vigia_ssh` |

El simulador también se puede lanzar a mano, con la consola en modo Simulación:
```bash
./simulador.sh -h        # explica el guion
./simulador.sh -x 2      # el doble de rápido (≈ 1 min)
./simulador.sh --bucle   # ataques sin parar
```

---

## 8. Cómo funciona por dentro

```
  Atacante (hydra)                       simulador.sh
        │ intentos SSH                        │ eventos ficticios
        ▼                                     ▼
  servicio SSH ──► registro (journalctl) datos/simulacion.jsonl
                         │                    │
                         └──────┬─────────────┘
                                ▼
                     ┌────────────────────┐   estado.json      (IPs ya avisadas)
                     │   vigia_ssh.sh     │◄─ lista_blanca.json (IPs ignoradas)
                     │      (motor)       │
                     └─────────┬──────────┘
                               │ alerta JSON (POST)
                               ▼
                     ┌────────────────────┐   datos/alertas.jsonl (historial)
                     │ consola/servidor.py│──► webhook externo (opcional)
                     └─────────┬──────────┘
                               │ tiempo real (Server-Sent Events)
                               ▼
                         Navegador: consola web
```

1. **SSH apunta cada intento** en el registro del sistema, por ejemplo: `Failed password for root from 10.0.3.15 port 51234 ssh2`.
2. **El motor (`vigia_ssh.sh`)** lee esas líneas en JSON. Con `jq` y una expresión regular extrae el **usuario** y la **IP**, agrupa por IP, cuenta los fallos de la ventana y decide la severidad.
3. Antes de avisar, consulta **`estado.json`**: si ya avisó de esa IP hace menos de 10 minutos, se calla.
4. **Envía la alerta** con `curl` a la consola. La consola la guarda, la reenvía al webhook externo si está configurado y la empuja al navegador al instante.
5. Además, la consola lee el registro por su cuenta para pintar la actividad en directo y el gráfico, aunque no haya alertas.

**Seguridad de la consola:**
- Solo escucha en `127.0.0.1`, así que no es accesible desde otras máquinas.
- Rechaza peticiones que vengan de otras webs.
- Escapa todo lo que viene del registro: un atacante podría usar como nombre de usuario código HTML o JavaScript, y aquí no se ejecuta.

---

## 9. Ficheros del proyecto

| Fichero | Qué es |
|---|---|
| `vigia_ssh.sh` | **el motor**: detecta y envía alertas |
| `consola.sh` | arranca la consola web |
| `consola/servidor.py` | servidor de la consola (Python, sin dependencias) |
| `consola/web/` | la página: `index.html`, `estilo.css`, `app.js` |
| `simulador.sh` | genera ataques simulados en tiempo real |
| `genera_muestra.sh` | crea un registro de ejemplo (`muestra_ssh.jsonl`) |
| `lista_blanca.json` | IPs que nunca generan alerta |
| `lista_corta.txt` | contraseñas de prueba para hydra |
| `estado.json` | *(se crea solo)* IPs avisadas y cuándo |
| `datos/` | *(se crea sola)* historial de alertas, ajustes, simulación y registros del motor |
| `video/` | anuncio de ~1 min del proyecto hecho con Remotion (ver `video/README.md`) |
| `receptor_alertas.py` | receptor de alertas mínimo de las primeras pruebas; ya no hace falta |

Para empezar totalmente de cero, con la consola parada: `rm -rf datos estado.json`.

---

## 10. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| Arriba a la derecha sale «—» en vez de «Vigilando», o el botón «Lanzar simulación» no se activa | La consola en marcha es una **versión antigua**. Párala con `Ctrl+C` y vuelve a lanzar `./consola.sh`. Recargar el navegador no basta |
| «El puerto 8800 está ocupado» | Ya hay una consola abierta. Ciérrala, o usa otro puerto: `PUERTO=8900 ./consola.sh` |
| Aviso «El servicio SSH está parado» | `sudo systemctl start ssh` |
| Aviso «Hay 1 copia de vigia_ssh.sh fuera de la consola» | Tienes un `./vigia_ssh.sh -c` corriendo en otra terminal. Ciérralo con `Ctrl+C` |
| Hydra: `File for passwords not found` | Lánzalo desde la carpeta del proyecto, donde está `lista_corta.txt` |
| Los intentos salen en «Actividad» pero no salta ninguna alerta | O no se ha llegado al umbral, o esa IP está **en silencio** (aparece en Anti-duplicados; pulsa «Reiniciar memoria»), o está en la **lista blanca** |
| No sale nada en la consola al atacar | Comprueba que la fuente es «Registro SSH real» y que puedes leer el registro: `journalctl -u ssh -n 5` (debe mostrar líneas; si no, mira el grupo `adm` en Requisitos) |
| «Webhook falló» en la columna Canal | La URL externa no responde o no hay Internet. La alerta sí se guarda en la consola |
| Quiero ver qué hace el motor | `cat datos/motor.log` |

---

## 11. Limitaciones y próximos pasos

**Limitaciones conocidas**
- Solo detecta intentos con **contraseña** (`Failed password`), no otros métodos como claves públicas rechazadas.
- Agrupa por IP: un atacante que **reparta el ataque entre muchas IPs**, o que vaya muy despacio (como el «escáner lento» de la simulación), puede quedar por debajo del umbral.
- En tiempo real, la alerta se envía al llegar al umbral, así que en directo suele salir como **Media**. La severidad **Alta** se ve al analizar registros ya acumulados.
- La consola es local (`127.0.0.1`) y para un solo equipo.

**Próximos pasos (fase de defensa)**
- Activar el botón **Bloquear** de la consola (bloqueo con nftables, temporal y con confirmación).
- Bloqueo automático para alertas críticas.
- Resumen periódico con el top de IPs y usuarios.
- Vigilar varias máquinas desde una sola consola.
