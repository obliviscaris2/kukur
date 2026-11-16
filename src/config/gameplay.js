/**
 * Gameplay rules: hearts, dash, breakables, pickups, territories. All numbers are tunable here.
 */
export const HEALTH = {
  hearts: 3,
  /** seconds of invulnerability after taking a hit */
  invulnerable: 1.4,
  /** regenerate one heart after this many seconds without damage */
  regenAfter: 35,
  damage: { stone: 1, vehicle: 1, bite: 1 },
};

export const DASH = {
  speed: 11, seconds: 0.32, cooldown: 1.1, stamina: 0.28,
  /** radius around the pup that knocks things over while dashing */
  reach: 0.9,
};

export const BREAKABLES = {
  /** objects per 100 m of street, scaled by how busy the tile is */
  perStreet: 7, maxPerTile: 140, buildRadius: 70,
  /** how long a smashed thing stays gone (seconds) */
  respawn: 240,
  /** people within this distance get cross when something breaks */
  angryRadius: 14,
  /** chance that a smashed thing drops something for the bag */
  lootChance: 0.25,
  searchCooldown: 24, leafCooldown: 0.65, leafBurst: 18,
  kinds: {
    pot: { weight: 4, color: '#c46a3d', size: 0.45, height: 0.45, mass: 1, breaks: true, loot: ['coin', 'marigold'] },
    potStack: { weight: 1.2, color: '#b65b33', size: 0.45, height: 1.1, mass: 2, breaks: true, loot: ['coin'] },
    crate: { weight: 2.5, color: '#a77a45', size: 0.55, height: 0.46, mass: 2, breaks: true, loot: ['momo', 'biscuit', 'ball'] },
    bin: { weight: 2, color: '#e67e22', size: 0.55, height: 0.75, mass: 3, breaks: false, searchable: true, label: 'Rummage in the bin', loot: ['bone', 'chappal', 'coin'] },
    basket: { weight: 2, color: '#d9a066', size: 0.5, height: 0.34, mass: 1, breaks: true, loot: ['marigold', 'selroti'] },
    chair: { weight: 1.5, color: '#2a9d8f', size: 0.5, height: 0.9, mass: 1.5, breaks: false, loot: [] },
    bucket: { weight: 1.5, color: '#3a86ff', size: 0.34, height: 0.33, mass: 1, breaks: false, loot: [] },
    garbageBag: { weight: 2.2, color: '#3b4851', size: 0.5, height: 0.5, mass: 0.8, breaks: false, searchable: true, label: 'Investigate the rubbish', loot: ['biscuit', 'bone', 'coin', 'chappal'] },
    can: { weight: 2, color: '#e85944', size: 0.14, height: 0.23, mass: 0.25, breaks: false, loot: [] },
    leafPile: { weight: 1.8, color: '#c68b3e', size: 1, height: 0.12, mass: 0.2, soft: true, breaks: false, searchable: true, label: 'Pounce into the leaves', loot: ['marigold', 'coin', 'ball'] },
  },
};

export const PICKUPS = {
  /** world items per tile (deterministic) and how many of them only show up when sniffing */
  perTile: 6, hiddenShare: 0.4, pickRadius: 1.1, buildRadius: 80,
  /** what turns up where */
  table: {
    street: ['coin', 'chappal', 'ball', 'biscuit', 'bone'],
    park: ['bone', 'ball', 'marigold', 'bone'],
    temple: ['marigold', 'bell', 'selroti', 'coin'],
  },
};

export const TERRITORY = {
  /** chance that a tile hosts a territory, and its size */
  chance: 0.22, radius: [22, 40],
  /** 'pack' (alpha + members) or 'lone' */
  packShare: 0.6, packSize: [2, 4],
  /** seconds you can linger inside before they chase; how far they chase past the edge */
  graceSeconds: 4, minimumWarning: 1.4, chaseBeyond: 1.25, biteCooldown: 1.3,
  /** bandana colours for packs */
  colors: ['#e63946', '#3a86ff', '#ffbe0b', '#8338ec', '#06d6a0', '#fb5607', '#ff006e'],
  names: ['Bandits', 'Rascals', 'Sentinels', 'Rogues', 'Gang', 'Guardians', 'Rovers', 'Mob', 'Crew'],
  loneNames: ['Kalu', 'Bhote', 'Khairi', 'Seti', 'Tiger', 'Moti', 'Jhyape', 'Bhusuk', 'Laure', 'Chhirke'],
};

/** "Kukur Roar" (hold F): a fus-ro-dah bark that shoves things and reveals what's around, through walls. */
export const SCAN = {
  charge: 0.9,        // seconds of holding F before it fires
  cooldown: 8,
  radius: 60,         // how far it reveals (m)
  push: 8,            // how far it physically shoves clutter
  waveSpeed: 45,      // m/s the ring travels
  show: 6,            // seconds markers stay up
  maxMarks: { danger: 6, neutral: 5, good: 8 },   // behaviour, not an NPC's permanent mood
  marker: { min: 12, max: 32, scale: 220, brightness: 1.15 },
};

/** Q — the nose (entities/pup/Senses.js + gameplay/Pickups.js). */
export const SNIFF = {
  radius: 45,        // how far smells reach (m); buried things inside it glow while you sniff
  pulseTime: 1.1,    // seconds for the pulse ring to roll out to the radius
};
