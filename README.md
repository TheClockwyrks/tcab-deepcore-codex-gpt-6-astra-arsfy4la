# Deepcore

A browser mining expedition about the price of getting home. Drill through four geological bands, haul thirteen minerals to the surface, and turn their value into fuel, better equipment, field supplies, and a five-part escape rocket. Resonite and Cryenite hide underground; the final Core Sample starts a 90-second race to the launch pad.

Choose Standard or Hardcore and a Quick, Standard, or Marathon mine. Standard lets you restore your last manual save after death. Hardcore deletes that save. Save at the camp's Save Pad; there is no autosave.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The game runs entirely in the browser. Audio unlocks on the first key or pointer interaction.

```sh
npm run build
npm run preview
```

The production site is `dist/`, including its root `index.html`. Serve this directory with any static HTTP server, at the root or a nested path. All URLs are relative. No server API, external service, or generation tool is needed at runtime or build time.

## Controls

| Input | Action |
| --- | --- |
| A / D or left / right | Walk; drill a wall when grounded against it |
| S or down | Drill downward while grounded |
| W / up / Space | Hold jetpack thrust |
| E / Enter | Interact with a surface building; confirm a menu selection |
| I | Open or close cargo inventory; discard ore or use supplies |
| 1–6 | Dynamite, plastic explosives, quantum teleporter, matter transmitter, nanobots, emergency fuel |
| J | Jettison the unstable Core Sample |
| Escape / P | Close a panel, pause, or resume |
| M | Mute all sound |
| Backtick | Engine diagnostics |

Menus and panels support keyboard navigation and pointer/touch selection. The miner uses keyboard controls. The drill never cuts upward: keep a route and enough fuel for your return. Cargo slots limit pickups; cargo weight limits lift. Drop ore from inventory if you overload your jetpack.

## Source and verification

The Simple 2D engine owns input, timing, asset loading, audio, recording, diagnostics, and the canvas fit. `src/game.ts` binds those services to immutable state transitions; the simulation runs at 120 ticks per second. World generation, transactions, UI layout, rendering, and debug poses live in separate modules. The debug API is available through an engine handle's `debug` member, with no page global.

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests exercise the engine on a native canvas with a controlled clock, as well as simulation rules, generation, hazards, transactions, saves, and debug validation. The tests decode the committed PNGs; audio decoding is replaced by a small Node host adapter.

## Authored assets and showcase

All shipped art, animation frames, particle systems, sound effects, and music are committed under `assets/`. The one-time authoring scripts in `scripts/produce-art.py` and `scripts/produce-sound-fx.py` use the supplied `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music` tools. These optional scripts are **never called by the build**. `public/assets` is a repository symlink to the committed assets; Vite copies its contents into the static output.

`showcase/` contains the player description, screenshots, and an engine-recorded live-play replay. With the development server running at port 5173, `node scripts/capture.mjs` recreates those captures using the project's Playwright and Chromium with `--no-sandbox`. The capture script uses the engine's debug poses to prepare expeditions, then drives live play with normal input.
