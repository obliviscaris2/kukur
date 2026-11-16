/**
 * Valley elevation: the real DEM baked by pipeline/terrain/build_terrain.py (assets/map/terrain.bin + terrain.json),
 * a Uint16 grid (decimetres) sampled bilinearly, plus optional artistic bumps (WORLD.hills).
 * Plain data + pure functions, so the tile worker builds geometry with exactly the heights physics uses.
 *   const dem = await loadTerrain(baseUrl, exaggerate)   → { x0, z0, cell, w, h, k, zero, data } or null (flat)
 *   terrainAt(dem, hills, x, z)                           → metres; 0 at the map origin (Basantapur)
 */
import { WORLD } from '../config/world.js';

const reliefCache=new Map();
const lattice=(x,z)=>{let n=Math.imul(x,374761393)^Math.imul(z,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
function softNoise(x,z){
  const ix=Math.floor(x),iz=Math.floor(z),u=x-ix,v=z-iz;
  const fade=t=>t*t*t*(t*(t*6-15)+10),a=fade(u),b=fade(v);
  return (lattice(ix,iz)*(1-a)+lattice(ix+1,iz)*a)*(1-b)+(lattice(ix,iz+1)*(1-a)+lattice(ix+1,iz+1)*a)*b;
}
/** Broad, cached earth undulations on the existing terrain vertices; rendering and collision share every height. */
export function groundRelief(x,z){
  const C=WORLD.terrain.relief;if(!C)return 0;
  const cell=WORLD.tileSize/WORLD.terrain.meshSegments,key=Math.round(x/cell)*100003+Math.round(z/cell);
  let height=reliefCache.get(key);
  if(height===undefined){
    height=(softNoise(x/C.span+13,z/C.span+29)-softNoise(13,29))*C.height*2
      +(softNoise(x/C.detailSpan+51,z/C.detailSpan+7)-softNoise(51,7))*C.detail*2;
    if(reliefCache.size>=C.cache)reliefCache.clear();reliefCache.set(key,height);
  }
  return height;
}
export async function loadTerrain(base, exaggerate = 1) {
  try {
    const [meta, buf] = await Promise.all([
      fetch(base + 'terrain.json').then((r) => (r.ok ? r.json() : null)),
      fetch(base + 'terrain.bin').then((r) => (r.ok ? r.arrayBuffer() : null)),
    ]);
    if (!meta || !buf) return null;
    return { x0: meta.x0, z0: meta.z0, cell: meta.cell, w: meta.w, h: meta.h, k: meta.scale * exaggerate, zero: meta.zero, data: new Uint16Array(buf) };
  } catch { return null; }
}

/** Smooth cosine bumps: [{x, z, radius, height}] */
function bumps(hills, x, z) {
  let h = 0;
  for (const hl of hills) { const d = Math.hypot(x - hl.x, z - hl.z) / hl.radius; if (d < 1) h += hl.height * (0.5 + 0.5 * Math.cos(Math.PI * d)); }
  return h;
}

function sample(dem, hills, x, z) {
  let h = hills && hills.length ? bumps(hills, x, z) : 0;
  if (!dem) return h;
  const W = dem.w, mx = W - 1.001, mz = dem.h - 1.001;
  let fx = (x - dem.x0) / dem.cell, fz = (z - dem.z0) / dem.cell;
  fx = fx < 0 ? 0 : fx > mx ? mx : fx; fz = fz < 0 ? 0 : fz > mz ? mz : fz;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, d = dem.data, o = j * W + i;
  const a = d[o] + (d[o + 1] - d[o]) * u, b = d[o + W] + (d[o + W + 1] - d[o + W]) * u;
  return h + (a + (b - a) * v - dem.zero) * dem.k + groundRelief(x,z);
}

/** The same a–c diagonal as the ground mesh: contact, props and foundations share its exact surface. */
export function terrainAt(dem, hills, x, z) {
  if (!dem && !hills?.length) return 0;
  const cell = WORLD.tileSize / WORLD.terrain.meshSegments;
  const ix = Math.floor(x / cell), iz = Math.floor(z / cell), u = x / cell - ix, v = z / cell - iz;
  const x0 = ix * cell, z0 = iz * cell, a = sample(dem, hills, x0, z0), c = sample(dem, hills, x0 + cell, z0 + cell);
  if (u >= v) { const b = sample(dem, hills, x0 + cell, z0); return a + (b - a) * u + (c - b) * v; }
  const d = sample(dem, hills, x0, z0 + cell);
  return a + (c - d) * u + (d - a) * v;
}

/** Sample every edge, including long edges crossing a valley; corner-only footings can hang in mid-air. */
export function footprintRange(pts, height) {
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (const [,y] of footprintEdge(pts[i], pts[(i + 1) % pts.length], height)) {
      low = Math.min(low, y); high = Math.max(high, y);
    }
  }
  return { low, high };
}

/** Include every terrain triangle boundary, so even a diagonal footing cannot bridge a hidden low spot. */
export function footprintEdge(a, b, height) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]) / WORLD.foundations.sampleSpacing));
  const cuts = new Set(Array.from({length:n+1},(_,i)=>i/n)), cell = WORLD.tileSize / WORLD.terrain.meshSegments;
  for (const [start,end] of [[a[0],b[0]],[a[1],b[1]],[a[0]-a[1],b[0]-b[1]]]) {
    if (Math.abs(end-start)<1e-9) continue;
    for (let k=Math.ceil(Math.min(start,end)/cell); k<=Math.floor(Math.max(start,end)/cell); k++) {
      const t=(k*cell-start)/(end-start); if(t>0&&t<1)cuts.add(t);
    }
  }
  return [...cuts].sort((x,y)=>x-y).map(t=>{const x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;return [x,height(x,z),z];});
}
