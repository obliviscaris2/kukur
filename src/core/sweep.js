/** Continuous segment/capsule tests against extruded footprints, including concave outlines and thin walls. */
import { pointInPolygon } from './collision.js';

function slab(a, d, lo, hi) {
  if (Math.abs(d) < 1e-10) return a < lo || a > hi ? null : [0, 1];
  let t0 = (lo - a) / d, t1 = (hi - a) / d;
  if (t0 > t1) [t0, t1] = [t1, t0];
  t0 = Math.max(0, t0); t1 = Math.min(1, t1);
  return t0 <= t1 ? [t0, t1] : null;
}

function disk(x, z, dx, dz, cx, cz, r) {
  const ox = x - cx, oz = z - cz, c = ox * ox + oz * oz - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz, b = ox * dx + oz * dz, det = b * b - a * c;
  if (a < 1e-16 || b >= 0 || det < 0) return Infinity;
  const t = (-b - Math.sqrt(det)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
}

function edge(x, z, dx, dz, a, b, r) {
  const ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez);
  if (len < 1e-9) return disk(x, z, dx, dz, ...a, r);
  const ux = ex / len, uz = ez / len, ox = x - a[0], oz = z - a[1];
  const along = slab(ox * ux + oz * uz, dx * ux + dz * uz, 0, len);
  const across = slab(ox * -uz + oz * ux, dx * -uz + dz * ux, -r, r);
  let t = Infinity;
  if (along && across && Math.max(along[0], across[0]) <= Math.min(along[1], across[1])) t = Math.max(along[0], across[0]);
  return Math.min(t, disk(x, z, dx, dz, ...a, r), disk(x, z, dx, dz, ...b, r));
}

/** Infinity means no contact. Radius expands both footprint and vertical slab, conservatively covering a sphere. */
export function prismFrac(a, b, pts, base, top, radius = 0, hollow = false) {
  const span = slab(a.y, b.y - a.y, base - radius, top + radius);
  if (!span) return Infinity;
  const [t0, t1] = span, x = a.x + (b.x - a.x) * t0, z = a.z + (b.z - a.z) * t0;
  if (!hollow && pointInPolygon(x, z, pts)) return t0;
  const dx = (b.x - a.x) * (t1 - t0), dz = (b.z - a.z) * (t1 - t0);
  let t = Infinity;
  for (let i = 0; i < pts.length; i++) t = Math.min(t, edge(x, z, dx, dz, pts[i], pts[(i + 1) % pts.length], radius));
  return Number.isFinite(t) ? t0 + t * (t1 - t0) : Infinity;
}

export function circlePrismFrac(a, b, c, radius = 0) {
  const span = slab(a.y, b.y - a.y, c.base - radius, c.h + radius);
  if (!span) return Infinity;
  const [t0, t1] = span;
  const t = disk(a.x + (b.x - a.x) * t0, a.z + (b.z - a.z) * t0, (b.x - a.x) * (t1 - t0), (b.z - a.z) * (t1 - t0), c.x, c.z, c.r + radius);
  return Number.isFinite(t) ? t0 + t * (t1 - t0) : Infinity;
}
