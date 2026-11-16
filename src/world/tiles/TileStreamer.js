/**
 * Streams map tiles around a focus point. Tiles are built in Web Workers (tile.worker.js) and turned into
 * meshes here. Other systems subscribe through the callbacks to get each tile's props, landmarks, NPC paths.
 *
 *   const streamer = new TileStreamer({ scene, materials, physics, manifest, ... });
 *   await streamer.ensureAround(x, z);   // block until nearby tiles exist (spawning, teleports)
 *   streamer.update(dt, focus);          // every frame
 */
import * as THREE from 'three';
import { PALETTE, AREA_KINDS, AREA_STYLE, WORLD, MYTHIC } from '../../config/index.js';
import { spatialGeometry } from '../../render/spatialGeometry.js';
import { unlit } from '../../render/toon.js';

/** facade relief (sills, chajjas, awnings…) is only drawn for tiles whose centre is this close */
const RELIEF_LOD = MYTHIC.architecture.reliefRange;

const ATTRS = {
  walls: { position: 3, normal: 3, uv: 2, wall: 2, paint: 3, info: 4 },
  detail: { position: 3, normal: 3, color: 3, surface: 1 },
  relief: { position: 3, normal: 3, color: 3, surface: 1 },
  roads: { position: 3, normal: 3, color: 3, uv: 2, roadw: 3 },
  areas: { position: 3, normal: 3, kind: 1 },
  water: { position: 3, normal: 3 },
  ground: { position: 3, normal: 3, gnd: 2 },
};

export class TileStreamer {
  /** @param {{scene, materials, physics, manifest, hills, dem, quality, onLoad?, onUnload?}} o */
  constructor(o) {
    Object.assign(this, o);
    this.size = this.manifest.tileSize;
    this.tiles = new Map();          // key -> { key, tx, tz, state, group, data }
    this.pending = new Map();        // job id -> key
    this.queue = [];
    this.jobId = 0;
    this.radius = this.quality.streamRadius;
    this.depthMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4});
    this.wireMat = unlit({ color: '#2a2420' }, { key: 'wire' });
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    const densities = {};
    for (const [k, v] of Object.entries(this.manifest.tiles)) densities[k] = v[1];
    const ctx = {
      size: this.size, palette: PALETTE, areaKinds: AREA_KINDS, areaStyle: AREA_STYLE, hills: this.hills, dem: this.dem,
      cores: Object.values(this.manifest.cores), densities, quality: { treeDensity: this.quality.name === 'low' ? 0.7 : 1 },
    };
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./tile.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.#onMessage(e.data);
      w.postMessage({ type: 'init', ctx });
      w.busy = 0;
      return w;
    });
    this._t = 0;
    this.holds = [];                 // areas pinned by ensureAround() while it waits
  }

  /** keys of existing tiles within radius of (x, z), nearest first */
  #wanted(x, z, radius) {
    const s = this.size, r = Math.ceil(radius / s), cx = Math.floor(x / s), cz = Math.floor(z / s), out = [];
    for (let tz = cz - r; tz <= cz + r; tz++) for (let tx = cx - r; tx <= cx + r; tx++) {
      const key = `${tx}_${tz}`;
      if (!this.manifest.tiles[key]) continue;
      const d = Math.hypot((tx + 0.5) * s - x, (tz + 0.5) * s - z);
      if (d <= radius) out.push([d, key, tx, tz]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  }

  update(dt, focus, fogFar = 400) {
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.35;
    for (const [, key, tx, tz] of this.#wanted(focus.x, focus.z, this.radius)) if (!this.tiles.has(key)) this.#request(key, tx, tz);
    for (const t of this.tiles.values()) {
      const cx = (t.tx + 0.5) * this.size, cz = (t.tz + 0.5) * this.size;
      const d = Math.hypot(cx - focus.x, cz - focus.z);
      const held = this.holds.some((h) => Math.hypot(cx - h.x, cz - h.z) <= h.radius + this.size);
      if (d > this.radius + 180 && !held) this.#unload(t);
      else if (t.group) {
        t.group.visible = d < fogFar + this.size;
        for(const mesh of t.group.children)if(mesh.userData.bounds){
          const b=mesh.userData.bounds,dx=Math.max(b.min.x-focus.x,0,focus.x-b.max.x),dz=Math.max(b.min.z-focus.z,0,focus.z-b.max.z);
          const limit=mesh.userData.relief?Math.min(fogFar,RELIEF_LOD):fogFar;
          mesh.visible=dx*dx+dz*dz<limit*limit;
        }
      }
    }
    this.#pump();
  }

  /** Load everything within `radius` of (x, z) and resolve when done. */
  ensureAround(x, z, radius = 200, onProgress) {
    const want = this.#wanted(x, z, radius);
    for (const [, key, tx, tz] of want) if (!this.tiles.has(key)) this.#request(key, tx, tz, true);
    this.#pump();
    // Hold the area so the per-frame update (still centred on the old focus during a teleport) doesn't unload it.
    const hold = { x, z, radius };
    this.holds.push(hold);
    return new Promise((resolve) => {
      const check = () => {
        for (const [, key, tx, tz] of want) if (!this.tiles.has(key)) this.#request(key, tx, tz, true);
        const done = want.filter(([, k]) => /ready|failed/.test(this.tiles.get(k)?.state)).length;
        onProgress?.(want.length ? done / want.length : 1);
        if (done >= want.length) { this.holds.splice(this.holds.indexOf(hold), 1); resolve(); } else setTimeout(check, 60);
      };
      check();
    });
  }

  #request(key, tx, tz, urgent = false) {
    this.tiles.set(key, { key, tx, tz, state: 'queued', group: null, data: null });
    const job = { key, tx, tz };
    if (urgent) this.queue.unshift(job); else this.queue.push(job);
  }
  #pump() {
    for (const w of this.workers) {
      while (w.busy < 2 && this.queue.length) {
        const job = this.queue.shift();
        const t = this.tiles.get(job.key);
        if (!t || t.state !== 'queued') continue;
        t.state = 'loading';
        const id = ++this.jobId;
        this.pending.set(id, { key: job.key, worker: w });
        w.busy++;
        w.postMessage({ type: 'build', id, tx: job.tx, tz: job.tz, url: new URL(`${WORLD.mapUrl}tiles/${job.key}.json`, document.baseURI).href });
      }
    }
  }
  #onMessage(m) {
    const job = this.pending.get(m.id);
    if (!job) return;
    this.pending.delete(m.id); job.worker.busy--;
    const t = this.tiles.get(job.key);
    if (m.type === 'error') { console.warn('tile failed', job.key, m.error); if (t) t.state = 'failed'; this.#pump(); return; }
    if (!t || t.state !== 'loading') { this.#pump(); return; }   // unloaded while building
    this.#materialize(t, m.result);
    this.#pump();
  }

  #geometry(buf, spec) {
    if (!buf) return null;
    const g = new THREE.BufferGeometry();
    for (const k in spec) g.setAttribute(k, new THREE.BufferAttribute(buf[k], spec[k]));
    g.setIndex(new THREE.BufferAttribute(buf.index, 1));
    g.computeBoundingSphere();
    return g;
  }
  #materialize(t, r) {
    const M = this.materials, group = new THREE.Group();
    group.name = `tile ${t.key}`;
    const add = (name, mat, cast, order = 0) => {
      const g = this.#geometry(r[name], ATTRS[name]);
      if (!g) return;
      const parts=['detail','walls','relief'].includes(name)?spatialGeometry(g,MYTHIC.architecture.batchSize):[g];
      let first;
      for(const part of parts){
        const mesh=new THREE.Mesh(part,mat);mesh.name=name;
        mesh.castShadow=cast;mesh.receiveShadow=true;mesh.renderOrder=order<0?order+6:0;mesh.matrixAutoUpdate=false;
        if(!part.boundingBox)part.computeBoundingBox();mesh.userData.bounds=part.boundingBox;mesh.userData.relief=name==='relief';
        group.add(mesh);first??=mesh;
        if(name==='areas'||name==='roads'){
          const prepass=new THREE.Mesh(part,this.depthMaterial);prepass.name=name+' depth';prepass.renderOrder=-6;prepass.matrixAutoUpdate=false;prepass.userData.bounds=mesh.userData.bounds;group.add(prepass);
        }
      }
      return first;
    };
    const bs = this.quality.buildingShadows;
    add('ground', M.ground, false, -3);
    add('areas', M.areas, false, -2);
    add('water', M.water, false, -2);
    add('roads', M.roads, false, -1);
    add('walls', M.walls, bs);
    add('detail', M.detail, false);
    t.relief = add('relief', M.detail, false);   // facade depth: only shown near the pup (see update)
    if (r.wires.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(r.wires, 3)); g.computeBoundingSphere();
      const l = new THREE.LineSegments(g, this.wireMat); l.matrixAutoUpdate = false; group.add(l);
    }
    this.scene.add(group);
    const P = this.physics, owner = t.key;
    for (const s of r.solids) P.addSolid(owner, s.pts, s.h, s.base, s.roof ?? s.h);
    for (const p of r.platforms) P.addPlatform(owner, p.pts, p.h, p.base ?? -Infinity);
    for (const p of r.occluders || []) P.addOccluder(owner,p.pts,p.h,p.base);
    for (const [x, z, rad, h] of r.circles) P.addCircle(owner, x, z, rad, h);
    const boxes = (arr, hw, hd, height) => {
      for (let i = 0; i < arr.length; i += 4) P.addBox(owner, arr[i], arr[i + 2], hw, hd, arr[i + 3], arr[i + 1] + height, arr[i + 1]);
    };
    boxes(r.props.bikes, 0.27, 0.81, 1.02);
    // Bench seats, backs and legs arrive in r.solids with the worker's exact visible dimensions.
    for (let i = 0; i < r.props.plants.length; i += 4) P.addCircle(owner, r.props.plants[i], r.props.plants[i + 2], 0.22, r.props.plants[i + 1] + 0.38, r.props.plants[i + 1]);
    const tr = r.props.trees;
    for (let i = 0; i < tr.length; i += 5) if (tr[i + 3] !== 3) P.addCircle(owner, tr[i], tr[i + 2], 0.28 * tr[i + 4], tr[i + 1] + 4);
    t.group = group; t.data = r; t.state = 'ready';
    this.onLoad?.(t);
  }
  #unload(t) {
    if (t.group) {
      this.scene.remove(t.group);
      const disposed = new Set();
      t.group.traverse((o) => { if (o.geometry && !disposed.has(o.geometry)) { disposed.add(o.geometry); o.geometry.dispose(); } });
    }
    t.data?.minimap?.close?.();
    this.physics.removeOwner(t.key);
    if (t.state === 'ready') this.onUnload?.(t);
    this.tiles.delete(t.key);
  }
  /** iterate loaded tiles */
  *ready() { for (const t of this.tiles.values()) if (t.state === 'ready') yield t; }
}
