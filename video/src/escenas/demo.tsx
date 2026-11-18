import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../tema";
import { Aparece, Escudo, Fondo, Insignia, Rotulo, Tarjeta, mono, useEntrada } from "../comun";

/* Cronología del ataque: 5 fallos pausados (llega la alerta) y luego ráfaga. */
const INTENTOS: number[] = [
  ...[20, 38, 56, 74, 92],
  ...Array.from({ length: 26 }, (_, i) => 150 + i * 7),
];
const T_ALERTA = 96;
const IP = "203.0.113.45";

const hora = (i: number) => {
  const total = 29 * 60 + 20 + i * 2; // 19:29:20 + 2 s por intento
  return `19:${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const Kpi: React.FC<{ etq: string; valor: React.ReactNode; pie: string; color?: string }> = ({ etq, valor, pie, color }) => (
  <Tarjeta style={{ flex: 1, padding: "22px 28px" }}>
    <div style={{ fontSize: 21, color: C.texto2 }}>{etq}</div>
    <div style={{ fontSize: 56, fontWeight: 650, letterSpacing: "-0.02em", color: color ?? C.texto, fontVariantNumeric: "tabular-nums" }}>
      {valor}
    </div>
    <div style={{ fontSize: 18, color: C.suave }}>{pie}</div>
  </Tarjeta>
);

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hechos = INTENTOS.filter((t) => t <= frame).length;
  const alerta = frame >= T_ALERTA;
  const entradaVentana = useEntrada(0);
  const toast = spring({ frame: frame - T_ALERTA, fps, config: { damping: 18 } });
  const segundosSilencio = Math.max(0, 600 - Math.floor(Math.max(0, frame - T_ALERTA) / fps));
  const silencio = `${Math.floor(segundosSilencio / 60)}:${String(segundosSilencio % 60).padStart(2, "0")}`;

  // barras del gráfico (los últimos 24 "minutos"; el ataque cae en las 3 últimas)
  const barras = Array.from({ length: 24 }, (_, i) => {
    if (i < 21) return 0;
    const parte = [0.25, 0.35, 0.4][i - 21];
    return hechos * parte;
  });
  const maxBarra = 14;

  const feed = INTENTOS.map((t, i) => ({ t, i })).filter((x) => x.t <= frame).slice(-8).reverse();

  return (
    <Fondo>
      <AbsoluteFill style={{ padding: "60px 90px 150px", opacity: entradaVentana, transform: `scale(${0.97 + 0.03 * entradaVentana})` }}>
        {/* barra superior */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 26 }}>
          <Escudo size={40} />
          <span style={{ fontSize: 34, fontWeight: 650 }}>Vigía</span>
          <span style={{ fontSize: 22, color: C.texto2, marginLeft: 30 }}>
            Servicio SSH <b style={{ color: C.texto }}>activo</b>
          </span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 22 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: C.ok,
                opacity: 0.55 + 0.45 * Math.abs(Math.sin(frame / 14)),
              }}
            />
            Vigilando
          </span>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 22 }}>
          <Kpi etq="Intentos fallidos" valor={hechos} pie="última hora" />
          <Kpi etq="IPs de origen" valor={hechos ? 1 : 0} pie="con fallos" />
          <Kpi etq="Alertas" valor={alerta ? 1 : 0} pie={alerta ? "1 media" : "últimas 24 h"} color={alerta ? C.media : undefined} />
          <Kpi etq="En silencio" valor={alerta ? silencio : "—"} pie={alerta ? IP : "anti-duplicados"} />
        </div>

        {/* cuerpo */}
        <div style={{ display: "flex", gap: 22, marginTop: 22, flex: 1 }}>
          <Tarjeta style={{ flex: 1.35, padding: "24px 28px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 25, fontWeight: 600 }}>Intentos fallidos por minuto</div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 10, marginTop: 20 }}>
              {barras.map((v, i) => (
                <div key={i} style={{ flex: 1, height: `${Math.min(100, (v / maxBarra) * 100)}%`, minHeight: 3, background: v ? C.acento : C.borde, borderRadius: 4 }} />
              ))}
            </div>
          </Tarjeta>
          <Tarjeta style={{ flex: 1, padding: "24px 28px" }}>
            <div style={{ fontSize: 25, fontWeight: 600, marginBottom: 14 }}>Actividad en directo</div>
            {feed.map(({ t, i }, k) => {
              const nueva = frame - t < 8 && k === 0;
              return (
                <div
                  key={t}
                  style={{
                    display: "flex",
                    gap: 22,
                    fontSize: 22,
                    padding: "9px 6px",
                    borderBottom: `1px solid ${C.borde}`,
                    background: nueva ? C.acentoFondo : "transparent",
                    borderRadius: 6,
                  }}
                >
                  <span style={{ ...mono, color: C.suave, width: 120 }}>{hora(i)}</span>
                  <span style={{ color: C.texto2, width: 80, fontWeight: 600 }}>Fallo</span>
                  <span style={{ ...mono, width: 110 }}>root</span>
                  <span style={{ ...mono, color: C.texto2, marginLeft: "auto" }}>{IP}</span>
                </div>
              );
            })}
          </Tarjeta>
        </div>
      </AbsoluteFill>

      {/* aviso de alerta */}
      {alerta && (
        <div
          style={{
            position: "absolute",
            left: 130,
            top: 440,
            width: 600,
            opacity: toast,
            transform: `translateY(${(1 - toast) * 40}px)`,
            background: C.superficie2,
            border: `1px solid ${C.borde}`,
            borderLeft: `6px solid ${C.media}`,
            borderRadius: 14,
            padding: "22px 26px",
            boxShadow: "0 20px 50px rgba(0,0,0,.45)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 28, fontWeight: 650 }}>Nueva alerta</span>
            <Insignia sev="media" />
          </div>
          <div style={{ ...mono, fontSize: 22, color: C.texto2, marginTop: 10 }}>
            {IP} · 5 intentos · root
          </div>
          <div style={{ fontSize: 19, color: C.suave, marginTop: 8 }}>Enviada a la consola y al webhook</div>
        </div>
      )}

      <Rotulo desde={10} hasta={T_ALERTA - 4}>Cada intento aparece al instante.</Rotulo>
      <Rotulo desde={T_ALERTA} hasta={170}>Al quinto fallo: <b style={{ color: C.media }}>alerta</b>.</Rotulo>
      <Rotulo desde={175} hasta={360}>El ataque sigue… y no te llena de avisos: una alerta por IP.</Rotulo>
    </Fondo>
  );
};

/* 6 · Crítica ----------------------------------------------------------- */
const LINEAS_CRITICA = [
  { t: 10, tipo: "Fallo", u: "deploy" },
  { t: 22, tipo: "Fallo", u: "deploy" },
  { t: 34, tipo: "Fallo", u: "deploy" },
  { t: 46, tipo: "Fallo", u: "deploy" },
  { t: 72, tipo: "Acceso", u: "deploy" },
];

export const Critica: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const insignia = spring({ frame: frame - 88, fps, config: { damping: 12 } });
  const fondoRojo = interpolate(frame, [72, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Fondo>
      <AbsoluteFill style={{ background: `rgba(48,26,26,${0.55 * fondoRojo})` }} />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 140px", gap: 100 }}>
        <div style={{ flex: 1 }}>
          <Aparece desde={0}>
            <div style={{ fontSize: 30, color: C.texto2, marginBottom: 22 }}>¿Y si el atacante acierta?</div>
          </Aparece>
          <Tarjeta style={{ padding: "16px 24px" }}>
            {LINEAS_CRITICA.filter((l) => frame >= l.t).map((l, i) => {
              const acceso = l.tipo === "Acceso";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 26,
                    fontSize: 27,
                    padding: "13px 4px",
                    borderBottom: i < LINEAS_CRITICA.length - 1 ? `1px solid ${C.borde}` : "none",
                    color: acceso ? C.critica : C.texto,
                  }}
                >
                  <span style={{ ...mono, color: acceso ? C.critica : C.suave }}>19:41:0{i}</span>
                  <span style={{ fontWeight: 650, width: 110, color: acceso ? C.critica : C.texto2 }}>{l.tipo}</span>
                  <span style={mono}>{l.u}</span>
                  <span style={{ ...mono, marginLeft: "auto", color: acceso ? C.critica : C.texto2 }}>203.0.113.99</span>
                </div>
              );
            })}
          </Tarjeta>
        </div>
        <div style={{ width: 640, textAlign: "center" }}>
          <div style={{ transform: `scale(${insignia})`, opacity: insignia }}>
            <Insignia sev="critica" grande />
          </div>
          <Aparece desde={100}>
            <div style={{ fontSize: 50, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.15, marginTop: 40 }}>
              Si alguien entra tras fallar, lo sabes al instante.
            </div>
          </Aparece>
        </div>
      </AbsoluteFill>
    </Fondo>
  );
};
