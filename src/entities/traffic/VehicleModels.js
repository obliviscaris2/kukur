/** Low-poly vehicle silhouettes with painted bodies and detailed trim, batched into two meshes per type. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRAFFIC } from '../../config/index.js';
const DIMS = TRAFFIC.bodies;
function colored(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const wheel = (r, w, x, y, z) => mergeGeometries([colored(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2).translate(x, y, z), '#25262a'), ...[-1, 1].map((s) => colored(new THREE.CylinderGeometry(r * 0.58, r * 0.58, 0.012, 8).rotateZ(Math.PI / 2).translate(x + s * (w / 2 + 0.003), y, z), '#a7adb0'))]);
const ball = (r, x, y, z, hex, sy = 1) => colored(new THREE.SphereGeometry(r, 10, 7).scale(1, sy, 1).translate(x, y, z), hex);
function limb(a, b, radius, color) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
  return colored(new THREE.CylinderGeometry(radius, radius * 0.9, delta.length(), 6).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())).translate(...from.add(to).multiplyScalar(0.5).toArray()), color);
}
function panel(points, color, reverse = false) {
  if (reverse) points = [...points].reverse();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([points[0], points[1], points[2], points[0], points[2], points[3]].flat(), 3));
  geometry.computeVertexNormals(); return colored(geometry, color);
}
function cabin(len, width, color = '#ffffff') {
  const z = -len * 0.055, lower = width * 0.435, upper = width * 0.375;
  const p = [[-lower, 0.78, z + len * 0.27], [lower, 0.78, z + len * 0.27], [lower, 0.78, z - len * 0.27], [-lower, 0.78, z - len * 0.27], [-upper, 1.43, z + len * 0.17], [upper, 1.43, z + len * 0.17], [upper, 1.43, z - len * 0.18], [-upper, 1.43, z - len * 0.18]];
  return mergeGeometries([[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]].map((f) => panel(f.map((i) => p[i]), color)));
}

/** [paint geometry (tinted per vehicle), trim geometry (fixed colours)] for each type. +Z is forward. */
export function vehicleModels(detail = 2) {
  const box = (w, h, l, x, y, z, r = 0.12, hex = '#ffffff') => colored(new RoundedBoxGeometry(w, h, l, detail, Math.min(r, w / 2.1, h / 2.1, l / 2.1)).translate(x, y, z), hex);
  const glass = '#3a4a5c', light = '#fff4c2', tail = '#e63946', red = '#c1121f', blk = '#141414', chrome = '#d9dde3';
  // Nepali number plates: red = private, black = public / taxi
  const plates = (len, y, col, w = 0.42) => [box(w, 0.13, 0.03, 0, y, len / 2 + 0.005, 0.02, col), box(w, 0.13, 0.03, 0, y, -len / 2 - 0.005, 0.02, col)];
  const rack = (w, len, y) => [box(w * 0.9, 0.04, len * 0.7, 0, y, 0, 0.02, '#2b2d42'), box(w * 0.5, 0.3, len * 0.22, -w * 0.15, y + 0.17, -len * 0.12, 0.06, '#c1440e'), box(w * 0.35, 0.22, len * 0.18, w * 0.2, y + 0.13, len * 0.1, 0.06, '#3a86ff')];
  const car = (len, w, extra = [], plate = red) => [
    mergeGeometries([box(w, 0.43, len, 0, 0.55, 0, 0.10), cabin(len, w), box(w * 0.91, 0.07, len * 0.22, 0, 0.79, len * 0.36, 0.035)]),
    mergeGeometries([
      wheel(0.27, 0.22, -w / 2 + 0.08, 0.27, len * 0.32), wheel(0.27, 0.22, w / 2 - 0.08, 0.27, len * 0.32), wheel(0.27, 0.22, -w / 2 + 0.08, 0.27, -len * 0.32), wheel(0.27, 0.22, w / 2 - 0.08, 0.27, -len * 0.32),
      panel([[-w*.365,.91,len*.20],[w*.365,.91,len*.20],[w*.32,1.34,len*.132],[-w*.32,1.34,len*.132]],glass),
      panel([[w*.365,.91,-len*.31],[-w*.365,.91,-len*.31],[-w*.32,1.34,-len*.245],[w*.32,1.34,-len*.245]],glass),
      ...[-1, 1].flatMap((s) => [panel([[s*w*.43,.9,len*.16],[s*w*.43,.9,-len*.015],[s*w*.386,1.33,-len*.015],[s*w*.386,1.33,len*.095]],glass,s<0),panel([[s*w*.43,.9,-len*.045],[s*w*.43,.9,-len*.265],[s*w*.386,1.33,-len*.215],[s*w*.386,1.33,-len*.045]],glass,s<0),box(.12,.035,.025,s*w*.503,.72,-len*.02,.01,chrome),box(.13,.09,.18,s*w*.51,.97,len*.15,.025,'#313942')]),
      box(.27,.12,.035,-w*.33,.65,len/2+.005,.025,light),box(.27,.12,.035,w*.33,.65,len/2+.005,.025,light),box(w*.38,.1,.028,0,.5,len/2+.012,.01,'#333a3d'),
      ball(0.07, -w * 0.36, 0.62, -len / 2 + 0.02, tail), ball(0.07, w * 0.36, 0.62, -len / 2 + 0.02, tail), ...extra,
      ...plates(len, 0.45, plate), box(w * 1.02, 0.1, 0.12, 0, 0.36, len / 2, 0.04, chrome),
    ]),
  ];
  const passenger = [   // side-saddle passenger in a sari
    colored(new THREE.CapsuleGeometry(0.15, 0.28, 4, 8).translate(0.06, 1.12, -0.48), '#d81b60'), ball(0.13, 0.06, 1.52, -0.46, '#2b1d14'), ball(0.1, 0.1, 1.48, -0.38, '#e0ac80', 0.9),
    colored(new THREE.CapsuleGeometry(0.06, 0.32, 3, 6).rotateZ(1.3).translate(0.3, 0.92, -0.42), '#d81b60'),
  ];
  const rider = (helmet, shirt = '#414b58') => [
    colored(new THREE.CapsuleGeometry(0.125, 0.24, 3, 7).rotateX(0.12).translate(0, 1.02, -0.15), shirt),
    ball(0.135, 0, 1.405, -0.12, helmet), ball(0.085, 0, 1.36, -0.015, '#e6b28b', 0.9), box(0.19, 0.075, 0.045, 0, 1.425, 0.005, 0.02, glass),
    ...[-1, 1].flatMap((s) => [limb([s * 0.11, 1.13, -0.12], [s * 0.2, 0.99, 0.12], 0.044, shirt), limb([s * 0.2, 0.99, 0.12], [s * 0.23, 0.98, 0.4], 0.034, '#e6b28b'),
      limb([s * 0.1, 0.82, -0.23], [s * 0.19, 0.59, 0.08], 0.06, '#30394d'), limb([s * 0.19, 0.59, 0.08], [s * 0.18, 0.33, -0.04], 0.045, '#30394d'), box(0.1, 0.075, 0.2, s * 0.18, 0.3, 0, 0.025, '#26282d')]),
  ];
  const motorcycle = (ridehail = false) => [
    mergeGeometries([box(.3,.2,.43,0,.69,.14,.07),box(.28,.12,.52,0,.69,-.4,.05),box(.13,.06,.36,0,.46,.69,.02)]),
    mergeGeometries([wheel(.28,.105,0,.28,.69),wheel(.28,.12,0,.28,-.7),box(.25,.23,.3,0,.46,-.04,.045,'#43484e'),box(.31,.075,.65,0,.805,-.28,.035,'#28292b'),
      ...[-1,1].flatMap(s=>[limb([s*.075,.3,.69],[s*.075,.96,.5],.024,chrome),limb([s*.11,.41,-.67],[s*.11,.68,-.12],.023,'#43484e')]),box(.62,.035,.06,0,1,.45,.01,blk),box(.22,.16,.06,0,.91,.61,.035,light),box(.15,.07,.03,0,.64,-.91,.01,tail),box(.14,.09,.025,0,.48,-.94,.01,red),
      ...rider(ridehail?'#4e9e62':'#353c46',ridehail?'#328c59':'#55585b'),...(ridehail?[box(.16,.045,.018,0,1.1,-.013,.01,'#e5efdb')]:[])]),
  ];
  return {
    motorbike: motorcycle(), pathao: motorcycle(true),
    scooter: [
      mergeGeometries([box(0.34, 0.29, 0.75, 0, 0.47, -0.22, 0.1), box(0.29, 0.53, 0.17, 0, 0.65, 0.43, 0.07), box(0.32, 0.07, 0.7, 0, 0.31, 0.12, 0.03)]),
      mergeGeometries([wheel(0.225, 0.1, 0, 0.225, 0.6), wheel(0.225, 0.1, 0, 0.225, -0.6), box(0.32, 0.09, 0.56, 0, 0.69, -0.22, 0.04, '#2b2d42'),
        box(0.52, 0.04, 0.06, 0, 0.98, 0.4, 0.015, chrome), ball(0.065, 0, 0.84, 0.53, light), box(0.17, 0.09, 0.025, 0, 0.4, -0.66, 0.015, red), ...rider('#e63946')]),
    ],
    scooter2: [
      mergeGeometries([box(0.34, 0.29, 0.9, 0, 0.47, -0.28, 0.1), box(0.29, 0.53, 0.17, 0, 0.65, 0.43, 0.07), box(0.32, 0.07, 0.7, 0, 0.31, 0.12, 0.03)]),
      mergeGeometries([wheel(0.225, 0.1, 0, 0.225, 0.6), wheel(0.225, 0.1, 0, 0.225, -0.68), box(0.32, 0.09, 0.75, 0, 0.69, -0.3, 0.04, '#2b2d42'),
        box(0.52, 0.04, 0.06, 0, 0.98, 0.4, 0.015, chrome), ball(0.065, 0, 0.84, 0.53, light), box(0.17, 0.09, 0.025, 0, 0.4, -0.74, 0.015, red), ...rider('#2a5bd7'), ...passenger.map((g) => g.scale(0.85, 0.88, 0.9).translate(0, -0.02, 0))]),
    ],
    rickshaw: [
      mergeGeometries([box(0.95, 0.45, 0.8, 0, 0.75, -0.45, 0.12), colored(new THREE.SphereGeometry(0.62, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.8, 0.9, 0.75).translate(0, 1.05, -0.5), '#ffffff')]),
      mergeGeometries([wheel(0.3, 0.06, 0, 0.3, 0.75), wheel(0.33, 0.06, -0.5, 0.33, -0.5), wheel(0.33, 0.06, 0.5, 0.33, -0.5), box(0.06, 0.06, 1.1, 0, 0.62, 0.2, 0.02, '#2b2d42'),
        box(0.3, 0.06, 0.28, 0, 0.98, 0.55, 0.03, '#2b2d42'), ...rider('#f4f1de').map((g) => g.translate(0, -0.05, 0.62)), box(0.85, 0.06, 0.06, 0, 1.0, -0.12, 0.02, '#ffcc29')]),
    ],
    taxi: car(...DIMS.taxi.slice(0, 2), [box(0.42, 0.13, 0.22, 0, 1.495, 0.02, 0.035, '#ffcc29')], blk),
    car: car(...DIMS.car.slice(0, 2)),
    microbus: [
      mergeGeometries([box(1.9, 1.55, 4.6, 0, 1.18, 0, 0.3)]),
      mergeGeometries([wheel(0.33, 0.25, -0.85, 0.33, 1.5), wheel(0.33, 0.25, 0.85, 0.33, 1.5), wheel(0.33, 0.25, -0.85, 0.33, -1.5), wheel(0.33, 0.25, 0.85, 0.33, -1.5),
        ...[-1,1].flatMap(s=>Array.from({length:4},(_,i)=>box(.035,.46,.66,s*.96,1.56,-1.45+i*.88,.035,glass))),box(1.65,.55,.035,0,1.5,2.315,.055,glass),box(1.94, 0.09, 4.62, 0, 0.95, 0, 0.025, '#416a8b'),
        ...rack(1.9, 4.6, 2.0), ...plates(4.6, 0.55, blk),
        ball(0.11, -0.6, 0.85, 2.3, light), ball(0.11, 0.6, 0.85, 2.3, light), ball(0.08, -0.75, 0.85, -2.3, tail), ball(0.08, 0.75, 0.85, -2.3, tail)]),
    ],
    tempo: [
      mergeGeometries([box(1.3, 1.25, 2.9, 0, 1.05, -0.2, 0.32), box(1.0, 0.7, 0.6, 0, 0.85, 1.35, 0.2)]),
      mergeGeometries([wheel(0.28, 0.2, 0, 0.28, 1.4), wheel(0.28, 0.2, -0.6, 0.28, -1.1), wheel(0.28, 0.2, 0.6, 0.28, -1.1),
        box(1.34, 0.42, 2.2, 0, 1.38, -0.35, 0.12, glass), box(1.32, 0.1, 2.92, 0, 0.75, -0.2, 0.04, '#ffffff'), ball(0.1, 0, 1.0, 1.66, light), ...plates(3.3, 0.5, blk, 0.36)]),
    ],
    bus: [
      mergeGeometries([box(2.4, 2.4, 9.5, 0, 1.6, 0, 0.35)]),
      mergeGeometries([wheel(0.48, 0.3, -1.05, 0.48, 3.2), wheel(0.48, 0.3, 1.05, 0.48, 3.2), wheel(0.48, 0.3, -1.05, 0.48, -3.0), wheel(0.48, 0.3, 1.05, 0.48, -3.0),
        ...[-1,1].flatMap(s=>Array.from({length:8},(_,i)=>box(.035,.68,.82,s*1.21,2.1,-3.7+i*1.02,.045,glass))),box(2.08,.9,.035,0,2.06,4.765,.07,glass),box(2.44, 0.12, 9.52, 0, 1.38, 0, 0.025, '#d3b865'),
        ball(0.14, -0.8, 1.0, 4.76, light), ball(0.14, 0.8, 1.0, 4.76, light), box(1.6, 0.25, 0.1, 0, 2.7, 4.76, 0.05, '#1d1b1f'), box(1.2, 0.18, 0.04, 0, 2.7, 4.81, 0.02, '#ffcc29'),
        ...rack(2.3, 9.0, 2.85), ...plates(9.5, 0.7, blk), box(2.45, 0.08, 9.52, 0, 0.95, 0, 0.03, '#ffffff')]),
    ],
    truck: [   // a Tata truck, painted like a festival: tinted cab + tall cargo sides
      mergeGeometries([box(2.2, 1.4, 1.7, 0, 1.45, 2.55, 0.25), box(2.3, 1.5, 4.4, 0, 1.75, -0.9, 0.08)]),
      mergeGeometries([wheel(0.5, 0.3, -1.0, 0.5, 2.6), wheel(0.5, 0.3, 1.0, 0.5, 2.6), wheel(0.5, 0.3, -1.0, 0.5, -1.4), wheel(0.5, 0.3, 1.0, 0.5, -1.4), wheel(0.5, 0.3, -1.0, 0.5, -2.5), wheel(0.5, 0.3, 1.0, 0.5, -2.5),
        box(2.22, 0.55, 1.2, 0, 1.75, 2.75, 0.1, glass), box(2.32, 0.22, 4.42, 0, 2.35, -0.9, 0.04, '#e63946'), box(2.32, 0.16, 4.42, 0, 1.95, -0.9, 0.04, '#2a9d4b'), box(2.32, 0.14, 4.42, 0, 1.55, -0.9, 0.04, '#ffcc29'),
        box(2.24, 0.16, 0.08, 0, 2.25, 3.42, 0.03, '#ff6fa8'), ball(0.14, -0.8, 1.0, 3.42, light), ball(0.14, 0.8, 1.0, 3.42, light), box(2.3, 0.18, 0.15, 0, 0.75, 3.42, 0.05, chrome),
        box(1.6, 0.35, 0.04, 0, 1.5, -3.13, 0.03, '#ffcc29'), ...plates(6.3, 0.75, blk).map((g) => g.translate(0, 0, 0))]),
    ],
  };
}

