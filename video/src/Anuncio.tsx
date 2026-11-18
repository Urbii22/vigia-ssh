import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Gancho, Problema, PresentaMarca } from "./escenas/intro";
import { ComoFunciona } from "./escenas/funcionamiento";
import { Demo, Critica } from "./escenas/demo";
import { Utilidades, Cierre } from "./escenas/cierre";

// Duración de cada escena en frames (30 fps)
export const ESCENAS: { componente: React.FC; frames: number }[] = [
  { componente: Gancho, frames: 130 },
  { componente: Problema, frames: 170 },
  { componente: PresentaMarca, frames: 150 },
  { componente: ComoFunciona, frames: 340 },
  { componente: Demo, frames: 370 },
  { componente: Critica, frames: 190 },
  { componente: Utilidades, frames: 290 },
  { componente: Cierre, frames: 230 },
];
export const TRANSICION = 15;
export const DURACION_TOTAL =
  ESCENAS.reduce((s, e) => s + e.frames, 0) - TRANSICION * (ESCENAS.length - 1);

export const Anuncio: React.FC = () => (
  <TransitionSeries>
    {ESCENAS.map(({ componente: Escena, frames }, i) => (
      <React.Fragment key={i}>
        {i > 0 && (
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSICION })} />
        )}
        <TransitionSeries.Sequence durationInFrames={frames}>
          <Escena />
        </TransitionSeries.Sequence>
      </React.Fragment>
    ))}
  </TransitionSeries>
);
