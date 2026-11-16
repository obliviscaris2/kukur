# Architecture

## Principles

1. **Data lives in `src/config/`, logic lives everywhere else.** Colours, speeds, counts, weather presets, outfits and key bindings are plain objects. Changing them never needs code changes elsewhere.
2. **One owner.** `App` creates every system and passes each one only what it needs. Systems don't import each other's instances.
3. **Loose coupling through events.** Cross-cutting reactions (a bark makes sound, a speech bubble and NPC reactions) go through `core/events.js` instead of direct calls.
4. **Heavy work off the main thread.** Map tiles are built into typed arrays inside Web Workers and handed over as transferables.
5. **Generated assets are reproducible.** Everything in `assets/` is produced by a script in `pipeline/`. Fix the script, never the output.

## Module map

```
main.js ─► app/App.js
             │
             ├─ render/Renderer ........ WebGL renderer, quality preset (GPU sniffing), adaptive resolution
             ├─ core/Input, core/Audio .. keyboard/mouse/touch actions; procedural WebAudio
             ├─ world/World ............. facade over everything static:
             │     ├─ tiles/TileStreamer ─► Web Workers (tile.worker.js ─► buildTile.js)
             │     ├─ physics ............ 2.5D collision: solids (extruded polygons), platforms, circles, terrain
             │     ├─ Gazetteer .......... "where am I": toles, popular streets, named parks/ponds, landmarks
             │     ├─ props/Props ........ instanced trees, poles, lamps, scooters, flags… streamed by distance
             │     ├─ props/Signposts .... carved signposts at main junctions, pointing to famous places
             │     ├─ landmarks/Landmarks  temple/stupa glTFs placed on their real footprints
             │     ├─ landmarks/Beacons .. far-away landmark silhouettes + the waypoint light column
             │     ├─ sky/Sky + sky/Weather ─► sky/Wind (gust field)
             │     └─ effects/ Rain, Debris, Petals, WindStreaks, Motes, Critters, Sanctuary
             ├─ entities/pup/Pup + PupCamera   player dog and third-person camera
             ├─ entities/npc/NpcManager ─► Person (roles + moods), Stray (packs, greetings, howl chorus), Pigeons, Stones, items/Treats
             ├─ entities/traffic/Traffic ..... scooters, taxis, cars, microbuses, tempos, buses (drive on the left)
             ├─ render/Fx .................... juice: dust, fairy sparkles, hearts, splashes, water ripples
             ├─ core/audio ................... sample engine: banks, loops, 3D sounds, reverb, discovery stinger
             ├─ entities/pup/Senses .......... sniff particles and dog-eyes colour filter
             ├─ scenes/IntroScene ............ scripted camera and pup cinematic
             └─ ui/ Menu, Hud (plaque, discovery banner), Compass, Minimap, BigMap (waypoints), Bubbles
```

`entities/dog/` (`DogModel`, `DogAnimator`) is shared: the player pup and every stray use the same model and animation layer, with different coats and scales.

Player movement uses `Physics.move()` to sweep a short body capsule in substeps smaller than its radius.
Static polygons, platform sides, parked scooters, benches and nearby dynamic bodies stop the pup. `groundAt()`
only accepts platforms below the requested height; running down small changes in height snaps to the surface.
Roof decks remain walkable, with their parapets still blocking the edges. `Physics.rect()` follows three.js Y rotation.
Moving systems register body providers in `physics.bodies` and standable surfaces in `physics.dynamic`.

Camera and sight-line sweeps use continuous extruded-polygon/circle intersections (`core/sweep.js`), so thin
walls cannot fall between samples. `Physics.sweepSphere()` includes platform sides/undersides, parapet rims,
terrain and roof occluders; nonzero camera volumes also test vehicles and solid clutter. Ordinary sight lines
exclude dynamic actors to avoid self-occlusion. `ceilingAt()` bounds upward jumps and the staged mantle path.
The capsule rechecks its centre and ends together after side resolution. Small tread changes keep exact physics
support while a bounded visual offset eases the body; the paw IK remains responsible for contact.

`CameraTravel` sweeps the final camera position after cinematic blending. Blocked cinematic routes rise above
the intervening roofs, cross, then descend; follow-camera corners retract through the previous clear pivot.
Travel and look targets ease between shots, with altitude-dependent speed limits and slower boom extension.
Just-streamed geometry can invalidate a previous camera position; that case recovers to a clear endpoint.
Traffic separates the bonnet from the cabin, and roof heights include the vehicle's slope.

Traffic is split into `RoadNetwork` (directed OSM graph and arc-length sampled lane curves), `TrafficFlow`
(simulation, spawning and one render/body registry), and `VehicleModels` (merged paint/trim geometry).
Every shared internal OSM vertex can be a junction. One-way/width rules filter vehicle routes, turns are checked
against full static footprints, and junction reservations plus bumper gaps prevent queues from overlapping.
Cars advance in metres every frame, including across road segments shorter than their body. Dead ends use a
checked return turn where space allows; off-screen stalled traffic is recycled. Vehicles never get pushed sideways
off their route to resolve contacts. Movable clutter receives bounded `trafficBrush` impulses through Gameplay.

`StreetActivities`, owned by NpcManager, anchors shopkeepers to worker-provided shop recesses and officers to
`trafficJunctions` events. App passes officer signals into traffic and coordinates E interaction prompts. An officer
can hold traffic for a crossing; shopkeepers offer biscuits; schoolkids run a short chase/tag on their walking path.
NPC collision descriptors (`person.collider`) are separate from skinned render meshes (`person.body`), use live
position getters and ignore their owner during movement. Actors close to the lens dither away; story shots disable
this fade. Vendor cart pieces share one merged vertex-colour mesh.

`PawPlant` solves four two-bone chains on the player after animation, keeping stance paws in contact on uneven ground.
Gait phase uses measured movement and model scale. Pose/air/gait weights remain normalized through transitions.
`ImpactMotion` adds damped angular motion to existing joints and torso, then blends into standing; translation still
uses the normal collision controller. This is a lightweight procedural tumble, rather than a separate rigid-body engine.

Leaf piles, cans and searchable rubbish reuse the instanced clutter system. Leaves, scraps, dust and stars share
one fixed particle pool (`PARTICLES` in config/quality.js). Footstep dust follows distance travelled, and star/skid
emission has time limits. Empty effects and instanced prop fields are hidden.
The Tihar garland is also instanced: all sixteen flowers use one mesh and one material per dog.

## Intent, defence and local dogs

`gameplay/disposition.js` is the single pure definition of an actor’s current intent. Calm territorial dogs,
unknown people and harmless shooing are neutral. A growl, bite pursuit, stone wind-up, catch-pole attack or recent
attack makes a threat; feeding/petting, possible helpers and befriended dogs are green. Breed and coat have no
combat meaning. Traffic warnings use its projected lane/path and time to reach the pup, rather than speed alone.

`Threats`, owned by Gameplay, feeds one bounded `DispositionAura` point cloud and the HUD’s concrete attack hint.
Silver wisps, red/orange embers and green fairy glints change with behaviour. Scan markers follow the same rules
while they are visible. Stunned actors show icy orbiting stars. Story scenes suppress combat/aura feedback.

Scan’s charged roar calls the Gameplay coordinator to stagger nearby hostile actors before it shoves clutter.
Entity `stun(seconds)` methods cancel attack wind-ups and bites, stop movement, and impose recovery/immunity.
Combat stun has range, height and wall checks; incoming stones can be deflected. Breaking a pot cannot overwrite
an attack tell or an existing stun. Territorial dogs provide a minimum warning window; escaping onto a roof or
into water ends their pursuit. Catchers have a visible approach and catch-pole wind-up, one hit, and a cooldown.

The Blender dog generator exports local village, Bhote-type and Spitz-mix variants with the same bone names and
16 clips. It uses a longer level back, smaller skull/eyes, tapered muzzle and bounded leg IK. Front elbows bend
back, hind knees forward; IK stretch is disabled and every clip keys a neutral baseline so poses cannot leak.
`DOGS` selects cached assets, silhouettes, coats and scale ranges throughout the valley.

## House stairwells

`HouseStairs` plans return flights inside suitable flat-roofed houses. `buildTile` carves the matching concave
stair bay from the building collision/roof mesh, adds room sides and slab treads, and retains explicit outer
parapet colliders. Treads have a `base` as well as a top, so upper flights leave headroom below. Ordinary old
platforms default to `base = -Infinity`. The path joins the real roof deck beside a searchable basket.

`Rooftops`, owned by Gameplay, consumes `tile.data.houses || []`, supplies E prompts, Q entry scents and scan
loot markers, and remembers door gifts, roof discoveries and searched baskets. Geometry is merged into existing
tile buffers. No location-specific placements are needed: the same seeded generator runs in every city.

## App state machine

```
loading ──► menu ──► intro ──► play ◄──► paused
              ▲                  │
              └──── quit ────────┘          travel (fade, stream, place) returns to play
```

- **menu**: the camera slowly orbits the sleeping pup and the world keeps simulating behind the menu.
- **intro**: `IntroScene.run()` drives the camera; Space, Enter, Esc or a click skips it.
- **play**: `App.#playInput()` handles global keys; `Pup.update()` handles movement.
- **paused**: the simulation stops and the menu shows the pause view.

## Frame loop (App.#loop)

```
input ─► pup.update ─► world.update (weather ─► sky ─► streamer ─► props)
      ─► npcs.update ─► senses ─► audio ─► camera ─► hud/minimap/bubbles ─► renderer.adapt ─► render
```

Every `update(dt, …)` takes seconds, and simulation `dt` is clamped to 50 ms. FPS and adaptive resolution use the actual, unclamped frame interval. The paused/map/bag view lets the camera settle, then redraws the 3D scene at about 2 Hz while input/UI remain responsive.

Dynamic collision providers are indexed in 8 m cells by `physics.refreshBodies()` around the player/gameplay/traffic/NPC phases. Queries use the same live body descriptors and narrow-phase collision math, with conservative padding; unloaded bodies disappear at the next refresh. `World.prepare()` waits for tile geometry and pending landmark meshes/colliders. Travel resets cinematic camera state through `PupCamera.placeBehind()`. `Renderer.prepare()` compiles visible material variants and renders a complete frame behind the loading/fade overlay.

## Map data flow

```
OpenStreetMap (.pbf) ──pipeline/osm/build_tiles.py──► assets/map/
   manifest.json  origin, tile index (count, density), start points, heritage cores
   overview.json  simplified roads/areas/landmarks for the big map
   tiles/X_Z.json one 256 m tile: buildings, roads, areas, water, trees, POIs, landmarks

TileStreamer.update(focus)
   └─ wants tiles within quality.streamRadius ─► worker: buildTile(tile, ctx)
        returns typed arrays for walls/roofs/roads/ground/areas/water,
        collision shapes, NPC nav paths, prop instances, landmark list, minimap bitmap
   └─ main thread: build meshes, register physics (owner = tile key),
      then World.onLoad ─► Props.addTile, Landmarks.addTile, NpcManager (navs, pigeons)
   └─ tiles beyond radius + 180 m unload and everything they registered is removed
```

`ensureAround(x, z, r)` blocks until an area is ready; spawning and fast travel use it. While it waits it *holds* that area, so the per-frame update (still centred on the old position) can't unload it.

## Wayfinding

Getting around should feel like Skyrim: you always know where you are and which way things lie.
- **Gazetteer** (`world/Gazetteer.js`, data in `assets/map/gazetteer.json`) answers `describe(x, z)`. The answer is the landmark you're at, else the named park/square/pond, else the tole, plus the city and the street. Only public geography is included, never shop names.
- **HUD plaque** (top-left) shows that answer. Entering a new place triggers a **discovery banner**; the first visit says *Discovered* and plays a chime (remembered in localStorage).
- **Compass** (`ui/Compass.js`) shows cardinal points, famous destinations, nearby notable landmarks and your waypoint.
- **Signposts** come from junction data in the tiles (`s`). Their boards name the `DESTINATIONS` (config/places.js) that lie down each road, with distances.
- **Beacons** keep famous landmarks visible on the horizon even when their tiles aren't loaded.
- **Waypoint**: click the map (M) to set one. It shows as a column of light, a paw on the compass and the map, and clears when you arrive.

## Wind

`world/sky/Wind.js` is the single wind field. It has a wandering direction, strength from the weather, gust fronts rolling downwind, and occasional whirlwinds near the pup. The same gust formula exists in GLSL (`windGust` in `render/toon.js`), so trees, prayer flags, laundry, leaves, wind streaks, the pup's ears and the wind sound all agree on when a gust passes.

## Sound

`core/audio.js` loads `assets/audio/manifest.json`, which `pipeline/audio/fetch_sounds.py` builds from `pipeline/audio/sounds.json`. All recordings are CC0 from Freesound; credits are in `assets/audio/CREDITS.md`. Each bank's mode decides how it's used:

| Mode | Behaviour |
|---|---|
| `oneshot` | Leading silence is trimmed. |
| `segments` | A recording of several barks or horns is split into separate hits by its energy envelope, and a random hit plays each time. |
| `loop` | Ambience layer. `audio.update()` mixes them from context: traffic by street density, crows by day, monastery chant near stupas, rain, wind, paddling and panting. |

Positional sounds (`play(key, { pos })`) use a PannerNode relative to the camera (`audio.listen(camera)`). Bells and the discovery stinger go through a generated convolution reverb. In place of music there is a soft tanpura-like drone, whose volume is the Music setting.

## Feel (movement and juice)

- **Pup movement** (`Pup.update`):
  - Key input is smoothed, so taps feel soft.
  - Turning uses angular velocity on a spring, which makes arcs.
  - Speed eases in and out.
  - The hop has variable height (release Space early for a small hop), a floaty apex and a snappier fall, with stretch and squash on the model.
  - The pup swims in ponds and rivers (`World.waterAt`).
- **Camera** (`PupCamera`): mouse look glides to a target, the pivot leads in the direction of travel, the camera pulls back on zoomies, and it dips on landing (`cam.bump`).
- **Juice**: `App.#juice()` and the event handlers create Fx bursts on hop, land, splash, pet and treat, plus the zoomies fairy-dust trail and swimming ripples.

## People and dogs

`NpcManager` picks a role from context and spawns people:
- **vendors** with carts on busy streets
- **devotees** walking clockwise around the nearest temple or stupa
- **elders** sitting on chautari steps
- **chatting groups** on the pavement
- **walkers, kids and porters** on the street network

Each person also gets a mood that decides how they treat the pup:
- **kind**: pet, wave, or toss a biscuit (`Treats`)
- **neutral**: glance and carry on
- **grumpy**: shoo
- **cruel**: throw a stone (`Stones`); a hit makes the pup yelp and stay scared

Kids chase the pup and run off squealing when it barks. Strays nap, wander, follow a pack leader, race you to biscuits, and play when you bark.

## Look

- **Post** (`render/Post.js`): the scene renders to a half-float target; restrained bloom runs at 1/4 and 1/8 resolution; the final pass applies gentle vibrance, contrast and highlight compression. Coat/skin hues come from lighting. Turn it off with `POST.enabled` or `?nopost`.
- **Buildings** have four layers:
  - Painted walls from the atlas.
  - Raw brick or concrete side walls on walls that don't face a street. That is the Kathmandu look from above.
  - A near-only **relief** mesh (`buildTile` → `facade()`): cornices, sills, lintels, chajjas, Newari frames and awnings. It is only shown within `RELIEF_LOD`.
  - Rebar clusters on unfinished roofs, drawn with the wire lines.
- **Botany**: `props/natureGeometry.js` builds tapered curved trunks, rooted forks and painted leaf-spray cutouts. Five species share the existing per-kind near/far instance fields. Golden-angle placement, linear-colour gradients and stable world-position variation keep the forms coherent. Matching alpha-cutout depth materials avoid rectangular leaf shadows. Detail levels fade with complementary stipple masks; loading/unloading nearby trees does not rotate others.
- **Grass**: tufts and flowers use the existing worker `tufts` output, with scatter/density/caps in `NATURE.planting`. `Grass` and potted plants share the leaf material; stems keep their green colour when flower heads are tinted. Root vertices stay anchored in wind.
- **FarCity**: shown only for high cameras. Its blocks collapse inside the streamed radius, and fog thins with camera height (`Sky.update`).

## Rendering

- **Mood**: `ART.sky` supplies warm daylight, peach horizons and readable blue moonlight. Characters use soft Phong shading and restrained albedo-preserving fill/key/rim; ink hulls are disabled. The shared painted palette spans buildings, ground, foliage, temple materials and characters. A continuous cloud dome and one layered ridge mesh soften the skyline. FXAA shares the existing final post pass. See `ART_DIRECTION.md`.
- **Shared materials**: `render/toon.js` retains the `toon(color, opts)` and `toonify(material, opts)` APIs. Matte scenery uses `MeshLambertMaterial`; characters, metal and water use `MeshPhongMaterial`. Both share global uniforms in `U` and the existing shader hooks. `surfaceLibrary.js` supplies a seeded noise texture, the painted foliage cutout and four mipmapped material swatches, with shallow derivative relief. Paths, scales and budgets live in `config/mythic.js`.
- **Blossom**: `Petals` shares the weather wind field, with one fixed instanced pool (80/128/176 by quality). It samples terrain, hides inside solids, fades near the lens and settles briefly. Sources follow streamed jacarandas; sparse ambient blossom also travels elsewhere in the valley. Fewer rectangular debris particles keep the atmosphere quiet.
- **Sanctuaries**: `World` supplies nearby trees, streamed landmarks and support queries to `Sanctuary`. It aligns flower/leaf clumps to slope normals and places permanent oil lamps around rotated terrace rims, keeping entrances clear. Marigold strings use one instance field. `DiyoField` also serves Tihar street lamps; tiny distant bowls are omitted while flames remain visible.
- **Local light**: `Sanctuary` selects two nearby warm/cool pools from temples, trees and street lanterns and fades sources when they change. Non-finite positions, radii and powers are rejected before reaching shader uniforms. `U.uShrinePos` / `uShrineColour` drive compact bounced light on existing materials without additional lights or shadow maps. This is an unshadowed ambient-light approximation. Incense, fireflies and a fixed 16-quad mist pool stay near their sources. `Neon` uploads only nearby bulbs, signs and wires.
- **Buildings** use bounded 128 m batches per tile, sharing vertex buffers with separate index subsets. Near relief disappears beyond 85 m; fogged landmarks are also culled. Walls cast the building shadows; facade detail and relief do not duplicate them. A cheap depth prepass rejects ground hidden by roads/areas. Facade art comes from the canvas-painted atlas (`render/facadeAtlas.js`), chosen per floor using vertex attributes.
- **Ground themes** use one shader for all area kinds. The kind index selects colours and pattern from `config/ground.js`.
- **Performance knobs** live in `config/quality.js` (stream radius, shadow range, prop radii, NPC counts), `ADAPTIVE` (dynamic resolution) and `MYTHIC.performance` (shadow and distant-person animation cadence). Shadows refresh at 12 Hz. NPCs use conservative camera/distance culling; distant people animate at 20/10 Hz while AI and collision stay live. Hidden distant rigs skip world-matrix updates. Scripted actors retain full updates.

## Events (core/events.js)

| Event | Payload | Emitted by | Used by |
|---|---|---|---|
| `bark` | position | Pup | App (sound, bubble), NpcManager (reactions, pigeons) |
| `hop`, `land`, `shake` | — | Pup | App (sound) |
| `howl` | — | Pup (at night) | App |
| `petted` | person | Person | App (happy sound) |
| `yelp` | stone position | Pup (hit by a stone) | App (whimper, bubble) |
| `treat` | who ate it (pup or a stray) | Treats | App (pup eats: stamina refill, toast) |
| `weather` | preset name | Weather | App (toast) |
| `lightning` | — | Weather | App (thunder), Pup (scared) |
| `day` | day index | Weather.setDay (calendar, saved) | Festival (which Tihar day) |
| `firework` | { pos, big } | Fireworks | Gameplay (pup flinches), Birds (scatter), Journal |
| `flock` | position | Pigeons.scare | Journal |
| `catChase` | cat | Cats (the pup sent one running) | Journal |
| `nest`, `frog`, `junk` | the thing | Birds, WaterLife | Journal |
| `puddle` | position | Gameplay (running in the rain) | Journal |
| `roar` | position | Scan | Birds (scatter), Journal |
| `stun` | {count,pos} | Threats | Journal |
| `roofVisit`, `roofCache` | {house,pos} | Rooftops | Journal |
| `wishTree` | {name,pos,first} | Exploration | Discovery diary; available for future quests |
| `trafficJunctions` | { junctions: [{x,z,tile,arms}] } | Traffic | StreetActivities (officer anchors) |
| `trafficBrush` | { pos, dx, dz, power, reach } | Traffic | Gameplay → Breakables (deflect clutter) |
| `safeCrossing`, `playChase`, `ridehail` | actor or position | StreetActivities / Traffic | Journal tasks and diary |
| `streetTreat` | { pos } | StreetActivities | App → Treats, Audio |

The journal subscribes automatically to every event named by a task in `config/quests.js`, so a new task is one line of config.

Add a new reaction by subscribing where it belongs: `events.on('bark', (pos) => …)`.

## Conventions

- **Units and axes**: metres. +X is east, +Z is south, +Y is up. `core/geo.js` → `toLocal(lat, lon)` converts from GPS using the origin in `manifest.json` (Basantapur).
- **Heading**: `atan2(dx, dz)`, so forward is `(sin h, cos h)`.
- **Physics owners**: everything registered for a tile uses the tile key (landmarks use `key + '/lm'`), so unloading is just `physics.removeOwner(key)`.
- **Randomness**: `core/rng.js` gives a seeded `rng(seed)`. Use `hash(x, z)` seeds for anything that must look the same every visit, such as house colours or tree placement.
- **Exploration**: `Gameplay` owns `Exploration`. Static `garden:` / `wish:` owners live in the physics hash only while their instanced scenery is active; unloading removes them. App passes discovery sources to World/Weather for the existing bounded junkiri pool. Placement avoids water, roads, buildings and steep support. No additional real lights or campaign missions are created.
- **Paw motion**: exact critically damped springs add acceleration response and bounded ear motion. Respawn resets motion history; stance IK anchors low paws horizontally and releases on lift, pose transitions and excessive reach, preserving both bone lengths.
- **Files**: one class per file, named after the class (`Pup.js`). Plain helpers use lowercase (`geo.js`).
