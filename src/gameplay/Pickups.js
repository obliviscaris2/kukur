/**
 * Things lying around to put in your bag: bones in parks, marigolds and bells at temples, coins, chappals and
 * balls in the streets. Placed deterministically per tile (config/gameplay.js PICKUPS); some are BURIED and only
 * show while sniffing (press E to dig). Drawn as glowing, bobbing emoji billboards in one draw call.
 *   pickups.drop(id, pos)        drops something (loot from smashed pots, gifts)
 *   pickups.scents(pos)          scent sources for the sniff view
 * Emits 'pickup' { id, pos } — App puts it in the bag.
 */
import * as THREE from 'three';
import { ITEMS, PICKUPS, SNIFF } from '../config/index.js';
import { rng, hash } from '../core/rng.js';
import { events } from '../core/events.js';

const IDS = Object.keys(ITEMS), CELL = 64, COLS = 8;
const GONE_KEY = 'kukur.pickups.v1', RESPAWN_MS = 15 * 60 * 1000;

function atlas() {
  const rows = Math.ceil(IDS.length / COLS), c = document.createElement('canvas'); c.width = COLS * CELL; c.height = rows * CELL;
  const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${CELL * 0.72}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  IDS.forEach((id, i) => g.fillText(ITEMS[id].icon, (i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2 + 3));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { tex: t, rows };
}

export class Pickups {
  constructor(scene, world) {
    this.world = world; this.byTile = new Map(); this.dropped = []; this.sniff = 0; this.t = 0;
    try { this.gone = new Map(Object.entries(JSON.parse(localStorage.getItem(GONE_KEY) || '{}'))); } catch { this.gone = new Map(); }
    const { tex, rows } = atlas(), N = 300;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.dat = new Float32Array(N * 3);   // icon index, alpha, hidden
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDat', new THREE.BufferAttribute(this.dat, 3).setUsage(THREE.DynamicDrawUsage));
    this.u = { uTex: { value: tex }, uT: { value: 0 }, uRows: { value: rows } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `uniform float uT; attribute vec3 aDat; varying vec3 vD;
        void main() { vD = aDat; vec3 p = position; p.y += 0.12 * sin(uT * 2.5 + position.x * 3.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 0.9 * 380.0 / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform float uRows, uT; varying vec3 vD;
        void main() {
          vec2 pc = gl_PointCoord; float r = length(pc - 0.5);
          vec2 cell = vec2(mod(vD.x, ${COLS}.0), floor(vD.x / ${COLS}.0));
          vec2 uv = vec2((cell.x + (pc.x - 0.5) * 1.45 + 0.5) / ${COLS}.0, 1.0 - (cell.y + (pc.y - 0.5) * 1.45 + 0.5) / uRows);
          vec4 icon = (abs(pc.x - 0.5) < 0.345 && abs(pc.y - 0.5) < 0.345) ? texture2D(uTex, uv) : vec4(0.0);
          // neon halo (gold for things in sight, cyan for buried ones) + a slowly turning four-point glint
          vec3 hue = mix(vec3(2.2, 1.35, 0.35), vec3(0.35, 1.9, 2.4), vD.z);
          float ang = atan(pc.y - 0.5, pc.x - 0.5) + uT * 0.8 + vD.x;
          float glint = pow(abs(cos(ang * 2.0)), 24.0) * smoothstep(0.5, 0.1, r) * (0.6 + 0.4 * sin(uT * 3.0 + vD.x * 2.0));
          float ring = smoothstep(0.03, 0.0, abs(r - 0.36 - 0.04 * sin(uT * 3.0 + vD.x)));
          vec3 halo = hue * (smoothstep(0.5, 0.0, r) * (0.5 + 0.25 * sin(uT * 4.0 + vD.x)) + glint + ring * 0.8);
          vec4 col = vec4(halo, clamp(smoothstep(0.5, 0.15, r) * 0.55 + glint + ring * 0.6, 0.0, 1.0));
          col = mix(col, vec4(icon.rgb, 1.0), icon.a);
          if (col.a * vD.y < 0.02) discard;
          gl_FragColor = vec4(col.rgb, col.a * vD.y);
        }`,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 7; scene.add(this.points);
    world.onTile((ev, tile) => { if (ev === 'load') this.#generate(tile); else this.byTile.delete(tile.key); });
  }

  #generate(tile) {
    const r = rng(hash(tile.tx, tile.tz, 91)), list = [], gz = this.world.gazetteer, s = this.world.manifest.tileSize;
    const x0 = tile.tx * s, z0 = tile.tz * s;
    const parks = gz.areas.filter((a) => (a.kind === 0 || a.kind === 11 || a.kind === 1) && a.box[2] > x0 && a.box[0] < x0 + s && a.box[3] > z0 && a.box[1] < z0 + s);
    const temples = (tile.data.landmarks || []).filter((l) => l[4] !== 'tower');
    const n = Math.round(PICKUPS.perTile * (0.5 + (tile.data.density ?? 0.4)) * (0.6 + r() * 0.8));
    for (let i = 0; i < n; i++) {
      let x, z, table = 'street';
      const roll = r();
      if (roll < 0.3 && temples.length) { const l = temples[Math.floor(r() * temples.length)], a = r() * 6.28, d = l[2] * 0.6 + 2 + r() * 4; x = l[0] + Math.cos(a) * d; z = l[1] + Math.sin(a) * d; table = 'temple'; }
      else if (roll < 0.6 && parks.length) { const p = parks[Math.floor(r() * parks.length)]; x = p.box[0] + r() * (p.box[2] - p.box[0]); z = p.box[1] + r() * (p.box[3] - p.box[1]); table = 'park'; }
      else { const nav = tile.data.navs[Math.floor(r() * tile.data.navs.length)]; if (!nav) continue; const k = Math.floor(r() * (nav.pts.length / 2)) * 2; x = nav.pts[k] + (r() - 0.5) * nav.w; z = nav.pts[k + 1] + (r() - 0.5) * nav.w; }
      if (x < x0 || x > x0 + s || z < z0 || z > z0 + s || !this.world.physics.isFree(x, z, 0.3)) continue;
      const opts = PICKUPS.table[table], id = opts[Math.floor(r() * opts.length)];
      list.push({ key: `${tile.key}:${i}`, id, x, z, y: this.world.heightAt(x, z), hidden: table === 'park' ? r() < 0.75 : r() < PICKUPS.hiddenShare });
    }
    this.byTile.set(tile.key, list);
  }
  #isGone(key) { const t = this.gone.get(key); return t && Date.now() - t < RESPAWN_MS; }
  #take(it) {
    if (it.key) { this.gone.set(it.key, Date.now()); try { localStorage.setItem(GONE_KEY, JSON.stringify(Object.fromEntries(this.gone))); } catch { /* ok */ } }
    else this.dropped.splice(this.dropped.indexOf(it), 1);
    this.fav = it.id;   // "your nose remembers": similar things smell stronger next time you sniff
    events.emit('pickup', { id: it.id, pos: new THREE.Vector3(it.x, it.y + 0.4, it.z), dug: it.hidden });
  }
  drop(id, pos) { this.dropped.push({ id, x: pos.x + (Math.random() - 0.5), z: pos.z + (Math.random() - 0.5), y: this.world.heightAt(pos.x, pos.z), hidden: false, age: 0 }); }

  /** Every pickup within r (visible or buried) — used by the roar to reveal treasure. */
  all(pos, r) { return [...this.#near(pos, r)].filter((it) => Math.hypot(it.x - pos.x, it.z - pos.z) < r); }

  /** Nearest pickup within r (for the E prompt). */
  nearest(pos, r = 1.6) {
    let best = null, bd = r;
    for (const it of this.#near(pos, r)) { const d = Math.hypot(it.x - pos.x, it.z - pos.z); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  *#near(pos, r) {
    for (const list of this.byTile.values()) for (const it of list) if (!this.#isGone(it.key) && Math.abs(it.x - pos.x) < r && Math.abs(it.z - pos.z) < r) yield it;
    for (const it of this.dropped) if (Math.abs(it.x - pos.x) < r && Math.abs(it.z - pos.z) < r) yield it;
  }
  /** E pressed: dig up a buried thing (or grab a visible one). */
  interact(pos) { const it = this.nearest(pos, 1.6); if (it) this.#take(it); return it; }
  /** Scent sources for the sniff view: buried things rise as cyan columns; the kind you picked up last smells strongest. */
  scents(pos) {
    const out = [], fav = this.fav;
    for (const it of this.#near(pos, SNIFF.radius)) out.push({ p: new THREE.Vector3(it.x, it.y, it.z), c: it.hidden ? new THREE.Color('#5ff4ff') : new THREE.Color('#ffd34d'), up: 0.2, column: it.hidden, fav: it.id === fav });
    return out;
  }

  update(dt, pup, sniff) {
    this.u.uT.value += dt; this.sniff = sniff;
    let n = 0;
    for (const it of this.#near(pup.pos, PICKUPS.buildRadius)) {
      const d = Math.hypot(it.x - pup.pos.x, it.z - pup.pos.z);
      if (!it.hidden && d < PICKUPS.pickRadius && pup.grounded) { this.#take(it); continue; }
      const alpha = it.hidden ? sniff * Math.max(0, 1 - d / SNIFF.radius) : 1;
      if (alpha < 0.02 || n >= 300) continue;
      this.pos[n * 3] = it.x; this.pos[n * 3 + 1] = it.y + (it.hidden ? 0.25 : 0.55); this.pos[n * 3 + 2] = it.z;
      this.dat[n * 3] = IDS.indexOf(it.id); this.dat[n * 3 + 1] = alpha; this.dat[n * 3 + 2] = it.hidden ? 1 : 0; n++;
    }
    for (const it of this.dropped) it.age = (it.age || 0) + dt;
    this.dropped = this.dropped.filter((it) => it.age < 180);
    const g = this.points.geometry; g.setDrawRange(0, n); g.attributes.position.needsUpdate = g.attributes.aDat.needsUpdate = true;
  }
}
