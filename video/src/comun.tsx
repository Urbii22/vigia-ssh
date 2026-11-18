import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random } from "remotion";
import { C, SANS, MONO } from "./tema";

/** Fondo común: color liso con un viñeteado muy suave. */
export const Fondo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at 50% 35%, #161A21 0%, ${C.fondo} 70%)`,
      fontFamily: SANS,
      color: C.texto,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Progreso 0→1 con muelle, empezando en `desde` (frames). */
export const useEntrada = (desde: number, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - desde, fps, config: { damping } });
};

/** Aparece desde abajo con fundido. */
export const Aparece: React.FC<{
  desde?: number;
  dy?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ desde = 0, dy = 24, style, children }) => {
  const p = useEntrada(desde);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * dy}px)`, ...style }}>{children}</div>
  );
};

/** Escudo de la marca (el mismo de la consola). */
export const Escudo: React.FC<{ size: number; color?: string }> = ({ size, color = C.acento }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <path d="M16 3 5 7v8c0 7 4.7 12 11 14 6.3-2 11-7 11-14V7z" fill={color} />
    <circle cx="16" cy="15" r="4" fill={C.fondo} />
  </svg>
);

/** Marca: escudo + "Vigía" + etiqueta SSH. */
export const Marca: React.FC<{ escala?: number }> = ({ escala = 1 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 * escala }}>
    <Escudo size={64 * escala} />
    <span style={{ fontSize: 64 * escala, fontWeight: 650, letterSpacing: "-0.02em" }}>Vigía</span>
    <span
      style={{
        fontSize: 22 * escala,
        fontWeight: 600,
        color: C.texto2,
        border: `${2 * escala}px solid ${C.borde}`,
        borderRadius: 8 * escala,
        padding: `${2 * escala}px ${10 * escala}px`,
      }}
    >
      SSH
    </span>
  </div>
);

/** Rótulo inferior (hace de "voz en off" en texto). */
export const Rotulo: React.FC<{ desde: number; hasta: number; children: React.ReactNode }> = ({
  desde,
  hasta,
  children,
}) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [desde, desde + 10, hasta - 10, hasta], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [desde, desde + 12], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 70,
        display: "flex",
        justifyContent: "center",
        opacity: op,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          fontSize: 38,
          fontWeight: 500,
          padding: "14px 30px",
          borderRadius: 12,
          background: "rgba(21,24,30,0.92)",
          border: `1px solid ${C.borde}`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export type Sev = "media" | "alta" | "critica";
const SEV_COLOR: Record<Sev, [string, string, string]> = {
  media: [C.media, C.mediaFondo, "Media"],
  alta: [C.alta, "#2D1D15", "Alta"],
  critica: [C.critica, C.criticaFondo, "Crítica"],
};

export const Insignia: React.FC<{ sev: Sev; grande?: boolean }> = ({ sev, grande }) => {
  const [color, fondo, texto] = SEV_COLOR[sev];
  const f = grande ? 2.4 : 1;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8 * f,
        color,
        background: fondo,
        borderRadius: 999,
        padding: `${4 * f}px ${14 * f}px`,
        fontSize: 20 * f,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 9 * f, height: 9 * f, borderRadius: "50%", background: color }} />
      {texto}
    </span>
  );
};

/** Línea de registro de sshd con datos pseudoaleatorios deterministas. */
const USUARIOS = ["root", "admin", "test", "oracle", "ubuntu", "postgres", "git", "pi", "guest", "deploy"];
export const lineaLog = (i: number) => {
  const ip = `${["203.0.113", "198.51.100", "192.0.2"][Math.floor(random(`r${i}`) * 3)]}.${
    10 + Math.floor(random(`o${i}`) * 230)
  }`;
  const u = USUARIOS[Math.floor(random(`u${i}`) * USUARIOS.length)];
  const port = 32768 + Math.floor(random(`p${i}`) * 28000);
  const invalido = random(`i${i}`) > 0.5;
  return { ip, u, texto: `Failed password for ${invalido ? "invalid user " : ""}${u} from ${ip} port ${port} ssh2` };
};

export const Tarjeta: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({
  style,
  children,
}) => (
  <div
    style={{
      background: C.superficie,
      border: `1px solid ${C.borde}`,
      borderRadius: 16,
      ...style,
    }}
  >
    {children}
  </div>
);

export const mono: React.CSSProperties = { fontFamily: MONO };
