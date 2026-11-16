/**
 * Tihar fireworks, one additive particle buffer (1 draw call), simulated on the CPU:
 *   rocket(x, z)   whooshes up trailing sparks, then bursts into a coloured sphere (some crackle white as they fade)
 *   gamala(x, z)   the flower-pot (anar): a fountain of golden sparks from the ground for a few seconds
 *   chakra(x, z)   the ground spinner: a whirling wheel throwing sparks sideways, skittering about
 * Colours are HDR (> 1) so the bloom pass makes them glow. Emits 'firework' { pos, big } for reactions.
 */
import * as THREE from 'three';
import { events } from '../../core/events.js';

const N = 3200;
const VS = /* glsl */ `attribute vec4 aCol; attribute float aSize; varying vec4 vC;
  void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(2.5, aSize * 300.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }`;
const FS = /* glsl */ `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
  float core = smoothstep(0.45, 0.0, d), glow = pow(1.0 - d, 2.0); gl_FragColor = vec4((vC.rgb * glow + core * 0.8) * vC.a, glow * vC.a); }`;

export class Fireworks {
  constructor(scene, heightAt, audio) {
    this.heightAt = heightAt; this.audio = audio;
    this.p = []; this.emitters = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 4); this.size = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; this.points.renderOrder = 30; scene.add(this.points);
    this.C = new THREE.Color();
  }

  #spark(x, y, z, vx, vy, vz, life, color, o = {}) {
    if (this.p.length >= N) return;
    this.p.push({ x, y, z, vx, vy, vz, t: 0, life, r: color.r, g: color.g, b: color.b, size: o.size ?? 0.5, grav: o.grav ?? 4, drag: o.drag ?? 1.2, crackle: o.crackle || 0 });
  }
  #hdr(hex, k = 2.4) { return this.C.set(hex).multiplyScalar(k).clone(); }

  rocket(x, z, colors) {
    const y = this.heightAt(x, z), c = colors[(Math.random() * colors.length) | 0], c2 = colors[(Math.random() * colors.length) | 0];
    this.emitters.push({ kind: 'rocket', x, y, z, vx: (Math.random() - 0.5) * 3, vy: 26 + Math.random() * 10, vz: (Math.random() - 0.5) * 3, t: 0, fuse: 1.3 + Math.random() * 0.6, c, c2 });
    this.audio?.play?.('whoosh', { vol: 0.35, rate: 1.5 + Math.random() * 0.4, pos: { x, y, z } });
  }
  gamala(x, z) { this.emitters.push({ kind: 'gamala', x, y: this.heightAt(x, z), z, t: 0, dur: 4 + Math.random() * 3, acc: 0 }); events.emit('firework', { pos: new THREE.Vector3(x, this.heightAt(x, z), z), big: false }); }
  chakra(x, z) { this.emitters.push({ kind: 'chakra', x, y: this.heightAt(x, z), z, t: 0, dur: 4 + Math.random() * 2.5, acc: 0, a: 0, vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8 }); events.emit('firework', { pos: new THREE.Vector3(x, this.heightAt(x, z), z), big: false }); }

  #burst(e) {
    const n = 70 + ((Math.random() * 50) | 0), sp = 9 + Math.random() * 6, crackle = Math.random() < 0.4 ? 1 : 0, ring = Math.random() < 0.25;
    const A = this.#hdr(e.c), B = this.#hdr(e.c2);
    for (let i = 0; i < n; i++) {
      // even directions on a sphere (or a flat ring, tilted), two colours
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      let dx = r * Math.cos(th), dy = u, dz = r * Math.sin(th);
      if (ring) { dx = Math.cos(th); dz = Math.sin(th); dy = dx * 0.4; }
      const s = sp * (0.85 + Math.random() * 0.3);
      this.#spark(e.x, e.y, e.z, dx * s, dy * s, dz * s, 1.6 + Math.random() * 0.8, i % 3 ? A : B, { size: 2.2, grav: 3.2, drag: 1.4, crackle });
    }
    this.#spark(e.x, e.y, e.z, 0, 0, 0, 0.25, new THREE.Color(6, 5, 4), { size: 16, grav: 0, drag: 0 });   // the flash
    const pos = new THREE.Vector3(e.x, e.y, e.z);
    this.audio?.play?.('boom', { vol: 0.55, rate: 1.4 + Math.random() * 0.5, pos, reverb: 0.5 });
    events.emit('firework', { pos, big: true });
  }

  update(dt) {
    const gold = this.#hdr('#ffc94d', 2.6), white = this.#hdr('#fff3d6', 2.2);
    for (const e of this.emitters) {
      e.t += dt;
      if (e.kind === 'rocket') {
        e.vy -= 9 * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
        for (let k = 0; k < 2; k++) this.#spark(e.x, e.y, e.z, (Math.random() - 0.5) * 1.2, -2 - Math.random() * 2, (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.3, gold, { size: 0.9, grav: 2 });
        if (e.t > e.fuse || e.vy < 3) { this.#burst(e); e.done = true; }
      } else if (e.kind === 'gamala') {   // flower-pot fountain
        const k = Math.sin(Math.min(1, e.t / e.dur) * Math.PI);          // swells, then dies down
        e.acc += dt * (40 + 90 * k);
        while (e.acc >= 1) { e.acc -= 1; const a = Math.random() * 6.28, sp = Math.random() * 1.6; this.#spark(e.x, e.y + 0.2, e.z, Math.cos(a) * sp, 5 + Math.random() * 4 * (0.5 + k), Math.sin(a) * sp, 0.8 + Math.random() * 0.6, Math.random() < 0.3 ? white : gold, { size: 0.35, grav: 9.8, drag: 0.4 }); }
        this.#spark(e.x, e.y + 0.15, e.z, 0, 0, 0, 0.06, gold, { size: 1.2 * k + 0.3, grav: 0, drag: 0 });
        if (e.t > e.dur) e.done = true;
      } else if (e.kind === 'chakra') {   // ground spinner
        e.a += dt * 26; e.x += e.vx * dt; e.z += e.vz * dt; e.y = this.heightAt(e.x, e.z);
        e.acc += dt * 110;
        const cols = [gold, this.#hdr('#7dff6a', 2.4), this.#hdr('#ff4f6a', 2.4)];
        while (e.acc >= 1) {
          e.acc -= 1; const a = e.a + Math.random() * 0.4, cx = Math.cos(a), cz = Math.sin(a), sp = 3 + Math.random() * 2;
          this.#spark(e.x + cx * 0.2, e.y + 0.08, e.z + cz * 0.2, -cz * sp, 0.6 + Math.random(), cx * sp, 0.35 + Math.random() * 0.3, cols[(Math.random() * 3) | 0], { size: 0.3, grav: 6, drag: 1.5 });
        }
        this.#spark(e.x, e.y + 0.08, e.z, 0, 0, 0, 0.05, white, { size: 0.9, grav: 0, drag: 0 });
        if (e.t > e.dur) e.done = true;
      }
    }
    this.emitters = this.emitters.filter((e) => !e.done);
    // integrate sparks
    let n = 0;
    const out = [];
    for (const q of this.p) {
      q.t += dt; if (q.t >= q.life) continue;
      const dr = Math.max(0, 1 - q.drag * dt);
      q.vx *= dr; q.vy = q.vy * dr - q.grav * dt; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const g = this.heightAt(q.x, q.z); if (q.y < g + 0.02) { q.y = g + 0.02; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      out.push(q);
      const k = q.t / q.life, fade = (1 - k) * (1 - k) * 1.2;
      let a = Math.min(1, fade), r = q.r, gg = q.g, b = q.b;
      if (q.crackle && k > 0.55) { const f = Math.random() < 0.5 ? 1.6 : 0.1; r = gg = b = 2.2 * f; a = Math.min(1, fade * 2); }   // white crackle at the end
      this.pos[n * 3] = q.x; this.pos[n * 3 + 1] = q.y; this.pos[n * 3 + 2] = q.z;
      this.col[n * 4] = r; this.col[n * 4 + 1] = gg; this.col[n * 4 + 2] = b; this.col[n * 4 + 3] = a;
      this.size[n] = q.size * (1 - k * 0.5); n++;
    }
    this.p = out;
    const at = this.points.geometry.attributes, gm = this.points.geometry;
    gm.setDrawRange(0, n); this.points.visible = n > 0;
    at.position.needsUpdate = at.aCol.needsUpdate = at.aSize.needsUpdate = true;
  }
}
