/** Sculpted branches and folded leaf sprays, merged into coloured geometry; golden-angle growth and shared near/far silhouettes. */
import * as THREE from 'three';
import { ART, NATURE } from '../../config/index.js';
import { rng, hash } from '../../core/rng.js';

const TAU = Math.PI * 2,
  GOLDEN = Math.PI * (3 - Math.sqrt(5)),
  UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z),
  C = (hex) => new THREE.Color(hex);
const BARK = NATURE.trees.bark.map(C);

class Sculpture {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colours = [];
    this.nature = [];this.uvs=[];
  }
  tri(points, colours, role = 0, glow = 0, normals = null, uvs = null) {
    const face = new THREE.Vector3()
      .subVectors(points[1], points[0])
      .cross(new THREE.Vector3().subVectors(points[2], points[0]))
      .normalize();
    for (let i = 0; i < 3; i++) {
      points[i].toArray(this.positions, this.positions.length);
      (normals?.[i] || face).toArray(this.normals, this.normals.length);
      (Array.isArray(colours) ? colours[i] : colours).toArray(this.colours, this.colours.length);
      this.nature.push(role, glow);this.uvs.push(...(uvs?.[i]||[0,0]));
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    for (const [name, data, size] of [
      ['position', this.positions, 3],
      ['normal', this.normals, 3],
      ['color', this.colours, 3],
      ['nature', this.nature, 2],['uv',this.uvs,2],
    ])
      g.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

function branch(b, points, r0, r1, lod = 0, colour = null) {
  const curve = new THREE.CatmullRomCurve3(points),
    segments = NATURE.trees.branchSegments[lod],
    sides = NATURE.trees.branchSides[lod],
    rings = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      centre = curve.getPoint(t),
      q = new THREE.Quaternion().setFromUnitVectors(UP, curve.getTangent(t).normalize());
    const radius = THREE.MathUtils.lerp(r0, r1, t) ** 1.03,
      ring = [];
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * TAU,
        n = V(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(q);
      const paint = colour
        ? colour.clone()
        : BARK[0]
            .clone()
            .lerp(BARK[1], 0.35 + 0.4 * (0.5 + 0.5 * Math.cos(angle - 0.8)))
            .lerp(BARK[2], 0.12 + 0.13 * t);
      ring.push({ p: centre.clone().addScaledVector(n, radius * (1 + 0.07 * Math.sin(j * 3 + i))), n, c: paint });
    }
    rings.push(ring);
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < sides; j++) {
      const a = rings[i][j],
        c = rings[i + 1][j],
        d = rings[i + 1][(j + 1) % sides],
        e = rings[i][(j + 1) % sides];
      b.tri([a.p, c.p, e.p], [a.c, c.c, e.c], 0, 0, [a.n, c.n, e.n]);
      b.tri([e.p, c.p, d.p], [e.c, c.c, d.c], 0, 0, [e.n, c.n, d.n]);
    }
}

function leaf(b, base, length, width, yaw, pitch, colour, lod = 0, glow = 0, orientation = null) {
  const q = orientation || new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0));
  const p = (x, y, z) =>
    V(x * width, y * length, z * length)
      .applyQuaternion(q)
      .add(base);
  const root = p(0, 0, 0),
    left = p(-0.5, 0.04, 0.4),
    right = p(0.5, 0.04, 0.4),
    tip = p(0, -0.09, 1),
    ridge = p(0, 0.12, 0.48);
  const dark = colour.clone().multiplyScalar(0.72),
    light = colour.clone().multiplyScalar(1.14);
  if (lod) {
    b.tri([root, tip, left], [dark, light, colour], 1, glow);
    b.tri([root, right, tip], [dark, colour, light], 1, glow);
    return;
  }
  if (width / length > 0.5) {
    const ring = [
      root,
      p(-0.42, 0.01, 0.24),
      p(-0.5, 0.04, 0.53),
      p(-0.3, 0, 0.82),
      p(0, -0.015, 0.94),
      p(0.3, 0, 0.82),
      p(0.5, 0.04, 0.53),
      p(0.42, 0.01, 0.24),
    ];
    const paints = [dark, colour.clone().multiplyScalar(0.9), colour, light, light, light, colour, colour.clone().multiplyScalar(0.9)];
    const inverse = q.clone().invert(),
      normal = (point) => {
        const local = point.clone().sub(base).applyQuaternion(inverse);
        return V((local.x / width) * 0.45, 1, (local.z / length - 0.5) * 0.12)
          .normalize()
          .applyQuaternion(q);
      };
    for (let i = 0; i < ring.length; i++)
      b.tri([ridge, ring[(i + 1) % ring.length], ring[i]], [light, paints[(i + 1) % ring.length], paints[i]], 1, glow, [
        normal(ridge),
        normal(ring[(i + 1) % ring.length]),
        normal(ring[i]),
      ]);
    return;
  }
  const shoulderL = p(-0.34, -0.01, 0.74),
    shoulderR = p(0.34, -0.01, 0.74);
  for (const [a, c, d] of [
    [root, ridge, left],
    [left, ridge, shoulderL],
    [shoulderL, ridge, tip],
    [root, right, ridge],
    [right, shoulderR, ridge],
    [shoulderR, tip, ridge],
  ])
    b.tri([a, c, d], [dark, light, colour], 1, glow);
}

function gem(b, p, r, colour, glow = 1) {
  const top = p.clone().add(V(0, r * 1.5, 0)),
    bottom = p.clone().add(V(0, -r, 0)),
    ring = Array.from({ length: 5 }, (_, i) => p.clone().add(V(Math.sin((i / 5) * TAU) * r, 0, Math.cos((i / 5) * TAU) * r)));
  for (let i = 0; i < 5; i++) {
    b.tri([top, ring[i], ring[(i + 1) % 5]], colour, 0, glow);
    b.tri([bottom, ring[(i + 1) % 5], ring[i]], colour.clone().multiplyScalar(0.7), 0, glow);
  }
}

const SPECIES = [
  {
    h: 3.5,
    r: 0.29,
    lean: [0.28, -0.12],
    palette: 'peepal',
    crowns: [
      [-1.6, 3.5, 0.3, 1.05],
      [1.5, 3.7, 0.4, 1.1],
      [0.1, 5, 0, 1.2],
      [-0.9, 4.7, -1.1, 1],
      [1.1, 4.5, -1.1, 1],
      [0, 3.8, 1.6, 1],
      [-1.1, 4.7, 1.1, 0.9],
      [1.2, 5.1, 0.8, 0.8],
    ],
  },
  {
    h: 5.7,
    r: 0.16,
    lean: [0.13, 0.06],
    palette: 'ashoka',
    crowns: [
      [0, 2.3, 0, 0.63],
      [0.1, 3.2, 0.1, 0.72],
      [-0.08, 4.1, 0, 0.64],
      [0.04, 5, 0, 0.56],
      [-0.08, 5.8, 0, 0.43],
      [0, 6.5, 0, 0.28],
    ],
  },
  {
    h: 3.1,
    r: 0.26,
    lean: [-0.34, 0.08],
    palette: 'jacaranda',
    crowns: [
      [-1.65, 3.6, 0.25, 1.3],
      [1.55, 3.8, 0.45, 1.35],
      [0, 4.65, 0, 1.4],
      [-1.1, 4.5, -0.95, 1.1],
      [1.15, 4.45, -1.1, 1.25],
      [0, 3.9, 1.2, 1.3],
      [-1, 4.65, 0.9, 1.1],
      [1.05, 4.8, 0.75, 1.0],
    ],
  },
  {
    h: 0.5,
    r: 0.1,
    lean: [0.08, 0],
    palette: 'bougainvillea',
    crowns: [
      [-0.5, 0.8, 0.1, 0.55],
      [0.5, 0.9, 0.1, 0.6],
      [0, 1.3, -0.2, 0.62],
      [0, 0.9, 0.6, 0.5],
    ],
  },
  {
    h: 2.1,
    r: 0.18,
    lean: [0.16, 0],
    palette: 'lime',
    crowns: [
      [0, 3, 0, 0.92],
      [-0.8, 2.7, 0.3, 0.7],
      [0.85, 2.65, 0.3, 0.7],
      [0, 2.6, -0.8, 0.7],
      [0, 3.65, 0, 0.62],
    ],
  },
];

export function treeGeometry(kind, lod = 0) {
  const b = new Sculpture(),
    s = SPECIES[kind],
    random = rng(713 + kind),
    palette = ART.foliage[s.palette].map(C);
  const end = V(s.lean[0], s.h, s.lean[1]);
  branch(b, [V(0, -0.38, 0), V(-s.r * 0.8, s.h * 0.3, s.r * 0.3), V(s.r * 0.6, s.h * 0.67, -s.r * 0.4), end], s.r * 1.3, s.r * 0.36, lod);
  if (!lod && kind !== 3) {
    branch(b, [V(s.r * 0.7, -0.15, 0), V(s.r * 0.5, 0.7, s.r * 0.6), V(-s.r * 0.4, s.h * 0.6, 0)], s.r * 0.46, s.r * 0.12, 0);
    for (let i = 0; i < 5; i++) {
      const a = i * GOLDEN;
      branch(
        b,
        [V(0, 0.28, 0), V(Math.cos(a) * 0.25, 0.08, Math.sin(a) * 0.25), V(Math.cos(a) * 0.78, -0.65, Math.sin(a) * 0.78)],
        s.r * 0.6,
        0.025,
        0,
      );
    }
  }
  s.crowns.forEach(([x, y, z, r], ci) => {
    const tip = V(x, y - 0.22, z),
      fork = V(end.x * 0.5, Math.min(y - 1, s.h * 0.65), end.z * 0.5);
    if (!lod || ci % 2 === 0) branch(b, [fork, V(x * 0.6, y - 0.65, z * 0.6), tip], s.r * (kind === 1 ? 0.28 : 0.5), 0.022, lod);
    // Irregular painted leaf sprays form a porous crown; no opaque polyhedron hides underneath.
    const n=NATURE.trees.leaves[lod];
    for(let i=0;i<n;i++){
      const a=i*GOLDEN+ci,vertical=1-2*(i+.5)/n,rad=Math.sqrt(1-vertical*vertical);
      const normal=V(Math.cos(a)*rad,vertical*.8,Math.sin(a)*rad).normalize();
      const centre=V(x+normal.x*r*.45,y+normal.y*r*(kind===1?.75:.55),z+normal.z*r*.45);
      const q=new THREE.Quaternion().setFromUnitVectors(V(0,0,1),normal);
      const size=r*(lod?1.65:1.35),width=kind===1?size*.65:size;
      const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>V(u*width*.5,v*size*.5,0).applyQuaternion(q).add(centre));
      const level=THREE.MathUtils.clamp(.28+Math.max(0,vertical)*.35+random()*.2,0,.95),index=level*(palette.length-1),j=Math.floor(index);
      const colour=palette[j].clone().lerp(palette[Math.min(j+1,palette.length-1)],index-j).multiplyScalar(1.25);
      const normalSoft=normal.clone().setY(.5+normal.y*.5).normalize(),ns=[normalSoft,normalSoft,normalSoft];
      b.tri([points[0],points[1],points[2]],colour,2,kind===2?.055:.008,ns,[[0,0],[1,0],[1,1]]);
      b.tri([points[0],points[2],points[3]],colour,2,kind===2?.055:.008,ns,[[0,0],[1,1],[0,1]]);
    }
    if (!lod && (kind === 0 || kind === 2) && ci % 3 === 0) {
      const p = tip.clone().add(V(0.25, -0.45, 0.05));
      branch(b, [tip, p.clone().add(V(0.05, 0.14, 0)), p], 0.012, 0.008, 1, BARK[1]);
      for (let j = 0; j < 3; j++) gem(b, p.clone().add(V(j * 0.045, -j * 0.07, 0)), 0.045, C(j % 2 ? '#edb06d' : '#ffe0a0'));
    }
  });
  return b.geometry();
}

function blossom(b, base, r, colour) {
  const centre = base.clone().add(V(0, 0.025, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU,
      left = base.clone().add(V(Math.cos(a - 0.38) * r * 0.65, 0.02, Math.sin(a - 0.38) * r * 0.65)),
      tip = base.clone().add(V(Math.cos(a) * r, 0.035, Math.sin(a) * r)),
      right = base.clone().add(V(Math.cos(a + 0.38) * r * 0.65, 0.02, Math.sin(a + 0.38) * r * 0.65));
    b.tri([centre, left, tip], [colour.clone().multiplyScalar(0.65), colour, colour], 1, 0.12);
    b.tri([centre, tip, right], [colour, colour.clone().lerp(C('#fff1c6'), 0.3), colour], 1, 0.12);
  }
  gem(b, centre.clone().add(V(0, 0.025, 0)), r * 0.22, C('#ffd577'), 0.65);
}

export function gardenGeometry() {
  const b = new Sculpture(),
    pal = NATURE.planting.leaf.map(C);
  for (let i = 0; i < 9; i++) {
    const a = i * GOLDEN,
      r = Math.sqrt((i + 0.3) / 9) * 0.43,
      base = V(Math.cos(a) * r, -0.025, Math.sin(a) * r);
    leaf(b, base, 0.33 + (i % 3) * 0.09, 0.16 + (i % 2) * 0.06, a, -0.55, pal[i % pal.length], 0, 0.025);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * GOLDEN,
      base = V(Math.cos(a) * 0.24, 0.01, Math.sin(a) * 0.24),
      head = base.clone().add(V(0.04, 0.24 + i * 0.055, 0));
    branch(b, [base, head], 0.009, 0.005, 1, pal[1]);
    blossom(b, head, 0.075, C(NATURE.planting.flowers[i % 5]));
  }
  return b.geometry();
}

export function plantGeometry() {
  const b = new Sculpture(),
    pot = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.1, 0),
        new THREE.Vector2(0.16, 0.02),
        new THREE.Vector2(0.22, 0.31),
        new THREE.Vector2(0.225, 0.34),
        new THREE.Vector2(0.19, 0.34),
        new THREE.Vector2(0.18, 0.28),
      ],
      10,
    ).toNonIndexed();
  for (let i = 0; i < pot.attributes.position.count; i += 3) {
    const pts = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pot.attributes.position, i + j));
    b.tri(
      pts,
      C(NATURE.diyo.clay),
      0,
      0,
      [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pot.attributes.normal, i + j)),
    );
  }
  for (let i = 0; i < 10; i++) leaf(b, V(0, 0.3, 0), 0.33 + (i % 3) * 0.06, 0.15, i * GOLDEN, -0.8, NATURE.planting.leaf.map(C)[i % 3]);
  branch(b, [V(0, 0.28, 0), V(0.015, 0.53, 0), V(0.04, 0.73, 0)], 0.012, 0.006, 1, C(NATURE.planting.leaf[1]));
  blossom(b, V(0.04, 0.73, 0), 0.13, C('#edbd77'));
  return b.geometry();
}

export function tuftGeometry() {
  const b = new Sculpture(),
    pal = NATURE.planting.grass.map(C);
  for (let i = 0; i < 3; i++) {
    const a = i * GOLDEN,
      base = V(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04);
    leaf(b, base, 0.19 + (i % 3) * 0.055, 0.025, a, -1.13, pal[0].clone().lerp(pal[1], i / 3), 1);
  }
  return b.geometry();
}

export function flowerGeometry() {
  const b = new Sculpture(),
    green = C('#5c8b69');
  branch(b, [V(0, 0, 0), V(0.014, 0.13, 0), V(0, 0.25, 0)], 0.007, 0.004, 1, green);
  leaf(b, V(0, 0.08, 0), 0.11, 0.045, 1.3, -0.4, green, 1);
  leaf(b, V(0, 0.13, 0), 0.08, 0.04, 4, -0.5, green, 1);
  blossom(b, V(0, 0.25, 0), 0.065, C('#ffffff'));
  return b.geometry();
}

export function garlandGeometry() {
  const b = new Sculpture();
  for (let i = 0; i < 34; i++) {
    const t = i / 33;
    gem(b, V(t * 2 - 1, -Math.sin(t * Math.PI) * 0.22, 0), 0.045, C(i % 4 === 0 ? '#f7d78a' : '#df984b'), 0.08);
  }
  return b.geometry();
}

/** World-position seeds keep mature trees stable when neighbouring tiles or distance fields change. */
export function treeVariation(x, z, kind) {
  const random = rng(hash(Math.round(x * 10), Math.round(z * 10), kind));
  return {
    yaw: random() * TAU,
    stretch: 0.94 + random() * 0.12,
    tint: 0.92 + random() * 0.15,
    golden: kind === 0 && random() < NATURE.trees.goldenChance ? 1 : 0,
  };
}
