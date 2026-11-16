/** Directed road graph and distance-sampled lane curves; joins internal OSM vertices and respects one-way streets. */
import { TRAFFIC } from '../../config/index.js';

const DRIVABLE = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'pedestrian']);
export const isBike = (type) => ['scooter', 'scooter2', 'motorbike', 'pathao'].includes(type);

export class RoadNetwork {
  constructor() { this.nodes = []; this.edges = []; this.byId = new Map(); }
  rebuild(navs) {
    this.nodes = []; this.edges = []; this.byId.clear();
    const grid = new Map(), snap = TRAFFIC.route.join;
    const node = (x, z) => {
      const ix = Math.floor(x / snap), iz = Math.floor(z / snap);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const n of grid.get(`${ix + dx},${iz + dz}`) || []) if (Math.hypot(n.x - x, n.z - z) < snap) return n;
      const n = { id: `${Math.round(x * 10)},${Math.round(z * 10)}`, x, z, out: [] };
      const key = `${ix},${iz}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(n); this.nodes.push(n); return n;
    };
    for (const nav of navs) {
      if (!DRIVABLE.has(nav.kind) || nav.w < 3 || nav.pts.length < 4) continue;
      for (let i = 0; i < nav.pts.length / 2 - 1; i++) {
        const a = node(nav.pts[i * 2], nav.pts[i * 2 + 1]), b = node(nav.pts[i * 2 + 2], nav.pts[i * 2 + 3]);
        if (Math.hypot(b.x - a.x, b.z - a.z) < TRAFFIC.route.minSegment) continue;
        for (const dir of nav.oneway ? [1] : [1, -1]) {
          const from = dir === 1 ? a : b, to = dir === 1 ? b : a, id = `${from.id}>${to.id}`;
          if (this.byId.has(id)) continue;
          const edge = edgeFor(nav, dir === 1 ? i : i + 1, dir, from, to); edge.id = id;
          this.edges.push(edge); this.byId.set(id, edge); from.out.push(edge);
        }
      }
    }
  }
  accepts(edge, type) { return edge.w >= TRAFFIC.minRoad[type] && (!(edge.kind === 'pedestrian' || edge.kind === 'living_street') || isBike(type) || type === 'rickshaw'); }
  next(edge, type, random = Math.random) {
    let options = edge.to.out.filter((e) => e.to !== edge.from && this.accepts(e, type));
    // Avoid directing the whole queue into a cul-de-sac. At a true dead end,
    // return by the opposite lane only when the road can accommodate the turn.
    const through = options.filter(e => e.to.out.some(n => n.to !== e.from && this.accepts(n, type)));
    if (through.length) options = through;
    if (!options.length && edge.w >= TRAFFIC.turnRadius[type] * 1.6 + TRAFFIC.bodies[type][1]) options = edge.to.out.filter(e => e.to === edge.from && this.accepts(e, type));
    if (!options.length) return null;
    const weights = options.map((e) => Math.max(0.12, 1 + (edge.ux * e.ux + edge.uz * e.uz) * 1.8) * (e.to.out.some((n) => n.to !== e.from && this.accepts(n, type)) ? 1 : 0.2));
    let value = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < options.length; i++) if ((value -= weights[i]) <= 0) return options[i];
    return options.at(-1);
  }
}

export function edgeFor(nav, seg, dir, from, to) {
  from ??= { x: nav.pts[seg * 2], z: nav.pts[seg * 2 + 1], out: [] };
  to ??= { x: nav.pts[(seg + dir) * 2], z: nav.pts[(seg + dir) * 2 + 1], out: [] };
  const length = Math.hypot(to.x - from.x, to.z - from.z) || 0.001;
  return { from, to, nav, seg, dir, length, w: nav.w, kind: nav.kind, oneway: !!nav.oneway, ux: (to.x - from.x) / length, uz: (to.z - from.z) / length };
}

export function laneOffset(edge, type) {
  if (edge.oneway && (edge.nav.lanes || 1) === 1) return 0;
  return Math.max(0.35, Math.min(edge.w * 0.25 + (isBike(type) ? 0.12 : 0), edge.w * 0.5 - TRAFFIC.bodies[type][1] * 0.5 - 0.3, 2.6));
}

export function lanePoint(edge, distance, type, offset = laneOffset(edge, type)) {
  return { x: edge.from.x + edge.ux * distance + edge.uz * offset, z: edge.from.z + edge.uz * distance - edge.ux * offset, heading: Math.atan2(edge.ux, edge.uz) };
}

export function makeTurn(edge, next, type) {
  const radius = TRAFFIC.turnRadius[type], entry = Math.min(radius, edge.length * 0.38), exit = Math.min(radius, next.length * 0.38);
  const points = [lanePoint(edge, edge.length - entry, type), lanePoint(edge, edge.length, type), lanePoint(next, 0, type), lanePoint(next, exit, type)];
  return makeCurve(points, { start: edge.length - entry, exit, next, node: edge.to });
}

export function makeCurve(points, extras = {}) {
  const samples = TRAFFIC.route.turnSamples, lengths = new Float64Array(samples + 1);
  let prev = curvePoint(points, 0);
  for (let i = 1; i <= samples; i++) { const p = curvePoint(points, i / samples); lengths[i] = lengths[i - 1] + Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
  return { points, lengths, length: lengths[samples], ...extras };
}

export function sampleCurve(curve, distance) {
  const { lengths, points } = curve, n = lengths.length - 1;
  const d = Math.max(0, Math.min(curve.length, distance));
  let lo = 0, hi = n;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lengths[mid] < d) lo = mid; else hi = mid; }
  const t = (lo + (d - lengths[lo]) / Math.max(1e-6, lengths[hi] - lengths[lo])) / n;
  return curvePoint(points, Math.min(1, t));
}

function curvePoint([a, b, c, d], t) {
  const u = 1 - t, x = u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, z = u * u * u * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t * t * t * d.z;
  const dx = 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x), dz = 3 * u * u * (b.z - a.z) + 6 * u * t * (c.z - b.z) + 3 * t * t * (d.z - c.z);
  return { x, z, heading: Math.atan2(dx, dz) };
}
