/** Street activity, real shop recesses, entrance steps and small climbing routes. */
export const STREET_LIFE = {
  shops: { chance: 0.48, maxPerTile: 5, width: 2.25, depth: 1.7, opening: 2.25, floorRise: 0.28, counterHeight: 0.72 },
  stairs: { rise: 0.14, run: 0.42, width: 1.15, maxEntryRise: 0.7 },
  parkedBikes: { gap: [28, 52], chance: 0.2 },
  parkour: { maxPerTile: 2, chance: 0.3, width: 0.85, rise: 0.16, run: 0.42 },
  houses: { chance: 0.38, maxPerTile: 3, maxHeight: 9, rise: 0.16, run: 0.42, width: 0.85, landing: 1.0, offset: 0.2, headroom: 1.8, interactRadius: 1.6, loot: ['biscuit', 'coin', 'ball'] },
  police: { max: { low: 2, medium: 3, high: 4 }, phase: 9, crossing: 6, radius: 12, spawnRadius: [18, 115], spacing: 60, kerbInset: 0.24, approaches: [4.5, 7, 10] },
  shopkeepers: { max: { low: 6, medium: 8, high: 10 }, interactRadius: 2.6, giftCooldown: 40 },
  chase: { seconds: 20, warmup: 2, tagDistance: 1.7, runSpeed: 2.4 },
};
