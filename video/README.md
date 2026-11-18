# Vídeo-anuncio de Vigía SSH (Remotion)

Anuncio de ~59 s en 1920×1080 a 30 fps, hecho con [Remotion](https://www.remotion.dev/) (vídeo programado en React).

```bash
cd video
npm install          # solo la primera vez
npm run estudio      # editor en el navegador: ves y ajustas el vídeo en vivo
npm run render       # genera out/vigia-ssh-anuncio.mp4
npm run portada      # genera out/portada.png (miniatura)
```

## Escenas (`src/escenas/`)

| # | Escena | Archivo |
|---|---|---|
| 1 | Gancho: «alguien está probando contraseñas» | `intro.tsx` → `Gancho` |
| 2 | Problema: miles de líneas de log | `intro.tsx` → `Problema` |
| 3 | Presentación de la marca | `intro.tsx` → `PresentaMarca` |
| 4 | Cómo funciona (SSH → registro → motor → alerta) | `funcionamiento.tsx` |
| 5 | Demo de la consola: alerta al 5.º fallo, sin duplicados | `demo.tsx` → `Demo` |
| 6 | Caso crítico: el atacante entra | `demo.tsx` → `Critica` |
| 7 | Utilidades | `cierre.tsx` → `Utilidades` |
| 8 | Hoja de ruta y cierre con el enlace | `cierre.tsx` → `Cierre` |

- La duración de cada escena se cambia en `src/Anuncio.tsx`.
- Los colores y las fuentes, en `src/tema.ts` (los mismos que la consola).
- No lleva audio. Para añadir música: guarda un `.mp3` en `public/` y añade `<Audio src={staticFile("musica.mp3")} />` dentro de `Anuncio`.
