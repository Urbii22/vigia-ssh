import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { C } from "../tema";
import { Aparece, Fondo, Tarjeta, mono, useEntrada } from "../comun";

const NODOS = [
  { titulo: "Servicio SSH", detalle: "recibe los intentos", codigo: "sshd" },
  { titulo: "Registro", detalle: "cada intento en JSON", codigo: "journalctl -o json" },
  { titulo: "Motor", detalle: "agrupa por IP y decide", codigo: "vigia_ssh.sh" },
  { titulo: "Alerta", detalle: "una por IP · 10 min", codigo: "webhook JSON" },
];
const ANCHO = 330;
const HUECO = 110;
const X0 = (1920 - (NODOS.length * ANCHO + (NODOS.length - 1) * HUECO)) / 2;
const Y = 330;
const ALTO = 200;
const T_NODO = (i: number) => 15 + i * 28; // aparición de cada nodo

export const ComoFunciona: React.FC = () => {
  const frame = useCurrentFrame();

  // paquete de datos que recorre la tubería
  const xIni = X0 + ANCHO / 2;
  const xFin = X0 + 3 * (ANCHO + HUECO) + ANCHO / 2;
  const viaje = interpolate(frame, [140, 220], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const visiblePaquete = frame >= 140 && frame <= 232;

  return (
    <Fondo>
      <AbsoluteFill>
        <Aparece desde={0} style={{ position: "absolute", top: 120, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 30, color: C.acento, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Cómo funciona
          </div>
          <div style={{ fontSize: 58, fontWeight: 650, letterSpacing: "-0.02em", marginTop: 10 }}>
            Del intento a la alerta, en menos de un segundo
          </div>
        </Aparece>

        {/* conectores */}
        {NODOS.slice(0, -1).map((_, i) => {
          const p = interpolate(frame, [T_NODO(i + 1) - 8, T_NODO(i + 1) + 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const x = X0 + i * (ANCHO + HUECO) + ANCHO;
          return (
            <div
              key={i}
              style={{ position: "absolute", left: x, top: Y + ALTO / 2 - 1, width: HUECO * p, height: 2, background: C.borde }}
            />
          );
        })}

        {/* nodos */}
        {NODOS.map((n, i) => {
          const e = useEntrada(T_NODO(i));
          const activo = visiblePaquete && Math.abs(xIni + (xFin - xIni) * viaje - (X0 + i * (ANCHO + HUECO) + ANCHO / 2)) < 120;
          const esMotor = i === 2;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: X0 + i * (ANCHO + HUECO),
                top: Y,
                width: ANCHO,
                height: ALTO,
                opacity: e,
                transform: `translateY(${(1 - e) * 24}px)`,
              }}
            >
              <Tarjeta
                style={{
                  height: "100%",
                  padding: "28px 30px",
                  borderColor: activo || (esMotor && frame > 240) ? C.acento : C.borde,
                  background: esMotor && frame > 240 ? C.acentoFondo : C.superficie,
                }}
              >
                <div style={{ fontSize: 20, color: C.suave, fontWeight: 600 }}>{String(i + 1).padStart(2, "0")}</div>
                <div style={{ fontSize: 38, fontWeight: 650, marginTop: 6 }}>{n.titulo}</div>
                <div style={{ fontSize: 23, color: C.texto2, marginTop: 6 }}>{n.detalle}</div>
                <div style={{ ...mono, fontSize: 19, color: C.acento, marginTop: 14 }}>{n.codigo}</div>
              </Tarjeta>
            </div>
          );
        })}

        {/* paquete */}
        {visiblePaquete && (
          <div
            style={{
              position: "absolute",
              left: xIni + (xFin - xIni) * viaje - 11,
              top: Y + ALTO / 2 - 11,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: C.acento,
              border: `4px solid ${C.fondo}`,
            }}
          />
        )}

        {/* detalle del motor */}
        <div style={{ position: "absolute", top: Y + ALTO + 50, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 18 }}>
          {["jq + expresión regular", "agrupa los fallos por IP", "umbral: 5 fallos en 5 min", "memoria anti-duplicados"].map((t, i) => (
            <Aparece key={t} desde={245 + i * 8}>
              <span
                style={{
                  ...mono,
                  fontSize: 22,
                  color: C.texto2,
                  background: C.superficie2,
                  border: `1px solid ${C.borde}`,
                  borderRadius: 10,
                  padding: "10px 18px",
                  display: "inline-block",
                }}
              >
                {t}
              </span>
            </Aparece>
          ))}
        </div>

        {/* JSON de la alerta */}
        <Aparece desde={275} style={{ position: "absolute", top: Y + ALTO + 150, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              ...mono,
              fontSize: 22,
              color: C.texto2,
              background: "#0B0D10",
              border: `1px solid ${C.borde}`,
              borderRadius: 12,
              padding: "18px 28px",
            }}
          >
            {"{ "}
            <span style={{ color: C.texto }}>"ip"</span>: <span style={{ color: C.acento }}>"203.0.113.45"</span>,{" "}
            <span style={{ color: C.texto }}>"intentos"</span>: <span style={{ color: C.acento }}>5</span>,{" "}
            <span style={{ color: C.texto }}>"usuarios"</span>: [<span style={{ color: C.acento }}>"root"</span>],{" "}
            <span style={{ color: C.texto }}>"severidad"</span>: <span style={{ color: C.media }}>"media"</span>
            {" }"}
          </div>
        </Aparece>
      </AbsoluteFill>
    </Fondo>
  );
};
