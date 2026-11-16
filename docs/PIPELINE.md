# Asset pipeline

Everything in `assets/` is generated. To change it, change the script and re-run it.

## Requirements

- **Blender 5.x**, for the models and for its bundled Python, which runs the map build. The npm scripts expect `blender` on `PATH` and Blender's Python at `~/.local/opt/blender-5.3.0-linux-x64/5.3/python/bin/python3.13`. Edit `package.json` if yours lives elsewhere.
- **pyosmium**, installed into that Python:
  ```bash
  ~/.local/opt/blender-5.3.0-linux-x64/5.3/python/bin/python3.13 -m pip install --target ~/.local/opt/pylibs osmium
  ```
- **Nepal OSM extract** at `pipeline/.cache/nepal-latest.osm.pbf` (from https://download.geofabrik.de/asia/nepal.html). `pipeline/.cache/` is git-ignored.

## Map: `npm run data:map`

`pipeline/osm/build_tiles.py` reads the extract and writes `assets/map/`, producing about 25 MB in about 4,800 tiles. The first run parses the `.pbf`, which takes about 12 minutes, and caches the result in `pipeline/.cache/parsed-*.pkl`. Later runs take about 15 seconds. The cache rebuilds by itself when the extract, the bbox or the `Collector` code changes. `npm run data:map -- --reparse` forces it.

| Setting (top of the script) | Meaning |
|---|---|
| `S, W, N, E` | bounding box: the Kathmandu valley floor (Kathmandu, Lalitpur, Bhaktapur, Kirtipur, Thimi) |
| `LAT0, LON0` | world origin (Basantapur). Changing it moves every coordinate. |
| `TILE` | tile size in metres (must match `WORLD.tileSize`) |
| `CORES` | heritage cores, which get brick paving and Newari houses nearby |
| `LANDMARK_RULES` | regex on an OSM name → temple model. The first match wins. |
| `NOT_LANDMARK`, `HOUSE_LIKE` | names that must *not* become temples (hotels, banks, monasteries…) |
| `ROAD_W`, `AREA_KIND`, `WATERWAY_W` | road widths and ground-theme kinds |
| `starts` (near the end) | named start points written to `manifest.json` |
| `STREET_RANK`, `signposts()` | which roads count as main roads; where signposts go (junctions of named roads, about 170 m apart) |
| `write_gazetteer()` | `gazetteer.json`: toles, popular streets (merged by name), named parks/squares/ponds, landmarks |

### Tile format

Each `tiles/X_Z.json` covers 256 m. Coordinates are decimetres relative to the tile corner.

| Key | Content |
|---|---|
| `b` | buildings: `[flatPolygon, levels, flags (1 Newari, 2 shop, 4 pitched, 8 civic, 16 Rana palace), tint, nameIdx, roofRGB or -1, wallRGB or -1]` |
| `r` | roads: `[flatLine, kind, widthDm, material (0 asphalt, 1 brick, 2 dirt), nameIdx, bridge, lanes, oneway]` |
| `s` | signposts: `[x, z, angle1·1000, nameIdx1, angle2·1000, nameIdx2, …]` (road arms leaving the junction) |
| `f` | walls & fences: `[flatLine, kind (0 wall, 1 fence, 2 city wall, 3 retaining)]` |
| `m` | statues & pillars: `[x, z, kind (0 memorial, 1 statue, 2 column), nameIdx]` |
| `a` | areas: `[flatPolygon, kind, nameIdx]` |
| `w` | waterways: `[flatLine, widthDm]` |
| `p` | points of interest: `[x, z, nameIdx]` |
| `l` | landmarks: `[x, z, sizeDm, angleMilli, model, nameIdx]` |
| `t` | OSM trees |
| `names`, `g` | name table; `[density, core]` |

`buildTile.js` (in a Web Worker) turns this into meshes at runtime. That means house styling, roofs, balconies, trees and street props can be changed in JS without rebuilding the map.

### Runtime street features

The worker preserves existing road `lanes` and `oneway` fields in `navs` (both default to 0 for old tiles).
`RoadNetwork` connects shared interior vertices as well as polyline ends; traffic doesn't need regenerated OSM data.

`buildTile.js` also derives `shops`, `climbs` and `houses`; these are **worker outputs, not new raw tile JSON fields**:

- `shops`: `{id,x,z,y,heading,entryX,entryZ,kind}`. A deterministic subset of street-facing shop buildings gets
  an actual inset opening, floor, shelves, counter and entrance steps. The footprint collision has a matching
  concave recess, with a separate overhead prism above the opening. StreetActivities spawns a keeper behind the counter.
- `climbs`: `{x,z,y,heading,endX,endZ,top}`. Short stairs run beside existing compound walls in clear space and
  connect to their walkable tops. Existing OSM `steps` get stair platforms on slopes; chautaris also get approach steps.
- `houses`: `{id,entry,route,cache,deck,kind,heading}`. Suitable houses receive an open stair bay, stacked return flights, a roof exit and a searchable basket. This is generated from existing building polygons/levels/flags. Collision platforms may include `base` (the slab underside); TileStreamer defaults it to `-Infinity` for old outputs. Separate outer parapets keep the stairwell exit open.
- `occluders`: `{pts,base,h}` camera/overhead prisms derived alongside pitched roof geometry; TileStreamer reads `r.occluders || []`. These are separate from walkable platforms and building bodies. Temple roof proxies are derived from their transformed glTF triangles in `Landmarks`, with a fixed number of height bands (`LANDMARKS.roofSlices`); they do not add render meshes or close pavilion walkways.
- Consumers default absent metadata to `[]`. All stair geometry is merged into the existing tile detail buffer;
  collision platforms stream in/out with the tile. Treads are 0.42 m deep so the pup’s whole collision capsule can step onto them. Tunables are in `config/street.js` (`STREET_LIFE`).

## Sounds: `npm run assets:audio`

`pipeline/audio/fetch_sounds.py` downloads every Freesound id listed in `pipeline/audio/sounds.json` into `assets/audio/`. It skips anything that isn't CC0 or CC-BY, and writes `manifest.json` (what the game loads) and `CREDITS.md`. Use `freesound_search.py "query" [maxSeconds]` to find CC0 candidates.

## Models (Blender, headless)

| Command | Script | Output |
|---|---|---|
| `npm run assets:pup` | `tools/build-dogs.mjs` → `pipeline/blender/pup.py` | `assets/models/pup.glb`, `bhote.glb`, `spitz.glb`: local village / Bhote-type / Spitz-mix variants, each with 16 clips (Walk, Trot, Gallop, SniffWalk, Idle, SniffIdle, Bark, Jump, Sit, Lie, PlayBow, Shake, Scratch, Stretch, Howl, Wiggle) |
| `npm run assets:people` | `pipeline/blender/human.py` | `assets/models/person.glb`: one rigged person with optional parts (hair, hats, skirt, umbrella, doko) and clips (Walk, Idle, Wave, Pet, Shoo, Umbrella, Sit) |
| `npm run assets:temples` | `pipeline/blender/temples.py` | `assets/models/temples/*.glb` and `meta.json` (plinth steps used for collision) |

How the models are built:
- **Dogs**: local silhouettes (longer backs, tapered muzzles, small eyes, pricked or folded ears) are built from metaballs → voxel remesh → decimate → auto-weights. Variant proportions transform the skeleton and small parts together. Front/hind pole directions are explicit, stretching is disabled, and all clips reset the same baseline. The coat colour is in vertex colours, so strays recolour it in a shader. Eyes, nose, mouth and tongue are merged into one `Parts` mesh, so each dog costs two draw calls.
  - The point-domain float attribute `_blink` is 1 on eyes/highlights and 0 elsewhere before joining. `export_attributes=True` preserves it as a custom glTF attribute; GLTFLoader exposes it as `geometry.attributes._blink`. `DogModel` closes only these vertices. Do not replace it with a broad face bounding box: that included nose vertices on all three variants. Upper-muzzle fur is weighted to the head so panting cannot pull it through the rigid nose. `npm run check:graphics` verifies the exported data. Bump `DOGS.revision` and rebuild all variants after face changes.
- **Person**: a storybook character with adult body proportions, a smaller head, restrained eye highlights and gentle clothing folds. The proportion transform changes both mesh vertices and rest joints before rigging; it preserves clothing masks and animation names. It is one skinned mesh that contains the body and every optional hair, hat and clothing part. Vertex colours encode:
  - **R = region / 13**: skin, top, bottom, shoes, hat, hair, eye, sparkle, blush, accent, mouth, drape, wood, gold.
  - **G = part / 15**: Hair_short, Hair_bun, Hair_braid, Hat_dhaka, Hat_cap, Hat_shawl, Tunic, Patuka, Vest, Sari, Pallu, Skirt, Tie, Stick.

  `entities/npc/Person.js` colours the regions per outfit with uniforms. It also builds a cached index buffer per combination of worn parts, so each person is one draw call. Optional close ink is disabled by the current art preset. Keep the `PART` lists in sync between the script and Person.js. Bump `NPC.personModel`’s cache query when changing the generated shape.
- **Temples** also carry ornaments: eave bells and gold trim, guardian lions (Nyatapola has guardians up its stairs), butter lamps, and prayer wheels and prayer flags on stupas.
  Small bevels soften structural edges. Pagoda brick risers end at 82% of each step; stone caps occupy the remaining 18%, so their top faces cannot overlap and flicker. The final tread heights and collision metadata stay aligned. Rebuild all temple variants with `npm run assets:temples`.
- **Temples**: built from parameters (`pagoda(name, tiers, …)`, `shikhara()`, `stupa_big()`). Materials are named, not coloured; the game colours them (see `COLORS` in `Landmarks.js`).

Dog appearance references: local street-dog photographs from [KAT Centre](https://katcentre.org/en/rescue-treatment) and [Sneha’s Care](https://www.snehacare.org/). Bhote/Spitz names describe game silhouettes and mixes, not pedigree claims. No reference photos are bundled as game assets. Bump `DOGS.revision` after rebuilding a changed shape. The build helper validates each GLB and handles Blender installations that hang in audio shutdown after export.

### Previewing animations without the game

```bash
PREVIEW_ACTS="Sit:30,PlayBow:20,Howl:40" blender -b --factory-startup --python pipeline/blender/pup.py
# -> pipeline/.cache/previews/pup_sheet.png  (one frame per clip:frame)
blender -b --factory-startup --python pipeline/blender/human.py -- --preview
# -> pipeline/.cache/previews/person_sheet.png
```

### Bone and axis conventions (pup.py)

- Call `key(bone, frame, loc, rot)` with `rot = (pitch, yaw, roll)`. For spine and tail bones it swaps to Blender's bone axes for you.
- Root pitch: positive means nose up. Neck and head pitch: positive means nose down.
- Bone names such as `ear.L` arrive in three.js as `earL`. The GLTFLoader strips the dots.
- If you add a gait, add it to `PUP.gaits` in `src/config/pup.js` with its speed and stride length.

## Terrain (valley elevation)

`npm run data:terrain` (`pipeline/terrain/build_terrain.py`, needs Python 3 + Pillow, about 1 minute; tiles cached in `pipeline/.cache/dem/`).
- **Source:** public Terrarium DEM tiles (AWS Open Data / Mapzen, mostly SRTM 30 m). No key is needed.
- **Process:** the tiles are resampled to a 24 m grid over the map bounds, then Gaussian-smoothed (σ ≈ 60 m). The smoothing removes the radar's building and tree bumps but keeps terraces, river cuts and hills.
- **Output:**
  - `assets/map/terrain.bin`: Uint16, decimetres above the lowest point, rows going +Z.
  - `assets/map/terrain.json`: `{x0, z0, cell, w, h, scale, zero}`. `zero` is the height at the map origin, so Basantapur sits at y = 0.
- **Runtime:** `src/world/terrain.js` (`loadTerrain`, `terrainAt`) is shared by the tile worker and physics, so geometry and collision always agree. `WORLD.terrain.exaggerate` scales the relief.
- `terrainAt` interpolates the exact ground-mesh triangles (`WORLD.terrain.meshSegments` per tile), including their diagonal, rather than using the smoother DEM interpolation between mesh vertices. Placement, physics and the worker share this surface. Foundation edges include terrain grid/diagonal crossings (`footprintEdge`); walls extend below the lowest perimeter height by `WORLD.foundations.embed`. Temple footings merge into one mesh per occupied tile. Compound walls use short grounded sections; FarCity blocks extend into both the detailed and painted terrain.
- **Draping:** ground tiles use a 24×24 grid with slope normals. Parks and water are tessellated (12 m) and draped. Roads are subdivided every 8 m. Buildings sit on their lowest corner and dig into the slope. Overlay materials carry a depth bias.
- **No terrain files?** The world falls back to flat ground plus `WORLD.hills`.

## Native botanical and shrine geometry

`world/props/natureGeometry.js` generates the five tree species, painted leaf-spray cards, pots, ground flowers and
marigold strings at startup. `render/natureMaterial.js` supplies leaf transmission, small luminous buds
and distance fades. Tune `NATURE` in `config/nature.js` and `ART.foliage`; no Blender or OSM asset rebuild
is required. These are code-native meshes, rather than edits to generated assets.

The worker still emits the existing `props.trees` and `tufts` arrays; `NATURE.planting.scatter` changes
flower/grass density. No raw tile fields were added. `Sanctuary` derives tree-base gardens and permanent
temple diyos from the existing streamed tree/landmark positions, landmark rotation and support queries.
Street and temple lamps share `DiyoField`; bodies and flames have independent distance visibility.

## Painted texture sources

`npm run assets:art` copies `pipeline/art/source/storybook-materials.png`, `exploration-materials.png` and `fairy-leaves.png` into
`assets/textures/`. The source images and exact generation prompts/modes are recorded in
`pipeline/art/README.md`. Change the source or generator, then rebuild; do not hand-edit runtime copies.
`render/surfaceLibrary.js` extracts eight 512 px sRGB swatches with mipmaps, mirrored repeat and bounded
anisotropy, plus a 512 px transparent foliage texture. `MYTHIC` selects paths and world-space scales.
Foliage colour and depth passes use the same alpha cutout. No new OSM tile fields are needed.

## Exploration and ground runtime data

The worker derives `surfaces: [{kind,pts}]` from existing `tile.a` and `navs[].surface` from existing road material codes. `World.surfaceAt` uses these for footfall effects. Both readers fall back for absent fields. `detail` and `relief` vertex buffers now include `surface` (0 mineral, 1 timber, 2 clay roof), allowing varied paint in the same draw call. These are **runtime worker outputs**, not new raw map fields: no OSM download/rebuild is needed.

`terrainPieces()` clips roads and land-use polygons to the shared terrain grid diagonals. They follow the same planes as physical ground instead of bridging dips. `WORLD.terrain.relief` adds bounded, cached broad undulations at existing vertices. It adds no geometry to the base terrain and all building footings sample it too. Benches export separate seat/back/leg solids; grass is removed from the road/building occupancy mask. Natural dirt paths have a slightly irregular verge.

`explorationGeometry.js` builds rounded stones with matching polygon caps, cylindrical logs with eight collision strips, and luminous tree variants. A shared soil-bed mesh drapes onto the terrain and only rebuilds when the active wish-tree set changes. The three local dog GLBs are regenerated from `pup.py` with a fuller ribcage/haunch, shorter ear tips, less white across the rump and quieter gallop motion; use `npm run assets:pup` to reproduce them.
