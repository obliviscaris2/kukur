/**
 * Street cats — one instanced draw call (legs trot and tails sway in the vertex shader).
 *   sit / groom → stroll → (a dog comes) FLEE → leap onto a wall, car or roof edge → perch and glare
 *   corner one and it hisses and swipes (a scare, no damage). Strays chase cats too (Stray reads `ctx.cats`).
 * Cats live around the pup: spawned out of view, retired when far. Tunables: CATS in config/npc.js.
 *   cats.nearest(pos, r) → cat or null    ·  emits 'catChase' when the pup sends one running
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CATS } from '../../config/index.js';
import { toon } from '../../render/toon.js';
import { events } from '../../core/events.js';
import { angDiff, damp } from '../../core/geo.js';

const MAX = 12, rnd = (a, b) => a + Math.random() * (b - a);

/** A sitting-capable cat, +Z forward. aPart: 0 body, 2 tail, 3/4 diagonal leg pairs, 5 eyes, 6 nose. */
function catGeometry() {
  const part = (g, p, col = [1, 1, 1]) => {
    g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(p), 1));
    const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(col, i * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const body = new THREE.CapsuleGeometry(0.085, 0.26, 4, 8).rotateX(Math.PI / 2).translate(0, 0.21, 0);
  const belly = new THREE.SphereGeometry(0.08, 7, 5).scale(0.9, 0.6, 1.6).translate(0, 0.17, 0);
  const head = new THREE.SphereGeometry(0.075, 8, 6).scale(1.08, 0.95, 1).translate(0, 0.29, 0.2);
  const muzzle = new THREE.SphereGeometry(0.035, 6, 4).scale(1.2, 0.8, 1).translate(0, 0.27, 0.265);
  const ear = (s) => new THREE.ConeGeometry(0.03, 0.06, 4).rotateZ(-s * 0.25).translate(s * 0.045, 0.37, 0.19);
  const eye = (s) => new THREE.SphereGeometry(0.014, 5, 4).translate(s * 0.03, 0.305, 0.268);
  const nose = new THREE.SphereGeometry(0.009, 4, 3).translate(0, 0.285, 0.295);
  const tail = new THREE.CylinderGeometry(0.014, 0.02, 0.3, 5, 4).rotateX(-0.9).translate(0, 0.3, -0.27);
  const leg = (x, z, p) => part(new THREE.CylinderGeometry(0.018, 0.016, 0.16, 5).translate(x, 0.08, z), p, [0.92, 0.92, 0.92]);
  return mergeGeometries([
    part(body, 0), part(belly, 0, [1.05, 1.02, 0.98]), part(head, 0), part(muzzle, 0, [1.08, 1.05, 1]), part(ear(1), 0), part(ear(-1), 0),
    part(eye(1), 5), part(eye(-1), 5), part(nose, 6), part(tail, 2),
    leg(0.05, 0.12, 3), leg(-0.05, -0.12, 3), leg(-0.05, 0.12, 4), leg(0.05, -0.12, 4),
  ]);
}

export class Cats {
  constructor(scene, world, ui, audio) {
    this.world = world; this.ui = ui; this.audio = audio; this.list = []; this._t = 0;
    const geo = catGeometry();
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);   // leg phase, stride, tail seed, sit
    geo.setAttribute('aAnim', this.anim);
    const mat = toon('#ffffff', { key: 'cats', rim: 0.45, params: { vertexColors: true },
      vertexHead: 'attribute float aPart; attribute vec4 aAnim;',
      vertexMain: /* glsl */ `
        if (aPart > 2.5 && aPart < 4.5) { float s = sin(aAnim.x) * (aPart < 3.5 ? 1.0 : -1.0) * aAnim.y; transformed.z += s * 0.08 * clamp((0.16 - transformed.y) / 0.16, 0.0, 1.0); transformed.y += aAnim.w * -0.06 * step(0.0, transformed.z) * 0.0; }
        if (aPart > 1.5 && aPart < 2.5) { float k = clamp((transformed.y - 0.2) / 0.25, 0.0, 1.0); transformed.x += sin(uTime * (1.8 + aAnim.y * 4.0) + aAnim.z * 9.0) * 0.07 * k; }
        if (aAnim.w > 0.5 && aPart < 0.5) { transformed.y -= max(0.0, -transformed.z) * 0.35; }   // sitting: haunches down
        if (aPart > 4.5) vColor = aPart < 5.5 ? vec3(0.75, 0.85, 0.2) : vec3(0.95, 0.5, 0.55);`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.mesh.setColorAt(0, new THREE.Color()); scene.add(this.mesh);
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(0, 0, 0, 'YXZ'); this.S = new THREE.Vector3(1, 1, 1); this.C = new THREE.Color(); this.V = new THREE.Vector3();
    events.on('bark', (pos) => { for (const c of this.list) if (c.p.distanceTo(pos) < 7 && c.st !== 'perch') this.#flee(c, pos); else if (c.st === 'perch' && c.p.distanceTo(pos) < 6) this.#hiss(c); });
  }

  nearest(pos, r) { let best = null, bd = r; for (const c of this.list) { const d = c.p.distanceTo(pos); if (d < bd) { bd = d; best = c; } } return best; }

  #spawn(focus, camera) {
    const fwd = camera ? camera.getWorldDirection(this.V).setY(0).normalize() : null;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * 6.28, d = rnd(...CATS.spawn), x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d;
      if (fwd && (Math.cos(a) * fwd.x + Math.sin(a) * fwd.z) > 0.3 && d < 40) continue;   // not right in front of you
      if (!this.world.physics.isFree(x, z, 0.4) || this.world.waterAt(x, z) !== null) continue;
      // half the cats start up on a wall or roof edge already
      const P = this.world.physics, t = this.world.terrain(x, z), top = P.groundAt(x, z, t + CATS.climb + 0.2), up = top - t > 0.8 && top - t <= CATS.climb + 0.2 && Math.random() < 0.5;
      const p = new THREE.Vector3(x, up ? top : this.world.heightAt(x, z), z);
      this.list.push({ p, pos: p, headPos: (o) => o.copy(p).setY(p.y + 0.55), h: Math.random() * 6.28, st: up ? 'perch' : 'sit', t: rnd(2, 8), speed: 0, phase: 0, seed: Math.random(),
        coat: CATS.coats[(Math.random() * CATS.coats.length) | 0], from: null, jump: null });
      return;
    }
  }

  #flee(c, from, byPup = true) {
    if (c.st === 'flee' || c.jump) return;
    c.st = 'flee'; c.t = rnd(4, 7); c.from = from.clone ? from.clone() : from;
    if (byPup) events.emit('catChase', c);
    if (Math.random() < 0.5) this.ui?.say?.(c, ['Mrrow!', 'Hssss!', 'Myaau!'][(Math.random() * 3) | 0]);
  }
  #hiss(c) { if ((c.hissT || 0) > 0) return; c.hissT = 3; this.ui?.say?.(c, 'Hisssss!'); }
  /** a wall top / roof edge / car roof within reach that's higher than here (an escape) */
  #climbSpot(c) {
    const P = this.world.physics;
    for (let k = 0; k < 10; k++) {
      const a = c.h + rnd(-1.4, 1.4), d = rnd(0.6, 2.2), x = c.p.x + Math.sin(a) * d, z = c.p.z + Math.cos(a) * d;
      const top = P.groundAt(x, z, c.p.y + CATS.climb);
      if (top - c.p.y > 0.7 && top - c.p.y <= CATS.climb && !P.solidAt(x, top + 0.2, z)) return new THREE.Vector3(x, top, z);
    }
    return null;
  }

  update(dt, pup, strays, camera) {
    if ((this._t -= dt) <= 0) {
      this._t = 1;
      this.list = this.list.filter((c) => c.p.distanceTo(pup.pos) < 80);
      if (this.list.length < CATS.count) this.#spawn(pup.pos, camera);
    }
    let i = 0;
    for (const c of this.list) {
      c.t -= dt; c.hissT = Math.max(0, (c.hissT || 0) - dt);
      const dPup = Math.hypot(pup.pos.x - c.p.x, pup.pos.z - c.p.z), sameLevel = Math.abs(pup.pos.y - c.p.y) < 0.8;
      const chaser = strays?.find((s) => s.chasing === c && s.pos.distanceTo(c.p) < 10);
      let want = 0;
      if (c.jump) {                      // mid-leap: a quick arc onto (or off) the ledge
        const j = c.jump; j.k = Math.min(1, j.k + dt / 0.45);
        c.p.lerpVectors(j.a, j.b, j.k); c.p.y += Math.sin(j.k * Math.PI) * 0.6;
        if (j.k >= 1) { c.jump = null; c.st = j.b.y - this.world.terrain(c.p.x, c.p.z) > 0.5 ? 'perch' : 'flee'; c.t = rnd(6, 14); }
      } else if (c.st === 'flee') {
        const from = chaser ? chaser.pos : c.from || pup.pos;
        const want0 = Math.atan2(c.p.x - from.x, c.p.z - from.z);
        c.h += angDiff(c.h, want0 + Math.sin(performance.now() * 0.003 + c.seed * 9) * 0.4) * damp(6, dt); want = CATS.run;
        const spot = (dPup < 3.5 || chaser) && this.#climbSpot(c);
        if (spot) { c.jump = { a: c.p.clone(), b: spot, k: 0 }; this.audio?.play?.('whoosh', { vol: 0.25, rate: 1.8, pos: c.p }); }
        if (c.t < 0 && dPup > 10 && !chaser) { c.st = 'sit'; c.t = rnd(3, 8); }
      } else if (c.st === 'perch') {     // safe up here: glare down, hiss if you get close; leave if you climb up too
        c.h += angDiff(c.h, Math.atan2(pup.pos.x - c.p.x, pup.pos.z - c.p.z)) * damp(3, dt);
        if (dPup < 2.2 && !sameLevel) this.#hiss(c);
        if (dPup < 1.6 && sameLevel) { const g = this.world.heightAt(c.p.x - Math.sin(c.h) * 1.5, c.p.z - Math.cos(c.h) * 1.5); c.jump = { a: c.p.clone(), b: new THREE.Vector3(c.p.x - Math.sin(c.h) * 1.5, g, c.p.z - Math.cos(c.h) * 1.5), k: 0 }; c.h += Math.PI; this.#flee(c, pup.pos); }
        if (c.t < 0 && dPup > 12) { const g = new THREE.Vector3(c.p.x + Math.sin(c.h) * 1.2, 0, c.p.z + Math.cos(c.h) * 1.2); g.y = this.world.heightAt(g.x, g.z); if (this.world.physics.isFree(g.x, g.z, 0.3)) { c.jump = { a: c.p.clone(), b: g, k: 0 }; } c.t = rnd(5, 10); }
      } else {                           // sit / groom / stroll
        if (sameLevel && (dPup < CATS.flee || (pup.speed > 3.5 && dPup < CATS.flee * 2))) { if (dPup < 1.2) { this.#hiss(c); pup.setMood?.('scared', 1.5); } this.#flee(c, pup.pos); }
        else if (chaser) this.#flee(c, chaser.pos, false);
        else if (c.st === 'walk') { want = CATS.walk; if (c.t < 0 || !this.world.physics.isFree(c.p.x + Math.sin(c.h) * 0.4, c.p.z + Math.cos(c.h) * 0.4, 0.15)) { c.st = 'sit'; c.t = rnd(3, 9); } }
        else if (c.t < 0) { c.st = 'walk'; c.h += rnd(-1.5, 1.5); c.t = rnd(2, 5); }
      }
      if (!c.jump) {
        c.speed += (want - c.speed) * damp(5, dt);
        const nx = c.p.x + Math.sin(c.h) * c.speed * dt, nz = c.p.z + Math.cos(c.h) * c.speed * dt;
        if (c.st === 'perch') { /* stay on the ledge */ }
        else if (this.world.physics.isFree(nx, nz, 0.15)) { c.p.x = nx; c.p.z = nz; } else c.h += 1.2;
        if (c.st !== 'perch') c.p.y = this.world.heightAt(c.p.x, c.p.z);
      }
      c.phase += dt * c.speed * 9;
      const sit = c.st === 'sit' || c.st === 'perch' ? 1 : 0, bound = c.st === 'flee' ? Math.abs(Math.sin(c.phase * 0.5)) * 0.05 : 0;
      this.E.set(c.jump ? -0.3 : 0, c.h, 0); this.Q.setFromEuler(this.E);
      this.M.compose(this.V.set(c.p.x, c.p.y + bound, c.p.z), this.Q, this.S); this.mesh.setMatrixAt(i, this.M);
      this.mesh.setColorAt(i, this.C.set(c.coat));
      this.anim.setXYZW(i, c.phase, Math.min(1, c.speed / 2), c.seed, sit);
      i++;
    }
    this.mesh.count = i; this.mesh.visible = i > 0; this.mesh.instanceMatrix.needsUpdate = true; this.anim.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
