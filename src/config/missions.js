/**
 * Missions (pick one in the grimoire → it's marked on the map/compass and tracked on the HUD).
 * Step types:
 *   { type: 'reach', place: 'Asan' | lat, lon, r?, text }     go somewhere (place = a DESTINATIONS/VETS name)
 *   { type: 'collect', item, count, text }                    have N of an item in the bag
 *   { type: 'event', event, count?, where?, text }            do something N times (events: roar, befriend, bell, vet,
 *                                                             give, smash, pickup, petted, swim, ride, discover)
 *   { type: 'locked', text }                                  story continues in a future update
 * main: true = story line. reward: [itemId, n].
 */
export const MISSIONS = [
  { id: 'aama', main: true, title: 'Where Is Aama?', ne: 'आमा कहाँ?', desc: 'The van took Aama. Her scent is still on the wind… follow it.', reward: ['bone', 1], steps: [
    { type: 'event', event: 'roar', text: 'Roar (hold F) to sense what\'s around you' },
    { type: 'reach', place: 'Asan', r: 30, text: 'The Asan pigeons see everything — go to Asan' },
    { type: 'event', event: 'befriend', text: 'Win the trust of a pack (offer a bone with G) — dogs talk' },
    { type: 'reach', place: 'Ratna Park', r: 40, text: 'Kalu says the van parks near Ratna Park at dawn' },
    { type: 'locked', text: 'The trail goes cold here… (Chapter I continues soon)' } ] },
  { id: 'bhai', main: true, title: 'Bhai\'s Chain', ne: 'भाइको साङ्लो', desc: 'Bhai was sold. Someone in Thamel heard him crying on a rooftop.', reward: ['bone', 1], steps: [
    { type: 'reach', place: 'Thamel', r: 40, text: 'Go to Thamel and listen' },
    { type: 'event', event: 'ride', text: 'Ride a vehicle roof — you\'ll see the rooftops from up there' },
    { type: 'reach', place: 'Narayanhiti', r: 50, text: 'Rich houses with high walls… search near Narayanhiti' },
    { type: 'locked', text: 'A chain rattles behind a wall… (Chapter II continues soon)' } ] },
  { id: 'momo', title: 'The Momo Didi', ne: 'मःम दिदी', desc: 'The momo didi at Basantapur trades food for shiny things.', reward: ['momo', 2], steps: [
    { type: 'collect', item: 'coin', count: 3, text: 'Find 3 coins (smash pots, sniff around)' },
    { type: 'reach', place: 'Basantapur', r: 35, text: 'Bring them to Basantapur' },
    { type: 'event', event: 'give', where: 'coin', text: 'Give a coin to a vendor (G)' } ] },
  { id: 'chappal', title: 'The Chappal Thief', ne: 'चप्पल चोर', desc: 'Every dog\'s favourite crime. Every human\'s least favourite.', reward: ['selroti', 1], steps: [
    { type: 'collect', item: 'chappal', count: 1, text: 'Find a chappal lying around' },
    { type: 'event', event: 'give', where: 'chappal', text: 'Return it to someone (G) — they\'ll reward you' } ] },
  { id: 'kora', title: 'Boudha Kora', ne: 'बौद्ध कोरा', desc: 'Pilgrims walk clockwise around the great stupa. Join them.', reward: ['bell', 1], steps: [
    { type: 'reach', place: 'Boudha', r: 70, text: 'Go to the great stupa at Boudha' },
    { type: 'event', event: 'bell', text: 'Ring a temple bell (E near a temple)' } ] },
  { id: 'vet', title: 'Dr. Shrestha', ne: 'डाक्टर श्रेष्ठ', desc: 'There\'s a vet who helps street dogs. Good to know where.', reward: ['biscuit', 2], steps: [
    { type: 'reach', place: 'Central Veterinary Hospital', r: 30, text: 'Find the Central Veterinary Hospital in Tripureshwor' },
    { type: 'event', event: 'vet', text: 'Get checked by the vet (E)' } ] },
  { id: 'pigeons', title: 'Pigeon Gossip', ne: 'परेवाको गफ', desc: 'The Kasthamandap pigeons know things. But first they need a scare.', reward: ['marigold', 1], steps: [
    { type: 'reach', place: 'Basantapur', r: 40, text: 'Go to the temple square at Basantapur' },
    { type: 'event', event: 'roar', text: 'ROAR and watch the whole flock lift off' } ] },
];
