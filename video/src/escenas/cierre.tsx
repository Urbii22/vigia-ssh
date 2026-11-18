import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C } from "../tema";
import { Aparece, Fondo, Marca, Tarjeta, mono, useEntrada } from "../comun";

/* Iconos de trazo sencillo (24×24) */
const Icono: React.FC<{ d: string }> = ({ d }) => (
  <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={C.acento} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONOS = {
  directo: "M3 12h4l3-8 4 16 3-8h4",
  silencio: "M4 6h16M7 12h10M10 18h4",
  severidad: "M12 3 2 20h20L12 3zM12 10v4M12 17h.01",
  blanca: "M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3zM9 12l2 2 4-4",
  webhook: "M4 12h12M12 6l6 6-6 6",
  simulador: "M6 4l14 8-14 8V4z",
};

const UTILIDADES: { icono: keyof typeof ICONOS; titulo: string; texto: string }[] = [
  { icono: "directo", titulo: "Tiempo real", texto: "Cada intento aparece en la consola al momento." },
  { icono: "silencio", titulo: "Sin ruido", texto: "Una alerta por IP cada 10 minutos. Nada de spam." },
  { icono: "severidad", titulo: "Severidad", texto: "Media, alta… y crítica si el atacante entra." },
  { icono: "blanca", titulo: "Lista blanca", texto: "Tus IPs de confianza nunca generan alertas." },
  { icono: "webhook", titulo: "Webhooks", texto: "Cada alerta, en JSON, a cualquier servicio." },
  { icono: "simulador", titulo: "Simulador", texto: "Demos realistas sin atacar a nadie." },
];

/* 7 · Utilidades -------------------------------------------------------- */
export const Utilidades: React.FC = () => (
  <Fondo>
    <AbsoluteFill style={{ padding: "110px 150px", alignItems: "center" }}>
      <Aparece desde={0} style={{ textAlign: "center" }}>
        <div style={{ fontSize: 30, color: C.acento, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Utilidades
        </div>
        <div style={{ fontSize: 58, fontWeight: 650, letterSpacing: "-0.02em", marginTop: 10 }}>Todo lo que necesitas para vigilar SSH</div>
      </Aparece>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, marginTop: 70, width: "100%" }}>
        {UTILIDADES.map((u, i) => {
          const e = useEntrada(18 + i * 9);
          return (
            <div key={u.titulo} style={{ opacity: e, transform: `translateY(${(1 - e) * 30}px)` }}>
              <Tarjeta style={{ padding: "34px 36px", height: 230 }}>
                <Icono d={ICONOS[u.icono]} />
                <div style={{ fontSize: 36, fontWeight: 650, marginTop: 18 }}>{u.titulo}</div>
                <div style={{ fontSize: 25, color: C.texto2, marginTop: 8, lineHeight: 1.35 }}>{u.texto}</div>
              </Tarjeta>
            </div>
          );
        })}
      </div>
      <Aparece desde={90} style={{ marginTop: 50 }}>
        <div style={{ ...mono, fontSize: 24, color: C.suave }}>Bash · jq · Python · sin dependencias · 100 % local</div>
      </Aparece>
    </AbsoluteFill>
  </Fondo>
);

/* 8 · Cierre ------------------------------------------------------------ */
export const Cierre: React.FC = () => {
  const frame = useCurrentFrame();
  const fase2 = interpolate(frame, [80, 95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const marca = useEntrada(92, 16);
  return (
    <Fondo>
      {/* fase 1: hoja de ruta */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 1 - fase2 }}>
        <Aparece desde={0}>
          <div style={{ fontSize: 30, color: C.texto2, textAlign: "center" }}>Próximamente</div>
        </Aparece>
        <Aparece desde={10}>
          <div style={{ fontSize: 76, fontWeight: 650, letterSpacing: "-0.025em", textAlign: "center", marginTop: 14 }}>
            De vigilar a <span style={{ color: C.acento }}>defender</span>.
          </div>
        </Aparece>
        <Aparece desde={28}>
          <div style={{ fontSize: 34, color: C.texto2, textAlign: "center", marginTop: 22 }}>
            Bloqueo automático de atacantes con nftables.
          </div>
        </Aparece>
      </AbsoluteFill>

      {/* fase 2: marca y enlace */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fase2 }}>
        <div style={{ transform: `scale(${0.9 + 0.1 * marca})`, opacity: marca }}>
          <Marca escala={2.2} />
        </div>
        <Aparece desde={110}>
          <div style={{ fontSize: 46, fontWeight: 500, color: C.texto2, marginTop: 40, textAlign: "center" }}>
            Vigila. Detecta. <span style={{ color: C.texto }}>Avisa.</span>
          </div>
        </Aparece>
        <Aparece desde={128}>
          <div
            style={{
              ...mono,
              fontSize: 30,
              color: C.texto,
              marginTop: 50,
              padding: "14px 28px",
              border: `1px solid ${C.borde}`,
              borderRadius: 12,
              background: C.superficie,
            }}
          >
            github.com/Urbii22/vigia-ssh
          </div>
        </Aparece>
      </AbsoluteFill>
    </Fondo>
  );
};
