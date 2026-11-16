/** Geographic helpers: lat/lon <-> local metres (+X east, +Z south) around the map origin. */
let LAT0 = 27.7043, LON0 = 85.3073, KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KZ = 110574;

export function setOrigin(lat, lon) {
  LAT0 = lat; LON0 = lon; KX = 111320 * Math.cos((lat * Math.PI) / 180);
}
export const toLocal = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
export const toLatLon = (x, z) => [LAT0 - z / KZ, LON0 + x / KX];

export const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
