/**
 * Pure tile -> geometry builder. Runs inside tile.worker.js (no three.js here, just typed arrays).
 * Input:  raw tile JSON from assets/map/tiles (see pipeline/osm/build_tiles.py for the format) + world context.
 * Output: vertex buffers for walls/details/roads/areas/water/ground, wires, collision data, prop scatter lists,
 *         NPC navigation polylines, place names and a minimap bitmap.
 * Every random choice is seeded by the tile key, so the city looks the same on every visit.
 */
import earcut from '../../../node_modules/earcut/src/earcut.js';
import { terrainAt, footprintRange } from '../terrain.js';
import { rng, hash } from '../../core/rng.js';
import { planHouseStairs } from './HouseStairs.js';
import { terrainPieces } from './drape.js';
import { STREET_LIFE, WORLD, NATURE, MYTHIC } from '../../config/index.js';

const FLOOR = 2.9, BAY = 2.6, PARAPET = 0.85;
/** green area kinds -> [tufts per m², chance a tuft is a flower] */
const GREEN = NATURE.planting.scatter;
const MAX_TUFTS = NATURE.planting.tileCapacity;
const ROAD_KINDS = ['motorway', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential',
  'unclassified', 'living_street', 'service', 'pedestrian', 'footway', 'path', 'steps', 'track', 'cycleway', 'road'];
const MOTOR = new Set(['motorway', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'service', 'road']);
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
/** road class for markings: 3 trunk/primary, 2 secondary, 1 tertiary, 0 everything else */
const ROAD_CLASS = { motorway: 3, trunk: 3, primary: 3, secondary: 2, tertiary: 1, trunk_link: 2, primary_link: 2, secondary_link: 1 };

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => c ** 2.2); };

class Buf {
  constructor(spec) { this.spec = spec; this.a = {}; for (const k in spec) this.a[k] = []; this.idx = []; this.n = 0; }
  v(vals) { for (const k in this.spec) { const x = vals[k] ?? (k === 'surface' ? this.surface || 0 : undefined); if (this.spec[k] === 1) this.a[k].push(x); else for (let i = 0; i < this.spec[k]; i++) this.a[k].push(x[i]); } return this.n++; }
  facing(a, b, c, n) {
    const P = this.a.position;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    return (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] >= 0;
  }
  tri(a, b, c, n) { if (!n || this.facing(a, b, c, n)) this.idx.push(a, b, c); else this.idx.push(a, c, b); }
  quad(a, b, c, d, n) { if (!n || this.facing(a, b, c, n)) this.idx.push(a, b, c, a, c, d); else this.idx.push(a, d, c, a, c, b); }
  /** axis-aligned-ish box given by centre, half extents along (ux,uz) and (vx,vz) directions, y range */
  box(cx, cz, ux, uz, hu, hv, y0, y1, color) {
    const vx = -uz, vz = ux;
    const P = (su, sv, y) => [cx + ux * hu * su + vx * hv * sv, y, cz + uz * hu * su + vz * hv * sv];
    const faces = [[[0, 1, 0], [[-1, -1, y1], [1, -1, y1], [1, 1, y1], [-1, 1, y1]]], [[0, -1, 0], [[-1, -1, y0], [-1, 1, y0], [1, 1, y0], [1, -1, y0]]],
      [[ux, 0, uz], [[1, -1, y0], [1, 1, y0], [1, 1, y1], [1, -1, y1]]], [[-ux, 0, -uz], [[-1, -1, y0], [-1, -1, y1], [-1, 1, y1], [-1, 1, y0]]],
      [[vx, 0, vz], [[-1, 1, y0], [-1, 1, y1], [1, 1, y1], [1, 1, y0]]], [[-vx, 0, -vz], [[-1, -1, y0], [1, -1, y0], [1, -1, y1], [-1, -1, y1]]]];
    for (const [n, q] of faces) { const i = q.map(([su, sv, y]) => this.v({ position: P(su, sv, y), normal: n, color })); this.quad(i[0], i[1], i[2], i[3], n); }
  }
  out() {
    if (!this.n) return null;
    const o = {};
    for (const k in this.spec) o[k] = new Float32Array(this.a[k]);
    o.index = this.n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    return o;
  }
}

const area2 = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
function decode(flat, ox, oz) { const p = []; for (let i = 0; i < flat.length; i += 2) p.push([ox + flat[i] / 10, oz + flat[i + 1] / 10]); return p; }
function obb(pts) {
  let best = null, bestA = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]; let ex = b[0] - a[0], ez = b[1] - a[1]; const L = Math.hypot(ex, ez); if (L < 0.05) continue;
    ex /= L; ez /= L; let mnu = Infinity, mxu = -Infinity, mnv = Infinity, mxv = -Infinity;
    for (const p of pts) { const u = p[0] * ex + p[1] * ez, v = -p[0] * ez + p[1] * ex; mnu = Math.min(mnu, u); mxu = Math.max(mxu, u); mnv = Math.min(mnv, v); mxv = Math.max(mxv, v); }
    const A = (mxu - mnu) * (mxv - mnv);
    if (A < bestA) { bestA = A; const cu = (mnu + mxu) / 2, cv = (mnv + mxv) / 2; best = { ax: [ex, ez], su: mxu - mnu, sv: mxv - mnv, c: [cu * ex - cv * ez, cu * ez + cv * ex] }; }
  }
  if (best) best.fill = Math.abs(area2(pts)) / bestA;
  return best;
}

/** Split triangles until no edge is longer than maxLen (shared midpoints keep it watertight), so flat polygons drape on hills. */
function tessellate(pts, tris, maxLen, cap = 40000) {
  const P = pts.slice(), out = [], mids = new Map(), L2 = maxLen * maxLen;
  const d2 = (a, b) => (P[a][0] - P[b][0]) ** 2 + (P[a][1] - P[b][1]) ** 2;
  const mid = (a, b) => { const k = a < b ? a * 1048576 + b : b * 1048576 + a; let i = mids.get(k); if (i === undefined) { i = P.length; P.push([(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2]); mids.set(k, i); } return i; };
  const stack = []; for (let i = 0; i < tris.length; i += 3) stack.push([tris[i], tris[i + 1], tris[i + 2]]);
  while (stack.length) {
    const [a, b, c] = stack.pop(), ab = d2(a, b), bc = d2(b, c), ca = d2(c, a);
    if (Math.max(ab, bc, ca) <= L2 || out.length > cap) { out.push(a, b, c); continue; }
    if (ab >= bc && ab >= ca) { const m = mid(a, b); stack.push([a, m, c], [m, b, c]); }
    else if (bc >= ca) { const m = mid(b, c); stack.push([a, b, m], [a, m, c]); }
    else { const m = mid(c, a); stack.push([a, b, m], [m, b, c]); }
  }
  return { P, tris: out };
}

/**
 * @param {object} tile  raw tile JSON
 * @param {object} ctx   { tx, tz, size, palette, areaKinds, areaStyle, hills, density(tx,tz), cores, quality }
 */
export function buildTile(tile, ctx) {
  const { tx, tz, size, palette: PAL } = ctx;
  const ox = tx * size, oz = tz * size;
  const R = rng(hash('tile', tx, tz));
  const hills = ctx.hills.filter((h) => h.x + h.radius > ox && h.x - h.radius < ox + size && h.z + h.radius > oz && h.z - h.radius < oz + size);
  const H = (x, z) => terrainAt(ctx.dem, hills, x, z);
  const slopeN = (x, z) => { const e = 2, dx = H(x + e, z) - H(x - e, z), dz = H(x, z + e) - H(x, z - e), l = Math.hypot(dx, 2 * e, dz); return [-dx / l, (2 * e) / l, -dz / l]; };
  const pal = (list) => list[Math.floor(R() * list.length)];
  const walls = new Buf({ position: 3, normal: 3, uv: 2, wall: 2, paint: 3, info: 4 });
  const detail = new Buf({ position: 3, normal: 3, color: 3, surface: 1 });
  const relief = new Buf({ position: 3, normal: 3, color: 3, surface: 1 });   // near-only facade depth
  const roads = new Buf({ position: 3, normal: 3, color: 3, uv: 2, roadw: 3 });
  const areas = new Buf({ position: 3, normal: 3, kind: 1 });
  const water = new Buf({ position: 3, normal: 3 });
  const ground = new Buf({ position: 3, normal: 3, gnd: 2 });
  const solids = [], platforms = [], circles = [], occluders = [];
  const surfaces = [];
  const props = { trees: [], flags: [], poles: [], lamps: [], bikes: [], tanks: [], solar: [], plants: [], laundry: [], benches: [] };
  const wires = [];
  const navs = [], names = [], roadList = [], shops = [], climbs = [], houses = [], swim = { polys: [], lines: [] }, tufts = [], TR = rng(hash(tx, tz, 555));   // swim: water you can paddle in
  let roofOverride = -1;   // roof:colour from OSM for the building being built (read by flatRoof/pitchedRoof)
  const intCol = (n) => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => c ** 2.2);

  // ---------------------------------------------------------------- base ground (grid only where hills are)
  const coreAt = (x, z) => { let w = 0; for (const c of ctx.cores) w = Math.max(w, 1 - Math.min(1, Math.hypot(x - c[0], z - c[1]) / c[2])); return w; };
  const densAt = (x, z) => { // bilinear over neighbouring tile densities so tile edges never show
    const fx = x / size - 0.5, fz = z / size - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, w = fz - iz;
    const d = (a, b) => ctx.density(a, b);
    return (d(ix, iz) * (1 - u) + d(ix + 1, iz) * u) * (1 - w) + (d(ix, iz + 1) * (1 - u) + d(ix + 1, iz + 1) * u) * w;
  };
  const N = ctx.dem || hills.length ? WORLD.terrain.meshSegments : 4;
  const gi = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = ox + (i / N) * size, z = oz + (j / N) * size;
    gi.push(ground.v({ position: [x, H(x, z), z], normal: slopeN(x, z), gnd: [densAt(x, z), coreAt(x, z)] }));
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = gi[j * (N + 1) + i], b = a + 1, c = a + N + 2, d = a + N + 1; ground.quad(a, b, c, d, [0, 1, 0]); }

  // ---------------------------------------------------------------- occupancy mask (2 m/px) for prop placement + minimap
  const M = 128, mpp = size / M;
  const occ = new OffscreenCanvas(M, M), oc = occ.getContext('2d', { willReadFrequently: true });
  const mm = new OffscreenCanvas(M, M), mc = mm.getContext('2d');
  oc.__tile = mc.__tile = { ox, oz, mpp };
  oc.fillStyle = '#fff'; oc.fillRect(0, 0, M, M);
  const d0 = ctx.density(tx, tz), core = coreAt(ox + size / 2, oz + size / 2);
  mc.fillStyle = core > 0.35 ? '#e8b796' : d0 > 0.25 ? '#efdcc4' : '#cfe3a6'; mc.fillRect(0, 0, M, M);
  const toPx = (p) => [(p[0] - ox) / mpp, (p[1] - oz) / mpp];
  const pathPoly = (c, pts) => { c.beginPath(); pts.forEach((p, i) => { const [x, y] = toPx(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };

  // ---------------------------------------------------------------- land-use areas
  const kindCol = ctx.areaKinds.map((k) => ctx.areaStyle[k].a);
  for (const [flat, k] of tile.a) {
    const p = decode(flat, ox, oz); if (p.length < 3) continue;
    const kind = ctx.areaKinds[k];
    surfaces.push({kind,pts:p.flat()});
    const coords = []; for (const q of p) coords.push(q[0], q[1]);
    const tris = earcut(coords);
    const isWater = kind === 'water' || kind === 'wetland';
    if (kind === 'water') swim.polys.push(coords);
    const buf = isWater ? water : areas, base = buf.n, dr = isWater ? tessellate(p, tris, 12) : {P:[],tris:[]};
    if(!isWater)for(let i=0;i<tris.length;i+=3){
      for(const piece of terrainPieces([p[tris[i]],p[tris[i+1]],p[tris[i+2]]],WORLD.tileSize/WORLD.terrain.meshSegments)){
        const offset=dr.P.length;dr.P.push(...piece);for(let j=1;j<piece.length-1;j++)dr.tris.push(offset,offset+j,offset+j+1);
      }
    }
    for (const q of dr.P) {
      const y = H(q[0], q[1]) + (isWater ? 0.04 : 0.02 + k * 0.0015), nrm = slopeN(q[0], q[1]);
      buf.v(isWater ? { position: [q[0], y, q[1]], normal: [0, 1, 0] } : { position: [q[0], y, q[1]], normal: nrm, kind: k });
    }
    for (let i = 0; i < dr.tris.length; i += 3) buf.tri(base + dr.tris[i], base + dr.tris[i + 1], base + dr.tris[i + 2], [0, 1, 0]);
    // grass tufts & flowers scattered over green areas (drawn near the pup by world/effects/Grass.js)
    const G = GREEN[kind];
    if (G && tufts.length < MAX_TUFTS * 5) {
      const cum = []; let tot = 0;
      for (let i = 0; i < tris.length; i += 3) { const a = p[tris[i]], b = p[tris[i + 1]], c = p[tris[i + 2]]; tot += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; cum.push(tot); }
      const n = Math.min(Math.round(tot * G[0]), MAX_TUFTS - tufts.length / 5);
      for (let k = 0; k < n; k++) {
        const pick = TR() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < pick) lo = mid + 1; else hi = mid; }
        const a = p[tris[lo * 3]], b = p[tris[lo * 3 + 1]], c = p[tris[lo * 3 + 2]]; let u = TR(), v = TR(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const x = a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, z = a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v;
        tufts.push(x, H(x, z), z, TR() < G[1] ? 1 + Math.floor(TR() * 5) : 0, TR());
      }
    }
    pathPoly(mc, p); mc.fillStyle = isWater ? '#7cc8f0' : kindCol[k]; mc.fill();
    if (isWater) { pathPoly(oc, p); oc.fillStyle = '#000'; oc.fill(); }
    // trees, benches inside parks / forests / orchards
    const st = ctx.areaStyle[kind];
    if (st?.trees) {
      const A = Math.abs(area2(p)), n = Math.min(160, Math.floor(A * st.trees * ctx.quality.treeDensity));
      const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      for (let i = 0, tries = 0; i < n && tries < n * 4; tries++) {
        const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
        if (!pointIn(x, z, p)) continue;
        const kindT = kind === 'forest' ? (R() < 0.6 ? 1 : 0) : kind === 'orchard' ? 4 : R() < 0.15 ? 2 : R() < 0.25 ? 3 : R() < 0.6 ? 0 : 4;
        props.trees.push(x, H(x, z), z, kindT, 0.85 + R() * 0.55); i++;
      }
      if (kind === 'park' || kind === 'garden') for (let i = 0; i < Math.min(8, Math.abs(area2(p)) / 500); i++) {
        const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (pointIn(x, z, p)) props.benches.push(x, H(x, z), z, R() * 6.28);
      }
    }
  }

  // ---------------------------------------------------------------- waterways (rivers, streams)
  for (const [flat, wdm] of tile.w) { const p = decode(flat, ox, oz); ribbon(water, p, wdm / 10, H, 0.035, null, mc, '#7cc8f0', oc); if (wdm >= 25) swim.lines.push([p.flat(), wdm / 10]); }

  // ---------------------------------------------------------------- roads
  for (const [flat, ki, wdm, mat, ni, , lanes = 0, oneway = 0] of tile.r) {
    const kind = ROAD_KINDS[ki], w = wdm / 10, p = decode(flat, ox, oz);
    const col = hex(mat === 0 ? PAL.roads.asphalt : mat === 1 ? PAL.roads.brick : PAL.roads.dirt);
    const lift = 0.03 + (MAJOR.has(kind) ? 0.012 : 0) + (hash(tx, tz, flat[0]) % 5) * 0.003;
    const visible = mat === 0 || mat === 2 || core < 0.3;   // brick lanes inside old cores melt into the brick ground
    ribbon(visible ? roads : null, p, w, H, lift, { color: col, kind: mat + 4 * (ROAD_CLASS[kind] || 0), lanes: lanes * 2 + oneway, soft:mat===2&&!MOTOR.has(kind) }, mc, mat === 0 ? '#ffffff' : '#fff6ea', oc, Math.max(2, w));
    navs.push({ pts: p.flat(), kind, w, lanes, oneway, surface: mat === 0 ? 'asphalt' : mat === 1 ? 'brick' : 'earth' });
    if (kind === 'steps') for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), ya = H(...a), yb = H(...b), rise = Math.abs(yb - ya);
      if (rise < 0.25 || length < 0.5 || rise > length) continue;
      const count = Math.max(2, Math.ceil(rise / STREET_LIFE.stairs.rise)), ux = dx / length, uz = dz / length;
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count, x = a[0] + dx * t, z = a[1] + dz * t, top = ya + (yb - ya) * (yb > ya ? (j + 1) / count : j / count) + 0.03;
        detail.box(x, z, ux, uz, length / count / 2, w * 0.44, Math.min(ya, yb) - 0.05, top, hex('#b8ad98'));
        platforms.push({ pts: boxPoints(x, z, ux, uz, length / count / 2, w * 0.44), h: top });
      }
    }
    if (ni >= 0) names.push([tile.names[ni], p[Math.floor(p.length / 2)][0], p[Math.floor(p.length / 2)][1], 18]);
    roadList.push([p, kind, w, mat]);
  }

  // ---------------------------------------------------------------- which walls face a street (for painted fronts, brick sides, facade relief)
  const roadGrid = new Map(), RG = 20;
  for (const [p, , w] of roadList) for (let k = 1; k < p.length; k++) {
    const a = p[k - 1], b = p[k];
    for (let gx = Math.floor((Math.min(a[0], b[0]) - 12) / RG); gx <= Math.floor((Math.max(a[0], b[0]) + 12) / RG); gx++)
      for (let gz = Math.floor((Math.min(a[1], b[1]) - 12) / RG); gz <= Math.floor((Math.max(a[1], b[1]) + 12) / RG); gz++) {
        const key = gx * 100003 + gz; let l = roadGrid.get(key); if (!l) roadGrid.set(key, (l = [])); l.push([a, b, w]);
      }
  }
  const nearRoad = (x, z, extra) => { for (const [a, b, w] of roadGrid.get(Math.floor(x / RG) * 100003 + Math.floor(z / RG)) || []) if (segDistance(x, z, a, b) < w / 2 + extra) return true; return false; };

  // ---------------------------------------------------------------- zebra crossings on the main-road arms of named junctions
  const ZEBRA = hex('#f4f1e8');
  for (const r of tile.s || []) {
    const jx = ox + r[0] / 10, jz = oz + r[1] / 10;
    for (let i = 2; i < r.length; i += 2) {
      const ang = r[i] / 1000, ux = Math.sin(ang), uz = Math.cos(ang);
      let best = null, bd = 4;
      for (const [p, kind, w, mat] of roadList) {
        if (!MAJOR.has(kind) || w < 6 || mat !== 0) continue;
        for (let k = 1; k < p.length; k++) { const d = segDistance(jx + ux * 10, jz + uz * 10, p[k - 1], p[k]); if (d < bd) { bd = d; best = [w, p[k - 1], p[k]]; } }
      }
      if (!best) continue;
      const [w, a, b] = best; let rx = b[0] - a[0], rz = b[1] - a[1]; const L = Math.hypot(rx, rz) || 1; rx /= L; rz /= L;
      if (rx * ux + rz * uz < 0) { rx = -rx; rz = -rz; }
      const off = 5 + w * 0.35, cx = jx + ux * off, cz = jz + uz * off, n = Math.max(3, Math.floor((w - 1.2) / 0.95));
      for (let k = 0; k < n; k++) {
        const sft = (k - (n - 1) / 2) * 0.95, bx = cx - rz * sft, bz = cz + rx * sft, y0 = H(bx, bz) + 0.058;
        detail.box(bx, bz, rx, rz, 1.3, 0.24, y0, y0 + 0.004, ZEBRA);
      }
    }
  }

  // ---------------------------------------------------------------- compound walls & fences (block the pup like real walls)
  const WALL_COL = { 0: core > 0.3 ? hex('#a9553b') : hex('#e9dcc6'), 2: hex('#9c4a32') };
  const wallRuns = [], wallSections = new Set();
  for (const [flat, kind] of tile.f || []) {
    if (kind === 3) continue;                                  // retaining walls: terrain detail we don't model
    const p = decode(flat, ox, oz);
    for (let i = 1; i < p.length; i++) {
      const start = p[i - 1], end = p[i], length = Math.hypot(end[0] - start[0], end[1] - start[1]); if (length < 0.3) continue;
      const hv=kind===1?.12:.16,nx=-(end[1]-start[1])/length*hv,nz=(end[0]-start[0])/length*hv;
      const runY=H((start[0]+end[0])/2,(start[1]+end[1])/2);
      wallRuns.push({pts:[[start[0]+nx,start[1]+nz],[end[0]+nx,end[1]+nz],[end[0]-nx,end[1]-nz],[start[0]-nx,start[1]-nz]],h:runY+(kind===2?3.3:kind===1?1.5:2.2)});
      const count = Math.max(1, Math.ceil(length / WORLD.foundations.wallSegment));
      for (let part = 0; part < count; part++) {
      const at = (t) => [start[0]+(end[0]-start[0])*t/count,start[1]+(end[1]-start[1])*t/count], a=at(part), b=at(part+1), L=length/count;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, y = H(cx, cz);
      const bottom = Math.min(y, footprintRange([a,b],H).low) - WORLD.foundations.embed;
      if (kind === 1) {                                        // iron railing: posts + two rails, painted green
        const g = hex('#2f5d3a');
        for (let d = 0; d <= L; d += 2.2) { const px = a[0] + ux * d, pz = a[1] + uz * d; detail.box(px, pz, ux, uz, 0.04, 0.04, bottom, y + 1.5, g); }
        detail.box(cx, cz, ux, uz, L / 2, 0.025, y + 1.35, y + 1.42, g); detail.box(cx, cz, ux, uz, L / 2, 0.025, y + 0.5, y + 0.56, g);
        detail.box(cx, cz, ux, uz, L / 2, 0.12, bottom, y + 0.35, hex('#d8cbb3'));       // low plinth
      } else {
        const hgt = kind === 2 ? 3.2 : 2.1, col = WALL_COL[kind];
        detail.box(cx, cz, ux, uz, L / 2 + 0.12, 0.14, bottom, y + hgt, col);
        detail.box(cx, cz, ux, uz, L / 2 + 0.16, 0.19, y + hgt, y + hgt + 0.1, col.map((c) => Math.min(1, c * 1.25)));   // coping
      }
      const hv = kind === 1 ? 0.12 : 0.16, nx = -uz * hv, nz = ux * hv;
      const section={ pts: [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]], h: y + (kind === 2 ? 3.3 : kind === 1 ? 1.5 : 2.2), base: bottom };
      solids.push(section);wallSections.add(section);
      }
    }
  }

  // ---------------------------------------------------------------- statues, memorials & stone pillars (Garuda columns, king statues)
  for (const [mx, mz, kind] of tile.m || []) {
    const x = ox + mx / 10, z = oz + mz / 10, y = H(x, z), stone = hex('#d6cbb8'), gold = hex('#f0b429');
    detail.box(x, z, 1, 0, 0.75, 0.75, y, y + 0.5, hex('#bfb3a0'));
    if (kind === 2) {          // pillar with a golden figure on top
      detail.box(x, z, 1, 0, 0.42, 0.42, y + 0.5, y + 1.1, stone);
      prism(detail, x, z, 0.26, y + 1.1, y + 4.6, 8, stone);
      detail.box(x, z, 1, 0, 0.42, 0.42, y + 4.6, y + 4.85, stone);
      prism(detail, x, z, 0.24, y + 4.85, y + 5.5, 8, gold); prism(detail, x, z, 0.14, y + 5.5, y + 5.85, 8, gold);
      detail.box(x, z, 1, 0, 0.5, 0.06, y + 5.2, y + 5.4, gold);       // wings / canopy
      circles.push([x, z, 0.8, y + 6]);
    } else {                   // statue / memorial on a plinth
      detail.box(x, z, 1, 0, 0.5, 0.5, y + 0.5, y + 1.6, stone);
      prism(detail, x, z, 0.28, y + 1.6, y + 2.6, 8, kind === 1 ? hex('#8a7f73') : gold);
      prism(detail, x, z, 0.18, y + 2.6, y + 2.95, 8, kind === 1 ? hex('#8a7f73') : gold);
      circles.push([x, z, 0.8, y + 3]);
    }
  }

  // ---------------------------------------------------------------- buildings
  for (const b of tile.b) building(b);
  mc.fillStyle = 'rgba(0,0,0,0)';

  // ---------------------------------------------------------------- landmarks & pois
  const landmarks = tile.l.map(([x, z, s, a, model, ni]) => [ox + x / 10, oz + z / 10, s / 10, a / 1000, model, ni >= 0 ? tile.names[ni] : '']);
  for (const l of landmarks) { names.push([l[5] || '', l[0], l[1], Math.max(25, l[2] * 2)]); mc.fillStyle = '#ffb703'; const [x, y] = toPx([l[0], l[1]]); mc.beginPath(); mc.arc(x, y, 3, 0, 7); mc.fill(); }
  for (const [x, z, ni] of tile.p) if (ni >= 0) names.push([tile.names[ni], ox + x / 10, oz + z / 10, 25]);

  // ---------------------------------------------------------------- open-lot trees, OSM trees, chautaris
  const mask = oc.getImageData(0, 0, M, M).data;
  const free = (x, z, r = 1) => {
    const px = Math.floor((x - ox) / mpp), pz = Math.floor((z - oz) / mpp);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const qx = px + dx, qz = pz + dz; if (qx < 0 || qz < 0 || qx >= M || qz >= M) continue;
      if (mask[(qz * M + qx) * 4] < 128) return false;
    }
    return true;
  };
  for (const r of roadList) scatterAlongRoad(...r);
  for (let i = 0; i < tile.t.length; i += 2) { const x = ox + tile.t[i] / 10, z = oz + tile.t[i + 1] / 10; props.trees.push(x, H(x, z), z, 0, 1.2); }
  const openTrees = Math.floor((d0 > 0.35 ? 10 : d0 > 0.15 ? 22 : 40) * ctx.quality.treeDensity);
  for (let i = 0, tries = 0; i < openTrees && tries < openTrees * 6; tries++) {
    const x = ox + R() * size, z = oz + R() * size;
    if (!free(x, z, 2)) continue;
    props.trees.push(x, H(x, z), z, pickTree(core), 0.8 + R() * 0.6); i++;
  }
  if (core > 0.25) for (let i = 0; i < 2; i++) { // chautari: stone resting platform around a big peepal
    const x = ox + R() * size, z = oz + R() * size;
    if (!free(x, z, 3)) continue;
    const y = H(x, z), c1 = hex('#b9ae9c'), c2 = hex('#d6ccbb');
    detail.box(x, z, 1, 0, 2.6, 2.6, y - 0.2, y + 0.45, c1); detail.box(x, z, 1, 0, 2.0, 2.0, y + 0.45, y + 0.8, c2);
    platforms.push({ pts: [[x - 2.6, z - 2.6], [x + 2.6, z - 2.6], [x + 2.6, z + 2.6], [x - 2.6, z + 2.6]], h: y + 0.45 }, { pts: [[x - 2, z - 2], [x + 2, z - 2], [x + 2, z + 2], [x - 2, z + 2]], h: y + 0.8 });
    props.trees.push(x, y + 0.8, z, 0, 1.45);
    names.push(['Chautari', x, z, 8]);
    for(let step=0;step<3;step++) {
      const run=STREET_LIFE.stairs.run,cz=z+2.6+(2.5-step)*run,top=y+.15*(step+1);
      detail.box(x,cz,1,0,.65,run/2,y-.05,top,c1);
      platforms.push({pts:boxPoints(x,cz,1,0,.65,run/2),h:top});
    }
  }

  // Short service stairs join existing compound-wall walks; only place them in clear space off the road.
  // Keep the original wall runs for stair planning: the shorter grounded collision sections cannot fit a full flight.
  for(const wall of [...wallRuns,...solids.filter(s=>!wallSections.has(s))]) {
    if(climbs.length>=STREET_LIFE.parkour.maxPerTile)break;
    if(wall.pts.length!==4||R()>STREET_LIFE.parkour.chance)continue;
    const a=wall.pts[0],b=wall.pts[1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length<6)continue;
    const ux=(b[0]-a[0])/length,uz=(b[1]-a[1])/length,cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,base=H(cx,cz),rise=wall.h-base;
    if(rise<1.2||rise>2.3)continue;
    const cfg=STREET_LIFE.parkour,count=Math.ceil(rise/cfg.rise),run=count*cfg.run;
    if(run>length-.8)continue;
    let side=0;
    for(const sign of [1,-1]) {
      const nx=-uz*sign,nz=ux*sign;
      if(!nearRoad(cx+nx*2,cz+nz*2,5))continue;
      if([-.45,0,.45].every(t=>free(cx+ux*run*t+nx*.75,cz+uz*run*t+nz*.75,0))){side=sign;break;}
    }
    if(!side)continue;
    const nx=-uz*side,nz=ux*side,col=hex('#b5ad9b');
    for(let step=0;step<count;step++) {
      const along=-run/2+(step+.5)*cfg.run,x=cx+ux*along+nx*.75,z=cz+uz*along+nz*.75,top=base+rise*(step+1)/count;
      detail.box(x,z,ux,uz,cfg.run/2,cfg.width/2,Math.min(base,H(x,z))-.05,top,col);
      platforms.push({pts:boxPoints(x,z,ux,uz,cfg.run/2,cfg.width/2),h:top});
    }
    const endX=cx+ux*(run/2+.2)+nx*.4,endZ=cz+uz*(run/2+.2)+nz*.4;
    detail.box(endX,endZ,ux,uz,.35,.55,wall.h-.12,wall.h,col);
    platforms.push({pts:boxPoints(endX,endZ,ux,uz,.35,.55),h:wall.h});
    climbs.push({x:cx-ux*run/2+nx*.75,z:cz-uz*run/2+nz*.75,y:base,heading:Math.atan2(ux,uz),endX,endZ,top:wall.h});
  }

  // Benches have a standable seat, a thin back and separate legs, matching their visible geometry.
  props.benches=props.benches.filter((_,i,a)=>{
    const start=i-i%4,x=a[start],z=a[start+2];return free(x,z,1)&&!nearRoad(x,z,2);
  });
  for(let i=0;i<props.benches.length;i+=4){
    const [x,y,z,a]=props.benches.slice(i,i+4),ux=Math.cos(a),uz=-Math.sin(a),nx=-uz,nz=ux;
    solids.push({pts:boxPoints(x,z,ux,uz,.9,.25),base:y+.40,h:y+.50});
    solids.push({pts:boxPoints(x-nx*.22,z-nz*.22,ux,uz,.9,.04),base:y+.55,h:y+.95});
    for(const s of [-1,1])solids.push({pts:boxPoints(x+ux*s*.75,z+uz*s*.75,ux,uz,.05,.225),base:y-.01,h:y+.45});
  }
  return {
    key: `${tx}_${tz}`, ox, oz, density: d0, core,
    walls: walls.out(), detail: detail.out(), relief: relief.out(), roads: roads.out(), areas: areas.out(), water: water.out(), ground: ground.out(),
    wires: new Float32Array(wires), tufts: new Float32Array(tufts.filter((_,i)=>{const j=i-i%5;return free(tufts[j],tufts[j+2],0);})), solids, platforms, circles, occluders, navs, names, landmarks, swim, shops, climbs, houses, surfaces,
    signs: (tile.s || []).map((r) => { const arms = []; for (let i = 2; i < r.length; i += 2) arms.push([r[i] / 1000, r[i + 1] >= 0 ? tile.names[r[i + 1]] : '']); return [ox + r[0] / 10, oz + r[1] / 10, arms]; }),
    props: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, new Float32Array(v)])),
    minimap: mm.transferToImageBitmap(),
  };

  // ================================================================= helpers (closures over tile state)
  function pickTree(c) { const r = R(); return c > 0.4 ? (r < 0.45 ? 0 : r < 0.6 ? 3 : r < 0.8 ? 2 : 4) : (r < 0.35 ? 0 : r < 0.55 ? 1 : r < 0.7 ? 2 : r < 0.82 ? 3 : 4); }

  function boxPoints(x, z, ux, uz, half, depth) {
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+ux*half*a-uz*depth*b,z+uz*half*a+ux*depth*b]);
  }
  function shopOpening(pts, street, base, roof, random) {
    const cfg = STREET_LIFE.shops, width = cfg.width, depth = cfg.depth;
    const eligible = pts.map((a, edge) => ({ a, b: pts[(edge+1)%pts.length], edge })).filter(({a,b,edge}) => street[edge] && Math.hypot(b[0]-a[0],b[1]-a[1]) > width+1.1);
    for (const {a:p,b:q,edge} of eligible.sort(()=>random()-0.5)) {
      const len=Math.hypot(q[0]-p[0],q[1]-p[1]),ux=(q[0]-p[0])/len,uz=(q[1]-p[1])/len,nx=uz,nz=-ux,x=(p[0]+q[0])/2,z=(p[1]+q[1])/2;
      const ground=H(x+nx*.8,z+nz*.8),y=ground+cfg.floorRise;
      if(y-base>STREET_LIFE.stairs.maxEntryRise || y+cfg.opening>roof-.12)continue;
      const a=[x-ux*width/2,z-uz*width/2],b=[x+ux*width/2,z+uz*width/2],ai=[a[0]-nx*depth,a[1]-nz*depth],bi=[b[0]-nx*depth,b[1]-nz*depth];
      if(!pointIn(ai[0]-nx*.1,ai[1]-nz*.1,pts)||!pointIn(bi[0]-nx*.1,bi[1]-nz*.1,pts))continue;
      return {edge,x,z,y,ground,ux,uz,nx,nz,width,depth,a,b,ai,bi};
    }
    return null;
  }
  function furnishShop(s,random) {
    const {x,z,y,ux,uz,nx,nz,width,depth}=s,wood=hex('#88674b'),inside=hex('#52473d'),cream=hex('#c7b99c');
    const box=(along,inward,half,halfDepth,low,high,color)=>detail.box(x+ux*along-nx*inward,z+uz*along-nz*inward,ux,uz,half,halfDepth,low,high,color);
    box(0,depth/2,width/2,depth/2,y-.08,y,cream);
    platforms.push({pts:[s.a,s.b,s.bi,s.ai],h:y});
    box(0,depth-.03,width/2,.04,y,y+STREET_LIFE.shops.opening,inside);
    for(const side of [-1,1])box(side*(width/2-.025),depth/2,.035,depth/2,y,y+STREET_LIFE.shops.opening,inside);
    const counter=STREET_LIFE.shops.counterHeight;
    box(0,.67,width*.38,.19,y,y+counter,wood);box(0,.67,width*.4,.21,y+counter,y+counter+.04,cream);
    solids.push({pts:boxPoints(x-nx*.67,z-nz*.67,ux,uz,width*.38,.19),h:y+counter+.04,base:y});
    for(const shelf of [1.05,1.58]) {
      box(0,depth-.15,width*.43,.14,y+shelf,y+shelf+.045,wood);
      for(let i=0;i<6;i++)box((i-2.5)*.27,depth-.17,.075,.07,y+shelf+.045,y+shelf+.16+random()*.12,hex(['#b55843','#bca55d','#5d887d','#c9c5b5'][i%4]));
    }
    const count=Math.max(1,Math.ceil((y-s.ground)/STREET_LIFE.stairs.rise)),run=STREET_LIFE.stairs.run;
    for(let i=0;i<count;i++) {
      const distance=(count-i-.5)*run,top=s.ground+(y-s.ground)*(i+1)/count,cx=x+nx*distance,cz=z+nz*distance;
      detail.box(cx,cz,ux,uz,width/2,run/2,s.ground-.04,top,cream);
      platforms.push({pts:boxPoints(cx,cz,ux,uz,width/2,run/2),h:top});
    }
    shops.push({id:`${tx}_${tz}:shop:${shops.length}`,x:x-nx*1.25,z:z-nz*1.25,y,heading:Math.atan2(nx,nz),entryX:x+nx*.45,entryZ:z+nz*.45,kind:['kirana','momo','chiya'][Math.floor(random()*3)]});
  }

  function furnishHouseStairs(stairs,outline,top) {
    const stone=hex('#b8ad99'),steel=hex('#555b58'),inside=hex('#655b50');
    for(const b of stairs.boxes)detail.box(b.x,b.z,b.ux,b.uz,b.hu,b.hv,b.low,b.high,stone);
    platforms.push(...stairs.platforms);
    // Real room sides and a back wall enclose the carved stairwell; its opening faces the street.
    const {x,z,ux,uz,nx,nz,width,depth,y,deck}=stairs;
    for(const sign of [-1,1])detail.box(x+ux*width/2*sign-nx*depth/2,z+uz*width/2*sign-nz*depth/2,ux,uz,.035,depth/2,y,deck,inside);
    detail.box(x-nx*depth,z-nz*depth,ux,uz,width/2,.035,y,deck,inside);
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.05)continue;
      const ex=(b[0]-a[0])/len,ez=(b[1]-a[1])/len;
      solids.push({pts:boxPoints((a[0]+b[0])/2-ez*.04,(a[1]+b[1])/2+ex*.04,ex,ez,len/2,.18),h:top+.12,base:deck});
    }
    // Slim landing posts make the open stair bay read as architecture without extra meshes.
    for(const point of stairs.route.slice(1,-1)){
      const side=(point.x-x)*ux+(point.z-z)*uz<0?-1:1;
      const px=point.x+ux*.42*side,pz=point.z+uz*.42*side;
      detail.box(px,pz,ux,uz,.025,.025,point.y,point.y+.65,steel);
      solids.push({pts:boxPoints(px,pz,ux,uz,.025,.025),h:point.y+.65,base:point.y});
    }
    const cache=stairs.cache;
    detail.box(cache.x,cache.z,ux,uz,.27,.22,deck,deck+.28,hex('#9b7956'));
    detail.box(cache.x,cache.z,ux,uz,.29,.24,deck+.28,deck+.32,hex('#74866b'));
    solids.push({pts:boxPoints(cache.x,cache.z,ux,uz,.28,.23),h:deck+.32,base:deck});
    houses.push({id:`${tx}_${tz}:house:${houses.length}`,entry:stairs.entry,route:stairs.route,cache:stairs.cache,deck,kind:stairs.kind,heading:Math.atan2(nx,nz)});
  }

  function building([flat, lv, flags, tint1000, ni, rc = -1, bc = -1]) {
    let pts = decode(flat, ox, oz);
    if (pts.length < 3) return;
    if (area2(pts) < 0) pts = pts.reverse();
    let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
    const r = rng(hash(tx, tz, flat[0], flat[1]));
    const seed = tint1000 / 1000, newari = !!(flags & 1), shop = flags & 2 ? 1 : 0, pitchedFlag = !!(flags & 4), civic = !!(flags & 8), rana = !!(flags & 16);
    roofOverride = rc;
    const base = Math.min(H(cx, cz), ...pts.map((q) => H(q[0], q[1])));   // on a slope: sit on the low corner, dig into the high one
    const footing = Math.min(base - 0.6, footprintRange(pts, H).low - WORLD.foundations.embed);
    const paint = bc >= 0 ? intCol(bc) : rana ? hex(['#f8f5ee', '#f4efe3', '#f1ead9'][Math.floor(r() * 3)]) : civic ? hex(r() < 0.5 ? '#f5efe4' : '#f3e3c3') : hex(newari ? PAL.brick[Math.floor(r() * PAL.brick.length)] : PAL.paints[Math.floor(r() * PAL.paints.length)]);
    const A = Math.abs(area2(pts));
    const box = pitchedFlag ? obb(pts) : null;
    const pitched = pitchedFlag && box && box.fill > 0.78 && Math.min(box.su, box.sv) < 13;
    // stepped silhouette: some taller flat-roofed houses get a smaller top floor
    const setback = !pitched && lv >= 4 && A > 60 && r() < 0.4;
    const mainLv = setback ? lv - 1 : lv;
    const h = mainLv * FLOOR + (r() - 0.5) * 0.5;
    const top = base + (pitched ? h : h + PARAPET);
    // Kathmandu look: the street front is painted, the sides (waiting for a future neighbour) are raw brick or grey concrete
    const street = pts.map((p1, i) => { const p2 = pts[(i + 1) % pts.length], L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1, nx = (p2[1] - p1[1]) / L, nz = -(p2[0] - p1[0]) / L;
      return L > 1.5 && nearRoad((p1[0] + p2[0]) / 2 + nx * 1.5, (p1[1] + p2[1]) / 2 + nz * 1.5, 5); });
    if (!street.some(Boolean)) { let bi = 0, bl = 0; pts.forEach((p1, i) => { const p2 = pts[(i + 1) % pts.length], L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); if (L > bl) { bl = L; bi = i; } }); street[bi] = true; }
    const rawSides = !newari && !rana && !civic && bc < 0 && lv >= 2 && r() < 0.8;
    const sideCol = hex(r() < 0.65 ? PAL.brick[Math.floor(r() * PAL.brick.length)] : ['#9b958c', '#a8a196', '#8f8a82'][Math.floor(r() * 3)]);
    const edges = rawSides ? street.map((st) => (st ? null : { paint: sideCol, info: [seed, 0, 0, 0] })) : null;
    const stairs = !pitched && !setback && !civic && !rana && houses.length < STREET_LIFE.houses.maxPerTile && r() < STREET_LIFE.houses.chance ? planHouseStairs(pts,base+h,H,street,r) : null;
    const opening = !stairs && shop && !civic && !rana && shops.length < STREET_LIFE.shops.maxPerTile && r() < STREET_LIFE.shops.chance ? shopOpening(pts, street, base, base + h, r) : null;
    wallRing(pts, footing, top, base, 0, 0, paint, [seed, rana ? 0 : shop, mainLv, newari ? 0 : rana ? 2 : 1], edges, stairs||opening);
    facade(pts, street, base, mainLv, pitched ? base + h : top, newari, rana, shop && !rana, paint, r, !pitched);
    if (!pitched && !newari && !rana && r() < 0.42) rebar(pts, base + h);   // the "future floor" rods on unfinished roofs
    const footprint = stairs ? stairs.footprint : opening ? pts.flatMap((p, i) => i === opening.edge ? [p, opening.a, opening.ai, opening.bi, opening.b] : [p]) : pts;
    solids.push({ pts: footprint, h: stairs ? base+h : top, base: footing, roof: pitched ? top - 0.4 : base + h });
    if(stairs)furnishHouseStairs(stairs,pts,top);
    if (opening) {
      solids.push({ pts: [opening.a, opening.b, opening.bi, opening.ai], h: top, base: opening.y + STREET_LIFE.shops.opening, roof: pitched ? top - 0.4 : base + h });
      furnishShop(opening, r);
    }
    pathPoly(oc, pts); oc.fillStyle = '#000'; oc.fill();
    pathPoly(mc, pts); mc.fillStyle = newari ? '#d9825f' : civic ? '#bdb2a8' : '#c9a7d6'; mc.fill();
    if (pitched) pitchedRoof(box, base + h, paint, r);
    else flatRoof(stairs?footprint:pts, base + h, top, paint, r, cx, cz, A, false, stairs?pts:null);
    if (setback) {
      const s = Math.max(0.55, 1 - 1.4 / Math.sqrt(A / Math.PI));
      const inner = pts.map((p) => [cx + (p[0] - cx) * s, cz + (p[1] - cz) * s]);
      const pc = paint.map((c) => Math.min(1, c * 1.08 + 0.03));
      const b2 = base + h, t2 = b2 + FLOOR + PARAPET * 0.6;
      wallRing(inner, b2, t2, b2, 1, 10, pc, [seed + 0.37, 0, 2, newari ? 0 : 1]);
      flatRoof(inner, b2 + FLOOR, t2, pc, r, cx, cz, A * s * s, true);
      solids.push({pts:inner,h:t2,base:b2,roof:b2+FLOOR});
    }
    if (!newari && !civic && lv >= 2) balconies(pts, base, lv, r);
    if (ni >= 0) names.push([tile.names[ni], cx, cz, 20]);
  }

  /** A box stuck onto a wall (5 faces; the back is hidden in the wall). u = along the wall, n = outward. */
  function slab(cx, cz, ux, uz, nx, nz, half, y0, y1, depth, col, buf = relief) {
    const P = (s, d, y) => [cx + ux * half * s + nx * d, y, cz + uz * half * s + nz * d];
    const q = (a, b, c, d, nn) => buf.quad(buf.v({ position: a, normal: nn, color: col }), buf.v({ position: b, normal: nn, color: col }), buf.v({ position: c, normal: nn, color: col }), buf.v({ position: d, normal: nn, color: col }), nn);
    if(y1-y0<.16||half<.12){
      q(P(-1,depth,y0),P(1,depth,y0),P(1,depth,y1),P(-1,depth,y1),[nx,0,nz]);
      q(P(-1,0,y1),P(-1,depth,y1),P(1,depth,y1),P(1,0,y1),[0,1,0]);
      q(P(-1,0,y0),P(1,0,y0),P(1,depth,y0),P(-1,depth,y0),[0,-1,0]);
      for(const s of [-1,1])q(P(s,0,y0),P(s,0,y1),P(s,depth,y1),P(s,depth,y0),[ux*s,0,uz*s]);
      return;
    }
    const bevel=Math.min(MYTHIC.architecture.bevel,(y1-y0)*.22,depth*.3,half*.1),inset=1-bevel/half;
    q(P(-inset,depth,y0+bevel),P(inset,depth,y0+bevel),P(inset,depth,y1-bevel),P(-inset,depth,y1-bevel),[nx,0,nz]);
    const outer=[P(-1,depth-bevel,y0),P(1,depth-bevel,y0),P(1,depth-bevel,y1),P(-1,depth-bevel,y1)];
    const inner=[P(-inset,depth,y0+bevel),P(inset,depth,y0+bevel),P(inset,depth,y1-bevel),P(-inset,depth,y1-bevel)];
    const normals=[[0,-1,0],[ux,0,uz],[0,1,0],[-ux,0,-uz]];
    const back=[P(-1,0,y0),P(1,0,y0),P(1,0,y1),P(-1,0,y1)];
    for(let i=0;i<4;i++){
      const j=(i+1)%4,n=normals[i],bn=[(n[0]+nx)*Math.SQRT1_2,n[1]*Math.SQRT1_2,(n[2]+nz)*Math.SQRT1_2];
      q(outer[i],outer[j],inner[j],inner[i],bn);q(back[i],back[j],outer[j],outer[i],n);
    }
  }
  /**
   * Facade depth for street fronts: cornice ledges, window sills & lintels, concrete chajjas (sunshades), carved
   * Newari frames, striped shop awnings; plus a parapet cap all round. Only drawn near the pup (relief mesh LOD).
   */
  function facade(pts, street, base, floors, top, newari, rana, shop, paint, r, cap) {
    relief.surface = newari ? 1 : 0;
    const trim = newari ? hex('#4a2614') : rana ? hex('#fffaf0') : paint.map((c) => Math.min(1, c * 1.18 + 0.06));
    const stone = newari ? hex('#3a1d0f') : hex('#efe6d6'), AW = ['#a7594c','#3f7069','#b39056','#4c6a7a','#776783','#a66c47','#658274'];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length], dx = p2[0] - p1[0], dz = p2[1] - p1[1], L = Math.hypot(dx, dz);
      if (L < 1.6) continue;
      const ux = dx / L, uz = dz / L, nx = dz / L, nz = -dx / L, mx = (p1[0] + p2[0]) / 2, mz = (p1[1] + p2[1]) / 2;
      if (cap) slab(mx, mz, ux, uz, nx, nz, L / 2 + 0.06, top - 0.02, top + 0.1, 0.1, trim);
      if (!street[i]) continue;
      for (let k = 1; k < Math.min(floors, 5); k++) slab(mx, mz, ux, uz, nx, nz, L / 2, base + k * FLOOR - 0.07, base + k * FLOOR + 0.07, newari ? 0.07 : 0.12, trim);
      const bays = Math.max(1, Math.round(L / BAY));
      for (let b = 0; b < bays; b++) {
        const t = (b + 0.5) / bays, cx = p2[0] - dx * t, cz = p2[1] - dz * t;
        if (shop && L > 2.4 && r() < 0.75) {   // a canvas awning over each shopfront
          const col = hex(AW[Math.floor(r() * AW.length)]), half = Math.min(1.25, (L / bays) / 2 - 0.05), y0 = base + 2.55, d = 0.85;
          const P = (s, dd, y) => [cx + ux * half * s + nx * dd, y, cz + uz * half * s + nz * dd];
          const ny = [nx * 0.42, 0.9, nz * 0.42];
          relief.quad(relief.v({ position: P(-1, 0.02, y0), normal: ny, color: col }), relief.v({ position: P(1, 0.02, y0), normal: ny, color: col }), relief.v({ position: P(1, d, y0 - 0.42), normal: ny, color: col }), relief.v({ position: P(-1, d, y0 - 0.42), normal: ny, color: col }), ny);
          const dn = [-ny[0], -ny[1], -ny[2]];
          relief.quad(relief.v({ position: P(-1, 0.02, y0 - 0.01), normal: dn, color: col }), relief.v({ position: P(-1, d, y0 - 0.43), normal: dn, color: col }), relief.v({ position: P(1, d, y0 - 0.43), normal: dn, color: col }), relief.v({ position: P(1, 0.02, y0 - 0.01), normal: dn, color: col }), dn);
          // Soft scalloped canvas edge; merged into the existing facade draw, with no new objects.
          const count=4;
          for(let j=0;j<count;j++)for(let sub=0;sub<3;sub++){
            const t0=(j+sub/3)/count,t1=(j+(sub+1)/3)/count;
            const low=t=>y0-.49-.12*Math.sin((t*count%1)*Math.PI);
            const V=(t,y)=>relief.v({position:P(t*2-1,d+.015,y),normal:[nx,0,nz],color:col,surface:0});
            relief.quad(V(t0,y0-.42),V(t0,low(t0)),V(t1,low(t1)),V(t1,y0-.42),[nx,0,nz]);
          }
        }
        for (let f = 1; f < Math.min(floors, 4); f++) {
          if (r() < 0.15) continue;
          const fb = base + f * FLOOR;
          if(f===1&&b%3===0&&r()<.42)props.plants.push(cx+nx*.31,fb+.95,cz+nz*.31,r());
          if (newari) {          // carved window: thick dark frame + little hood
            slab(cx, cz, ux, uz, nx, nz, 0.72, fb + 0.82, fb + 0.95, 0.16, stone);
            slab(cx - ux * 0.66, cz - uz * 0.66, ux, uz, nx, nz, 0.07, fb + 0.95, fb + 2.15, 0.12, trim);
            slab(cx + ux * 0.66, cz + uz * 0.66, ux, uz, nx, nz, 0.07, fb + 0.95, fb + 2.15, 0.12, trim);
            slab(cx, cz, ux, uz, nx, nz, 0.82, fb + 2.15, fb + 2.32, 0.22, stone);
          } else {
            slab(cx, cz, ux, uz, nx, nz, 0.66, fb + 0.86, fb + 0.95, 0.15, stone);                 // sill
            slab(cx, cz, ux, uz, nx, nz, 0.7, fb + 2.12, fb + 2.24, 0.1, trim);                    // lintel
            if (!rana && r() < 0.55) slab(cx, cz, ux, uz, nx, nz, 0.85, fb + 2.3, fb + 2.36, 0.48, hex('#d9d2c4'));   // concrete chajja
          }
        }
      }
    }
  }
  /** Clusters of rebar sticking out of unfinished roofs (drawn with the wire lines). */
  function rebar(pts, y) {
    const cols = [...pts];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 7) cols.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
    let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
    for (const p of cols) {
      const x = p[0] + (cx - p[0]) * 0.06, z = p[1] + (cz - p[1]) * 0.06, h = 0.7 + ((x * 7 + z * 3) % 1 + 1) % 1 * 0.6;
      for (const [ox, oz] of [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]]) wires.push(x + ox, y, z + oz, x + ox * 1.6, y + h, z + oz * 1.6);
    }
  }

  /** Walls of a footprint from y0 to y1. Window rows start at floorBase (+floorOffset floors); wallLift skips the dark street-level grime. */
  function wallRing(pts, y0, y1, floorBase, floorOffset, wallLift, paint0, info0, edges = null, opening = null) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const paint = edges?.[i]?.paint || paint0, info = edges?.[i]?.info || info0;
      const p1 = pts[i], p2 = pts[(i + 1) % n];
      const dx = p2[0] - p1[0], dz = p2[1] - p1[1], len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const nx = dz / len, nz = -dx / len, bays = Math.max(1, Math.round(len / BAY));
      const inf = len < 1.4 ? [info[0], info[1], 0, info[3]] : info;
      const off = (i * 2.3 + info[0] * 9) % 5;
      const V = (p, y, u) => walls.v({ position: [p[0], y, p[1]], normal: [nx, 0, nz], uv: [u, floorOffset + (y - floorBase) / FLOOR], wall: [off + (u / bays) * len, y - y0 + wallLift], paint, info: inf });
      if (opening?.edge === i) {
        const left = len / 2 - opening.width / 2, right = len / 2 + opening.width / 2;
        const at = (s) => [p1[0] + dx * s / len, p1[1] + dz * s / len];
        const section = (a, b, low, high) => walls.quad(V(at(b), low, bays * (1 - b / len)), V(at(a), low, bays * (1 - a / len)), V(at(a), high, bays * (1 - a / len)), V(at(b), high, bays * (1 - b / len)), [nx, 0, nz]);
        section(0, left, y0, y1); section(right, len, y0, y1);
        section(left, right, opening.y + (opening.height??STREET_LIFE.shops.opening), y1); section(left, right, y0, opening.y);
      } else walls.quad(V(p2, y0, 0), V(p1, y0, bays), V(p1, y1, bays), V(p2, y1, 0), [nx, 0, nz]);
    }
  }

  function flatRoof(pts, y, top, paint, r, cx, cz, A, small = false, outline = null) {
    const deck = (roofOverride >= 0 ? intCol(roofOverride) : hex(PAL.roofDeck)).map((c) => c * (0.92 + r() * 0.12));
    const coords = []; for (const p of pts) coords.push(p[0], p[1]);
    const tris = earcut(coords), b0 = detail.n;
    for (const p of pts) detail.v({ position: [p[0], y + 0.02, p[1]], normal: [0, 1, 0], color: deck });
    for (let i = 0; i < tris.length; i += 3) detail.tri(b0 + tris[i], b0 + tris[i + 1], b0 + tris[i + 2], [0, 1, 0]);
    const boundary=outline||pts;
    const railing = !small && r() < 0.25;
    const cap = railing ? hex(pal(PAL.trims)) : paint.map((c) => c * 0.65 + 0.35);
    for (let i = 0; i < boundary.length; i++) {
      const p1 = boundary[i], p2 = boundary[(i + 1) % boundary.length], dx = p2[0] - p1[0], dz = p2[1] - p1[1], len = Math.hypot(dx, dz); if (len < 0.05) continue;
      const nx = dz / len, nz = -dx / len, o = 0.14, inn = 0.22;
      const V = (p, k, yy, nn) => detail.v({ position: [p[0] + nx * k, yy, p[1] + nz * k], normal: nn, color: cap });
      detail.quad(V(p1, o, top + 0.12, [0, 1, 0]), V(p1, -inn, top + 0.12, [0, 1, 0]), V(p2, -inn, top + 0.12, [0, 1, 0]), V(p2, o, top + 0.12, [0, 1, 0]), [0, 1, 0]);
      detail.quad(V(p2, o, top - 0.06, [nx, 0, nz]), V(p1, o, top - 0.06, [nx, 0, nz]), V(p1, o, top + 0.12, [nx, 0, nz]), V(p2, o, top + 0.12, [nx, 0, nz]), [nx, 0, nz]);
      detail.quad(V(p1, -inn, y, [-nx, 0, -nz]), V(p1, -inn, top + 0.12, [-nx, 0, -nz]), V(p2, -inn, top + 0.12, [-nx, 0, -nz]), V(p2, -inn, y, [-nx, 0, -nz]), [-nx, 0, -nz]);
    }
    if (small) return;
    if(outline){
      const a=outline[outline.length-1],b=outline[outline.length-2];
      props.laundry.push(a[0]*.8+cx*.2,y+1.6,a[1]*.8+cz*.2,b[0]*.8+cx*.2,y+1.6,b[1]*.8+cz*.2);
      return; // the stair exit and basket need a clear terrace, not randomly overlapping roof props
    }
    // rooftop life: black water tanks, solar heaters, potted plants, stair rooms, laundry lines
    const t = tris.length ? [tris[0], tris[1], tris[2]] : [0, 1, 2];
    const rp = () => { const a = r(), b = r() * (1 - a); const q = [pts[t[0]], pts[t[1]], pts[t[2]]]; return [q[0][0] * a + q[1][0] * b + q[2][0] * (1 - a - b), q[0][1] * a + q[1][1] * b + q[2][1] * (1 - a - b)]; };
    if (A > 20 && r() < 0.8) { const [x, z] = rp(); props.tanks.push((x + cx) / 2, y, (z + cz) / 2, r() * 6); }
    if (A > 60 && r() < 0.35) { const [x, z] = rp(); props.solar.push((x + cx) / 2, y, (z + cz) / 2, r() * 6); }
    if (r() < 0.45) for (let k = 0; k < 2 + r() * 4; k++) { const [x, z] = rp(); props.plants.push(x * 0.7 + cx * 0.3, y, z * 0.7 + cz * 0.3, r()); }
    if (A > 50 && r() < 0.18) {
      const [x, z] = rp(),bx=(x+cx)/2,bz=(z+cz)/2;
      detail.box(bx,bz,1,0,1.3,1.3,y,y+2.3,paint.map((c)=>c*.9));
      solids.push({pts:boxPoints(bx,bz,1,0,1.3,1.3),h:y+2.3,base:y});
    }
    if (A > 40 && r() < 0.3) { const a = pts[0], b = pts[Math.floor(pts.length / 2)]; props.laundry.push(a[0] * 0.8 + cx * 0.2, y + 1.6, a[1] * 0.8 + cz * 0.2, b[0] * 0.8 + cx * 0.2, y + 1.6, b[1] * 0.8 + cz * 0.2); }
    if (core > 0.2 && A > 30 && r() < 0.25) { const a = pts[0], b = pts[(Math.floor(pts.length / 2) + 1) % pts.length]; props.flags.push(a[0], top + 1.6, a[1], b[0], top + 1.2, b[1]); }
  }

  function pitchedRoof(box, h, paint, r) {
    detail.surface = 2;
    const [ax, az] = box.ax, long = box.su >= box.sv;
    const ux = long ? ax : -az, uz = long ? az : ax, vx = -uz, vz = ux;
    const hl = Math.max(box.su, box.sv) / 2 + 0.45, hw = Math.min(box.su, box.sv) / 2 + 0.55;
    const rise = (hw - 0.55) * 0.62, ridge = h + rise, eave = h - 0.55 * 0.62;
    const col = roofOverride >= 0 ? intCol(roofOverride) : hex(PAL.roofs[Math.floor(r() * PAL.roofs.length)]);
    const [ox2, oz2] = box.c;
    for(const sign of [-1,1])for(let i=0;i<WORLD.roofSlices;i++) {
      const v0=hw*i/WORLD.roofSlices,v1=hw*(i+1)/WORLD.roofSlices,mid=(v0+v1)*.5*sign;
      occluders.push({pts:boxPoints(ox2+vx*mid,oz2+vz*mid,ux,uz,hl,(v1-v0)/2),base:eave-.02,h:ridge-(ridge-eave)*v0/hw+.02});
    }
    for (const s of [1, -1]) {
      const L = Math.hypot(rise, hw), n = [(vx * s * rise) / L, hw / L, (vz * s * rise) / L];
      const P = (u, v, y) => detail.v({ position: [ox2 + ux * u + vx * v, y, oz2 + uz * u + vz * v], normal: n, color: col });
      detail.quad(P(-hl, hw * s, eave), P(hl, hw * s, eave), P(hl, 0, ridge), P(-hl, 0, ridge), n);
    }
    detail.surface = 0;
    const gc = paint.map((c) => c * 0.9);
    for (const s of [1, -1]) {
      const u = s * (hl - 0.45);
      const P = (v, y) => detail.v({ position: [ox2 + ux * u + vx * v, y, oz2 + uz * u + vz * v], normal: [ux * s, 0, uz * s], color: gc });
      detail.tri(P(-(hw - 0.55), h), P(hw - 0.55, h), P(0, ridge), [ux * s, 0, uz * s]);
    }
  }

  function balconies(pts, base, lv, r) {
    if (r() > 0.5) return;
    const edges = pts.map((p, i) => [p, pts[(i + 1) % pts.length]]).filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 4).sort((a, b) => Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) - Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]));
    const trim = hex(pal(PAL.trims)), slab = hex('#dcd6cb');
    for (const [a, b] of edges.slice(0, 1 + (r() < 0.4 ? 1 : 0))) {
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = uz, nz = -ux;
      const w = Math.min(len * 0.55, 5), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      for (let f = 1; f < lv; f++) {
        if (r() < 0.35) continue;
        const y = base + f * FLOOR, cx = mx + nx * 0.45, cz = mz + nz * 0.45;
        detail.box(cx, cz, ux, uz, w / 2, 0.45, y - 0.12, y + 0.02, slab);
        detail.box(mx + nx * 0.88, mz + nz * 0.88, ux, uz, w / 2, 0.03, y + 0.02, y + 0.95, trim);
        for (const s of [-1, 1]) detail.box(mx + nx * 0.45 + ux * s * (w / 2 - 0.03), mz + nz * 0.45 + uz * s * (w / 2 - 0.03), ux, uz, 0.03, 0.45, y + 0.02, y + 0.95, trim);
        if (r() < 0.45) props.laundry.push(mx + nx * 0.6 - ux * w * 0.45, y + 1.9, mz + nz * 0.6 - uz * w * 0.45, mx + nx * 0.6 + ux * w * 0.45, y + 1.9, mz + nz * 0.6 + uz * w * 0.45);
        if (r() < 0.5) props.plants.push(mx + nx * 0.75 + ux * (r() - 0.5) * w * 0.8, y + 0.02, mz + nz * 0.75 + uz * (r() - 0.5) * w * 0.8, r());
      }
    }
  }

  function scatterAlongRoad(p, kind, w, mat) {
    const motor = MOTOR.has(kind), lane = !MAJOR.has(kind) && kind !== 'footway' && kind !== 'path';
    let prevPole = null, side = 1;
    let accT = R() * 12, accF = R() * 20, accP = R() * 25, accB = R() * 18;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
      const at = (t, off) => [a[0] + ux * t + nx * off, a[1] + uz * t + nz * off];
      for (; accT < L; accT += 10 + R() * 12) { // street trees
        const s = R() < 0.5 ? -1 : 1, [x, z] = at(accT, s * (w / 2 + 1 + R()));
        if (R() < (MAJOR.has(kind) ? 0.55 : 0.3) * ctx.quality.treeDensity && free(x, z, 1)) props.trees.push(x, H(x, z), z, pickTree(core), 0.75 + R() * 0.45);
      }
      accT -= L;
      for (; lane && accF < L; accF += 14 + R() * 18) { // prayer flags across lanes
        if (R() > 0.25 + core * 0.7) continue;
        const span = w / 2 + 2, sk = (R() - 0.5) * 5, [x, z] = at(accF, 0), y1 = H(x, z) + 4.5 + R() * 3, y2 = H(x, z) + 4.5 + R() * 3;
        props.flags.push(x + nx * span + ux * sk, y1, z + nz * span + uz * sk, x - nx * span - ux * sk, y2, z - nz * span - uz * sk);
      }
      accF -= L;
      for (; motor && accP < L; accP += 24 + R() * 10) { // power poles, tangled wires, lamps
        const [x, z] = at(accP, side * (w / 2 + 0.5)); side = -side;
        const y = H(x, z), rot = Math.atan2(ux, uz);
        props.poles.push(x, y, z, rot); circles.push([x, z, 0.16, y + 8]);
        if (R() < 0.45) props.lamps.push(x, y, z, Math.atan2(nx * side, nz * side));
        if (prevPole && Math.hypot(prevPole[0] - x, prevPole[2] - z) < 45) {
          const k = 2 + Math.floor(R() * 3);
          for (let j = 0; j < k; j++) wire(prevPole, [x, y, z], 0.3 + R() * 1.2, j);
        }
        prevPole = [x, y, z];
      }
      accP -= L;
      for (; motor && mat === 0 && accB < L; accB += STREET_LIFE.parkedBikes.gap[0] + R() * (STREET_LIFE.parkedBikes.gap[1] - STREET_LIFE.parkedBikes.gap[0])) {
        if (R() > STREET_LIFE.parkedBikes.chance) continue;
        const [x, z] = at(accB, (R() < 0.5 ? 1 : -1) * (w / 2 + 0.4));
        if(!free(x,z,0))continue;
        props.bikes.push(x, H(x, z), z, Math.atan2(ux, uz) + (R() - 0.5) * 0.12);
      }
      accB -= L;
    }
  }

  function wire(a, b, sag, k) {
    const ya = a[1] + 6.9 - k * 0.35, yb = b[1] + 6.9 - ((k + 1) % 4) * 0.35;
    for (let s = 0; s < 8; s++) {
      const t0 = s / 8, t1 = (s + 1) / 8;
      wires.push(a[0] + (b[0] - a[0]) * t0 + k * 0.12, ya + (yb - ya) * t0 - Math.sin(Math.PI * t0) * sag, a[2] + (b[2] - a[2]) * t0,
        a[0] + (b[0] - a[0]) * t1 + k * 0.12, ya + (yb - ya) * t1 - Math.sin(Math.PI * t1) * sag, a[2] + (b[2] - a[2]) * t1);
    }
  }
}

function pointIn(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Polyline -> flat ribbon (roads, rivers). Also paints the minimap and the occupancy mask. */
function ribbon(buf, pts, w, H, lift, road, mc, mmColor, oc, maskW = w) {
  if (pts.length < 2) return;
  // subdivide long segments so the ribbon follows the terrain
  const p = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 8));
    for (let k = 1; k <= n; k++) p.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const L = [], Rr = [], D = []; let dist = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i]; let dx = 0, dz = 0;
    if (i > 0) { const o = p[i - 1], l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1; dx += (q[0] - o[0]) / l; dz += (q[1] - o[1]) / l; dist += l; }
    if (i < p.length - 1) { const o = p[i + 1], l = Math.hypot(o[0] - q[0], o[1] - q[1]) || 1; dx += (o[0] - q[0]) / l; dz += (o[1] - q[1]) / l; }
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let miter = 1;
    if (i > 0 && i < p.length - 1) { const o = p[i - 1], l0 = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1; miter = Math.min(2.2, 1 / Math.max(0.35, dx * ((q[0] - o[0]) / l0) + dz * ((q[1] - o[1]) / l0))); }
    const nx = -dz, nz = dx;
    const edge=road?.soft?Math.min(.24,w*.12)*Math.sin(q[0]*.43+q[1]*.31)*Math.sin(dist*.19):0;
    L.push([q[0] + nx * (w/2+edge) * miter, q[1] + nz * (w/2+edge) * miter]); Rr.push([q[0] - nx * (w/2-edge*.7) * miter, q[1] - nz * (w/2-edge*.7) * miter]); D.push(dist);
  }
  if (buf) for (let i = 0; i < p.length - 1; i++) {
    const V = (q, u, v) => {
      const y = H(q[0], q[1]) + lift;
      const dx=road?H(q[0]+1,q[1])-H(q[0]-1,q[1]):0,dz=road?H(q[0],q[1]+1)-H(q[0],q[1]-1):0,n=Math.hypot(dx,2,dz);
      return road ? buf.v({ position: [q[0], y, q[1]], normal: [-dx/n,2/n,-dz/n], color: road.color, uv: [u, v], roadw: [w, road.kind, road.lanes || 0] }) : buf.v({ position: [q[0], y, q[1]], normal: [0, 1, 0] });
    };
    if(!road)buf.quad(V(L[i],0,D[i]),V(L[i+1],0,D[i+1]),V(Rr[i+1],1,D[i+1]),V(Rr[i],1,D[i]),[0,1,0]);
    else {
      const points=[L[i],L[i+1],Rr[i+1],Rr[i]],uv=[[0,D[i]],[0,D[i+1]],[1,D[i+1]],[1,D[i]]];
      for(const ids of [[0,1,2],[0,2,3]]){
        const [a,b,c]=ids.map(k=>points[k]),det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(det)<1e-9)continue;
        for(const piece of terrainPieces([a,b,c],WORLD.tileSize/WORLD.terrain.meshSegments)){
          const vertices=piece.map(q=>{
            const wb=((q[0]-a[0])*(c[1]-a[1])-(q[1]-a[1])*(c[0]-a[0]))/det,wc=((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]))/det,wa=1-wb-wc;
            return V(q,uv[ids[0]][0]*wa+uv[ids[1]][0]*wb+uv[ids[2]][0]*wc,uv[ids[0]][1]*wa+uv[ids[1]][1]*wb+uv[ids[2]][1]*wc);
          });
          for(let j=1;j<vertices.length-1;j++)buf.tri(vertices[0],vertices[j],vertices[j+1],[0,1,0]);
        }
      }
    }
  }
  // minimap & mask strokes (tile-local pixel space is set by the caller's transform)
  for (const [c, col, lw] of [[mc, mmColor, Math.max(1.2, w / 2)], [oc, '#000', maskW / 2 + 1]]) {
    if (!c) continue;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.strokeStyle = col; c.lineWidth = lw; c.lineCap = c.lineJoin = 'round';
    c.beginPath();
    const T = c.__tile; pts.forEach((q, i) => { const x = (q[0] - T.ox) / T.mpp, y = (q[1] - T.oz) / T.mpp; i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke(); c.restore();
  }
}

function segDistance(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

/** Vertical n-sided prism (columns, statues) into a vertex-colour buffer. */
function prism(buf, cx, cz, r, y0, y1, n, color) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r], nn = [Math.cos(am), 0, Math.sin(am)];
    const V = (p, y, nrm) => buf.v({ position: [p[0], y, p[1]], normal: nrm, color });
    buf.quad(V(p0, y0, nn), V(p1, y0, nn), V(p1, y1, nn), V(p0, y1, nn), nn);
    buf.tri(V([cx, cz], y1, [0, 1, 0]), V(p0, y1, [0, 1, 0]), V(p1, y1, [0, 1, 0]), [0, 1, 0]);
  }
}
