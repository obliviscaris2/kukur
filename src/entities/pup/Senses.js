/**
 * The pup's senses. Hold Q to sniff: the seen world fades (inside every material) and smells glow as neon wisps that
 * swirl up and evaporate, or stream into the pup's nose — buried treasure (cyan columns), food (gold), temple
 * offerings (marigold), other dogs, and people by how they feel about dogs (kind = warm gold, grumpy = red).
 * A pulse ring shows how far the nose reaches. Your nose remembers the last thing you picked up: similar things
 * smell stronger (src.fav). V toggles dog eyes (blue-yellow dichromatic vision).
 */
import * as THREE from 'three';
import { U } from '../../render/toon.js';
import { SNIFF } from '../../config/index.js';

const VS = `attribute float aSize; attribute vec3 aColor; attribute float aAlpha; varying vec3 vC; varying float vA;
void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * 300.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`;
// neon: a white-hot core inside a saturated glow; values above 1 feed the bloom
const FS = `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
  float glow = pow(1.0 - d, 2.2), core = smoothstep(0.35, 0.0, d);
  vec3 c = vC * glow * 1.9 + vec3(1.0) * core * 0.9; gl_FragColor = vec4(c * vA, glow * vA); }`;
const COL = { offering: new THREE.Color('#ffb703'), dog: new THREE.Color('#5ab8ff'), kind: new THREE.Color('#ffd166'), grumpy: new THREE.Color('#ff3d5a'), neutral: new THREE.Color('#c9b8ff') };

export class Senses {
  constructor(scene) {
    this.N = 700; this.sniff = 0; this.dog = 0; this.dogTarget = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.N * 3); this.col = new Float32Array(this.N * 3); this.alpha = new Float32Array(this.N); this.size = new Float32Array(this.N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; this.points.renderOrder = 50; scene.add(this.points);
    this.parts = Array.from({ length: this.N }, () => ({ s: -1, t: Math.random(), o: new THREE.Vector3(), sp: 0.15 + Math.random() * 0.25 }));
    for (let i = 0; i < this.N; i++) this.size[i] = 0.25 + Math.random() * 0.35;
    this.sources = [];
    // the sniff pulse: a neon ring that rolls out to the edge of what the nose can reach
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.0, 2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.visible = false; this.ring.renderOrder = 49; scene.add(this.ring); this.pulse = -1;
  }
  toggleEyes() { this.dogTarget = this.dogTarget > 0.5 ? 0 : 1; return this.dogTarget > 0.5; }

  /** @param {{landmarks, npcs}} world-ish providers */
  update(dt, pup, sniffing, providers) {
    this.sniff += ((sniffing ? 1 : 0) - this.sniff) * Math.min(1, dt * 5);
    this.dog += (this.dogTarget - this.dog) * Math.min(1, dt * 3);
    U.uSniff.value = this.sniff; U.uDog.value = this.dog;
    if (sniffing && !this._was) this.pulse = 0;                     // pressed Q: send a pulse out
    this._was = sniffing;
    if (this.pulse >= 0) {
      this.pulse += dt; const k = this.pulse / SNIFF.pulseTime, r = 1 + k * SNIFF.radius;
      this.ring.visible = k < 1; this.ring.position.set(pup.pos.x, pup.pos.y + 0.15, pup.pos.z); this.ring.scale.setScalar(r); this.ring.material.opacity = (1 - k) * 0.9;
      if (k >= 1) this.pulse = -1;
    }
    this.points.visible = this.sniff > 0.02;
    if (!this.points.visible) return;
    if (!this._nt || (this._nt -= dt) <= 0) {
      this._nt = 0.4;
      const near = (p) => p.distanceToSquared(pup.pos) < SNIFF.radius * SNIFF.radius;
      this.sources = [];
      for (const s of providers.landmarks.scent) if (near(s)) this.sources.push({ p: s, c: COL.offering });
      for (const h of providers.npcs.people) if (near(h.pos)) this.sources.push({ p: h.pos, c: COL[h.mood] || COL.neutral, up: 0.8 });
      for (const d of providers.npcs.strays) if (near(d.pos)) this.sources.push({ p: d.pos, c: d.terr && !d.terr.friendly ? new THREE.Color(d.terr.color) : COL.dog, up: 0.3 });
      if (providers.extra) for (const s of providers.extra(pup.pos)) this.sources.push(s);
    }
    const nose = pup.eyePosition(), S = this.sources, T = performance.now() * 0.001;
    for (let i = 0; i < this.N; i++) {
      const q = this.parts[i];
      q.t += dt * q.sp;
      if (q.t > 1 || q.s >= S.length || q.s < 0) { q.t = q.t > 1 ? 0 : Math.random(); q.s = S.length ? Math.floor(Math.random() * S.length) : -1; q.o.set((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6); }
      if (q.s < 0) { this.alpha[i] = 0; continue; }
      const src = S[q.s], sy = src.p.y + (src.up || 0), big = src.fav ? 1.8 : 1, t = q.t;
      let x, y, z, a, sz;
      if (i % 3 === 0) {          // a stream drawn into the nose, curling as it comes
        const w = Math.sin(t * Math.PI);
        x = src.p.x + (nose.x - src.p.x) * t * 0.9 + Math.sin(t * 9 + i) * 0.45 * w; z = src.p.z + (nose.z - src.p.z) * t * 0.9 + Math.cos(t * 7 + i) * 0.45 * w;
        y = sy + (nose.y - sy) * t + w * 0.9; a = w * 0.75; sz = (0.6 + 0.4 * w) * big;
      } else if (src.column) {    // buried treasure: a slim spiral column of scent rising from the ground
        const ang = t * 8 + i;
        x = src.p.x + Math.cos(ang) * 0.25 * (1 - t); z = src.p.z + Math.sin(ang) * 0.25 * (1 - t); y = sy + t * 3.4; a = Math.sin(t * Math.PI) * (1 - t * 0.4); sz = (1.1 - t * 0.7) * big;
      } else {                    // evaporating wisps: rise, swirl, swell, then thin out to nothing
        const sw = 0.25 + t * 0.6;
        x = src.p.x + q.o.x + Math.sin(t * 5 + i + T) * sw; z = src.p.z + q.o.z + Math.cos(t * 4 + i + T) * sw; y = sy + t * t * 2.8 + t * 0.4;
        a = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t) * (1 - t) * 1.6; sz = (0.5 + Math.sin(t * Math.PI) * 0.9) * big;
      }
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.col[i * 3] = src.c.r; this.col[i * 3 + 1] = src.c.g; this.col[i * 3 + 2] = src.c.b;
      this.alpha[i] = Math.min(1, a) * this.sniff; this.size[i] = sz * (0.25 + (i % 7) * 0.05);
    }
    const at = this.points.geometry.attributes;
    at.position.needsUpdate = at.aColor.needsUpdate = at.aAlpha.needsUpdate = at.aSize.needsUpdate = true;
  }
}
