/**
 * Tihar dressing for the streets, generated per map tile (deterministic) along the edges of real streets:
 *   diyos    clusters of little clay oil lamps on doorsteps and sills (flames only at night) — 2 draw calls
 *   rangoli  painted floor mandalas at doors; some are Laxmi's little red footprints walking into the house — 1 draw call
 * Only the ones within FESTIVAL.decor.drawRadius are drawn; `visible` turns the whole thing on/off by festival day.
 */
import * as THREE from 'three';
import { FESTIVAL, NATURE } from '../../config/index.js';
import { rng, hash } from '../../core/rng.js';
import { U } from '../../render/toon.js';
import { DiyoField } from './DiyoField.js';

const MAX_D = 1600, MAX_R = 220;

/** 2x2 atlas: three mandalas and a trail of Laxmi footprints. */
function rangoliAtlas() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const g = c.getContext('2d');
  const pal = [['#e63946', '#ffd23f', '#ffffff', '#2a9d4b', '#ff6fa8'], ['#ff9f1c', '#8d5cf6', '#ffffff', '#4cc9f0', '#e63946'], ['#ffcc29', '#d81b60', '#3a86ff', '#ffffff', '#2a9d4b']];
  pal.forEach((cols, k) => {
    const ox = (k % 2) * S + S / 2, oy = Math.floor(k / 2) * S + S / 2;
    g.save(); g.translate(ox, oy);
    for (let ring = 5; ring >= 1; ring--) {
      const R = ring * 23, petals = 6 + ring * 2;
      g.fillStyle = cols[ring % cols.length];
      for (let i = 0; i < petals; i++) { g.save(); g.rotate((i / petals) * Math.PI * 2); g.beginPath(); g.ellipse(0, -R * 0.62, R * 0.2, R * 0.42, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.fillStyle = cols[(ring + 2) % cols.length]; g.beginPath(); g.arc(0, 0, R * 0.42, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffffff'; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 118, Math.sin(a) * 118, 4, 0, Math.PI * 2); g.fill(); }
    g.restore();
  });
  // Laxmi's footprints: little red feet stepping "up" the tile (towards the door)
  g.save(); g.translate(S + S / 2, S + S / 2); g.fillStyle = '#d6182c';
  for (let i = 0; i < 4; i++) {
    const y = 96 - i * 64, x = i % 2 ? 22 : -22;
    g.beginPath(); g.ellipse(x, y, 13, 22, 0, 0, Math.PI * 2); g.fill();
    for (let t = 0; t < 5; t++) { g.beginPath(); g.arc(x - 10 + t * 5, y - 27 - Math.abs(t - 2) * -1.5, 3.2, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}

export class TiharDecor {
  constructor(scene, world) {
    this.world = world; this.byTile = new Map(); this.last = new THREE.Vector3(1e9, 0, 0); this.visible = false;
    this.diyos=new DiyoField(scene,MAX_D);this.cups=this.diyos.cups;this.flames=this.diyos.flames;
    // rangoli decals
    this.rangoli = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: rangoliAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }), MAX_R);
    const uv = new Float32Array(MAX_R * 2); this.rangoli.geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(uv, 2));
    this.rangoli.material.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = (vMapUv + aCell) * 0.5;');
    };
    this.rangoli.count = 0; this.rangoli.frustumCulled = false; this.rangoli.renderOrder = 2; scene.add(this.rangoli);
    world.onTile((ev, tile) => { if (ev === 'load') this.#generate(tile); else this.byTile.delete(tile.key); this.last.set(1e9, 0, 0); });
  }

  #generate(tile) {
    const D = FESTIVAL.decor, dens = tile.data.density ?? 0.4;
    if (dens < D.minDensity) return;
    const r = rng(hash(tile.tx, tile.tz, 1408)), navs = tile.data.navs.filter((n) => n.w >= 3 && n.pts.length >= 4), P = this.world.physics;
    if (!navs.length) return;
    const diyos = [], rangoli = [];
    // a point on the edge of a random street, facing into the street
    const edge = (out) => {
      const n = navs[(r() * navs.length) | 0], k = ((r() * (n.pts.length / 2 - 1)) | 0) * 2, ax = n.pts[k], az = n.pts[k + 1], bx = n.pts[k + 2], bz = n.pts[k + 3];
      const L = Math.hypot(bx - ax, bz - az) || 1, t = r(), side = r() < 0.5 ? 1 : -1, nx = -(bz - az) / L * side, nz = (bx - ax) / L * side, off = n.w / 2 + out;
      return { x: ax + (bx - ax) * t + nx * off, z: az + (bz - az) * t + nz * off, nx, nz, ux: (bx - ax) / L, uz: (bz - az) / L };
    };
    for (let c = 0; c < D.diyoClusters * (0.5 + dens); c++) {
      const e = edge(0.35 + r() * 0.5); if (!P.isFree(e.x, e.z, 0.2)) continue;
      const m = D.diyoPerCluster[0] + ((r() * (D.diyoPerCluster[1] - D.diyoPerCluster[0] + 1)) | 0);
      for (let i = 0; i < m; i++) { const s = (i - (m - 1) / 2) * 0.24, x = e.x + e.ux * s, z = e.z + e.uz * s; if (P.isFree(x, z, 0.08)) diyos.push(x, this.world.heightAt(x, z), z); }
    }
    for (let c = 0; c < D.rangoli * (0.5 + dens); c++) {
      const e = edge(0.9 + r() * 0.6); if (!P.isFree(e.x, e.z, 0.7)) continue;
      const feet = r() < 0.3;
      rangoli.push({ x: e.x, y: this.world.heightAt(e.x, e.z), z: e.z, s: feet ? 0.9 : 0.8 + r() * 0.6, rot: feet ? Math.atan2(-e.nx, -e.nz) : r() * 6.28, cell: feet ? 3 : (r() * 3) | 0 });
    }
    this.byTile.set(tile.key, { diyos, rangoli });
  }

  update(focus) {
    this.diyos.update(U.uNight.value,this.visible);this.rangoli.visible=this.visible&&this.rangoli.count>0;
    if (!this.visible || focus.distanceToSquared(this.last) < 16) return;
    this.last.copy(focus);
    const R2 = FESTIVAL.decor.drawRadius ** 2, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3();
    let d = 0, k = 0;this.diyos.begin();
    const cell = this.rangoli.geometry.attributes.aCell;
    for (const { diyos, rangoli } of this.byTile.values()) {
      for (let i = 0; i < diyos.length && d < MAX_D; i += 3) {
        const x = diyos[i], y = diyos[i + 1], z = diyos[i + 2];
        if ((x - focus.x) ** 2 + (z - focus.z) ** 2 > R2) continue;
        this.diyos.push(x,y,z,0,(x-focus.x)**2+(z-focus.z)**2<NATURE.diyo.bodyRadius**2);d++;
      }
      for (const g of rangoli) {
        if (k >= MAX_R || (g.x - focus.x) ** 2 + (g.z - focus.z) ** 2 > R2) continue;
        this.rangoli.setMatrixAt(k, M.compose(V.set(g.x, g.y + 0.03, g.z), Q.setFromAxisAngle(Y, g.rot), S.set(g.s, 1, g.s)));
        cell.setXY(k, g.cell % 2, 1 - Math.floor(g.cell / 2)); k++;
      }
    }
    this.diyos.end();this.diyos.update(U.uNight.value,this.visible);
    this.rangoli.count = k; this.rangoli.instanceMatrix.needsUpdate = true; cell.needsUpdate = true;
    if (!d) this.cups.visible = this.flames.visible = false;
    if (!k) this.rangoli.visible = false;
  }
}
