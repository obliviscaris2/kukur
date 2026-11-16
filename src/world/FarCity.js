/**
 * The whole valley seen from the air (intro flyover, high cameras): a painted ground map — town sprawl by density,
 * parks & forests, the Bagmati and other rivers, main roads — plus thousands of instanced building blocks in town
 * colours. Blocks inside the streamed radius collapse away (the real buildings are there), and the whole thing only
 * draws when the camera is high. Data: assets/map/manifest.json (tile counts/density) + overview.json.
 */
import * as THREE from 'three';
import { WORLD, PALETTE } from '../config/index.js';
import { loadJSON } from '../core/assets.js';
import { rng, hash } from '../core/rng.js';
import { toon } from '../render/toon.js';
import { footprintRange } from './terrain.js';
import { rect } from './physics.js';

const AREA = { 0: '#7cbf5a', 2: '#4f8f46', 3: '#a9c96a', 4: '#5aaee0', 7: '#7cc65e', 11: '#86c96a' };

export class FarCity {
  constructor(scene, world) { this.scene = scene; this.world = world; this.u = { uFocus: { value: new THREE.Vector2() }, uNear: { value: 400 } }; }

  async init() {
    const m = this.world.manifest, ov = await loadJSON(WORLD.mapUrl + 'overview.json'), TS = m.tileSize;
    const [x0, z0, x1, z1] = m.bounds, W = 2048, H = Math.round(W * (z1 - z0) / (x1 - x0)), sx = W / (x1 - x0), sz = H / (z1 - z0);
    // ---- painted ground map
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.fillStyle = '#9fbf6a'; c.fillRect(0, 0, W, H);
    for (const [k, [, dens]] of Object.entries(m.tiles)) {
      const [tx, tz] = k.split('_').map(Number);
      c.fillStyle = `rgba(${Math.round(222 - dens * 40)}, ${Math.round(196 - dens * 50)}, ${Math.round(160 - dens * 50)}, ${Math.min(1, 0.25 + dens * 1.6)})`;
      c.fillRect((tx * TS - x0) * sx, (tz * TS - z0) * sz, TS * sx + 1, TS * sz + 1);
    }
    const path = (flat) => { c.beginPath(); for (let i = 0; i < flat.length; i += 2) i ? c.lineTo((flat[i] - x0) * sx, (flat[i + 1] - z0) * sz) : c.moveTo((flat[i] - x0) * sx, (flat[i + 1] - z0) * sz); };
    for (const [k, flat] of ov.areas) if (AREA[k]) { path(flat); c.fillStyle = AREA[k]; c.fill(); }
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = '#4aa6dd'; c.lineWidth = 3.2; for (const r of ov.rivers) { path(r); c.stroke(); }
    for (const [k, flat] of ov.roads) { c.strokeStyle = k <= 2 ? '#c9c2b4' : '#d8cfbd'; c.lineWidth = k <= 1 ? 2.4 : 1.4; path(flat); c.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    // the painted map draped over the real valley (DEM): drawn first and without depth writes, so streamed tiles always win
    const pg = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 180, Math.round(180 * (z1 - z0) / (x1 - x0))).rotateX(-Math.PI / 2), pp = pg.attributes.position;
    const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2, T = (x, z) => this.world.terrain(x, z);
    for (let i = 0; i < pp.count; i++) pp.setY(i, T(pp.getX(i) + cxm, pp.getZ(i) + czm) - 0.5);
    pg.computeVertexNormals();
    const nx=pg.parameters.widthSegments,nz=Math.floor(pg.parameters.heightSegments);
    const paintedHeight=(x,z)=>{
      const fx=THREE.MathUtils.clamp((x-x0)/(x1-x0)*nx,0,nx-1e-6),fz=THREE.MathUtils.clamp((z-z0)/(z1-z0)*nz,0,nz-1e-6),ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz;
      const a=iz*(nx+1)+ix,h00=pp.getY(a),h10=pp.getY(a+1),h01=pp.getY(a+nx+1),h11=pp.getY(a+nx+2);
      return u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
    };
    this.ground = new THREE.Mesh(pg, toon('#ffffff', { key: 'farground', rim: 0, params: { map: tex, depthWrite: false } }));
    this.ground.position.set(cxm, 0, czm); this.ground.renderOrder = -10; this.ground.matrixAutoUpdate = false; this.ground.updateMatrix();
    this.scene.add(this.ground);
    // ---- building blocks
    const tiles = Object.entries(m.tiles).filter(([, [n]]) => n > 15);
    const per = (n) => Math.min(16, Math.ceil(n / 22));
    const total = tiles.reduce((s, [, [n]]) => s + per(n), 0);
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = toon('#ffffff', { key: 'farcity', rim: 0.3, uniforms: this.u, vertexHead: 'uniform vec2 uFocus; uniform float uNear;',
      vertexMain: 'vec2 fp = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xz; if (distance(fp, uFocus) < uNear) transformed *= 0.0;' });
    this.blocks = new THREE.InstancedMesh(geo, mat, total);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const [k, [n, dens]] of tiles) {
      const [tx, tz] = k.split('_').map(Number), r = rng(hash(tx, tz, 909));
      for (let j = 0; j < per(n); j++) {
        const w = 14 + r() * 26, d = 14 + r() * 26, h = 6 + dens * 14 + r() * 9;
        P.set(tx * TS + 12 + r() * (TS - 24), 0, tz * TS + 12 + r() * (TS - 24));
        const angle=r()*.5,top=T(P.x,P.z)-1+h;
        P.y=Math.min(T(P.x,P.z)-1,paintedHeight(P.x,P.z),footprintRange(rect(P.x,P.z,w/2,d/2,angle),(x,z)=>Math.min(T(x,z),paintedHeight(x,z))).low)-WORLD.foundations.embed;
        Q.setFromAxisAngle(Y,angle); S.set(w,top-P.y,d);
        this.blocks.setMatrixAt(i, M.compose(P, Q, S)); this.blocks.setColorAt(i, C.set(PALETTE.paints[Math.floor(r() * PALETTE.paints.length)]).lerp(new THREE.Color('#d8c8b0'), 0.35)); i++;
      }
    }
    this.blocks.count = i; this.blocks.frustumCulled = false; this.scene.add(this.blocks);
    this.ground.visible = this.blocks.visible = false;
  }

  /** Show only when the camera is high enough to see past the streamed city. */
  update(camera, focus, near) {
    if (!this.blocks) return;
    const high = camera.position.y - focus.y > 45;
    this.ground.visible = this.blocks.visible = high;
    this.u.uFocus.value.set(focus.x, focus.z); this.u.uNear.value = near;
  }
}
