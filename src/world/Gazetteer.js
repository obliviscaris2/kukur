/**
 * Gazetteer: answers "where am I?" for the HUD, compass, signposts and map.
 * Data: assets/map/gazetteer.json (toles, popular streets, named parks/squares/ponds, landmarks) — only public
 * geography, never shops — plus the curated DESTINATIONS in config/places.js.
 *
 *   gz.describe(x, z) -> { title, ne, city, street, kind: 'landmark'|'area'|'tole', key }
 */
import { DESTINATIONS, VETS, WORLD } from '../config/index.js';
import { loadJSON } from '../core/assets.js';
import { toLocal } from '../core/geo.js';

const CELL = 96;
const PLACE_KINDS = ['city', 'town', 'suburb', 'quarter', 'neighbourhood', 'village', 'hamlet'];
/** half-widths (m) within which you count as "on" a street of rank 0..4 */
const STREET_REACH = [11, 9, 8, 7, 5];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function inPoly(x, z, flat) {
  let c = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1], xj = flat[j], zj = flat[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export class Gazetteer {
  async init() {
    const g = await loadJSON(WORLD.mapUrl + 'gazetteer.json').catch(() => ({ toles: [], streets: [], areas: [], landmarks: [] }));
    this.toles = g.toles.map(([name, ne, x, z, k]) => ({ name, ne, x, z, kind: PLACE_KINDS[k] }));
    // the valley's five cities (municipality boundaries aren't in the data; nearest weighted centre is close enough)
    const big = this.toles.filter((t) => (t.kind === 'city' || t.kind === 'town') && /kathmandu|lalitpur|bhaktapur|kirtipur|thimi/i.test(t.name));
    this.cities = big.length ? big : this.toles.filter((t) => t.kind === 'city' || t.kind === 'town');
    this.local = this.toles.filter((t) => t.kind !== 'city' && t.kind !== 'town');
    this.streets = g.streets.map(([name, ne, rank, parts]) => ({ name, ne, rank, parts }));
    this.areas = g.areas.map(([name, ne, kind, poly]) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]); }
      return { name, ne, kind, poly, box: [x0, z0, x1, z1], size: (x1 - x0) * (z1 - z0) };
    });
    this.landmarks = g.landmarks.map(([name, x, z, model, size]) => ({ name, x, z, model, size }));
    this.destinations = [...DESTINATIONS, ...VETS].map((d) => { const [x, z] = toLocal(d.lat, d.lon); return { ...d, x, z }; });
    this.vets = this.destinations.filter((d) => d.icon === 'vet');
    // spatial hash of street segments and area boxes
    this.grid = new Map();
    const put = (cx, cz, item) => { const k = cx + ',' + cz; let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(item); };
    this.streets.forEach((s, si) => {
      for (const flat of s.parts) for (let i = 2; i < flat.length; i += 2) {
        const ax = flat[i - 2], az = flat[i - 1], bx = flat[i], bz = flat[i + 1];
        for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++)
          for (let cz = Math.floor(Math.min(az, bz) / CELL); cz <= Math.floor(Math.max(az, bz) / CELL); cz++) put(cx, cz, [ax, az, bx, bz, si]);
      }
    });
    this.areaGrid = new Map();
    this.areas.forEach((a) => {
      const [x0, z0, x1, z1] = a.box;
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) { const k = cx + ',' + cz; (this.areaGrid.get(k) || this.areaGrid.set(k, []).get(k)).push(a); }
    });
    return this;
  }

  /** The street you are on (or beside), or null. */
  streetAt(x, z) {
    const cell = this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    if (!cell) return null;
    let best = null, bs = Infinity;
    for (const [ax, az, bx, bz, si] of cell) {
      const s = this.streets[si], d = segDist(x, z, ax, az, bx, bz), reach = STREET_REACH[s.rank] ?? 5;
      const score = d / reach - (4 - Math.min(4, s.rank)) * 0.05;   // prefer the bigger road at junctions
      if (d < reach && score < bs) { bs = score; best = s; }
    }
    return best;
  }
  /** The smallest named park / square / pond containing the point. */
  areaAt(x, z) {
    const cell = this.areaGrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    let best = null;
    if (cell) for (const a of cell) {
      const [x0, z0, x1, z1] = a.box;
      if (x < x0 || x > x1 || z < z0 || z > z1 || (best && a.size >= best.size)) continue;
      if (inPoly(x, z, a.poly)) best = a;
    }
    return best;
  }
  landmarkAt(x, z) {
    let best = null, bd = Infinity;
    for (const l of this.landmarks) {
      const d = Math.hypot(l.x - x, l.z - z), r = Math.max(22, l.size * 1.6);
      if (d < r && d / r < bd) { bd = d / r; best = l; }
    }
    return best;
  }
  toleAt(x, z) {
    let best = null, bd = Infinity;
    for (const t of this.local) {
      const w = t.kind === 'suburb' ? 1.35 : t.kind === 'village' ? 1.1 : 1;     // suburbs are big, neighbourhoods precise
      const d = Math.hypot(t.x - x, t.z - z) / w;
      if (d < bd) { bd = d; best = t; }
    }
    return bd < 1600 ? best : null;
  }
  cityAt(x, z) {
    let best = null, bd = Infinity;
    for (const t of this.cities) {
      const d = Math.hypot(t.x - x, t.z - z) * (/kathmandu/i.test(t.name) ? 0.6 : 1);
      if (d < bd) { bd = d; best = t; }
    }
    return best?.name || 'Kathmandu Valley';
  }

  /** Everything the HUD needs about a spot. */
  describe(x, z) {
    const lm = this.landmarkAt(x, z), area = this.areaAt(x, z), tole = this.toleAt(x, z), st = this.streetAt(x, z);
    const city = this.cityAt(x, z);
    if (lm) return { kind: 'landmark', key: 'l:' + lm.name, title: lm.name, ne: '', sub: tole ? `${tole.name} · ${city}` : city, street: st?.name || '', tole, at: { x: lm.x + lm.size * 0.7 + 3, z: lm.z + lm.size * 0.7 + 3 } };
    if (area && area.size > 900) return { kind: 'area', key: 'a:' + area.name, title: area.name, ne: area.ne, sub: tole ? `${tole.name} · ${city}` : city, street: st?.name || '', tole, at: { x, z } };
    return { kind: 'tole', key: 't:' + (tole?.name || city), title: tole?.name || city, ne: tole?.ne || '', sub: city, street: st?.name || '', tole, at: { x, z } };
  }
}
