# KUKUR — Story bible

## Premise
A street pup in the Kathmandu valley loses its family on the morning after Kukur Tihar, the festival when the
city worships its dogs. The game is a dog's view of humans: their kindness and their cruelty, often in the same
street on the same day. The tone is whimsical and warm on the surface, with darker currents underneath.

## Characters
| Who | What |
|---|---|
| **Khairey** (the player) | A ginger pup. Curious, brave, a little clumsy. Grows from scared pup to street legend. |
| **Aama** (mother) | A cream street dog with a torn ear. Gentle, wise. Taken by the van; ends up with **the Breeder**. Finding her is **Main line A**. |
| **Bhai** (brother) | A black-and-tan pup, bolder than Khairey. Sold to **the Chain Man**. Finding him is **Main line B**. |
| **The Van** | A white dog-catcher van that prowls before dawn. Recurring dread. |
| **The Breeder** | Runs a filthy backyard breeding operation on the city's edge. Final boss of line A (outsmarted, not fought). |
| **The Chain Man** | A rich man in a walled house who keeps Bhai on a chain on the roof. Line B ends in a rescue. |
| **Didi of Basantapur** | A momo-stall owner who feeds strays. A safe place and a quest-giver. |
| **Dr. Shrestha** | The vet at the Central Veterinary Hospital. Heals you; later helps the rescue. |
| **Kalu** | Alpha of the Asan pack. Hostile at first; becomes an ally after "Bone Diplomacy". |
| **Pigeons of Kasthamandap** | Gossips who see everything. Comic relief and clue-givers (they only talk if you DON'T scatter them). |
| **Bandar** (a monkey of Swayambhu) | Trickster who steals your items, then trades information. |

## Structure
1. **Prologue: Kukur Tihar night** (`scenes/PrologueScene.js`)
   - It is playable: you receive a tika and a marigold mala, eat the feast, and curl up between Aama and Bhai.
2. **The Morning:** a hazy, desaturated nightmare start, like the opening of Saving Private Ryan. Muffled sound and a heartbeat.
   - The van takes Aama and Bhai. You chase it and lose.
   - You wake alone in Basantapur square, and the open world begins.
3. **Main line A, "Where is Aama?":** scents, pigeon gossip, the bus park, the breeder's yard.
4. **Main line B, "Bhai's Chain":** Thamel and Lazimpat, rooftops, the walled house, the rescue.
5. **Finale:** both lines meet; the family is reunited at the next Kukur Tihar.

Between them there are **hundreds of mini-stories**: side missions, the ten-second moments of a dog's life.

## Mini-story ideas (side missions)
- **The Momo Didi:** bring her 3 coins and she gives you momos.
- **The Chappal Thief:** steal a chappal, then return it for a reward.
- **Pigeon Patrol:** keep the Basantapur pigeons calm (no barking) while an old man feeds them.
- **Boudha Kora:** walk clockwise around Boudha with the pilgrims and ring the prayer wheels.
- **Fetch with the Schoolkids:** throw the ball near a school group.
- **Monsoon Puppy:** carry a lost puppy out of the rain to a dry chautari.
- **Rooftop Kite Day:** chase kites across the rooftops during Dashain.
- **The Vet Visit:** take an injured stray to Dr. Shrestha.
- **Night Shift:** guard a momo stall from a rival pack until dawn.
- **Holi Chaos:** a coloured-powder festival day. Your coat changes colour.

## Mission system (built)
Missions are data in `src/config/missions.js` and are run by `gameplay/Missions.js`.
- **Choosing:** pick one in the grimoire (J → Missions). Its current objective is marked with a light column, on the compass and on the map, and shown on the HUD.
- **Step types:**
  - `reach`: a place name or lat/lon, plus a radius
  - `collect`: hold N of an item
  - `event`: any game event N times, e.g. `roar`, `befriend`, `bell`, `vet`, `give`, `smash`
  - `locked`: "to be continued" (story not built yet)
