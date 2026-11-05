# Pixel by Number

A relaxing color-by-number pixel art app for phones, tablets and desktops. Play in **2D** or color
**3D voxel models**, turn any image into a puzzle with a full import editor, and keep a library
of everything you're working on. All data stays on your device.

## Features

- **Fast WebGL 2 canvas.** It works on the vast majority of current phones, tablets and computers.
  - **2D** draws the whole grid as a single quad. Cell colors, numbers, grid lines, tints and
    highlights are all computed in the fragment shader from small data textures, so large grids
    stay smooth. Frames are drawn only when something changes.
  - **3D** draws one instanced quad per visible cube face, with ray-cast picking.
  - **Number modes:** one number per cube, or one per face (each face direction can have its
    own shade). Hidden interior cubes are never targets, so every model can be finished.
- **Touch first.** Paint by tapping or dragging, bucket fill, pinch to zoom, two-finger pan and
  orbit. Mouse wheel and trackpad gestures work too, and space or right-drag gives a temporary
  hand tool.
- **Helpful options:**
  - Tint unfilled cells to hint at their color, and highlight every cell of the active number.
  - Show color names on swatches.
  - Auto-advance to the next color when one is finished.
  - Tap a number to pick that color.
  - "Find next cell", undo/redo and haptics.
- **Color vision support.**
  - Settings for deuteranopia, protanopia, tritanopia and achromatopsia.
  - **Enhance** (daltonization) or **Simulate** filters.
  - Highlight colors that avoid the hues each condition confuses: blue instead of green for
    red/green, magenta for blue/yellow, and a high-contrast option.
- **Challenge options** (in Settings):
  - **One tap per square** (off by default): no drag painting or bucket fill; dragging moves the
    view.
  - **Allow mistakes** (off by default): wrong colors stick until painted over, and a counter shows
    how many squares are wrong and what percentage of the picture that is. Tap it to jump to the
    next mistake.
  - **Highlight mistakes** (on by default): wrong squares get diagonal stripes and an outline, a
    pattern rather than just a color, so it works with every color-vision setting.
- **Replay.** Every fill is recorded. Watch it back from the finish screen or the ⋯ menu: play,
  pause, step one fill at a time, scrub with the slider and change the speed (0.5×–8×). Keyboard:
  Space, ← →, Home, End, Esc.
- **Works offline.** A Workbox service worker precaches the app, and it can be installed to a home
  screen. When a new version is deployed, a toast offers to reload.
- **Animations.** Cells pop in, or voxels drop into place, the first time a design is opened.
  Finishing brings a shine sweep, a 3D victory spin and confetti. Reduced motion is respected.
- **Export:**
  - Crisp, upscaled PNG artwork, either your progress or the finished piece.
  - A printable **coloring page** (Letter or A4) for coloring by hand: a numbered grid with a bold
    outline and a key of numbered color swatches at the bottom of the paper, with an optional
    name line and color hints. It can be printed straight from the app.
  - 3D snapshots and MagicaVoxel `.vox` models.
  - Portable project files, shareable through the native share sheet.
- **Library.** Thumbnails of every design with progress, filters, search, rename, duplicate,
  reset and delete.
- **Import editor** with a live preview, run in a Web Worker:
  - **Pixel sampling:** dominant color, average, nearest or bilinear.
  - **Palettes:** k-means, median cut, octree or exact.
  - **Color matching:** Lab or RGB.
  - **Dithering:** Floyd–Steinberg, Atkinson or Bayer.
  - **Clean-up:** stray-pixel removal and alpha cut-off, plus brightness, contrast and saturation.
  - **Pixel art:** detects upscaled pixel art automatically.
  - **3D:** extrude or relief.
  - **Files:** imports `.vox` models and project files.
- **Accessible.**
  - Built on [Base UI](https://base-ui.com) primitives, with real labels and keyboard support
    everywhere.
  - Live-region announcements and a keyboard cursor for painting on the 2D canvas.
  - 44px touch targets, safe-area aware layouts, and light and dark themes.

## Tech

[Bun](https://bun.sh) · [Vite](https://vite.dev) · React 19 · TypeScript 7 (native `tsc`) ·
[Base UI](https://base-ui.com) · [Oxlint](https://oxc.rs/docs/guide/usage/linter) with type-aware
rules (via `tsgolint`, which supports TS 7) · [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) ·
[Vitest](https://vitest.dev) · Zustand · wouter · idb.

## Getting started

```bash
bun install
```

```bash
bun run dev
```

| Script             | What it does                                  |
| ------------------ | --------------------------------------------- |
| `bun run dev`      | Start the dev server                          |
| `bun run build`    | Type-check and build to `dist/`               |
| `bun run preview`  | Serve the production build                    |
| `bun run check`    | Type-check, lint, format check and unit tests |
| `bun run lint:fix` | Apply safe lint fixes                         |
| `bun run format`   | Format everything                             |
| `bun run test`     | Run unit tests                                |

Every push to `main` builds the app and deploys it with the official
[`actions/deploy-pages`](https://github.com/actions/deploy-pages) workflow to
<https://mathhulk.github.io/color-by-number-pixel-art/>. One-time setup: **Settings → Pages →
Build and deployment → Source: GitHub Actions**. To build for another sub-path, set
`BASE_PATH=/some-path/`. The app uses hash routing, so it works on any static host without
rewrite rules.

## Project layout

```
src/
  ui/          Design system: Base UI wrappers (Button, IconButton, Sheet, Dialog, Menu, Select,
               Slider, Switch, SegmentedControl, Tabs, Progress, Toast, Tooltip…)
  render/      WebGL 2 engine: GLView base, Grid2DView, Voxel3DView, shaders, math
  import/      Image → puzzle pipeline (resampling, quantizers, dithering) + worker + client
  lib/         Data model, fill targets, play session/undo, IndexedDB, thumbnails, export,
               color & color-vision math, .vox support, samples
  features/    Screens: library, play, importer, settings
  state/       Settings store and shared hooks
```
