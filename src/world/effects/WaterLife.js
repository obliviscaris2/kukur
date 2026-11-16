/**
 * Life on and around the water near the pup (5 draw calls, all instanced):
 *   fish      dark shadows gliding just under the surface of ponds and rivers; scatter when you swim close;
 *             now and then one leaps out (orange/silver) with a splash
 *   garbage   a little plastic floating on the river (bottles, bags, wrappers) — bobs, drifts, gets pushed by the pup
 *   ripples   rings from the swimming pup, splashes, leaping fish and raindrops
 *   frogs     come out when it rains: hop about, hop away from you, croak "Ribbit!"
 * Water points are found by sampling world.waterAt() around the pup. Tunables: WATERLIFE in config/weather.js.
 */
import * as THREE from 'three';
import { WATERLIFE } from '../../config/index.js';
import { toon } from '../../render/toon.js';
import { events } from '../../core/events.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const MAX_RIP = 96;

function fishShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.2); s.quadraticCurveTo(0.07, 0.05, 0.03, -0.12); s.lineTo(0.08, -0.22); s.lineTo(-0.08, -0.22); s.lineTo(-0.03, -0.12); s.quadraticCurveTo(-0.07, 0.05, 0, 0.2);
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);   // flat, nose towards +Z
}

export class WaterLife {
  constructor(scene, world, ui, audio) {
    this.world = world; this.ui = ui; this.audio = audio;
    this.wet = []; this.fish = []; this.junk = []; this.frogs = []; this.rips = []; this._t = 0; this._swimT = 0;
    const M = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.setColorAt(0, new THREE.Color()); scene.add(m); return m; };
    this.shadows = M(fishShape(), new THREE.MeshBasicMaterial({ color: '#0d2a33', transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }), 24);
    const jumper = new THREE.SphereGeometry(0.09, 7, 5).scale(0.7, 0.8, 1.9);
    this.jumpers = M(jumper, toon('#ffffff', { key: 'fishj', rim: 0.6 }), 4);
    const bottle = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6).rotateZ(Math.PI / 2), bag = new THREE.IcosahedronGeometry(0.11, 0).scale(1.2, 0.35, 1);
    this.bottles = M(bottle, toon('#ffffff', { key: 'junk', rim: 0.5 }), 14); this.bags = M(bag, toon('#ffffff', { key: 'junk2', rim: 0.3 }), 14);
    const frog = new THREE.SphereGeometry(0.06, 7, 5).scale(1, 0.62, 1.2).translate(0, 0.035, 0);
    const eyeL = new THREE.SphereGeometry(0.018, 5, 4).translate(0.03, 0.07, 0.04), eyeR = eyeL.clone().translate(-0.06, 0, 0);
    this.frogMesh = M(mergeAll([frog, eyeL, eyeR]), toon('#ffffff', { key: 'frog', rim: 0.5 }), 16);
    // ripples: per-instance age in the shader (alpha + width), scaled ring
    const rg = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    this.ripAge = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RIP), 1).setUsage(THREE.DynamicDrawUsage); rg.setAttribute('aAge', this.ripAge);
    this.ripples = new THREE.InstancedMesh(rg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'attribute float aAge; varying float vA; void main(){ vA = aAge; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(0.92, 0.97, 1.0), (1.0 - vA) * 0.55); }',
    }), MAX_RIP);
    this.ripples.count = 0; this.ripples.frustumCulled = false; this.ripples.renderOrder = 3; scene.add(this.ripples);
    this.Mx = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(); this.S = new THREE.Vector3(); this.V = new THREE.Vector3(); this.C = new THREE.Color();
    events.on('splash', (p) => { if (p) this.ripple(p.x, p.z, 1.2, 3); });
  }

  /** a ring on the water at (x, z) */
  ripple(x, z, size = 0.8, n = 1) {
    const y = this.world.waterAt(x, z); if (y === null) return;
    for (let i = 0; i < n && this.rips.length < MAX_RIP; i++) this.rips.push({ x, y: y + 0.015, z, t: -i * 0.18, life: 1.4 + size * 0.4, size });
  }

  #sample(focus) {
    // keep a pool of water points near the pup
    this.wet = this.wet.filter((w) => Math.hypot(w.x - focus.x, w.z - focus.z) < 45);
    for (let k = 0; k < 12 && this.wet.length < 60; k++) {
      const a = Math.random() * 6.28, d = rnd(2, 40), x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d, y = this.world.waterAt(x, z);
      if (y !== null) this.wet.push({ x, y, z });
    }
  }
  #pick() { return this.wet[(Math.random() * this.wet.length) | 0]; }

  update(dt, pup, rain) {
    const W = WATERLIFE, focus = pup.pos;
    if ((this._t -= dt) <= 0) {
      this._t = 0.5; this.#sample(focus);
      this.fish = this.fish.filter((f) => Math.hypot(f.x - focus.x, f.z - focus.z) < 50);
      this.junk = this.junk.filter((j) => Math.hypot(j.x - focus.x, j.z - focus.z) < 55);
      if (this.wet.length > 6) {
        if (this.fish.length < W.fish) { const w = this.#pick(); this.fish.push({ x: w.x, z: w.z, h: Math.random() * 6.28, sp: rnd(0.3, 0.7), s: rnd(0.8, 1.6), jump: null, wig: Math.random() * 6 }); }
        if (this.junk.length < W.garbage && Math.random() < 0.35) { const w = this.#pick(); this.junk.push({ x: w.x, z: w.z, h: Math.random() * 6.28, kind: Math.random() < 0.5 ? 0 : 1, vx: rnd(-0.12, 0.12), vz: rnd(-0.12, 0.12), b: Math.random() * 6, col: W.junkColors[(Math.random() * W.junkColors.length) | 0] }); }
      }
      // frogs come out in the rain (more by the water), and hop off when it stops
      if (rain > 0.3 && this.frogs.length < W.frogs) {
        const w = this.wet.length && Math.random() < 0.6 ? this.#pick() : null;
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * 6.28, d = w ? rnd(1, 4) : rnd(4, 20), x = (w ? w.x : focus.x) + Math.cos(a) * d, z = (w ? w.z : focus.z) + Math.sin(a) * d;
          if (this.world.waterAt(x, z) === null && this.world.physics.isFree(x, z, 0.2)) { this.frogs.push({ x, z, y: this.world.heightAt(x, z), h: Math.random() * 6.28, t: rnd(0.5, 2), hop: null, col: W.frogColors[(Math.random() * W.frogColors.length) | 0], life: rnd(40, 90) }); break; }
        }
      }
      if (rain > 0.2) for (let k = 0; k < Math.min(6, this.wet.length); k++) { const w = this.#pick(); this.ripple(w.x + rnd(-2, 2), w.z + rnd(-2, 2), 0.35); }   // raindrops
    }
    // the swimming pup leaves rings and pushes junk
    if (pup.swimming && (this._swimT -= dt) <= 0) { this._swimT = pup.speed > 0.5 ? 0.32 : 0.9; this.ripple(pup.pos.x, pup.pos.z, 0.7 + pup.speed * 0.15); }

    // ---- fish
    let n = 0, nj = 0;
    for (const f of this.fish) {
      const dp = Math.hypot(pup.pos.x - f.x, pup.pos.z - f.z), scared = pup.swimming && dp < 4;
      if (f.jump) {
        const j = f.jump; j.t += dt;
        const k = j.t / 0.7, x = j.x + Math.sin(f.h) * k * 1.0, z = j.z + Math.cos(f.h) * k * 1.0, y = j.y + Math.sin(k * Math.PI) * 0.55;
        if (nj < 4) { this.E.set(-Math.cos(k * Math.PI) * 0.9, f.h, 0); this.jumpers.setMatrixAt(nj, this.Mx.compose(this.V.set(x, y, z), this.Q.setFromEuler(this.E), this.S.setScalar(f.s))); this.jumpers.setColorAt(nj, this.C.set(f.col)); nj++; }
        if (k >= 1) { f.x = x; f.z = z; f.jump = null; this.ripple(x, z, 0.9, 2); this.audio?.play?.('splash', { vol: 0.25, rate: 1.6, pos: { x, y, z } }); }
        continue;
      }
      f.wig += dt * (scared ? 14 : 5);
      const turn = Math.sin(f.wig * 0.3) * 0.6 + (scared ? Math.sign(((Math.atan2(f.x - pup.pos.x, f.z - pup.pos.z) - f.h + 9.42) % 6.28) - 3.14) * 2 : 0);
      f.h += turn * dt; const v = scared ? 2.2 : f.sp;
      const nx = f.x + Math.sin(f.h) * v * dt, nz = f.z + Math.cos(f.h) * v * dt, y = this.world.waterAt(nx, nz);
      if (y === null) f.h += Math.PI * 0.6 * (Math.random() < 0.5 ? 1 : -1); else { f.x = nx; f.z = nz; f.y = y; }
      if (!scared && Math.random() < dt * W.jumpChance && f.y !== undefined) { f.jump = { t: 0, x: f.x, y: f.y, z: f.z }; f.col = W.fishColors[(Math.random() * W.fishColors.length) | 0]; this.ripple(f.x, f.z, 0.6); continue; }
      if (f.y === undefined || n >= 24) continue;
      this.E.set(0, f.h + Math.sin(f.wig) * 0.25, 0);
      this.shadows.setMatrixAt(n++, this.Mx.compose(this.V.set(f.x, f.y + 0.012, f.z), this.Q.setFromEuler(this.E), this.S.setScalar(f.s)));
    }
    this.shadows.count = n; this.shadows.visible = n > 0; this.shadows.instanceMatrix.needsUpdate = true;
    this.jumpers.count = nj; this.jumpers.visible = nj > 0; this.jumpers.instanceMatrix.needsUpdate = true; if (this.jumpers.instanceColor) this.jumpers.instanceColor.needsUpdate = true;

    // ---- garbage: bob, drift, spin; nudged by the pup
    let nb = 0, ng = 0;
    for (const j of this.junk) {
      j.b += dt; const dp = Math.hypot(pup.pos.x - j.x, pup.pos.z - j.z);
      if (dp < 0.7 && !j.pushed) { j.pushed = true; events.emit('junk', j); }
      if (dp < 0.7) { j.vx += (j.x - pup.pos.x) / Math.max(dp, 0.1) * dt * 3; j.vz += (j.z - pup.pos.z) / Math.max(dp, 0.1) * dt * 3; }
      j.vx *= 1 - dt * 0.3; j.vz *= 1 - dt * 0.3;
      const nx = j.x + j.vx * dt, nz = j.z + j.vz * dt, y = this.world.waterAt(nx, nz);
      if (y === null) { j.vx *= -0.5; j.vz *= -0.5; } else { j.x = nx; j.z = nz; j.y = y; }
      if (j.y === undefined) continue;
      j.h += dt * 0.2;
      this.E.set(Math.sin(j.b * 1.3) * 0.15, j.h, Math.cos(j.b) * 0.12);
      this.Mx.compose(this.V.set(j.x, j.y + 0.02 + Math.sin(j.b * 2) * 0.015, j.z), this.Q.setFromEuler(this.E), this.S.setScalar(1));
      if (j.kind === 0 && nb < 14) { this.bottles.setMatrixAt(nb, this.Mx); this.bottles.setColorAt(nb++, this.C.set(j.col)); }
      else if (ng < 14) { this.bags.setMatrixAt(ng, this.Mx); this.bags.setColorAt(ng++, this.C.set(j.col)); }
    }
    for (const [m, c] of [[this.bottles, nb], [this.bags, ng]]) { m.count = c; m.visible = c > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    // ---- frogs
    let nf = 0;
    this.frogs = this.frogs.filter((f) => (f.life -= dt * (rain > 0.2 ? 1 : 6)) > 0 && Math.hypot(f.x - focus.x, f.z - focus.z) < 40);
    for (const f of this.frogs) {
      const dp = Math.hypot(pup.pos.x - f.x, pup.pos.z - f.z);
      if (dp < 2 && !f.met) { f.met = true; events.emit('frog', f); }
      if (f.hop) {
        const h = f.hop; h.t += dt; const k = Math.min(1, h.t / 0.38);
        f.x = h.x + (h.tx - h.x) * k; f.z = h.z + (h.tz - h.z) * k; f.y = this.world.heightAt(f.x, f.z) + Math.sin(k * Math.PI) * 0.35;
        if (k >= 1) { f.hop = null; f.t = rnd(0.6, 2.5); if (this.world.waterAt(f.x, f.z) !== null) this.ripple(f.x, f.z, 0.5); }
      } else if ((f.t -= dt) <= 0 || dp < 2.2) {
        if (dp < 2.2) f.h = Math.atan2(f.x - pup.pos.x, f.z - pup.pos.z) + rnd(-0.5, 0.5); else f.h += rnd(-1.2, 1.2);
        const d = rnd(0.5, 1.2), tx = f.x + Math.sin(f.h) * d, tz = f.z + Math.cos(f.h) * d;
        if (this.world.physics.isFree(tx, tz, 0.1)) f.hop = { t: 0, x: f.x, z: f.z, tx, tz }; else f.t = 0.5;
        if (Math.random() < 0.12 && dp < 15) this.ui?.say?.({ pos: { x: f.x, y: f.y - 0.6, z: f.z } }, 'Ribbit!', 1.2);
      }
      if (nf >= 16) continue;
      this.E.set(f.hop ? -0.4 : 0, f.h, 0);
      this.frogMesh.setMatrixAt(nf, this.Mx.compose(this.V.set(f.x, f.y ?? this.world.heightAt(f.x, f.z), f.z), this.Q.setFromEuler(this.E), this.S.setScalar(1)));
      this.frogMesh.setColorAt(nf++, this.C.set(f.col));
    }
    this.frogMesh.count = nf; this.frogMesh.visible = nf > 0; this.frogMesh.instanceMatrix.needsUpdate = true; if (this.frogMesh.instanceColor) this.frogMesh.instanceColor.needsUpdate = true;

    // ---- ripples
    let nr = 0;
    this.rips = this.rips.filter((r) => (r.t += dt) < r.life);
    for (const r of this.rips) {
      if (r.t < 0) continue;
      const k = r.t / r.life, R = 0.15 + k * r.size * 1.6;
      this.ripples.setMatrixAt(nr, this.Mx.compose(this.V.set(r.x, r.y, r.z), this.Q.identity(), this.S.set(R, 1, R))); this.ripAge.setX(nr, k); nr++;
    }
    this.ripples.count = nr; this.ripples.visible = nr > 0; this.ripples.instanceMatrix.needsUpdate = true; this.ripAge.needsUpdate = true;
  }
}

function mergeAll(list) {
  const pos = [], nrm = [];
  for (let g of list) { g = g.index ? g.toNonIndexed() : g; pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}
