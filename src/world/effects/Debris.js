/**
 * Wind-blown things around the pup, all carried by the shared wind field (Wind.js):
 *   leaves (flutter and tumble), marigold offerings, dandelion fluff that
 *   drifts slowly and glints, dust motes, and the odd plastic bag. Whirlwinds pull everything into a spiral.
 * One instanced mesh; each particle respawns upwind of the pup when its life ends.
 */
import * as THREE from 'three';
import { EFFECTS, ART } from '../../config/index.js';
import { unlit } from '../../render/toon.js';

const LEAF = ART.foliage.leaves;
const MARIGOLD = ['#ff9f1c', '#ffb703', '#ff7b00'];
// kind: 0 leaf, 1 marigold offering, 2 dust, 3 plastic bag, 4 fluff. Airborne blossom lives in Petals.js.
const DRAG = [1.6, 2.2, 3.0, 0.9, 3.2], FALL = [0.55, 0.35, 0.03, 0.25, 0.04], SIZE = [1, 0.7, 0.25, 3.2, 0.35];

export class Debris {
  constructor(scene) {
    const N = (this.N = EFFECTS.debris);
    const g = new THREE.PlaneGeometry(0.14, 0.09);
    this.mesh = new THREE.InstancedMesh(g, unlit({ side: THREE.DoubleSide, color: '#ffffff' }, { key: 'debris' }), N);
    this.mesh.frustumCulled = false; this.mesh.count = 0; scene.add(this.mesh);
    this.p = Array.from({ length: N }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), kind: 0, life: 0, size: 1, ph: Math.random() * 6.28 }));
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(); this.C = new THREE.Color(); this.w = new THREE.Vector3();
    this.petalSources = []; this.templeSources = [];
  }

  update(dt, W, focus, heightAt, time, wind) {
    const want = Math.floor(this.N * Math.min(1, W.leaves * 0.55 + W.dust * 0.25 + (wind.eddies.length ? 0.2 : 0) + 0.03));
    this.mesh.count = want;this.mesh.visible=want>0;
    if (!want) return;
    for (let i = 0; i < want; i++) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) this.#spawn(i, q, W, focus, heightAt, wind);
      const g = heightAt(q.pos.x, q.pos.z), k = q.kind;
      wind.at(q.pos.x, q.pos.z, q.pos.y - g, this.w);
      const drag = DRAG[k] * dt;
      q.vel.x += (this.w.x - q.vel.x) * Math.min(1, drag);
      q.vel.z += (this.w.z - q.vel.z) * Math.min(1, drag);
      // leaves see-saw as they fall; fluff bobs; gusts give lift
      const lift = this.w.y + (Math.hypot(this.w.x, this.w.z) - 2) * 0.12;
      const flutter = k === 0 || k === 1 ? Math.sin(time * 4 + q.ph) * 0.8 : k === 4 ? Math.sin(time * 1.3 + q.ph) * 0.25 : 0;
      q.vel.y += (-FALL[k] + lift + flutter - q.vel.y) * Math.min(1, dt * 2.2);
      if (k === 0 || k === 1) { q.vel.x += Math.cos(time * 4 + q.ph) * 0.6 * dt; q.vel.z += Math.sin(time * 3.3 + q.ph) * 0.6 * dt; }
      q.pos.addScaledVector(q.vel, dt);
      if (q.pos.y < g + 0.02) { q.pos.y = g + 0.02; q.vel.x *= 0.85; q.vel.z *= 0.85; q.vel.y = Math.max(0, q.vel.y); }
      const sp = 0.3 + Math.hypot(q.vel.x, q.vel.z) * 0.25 * (q.pos.y > g + 0.05 ? 1 : 0.2);
      q.rot.x += q.spin.x * dt * sp; q.rot.y += q.spin.y * dt * sp; q.rot.z += q.spin.z * dt * sp;
      this.Q.setFromEuler(q.rot);
      this.M.compose(q.pos, this.Q, this.S.setScalar(q.size * Math.min(1, q.life * 2)));
      this.mesh.setMatrixAt(i, this.M);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  #spawn(i, q, W, focus, heightAt, wind) {
    const r = Math.random(), eddy = wind.eddies.length && Math.random() < 0.35 ? wind.eddies[(Math.random() * wind.eddies.length) | 0] : null;
    const marigold = this.templeSources.length && r < 0.12;
    q.kind = marigold ? 1 : r < 0.45 + W.leaves * 0.35 ? 0 : r < 0.8 ? 2 : r < 0.97 ? 4 : 3;
    if (eddy) { const a = Math.random() * 6.28, d = Math.random() * eddy.r; q.pos.set(eddy.x + Math.cos(a) * d, 0, eddy.z + Math.sin(a) * d); q.pos.y = heightAt(q.pos.x, q.pos.z) + 0.05; if (q.kind === 3 || q.kind === 4) q.kind = 0; }
    else if (marigold) { const s = this.templeSources[(Math.random()*this.templeSources.length)|0]; q.pos.set(s[0] + (Math.random() - 0.5) * 3, s[1] + 2 + Math.random() * 3, s[2] + (Math.random() - 0.5) * 3); }
    else {
      const back = 12 + Math.random() * 6, side = (Math.random() - 0.5) * 34;
      const x = focus.x - wind.dir.x * back - wind.dir.y * side, z = focus.z - wind.dir.y * back + wind.dir.x * side;
      q.pos.set(x, heightAt(x, z) + 0.3 + Math.random() * (q.kind === 2 || q.kind === 4 ? 3 : 6), z);
    }
    q.vel.set(0, 0, 0); q.life = q.kind === 4 ? 8 + Math.random() * 6 : 4 + Math.random() * 5;
    q.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 9);
    q.size = SIZE[q.kind] * (0.8 + Math.random() * 0.5);
    const col = q.kind === 0 ? LEAF[(Math.random() * LEAF.length) | 0] : q.kind === 1 ? MARIGOLD[(Math.random() * 3) | 0]
      : q.kind === 2 ? '#f3e3c3' : q.kind === 4 ? '#fffdf5' : Math.random() < 0.5 ? '#ffffff' : '#6ec1e4';
    this.mesh.setColorAt(i, this.C.set(col));
  }
}
