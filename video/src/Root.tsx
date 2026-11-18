import React from "react";
import { Composition } from "remotion";
import { Anuncio, DURACION_TOTAL } from "./Anuncio";
import { FPS } from "./tema";

export const Root: React.FC = () => (
  <Composition
    id="Anuncio"
    component={Anuncio}
    durationInFrames={DURACION_TOTAL}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
