import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { C } from "../tema";
import { Aparece, Fondo, Marca, lineaLog, mono, useEntrada } from "../comun";

/* 1 · Gancho ------------------------------------------------------------ */
export const Gancho: React.FC = () => {
  const frame = useCurrentFrame();
  const intentos = Math.floor(
    interpolate(frame, [10, 110], [0, 1284], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }),
  );
  const palabras = ["Ahora", "mismo,", "alguien", "está", "probando", "contraseñas", "contra", "tu", "servidor."];
  return (
    <Fondo>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 160 }}>
        <div style={{ fontSize: 84, fontWeight: 650, letterSpacing: "-0.025em", lineHeight: 1.15, textAlign: "center" }}>
          {palabras.map((p, i) => {
            const e = useEntrada(4 + i * 5);
            const resaltar = p === "contraseñas";
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  marginRight: 22,
                  opacity: e,
                  transform: `translateY(${(1 - e) * 20}px)`,
                  color: resaltar ? C.acento : C.texto,
                }}
              >
                {p}
              </span>
            );
          })}
        </div>
        <Aparece desde={55} style={{ marginTop: 56, display: "flex", alignItems: "baseline", gap: 18 }}>
          <span style={{ ...mono, fontSize: 64, fontWeight: 500, color: C.texto }}>{intentos.toLocaleString("es-ES")}</span>
          <span style={{ fontSize: 30, color: C.texto2 }}>intentos fallidos esta noche</span>
        </Aparece>
      </AbsoluteFill>
    </Fondo>
  );
};

/* 2 · Problema ---------------------------------------------------------- */
export const Problema: React.FC = () => {
  const frame = useCurrentFrame();
  const desplaz = frame * 9; // las líneas suben cada vez más rápido visualmente
  const lineas = Array.from({ length: 70 }, (_, i) => lineaLog(i + 100));
  return (
    <Fondo>
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 120px", gap: 90 }}>
        {/* terminal */}
        <div
          style={{
            width: 1020,
            height: 760,
            background: "#0B0D10",
            border: `1px solid ${C.borde}`,
            borderRadius: 16,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div style={{ height: 46, borderBottom: `1px solid ${C.borde}`, display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 13, height: 13, borderRadius: "50%", background: C.borde }} />
            ))}
            <span style={{ ...mono, fontSize: 18, color: C.suave, marginLeft: 14 }}>journalctl -u ssh -f</span>
          </div>
          <div style={{ position: "absolute", top: 47, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 14, left: 24, right: 24, transform: `translateY(${-desplaz}px)` }}>
              {lineas.map((l, i) => (
                <div key={i} style={{ ...mono, fontSize: 19, lineHeight: "34px", color: C.texto2, whiteSpace: "nowrap" }}>
                  <span style={{ color: C.suave }}>sshd[{2000 + i * 37}]:</span> {l.texto}
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(#0B0D1000 60%, #0B0D10 100%)",
              pointerEvents: "none",
            }}
          />
        </div>
        {/* texto */}
        <div style={{ flex: 1 }}>
          <Aparece desde={20}>
            <div style={{ fontSize: 64, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.12 }}>
              Miles de líneas en el registro.
            </div>
          </Aparece>
          <Aparece desde={70}>
            <div style={{ fontSize: 64, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.12, color: C.texto2, marginTop: 24 }}>
              Nadie las lee a tiempo.
            </div>
          </Aparece>
        </div>
      </AbsoluteFill>
    </Fondo>
  );
};

/* 3 · Marca ------------------------------------------------------------- */
export const PresentaMarca: React.FC = () => {
  const frame = useCurrentFrame();
  const e = useEntrada(5, 14);
  const linea = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Fondo>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `scale(${0.85 + e * 0.15})`, opacity: e }}>
          <Marca escala={2} />
        </div>
        <div style={{ width: 520 * linea, height: 2, background: C.borde, margin: "44px 0" }} />
        <Aparece desde={45}>
          <div style={{ fontSize: 44, fontWeight: 500, color: C.texto2, textAlign: "center", lineHeight: 1.4 }}>
            Detecta ataques de fuerza bruta contra SSH.
            <br />
            <span style={{ color: C.texto }}>Avisa una sola vez. En tiempo real.</span>
          </div>
        </Aparece>
      </AbsoluteFill>
    </Fondo>
  );
};
