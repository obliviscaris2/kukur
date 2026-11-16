/**
 * The valley's other birds (pigeons live in Pigeons.js), all in ONE instanced draw call — wings flap in the vertex
 * shader — plus one for nests:
 *   crows     on rooftops near you (it's Kag Tihar season); caw, hop, and flap off to another roof when you come close
 *   sparrows  little flocks hopping and pecking on the ground; flit up to a roof or tree when you bound at them
 *   kites     (cheel) soaring in slow wide circles high over the city
 *   nests     twig cups in nearby trees, with a sparrow coming and going
 * Birds live around the pup (spawned out of the way, retired when far). Tunables: BIRDS in config/npc.js.
 *   birds.scare(pos, r)   startle everything near pos (barks and the roar call it via events)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BIRDS } from '../../config/index.js';
import { toon } from '../../render/toon.js';
import { events } from '../../core/events.js';
import { angDiff } from '../../core/geo.js';

const MAX = 96, MAX_NESTS = 12;
const rnd = (a, b) => a + Math.random() * (b - a);

/** body + head + tail + beak (aWing 0) and two hinged wings (aWing ±1); +Z is forward, wings span ±X. 1 m long. */
function birdGeometry() {
  const tag = (g, w) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(w), 1)); return g; };
  const body = new THREE.SphereGeometry(0.22, 8, 6).scale(0.8, 0.75, 1.5);
  const head = new THREE.SphereGeometry(0.13, 7, 5).translate(0, 0.1, 0.36);
  const beak = new THREE.ConeGeometry(0.04, 0.14, 5).rotateX(Math.PI / 2).translate(0, 0.08, 0.52);
  const tail = new THREE.PlaneGeometry(0.2, 0.3).rotateX(-Math.PI / 2).translate(0, 0.02, -0.42);
  const wing = (s) => { const g = new THREE.PlaneGeometry(0.62, 0.3).rotateX(-Math.PI / 2).translate(s * 0.31, 0.06, -0.02); return tag(g, s); };
  return mergeGeometries([tag(body, 0), tag(head, 0), tag(beak, 0), tag(tail, 0), wing(1), wing(-1)]);
}
function nestGeometry() {
  const g = new THREE.TorusGeometry(0.2, 0.08, 5, 10).rotateX(Math.PI / 2).scale(1, 0.6, 1);
  const bottom = new THREE.CircleGeometry(0.2, 8).rotateX(-Math.PI / 2).translate(0, -0.03, 0);
  return mergeGeometries([g, bottom]);
}

export class Birds {
  constructor(scene, world, audio) {
    this.world = world; this.audio = audio; this.list = []; this.nests = []; this._t = 0;
    const geo = birdGeometry();
    this.flap = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);   // phase, amplitude, speed, base angle
    geo.setAttribute('aFlap', this.flap);
    const mat = toon('#ffffff', { key: 'birds', rim: 0.3, params: { side: THREE.DoubleSide },
      vertexHead: 'attribute float aWing; attribute vec4 aFlap;',
      vertexMain: 'if (abs(aWing) > 0.5) { float a = aFlap.w + aFlap.y * sin(uTime * aFlap.z + aFlap.x); float x = transformed.x; transformed.x = x * cos(a); transformed.y += abs(x) * sin(a); }' });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.setColorAt(0, new THREE.Color()); scene.add(this.mesh);
    this.nestMesh = new THREE.InstancedMesh(nestGeometry(), toon('#7a5532', { key: 'nest', rim: 0.2 }), MAX_NESTS); this.nestMesh.count = 0; this.nestMesh.frustumCulled = false; scene.add(this.nestMesh);
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(0, 0, 0, 'YXZ'); this.S = new THREE.Vector3(); this.C = new THREE.Color(); this.V = new THREE.Vector3();
    events.on('bark', (pos) => this.scare(pos, 12));
    events.on('roar', (pos) => this.scare(pos, 40));
    events.on('firework', ({ pos, big }) => { if (!big) this.scare(pos, 10); });
  }

  // ------------------------------------------------------------------ places to be
  /** a rooftop (or wall top) point near (x, z), or null */
  #roof(x, z, r) {
    const P = this.world.physics;
    for (let k = 0; k < 10; k++) {
      const px = x + rnd(-r, r), pz = z + rnd(-r, r), t = this.world.terrain(px, pz), g = P.groundAt(px, pz, t + 60);
      if (g - t > 2.8) return new THREE.Vector3(px, g, pz);
    }
    return null;
  }
  #groundSpot(x, z, r0, r1) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * 6.28, d = rnd(r0, r1), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.world.physics.isFree(px, pz, 0.5) && this.world.waterAt(px, pz) === null) return new THREE.Vector3(px, this.world.heightAt(px, pz), pz);
    }
    return null;
  }
  #add(kind, p, extra = {}) {
    if (this.list.length >= MAX) return null;
    const B = BIRDS[kind];
    const b = { kind, p: p.clone(), v: new THREE.Vector3(), h: Math.random() * 6.28, st: kind === 'kite' ? 'soar' : extra.st || 'perch', t: rnd(0.5, 3), roll: 0, phase: Math.random() * 6,
      size: rnd(...B.size), col: B.colors[(Math.random() * B.colors.length) | 0], target: null, home: p.clone(), ...extra };
    this.list.push(b); return b;
  }

  /** startle: ground and perched birds near pos take off */
  scare(pos, r) {
    for (const b of this.list) if (b.st !== 'fly' && b.st !== 'soar' && b.p.distanceToSquared(pos) < r * r) this.#takeOff(b, pos);
  }
  #takeOff(b, from) {
    const dest = b.kind === 'sparrow' && Math.random() < 0.5 ? this.#nestOrTree(b.p) : this.#roof(b.p.x + (b.p.x - from.x) * 0.8, b.p.z + (b.p.z - from.z) * 0.8, 18);
    b.st = 'fly'; b.target = dest || b.p.clone().add(new THREE.Vector3(rnd(-15, 15), 12, rnd(-15, 15))); b.landAs = dest ? 'perch' : null; b.t = 12;
    const away = this.V.subVectors(b.p, from).setY(0).normalize();
    b.v.set(away.x * 3, 4.5, away.z * 3);
    if (b.kind === 'crow' && Math.random() < 0.6) this.audio?.play?.('crow', { vol: 0.5, pos: b.p, rate: rnd(0.9, 1.1) });
  }
  #nestOrTree(p) {
    let best = null, bd = 25;
    for (const n of this.nests) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = new THREE.Vector3(n.x, n.y + 0.08, n.z); } }
    return best;
  }

  // ------------------------------------------------------------------ population around the pup
  #populate(focus) {
    const n = (k) => this.list.filter((b) => b.kind === k).length;
    this.list = this.list.filter((b) => b.p.distanceTo(focus) < (b.kind === 'kite' ? 260 : 90));
    if (n('crow') < BIRDS.crow.count) { const r = this.#roof(focus.x, focus.z, 45); if (r && r.distanceTo(focus) > 14) this.#add('crow', r); }
    if (n('sparrow') < BIRDS.sparrow.count) {
      const g = this.#groundSpot(focus.x, focus.z, 18, 40);
      if (g) for (let i = 0; i < BIRDS.sparrow.flock; i++) { const q = g.clone().add(new THREE.Vector3(rnd(-1.5, 1.5), 0, rnd(-1.5, 1.5))); q.y = this.world.heightAt(q.x, q.z); this.#add('sparrow', q, { st: 'ground' }); }
    }
    if (n('kite') < BIRDS.kite.count) {
      const a = Math.random() * 6.28, d = rnd(40, 140);
      this.#add('kite', new THREE.Vector3(focus.x + Math.cos(a) * d, focus.y + rnd(55, 110), focus.z + Math.sin(a) * d), { cx: focus.x + rnd(-60, 60), cz: focus.z + rnd(-60, 60), R: rnd(35, 80), alt: focus.y + rnd(55, 110), dir: Math.random() < 0.5 ? 1 : -1 });
    }
    // nests in nearby trees
    this.nests = this.nests.filter((q) => Math.hypot(q.x - focus.x, q.z - focus.z) < 80);
    if (this.nests.length < BIRDS.nests && this.world.props?.treesNear) {
      for (const t of this.world.props.treesNear(focus, 60, 40)) {
        if (this.nests.length >= BIRDS.nests) break;
        if (Math.random() > 0.08 || this.nests.some((q) => Math.hypot(q.x - t[0], q.z - t[2]) < 6)) continue;
        this.nests.push({ x: t[0] + rnd(-0.4, 0.4), y: t[1] + 3.1 * t[4], z: t[2] + rnd(-0.4, 0.4), s: 0.8 + Math.random() * 0.4 });
      }
    }
  }

  update(dt, pup) {
    if ((this._t -= dt) <= 0) { this._t = 0.7; this.#populate(pup.pos); }
    let i = 0;
    for (const b of this.list) {
      b.t -= dt;
      const B = BIRDS[b.kind];
      let amp = 0, speed = 0, base = 0, pitch = 0;
      const dPup = b.p.distanceTo(pup.pos);
      if (b.st === 'ground') {          // hop, hop, peck
        if (dPup < B.flee || (pup.speed > 3 && dPup < B.flee * 1.8)) this.#takeOff(b, pup.pos);
        else if (b.t < 0) { b.t = rnd(0.25, 1.1); if (Math.random() < 0.5) b.peck = 0.25; else { b.h += rnd(-1.5, 1.5); b.hop = 0.18; } }
        if (b.hop > 0) { b.hop -= dt; b.p.x += Math.sin(b.h) * dt * 1.4; b.p.z += Math.cos(b.h) * dt * 1.4; if (b.p.distanceTo(b.home) > 3) b.h = Math.atan2(b.home.x - b.p.x, b.home.z - b.p.z); }
        b.peck = Math.max(0, (b.peck || 0) - dt);
        b.p.y = this.world.heightAt(b.p.x, b.p.z) + (b.hop > 0 ? Math.sin((b.hop / 0.18) * Math.PI) * 0.06 : 0);
        pitch = b.peck > 0 ? 0.5 : 0;
      } else if (b.st === 'perch') {     // look about, caw, leave if the pup gets up here too
        if (dPup < B.flee && Math.abs(pup.pos.y - b.p.y) < 2) this.#takeOff(b, pup.pos);
        else if (b.t < 0) { b.t = rnd(1, 4); b.h += rnd(-1.2, 1.2); if (b.kind === 'crow' && Math.random() < 0.25 && dPup < 40) this.audio?.play?.('crow', { vol: 0.35, pos: b.p, rate: rnd(0.85, 1.1) }); if (b.kind === 'sparrow' && Math.random() < 0.3) { b.st = 'fly'; b.target = this.#groundSpot(b.p.x, b.p.z, 3, 12); b.landAs = 'ground'; if (!b.target) b.st = 'perch'; } }
      } else if (b.st === 'fly') {       // flap to a target, then land
        const to = this.V.subVectors(b.target, b.p), d = to.length();
        to.multiplyScalar(Math.min(B.fly, d * 2 + 1) / Math.max(d, 1e-3));
        if (d > 3) to.y += 1.5;          // arc over things
        b.v.lerp(to, Math.min(1, dt * 2.5)); b.p.addScaledVector(b.v, dt);
        const nh = Math.atan2(b.v.x, b.v.z); b.roll += (Math.max(-0.8, Math.min(0.8, -angDiff(b.h, nh) / Math.max(dt, 1e-3) * 0.3)) - b.roll) * Math.min(1, dt * 4); b.h = nh;
        amp = 0.95; speed = B.flapSpeed; pitch = -Math.atan2(b.v.y, Math.hypot(b.v.x, b.v.z)) * 0.5;
        if (d < 0.25 || b.t < 0) { b.p.copy(b.target); b.st = b.landAs || (this.world.physics.groundAt(b.p.x, b.p.z, b.p.y + 0.3) > this.world.terrain(b.p.x, b.p.z) + 1 ? 'perch' : 'ground'); b.home.copy(b.p); b.v.set(0, 0, 0); b.roll = 0; b.t = rnd(2, 6); }
      } else if (b.st === 'soar') {      // kites: lazy circles, the odd few flaps
        b.ang = (b.ang ?? Math.random() * 6.28) + dt * (B.fly / b.R) * b.dir;
        const tx = b.cx + Math.cos(b.ang) * b.R, tz = b.cz + Math.sin(b.ang) * b.R, ty = b.alt + Math.sin(b.ang * 2) * 6;
        b.p.x = tx; b.p.y += (ty - b.p.y) * Math.min(1, dt); b.p.z = tz;
        b.h = Math.atan2(-Math.sin(b.ang) * b.dir, Math.cos(b.ang) * b.dir);   // tangent to the circle
        b.roll = -0.35 * b.dir;
        const flapping = Math.sin(b.ang * 3) > 0.92; amp = flapping ? 0.5 : 0.04; speed = flapping ? 7 : 2; base = 0.12;
      }
      if (b.st === 'ground' || b.st === 'perch') { amp = 0; base = -1.25; }   // wings folded along the body
      this.E.set(pitch, b.h, b.roll); this.Q.setFromEuler(this.E);
      this.M.compose(b.p, this.Q, this.S.setScalar(b.size)); this.mesh.setMatrixAt(i, this.M);
      this.mesh.setColorAt(i, this.C.set(b.col));
      this.flap.setXYZW(i, b.phase, amp, speed, base);
      i++;
    }
    this.mesh.count = i; this.mesh.visible = i > 0; this.mesh.instanceMatrix.needsUpdate = true; this.flap.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    let k = 0;
    for (const n of this.nests) { if (!n.seen && Math.hypot(n.x - pup.pos.x, n.z - pup.pos.z) < 3) { n.seen = true; events.emit('nest', n); } }
    for (const n of this.nests) { if (k >= MAX_NESTS) break; this.nestMesh.setMatrixAt(k++, this.M.compose(this.V.set(n.x, n.y, n.z), this.Q.identity(), this.S.setScalar(n.s))); }
    this.nestMesh.count = k; this.nestMesh.visible = k > 0; this.nestMesh.instanceMatrix.needsUpdate = true;
  }
}
