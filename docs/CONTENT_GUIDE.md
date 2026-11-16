# Content guide: changing the game yourself

Most changes are edits to plain data in `src/config/`. Save the file and reload the browser; no build step is needed. Run `npm run lint` afterwards to catch typos.

## Quick reference

| I want to change… | File |
|---|---|
| House paints, roof colours, shop bands, prayer-flag colours, road and water colours | `src/config/palette.js` |
| Park, forest, farmland, plaza and other ground colours and patterns; trees per park | `src/config/ground.js` |
| Weather presets, day length, rain amount, flying leaves | `src/config/weather.js` |
| Pup speeds, jump, stamina, tail wag, ears, camera | `src/config/pup.js` |
| Number of people and strays, outfits, skin and hair colours, moods, Nepali lines | `src/config/npc.js` |
| Draw distance, shadows, prop density per quality level | `src/config/quality.js` |
| Key bindings and the help text | `src/config/controls.js` |
| Start point, hills, extra fast-travel points, hand-placed landmarks | `src/config/world.js` |
| Famous places on signposts, compass, horizon beacons and the map's "Mark a place" list; banner and compass behaviour | `src/config/places.js` |
| NPC roles (vendors, devotees, elders…), outfits, how people treat dogs, Nepali speech lines | `src/config/npc.js` |
| Traffic: how many vehicles, type mix, speeds, colours | `src/config/traffic.js` |
| Menu and HUD look | `styles/menu.css`, `styles/hud.css`, theme variables in `styles/base.css` |

## Recipes

### Add a fast-travel / start point
In `src/config/world.js` → `extraStarts`, add `{ name: 'Kirtipur', lat: 27.6786, lon: 85.2775 }`. It appears in the Start location menu and on the M map. To make it the default, set `defaultStart` to its name.

### Add a famous place (signposts, compass, beacon)
In `src/config/places.js` → `DESTINATIONS`, add `{ name: 'Kopan', ne: 'कोपन', lat: 27.7428, lon: 85.3624, icon: 'stupa' }`. Signposts at junctions pointing that way will start naming it. To make it visible from far away, add `beacon: 'stupa_small', size: 12` (any temple model name).

### Change how people treat the pup
In `src/config/npc.js`:
- `moods` are the odds of kind, neutral, grumpy and cruel people.
- `feedChance` is how often kind people toss a biscuit.
- `roles` sets how common each role is: walker, kid, porter, elder, vendor, chatter, devotee. Context matters: devotees only appear near temples, and vendors only on busy streets.
- `lines` holds everything people say, in romanised Nepali.

### Dress people differently
Each `outfits` entry in `src/config/npc.js` lists colours for each body region and which clothing `parts` are always worn:
- **Regions:** top, bottom, drape (sari, pallu, waistcoat, robe), accent (sash, tie, hair flower).
- **Parts:** Tunic, Patuka, Vest, Sari, Pallu, Skirt, Tie.
- **Other fields:** `hats` (dhaka, cap or shawl), plus `vest` and `skirt` chances.

Hair follows from `who`: men get short hair, women a bun or braid. To add a new garment shape, model it in `pipeline/blender/human.py`, add it to `PART` there and to `PARTS` in `entities/npc/Person.js`, then run `npm run assets:people`.

### More or less traffic
In `src/config/traffic.js`:
- `max` sets how many vehicles are around the pup at each quality level.
- `mix` sets how common each type is.
- `speed` is in m/s.

Narrow lanes only get scooters.

### Tune how movement feels
In `src/config/pup.js`:
- `accel`/`decel` are easing rates.
- `inputSmoothing` controls how soft key taps feel.
- `turnStiffness` and `turnResponse` control turning arcs.
- `jumpCut`, `apexGravity` and `fallGravity` shape the hop arc.
- `camera.lookSmoothing`, `followLag`, `lookAhead` and `sprintPullback` shape the camera.

### Change or add a sound
1. Find a CC0 sound: `python3 pipeline/audio/freesound_search.py "temple bell"`.
2. Put its id under a key in `pipeline/audio/sounds.json` (modes: `oneshot`, `segments`, `loop`).
3. Run `npm run assets:audio`.
4. Play it anywhere with `audio.play('key', { vol, pos, reverb })`.

Ambience levels are mixed in `Audio.update()` (`src/core/audio.js`).

### Dress the dogs
In `src/config/npc.js` → `strayLooks`, set the pattern weights (`solid`, `patches`, `brindle`, `blacktan`) and the chances of white socks, eyebrow dots, and a Tihar garland with tika. The options are documented in `entities/dog/DogModel.js`. The pup earns its garland after being petted 3 times (`App.#wireEvents`).

### Add a bag item
1. Add it to `src/config/items.js` with: name, Nepali name, an emoji icon, a description, and a use (`heal`, `gift`, `throw`, `wear` or `ring`).
2. To make it appear in the world, add its id to a `PICKUPS.table` list in `src/config/gameplay.js`, or to a breakable's `loot`.
3. For a brand-new kind of use, add a branch in `Gameplay.use()`.

### Make the city more (or less) chaotic
- **Traffic:** `TRAFFIC.max` and `mix` in config/traffic.js.
- **Crowds:** `NPC.people.max` in config/npc.js.
- **Clutter to smash:** `BREAKABLES.perStreet` and `kinds`.
- **Dog territories:** `TERRITORY.chance`, `radius` and `packShare`.
- **Damage and hearts:** `HEALTH`.
- **Dash:** `DASH`.

### Make the pup climb more (or less)
In `src/config/pup.js`:
- `mantleGround` and `mantleAir`: how high a ledge it pulls itself onto, from the ground or from the air.
- `doubleJump`: the mid-air hop.
- `scramble`: the boost from pawing up a wall.
- `airControl`: steering in mid-air.

To make a new moving thing standable, push a height function into `world.physics.dynamic` (see `Traffic.js` and `Breakables.js`).

### The Kukur Roar (hold F)

Intent is defined in `gameplay/disposition.js`, with colours/ranges in `THREATS`. A damaging attack or clear wind-up is hostile; grumpy shooing and calm territory dogs are neutral. Use the existing actor `stun(seconds)` contract for a new attack-capable creature. Charged roars stagger nearby hostiles with line-of-sight/height checks and leave bystanders alone. `DispositionAura` is one capped point cloud; avoid adding a mesh or emitter per NPC.

House interaction data comes from `buildTile` → `houses`; plan geometry in `HouseStairs`, then rules/prompts in `Rooftops`. Keep stacked treads’ collision `base` aligned with the visible underside so the lower flight has headroom. Use the same seeded generator for all regions.

### Add a task or a story chapter
In `src/config/quests.js`, a task is `{ id, title, desc, event, count, where?, reward: [item, n] }`. The event is one of:
- `discover`, `befriend`, `smash`, `pickup`, `ride`, `roar`, `petted`, `swim`, `chased`, `stun`, `roofVisit`, `roofCache`

To add a new event, emit it with `events.emit(...)`; Journal subscribes automatically to events named by tasks. Chapters are listed as sealed story pages until missions arrive. Diary lines for "first time" moments are in `FIRSTS` in `Journal.js`.

### Colours and glow
- **Paints and roofs:** `PALETTE` in config/palette.js. Keep buildings natural; let flags, signs and neon carry the loud colours.
- **Bloom and grade:** `POST` in config/quality.js.
- **Sky colours:** the `PAL` table at the top of `world/sky/Sky.js`.

### Neon at night
`src/world/effects/Neon.js` controls the fairy-light strings across lanes and the blade signs. Edit the `BULB` and `SIGN` colour lists, or the spacing and odds in `#generate()`. Only busy tiles (density > 0.3) get neon.

### Tune the wind
Each weather preset's `wind` (config/weather.js) sets the strength. The gust speed is `GUST_SPEED` in `world/sky/Wind.js`, and `windGust` in `render/toon.js` must use the same number. How much things sway is set by the GLSL in `WIND` (toon.js): `tree`, `flag`, `cloth`.

### Add a weather type
1. In `src/config/weather.js`, add an entry to `WEATHERS`. The comment at the top explains every field.
2. Add its key to `WEATHER_ORDER` so **R** cycles through it.

`weight` controls how often it is picked automatically. `morningOnly: true` limits it to early hours.

### Make a day longer or shorter
`TIME.speed` in `src/config/weather.js` is game hours per real second. `1/60` gives a 24-minute day.

### Change NPC clothes or add an outfit
In `src/config/npc.js` → `outfits`, each outfit lists candidate colours for `top`, `bottom` and a `hat` (`'none' | 'dhaka' | 'cap' | 'shawl'`). Optional flags: `kid: true` makes a smaller and faster person, and `bald: true` removes the hair. `weight` sets how common the outfit is. Speech lines are in `lines`.

### More or fewer people and dogs
`NPC.people.max` and `NPC.strays.max` are per quality level. `NPC.lod` sets how close an NPC must be to cast a shadow, and how far away it disappears.

### Recolour or re-pattern a ground theme
In `src/config/ground.js` → `AREA_STYLE`:
- `a` and `b` are the two colours the pattern alternates.
- `pattern` is one of 0 grass, 1 forest floor, 2 paddy rows, 3 water, 4 stone plaza, 5 sand, 6 pitch stripes, 7 parking.
- `trees` is trees per m², and `flowers` is flower density.

Adding a brand-new kind also needs the OSM pipeline (see PIPELINE.md): append it to `AREA_KIND` in `build_tiles.py` and to `AREA_KINDS` here, in the same order.

### Tune how the pup feels
In `src/config/pup.js`:
- `speeds` and `accel`/`decel` control responsiveness.
- `turnRate` sets how sharply it turns.
- `jumpVelocity` and `gravity` set the hop.
- `procedural` holds the tail, ear and head layers.

If you change a gait speed, keep the matching `gaits` row in step. The stride length (metres per animation cycle) stops the feet from sliding.

### Hand-place a landmark that OSM doesn't map well
In `src/config/world.js` → `extraLandmarks`, add `{ name, lat, lon, model, size }`. `model` is any file name in `assets/models/temples/` (without `.glb`) or `'tower'`.

### Recolour temples
`COLORS` at the top of `src/world/landmarks/Landmarks.js` maps the material names used in Blender (Brick, Stone, Wood, WoodRed, Roof, Gold, Plaster, Dark) to toon colours.

### Write a new cinematic scene
Copy `src/scenes/IntroScene.js`. A scene is an async script built from three helpers:

```js
await this.shot(fromPos, toPos, lookFrom, lookTo, seconds); // camera move (eased)
await this.card('<h2>Asan Tole</h2><p>Market day</p>', 3);   // title card
await this.wait(1.5);                                        // pause
pup.startPose('Sit', 2);                                     // any pup clip: Sit, Lie, PlayBow, Shake, Howl…
```

Start it from `App.play()` the same way the intro is started. Every helper resolves instantly when the player skips.

### React to something the pup does
Subscribe to an event (list in ARCHITECTURE.md), for example in `App.#wireEvents()`:

```js
events.on('bark', (pos) => { /* scare a cat, open a mission, … */ });
```

### Add a new idle behaviour or pose to the pup
1. Animate the clip in `pipeline/blender/pup.py` (see the `Sit`, `PlayBow` and `Howl` functions) and run `npm run assets:pup`.
2. Trigger it from `Pup.#behaviour()` with `this.startPose('MyClip')`.

### Add a menu screen
`src/ui/Menu.js` builds each view in `#render(view)` from plain DOM (`btn()`, `el()`). Add a branch for your view and a button that calls `this.#render('myView')`.

## Things to avoid
- Don't hand-edit `assets/map/tiles/*.json` or `assets/models/*.glb`; they are regenerated. Change the pipeline script instead.
- Keep `AREA_KINDS` (JS) and `AREA_KIND` (Python) in the same order.
- On weak GPUs, shadows and skinned characters are the expensive parts. Raise NPC counts carefully, and check with **F3**.
