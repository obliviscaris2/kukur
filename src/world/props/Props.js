/**
 * Instanced street props, streamed by distance. Each loaded tile hands over flat Float32Arrays
 * (see buildTile.js `props`), and every ~0.35 s the instanced meshes are refilled with what is near the pup.
 * One draw call per prop type (trees: per kind and LOD).
 */
import * as THREE from 'three';
import { toon, unlit } from '../../render/toon.js';
import { PALETTE, NATURE } from '../../config/index.js';
import { natureMaterial, natureDepth, distantNatureMaterial } from '../../render/natureMaterial.js';
import { treeVariation } from './natureGeometry.js';
import * as G from './catalog.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();

class Field { // one instanced mesh fed from all tiles
  constructor(scene, geo, mat, cap, shadows = true, tree = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = shadows; this.mesh.receiveShadow = true;
    this.n = 0; scene.add(this.mesh);
    if(tree){this.mesh.customDepthMaterial=natureDepth();this.lod=new THREE.InstancedBufferAttribute(new Float32Array(cap*3),3).setUsage(THREE.DynamicDrawUsage);geo.setAttribute('treeLod',this.lod);}
  }
  begin() { this.n = 0; }
  push(m, color, fade=0, phase=0, golden=0) { if (this.n >= this.mesh.instanceMatrix.count) return; this.mesh.setMatrixAt(this.n, m); if (color) this.mesh.setColorAt(this.n, color);if(this.lod)this.lod.setXYZ(this.n,fade,phase,golden); this.n++; }
  end() { this.mesh.count = this.n; this.mesh.visible = this.n > 0; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;if(this.lod)this.lod.needsUpdate=true; }
}

export class Props {
  constructor(scene, quality) {
    this.scene = scene; this.R = quality.props; this.tiles = new Map();
    const vc = { vertexColors: true };
    const treeMat = natureMaterial('tree','tree',true);
    const farMat = distantNatureMaterial();
    this.trees = [0, 1, 2, 3, 4].map((k) => ({ near: new Field(scene, G.treeGeometry(k, 0), treeMat, 500,true,true), far: new Field(scene, G.treeGeometry(k, 1), farMat, 1600,false,true) }));
    const mat = (key) => toon('#ffffff', { rim: 0.3, key, params: vc });
    this.poles = new Field(scene, G.poleGeometry(), mat('pole'), 600);
    this.lamps = new Field(scene, G.lampGeometry(), mat('lamp'), 300);
    this.bulbMat = unlit({ color: '#fff3c4' }, { key: 'bulb' });
    this.bulbs = new Field(scene, new THREE.OctahedronGeometry(0.17, 0), this.bulbMat, 300, false);
    this.bikes = new Field(scene, G.scooterGeometry(), mat('bike'), 400);
    this.tanks = new Field(scene, G.tankGeometry(), mat('tank'), 1500);
    this.solar = new Field(scene, G.solarGeometry(), mat('solar'), 500);
    this.plants = new Field(scene, G.plantGeometry(), natureMaterial('pot'), 1500, false);
    this.benches = new Field(scene, G.benchGeometry(), mat('bench'), 200);
    this.flags = new Field(scene, G.flagGeometry(), toon('#ffffff', { rim: 0, wind: 'flag', key: 'flag', params: { side: THREE.DoubleSide } }), 9000, false);
    this.cloth = new Field(scene, G.clothGeometry(), toon('#ffffff', { rim: 0, wind: 'cloth', key: 'cloth', params: { side: THREE.DoubleSide } }), 3000, false);
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), unlit({ color: '#5a4a3a' }, { key: 'strings' }));
    this.lines.frustumCulled = false; scene.add(this.lines);
    // warm light pools under street lamps at night (additive decals, no real lights)
    const gc = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), gx = gc.getContext('2d');
    const grd = gx.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,200,120,1)'); grd.addColorStop(1, 'rgba(255,160,80,0)');
    gx.fillStyle = grd; gx.fillRect(0, 0, 64, 64);
    const pool = new THREE.PlaneGeometry(7, 7); pool.rotateX(-Math.PI / 2);
    this.glowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#000000' });
    this.glow = new Field(scene, pool, this.glowMat, 300, false); this.glow.mesh.renderOrder = 2;
    this._t = 0; this._last = new THREE.Vector3(1e9, 0, 0);
    this.frustum = new THREE.Frustum(); this.view = new THREE.Matrix4(); this.sphere = new THREE.Sphere(); this.lastCamera = new THREE.Quaternion();
  }
  addTile(key, props) { this.tiles.set(key, props); this._t = 0; }
  removeTile(key) { this.tiles.delete(key); this._t = 0; }

  /** Nearby trees of any kind: [x, y, z, kind, scale] (birds build nests in them). */
  treesNear(focus, radius, max = 30) {
    const out = [];
    for (const p of this.tiles.values()) { const t = p.trees; for (let i = 0; i < t.length && out.length < max; i += 5) if (Math.hypot(t[i] - focus.x, t[i + 2] - focus.z) < radius) out.push([t[i], t[i + 1], t[i + 2], t[i + 3], t[i + 4]]); }
    return out;
  }
  /** Positions of nearby trees of a kind (used by weather to drop jacaranda petals). */
  nearbyTrees(kind, focus, radius, max = 12) {
    const out = [];
    for (const p of this.tiles.values()) { const t = p.trees; for (let i = 0; i < t.length && out.length < max; i += 5) if (t[i + 3] === kind && Math.hypot(t[i] - focus.x, t[i + 2] - focus.z) < radius) out.push([t[i], t[i + 1], t[i + 2]]); }
    return out;
  }

  update(dt, focus, night, camera) {
    this.bulbMat.color.setRGB(0.55 + night * 0.6, 0.5 + night * 0.45, 0.35 + night * 0.15);
    this.glowMat.color.setScalar(night * 0.55); this.glow.mesh.visible = night > 0.05;
    this._t -= dt;
    if (this._t > 0 && this._last.distanceToSquared(focus) < 9 && (!camera || Math.abs(this.lastCamera.dot(camera.quaternion)) > .995)) return;
    this._t = 0.35; this._last.copy(focus);
    if (camera) { this.lastCamera.copy(camera.quaternion); this.frustum.setFromProjectionMatrix(this.view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
    const fx = focus.x, fz = focus.z, R = this.R;
    const near = (x, z, r) => (x - fx) * (x - fx) + (z - fz) * (z - fz) < r * r;
    const fields = [...this.trees.flatMap((t) => [t.near, t.far]), this.poles, this.lamps, this.bulbs, this.bikes, this.tanks, this.solar, this.plants, this.benches, this.flags, this.cloth, this.glow];
    for (const f of fields) f.begin();
    const lines = [];
    for (const p of this.tiles.values()) {
      const t = p.trees;
      for (let i = 0; i < t.length; i += 5) {
        const x = t[i], z = t[i + 2], d2 = (x - fx) ** 2 + (z - fz) ** 2;
        if (d2 > R.treesFar * R.treesFar) continue;
        const s = t[i + 4], k = t[i + 3] | 0,v=treeVariation(x,z,k),distance=Math.sqrt(d2),blend=NATURE.trees.lodBlend;
        // Retain close off-screen shadow casters, but don't submit a whole forest behind the camera.
        this.sphere.center.set(x, t[i + 1] + 3.4*s, z); this.sphere.radius = 5*s;
        if (camera && d2 > 24*24 && !this.frustum.intersectsSphere(this.sphere)) continue;
        M4.compose(P.set(x, t[i + 1], z), Q.setFromAxisAngle(Y, v.yaw), S.set(s, s*v.stretch, s));
        const fade=THREE.MathUtils.smoothstep(distance,R.treesNear-blend,R.treesNear+blend);C.setScalar(v.tint);
        if(fade<1)this.trees[k].near.push(M4,C,fade,0,v.golden);
        if(fade>0)this.trees[k].far.push(M4,C,fade,1,v.golden);
      }
      const simple = (arr, field, r, extra) => {
        for (let i = 0; i < arr.length; i += 4) {
          if (!near(arr[i], arr[i + 2], r)) continue;
          Q.setFromAxisAngle(Y, arr[i + 3]); M4.compose(P.set(arr[i], arr[i + 1], arr[i + 2]), Q, S.set(1, 1, 1));
          field.push(M4, extra ? extra(i) : null);
        }
      };
      simple(p.poles, this.poles, R.poles);
      simple(p.bikes, this.bikes, R.small, (i) => C.set(['#e63946', '#2a5bd7', '#ffffff', '#ffcc29', '#2a9d8f', '#ff6fa8', '#222222'][(i / 4) % 7]));
      simple(p.tanks, this.tanks, R.roof);
      simple(p.solar, this.solar, R.roof);
      simple(p.benches, this.benches, R.small);
      for (let i = 0; i < p.plants.length; i += 4) {
        if (!near(p.plants[i], p.plants[i + 2], R.small)) continue;
        const s = 0.8 + p.plants[i + 3] * 0.6; M4.compose(P.set(p.plants[i], p.plants[i + 1], p.plants[i + 2]), Q.setFromAxisAngle(Y, p.plants[i + 3] * 6), S.set(s, s, s));
        this.plants.push(M4);
      }
      for (let i = 0; i < p.lamps.length; i += 4) {
        if (!near(p.lamps[i], p.lamps[i + 2], R.poles)) continue;
        Q.setFromAxisAngle(Y, p.lamps[i + 3]); M4.compose(P.set(p.lamps[i], p.lamps[i + 1], p.lamps[i + 2]), Q, S.set(1, 1, 1)); this.lamps.push(M4);
        const off = new THREE.Vector3(0, 6.0, 1.1).applyQuaternion(Q);
        M4.compose(P.set(p.lamps[i] + off.x, p.lamps[i + 1] + off.y, p.lamps[i + 2] + off.z), Q, S); this.bulbs.push(M4);
        M4.compose(P.set(p.lamps[i] + off.x, p.lamps[i + 1] + 0.05, p.lamps[i + 2] + off.z), Q.identity(), S); this.glow.push(M4);
      }
      // strings of prayer flags and laundry (flags/cloth hang from a sagging line)
      const strings = (arr, field, r, gap, colors, sagK) => {
        for (let i = 0; i < arr.length; i += 6) {
          const x1 = arr[i], y1 = arr[i + 1], z1 = arr[i + 2], x2 = arr[i + 3], y2 = arr[i + 4], z2 = arr[i + 5];
          if (!near((x1 + x2) / 2, (z1 + z2) / 2, r)) continue;
          const len = Math.hypot(x2 - x1, z2 - z1), k = Math.max(3, Math.floor(len / gap)), yaw = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2, sag = len * sagK;
          let px = x1, py = y1, pz = z1;
          for (let j = 0; j <= k; j++) {
            const t = j / k, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t, y = y1 + (y2 - y1) * t - Math.sin(Math.PI * t) * sag;
            if (j) lines.push(px, py, pz, x, y, z);
            px = x; py = y; pz = z;
            if (j < k && (colors !== PALETTE.laundry || (j * 7 + i) % 3 !== 0)) {
              const tm = (j + 0.5) / k, fx2 = x1 + (x2 - x1) * tm, fz2 = z1 + (z2 - z1) * tm, fy = y1 + (y2 - y1) * tm - Math.sin(Math.PI * tm) * sag;
              M4.compose(P.set(fx2, fy, fz2), Q.setFromAxisAngle(Y, yaw), S.set(1, 1, 1)); field.push(M4, C.set(colors[(j + (colors === PALETTE.laundry ? i : 0)) % colors.length]));
            }
          }
        }
      };
      strings(p.flags, this.flags, R.flags, 0.48, PALETTE.flags, 0.06);
      strings(p.laundry, this.cloth, R.small, 0.75, PALETTE.laundry, 0.05);
    }
    for (const f of fields) f.end();
    this.glow.mesh.visible = this.glow.n > 0 && night > 0.05;
    this.lines.geometry.dispose();
    this.lines.geometry = new THREE.BufferGeometry();
    this.lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  }
}
