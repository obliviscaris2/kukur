/** Allocation-light planar tests shared by road traffic and the static collision world. */
export function boxOverlap(a, b, padding = 0) {
  const ac = Math.cos(a.heading), as = Math.sin(a.heading), bc = Math.cos(b.heading), bs = Math.sin(b.heading);
  const dx = b.x - a.x, dz = b.z - a.z;
  let depth = Infinity, nx = 0, nz = 0;
  for (const [x, z] of [[ac, -as], [as, ac], [bc, -bs], [bs, bc]]) {
    const ra = a.halfWidth * Math.abs(ac * x - as * z) + a.halfLength * Math.abs(as * x + ac * z);
    const rb = b.halfWidth * Math.abs(bc * x - bs * z) + b.halfLength * Math.abs(bs * x + bc * z);
    const signed = dx * x + dz * z, overlap = ra + rb + padding - Math.abs(signed);
    if (overlap <= 0) return null;
    if (overlap < depth) { depth = overlap; nx = x * (signed < 0 ? -1 : 1); nz = z * (signed < 0 ? -1 : 1); }
  }
  return { nx, nz, depth };
}

export function boxCorners(b) {
  const c = Math.cos(b.heading), s = Math.sin(b.heading);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [b.x + x * b.halfWidth * c + z * b.halfLength * s, b.z - x * b.halfWidth * s + z * b.halfLength * c]);
}

export function circleBoxOverlap(box, circle) {
  const cs = Math.cos(box.heading), sn = Math.sin(box.heading), dx = circle.x - box.x, dz = circle.z - box.z;
  const x = dx * cs - dz * sn, z = dx * sn + dz * cs;
  return Math.hypot(x - Math.max(-box.halfWidth, Math.min(box.halfWidth, x)), z - Math.max(-box.halfLength, Math.min(box.halfLength, z))) < (circle.radius ?? circle.r);
}

export function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i][1] > z) !== (pts[j][1] > z) && x < (pts[j][0] - pts[i][0]) * (z - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) inside = !inside;
  return inside;
}

export function polygonsOverlap(a, b) {
  if (a.some(([x, z]) => pointInPolygon(x, z, b)) || b.some(([x, z]) => pointInPolygon(x, z, a))) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i], q = a[(i + 1) % a.length], r = b[j], s = b[(j + 1) % b.length];
    const ax = q[0] - p[0], az = q[1] - p[1], bx = s[0] - r[0], bz = s[1] - r[1], den = ax * bz - az * bx;
    if (Math.abs(den) < 1e-8) continue;
    const dx = r[0] - p[0], dz = r[1] - p[1], t = (dx * bz - dz * bx) / den, u = (dx * az - dz * ax) / den;
    if (t > 1e-5 && t < 1 - 1e-5 && u > 1e-5 && u < 1 - 1e-5) return true;
  }
  return false;
}
