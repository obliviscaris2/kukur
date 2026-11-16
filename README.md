# KUKUR (कुकुर)

A street pup exploring a painted, whimsical Kathmandu valley in the browser: Kathmandu, Lalitpur (Patan) and Bhaktapur. The streets, rivers, parks and temple sites come from OpenStreetMap. Play through Kukur Tihar, then help Khairey search for Aama and Bhai among busy streets, glowing temple gardens and local dog packs.

## Run it

```bash
npm install          # first time only: three.js, earcut, lint tools
npm run dev          # http://localhost:5173
```

The project is plain ES modules with no build step, so any static server works. Apache serves it at `http://localhost/doggy/`.

To publish a self-contained copy, run `npm ci` then `npm run build:static` and host `dist/`.
It includes local Three.js modules and the game's models, map, textures and audio.
Progress stays in each player's browser; it is not shared between players.

URL options for testing:

| Option | Effect |
|---|---|
| `?quality=low\|medium\|high` | force a quality preset (default: auto, by GPU) |
| `?scale=0.7` | fix the render resolution (turns off adaptive resolution) |
| `?autostart` | skip the main menu |

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | trot; **Shift** runs (zoomies), **Ctrl** walks |
| Mouse / wheel | look and zoom; zoom all the way in (or **Tab**) for the pup's-eye view |
| Space | hop; press again in the air to double-hop. Run at walls, crates and vehicles to scramble up onto them. |
| F | bark (tap). Hold for the **Kukur Roar**: stun nearby attackers and reveal intent/loot. Silver = neutral, red/orange = hostile, green = possible friend. |
| X | dash: a burst that knocks pots and crates flying |
| E / G | pick up or dig; ring temple bells, rest on chautaris, make a wish on a glowing tree's perch, drink / give a bone or biscuit |
| I or B / J | the grimoire: bag / journal (tasks and story), diary, packs, places |
| Q (hold) | sniff: the world goes grey and scents glow |
| V | dog eyes: blue and yellow colour vision |
| M | valley map: search for any tole, street or temple, click to set a waypoint, drop 📍 pins, or fast-travel |
| R / T | change the weather / skip an hour |
| Esc | pause menu |
| F3 | FPS and debug readout |

Key bindings are in `src/config/controls.js`.

## Project layout

```
index.html            page shell: canvas, HUD and menu markup, import map
styles/               base.css (theme variables), menu.css, hud.css
src/
  main.js             entry point: new App().boot()
  app/App.js          owns every system and runs the frame loop and state machine
  config/             ALL tunables (plain data): world, palette, ground, pup, weather, npc, quality, controls
  core/               engine-agnostic helpers: input, audio, events, settings, rng, geo, asset loading
  render/             renderer and quality, toon shading, building facade atlas, world materials
  world/              World facade + tiles/ (streaming, worker mesh building), props/, landmarks/, sky/, effects/, physics, Gazetteer
  entities/           pup/ (player, camera, senses), dog/ (shared dog model + animator), npc/ (people, strays), traffic/, items/
  scenes/             scripted cinematics (IntroScene)
  ui/                 Menu, Hud, Minimap, BigMap, speech Bubbles
assets/
  map/                generated OSM tiles (manifest.json, overview.json, tiles/*.json)
  models/             generated glTF: pup, person, temples/
pipeline/
  osm/build_tiles.py  OpenStreetMap -> assets/map
  blender/*.py        Blender scripts -> assets/models
  audio/              CC0 sound bank (sounds.json) -> assets/audio
tools/dev-server.mjs  zero-dependency static server with gzip
tools/snap.mjs        headless Chrome test driver (steps in tools/snaps/*.json)
docs/                 architecture, content guide, asset pipeline
```

## Documentation

- [docs/CODEMAP.md](docs/CODEMAP.md): every feature mapped to its files, configuration and events.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the systems fit together, the frame loop, events and coordinates.
- [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md): step-by-step recipes for changing things such as colours, weather, wind, famous places and signposts, NPC roles and moods, ground themes, start points, landmarks, scenes and the dog.
- [docs/PIPELINE.md](docs/PIPELINE.md): regenerating the map, the 3D models and the sound bank.
- [docs/ROADMAP.md](docs/ROADMAP.md): what's done and ideas for next.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | local server |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run data:map` | rebuild `assets/map` from OpenStreetMap (about 12 min the first time, about 15 s after that, thanks to the parse cache) |
| `npm run data:terrain` | rebuild the valley elevation (`assets/map/terrain.*`) from the public SRTM DEM (about 1 min) |
| `npm run check:clearance` | camera sweeps, temple alignment, terrain contact, foundations, jump headroom and stair smoothing |
| `npm run check:rendering` | spatial collision/batching, bounded atmosphere, finite street lights and temple tread separation |
| `npm run check:exploration` | rolling ground and soil beds, stone/log collision, dog motion stability and pooled junkiris |
| `npm run assets:art` | reproduce the painted surface atlas and transparent foliage texture from their source images |
| `npm run assets:pup` / `assets:people` / `assets:temples` / `assets:audio` / `assets:all` | rebuild the glTF models with Blender, or re-fetch the CC0 sound bank |
| `npm run snap` | headless Chrome smoke test (state, performance, screenshots in `tools/snaps/out/`) |

## Credits

Map data © OpenStreetMap contributors (ODbL). Rendering by three.js (MIT). Sounds: CC0 recordings from freesound.org (see `assets/audio/CREDITS.md`).

Painted textures: [sources, generation modes and exact prompts](pipeline/art/README.md). [Art direction and measured performance](docs/ART_DIRECTION.md). Review the latest surfaces and discoveries at [tools/exploration-preview.html](tools/exploration-preview.html); the earlier art comparison is at [tools/art-preview.html](tools/art-preview.html).
