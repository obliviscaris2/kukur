/**
 * Cosy ground cover: grass tufts and little flowers in parks, gardens and fields (Stardew-style coziness).
 * Points come from the tile worker (tile.data.tufts: x, y, z, kind 0 = grass / 1..5 = flower colour, rand);
 * the ones near the pup are drawn as two instanced meshes that ripple in the wind (toon 'grass' wind).
 */
import * as THREE from 'three';
import { tuftGeometry, flowerGeometry } from '../props/natureGeometry.js';
import { NATURE } from '../../config/index.js';
import { natureMaterial } from '../../render/natureMaterial.js';

const NEAR = NATURE.planting.coverRadius, MAX_G = NATURE.planting.grassCapacity, MAX_F = NATURE.planting.flowerCapacity;
const FLOWERS = NATURE.planting.flowers;

export class Grass {
  constructor(scene, world) {
    this.byTile = new Map(); this.last = new THREE.Vector3(1e9, 0, 0);
    const mat = natureMaterial('grass');
    this.grass = new THREE.InstancedMesh(tuftGeometry(), mat, MAX_G);
    this.flowers = new THREE.InstancedMesh(flowerGeometry(), natureMaterial('flower'), MAX_F);
    for (const m of [this.grass, this.flowers]) { m.count = 0; m.frustumCulled = false; m.receiveShadow = true; scene.add(m); }
    this.flowers.setColorAt(0, new THREE.Color());
    world.onTile((ev, tile) => { if (ev === 'load' && tile.data.tufts?.length) this.byTile.set(tile.key, tile.data.tufts); else if (ev !== 'load') this.byTile.delete(tile.key); this.last.set(1e9, 0, 0); });
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(); this.P = new THREE.Vector3(); this.Y = new THREE.Vector3(0, 1, 0); this.C = new THREE.Color();
  }
  update(focus) {
    if (this.last.distanceToSquared(focus) < 16) return;
    this.last.copy(focus);
    let ng = 0, nf = 0;
    for (const t of this.byTile.values()) for (let i = 0; i < t.length; i += 5) {
      const dx = t[i] - focus.x, dz = t[i + 2] - focus.z; if (dx * dx + dz * dz > NEAR * NEAR) continue;
      const k = t[i + 3], rnd = t[i + 4];
      this.Q.setFromAxisAngle(this.Y, rnd * 6.28); this.S.setScalar(0.75 + rnd * 0.7);
      this.M.compose(this.P.set(t[i], t[i + 1], t[i + 2]), this.Q, this.S);
      if (k === 0 && ng < MAX_G) this.grass.setMatrixAt(ng++, this.M);
      else if (k > 0 && nf < MAX_F) { this.flowers.setMatrixAt(nf, this.M); this.flowers.setColorAt(nf++, this.C.set(FLOWERS[k - 1])); }
    }
    this.grass.count = ng; this.flowers.count = nf; this.grass.visible = ng > 0; this.flowers.visible = nf > 0;
    this.grass.instanceMatrix.needsUpdate = this.flowers.instanceMatrix.needsUpdate = true; if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
  }
}
