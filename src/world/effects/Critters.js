/**
 * Ambient little creatures around the pup (one instanced draw call, wings flap in the vertex shader):
 *   butterflies  by day, more where it's green; flutter and bob, scatter when the pup bounds at them
 *   dragonflies  darting over ponds and rivers on sunny days
 */
import * as THREE from 'three';

const MAX = 32;
const BUTTERFLY = ['#ff9f1c', '#ffd166', '#f15bb5', '#9bf6ff', '#ffffff', '#c77dff', '#ff595e'];
const DRAGONFLY = ['#4cc9f0', '#80ffdb', '#b5179e'];

function geometry() {
  // two wing quads per side (fore + hind) hinged on the body axis (z), plus a thin body
  const pos = [], uv = [], wing = [], idx = [];
  const quad = (x0, x1, z0, z1, side, u0) => {
    const b = pos.length / 3;
    pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    uv.push(u0, 0, u0 + 0.5, 0, u0 + 0.5, 1, u0, 1);
    wing.push(side, side, side, side);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad(-0.5, 0, -0.05, 0.45, -1, 0); quad(0, 0.5, -0.05, 0.45, 1, 0.5);      // fore wings
  quad(-0.38, 0, -0.42, -0.02, -1, 0); quad(0, 0.38, -0.42, -0.02, 1, 0.5);    // hind wings
  quad(-0.04, 0.04, -0.35, 0.3, 0, 0);                                        // body
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex(idx);
  return g;
}

export class Critters {
  constructor(scene) {
    const g = geometry();
    this.iM = []; // per-instance: offset(3)+heading, color, params (phase, flapSpeed, size, kind)
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iPar', this.aPar);
    g.instanceCount = 0;
    this.u = { uT: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, side: THREE.DoubleSide, transparent: true,
      vertexShader: /* glsl */ `
        uniform float uT; attribute float aWing; attribute vec4 iPos, iPar; attribute vec3 iCol;
        varying vec2 vUv; varying vec3 vC; varying float vK, vW;
        void main() {
          vUv = uv; vC = iCol; vK = iPar.w; vW = aWing;
          vec3 p = position;
          float flap = vK < 0.5 ? (0.25 + 0.95 * (0.5 + 0.5 * sin(uT * iPar.y + iPar.x))) : 0.15 + 0.25 * sin(uT * iPar.y + iPar.x);
          if (vK > 0.5) { p.x *= 1.25; p.z *= 0.35; }                   // dragonfly: long narrow wings
          if (aWing != 0.0) { float ax = abs(p.x); p.y = ax * sin(flap); p.x = sign(p.x) * ax * cos(flap); }
          p *= iPar.z;
          float c = cos(iPos.w), s = sin(iPos.w);
          p = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
          gl_Position = projectionMatrix * viewMatrix * vec4(p + iPos.xyz, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vC; varying float vK, vW;
        void main() {
          if (vW == 0.0) { gl_FragColor = vec4(0.12, 0.08, 0.06, 1.0); return; }
          vec2 q = vec2(fract(vUv.x * 2.0) * 2.0 - 1.0, vUv.y * 2.0 - 1.0);
          float r = length(q * vec2(1.0, 1.1));
          if (r > 1.0) discard;
          vec3 c = vC;
          if (vK < 0.5) { c = mix(c, vec3(0.1, 0.06, 0.05), smoothstep(0.75, 0.92, r)); c = mix(c, vec3(1.0), smoothstep(0.18, 0.0, length(q - vec2(0.35, 0.3))) * 0.9); }
          else c = mix(c, vec3(1.0), 0.45);
          gl_FragColor = vec4(c, vK < 0.5 ? 1.0 : 0.55);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = []; this.C = new THREE.Color();
  }

  #spawn(c, kind, focus, heightAt, waterSpot) {
    const a = Math.random() * 6.28, d = 4 + Math.random() * 16;
    const home = kind === 1 && waterSpot ? waterSpot : { x: focus.x + Math.cos(a) * d, z: focus.z + Math.sin(a) * d };
    c.kind = kind; c.home = home;
    c.x = home.x + (Math.random() - 0.5) * 4; c.z = home.z + (Math.random() - 0.5) * 4;
    c.y = heightAt(c.x, c.z) + (kind ? 0.6 : 0.4) + Math.random() * 1.6; c.h = Math.random() * 6.28; c.vx = c.vz = c.vy = 0; c.flee = 0; c.t = Math.random() * 10;
  }

  /** @param {{focus, day: number, rain: number, greenery: number, heightAt, waterNear?: (x, z, r) => {x, z} | null, pup}} o */
  update(dt, o) {
    this.u.uT.value += dt;
    const { focus, heightAt, pup } = o;
    const fair = o.day > 0.5 && o.rain < 0.25;
    const water = fair && o.waterNear ? o.waterNear(focus.x, focus.z, 40) : null;
    const wantB = fair ? Math.round(5 + o.greenery * 16) : 0, wantD = water ? 5 : 0, want = Math.min(MAX, wantB + wantD);
    while (this.list.length < want) {
      const i = this.list.length, c = {}; const kind = i < wantB ? 0 : 1;
      this.#spawn(c, kind, focus, heightAt, water);
      this.C.set(kind ? DRAGONFLY[(Math.random() * 3) | 0] : BUTTERFLY[(Math.random() * BUTTERFLY.length) | 0]).toArray(this.aCol.array, i * 3);
      this.aPar.setXYZW(i, Math.random() * 6.28, kind ? 40 + Math.random() * 10 : 9 + Math.random() * 5, kind ? 0.16 : 0.11 + Math.random() * 0.05, kind);
      this.list.push(c);
      this.aCol.needsUpdate = this.aPar.needsUpdate = true;
    }
    if (this.list.length > want) this.list.length = want;
    this.list.forEach((c, i) => {
      c.t += dt;
      const g = heightAt(c.x, c.z), dp = Math.hypot(pup.pos.x - c.x, pup.pos.z - c.z);
      if (dp < 1.6 && pup.speed > 1.5) c.flee = 1.5;
      if (Math.hypot(c.x - focus.x, c.z - focus.z) > 35) { this.#spawn(c, c.kind, focus, heightAt, water); }
      let tx = c.home.x + Math.sin(c.t * 0.37 + i) * (c.kind ? 6 : 3), tz = c.home.z + Math.cos(c.t * 0.29 + i * 2) * (c.kind ? 6 : 3);
      let ty = g + (c.kind ? 0.7 : 0.6 + 0.6 * Math.sin(c.t * 0.8 + i)) ;
      if (c.flee > 0) { c.flee -= dt; tx = c.x + (c.x - pup.pos.x) * 3; tz = c.z + (c.z - pup.pos.z) * 3; ty = g + 3; }
      const k = c.kind ? 3 : 1.4, sp = c.kind ? (Math.sin(c.t * 2.3 + i) > 0.6 ? 6 : 0.5) : 1.4 + c.flee;
      const dx = tx - c.x, dz = tz - c.z, l = Math.hypot(dx, dz) || 1;
      c.vx += ((dx / l) * sp + Math.sin(c.t * 3.1 + i) * (c.kind ? 0.2 : 0.8) - c.vx) * Math.min(1, dt * k);
      c.vz += ((dz / l) * sp + Math.cos(c.t * 2.7 + i) * (c.kind ? 0.2 : 0.8) - c.vz) * Math.min(1, dt * k);
      c.vy += ((ty - c.y) * 1.5 + (c.kind ? 0 : Math.sin(c.t * 7 + i) * 0.6) - c.vy) * Math.min(1, dt * 3);
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (Math.hypot(c.vx, c.vz) > 0.2) c.h += ((Math.atan2(c.vx, c.vz) - c.h + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 5);
      this.aPos.setXYZW(i, c.x, Math.max(c.y, g + 0.15), c.z, c.h);
    });
    this.mesh.geometry.instanceCount = this.list.length;
    this.aPos.needsUpdate = true;
  }
}
