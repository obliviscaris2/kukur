/**
 * Prop geometry factories (merged, vertex-coloured, cartoon-chunky). Add a new prop here, then register it
 * in props/Props.js. Trees come in 5 kinds x 2 levels of detail.
 *   kinds: 0 peepal, 1 ashoka (columnar), 2 jacaranda (purple), 3 bougainvillea bush, 4 small lime tree
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tint = (g, hex) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
const part = (g, hex) => clean(tint(g, hex));
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
const merge = (parts) => mergeGeometries(parts, false);

export { treeGeometry, plantGeometry } from './natureGeometry.js';

export function scooterGeometry() {
  const P = [];
  for (const z of [-0.58, 0.58]) { const w = new THREE.CylinderGeometry(0.225, 0.225, 0.1, 10); w.rotateZ(Math.PI / 2); P.push(part(at(w, 0, 0.225, z), '#262626')); }
  const body = new THREE.CapsuleGeometry(0.16, 0.54, 2, 6); body.rotateX(Math.PI / 2); P.push(part(at(body, 0, 0.45, -0.12), '#ffffff'));
  P.push(part(at(new THREE.BoxGeometry(0.3, 0.09, 0.55), 0, 0.7, -0.15), '#2b2b2b'));
  P.push(part(at(new THREE.BoxGeometry(0.52, 0.04, 0.06), 0, 0.98, 0.43), '#888888'));
  P.push(part(at(new THREE.BoxGeometry(0.28, 0.52, 0.13), 0, 0.65, 0.44), '#ffffff'));
  return merge(P);
}
export function tankGeometry() { // black Sintex water tank on a stand
  return merge([part(at(new THREE.CylinderGeometry(0.62, 0.62, 1.15, 8), 0, 1.58, 0), '#26282b'), part(at(new THREE.ConeGeometry(0.62, 0.3, 8), 0, 2.3, 0), '#26282b'),
    part(at(new THREE.BoxGeometry(1.1, 1.0, 1.1), 0, 0.5, 0), '#bdb5a6')]);
}
export function solarGeometry() { // rooftop solar water heater: tilted panel + white tank
  const panel = new THREE.BoxGeometry(1.4, 0.06, 1.8); panel.rotateX(-0.6); panel.translate(0, 0.9, 0);
  const tank = new THREE.CylinderGeometry(0.25, 0.25, 1.5, 8); tank.rotateZ(Math.PI / 2); tank.translate(0, 1.45, -0.6);
  const leg = new THREE.BoxGeometry(1.3, 0.6, 0.08); leg.translate(0, 0.3, 0.6);
  return merge([part(panel, '#2b4a8c'), part(tank, '#f2f2f2'), part(leg, '#9a9a9a')]);
}
export function poleGeometry() {
  return merge([part(at(new THREE.CylinderGeometry(0.09, 0.14, 7.5, 5, 1, true), 0, 3.75, 0), '#9a948a'), part(at(new THREE.BoxGeometry(1.4, 0.1, 0.1), 0, 7.1, 0), '#7d776d'),
    part(at(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 6), 0.32, 5.8, 0), '#7c8a90')]);
}
export function lampGeometry() {
  return merge([part(at(new THREE.BoxGeometry(0.08, 0.08, 1.1), 0, 6.2, 0.55), '#5e5a52'), part(at(new THREE.ConeGeometry(0.28, 0.22, 6), 0, 6.1, 1.1), '#5e5a52')]);
}
export function benchGeometry() {
  return merge([part(at(new THREE.BoxGeometry(1.8, 0.1, 0.5), 0, 0.45, 0), '#a0662f'), part(at(new THREE.BoxGeometry(1.8, 0.4, 0.08), 0, 0.75, -0.22), '#a0662f'),
    part(at(new THREE.BoxGeometry(0.1, 0.45, 0.45), -0.75, 0.22, 0), '#5e5a52'), part(at(new THREE.BoxGeometry(0.1, 0.45, 0.45), 0.75, 0.22, 0), '#5e5a52')]);
}
export function flagGeometry() { const g = new THREE.PlaneGeometry(0.34, 0.44); g.translate(0, -0.24, 0); return g; }
export function clothGeometry() { const g = new THREE.PlaneGeometry(0.55, 0.7); g.translate(0, -0.38, 0); return g; }
