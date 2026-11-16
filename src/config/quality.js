/**
 * Graphics presets. 'auto' picks low for integrated GPUs (Intel HD/UHD, mobile) and medium otherwise.
 * Every number here trades looks for speed.
 */
export const QUALITY = {
  low: {
    pixelRatio: 0.8, maxPixelRatio: 1.0, shadowMap: 1024, shadowType: 'basic', shadowRange: 24, buildingShadows: true,
    streamRadius: 380, fogScale: 0.62, props: { treesNear: 32, treesFar: 150, flags: 90, small: 70, roof: 95, poles: 130 }, npc: 'low',
  },
  medium: {
    pixelRatio: 1.0, maxPixelRatio: 1.25, shadowMap: 2048, shadowType: 'pcf', shadowRange: 32, buildingShadows: true,
    streamRadius: 520, fogScale: 0.85, props: { treesNear: 55, treesFar: 210, flags: 120, small: 95, roof: 150, poles: 180 }, npc: 'medium',
  },
  high: {
    pixelRatio: 1.25, maxPixelRatio: 2.0, shadowMap: 2048, shadowType: 'pcfsoft', shadowRange: 38, buildingShadows: true,
    streamRadius: 650, fogScale: 1.0, props: { treesNear: 90, treesFar: 260, flags: 140, small: 120, roof: 180, poles: 220 }, npc: 'high',
  },
};

/** Minimum scale is relative to a 720p pixel budget, so a large desktop can shed the same GPU load. */
export const ADAPTIVE = { lowFps: 28, highFps: 52, minScale: 0.6, referencePixels: 1280 * 720, step: 0.07, every: 2.5 };

/** Restrained lantern bloom and a soft highlight shoulder. Can be disabled on slower GPUs. */
export const POST = { enabled: true, antialias:true, bloom: 0.3, threshold: 0.95, nightThreshold: 0.55, nightBloom: 1.45, vibrance: 0.015, contrast: 1.0, filmic: 0.35 };

/** All action effects share these fixed pools and materials, regardless of how many objects are disturbed. */
export const PARTICLES = { capacity: 480, ripples: 20, maxBurst: 32 };
