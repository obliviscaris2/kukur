/** Rain streaks around the camera + little splash rings on the ground. */
import * as THREE from 'three';
import { EFFECTS } from '../../config/index.js';

export class Rain {
  constructor(scene) {
    const N = (this.N = EFFECTS.rainDrops);
    this.drops = new Float32Array(N * 3); this.pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { this.drops[i * 3] = (Math.random() - 0.5) * 60; this.drops[i * 3 + 1] = Math.random() * 30; this.drops[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.55 }));
    this.lines.frustumCulled = false; this.lines.visible = false; scene.add(this.lines);
    const ring = new THREE.RingGeometry(0.05, 0.075, 10); ring.rotateX(-Math.PI / 2);
    this.splash = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: '#dfe9ff', transparent: true, opacity: 0.35, depthWrite: false }), EFFECTS.splashes);
    this.splash.frustumCulled = false; this.splash.count = 0; scene.add(this.splash);
    this.sp = Array.from({ length: EFFECTS.splashes }, () => ({ x: 0, y: 0, z: 0, t: Math.random() }));
    this.m = new THREE.Matrix4();
  }
  update(dt, amount, wind, camera, focus, heightAt) {
    const on = amount > 0.05;
    this.lines.visible = this.splash.visible = on;
    if (!on) return;
    const n = Math.floor(this.N * Math.min(1, amount)), c = camera.position, wx = wind * 2.5;
    for (let i = 0; i < this.N; i++) {
      const o = i * 3; let y = this.drops[o + 1] - dt * 22; if (y < -2) y += 30; this.drops[o + 1] = y;
      const x = c.x + this.drops[o] + y * 0.08 * wx, z = c.z + this.drops[o + 2], yy = c.y - 6 + y, v = i < n ? 0 : -999;
      const p = i * 6; this.pos[p] = x; this.pos[p + 1] = yy + v; this.pos[p + 2] = z; this.pos[p + 3] = x + wx * 0.05; this.pos[p + 4] = yy + 0.55 + v; this.pos[p + 5] = z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.material.opacity = 0.35 + 0.3 * amount;
    let k = 0;
    for (const s of this.sp) {
      s.t += dt * 2.2;
      if (s.t > 1) { s.t = 0; s.x = focus.x + (Math.random() - 0.5) * 24; s.z = focus.z + (Math.random() - 0.5) * 24; s.y = heightAt(s.x, s.z) + 0.05; }
      const sc = 1 + s.t * 3; this.m.makeScale(sc, 1, sc).setPosition(s.x, s.y, s.z); this.splash.setMatrixAt(k++, this.m);
    }
    this.splash.count = Math.floor(k * Math.min(1, amount)); this.splash.instanceMatrix.needsUpdate = true;
  }
}
