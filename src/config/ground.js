/**
 * Ground themes. AREA_KINDS must match the order in pipeline/osm/build_tiles.py (AREA_KIND).
 * Each kind maps to a colour pair + a procedural pattern used by the ground shader:
 *   0 grass, 1 forest floor, 2 paddy rows, 3 water, 4 stone plaza, 5 sand/dirt, 6 sports pitch stripes, 7 parking
 */
export const AREA_KINDS = ['park', 'grass', 'forest', 'farmland', 'water', 'plaza', 'sand', 'pitch', 'cemetery', 'scrub', 'parking', 'garden', 'orchard', 'wetland'];

export const AREA_STYLE = {
  park: { a: '#567d65', b: '#91aa79', pattern: 0, trees: 0.022, flowers: 0.02 },
  garden: { a: '#496e60', b: '#9fb681', pattern: 0, trees: 0.03, flowers: 0.05 },
  grass: { a: '#718768', b: '#a5b484', pattern: 0, trees: 0.004 },
  forest: { a: '#345b50', b: '#668265', pattern: 1, trees: 0.05 },
  farmland: { a: '#9ccc4f', b: '#c7dd6a', pattern: 2, trees: 0.0006 },
  orchard: { a: '#86c15a', b: '#a6d46b', pattern: 2, trees: 0.02 },
  water: { a: '#4fb3e8', b: '#7fd0f5', pattern: 3 },
  wetland: { a: '#6fb7a6', b: '#8fd0b0', pattern: 3, trees: 0.002 },
  plaza: { a: '#bbb3a1', b: '#d2c7af', pattern: 4 },
  sand: { a: '#d9b98a', b: '#e6c99e', pattern: 5 },
  scrub: { a: '#a9c46a', b: '#c2d37e', pattern: 5, trees: 0.006 },
  pitch: { a: '#5fbf4f', b: '#74cc61', pattern: 6 },
  cemetery: { a: '#8fbf6a', b: '#a3cc7c', pattern: 0, trees: 0.01 },
  parking: { a: '#8a8f96', b: '#9aa0a6', pattern: 7 },
};

/** Base street ground: brick paving near the heritage cores, dusty concrete elsewhere, greener at the edges. */
export const BASE_GROUND = {
  brick: ['#94634f', '#b38266'],
  urban: ['#b8b4a7', '#cdc7b6'],
  rural: ['#8da576', '#a5b68a'],
};
