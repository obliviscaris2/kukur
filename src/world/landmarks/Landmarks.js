/**
 * Temples, stupas and towers. Placed per map tile (from the tile's landmark list) on their real OSM footprint,
 * recoloured with the toon palette, with climbable plinth steps (see assets/models/temples/meta.json).
 * To add a model: build it in pipeline/blender/temples.py, then map OSM names to it in pipeline/osm/build_tiles.py.
 */
import * as THREE from 'three';
import { toon } from '../../render/toon.js';
import { loadGLB, loadJSON } from '../../core/assets.js';
import { registerLandmark } from './landmarkCollision.js';
import { rect } from '../physics.js';
import { WORLD, LANDMARKS, NATURE } from '../../config/index.js';
import { footprintEdge, footprintRange } from '../terrain.js';

const COLORS = NATURE.temples;

export class Landmarks {
  constructor(scene, physics) {
    this.scene = scene; this.physics = physics; this.byTile = new Map(); this.scent = [];
    this.mats = {};
    for (const k in COLORS) this.mats[k] = toon(COLORS[k], { rim: k === 'Gold' ? 0.8 : 0.35, key: 'lm' + k, surface: /Wood|Dark/.test(k)?'wood':(k==='Brick'||k==='Roof')?'brick':/Stone|Plaster/.test(k)?'stone':null, params: k === 'Gold' ? { specular:new THREE.Color('#bd9a57'),shininess:48,emissive: new THREE.Color('#191104') } : k === 'Flame' ? { emissive: new THREE.Color('#ff9a2e'), emissiveIntensity: 1.6 } : k.startsWith('Flag') ? { side: THREE.DoubleSide } : {} });
  }
  async init() { this.meta = await loadJSON('assets/models/temples/meta.json'); }

  async #model(name) {
    const g = await loadGLB(`assets/models/temples/${name}.glb`);
    if (!g.__toon) { g.scene.traverse((o) => { if (o.isMesh) { o.material = this.mats[o.material.name] || this.mats.Brick; o.castShadow = o.receiveShadow = true; } }); g.__toon = true; }
    return g.scene;
  }

  async addTile(key, list) {
    const placed = [];
    const footings = [];
    this.byTile.set(key, placed);
    for (const [x, z, size, ang, model, name] of list) {
      if (model === 'tower') { placed.push(this.#tower(key, x, z, name, footings)); continue; }
      const meta = this.meta[model];
      if (!meta) continue;
      const src = await this.#model(model);
      if (this.byTile.get(key) !== placed) return;        // tile unloaded while loading
      const y = this.physics.terrain(x, z);
      const o = src.clone();
      o.position.set(x, y, z); o.rotation.y = -ang; o.scale.setScalar(size); o.name = name || model;
      o.updateMatrixWorld(true); o.traverse((c) => { c.matrixAutoUpdate = false; });
      this.scene.add(o);
      const owner = key + '/lm';
      const bounds = new THREE.Box3().setFromObject(o), peak = bounds.max.y;
      const { top, footprint } = registerLandmark(this.physics, owner, { x, z, size, ang, y, model, meta, peak });
      this.#footing(footings, footprint, y);
      this.#roofCollision(o, owner, x, z, size, ang, y, meta, model);
      const scent = new THREE.Vector3(x, top + 0.3, z);
      this.scent.push(scent);
      placed.push({ object: o, scent, name, model, x, z, size, bounds });
    }
    // All temple foundations in this tile share one draw call and one material.
    if (footings.length && this.byTile.get(key) === placed) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(footings, 3)); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.mats.Stone); mesh.receiveShadow = true; this.scene.add(mesh);
      geo.computeBoundingBox();
      placed.push({ object: mesh, foundation: true, bounds: geo.boundingBox });
    }
  }

  #footing(vertices, pts, top) {
    for (let i = 0; i < pts.length; i++) {
      const samples = footprintEdge(pts[i],pts[(i+1)%pts.length],this.physics.terrain);
      for (let j = 0; j < samples.length-1; j++) {
        const p = samples[j], q = samples[j+1];
        const py = Math.min(top, p[1] - WORLD.foundations.embed), qy = Math.min(top, q[1] - WORLD.foundations.embed);
        if (Math.min(py,qy) >= top - WORLD.foundations.embed - 0.005) continue;
        vertices.push(q[0],qy,q[2], p[0],py,p[2], p[0],top,p[2], q[0],qy,q[2], p[0],top,p[2], q[0],top,q[2]);
      }
    }
  }

  /** Small local roof slices cover actual eaves and spires without raycasting thousands of render triangles every frame. */
  #roofCollision(object, owner, x, z, size, ang, y, meta, model) {
    const inverse = object.matrixWorld.clone().invert(), triangles = [];
    const coreHeight = LANDMARKS.shapes[model]?.core_h ?? meta.core_h;
    const floor = meta.steps * meta.step_h + (meta.round ? 0.1 : model === 'kasthamandap' ? 0.22 : model === 'bell' ? 0.77 : coreHeight - 0.02);
    const opaque = new Set(['Roof','Gold','Wood','Brick','Stone','Plaster','Dark','WoodRed'].map(k=>this.mats[k]));
    let min = Infinity, max = -Infinity;
    object.traverse(mesh => {
      if (!mesh.isMesh || !opaque.has(mesh.material)) return;
      const transform = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld), positions = mesh.geometry.attributes.position, index = mesh.geometry.index;
      for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
        const points = [0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(transform));
        const low = Math.max(Math.min(...points.map(p=>p.y)),mesh.material===this.mats.Roof?-Infinity:floor), high = Math.max(...points.map(p=>p.y));
        if (high < low) continue;
        min = Math.min(min,low); max = Math.max(max,high); triangles.push({points,low,high});
      }
    });
    if (!triangles.length || max-min<1e-6) return;
    const count = LANDMARKS.roofSlices, step = (max-min)/count, bands = Array.from({length:count},()=>({half:0,low:Infinity,high:-Infinity}));
    for (const triangle of triangles) {
      const first = Math.max(0,Math.floor((triangle.low-min)/step)), last = Math.min(count-1,Math.floor((triangle.high-min)/step));
      for (let i=first; i<=last; i++) {
        const low = Math.max(triangle.low,min+i*step), high = Math.min(triangle.high,min+(i+1)*step), band = bands[i];
        band.low = Math.min(band.low,low); band.high = Math.max(band.high,high);
        const extend = p => { band.half = Math.max(band.half,Math.abs(p.x),Math.abs(p.z)); };
        for (let j=0; j<3; j++) {
          const a=triangle.points[j], b=triangle.points[(j+1)%3];
          if(a.y>=low&&a.y<=high)extend(a);
          if(Math.abs(b.y-a.y)<1e-9)continue;
          for(const y0 of [low,high]) {const t=(y0-a.y)/(b.y-a.y);if(t>=0&&t<=1)extend(a.clone().lerp(b,t));}
        }
      }
    }
    for (const band of bands) if(band.half>0) this.physics.addOccluder(owner,rect(x,z,band.half*size,band.half*size,-ang),y+band.high*size,y+band.low*size);
  }

  /** A landmark model as a standalone object (used by the far-away beacons): GLB clone scaled to `size` metres, or the tower. */
  async createModel(model, size) {
    if (model === 'tower') return this.#towerModel();
    const o = (await this.#model(model)).clone(); o.scale.setScalar(size); return o;
  }

  #towerModel() { // Dharahara: a slim white tower with a golden dome
    const g = new THREE.Group();
    this.mats.Plaster ??= toon('#fbf6ec', { rim: 0.4, key: 'tower' });
    const add = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; g.add(o); };
    add(new THREE.CylinderGeometry(3.2, 5.0, 56, 16), this.mats.Plaster, 28);
    for (const y of [20, 38, 52]) add(new THREE.CylinderGeometry(4.4 - y / 40, 4.6 - y / 40, 1.2, 16), this.mats.Plaster, y);
    add(new THREE.SphereGeometry(3.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.Gold, 56);
    add(new THREE.ConeGeometry(0.8, 9, 10), this.mats.Gold, 64);
    return g;
  }

  #tower(key, x, z, name, footings) {
    const g = this.#towerModel();
    g.position.set(x, this.physics.terrain(x, z), z); this.scene.add(g);
    const pts = Array.from({length:16},(_,i)=>[x+Math.sin(i/16*Math.PI*2)*5,z+Math.cos(i/16*Math.PI*2)*5]).reverse();
    this.#footing(footings,pts,g.position.y);
    this.physics.addCircle(key + '/lm', x, z, 5.2, g.position.y + 69, Math.min(g.position.y,footprintRange(pts,this.physics.terrain).low)-WORLD.foundations.embed);
    return { object: g, scent: null, name, x, z, size: 10, bounds: new THREE.Box3().setFromObject(g) };
  }

  /** Streamed temples outside the visible haze stay collidable without drawing invisible detail. */
  update(_dt, camera, fogFar) {
    // Fog uses camera depth, so include the diagonal frustum corner when converting to distance.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
    const range = fogFar * Math.sqrt(1 + tan * tan * (1 + camera.aspect * camera.aspect)) + 12;
    const x = camera.position.x, z = camera.position.z;
    for (const list of this.byTile.values()) for (const p of list) {
      const b = p.bounds;
      const dx = Math.max(b.min.x - x, 0, x - b.max.x), dz = Math.max(b.min.z - z, 0, z - b.max.z);
      p.object.visible = dx * dx + dz * dz < range * range;
    }
  }

  removeTile(key) {
    const placed = this.byTile.get(key);
    if (!placed) return;
    for (const p of placed) { this.scene.remove(p.object); if (p.foundation) p.object.geometry.dispose(); if (p.scent) this.scent.splice(this.scent.indexOf(p.scent), 1); }
    this.physics.removeOwner(key + '/lm');
    this.byTile.delete(key);
  }
  *all() { for (const list of this.byTile.values()) for (const p of list) if (!p.foundation) yield p; }
}
