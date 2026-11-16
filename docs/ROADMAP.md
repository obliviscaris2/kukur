# Roadmap

## Done (v0.4)
- **Map:** the Kathmandu valley from OSM, with:
  - streamed tiles and real street names
  - parks, ponds and rivers you can swim in
  - compound walls and fences, statues and pillars
  - Rana palaces, roof colours, zebra crossings and neon shop signs
- **Landmarks:**
  - temples and stupas with bells, guardian lions, butter lamps, prayer flags and prayer wheels
  - a golden Pashupatinath
  - far-away beacons on the horizon
- **Wayfinding:**
  - a location plaque and a Skyrim-style discovery banner and stinger
  - the compass and junction signposts
  - a valley map with search, pins and waypoints
- **Pup:**
  - smooth springy movement, variable hop and swimming
  - the senses: sniff mode and dog-eyes colour view
  - blinking, a fur outline, and a Tihar garland earned by being petted
- **Strays:** coat patterns, packs, greetings, a night howl chorus, and racing you for biscuits.
- **People:**
  - storybook characters in Nepali outfits
  - roles: vendors, devotees circling stupas, elders on chautaris, kids, porters, chatting groups
  - moods from kind to cruel (petting, biscuits, shooing, stones)
- **Traffic:** scooters (including two-up), taxis, cars, microbuses, Safa tempos, Sajha buses, trucks and cycle rickshaws, driving on the left.
- **Atmosphere:**
  - a wind field with gusts, streaks and whirlwinds, plus weather and a day/night cycle
  - fireflies, butterflies and dragonflies
  - real CC0 recordings: Kathmandu traffic, crows, monastery chant, bells, conch, rain and thunder

## Done (v0.5, play)
- 3 hearts, fainting and respawning at the last discovered place.
- A dash power move that smashes street clutter. People get cross and give a short chase.
- A Skyrim-style bag with items to find, dig up (by smell), use, give and drop.
- Dog territories: packs with an alpha, lone dogs, scent markers, warn/chase/bite, and bones to befriend them.
- Dense Kathmandu traffic: scooters weave and squeeze past, queues form at junctions, and vehicles can hit you.
- Neon fairy lights and blade signs at night.

## Done (v0.6, play)
- **Climbing:**
  - double hop, wall scramble, auto-mantle onto ledges, crates, chautaris and walls
  - walk along compound walls and roof decks, ride on the roofs of taxis, buses and trucks
  - the camera rises over ledges instead of skimming them; spawn points avoid plinths
- **Kukur Roar** (hold F): a fus-ro-dah shockwave, with an x-ray scan that reveals threats, food, treasure, birds and friends through walls.

## Done (v0.7, look and feel)
- Bloom and an anime-vivid colour grade.
- Facade relief: chajjas, cornices, sills, Newari frames, awnings. Raw brick side walls and rebar.
- Grass and flowers.
- An aerial valley intro with the far city.
- The grimoire: bag, journal tasks, diary, packs, places.
- Temple bells, chautari rests and drinking water.
- A service worker so stale cache can't break the game.

## Done (v0.8, story base)
- `docs/STORY.md`: the plot, characters, structure and a bank of side stories.
- A playable prologue, tested end to end by `tools/snaps/prologue_full.json`:
  - Kukur Tihar night: a diyo ring with marigold petals; Aama calls you (waypoint); a didi walks over, bows, gives tika and a mala, and lays out a feast; you eat, then curl up with the family.
  - The nightmare morning: the van parks on the nearest real road; catchers walk over and drag Aama and Bhai in while you can move; then you chase the van as it drives the road.
  - Waking alone in the square: the discovery banner and the main mission "Where Is Aama?".
  - Reusable cutscene tools: `walkTo`/`stay` for actors, `app.storyCalm`, and the snap `until` step.
- Missions: data-driven, chosen in the grimoire, shown as the waypoint, on the compass and map, and as the HUD objective. 2 main lines and 5 side missions.
- Vets: 4 clinics on the map and compass. E heals you fully.

## Done (v0.9, a living valley)
- **Real elevation:** Swayambhu and Kirtipur hills, the Bagmati gorge, and the Patan and Bhaktapur plateaus. See PIPELINE.md, "Terrain".
- **Floor:** irregular hand-laid paving and old brick courses, with dust, moss and slope tint. The joints fade with distance, so there is no grid look.
- **Camera:** sits closer and lower, at dog's-eye height. Hands off the mouse for 2.5 s and it glides home behind the pup.
- **Traffic:** GTA-style. Vehicles spawn off-screen and retire unseen, and U-turn at dead ends. Vehicle bodies knock the pup back (superseded by footprint-safe lane traffic in the street experience pass below). They brake for people and tilt on slopes.
- **Roar (F):** intent markers (superseded by silver/ember/green behaviour cues below). Only the nearest few show, with a one-line summary.
- **Sniff (Q):** neon wisps that evaporate, a pulse ring showing the radius, and cyan columns over buried treasure. The kind of thing you picked up last smells strongest.
- **Tihar festival** (`world/festival/`, `config/festival.js`):
  - A saved game calendar. Day 0 is Kukur Tihar, then Laxmi Puja and Mha Puja.
  - Diyos on doorsteps, rangoli and Laxmi footprints.
  - Rockets, gamala (flower-pot) fountains and chakra spinners at night. The pup flinches at close bangs.
  - Deusi-Bhailo greetings.
- **Birds** (`entities/npc/Birds.js`): crows on roofs, sparrow flocks, soaring kites, and nests in trees. Pigeons scatter makai and take off in majestic wheeling flights.
- **Cats** (`entities/npc/Cats.js`): stroll, flee, leap onto walls and hiss. Street dogs chase them.
- **Water:** flowing waves, a fresnel sky sheen, glints, rain dimples and night shimmer. `WaterLife` adds fish shadows and leaping fish, floating plastic, ripples, and frogs in the rain.
- **Small joys:** puddle splashes in the rain, plus 7 new journal tasks (cats, flocks, fireworks, nests, frogs, river plastic, puddles).

## Done (player experience)
- Swept whole-body collisions prevent dashes and knockback from crossing thin walls. Street clutter, benches and parked scooters have solid sides.
- Height-limited support queries, downhill ground snapping and ground-anchored contact shadows fix sources of hovering and snapping onto high platforms.
- More grounded jump timing, short take-off anticipation, preserved aerial momentum, normalized animation blends and measured-distance gait timing.
- Player slope posture and four-paw IK preserve the skeleton's limb lengths. Landing bends the legs instead of scaling the whole dog.
- Spring-driven articulated vehicle tumbles, bounded collision-aware knockback and a smooth stand-up recovery.
- Slimmer scooters with seated riders; revised car silhouettes, windows and cabin/bonnet heights. Vehicle contacts separate bodies by size.
- Leaf piles scatter on contact; E pounces into leaves and searches bins/rubbish bags. Cans can be kicked. New journal tasks record these discoveries.
- Bounded shared particle pools for dust, stars, leaves and scraps; empty meshes are hidden.
- Tihar garlands use one instanced draw per dog instead of sixteen separate flower meshes.
- `npm run check:movement` and `tools/snaps/player_feel.json` cover movement, contact, animation and interactions. Browser script failures now return a failing exit status.

## Done (street experience)
- Replaced segment-jumping traffic with continuous metre-based lane movement, sampled turns and a graph connected at internal OSM vertices.
- Width/one-way routing, full vehicle footprint checks, bumper spacing, junction reservations, short-segment traversal, checked return turns and off-screen recycling.
- More moving cars, motorcycles, scooters, taxis, microbuses and buses. A small curbside population of green-jacket ride-hail riders waits, then merges; E greets them.
- Tapered car cabins, individual windows, mirrors and slimmer two-wheelers. Low-preset trim subdivision cuts vehicle triangle counts by roughly half while retaining the same population. Parked scooters are sparse, parallel to the road and placed in clear space.
- Nepal-inspired traffic officers at junctions; E asks for a brief safe crossing and their signals control approaching vehicles.
- Physical shop recesses with counters, shelves, entry steps and friendly keepers. E greets them for a biscuit; G trades coins for food.
- Larger pedestrian population, calmer colours, adult body proportions, curb-following walks, collision bodies and owner-aware movement. Vendor carts use one merged mesh.
- Schoolkids offer a short chase/tag game with a treat and journal reward. Shop entry stairs, chautari approach steps and small compound-wall stair routes are walkable.
- Near-camera dogs and pedestrians fade out of the lens instead of filling the screen with clipped geometry.
- Traffic deflects movable bins/pots instead of crossing their bodies. Existing impact tumbling, climbing and pooled effects are retained.
- `npm run check:traffic` and `tools/snaps/traffic.json` cover traffic and street activity regressions.

## Done (local dogs, intent and homes)
- Rebuilt canine assets as lean local village, Bhote-type and Spitz-mix silhouettes with smaller eyes/heads, longer backs and tapered muzzles. Corrected front elbow direction, leg IK reach/stretch and animation baselines.
- NPC colour cues now follow behaviour: silver neutral wisps, red/orange hostile embers, green potential friends, icy stars while stunned. A single bounded point cloud keeps the cost predictable.
- Charged F staggers nearby attacking people/dogs, interrupts throws/bites, and deflects close stones. It protects bystanders and respects walls, height, cooldown and immunity.
- Added catch-pole patrols with visible attack wind-ups and defensive house guards. Calm guard dogs are neutral, and give a warning before chasing. Roof/water escapes break dog pursuit; walls block stones and bites.
- Procedural house stairwells with open bays, stacked flights, real slab headroom, roof exits and searchable baskets. E knocks/searches; Q guides to entries. Door gifts, discoveries and searches persist.
- Shared generation was checked in Kathmandu, Patan, Bhaktapur and Boudha. New journal tasks reward defensive roars, roof visits and baskets.
- `npm run check:threats` and `tools/snaps/local_life.json` cover the new rules, models, house navigation and cross-city generation.

## Ground contact and camera clearance (2026-11-15)
- Continuous camera-volume sweeps include platform sides, roof rims, temple eaves, vehicles and solid clutter. Final cinematic blends and returns use swept travel, roof detours and eased speed limits.
- Terrain placement/contact now follows the actual rendered triangles. House foundations sample entire perimeters, temple footings merge per tile, compound walls follow short grounded sections, and distant blocks extend into their painted terrain.
- Temple meshes and collisions share their transform. Krishna Mandir side widths, bell archways, step lips, pavilion posts and narrowing stupa domes have matching bounds.
- Jumps and staged mantles respect overhead clearance and side collisions. Small tread rises ease the visible body with exact physical support.
- `npm run check:clearance` and `tools/snaps/clearance.json` cover continuous sweeps, rendered contact, foundation geometry and camera movement across five valley locations.

## Character art, mellow lighting and readable nights
- Natural tan/ivory player coat and rough standard character shading. Heavy character ink is disabled; world light uses a continuous filtered ramp.
- Mineral city/ground palette, separate sky/fog/moon colours, gentle twilight transitions and dimmer night clouds. Removed stacked purple grading and reduced window glare, bloom and vignette.
- Finer, sun-faded facade art, muted foliage, restrained lantern halos and filtered low-preset shadows. FXAA shares the existing composite pass; no extra scene lights or post passes.
- Fixed the blinking nose glitch on all three local dogs using exported eye membership; the nose, jaw and tongue are excluded, and upper-muzzle fur follows the head. Blinks ease closed and open.
- Slow pale blossom in one bounded instanced pool, with more shedding near jacarandas, sparse ambient drift elsewhere, ground settling, wall checks and lens fade. Reduced rectangular wind debris.
- `tools/snaps/art_direction.json` checks low-light hero contrast; `tools/snaps/mellow.json` checks close blinks and three districts. `npm run check:graphics` verifies face geometry and blossom simulation. Tuning is in `docs/ART_DIRECTION.md`.

## Botanical magic and temple warmth
- Sculpted peepal, ashoka, jacaranda, bougainvillea and lime forms: curved trunks, roots, layered folded leaves, shaded interiors and occasional golden peepal foliage.
- Leafy pots, wildflowers and slope-aligned gardens at tree bases. Linear-colour palettes keep green/blue/gold accents distinct, with restrained luminous buds and cool fireflies.
- Permanent temple diyos with open clay bowls, oil, wicks and moving flames; warm light on nearby stone, marigold strings and clear approaches. Street lamps still follow Tihar days.
- World-position seeds fix trees changing orientation as the visible set changes. Near/far crowns fade; distant lamp bowls are culled while flames remain.
- `check:nature`, valley-wide `magic.json` captures and timer-query GPU measurements complement the existing checks. Native merged/instanced geometry uses existing map fields; no map rebuild.

## Done (exploration and surfaces)
- Painted earth, small cobbles, plaster and curved roof tiles, with quieter meadow repeats and worn path edges.
- Broad cached ground relief; roads and area overlays follow the exact terrain triangles used by collision.
- Rounded stepping stones, fallen timber and corrected bench surfaces expand the existing climbing system.
- Gold and blue wish trees near safe discovery locations across the valley. Reach a perch, press E, find a first-visit treat and diary entry; return to rest.
- Junkiris blink, scatter and settle around groves; grass bends and footsteps/barks stir leaves and petals. Fixed pools and no added shadow lights.
- Fuller local dog models, stance-paw anchoring, softer head/body/tail follow-through and stable ears after fast travel.
- Fewer overlapping leaf cards, camera culling and simplified distant foliage reduce forest rendering cost. The weak-GPU 30 FPS target remains unresolved; see ART_DIRECTION.md for actual measurements.

## Next (story)
- Write each chapter's steps in `config/missions.js`, replacing the `locked` steps. New step types go in `Missions.update()` and `#event()`.
- Characters: the Didi (quest giver at Basantapur), Kalu (Asan alpha), the pigeons (gossip), Bandar the monkey (Swayambhu), Dr. Shrestha (vet). Add `role`s in `NpcManager`, or build them as scripted scenes.
- The Van: night patrols. A chase where getting caught means fainting and waking somewhere strange.
- The Breeder's yard and the Chain Man's walled house: handcraft them as special locations (a scene plus props) at fixed lat/lon.

## Next ideas
- **Missions / story** (the original pitch): a dog's view of how humans treat dogs, building toward revenge. Possible pieces:
  - a quest system: `src/quests/`, data-driven like `config/`
  - memories: scripted scenes, built like `IntroScene`
  - a reputation per tole
- **Dog-catcher van** (dark beat): a special vehicle that patrols at night. Damage can reuse the `damage` event.
- **Pack life:** befriended packs follow you on request, help in fights, and hold a nightly gathering.
- **Trading:** coins → momo at vendors (started in `Gameplay.give`), a chappal-return quest chain.
- **Kukur Tihar festival day:** everyone garlands dogs; an event in Weather/TIME.
- **Hunger and food:** scavenging bins and momo stalls; vendors who feed or shoo you.
- **More landmark models:** Swayambhu's shikharas, Krishna Mandir pavilions, Basantapur tower (Nautale), Golden Temple.
- **Sound:**
  - per-vehicle engine loops for the nearest vehicles
  - more bark variety
  - festival music (madal, bansuri) as recordings
- **Mobile:** tune the touch controls and lower the default quality.
- **Saving:** the pup's progress, discovered places and pins. Discovered places and pins already persist in localStorage.
