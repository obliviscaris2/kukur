/**
 * Pigeon flocks at temple squares, where people scatter makai (corn) for them. They peck and hop among the grains;
 * when the pup runs at them or barks they burst into the sky together, climb in a spiral, wheel around the temple
 * as one flock (banking into the turns, gliding with wings held in a V), then glide down and land again.
 *   addFlock(key, x, z, n, heightAt) · removeFlock(key) · scare(pos, radius) → true if any took off · update(dt)
 * Draw calls: body, left wing, right wing, grains (4).
 */
import * as THREE from 'three';
import { toon } from '../../render/toon.js';
import { angDiff } from '../../core/geo.js';
import { events } from '../../core/events.js';

const MAX = 320, GRAINS = 1400;
const COATS = ['#aab3c2', '#aab3c2', '#9aa3b5', '#c4cad4', '#f2f2ee', '#8a7768', '#6d7484', '#b9a28c'];

export class Pigeons {
  constructor(scene) {
    const body = new THREE.SphereGeometry(0.11, 7, 5); body.scale(0.8, 0.75, 1.3); body.translate(0, 0.08, 0);
    const head = new THREE.SphereGeometry(0.06, 6, 4); head.translate(0, 0.17, 0.12);
    this.body = new THREE.InstancedMesh(mergeTwo(body, head), toon('#ffffff', { key: 'pigeon' }), MAX);
    const wing = new THREE.PlaneGeometry(0.24, 0.15); wing.rotateX(-Math.PI / 2); wing.translate(0.12, 0, 0);
    const wm = toon('#ffffff', { key: 'pwing', params: { side: THREE.DoubleSide } });
    this.wl = new THREE.InstancedMesh(wing, wm, MAX); this.wr = new THREE.InstancedMesh(wing, wm, MAX);
    for (const m of [this.body, this.wl, this.wr]) { m.frustumCulled = false; m.count = 0; m.setColorAt(0, new THREE.Color()); scene.add(m); }
    // makai grains on the flagstones
    this.gpos = new Float32Array(GRAINS * 3);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(this.gpos, 3));
    this.grains = new THREE.Points(gg, new THREE.PointsMaterial({ color: '#ffcf3a', size: 0.035, sizeAttenuation: true }));
    this.grains.frustumCulled = false; scene.add(this.grains);
    this.birds = []; this.flocks = new Map(); this.flockState = new Map();
    this.M = new THREE.Matrix4(); this.Mw = new THREE.Matrix4(); this.T = new THREE.Matrix4(); this.R = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(0, 0, 0, 'YXZ'); this.S = new THREE.Vector3(1, 1, 1);
    this.goal = new THREE.Vector3(); this.want = new THREE.Vector3(); this.C = new THREE.Color();
  }

  /** add a flock at a square (key lets the manager remove it when its tile streams out) */
  addFlock(key, x, z, n, heightAt) {
    n = Math.min(n, MAX - this.birds.length); if (n <= 0) return;
    const list = [], c = new THREE.Vector3(x, heightAt(x, z), z), grains = [];
    for (let i = 0; i < n; i++) {
      const hx = x + (Math.random() - 0.5) * 12, hz = z + (Math.random() - 0.5) * 12, y = heightAt(hx, hz);
      const b = { p: new THREE.Vector3(hx, y, hz), home: new THREE.Vector3(hx, y, hz), c, v: new THREE.Vector3(), h: Math.random() * 6, st: 'ground', t: Math.random() * 3, flap: Math.random() * 6, peck: 0, key,
        slot: Math.random() * Math.PI * 2, rad: 6 + Math.random() * 9, alt: 7 + Math.random() * 9, delay: 0, roll: 0, col: COATS[(Math.random() * COATS.length) | 0] };
      list.push(b); this.birds.push(b);
    }
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 6, gx = x + Math.cos(a) * d, gz = z + Math.sin(a) * d; grains.push(gx, heightAt(gx, gz) + 0.02, gz); }
    this.flocks.set(key, list); this.flockState.set(key, { c, ang: Math.random() * 6, wheel: 0, grains });
    this.#rebuildGrains();
  }
  removeFlock(key) { this.birds = this.birds.filter((b) => b.key !== key); this.flocks.delete(key); this.flockState.delete(key); this.#rebuildGrains(); }
  #rebuildGrains() {
    let n = 0;
    for (const f of this.flockState.values()) for (let i = 0; i < f.grains.length && n < GRAINS; i += 3, n++) this.gpos.set(f.grains.slice(i, i + 3), n * 3);
    this.grains.geometry.setDrawRange(0, n); this.grains.geometry.attributes.position.needsUpdate = true;
  }

  /** startle the birds near pos: the whole flock goes up together */
  scare(pos, radius) {
    let any = false;
    for (const [key, list] of this.flocks) {
      if (!list.some((b) => b.st === 'ground' && b.p.distanceToSquared(pos) < radius * radius)) continue;
      const f = this.flockState.get(key); f.wheel = 9 + Math.random() * 6; any = true;
      for (const b of list) {
        if (b.st === 'fly') continue;
        const d = b.p.distanceTo(pos);
        b.st = 'fly'; b.delay = Math.min(0.6, d * 0.04) + Math.random() * 0.15;   // the nearest bolt first, the rest follow
        const away = new THREE.Vector3().subVectors(b.p, pos).setY(0).normalize();
        b.v.set(away.x * 2.5 + (Math.random() - 0.5), 5 + Math.random() * 2, away.z * 2.5 + (Math.random() - 0.5));
      }
    }
    if (any) events.emit('flock', pos);
    return any;
  }

  update(dt,focus) {
    for (const f of this.flockState.values()) { f.ang += dt * 0.55; f.wheel = Math.max(0, f.wheel - dt); }
    let i = 0;
    for (const b of this.birds) {
      if(focus&&b.p.distanceToSquared(focus)>6400)continue;
      b.t -= dt;
      let wing = 0;   // wing angle; 0 = folded on the ground
      if (b.st === 'ground') {
        b.peck = Math.max(0, b.peck - dt);
        if (b.t < 0) { b.t = 0.6 + Math.random() * 2.5; if (Math.random() < 0.55) b.peck = 0.3; else { b.h += (Math.random() - 0.5) * 2; b.p.x += Math.sin(b.h) * 0.25; b.p.z += Math.cos(b.h) * 0.25; if (b.p.distanceTo(b.home) > 3) b.h = Math.atan2(b.home.x - b.p.x, b.home.z - b.p.z); } }
        this.E.set(b.peck > 0 ? 0.6 : 0, b.h, 0);
      } else if ((b.delay -= dt) > 0) {
        this.E.set(0, b.h, 0);   // about to go: crouch
      } else {
        const f = this.flockState.get(b.key), wheeling = f && f.wheel > 0;
        // wheel around the temple in a ring of slots (the flock moves as one), then glide home
        if (wheeling) { const a = f.ang + b.slot; this.goal.set(f.c.x + Math.cos(a) * b.rad, f.c.y + b.alt + Math.sin(f.ang * 0.7 + b.slot) * 2, f.c.z + Math.sin(a) * b.rad); }
        else this.goal.copy(b.home).setY(b.home.y + Math.min(6, b.p.distanceTo(b.home) * 0.35));
        const toGoal = this.want.subVectors(this.goal, b.p), dist = toGoal.length(), maxV = wheeling ? 8 : Math.max(1.2, Math.min(7, dist * 0.9));
        toGoal.multiplyScalar(Math.min(maxV, dist * 1.5) / Math.max(dist, 1e-3));
        b.v.lerp(toGoal, Math.min(1, dt * (wheeling ? 1.6 : 2.2)));
        b.p.addScaledVector(b.v, dt);
        const nh = Math.atan2(b.v.x, b.v.z), turn = angDiff(b.h, nh) / Math.max(dt, 1e-3); b.h = nh;
        b.roll += (Math.max(-0.9, Math.min(0.9, -turn * 0.35)) - b.roll) * Math.min(1, dt * 4);   // bank into turns
        const climbing = b.v.y > -0.3;
        b.flap += dt * (climbing ? 22 : 6);
        wing = climbing ? Math.sin(b.flap) * 0.95 : 0.28 + Math.sin(b.flap) * 0.06;            // flap up, glide down in a V
        this.E.set(-Math.atan2(b.v.y, Math.hypot(b.v.x, b.v.z)) * 0.5, b.h, b.roll);
        if (!wheeling && b.p.distanceTo(b.home) < 0.35) { b.st = 'ground'; b.p.copy(b.home); b.v.set(0, 0, 0); b.roll = 0; b.t = 1; }
      }
      this.Q.setFromEuler(this.E); this.M.compose(b.p, this.Q, this.S); this.body.setMatrixAt(i, this.M);
      this.C.set(b.col); this.body.setColorAt(i, this.C); this.C.multiplyScalar(0.85); this.wl.setColorAt(i, this.C); this.wr.setColorAt(i, this.C);
      if (b.st === 'fly' && b.delay <= 0) {
        this.wr.setMatrixAt(i, this.Mw.copy(this.M).multiply(this.T.makeTranslation(0.03, 0.12, 0)).multiply(this.R.makeRotationZ(wing)));
        this.wl.setMatrixAt(i, this.Mw.copy(this.M).multiply(this.T.makeTranslation(-0.03, 0.12, 0)).multiply(this.R.makeRotationZ(Math.PI - wing)));
      } else { this.Mw.makeScale(0, 0, 0); this.wr.setMatrixAt(i, this.Mw); this.wl.setMatrixAt(i, this.Mw); }
      i++;
    }
    for (const m of [this.body, this.wl, this.wr]) { m.count = i; m.visible = i > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.grains.visible = i > 0;
  }
}
function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry(), off = a.attributes.position.count;
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a.attributes.position.array, ...b.attributes.position.array], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...a.attributes.normal.array, ...b.attributes.normal.array], 3));
  g.setIndex([...a.index.array, ...[...b.index.array].map((i) => i + off)]);
  return g;
}
