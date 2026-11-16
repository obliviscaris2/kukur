/**
 * Things the pup can carry in its bag (I). Add new items here; give them a use:
 *   heal: n        hearts restored when used (eaten)
 *   gift           can be offered to a dog (G) — bones win over territorial dogs
 *   throw          used = thrown forward; dogs chase it
 *   wear           used = put on (cosmetic)
 *   ring           used = rings out (calls friendly dogs over)
 */
export const ITEMS = {
  bone: { name: 'Bone', ne: 'हड्डी', icon: '🦴', desc: 'A proper bone. Territorial dogs will let you into their streets for one of these.', gift: true, max: 9 },
  biscuit: { name: 'Biscuit', ne: 'बिस्कुट', icon: '🍪', desc: 'A Glucose biscuit. Restores one heart.', heal: 1, gift: true, max: 9 },
  momo: { name: 'Momo', ne: 'मःम', icon: '🥟', desc: 'Steamed, still warm. Restores two hearts.', heal: 2, max: 9 },
  selroti: { name: 'Sel roti', ne: 'सेल रोटी', icon: '🍩', desc: 'Sweet festival ring bread. Restores all hearts.', heal: 3, max: 5 },
  ball: { name: 'Ball', ne: 'बल', icon: '🎾', desc: 'Throw it! Friendly dogs love a chase.', throw: true, max: 3 },
  marigold: { name: 'Marigold mala', ne: 'सयपत्री माला', icon: '🌼', desc: 'Wear it for a Tihar blessing glow.', wear: true, max: 5 },
  chappal: { name: 'Chappal', ne: 'चप्पल', icon: '🩴', desc: 'Someone is hopping around missing this. A fine trophy.', max: 20 },
  coin: { name: 'Coin', ne: 'सिक्का', icon: '🪙', desc: 'Shiny! People drop these everywhere.', max: 99 },
  bell: { name: 'Temple bell', ne: 'घण्टी', icon: '🔔', desc: 'A tiny brass bell. Ring it to call friendly dogs.', ring: true, max: 3 },
};
