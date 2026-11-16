# Art direction and character readability

KUKUR is a welcoming, painted fairy-tale Kathmandu. Warm clay and honey timber sit against cream and
lavender stone, soft green hills and blue flowering trees. The dog has a warm russet coat and ivory
markings; people keep recognisable Nepali clothing and natural skin colours. The supplied fantasy-tree
references guide the leaf shapes, luminous accents and gentle movement. Night brings lanterns, diyos
and discovery, with enough ambient light to see the street and its inhabitants.

Avoid gritty photographic materials, black shadow masses, heavy outlines, hard cel bands and a global
purple wash. Glow belongs to flowers, bulbs, flames and magical senses. Leave quieter surfaces around
those accents so the whole screen does not become a bloom effect. Character silhouette and movement
must remain readable against both bright paving and darker planting.

## Shared treatment

`pipeline/art/source/` holds the painted material atlas and transparent leaf spray; `npm run assets:art`
reproduces their runtime copies. [The asset manifest](../pipeline/art/README.md) records the exact
generation prompts, modes and paths. `surfaceLibrary.js` extracts mipmapped textures once at startup.
Materials use world-space projection, gentle colour variation and shallow derivative relief. They do
not add per-object textures or lights. The shared noise texture replaces repeated arithmetic noise.

The exploration atlas adds earth, rounded cobbles, plaster and curved roof tiles. Ground mixes smaller
plant marks with rotated samples, exposed soil and irregular repairs; dirt paths have worn, varying
verges. The DEM receives broad, cached earth relief on its existing vertices. Roads and land-use
overlays are clipped to those exact terrain triangles, so visible paving cannot bridge a dip while
the paws follow the ground underneath. This adds gentle variation, not exaggerated obstacles to every
street. Buildings and their foundations use the same height field. Small scalloped soil beds ground
city wish trees and flowers; all active beds share one mesh, rebuilt only when their site set changes.

| Control | Location | Purpose |
|---|---|---|
| Paint and detail budgets | `config/mythic.js`, `render/surfaceLibrary.js` | Atlas, cutout, world texture scales, shallow relief, spatial batch size, animation/shadow cadence. |
| Character shading | `ART.subjects`, `render/toon.js` | Soft Phong lighting, modest albedo-preserving fill/key/rim. Optional ink remains disabled. |
| Hero coat and face | `PUP.appearance`, `DOGS.face`, `entities/dog/DogModel.js` | Russet/ivory contrast, faint bind-pose fur grain, explicit blink mask that excludes the nose and muzzle. |
| World shading | `ART.worldFill`, `render/materials.js`, `facadeAtlas.js` | Matte Lambert surfaces, quiet painted stone/brick/timber, thinner facade detail and readable shadow values. |
| Day and night | `ART.sky`, `world/sky/Sky.js` | Warm daylight, peach dusk, blue moonlight and soft fog. Continuous cloud dome and layered sloping ridges replace flat cloud/hill cutouts. |
| Leaves and wind | `NATURE`, `ART.foliage`, `natureGeometry.js`, `natureMaterial.js` | Curved branching trunks, alpha-cutout painted sprays, gentle wind and small luminous buds. Matching cutout depth material prevents rectangular leaf shadows. |
| Street and temple light | `ART.lanterns`, `NATURE.shrines`, `Neon.js`, `Sanctuary.js` | Nearby bulbs and signs, diyos, marigolds, two shared fading light pools. Invalid light candidates are rejected. |
| Atmosphere | `MYTHIC.atmosphere`, `Atmosphere.js`, `ART.petals` | A fixed 16-quad mist pool; small slow petals, incense motes and fireflies near their sources. Near-lens effects fade. |
| Playful exploration | `EXPLORATION`, `gameplay/Exploration.js` | Streamed rounded stones, fallen logs, flowering gardens and gold/blue wish trees near safe discovery locations. E rests on a reachable perch; first visits award a treat and diary entry. |
| Junkiris and touch | `EXPLORATION.firefly`, `Motes.js`, `natureMaterial.js` | At most 168 pooled lights; double-blink pulses, home movement, scattering and return. Grass bends around the pup; footsteps and barking reuse the existing 480-particle FX pool. |
| Post and HUD | `POST`, `ART.vignette`, `styles/` | Restrained bloom and highlight compression; FXAA in the existing composite; quiet brass/ink framing with less screen coverage. |

Colours are authored in sRGB and converted/interpolated in linear light. Tree near/far levels share
stable seeds and use complementary distance fades. Gardens follow support heights and normals;
occupied, wet or steep sites are rejected. Permanent temple diyos remain after festival days.
Warm/cool light pools are an unshadowed bounce-light approximation, limited to two sources shared by
streets and sanctuaries. They do not create new shadow maps.

The regenerated local dog models have fuller chests and haunches, shorter ear tips and quieter coat
markings. Paw planting anchors stance feet within the leg's reach; critically damped springs add bounded
body pitch, head counter-motion and tail lag. Teleports reset secondary motion rather than treating a
district's elevation change as a huge jump. Sit/lie pose transitions release foot planting.

## Stability and performance

Temple brick risers end below the stone treads; the previous coincident top faces produced striped
depth flicker. The Blender script now separates them without changing walkable step heights. Travel
waits for landmark meshes/colliders, resets the old cinematic camera path, warms visible materials and
renders a complete lit frame behind the fade. Startup also warms the visible scene before revealing it.

Building geometry is divided into bounded 128 m batches with shared vertex buffers; distant detail and
landmarks are culled. Alpha-cutout trees stay instanced. Character AI/collisions remain live while distant
people animate at 20/10 Hz; invisible distant rigs avoid unnecessary world-matrix updates. Dynamic
collision bodies use a spatial broad phase. Shadows refresh at 12 Hz. Pausing lets the camera settle,
then redraws the 3D scene at about 2 Hz while the UI continues to respond.

The Intel HD 4600 busy-street sample at 1280×720, low quality and scale 0.6 measured **27.51 actual FPS**,
20.47 ms GPU time (24.61 ms p95), 157 draws and 583,285 triangles with 34 people and 14 vehicles.
Dropping scale to 0.35 measured 30.60 FPS but visibly sacrifices clarity. A separate 1920×1080 run was
slower: 12.71 FPS at scale 0.6, 14.86 FPS at scale 0.4 (23.05 ms GPU at 0.4). Disabling HUD overlays or
bloom did not materially improve that run; removing the depth prepass made it slower. Large windows now
use the same minimum drawing-buffer pixel budget as 720p: minimum 0.6 at 1280×720 or 0.4 at 1920×1080.
The low preset also starts within that reference budget; fixed `?scale=` remains an explicit override.
Final normal-adaptive desktop smoke: 15.04 FPS, 21.55 ms GPU (29.30 ms p95), 148 draws and 563,381
triangles with 34 people and 18 vehicles. The full prologue, five-district clearance audit, hillside
opening and day/dusk/night/storm character review passed; ESLint and all 100 Node regression checks passed.
These are samples, not a guaranteed 30 FPS floor. The 8 ms GPU budget remains unmet on this device.
GPU time is timer-query execution time; it must not be inverted and reported as gameplay FPS.
`tools/frame-profile.mjs` measures actual animation-frame cadence and separate rendered-frame cadence.

### Exploration / terrain update — 16 November 2026

Busy-street runs at 1280×720, low quality and adaptive scale 0.6 measured **13.13–16.95 actual FPS**.
The later run after completing the prologue measured 28.19 ms GPU (37.34 ms p95), 163 draws and 532,953
triangles, with 34 people and 22 vehicles at the state sample. The earlier run measured 29.56 ms GPU,
146 draws and 479,493 triangles, with 34 people and 13 vehicles. The older figures above are historical
and cannot be used as this update's FPS claim. Runs fluctuate and the 30 FPS / 8 ms GPU target is unmet.

The final Ratna Park grove review, including the feathered soil beds and active gameplay systems,
measured **13.37 actual FPS**, 30.91 ms GPU (42.81 ms p95), 125 draws and 396,346 triangles at scale 0.6.
This uses the staged grove camera; it is a separate composition from the street sample.

Profiling isolated expensive overlapping forest foliage. A controlled Ratna Park comparison at fixed
scale 0.66 reduced mean GPU time from 52.59 to 27.52 ms after using fewer leaf sprays, conservative
camera culling and simpler painted distant-tree shading. That isolation experiment preceded the final
terrain clipping changes; it is not a normal-play FPS result. The later busy-street CPU sample spent
about 6.4 ms/frame submitting rendering, 4.0 ms in NPCs, 2.4 ms in traffic, 0.8 ms in world updates and
0.4 ms in gameplay. Costs are inclusive and must not be summed as independent timing categories.

New props stay within 12 nearby garden clusters and three wish trees. Their colliders are removed with
their owner when out of range. Particle counts are fixed, collision probes are staggered, and no extra
real or shadow-casting lights are created. Wish-tree placement retries only when the tile state changes.

## Review

`tools/snaps/art_direction.json` captures day, dusk, night, storm, a close portrait, local coats and the
street cast. `&verifyArt` requires a warm hero and at least 1.5:1 average rendered hero/background
luminance contrast in its dusk/night/storm compositions. Contrast uses the brighter/darker ratio;
a darker warm dog against pale paving is valid. This is a composition regression check, not a text
accessibility score or a guarantee for every view.

`magic.json` reviews ordinary gameplay, trees, temple approaches and diyo detail across the valley.
`tools/art-preview.html` compares saved real-game captures. `check:graphics` covers dog blink masks and
petals; `check:nature` covers geometry, grounding, streaming and lamp budgets; `check:rendering` covers
spatial batching, collision broad phase, finite street lights, mist bounds and shipped temple treads.
Run `clearance.json`, `camera_intro.json`, the busy-street smoke and the full prologue after render or
startup changes. Browser console errors now fail the snapshot run, including shader compilation errors.

`check:exploration` adds five checks for exact paving/terrain contact, frame-rate-independent springs,
actual stone/log mesh-to-collider agreement, all three shipped dog rigs after teleport, and pooled
junkiris. `tools/snaps/exploration.json` moves the real pup controller along the stone approaches at
Ratna Park, Patan and Bhaktapur, claims each wish once, and checks streamed collider cleanup.
`tools/exploration-preview.html` presents this update's real-game captures and controls.

Validation for this update: ESLint and all 105 Node checks passed; the full prologue completed, including
van collision and cleanup. Real-controller climbing/discovery passed in Kathmandu, Patan and Bhaktapur.
The five-location terrain/foundation/camera audit passed with maximum sampled terrain disagreement
below 0.000027 m. Screenshots include the normal camera after reaching a perch, not only staged views.
