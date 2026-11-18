import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Misma paleta que la consola (tema oscuro): neutros, un acento, sin neón.
export const C = {
  fondo: "#0E1014",
  superficie: "#15181E",
  superficie2: "#1A1E25",
  borde: "#262B34",
  texto: "#E6E8EC",
  texto2: "#A3AAB6",
  suave: "#687180",
  acento: "#4FA69B",
  acentoFondo: "#16302D",
  media: "#D2A34E",
  mediaFondo: "#2A2415",
  alta: "#E07E4F",
  critica: "#E2645D",
  criticaFondo: "#301A1A",
  ok: "#52B37C",
};

export const { fontFamily: SANS } = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
export const { fontFamily: MONO } = loadMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

export const FPS = 30;
