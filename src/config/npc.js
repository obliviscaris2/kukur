/**
 * People and other strays. Counts are "around the pup" — they spawn on nearby streets and despawn far away.
 */
export const NPC = {
  personModel: 'assets/models/person.glb?shape=artisan-v3',
  people: { max: { low: 36, medium: 48, high: 64 }, spawnRadius: [18, 95], despawnRadius: 125, walkSpeed: [0.85, 1.3], radius: 0.18, height: 1.65, headHeight: 1.53, outline: 0.004, saturation: 0.72, kerbOffset: 0.12 },
  /** Metres from the pup: NPCs closer than `shadow` cast shadows, further than `hide` are not drawn. */
  lod: { shadow: 10, outline: 10, hide: 80 },
  cameraFade: { near: 0.35, far: 0.95, rate: 16 },
  strays: { max: { low: 5, medium: 8, high: 12 }, spawnRadius: [15, 70], despawnRadius: 95 },
  /**
   * Outfits. Colours are picked at random per person for each body region:
   *   top (shirt/blouse/tunic), bottom (trousers/skirt), drape (sari, pallu, waistcoat, robe), accent (sash, tie, hair flower)
   * who: 'man' | 'woman' | 'any' | 'kid'      parts: clothing parts always worn (see pipeline/blender/human.py)
   * hats: 'none' | 'dhaka' | 'cap' | 'shawl'  vest / skirt: chance of a waistcoat / skirt     bald: no hair
   */
  outfits: [
    { name: 'daura', who: 'man', top: ['#f3ede0', '#e8dcc5', '#dfe7ee'], bottom: ['#f3ede0', '#e8dcc5'], drape: ['#2b2d42', '#3d405b', '#22223b', '#5c4033'], accent: ['#f4f1de', '#e9c46a'], hats: ['dhaka', 'dhaka', 'none'], parts: ['Tunic', 'Patuka'], vest: 0.75, weight: 3 },
    { name: 'kurta', who: 'any', top: ['#e63946', '#ff6fa8', '#2a9d8f', '#8d5cf6', '#f4a261', '#ffcc29', '#4ea8de'], bottom: ['#2b2d42', '#f3ede0', '#e9c46a', '#ffffff'], drape: ['#ffcc29', '#ffffff'], accent: ['#ffcc29', '#ffffff', '#e63946'], hats: ['none', 'none', 'shawl'], parts: ['Tunic'], weight: 3 },
    { name: 'sari', who: 'woman', top: ['#ffcc29', '#e63946', '#2a9d8f', '#ffffff', '#6a1b9a'], bottom: ['#e63946'], drape: ['#e63946', '#d81b60', '#ff9f1c', '#6a1b9a', '#00897b', '#ff6fa8', '#c1121f'], accent: ['#ffcc29', '#ff9f1c', '#ffffff'], hats: ['none', 'none', 'shawl'], parts: ['Sari', 'Pallu'], weight: 2.5 },
    { name: 'casual', who: 'any', top: ['#2a5bd7', '#e9c46a', '#264653', '#ffffff', '#e76f51', '#90be6d', '#f15bb5', '#00bbf9'], bottom: ['#1d3557', '#3a3a3a', '#6c584c', '#457b9d'], accent: ['#ffcc29', '#e63946', '#ffffff'], hats: ['none', 'none', 'cap'], parts: [], skirt: 0.25, weight: 4 },
    { name: 'school', who: 'kid', top: ['#ffffff', '#dbe9f6'], bottom: ['#1d3557', '#5c677d', '#7a1c2e'], accent: ['#9b2226', '#1d3557'], hats: ['none'], parts: ['Tie'], skirt: 0.5, weight: 1.5 },
    { name: 'monk', who: 'man', top: ['#8d1b1b'], bottom: ['#8d1b1b'], drape: ['#8d1b1b', '#9b2226'], accent: ['#f4a261'], hats: ['none'], parts: ['Sari', 'Pallu'], bald: true, weight: 0.5 },
    { name: 'catcher', who:'any', top:['#9b946e'],bottom:['#4b5144'],accent:['#6c5d40'],hats:['cap'],parts:['Vest'],weight:0 },
    { name: 'traffic', who: 'any', top: ['#aac7d5'], bottom: ['#263d53'], drape: ['#c3cb76'], accent: ['#283e53'], hats: ['cap'], parts: ['Vest', 'Tie'], bald: true, weight: 0 },
  ],

  skins: ['#f1c27d', '#e0ac80', '#c68b59', '#a8724a', '#d9a066', '#8d5a3b'],
  hairs: ['#1b1b1b', '#2b1d14', '#3d2b1f', '#cfcfcf'],
  /**
   * How people treat dogs (the heart of the game):
   *   kind     pet the pup, wave, sometimes toss a biscuit
   *   neutral  glance and carry on
   *   grumpy   shoo, stamp a foot
   *   cruel    throw a stone (rare — it hurts, and the pup remembers)
   */
  moods: { kind: 0.36, neutral: 0.4, grumpy: 0.18, cruel: 0.06 },
  /** chance that a kind person drops food for the pup */
  feedChance: 0.45,
  /**
   * Roles: what an NPC is doing in the city. `weight` is how common; context multiplies it:
   *   nearTemple  extra weight within 70 m of a temple or stupa (devotees walk clockwise around it)
   *   minDensity  only in busy streets (vendors)
   *   group       spawns 2-3 people together
   */
  roles: {
    walker: { weight: 5 },
    kid: { weight: 1.2, speed: 1.4 },
    porter: { weight: 0.6, speed: 0.75 },
    elder: { weight: 0.9, speed: 0.65 },
    vendor: { weight: 0.35, minDensity: 0.3 },
    shopkeeper: { weight: 0 }, police: { weight: 0 },
    catcher: { weight: 0.38, minDensity: 0.2 },
    chatter: { weight: 0.9, group: [2, 3] },
    devotee: { weight: 0, nearTemple: 7 },
  },
  lines: {
    kind: ['Aija, kukur!', 'Kati ramro!', 'Aww, sano!', 'Khana chahiyo?', 'Mero sano saathi!'],
    feed: ['Le, khaa!', 'Biscuit khaanchhau?', 'Bhok lagyo?'],
    grumpy: ['Hatt!', 'Ja, ja!', 'Hatt kukur!', 'Najik na aa!'],
    cruel: ['Hatt kukur!', 'Bhaag!', 'Lakhatnu parcha!'],
    rain: ['Pani paryo!', 'Chhata kaha cha?'],
    vendor: ['Taja tarkari!', 'Garam momo!', 'Chiya, chiya!', 'Kera, syau!', 'Sasto, sasto!', 'Makai, poleko makai!'],
    kid: ['Kukur! Kukur!', 'Hehe, aija!', 'Mero kukur!', 'Daudaa!'],
    flee: ['Aaaa!', 'Aama!'],
    chat: ['Ke cha?', 'Thikai cha.', 'Khana khanu bhayo?', 'Aja jaam cha.', 'Hijo ko cricket?', 'Ho ra?', 'Kasto garmi!', 'Ani?'],
    devotee: ['Om mani padme hum…', 'Hare Ram…', 'Jai Pashupati…'],
    angry: ['Ey! Kukur!', 'Mero ghaito!!', 'Pakhnus!', 'Ke gareko?!', 'Samata tyo kukur!', 'Ayo ayo!'],
    laugh: ['Hahaha!', 'Hehe, kasto!', 'Feri gara!'],
    police: ['Bistarai, sano saathi.', 'La, bato kaata. Traffic rokeko chu.', 'Pahila hera, ani jau!'],
    shopkeeper: ['Aija, sano! Bhitra hera.', 'Momo ko baasna aayo?', 'La, euta biscuit timilai.'],
    catcher: ['Oi! Pakha!', 'Tyo kukur! Stop there!', 'Hatt!'],
  },
  /** Stray looks: coat pattern weights and chances for white socks, eyebrow dots and a Tihar garland + tika. */
  strayLooks: { patterns: { solid: 3, patches: 2.5, brindle: 1.2, blacktan: 2.5 }, socks: 0.35, brows: 0.3, tihar: 0.25,
    blacktan: [['#1f1a17', '#c98a4b'], ['#2a211c', '#d9a066'], ['#171414', '#b8763c']] },
  strayCoats: [['#2a2420', '#d9c7a8'], ['#d9c9ad', '#f5efe2'], ['#8c6a48', '#e8d6b8'], ['#f2f0ea', '#ffffff'], ['#5b4636', '#c9a27a'], ['#b0703a', '#f1e4cc']],
};

/** Birds other than pigeons (entities/npc/Birds.js). size = metres (body length), flee = how close the pup may get, fly = m/s. */
export const BIRDS = {
  crow: { count: 8, size: [0.5, 0.65], colors: ['#1d1d22', '#2a2a30', '#34343c'], flee: 6, fly: 7, flapSpeed: 16 },
  sparrow: { count: 18, flock: 6, size: [0.2, 0.26], colors: ['#8a6a4a', '#9c7b55', '#6e5038', '#b08a5e'], flee: 4, fly: 6, flapSpeed: 30 },
  kite: { count: 3, size: [1.4, 1.8], colors: ['#6b4a2e', '#7d5838'], flee: 0, fly: 9, flapSpeed: 6 },
  nests: 6,
};

/** Street cats (entities/npc/Cats.js). */
export const CATS = {
  count: 6,
  spawn: [18, 50],               // metres from the pup (and out of the way)
  coats: ['#e8913a', '#f0a24e', '#2a2a2e', '#f4f1ea', '#8a8f99', '#c9b49a', '#5a4636'],
  flee: 5,                       // the pup this close (or a stray chasing) → run!
  run: 5.2, walk: 0.9,
  climb: 2.6,                    // highest wall/roof edge a cat jumps onto to escape
  dogChase: 9,                   // strays notice a cat this close
};
