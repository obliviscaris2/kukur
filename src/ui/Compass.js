/**
 * Skyrim-style compass strip at the top of the screen: cardinal points, nearby landmarks, famous destinations
 * and your waypoint (paw). A marker near the centre shows its name and distance.
 */
import * as THREE from 'three';
import { WAYFINDING } from '../config/index.js';
import { angDiff } from '../core/geo.js';
import { drawIcon, iconForModel } from './icons.js';

const CARDINALS = [[Math.PI, 'N'], [Math.PI / 2, 'E'], [0, 'S'], [-Math.PI / 2, 'W'], [Math.PI * 0.75, 'NE'], [Math.PI * 0.25, 'SE'], [-Math.PI * 0.25, 'SW'], [-Math.PI * 0.75, 'NW']];
const dir = new THREE.Vector3();
const km = (m) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

export class Compass {
  constructor(canvas) {
    this.canvas = canvas; this.c = canvas.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.W = canvas.width; this.H = canvas.height;
    canvas.width = this.W * dpr; canvas.height = this.H * dpr; this.c.scale(dpr, dpr);
    this._t = 0;
  }

  /** @param {{camera, pos, gazetteer, waypoint}} o */
  update(dt, { camera, pos, gazetteer, waypoint, pins }) {
    if ((this._t -= dt) > 0) return;
    this._t = 1 / 30;
    const { c, W, H } = this, F = WAYFINDING.compass.fov;
    camera.getWorldDirection(dir);
    const h = Math.atan2(dir.x, dir.z);
    const X = (b) => W / 2 - (angDiff(h, b) / F) * W;   // left/right flipped: +X is to the viewer's left when facing +Z
    c.clearRect(0, 0, W, H);
    // strip
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(22,16,40,0)'); g.addColorStop(0.12, 'rgba(22,16,40,0.62)'); g.addColorStop(0.88, 'rgba(22,16,40,0.62)'); g.addColorStop(1, 'rgba(22,16,40,0)');
    c.fillStyle = g; c.fillRect(0, 8, W, H - 16);
    c.fillStyle = 'rgba(242,195,91,0.55)'; c.fillRect(W * 0.1, 8, W * 0.8, 1); c.fillRect(W * 0.1, H - 9, W * 0.8, 1);
    // ticks
    c.fillStyle = 'rgba(255,240,210,0.35)';
    for (let a = -Math.PI; a < Math.PI; a += Math.PI / 12) { const x = X(a); if (x > W * 0.08 && x < W * 0.92) c.fillRect(x, H / 2 - 3, 1, 6); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [b, label] of CARDINALS) {
      const x = X(b); if (x < W * 0.08 || x > W * 0.92) continue;
      const big = label.length === 1;
      c.font = big ? '700 17px Cinzel, serif' : '600 11px Cinzel, serif';
      c.fillStyle = label === 'N' ? '#ff8f6b' : big ? '#fff3dc' : 'rgba(255,243,220,0.7)';
      c.fillText(label, x, H / 2 + 1);
    }
    // markers
    const marks = [];
    const add = (x, z, icon, name, color, prio) => {
      const d = Math.hypot(x - pos.x, z - pos.z); if (d < 8) return;
      const b = Math.atan2(x - pos.x, z - pos.z), rel = angDiff(h, b);
      if (Math.abs(rel) > F / 2) return;
      marks.push({ x: X(b), d, icon, name, color, prio, rel });
    };
    for (const d of gazetteer.destinations) if (Math.hypot(d.x - pos.x, d.z - pos.z) < WAYFINDING.compass.destinations) add(d.x, d.z, d.icon, d.name, '#f2c35b', 1);
    // only notable landmarks (big ones further away, small shrines only when close), nearest few
    const lms = gazetteer.landmarks.map((l) => [l, Math.hypot(l.x - pos.x, l.z - pos.z)])
      .filter(([l, d]) => d < WAYFINDING.compass.nearLandmarks && (l.size >= 9 || d < 120)).sort((a, b) => a[1] - b[1]).slice(0, 6);
    for (const [l] of lms) add(l.x, l.z, iconForModel(l.model), l.name, '#ffd98a', 0);
    for (const p of pins || []) add(p.x, p.z, 'pin', p.name, '#3df5ff', 1.5);
    if (waypoint) add(waypoint.x, waypoint.z, 'paw', waypoint.name || 'Waypoint', '#ff6f91', 2);
    marks.sort((a, b) => a.prio - b.prio);
    let focus = null;
    for (const m of marks) {
      const fade = 1 - Math.max(0, (Math.abs(m.x - W / 2) - W * 0.34) / (W * 0.12));
      c.globalAlpha = Math.max(0, Math.min(1, fade));
      drawIcon(c, m.icon, m.x, H / 2, m.prio === 2 ? 17 : m.prio >= 1 ? 14 : 11, m.color);
      if (Math.abs(m.rel) < 0.07 && (!focus || m.prio > focus.prio || (m.prio === focus.prio && m.d < focus.d))) focus = m;
    }
    c.globalAlpha = 1;
    this.focus = focus ? `${focus.name} · ${km(focus.d)}` : '';
  }
}
