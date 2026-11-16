/**
 * Wind streaks: thin curling white lines that ride the breeze (and sometimes loop-the-loop), like a
 * storybook drawing of wind. Entirely shader-driven: the CPU only respawns a streak when it fades.
 * One instanced draw call; count scales with wind strength.
 */
import * as THREE from 'three';
import { GUST_SPEED } from '../sky/Wind.js';
import { ART } from '../../config/index.js';

const STYLE=ART.windStreaks,SEG=STYLE.segments,MAX=STYLE.capacity;

export class WindStreaks {
  constructor(scene) {
    const base = new THREE.InstancedBufferGeometry();
    const s = [], side = [], idx = [];
    for (let i = 0; i <= SEG; i++) { s.push(i / SEG, i / SEG); side.push(-1, 1); if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    base.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(s.length * 3), 3));
    base.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
    base.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    base.setIndex(idx);
    this.iStart = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.iDir = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    this.iP = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);   // t0, length, wobble, loopAt
    this.iQ = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);   // speed, life
    for (const [k, a] of Object.entries({ iStart: this.iStart, iDir: this.iDir, iP: this.iP, iQ: this.iQ })) { a.setUsage(THREE.DynamicDrawUsage); base.setAttribute(k, a); }
    base.instanceCount = 0;
    this.u = { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uOpacity: { value: STYLE.opacity },uColour:{value:new THREE.Color(STYLE.colour)},uWidth:{value:STYLE.width},uLoopRadius:{value:STYLE.loopRadius} };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uT,uWidth,uLoopRadius; uniform vec3 uCam;
        attribute float aS, aSide; attribute vec3 iStart; attribute vec2 iDir; attribute vec4 iP; attribute vec2 iQ;
        varying float vA;
        vec3 path(float u) {
          vec3 d = vec3(iDir.x, 0.0, iDir.y), pr = vec3(-iDir.y, 0.0, iDir.x);
          vec3 p = iStart + d * u + pr * sin(u * 0.21 + iP.z * 9.0) * iP.z + vec3(0.0, sin(u * 0.13 + iP.z * 4.0) * iP.z * 0.6, 0.0);
          if (iP.w > 0.0) { float r = uLoopRadius, th = clamp((u - iP.w) / r, 0.0, 6.2832); p += d * (r * sin(th) - r * th) + vec3(0.0, r * (1.0 - cos(th)), 0.0); }
          return p;
        }
        void main() {
          float age = uT - iP.x, head = age * iQ.x, u = head - aS * iP.y;
          vec3 P = path(max(u, 0.0)), T = normalize(path(max(u, 0.0) + 0.25) - P + 1e-4), V = normalize(uCam - P);
          vec3 sd = normalize(cross(T, V) + 1e-5);
          float taper = sin(3.14159 * aS);
          float cd = length(uCam - P);
          P += sd * aSide * uWidth * (0.35 + taper) * (1.0 + 0.015 * cd);
          vA = taper * smoothstep(0.0, 0.6, age) * (1.0 - smoothstep(iQ.y - 0.9, iQ.y, age)) * step(0.0, u) * smoothstep(3.0, 8.0, cd);
          gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uColour; varying float vA;
        void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColour, vA * uOpacity);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(base, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.geo = base; this.ends = new Float32Array(MAX); this.t = 0;
  }

  #spawn(i, wind, focus, heightAt) {
    const a = wind.angle + (Math.random() - 0.5) * 0.35, dx = Math.sin(a), dz = Math.cos(a);
    const side = (Math.random() - 0.5) * 36, back = 4 + Math.random() * 18;
    const x = focus.x - dx * back - dz * side, z = focus.z - dz * back + dx * side;
    this.iStart.setXYZ(i, x, heightAt(x, z) + 0.5 + Math.random() * 4, z);
    this.iDir.setXY(i, dx, dz);
    const life = 2.6 + Math.random() * 2.2, speed = (GUST_SPEED * 0.6 + Math.random() * 4) * (0.6 + wind.strength * 0.5);
    this.iP.setXYZW(i, this.t, STYLE.length[0] + Math.random() * (STYLE.length[1]-STYLE.length[0]), 0.25 + Math.random() * 0.9, Math.random() < STYLE.loopChance ? 4 + Math.random() * 10 : -1);
    this.iQ.setXY(i, speed, life);
    this.ends[i] = this.t + life;
  }

  update(dt, wind, camera, focus, heightAt) {
    this.t += dt; this.u.uT.value = this.t; this.u.uCam.value.copy(camera.position);
    const want = Math.round(MAX * Math.min(1, Math.max(0, (wind.strength - 0.2) / 1.2)));
    let dirty = false;
    for (let i = 0; i < want; i++) if (this.t > this.ends[i]) {
      if (Math.random() < 0.6 + wind.strength * 0.3) { this.#spawn(i, wind, focus, heightAt); dirty = true; }
      else this.ends[i] = this.t + Math.random() * 1.5;      // stagger
    }
    this.geo.instanceCount = want;
    this.mesh.visible=want>0;
    this.u.uOpacity.value = STYLE.opacity + Math.min(STYLE.maxOpacity-STYLE.opacity, wind.strength * 0.08);
    if (dirty) for (const a of [this.iStart, this.iDir, this.iP, this.iQ]) a.needsUpdate = true;
  }
}
