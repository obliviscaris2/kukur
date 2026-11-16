/**
 * The valley map (M): streets with names, toles, parks and ponds, temples, famous destinations and the pup.
 *   drag = pan · wheel = zoom · click = set waypoint (snaps to a nearby named place) · right-click = clear it
 *   📍 Pin mode: clicks drop your own pins (saved in the browser, shown on the compass and in the world)
 *   Search: type a tole, street, temple or park name and pick a result to jump there
 * Data: assets/map/overview.json (rivers, big areas) + the World's Gazetteer (streets, names, landmarks).
 */
import { loadJSON } from '../core/assets.js';
import { WORLD } from '../config/index.js';
import { el, show } from './dom.js';
import { drawIcon, iconForModel } from './icons.js';

const AREA_COLORS = ['#a9d98a', '#bfe39a', '#6fae62', '#dbe7a0', '#8fcbe8', '#eadbbf', '#e3cfa6', '#93d07f', '#b3d09a', '#cfdc9a', '#d3d0c8', '#b3e29a', '#b6d98a', '#9fd3bf'];
const STREET_W = [5, 4, 3.2, 2.4, 1.4];
const STREET_C = ['#e9784e', '#f19a5c', '#f6c06e', '#fff6e2', '#fffaf0'];

export class BigMap {
  constructor(root, { onTravel, onWaypoint }) {
    this.root = root; this.onTravel = onTravel; this.onWaypoint = onWaypoint;
    this.canvas = el('canvas', {});
    this.dests = el('div.travel'); this.list = el('div.travel');
    this.info = el('div.map-info', {}, 'Click the map to set a waypoint');
    this.search = el('input.map-search', { type: 'search', placeholder: '🔎 Find a place… (Asan, Kanti Path, Boudha)', autocomplete: 'off' });
    this.results = el('div.map-results');
    this.pinBtn = el('button.pin-btn', { onclick: () => { this.pinMode = !this.pinMode; this.pinBtn.classList.toggle('on', this.pinMode); this.info.textContent = this.pinMode ? '📍 Click to drop a pin (right-click a pin to remove it)' : 'Click the map to set a waypoint'; } }, '📍 Pin');
    this.pinList = el('div.travel');
    root.append(el('div.bigmap-card', {},
      el('div.map-head', {}, el('h2', {}, 'Kathmandu Valley'), el('span.map-ne', {}, 'काठमाडौं उपत्यका'), el('div.map-find', {}, this.search, this.results), this.pinBtn, this.info),
      el('div.map-wrap', {}, this.canvas),
      el('div.map-foot', {}, el('div.travel-title', {}, 'My pins'), this.pinList, el('div.travel-title', {}, 'Mark a place'), this.dests, el('div.travel-title', {}, 'Travel to'), this.list,
        el('p.small', {}, 'Drag to pan · wheel to zoom · click to set a waypoint · right-click clears it · M / Esc closes · © OpenStreetMap contributors'))));
    this.view = { x: 0, z: 0, s: 0.12 };
    this.#wire();
    this.search.addEventListener('input', () => this.#find());
    this.search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.results.firstChild?.click(); if (e.key === 'Escape') { this.search.value = ''; this.#find(); } });
  }
  get open() { return !this.root.classList.contains('hidden'); }

  /** @param {boolean} on @param {{pup, starts, gazetteer, waypoint}} ctx */
  async toggle(on, ctx) {
    const want = on ?? !this.open;
    show(this.root, want);
    if (!want) return;
    this.ctx = ctx || this.ctx;
    this.data ??= await loadJSON(WORLD.mapUrl + 'overview.json');
    const r = this.canvas.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr; this.dpr = dpr;
    this.view.x = this.ctx.pup.pos.x; this.view.z = this.ctx.pup.pos.z; this.view.s = 0.14;
    this.#lists();
    this.draw();
  }

  #wire() {
    const cv = this.canvas;
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vz: this.view.z, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      this.view.x = drag.vx - (dx * this.dpr) / this.view.s; this.view.z = drag.vz - (dy * this.dpr) / this.view.s;
      this.#queue();
    });
    cv.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved && e.button === 0) this.#click(e);
      drag = null;
    });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const [x, z] = this.#toWorld(e), pins = this.ctx.pins, r = 14 * this.dpr / this.view.s;
      const i = pins.findIndex((p) => Math.hypot(p.x - x, p.z - z) < r);
      if (i >= 0) { pins.splice(i, 1); this.ctx.onPins(pins); this.#lists(); this.info.textContent = 'Pin removed'; }
      else { this.onWaypoint(null); this.ctx.waypoint = null; this.info.textContent = 'Waypoint cleared'; }
      this.draw();
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [wx, wz] = this.#toWorld(e);
      const k = Math.exp(-e.deltaY * 0.0015);
      this.view.s = Math.min(3, Math.max(0.03, this.view.s * k));
      const [nx, nz] = this.#toWorld(e);
      this.view.x += wx - nx; this.view.z += wz - nz;
      this.#queue();
    }, { passive: false });
  }
  #queue() { if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); }); }
  #toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * this.dpr, py = (e.clientY - r.top) * this.dpr;
    return [this.view.x + (px - this.canvas.width / 2) / this.view.s, this.view.z + (py - this.canvas.height / 2) / this.view.s];
  }
  #click(e) {
    const [x, z] = this.#toWorld(e), gz = this.ctx.gazetteer, snap = 14 * this.dpr / this.view.s;
    if (this.pinMode) {
      const p = gz.describe(x, z), pin = { x, z, name: p.street ? `${p.street}, ${p.title}` : p.title };
      this.ctx.pins.push(pin); this.ctx.onPins(this.ctx.pins); this.#lists(); this.info.textContent = `📍 Pinned: ${pin.name}`; this.draw();
      return;
    }
    let best = null, bd = snap;
    for (const d of gz.destinations) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = { x: d.x, z: d.z, name: d.name }; } }
    if (!best) for (const l of gz.landmarks) { const dd = Math.hypot(l.x - x, l.z - z); if (dd < bd) { bd = dd; best = { x: l.x, z: l.z, name: l.name }; } }
    if (!best) { const p = gz.describe(x, z); best = { x, z, name: p.street || p.title }; }
    this.setWaypoint(best);
  }
  setWaypoint(wp) { this.ctx.waypoint = wp; this.onWaypoint(wp); this.info.textContent = `🐾 Waypoint: ${wp.name}`; this.draw(); }

  /** Search names: destinations, landmarks, parks/squares/ponds, toles, streets. */
  #find() {
    const q = this.search.value.trim().toLowerCase(), gz = this.ctx.gazetteer;
    this.results.innerHTML = '';
    if (q.length < 2) return;
    if (!this.index) {
      const mid = (flat) => { let best = 0, bl = -1; for (let i = 2; i < flat.length; i += 2) { const L = Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1]); if (L > bl) { bl = L; best = i; } } return [(flat[best] + flat[best - 2]) / 2, (flat[best + 1] + flat[best - 1]) / 2]; };
      const cen = (flat) => { let x = 0, z = 0; for (let i = 0; i < flat.length; i += 2) { x += flat[i]; z += flat[i + 1]; } return [(x * 2) / flat.length, (z * 2) / flat.length]; };
      this.index = [
        ...gz.destinations.map((d) => ({ name: d.name, ne: d.ne, x: d.x, z: d.z, kind: '★', rank: 0 })),
        ...gz.landmarks.map((l) => ({ name: l.name, x: l.x, z: l.z, kind: '🛕', rank: 1 })),
        ...gz.areas.map((a) => { const [x, z] = cen(a.poly); return { name: a.name, ne: a.ne, x, z, kind: '🌳', rank: 2 }; }),
        ...gz.toles.map((t) => ({ name: t.name, ne: t.ne, x: t.x, z: t.z, kind: '🏘', rank: 3 })),
        ...gz.streets.map((s) => { const best = s.parts.reduce((a, b) => (b.length > a.length ? b : a)); const [x, z] = mid(best); return { name: s.name, ne: s.ne, x, z, kind: '🛣', rank: 4 }; }),
      ];
    }
    const hits = this.index.filter((e) => e.name.toLowerCase().includes(q) || (e.ne && e.ne.includes(q)))
      .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.rank - b.rank || a.name.length - b.name.length).slice(0, 8);
    for (const h of hits) this.results.append(el('button', { onclick: () => { this.view.x = h.x; this.view.z = h.z; this.view.s = Math.max(this.view.s, 0.6); this.setWaypoint({ x: h.x, z: h.z, name: h.name }); this.results.innerHTML = ''; this.search.value = h.name; } }, `${h.kind} ${h.name}`));
    if (!hits.length) this.results.append(el('div.none', {}, 'No match'));
  }

  #lists() {
    this.pinList.innerHTML = '';
    if (!this.ctx.pins.length) this.pinList.append(el('span.small', {}, 'Use 📍 Pin to mark places you want to find again'));
    this.ctx.pins.forEach((p, i) => this.pinList.append(el('span.pin-chip', {},
      el('button', { onclick: () => { this.view.x = p.x; this.view.z = p.z; this.setWaypoint({ x: p.x, z: p.z, name: p.name }); } }, '📍 ' + p.name),
      el('button.x', { onclick: () => { this.ctx.pins.splice(i, 1); this.ctx.onPins(this.ctx.pins); this.#lists(); this.draw(); } }, '×'))));
    this.dests.innerHTML = '';
    for (const d of this.ctx.gazetteer.destinations) this.dests.append(el('button.dest', { onclick: () => { this.setWaypoint({ x: d.x, z: d.z, name: d.name }); this.view.x = d.x; this.view.z = d.z; this.draw(); } }, d.name));
    this.list.innerHTML = '';
    for (const name of Object.keys(this.ctx.starts)) this.list.append(el('button', { onclick: () => { this.toggle(false); this.onTravel(name); } }, name));
  }

  draw() {
    if (!this.open || !this.data) return;
    const c = this.canvas.getContext('2d'), W = this.canvas.width, H = this.canvas.height, { x: vx, z: vz, s } = this.view, d = this.dpr;
    const gz = this.ctx.gazetteer;
    const X = (x) => (x - vx) * s + W / 2, Z = (z) => (z - vz) * s + H / 2;
    const path = (flat) => { c.beginPath(); for (let i = 0; i < flat.length; i += 2) i ? c.lineTo(X(flat[i]), Z(flat[i + 1])) : c.moveTo(X(flat[i]), Z(flat[i + 1])); };
    const x0 = vx - W / 2 / s, x1 = vx + W / 2 / s, z0 = vz - H / 2 / s, z1 = vz + H / 2 / s;
    const visible = (flat) => { for (let i = 0; i < flat.length; i += 2) if (flat[i] > x0 && flat[i] < x1 && flat[i + 1] > z0 && flat[i + 1] < z1) return true; return false; };
    c.fillStyle = '#f1e4c6'; c.fillRect(0, 0, W, H);
    for (const [k, flat] of this.data.areas) { path(flat); c.fillStyle = AREA_COLORS[k] || '#ccc'; c.fill(); }
    for (const a of gz.areas) { if (!visible(a.poly)) continue; path(a.poly); c.fillStyle = AREA_COLORS[a.kind] || '#ccc'; c.fill(); }
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = '#5fb7e6'; c.lineWidth = Math.max(2, 14 * s) * (d > 1 ? 1.2 : 1); for (const r of this.data.rivers) { path(r); c.stroke(); }
    // streets: casing then fill, minor first
    const minRank = s > 0.5 ? 4 : s > 0.2 ? 3 : s > 0.09 ? 2 : 1;
    const streets = gz.streets.filter((st) => st.rank <= minRank).sort((a, b) => b.rank - a.rank);
    for (const pass of [0, 1]) for (const st of streets) {
      const w = Math.max(STREET_W[st.rank] * d * (s > 0.4 ? 1.6 : 1), 1);
      c.strokeStyle = pass ? STREET_C[st.rank] : 'rgba(110,80,50,0.55)'; c.lineWidth = pass ? w : w + 2 * d;
      for (const flat of st.parts) if (visible(flat)) { path(flat); c.stroke(); }
    }
    // labels with a crude collision grid
    const taken = [];
    const free = (bx, by, bw, bh) => { for (const [ax, ay, aw, ah] of taken) if (bx < ax + aw && bx + bw > ax && by < ay + ah && by + bh > ay) return false; taken.push([bx, by, bw, bh]); return true; };
    const label = (text, x, y, font, fill, stroke = 'rgba(255,248,235,0.9)', ang = 0) => {
      c.font = font; const w = c.measureText(text).width, h = parseInt(font.match(/(\d+)px/)[1], 10);
      if (!free(x - w / 2 - 3, y - h / 2 - 2, w + 6, h + 4)) return;
      c.save(); c.translate(x, y); c.rotate(ang); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3 * d; c.strokeStyle = stroke; c.strokeText(text, 0, 0); c.fillStyle = fill; c.fillText(text, 0, 0); c.restore();
    };
    // pup + waypoint + pins first (always win the label space)
    const wp = this.ctx.waypoint, pup = this.ctx.pup;
    for (const p of this.ctx.pins) { drawIcon(c, 'pin', X(p.x), Z(p.z), 20 * d, '#3df5ff', '#123'); label(p.name, X(p.x), Z(p.z) + 18 * d, `700 ${12 * d}px "Baloo 2"`, '#0b4f5c'); }
    if (wp) { drawIcon(c, 'paw', X(wp.x), Z(wp.z), 22 * d, '#ff6f91'); label(wp.name, X(wp.x), Z(wp.z) + 20 * d, `700 ${13 * d}px Cinzel`, '#8a1f3d'); }
    c.save(); c.translate(X(pup.pos.x), Z(pup.pos.z)); c.rotate(-pup.heading + Math.PI);
    c.beginPath(); c.moveTo(0, -11 * d); c.lineTo(8 * d, 9 * d); c.lineTo(0, 4 * d); c.lineTo(-8 * d, 9 * d); c.closePath();
    c.fillStyle = '#e63946'; c.strokeStyle = '#fff'; c.lineWidth = 2.5 * d; c.stroke(); c.fill(); c.restore();
    free(X(pup.pos.x) - 12 * d, Z(pup.pos.z) - 12 * d, 24 * d, 24 * d);
    for (const dst of gz.destinations) {
      const x = X(dst.x), y = Z(dst.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      drawIcon(c, dst.icon, x, y, 15 * d, '#f2c35b', '#3a2416');
      label(dst.name, x, y + 16 * d, `700 ${13 * d}px Cinzel`, '#3a2416');
    }
    const kinds = s > 0.35 ? ['city', 'town', 'suburb', 'quarter', 'neighbourhood', 'village', 'hamlet'] : s > 0.12 ? ['city', 'town', 'suburb', 'quarter', 'neighbourhood', 'village'] : ['city', 'town', 'suburb'];
    for (const t of gz.toles) {
      if (!kinds.includes(t.kind)) continue;
      const x = X(t.x), y = Z(t.z); if (x < 0 || y < 0 || x > W || y > H) continue;
      const big = t.kind === 'city' || t.kind === 'town';
      label(big ? t.name.toUpperCase() : t.name, x, y, big ? `700 ${17 * d}px Cinzel` : `600 ${12 * d}px "Baloo 2"`, big ? '#6b2a1a' : '#5a4632');
    }
    if (s > 0.2) for (const l of gz.landmarks) {
      const x = X(l.x), y = Z(l.z); if (x < 0 || y < 0 || x > W || y > H) continue;
      drawIcon(c, iconForModel(l.model), x, y, 10 * d, '#ffd98a', '#5a3a10');
      if (s > 0.6) label(l.name, x, y + 12 * d, `600 ${11 * d}px "Baloo 2"`, '#6b4a10');
    }
    // street names along the road
    if (s > 0.16) for (const st of streets) {
      if (st.rank > (s > 0.6 ? 4 : s > 0.3 ? 3 : 2)) continue;
      let best = null, bl = 0;
      for (const flat of st.parts) for (let i = 2; i < flat.length; i += 2) {
        const L = Math.hypot(flat[i] - flat[i - 2], flat[i + 1] - flat[i - 1]);
        if (L > bl) { const mx = (flat[i] + flat[i - 2]) / 2, mz = (flat[i + 1] + flat[i - 1]) / 2; if (mx > x0 && mx < x1 && mz > z0 && mz < z1) { bl = L; best = [flat[i - 2], flat[i - 1], flat[i], flat[i + 1]]; } }
      }
      if (!best || bl * s < 50 * d) continue;
      let ang = Math.atan2(best[3] - best[1], best[2] - best[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      label(st.name, X((best[0] + best[2]) / 2), Z((best[1] + best[3]) / 2), `italic 600 ${11 * d}px "Baloo 2"`, '#5b3a22', 'rgba(255,250,240,0.85)', ang);
    }
    // north arrow + scale
    c.fillStyle = '#3a2416'; c.font = `700 ${16 * d}px Cinzel`; c.textAlign = 'center'; c.fillText('N', W - 26 * d, 30 * d);
    c.beginPath(); c.moveTo(W - 26 * d, 36 * d); c.lineTo(W - 31 * d, 52 * d); c.lineTo(W - 21 * d, 52 * d); c.closePath(); c.fill();
    const m = s > 0.5 ? 100 : s > 0.15 ? 500 : 1000;
    c.fillRect(16 * d, H - 22 * d, m * s, 3 * d); c.font = `600 ${11 * d}px "Baloo 2"`; c.textAlign = 'left'; c.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, 16 * d, H - 28 * d);
  }
}
