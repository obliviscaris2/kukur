/** Plans a real open stairwell inside a house: stacked return flights, bounded slab collision and a roof exit. */
import { STREET_LIFE } from '../../config/index.js';
import { pointInPolygon } from '../../core/collision.js';

export function planHouseStairs(pts, deck, heightAt, street, random = Math.random) {
  const cfg = STREET_LIFE.houses;
  const candidates = pts
    .map((a, i) => ({ a, b: pts[(i + 1) % pts.length], edge: i }))
    .filter((e) => street[e.edge])
    .sort((a, b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) - Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]));
  for (const { a, b, edge } of candidates) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      ux = (b[0] - a[0]) / length,
      uz = (b[1] - a[1]) / length,
      nx = uz,
      nz = -ux,
      cx = (a[0] + b[0]) / 2,
      cz = (a[1] + b[1]) / 2;
    const at = (u, v) => ({ x: cx + ux * u - nx * v, z: cz + uz * u - nz * v });
    const available = Math.floor((length - 2 * cfg.landing - 0.3) / cfg.run);
    if (available < 8) continue;
    const base = heightAt(cx + nx * 0.4, cz + nz * 0.4),
      rise = deck - base;
    if (rise < 2 || rise > cfg.maxHeight) continue;
    let flights = Math.ceil(rise / (available * cfg.rise));
    if (flights % 2) flights++;
    const steps = Math.ceil(rise / (flights * cfg.rise)),
      stepRise = rise / (flights * steps),
      run = steps * cfg.run;
    if (steps * stepRise * 2 < cfg.headroom || flights > 6) continue;
    const half = run / 2 + cfg.landing,
      depth = cfg.offset + cfg.width * 2 + 0.15;
    const corners = [at(-half, 0.02), at(half, 0.02), at(half, depth), at(-half, depth)];
    if (!corners.slice(2).every((p) => pointInPolygon(p.x - nx * 0.1, p.z - nz * 0.1, pts))) continue;
    const goal = at(-run / 2 - cfg.landing * 0.5, depth + 0.7);
    if (!pointInPolygon(goal.x, goal.z, pts)) continue;
    const area = Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0)) / 2;
    if (half * 2 * depth > area * 0.48) continue;
    const boxes = [],
      platforms = [],
      route = [];
    const add = (u, v, hu, hv, y) => {
      const p = at(u, v),
        low = y - 0.13;
      const poly = [
        [-hu, -hv],
        [hu, -hv],
        [hu, hv],
        [-hu, hv],
      ].map(([du, dv]) => {
        const q = at(u + du, v + dv);
        return [q.x, q.z];
      });
      boxes.push({ x: p.x, z: p.z, ux, uz, hu, hv, low, high: y });
      platforms.push({ pts: poly, h: y, base: low });
      return { x: p.x, y, z: p.z };
    };
    const lane0 = cfg.offset + cfg.width / 2,
      lane1 = cfg.offset + cfg.width * 1.5 + 0.15;
    const start = add(-run / 2 - cfg.landing / 2, lane0, cfg.landing / 2, cfg.width / 2, base);
    route.push(start);
    for (let flight = 0; flight < flights; flight++) {
      const dir = flight % 2 ? -1 : 1,
        lane = flight % 2 ? lane1 : lane0;
      for (let i = 0; i < steps; i++)
        add((-run / 2 + (i + 0.5) * cfg.run) * dir, lane, cfg.run / 2, cfg.width / 2, base + (flight * steps + i + 1) * stepRise);
      const endU = (run / 2 + cfg.landing / 2) * dir,
        y = base + (flight + 1) * steps * stepRise;
      const end = add(endU, (lane0 + lane1) / 2, cfg.landing / 2, (lane1 - lane0 + cfg.width) / 2, y);
      route.push({ ...end, x: at(endU, lane).x, z: at(endU, lane).z });
      if (flight < flights - 1) {
        const next = at(endU, flight % 2 ? lane0 : lane1);
        route.push({ x: next.x, y, z: next.z });
      }
    }
    // Exit across the back of the stairwell onto the roof, with clear space for the basket.
    const endU = -run / 2 - cfg.landing / 2;
    add(endU, (lane1 + depth + 0.75) / 2, cfg.landing / 2, (depth + 0.75 - lane1) / 2, deck);
    route.push({ x: goal.x, y: deck, z: goal.z });
    const A = at(-half, 0),
      B = at(half, 0),
      AI = at(-half, depth),
      BI = at(half, depth);
    const footprint = pts.flatMap((p, i) => (i === edge ? [p, [A.x, A.z], [AI.x, AI.z], [BI.x, BI.z], [B.x, B.z]] : [p]));
    const entry = at(-run / 2 - cfg.landing / 2, -0.45),
      cache = at(-run / 2 - cfg.landing / 2, depth + 1.2);
    if (!pointInPolygon(cache.x, cache.z, pts)) continue;
    return {
      edge,
      x: cx,
      z: cz,
      y: base,
      width: half * 2,
      height: deck - base,
      deck,
      depth,
      ux,
      uz,
      nx,
      nz,
      footprint,
      boxes,
      platforms,
      route,
      entry: { ...entry, y: heightAt(entry.x, entry.z) },
      cache: { ...cache, y: deck },
      kind: Math.floor(random() * cfg.loot.length),
    };
  }
  return null;
}
