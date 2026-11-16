/**
 * World & streaming settings. Distances are metres. The map itself lives in assets/map (see docs/PIPELINE.md).
 */
export const WORLD = {
  mapUrl: 'assets/map/',
  tileSize: 256,
  /** Where a new game begins (a key of the start list: manifest starts + extraStarts below). */
  defaultStart: 'Basantapur, Kathmandu',
  /** Extra start / fast-travel points. Add {name, lat, lon} here — no map rebuild needed. */
  extraStarts: [
    { name: 'Swayambhu', lat: 27.71490, lon: 85.29200 },
    { name: 'Pashupatinath', lat: 27.71040, lon: 85.34870 },
  ],
  /** Real valley relief from the DEM (pipeline/terrain/build_terrain.py). 1 = true heights; a little more reads better. */
  terrain: { exaggerate: 1.15, meshSegments: 24,
    relief: { height: .7, span: 48, detail: .12, detailSpan: 18, cache: 8192 } },
  /** Buried footings follow the sampled ground around the entire footprint. */
  foundations: { sampleSpacing: 2, embed: 0.18, wallSegment: 4 },
  /** Conservative camera volumes for pitched roofs; generated alongside their visible geometry. */
  roofSlices: 4,
  /** Extra artistic bumps on top of the DEM: [{ name, lat, lon, radius, height }]. The DEM already has Swayambhu & Kirtipur. */
  hills: [],
  /** Hand-placed landmarks that are not (well) mapped as temple footprints. */
  extraLandmarks: [
    { name: 'Dharahara', lat: 27.70040, lon: 85.31210, model: 'tower', size: 10 },
  ],
};
