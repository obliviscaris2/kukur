/**
 * Wooden signposts at main junctions (positions + road arms come from the map pipeline, tile field `s`).
 * Each arm gets a carved board pointing down that road, naming the famous places that lie that way
 * (config/places.js DESTINATIONS) with distances, in English and Nepali — like Skyrim's road signs.
 * Signs are only built near the pup; each costs two draw calls (post + one texture atlas for all boards).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WAYFINDING } from '../../config/index.js';
import { angDiff } from '../../core/geo.js';
import { toon } from '../../render/toon.js';

const ROW = 128, TEX_W = 512, BOARD_LEN = 1.7, LINE_H = 0.24, POST_H = 2.9;
const km = (m) => (m < 950 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`);

function postGeometry() {
  const parts = [];
  const col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const strip = (g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };
  parts.push(col(strip(new THREE.CylinderGeometry(0.07, 0.09, POST_H, 7).translate(0, POST_H / 2, 0)), '#6b4226'));
  parts.push(col(strip(new THREE.ConeGeometry(0.34, 0.32, 4).rotateY(Math.PI / 4).translate(0, POST_H + 0.12, 0)), '#a8432f'));   // little pagoda roof
  parts.push(col(strip(new THREE.ConeGeometry(0.05, 0.22, 6).translate(0, POST_H + 0.38, 0)), '#ffc23d'));                     // gilded finial
  parts.push(col(strip(new THREE.TorusGeometry(0.11, 0.035, 5, 10).rotateX(Math.PI / 2).translate(0, POST_H - 0.25, 0)), '#ff9f1c')); // marigold garland
  parts.push(col(strip(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 7).translate(0, 0.09, 0)), '#8a7a6a'));                    // stone foot
  return mergeGeometries(parts);
}

function drawBoard(c, y, lines, road, pointRight) {
  const h = ROW - 8, w = TEX_W - 8, tip = 46;
  c.save(); c.translate(4, y + 4);
  c.beginPath();
  if (pointRight) { c.moveTo(0, 8); c.lineTo(w - tip, 0); c.lineTo(w, h / 2); c.lineTo(w - tip, h); c.lineTo(0, h - 8); }
  else { c.moveTo(w, 8); c.lineTo(tip, 0); c.lineTo(0, h / 2); c.lineTo(tip, h); c.lineTo(w, h - 8); }
  c.closePath();
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#8a5530'); g.addColorStop(1, '#5e3519');
  c.fillStyle = g; c.fill(); c.lineWidth = 6; c.strokeStyle = '#f2c35b'; c.stroke();
  c.strokeStyle = 'rgba(40,20,8,0.35)'; c.lineWidth = 2;   // wood grain
  for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(pointRight ? 8 : tip, (h * i) / 5); c.bezierCurveTo(w * 0.3, (h * i) / 5 + 4, w * 0.6, (h * i) / 5 - 4, pointRight ? w - tip : w - 8, (h * i) / 5); c.stroke(); }
  const x0 = pointRight ? 18 : tip + 12, x1 = pointRight ? w - tip - 8 : w - 18;
  c.textBaseline = 'middle'; c.fillStyle = '#fff3dc';
  const n = lines.length, lh = (h - (road ? 26 : 8)) / Math.max(1, n);
  lines.forEach((ln, i) => {
    const cy = 6 + lh * (i + 0.5);
    c.font = `700 ${n > 1 ? 30 : 38}px Cinzel, Georgia, serif`; c.textAlign = 'left'; c.fillText(ln.name, x0, cy);
    const nw = c.measureText(ln.name).width;
    c.font = `${n > 1 ? 22 : 28}px "Tiro Devanagari Hindi", Mukta, serif`; c.fillStyle = '#f2c35b'; if (ln.ne && nw < (x1 - x0) * 0.62) c.fillText(ln.ne, x0 + nw + 10, cy + 2);
    c.font = `600 ${n > 1 ? 22 : 26}px "Baloo 2", sans-serif`; c.fillStyle = '#ffe2a3'; c.textAlign = 'right'; c.fillText(ln.dist, x1, cy);
    c.fillStyle = '#fff3dc';
  });
  if (road) { c.font = 'italic 600 20px "Baloo 2", sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,233,184,0.85)'; c.fillText(road, w / 2 + (pointRight ? -tip / 2 : tip / 2), h - 14); }
  c.restore();
}

export class Signposts {
  constructor(scene, physics, gazetteer) {
    this.scene = scene; this.physics = physics; this.gz = gazetteer;
    this.byTile = new Map(); this.built = new Map(); this._t = 0;
    this.postGeo = postGeometry();
    this.postMat = toon('#ffffff', { key: 'signpost', params: { vertexColors: true }, rim: 0.3 });
  }
  addTile(key, signs) { if (signs?.length) this.byTile.set(key, signs); }
  removeTile(key) {
    const signs = this.byTile.get(key); if (!signs) return;
    for (const s of signs) this.#destroy(s);
    this.byTile.delete(key);
  }

  /** Destinations for each road arm: the famous places that lie roughly that way. */
  #arms(sign) {
    const [x, z, arms] = sign, S = WAYFINDING.signpost;
    const out = arms.map(([ang, road]) => ({ ang, road, lines: [] }));
    const cand = [];
    for (const d of this.gz.destinations) {
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist < S.minDist || dist > S.maxDist) continue;
      const b = Math.atan2(d.x - x, d.z - z);
      let best = null, bd = S.arc;
      for (const a of out) { const diff = Math.abs(angDiff(a.ang, b)); if (diff < bd) { bd = diff; best = a; } }
      if (best) cand.push({ arm: best, d, dist, score: dist * (1 + bd * 2) });
    }
    cand.sort((a, b) => a.score - b.score);
    for (const c of cand) if (c.arm.lines.length < S.perArm) c.arm.lines.push({ name: c.d.name, ne: c.d.ne, dist: km(c.dist) });
    return out.filter((a) => a.lines.length || a.road);
  }

  #build(sign) {
    const [x, z] = sign, y = this.physics.heightAt(x, z);
    const arms = this.#arms(sign);
    const g = new THREE.Group(); g.position.set(x, y, z);
    const post = new THREE.Mesh(this.postGeo, this.postMat); post.castShadow = true; g.add(post);
    if (arms.length) {
      const canvas = document.createElement('canvas'); canvas.width = TEX_W; canvas.height = ROW * arms.length * 2;
      const c = canvas.getContext('2d');
      const pos = [], uv = [], idx = [];
      arms.forEach((a, i) => {
        const lines = a.lines.length ? a.lines : [{ name: a.road, ne: '', dist: '' }];
        const road = a.lines.length ? a.road : '';
        drawBoard(c, ROW * (i * 2), lines, road, true);        // row k=0: tip on the right (seen from the -normal side)
        drawBoard(c, ROW * (i * 2 + 1), lines, road, false);   // row k=1: tip on the left  (seen from the +normal side)
        const h = 0.22 + LINE_H * Math.max(1, lines.length) * 0.75, yb = POST_H - 0.55 - i * 0.48;
        const dx = Math.sin(a.ang), dz = Math.cos(a.ang), nx = dz, nz = -dx;      // board normal (perpendicular to the arm)
        const v = (along, up, side) => [along * dx + side * nx * 0.012, yb + up, along * dz + side * nz * 0.012];
        const vMin = (k) => 1 - (ROW * (i * 2 + k + 1)) / canvas.height, vMax = (k) => 1 - (ROW * (i * 2 + k)) / canvas.height;
        for (const [side, k] of [[1, 1], [-1, 0]]) {
          const base = pos.length / 3;
          // quad from the post (along=0.05) to the tip (along=BOARD_LEN)
          const quad = [v(0.05, -h / 2, side), v(BOARD_LEN, -h / 2, side), v(BOARD_LEN, h / 2, side), v(0.05, h / 2, side)];
          for (const p of quad) pos.push(...p);
          // from the +normal side the arm runs to the viewer's left (tip = u 0); from the -normal side to the right (tip = u 1)
          if (side === 1) uv.push(1, vMin(k), 0, vMin(k), 0, vMax(k), 1, vMax(k)); else uv.push(0, vMin(k), 1, vMin(k), 1, vMax(k), 0, vMax(k));
          if (side === 1) idx.push(base, base + 2, base + 1, base, base + 3, base + 2); else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      geo.computeVertexNormals();
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = toon('#ffffff', { key: 'signboard', rim: 0.2, params: { map: tex, alphaTest: 0.5 } });
      const boards = new THREE.Mesh(geo, mat); boards.castShadow = true; g.add(boards);
      g.userData.dispose = () => { geo.dispose(); tex.dispose(); mat.dispose(); };
    }
    g.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    g.updateMatrixWorld(true);
    this.scene.add(g);
    this.physics.addCircle('sign:' + x + ',' + z, x, z, 0.14, y + POST_H);
    this.built.set(sign, g);
  }
  #destroy(sign) {
    const g = this.built.get(sign); if (!g) return;
    this.scene.remove(g); g.userData.dispose?.();
    this.physics.removeOwner('sign:' + sign[0] + ',' + sign[1]);
    this.built.delete(sign);
  }

  update(dt, focus) {
    if ((this._t -= dt) > 0) return;
    this._t = 0.5;
    const R = WAYFINDING.signpost.buildRadius;
    for (const signs of this.byTile.values()) for (const s of signs) {
      const d = Math.hypot(s[0] - focus.x, s[1] - focus.z);
      if (d < R && !this.built.has(s)) this.#build(s);
      else if (d > R + 40 && this.built.has(s)) this.#destroy(s);
    }
  }
}
