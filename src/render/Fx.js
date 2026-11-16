/**
 * Little bursts that make actions feel good ("juice"). One point cloud (one draw call) with procedural shapes:
 *   dust     soft puffs (hop, landing, skids, footsteps on zoomies)
 *   sparkle  four-point twinkles in happy colours (fairy dust: jumps, zoomies trail, treats, discoveries)
 *   heart    pink hearts floating up (petted, eating)
 *   drop     water droplets with gravity (splashing, swimming)
 * plus flat ripple rings on water (instanced quads).
 *
 *   fx.burst('dust', pos, 8)            fx.burst('sparkle', pos, 12, { colors: [...], up: 1.5 })
 *   fx.ripple(pos, size)
 */
import * as THREE from 'three';
import { PARTICLES } from '../config/index.js';

const N = PARTICLES.capacity, RIPPLES = PARTICLES.ripples;
const KIND = { dust: 0, sparkle: 1, heart: 2, drop: 3, leaf: 4, scrap: 5 };
const PALETTE = { dust: ['#e9d8bd', '#d9c3a0', '#f3e6cf'], sparkle: ['#ffe066', '#ff8fab', '#9bf6ff', '#caffbf', '#ffd6a5', '#bdb2ff'], heart: ['#ff5d8f', '#ff8fab', '#ff4d6d'], drop: ['#d6f1ff', '#ffffff', '#a8dcff'], leaf: ['#dca44d', '#b96835', '#e7bd66', '#8c9d4c'], scrap: ['#f6e7c8', '#90b7a5', '#bdcbd7'] };

export class Fx {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3); this.dat = new Float32Array(N * 4); // kind, size, alpha, spin
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDat', new THREE.BufferAttribute(this.dat, 4).setUsage(THREE.DynamicDrawUsage));
    this.u = { uScale: { value: 420 }, uT: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: /* glsl */ `
        uniform float uScale; attribute vec4 aDat; varying vec3 vC; varying vec4 vD;
        void main() { vC = color; vD = aDat; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aDat.y * uScale / max(0.3, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform float uT; varying vec3 vC; varying vec4 vD;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0; p.y = -p.y; float a = 0.0; vec3 c = vC;
          if (vD.x < 0.5) { float r = length(p); a = smoothstep(1.0, 0.35, r) * 0.75; c *= 0.9 + 0.1 * p.y; }                       // dust
          else if (vD.x < 1.5) { float s = sin(vD.w); float cs = cos(vD.w); vec2 q = mat2(cs, -s, s, cs) * p; vec2 aq = abs(q);
            float star = max(1.0 - (aq.x * 6.0 + aq.y * 0.9), 1.0 - (aq.y * 6.0 + aq.x * 0.9)); a = smoothstep(0.0, 0.25, star) + smoothstep(0.55, 0.0, length(q)) * 0.6;
            c = mix(c, vec3(1.0), smoothstep(0.25, 0.0, length(q))); }                                                               // sparkle
          else if (vD.x < 2.5) { vec2 q = p * 1.15; q.y += 0.25; float h = q.x * q.x + pow(q.y - pow(abs(q.x), 0.66), 2.0);
            a = smoothstep(0.62, 0.5, h); c = mix(c, vec3(1.0), smoothstep(0.2, 0.0, length(q - vec2(-0.3, 0.25))) * 0.7); }     // heart
          else if (vD.x < 3.5) { float r = length(p); a = smoothstep(1.0, 0.6, r); c = mix(c, vec3(1.0), smoothstep(0.5, 0.0, length(p + vec2(0.3, -0.3)))); }
          else { float cs = cos(vD.w), sn = sin(vD.w); vec2 q = mat2(cs, -sn, sn, cs) * p;
            if (vD.x < 4.5) { a = 1.0 - smoothstep(0.82, 1.0, abs(q.x) * 1.5 + q.y * q.y); c *= 0.82 + 0.18 * smoothstep(0.015, 0.05, abs(q.x)); }
            else { a = (1.0 - smoothstep(0.75, 0.85, abs(q.x))) * (1.0 - smoothstep(0.6, 0.72, abs(q.y))); c *= 0.88 + q.x * 0.12; } }
          a *= vD.z; if (a < 0.02) discard;
          gl_FragColor = vec4(c, a);
        }`,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
    this.p = Array.from({ length: N }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, grow: 0, kind: 0, g: 0, drag: 0, spin: 0, vs: 0 }));
    this.next = 0; this.C = new THREE.Color();
    // ripples: flat rings on water
    const rg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const rm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'attribute float aA; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; varying float vA; void main(){ float r = length(vUv - 0.5) * 2.0; float ring = smoothstep(0.08, 0.0, abs(r - 0.8)) + smoothstep(0.06, 0.0, abs(r - 0.55)) * 0.5; if (ring * vA < 0.02) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, ring * vA * 0.7); }',
    });
    this.rip = new THREE.InstancedMesh(rg, rm, RIPPLES); this.rip.frustumCulled = false; this.rip.count = 0; this.rip.renderOrder = 2;
    this.ripA = new THREE.InstancedBufferAttribute(new Float32Array(RIPPLES), 1); rg.setAttribute('aA', this.ripA);
    scene.add(this.rip);
    this.ripples = []; this.M = new THREE.Matrix4();
  }

  /** Spawn n particles of a kind at pos. opts: { colors, speed, up, size, life, spread } */
  burst(kind, pos, n = 8, o = {}) {
    const k = KIND[kind] ?? 0, cols = o.colors || PALETTE[kind];
    for (let i = 0; i < Math.min(n, PARTICLES.maxBurst); i++) {
      const q = this.p[this.next]; this.next = (this.next + 1) % N;
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? (k === 0 ? 1.2 : k === 3 ? 2.2 : 1.4)) * (0.4 + Math.random() * 0.8), sr = o.spread ?? 0.15;
      q.alive = true; q.kind = k;
      q.x = pos.x + Math.cos(a) * sr * Math.random(); q.y = pos.y + (o.y ?? 0.05); q.z = pos.z + Math.sin(a) * sr * Math.random();
      q.vx = Math.cos(a) * sp + (o.vx || 0); q.vz = Math.sin(a) * sp + (o.vz || 0); q.vy = (o.up ?? (k === 0 ? 0.5 : k === 2 ? 1.0 : k === 3 ? 2.8 : 1.6)) * (0.6 + Math.random() * 0.8);
      q.max = q.life = (o.life ?? (k === 0 ? 0.7 : k === 2 ? 1.4 : k === 3 ? 0.9 : 1.1)) * (0.7 + Math.random() * 0.6);
      q.size = (o.size ?? (k === 0 ? 0.22 : k === 2 ? 0.16 : k === 3 ? 0.06 : 0.1)) * (0.7 + Math.random() * 0.6);
      q.grow = k === 0 ? 1.8 : 0; q.g = k >= 4 ? 2.5 : k === 3 ? 9.8 : k === 0 ? -0.3 : k === 2 ? -0.6 : 0.6; q.drag = k >= 4 ? 0.8 : k === 0 ? 3.5 : k === 3 ? 0.3 : 2.2;
      q.spin = Math.random() * 6; q.vs = (Math.random() - 0.5) * 6;
      this.C.set(cols[(Math.random() * cols.length) | 0]).toArray(this.col, (this.next === 0 ? N - 1 : this.next - 1) * 3);
    }
  }
  ripple(pos, size = 1) {
    if (this.ripples.length >= RIPPLES) this.ripples.shift();
    this.ripples.push({ x: pos.x, y: pos.y + 0.02, z: pos.z, age: 0, size });
  }

  update(dt) {
    let any = false, live = 0, last = 0;
    for (let i = 0; i < N; i++) {
      const q = this.p[i];
      if (!q.alive) { if (this.dat[i * 4 + 2] !== 0) { this.dat[i * 4 + 2] = 0; any = true; } continue; }
      any = true;
      q.life -= dt; if (q.life <= 0) { q.alive = false; this.dat[i * 4 + 2] = 0; continue; }
      live++; last = i + 1;
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr; q.vz *= dr; q.vy = q.vy * (q.kind === 3 ? 1 : dr) - q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.spin += q.vs * dt;
      if (q.kind === 2) q.x += Math.sin(q.life * 6 + i) * 0.3 * dt;
      if (q.kind >= 4) { q.x += Math.sin(q.life * 9 + i) * 0.4 * dt; q.vy += Math.sin(q.life * 12 + i) * dt * 1.6; }
      const t = 1 - q.life / q.max;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.dat[i * 4] = q.kind; this.dat[i * 4 + 1] = q.size * (1 + q.grow * t) * (q.kind === 1 ? 0.6 + 0.4 * Math.sin(q.life * 18 + i) : 1);
      this.dat[i * 4 + 2] = Math.min(1, q.life / (q.max * 0.35)) * Math.min(1, t * 8 + 0.3); this.dat[i * 4 + 3] = q.spin;
    }
    if (any) { const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.aDat.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    this.points.visible = live > 0; this.points.geometry.setDrawRange(0, last); this.live = live;
    // ripples
    this.ripples = this.ripples.filter((r) => (r.age += dt) < 1.6);
    this.ripples.forEach((r, i) => {
      const s = r.size * (0.4 + r.age * 1.2);
      this.M.makeScale(s, 1, s).setPosition(r.x, r.y, r.z); this.rip.setMatrixAt(i, this.M); this.ripA.setX(i, 1 - r.age / 1.6);
    });
    this.rip.count = this.ripples.length; this.rip.instanceMatrix.needsUpdate = true; this.ripA.needsUpdate = true;
    this.rip.visible = this.rip.count > 0;
  }
}
