/**
 * In-game HUD: location plaque (tole / landmark, city, street), discovery banner when you enter a new place,
 * compass strip, clock + weather, stamina, toasts, FPS (F3) and the help panel.
 */
import { $, show } from './dom.js';
import { settings } from '../core/settings.js';
import { WAYFINDING } from '../config/index.js';
import { Compass } from './Compass.js';
import { events } from '../core/events.js';

const SEEN_KEY = 'kukur.discovered.v1';
const loadSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } };

export class Hud {
  constructor() {
    this.root = $('#hud'); this.clock = $('#clock'); this.weather = $('#weatherLbl');
    this.pl = { box: $('#plaque'), title: $('#plTitle'), ne: $('#plNe'), sub: $('#plSub'), street: $('#plStreet') };
    this.disc = { box: $('#discover'), cap: $('#dCap'), title: $('#dTitle'), ne: $('#dNe'), sub: $('#dSub') };
    this.compass = new Compass($('#compass')); this.focus = $('#compassFocus');
    this.stam = $('#stamFill'); this.stamBox = $('#stamina'); this.debug = $('#debug'); this.toastEl = $('#toast'); this.help = $('#help');
    this._t = 0; this._fps = []; this._toast = 0;
    this.cur = null; this.pending = null; this.pendingT = 0; this.shownAt = new Map(); this._disc = 0;
    this.seen = loadSeen();
    show(this.debug, settings.get('showFps'));
    settings.onChange((k, v) => { if (k === 'showFps') show(this.debug, v); });
  }
  visible(on) { show(this.root, on); }
  toggleHelp() { show(this.help, this.help.classList.contains('hidden')); }
  toggleFps() { settings.set('showFps', !settings.get('showFps')); }
  toast(text, seconds = 2.2) { this.toastEl.textContent = text; this.toastEl.classList.add('on'); this._toast = seconds; }

  threat(status, scan) {
    const el=$('#threat');if(!el)return;
    const cooldown=scan?.cool>0?`Roar ready in ${Math.ceil(scan.cool)}s`:'Hold F to stagger attackers';
    const text=status?`⚠ ${status.reason} · ${status.actor?cooldown:'Find the pavement'}`:'';
    if(el.textContent!==text)el.textContent=text;
  }

  #plaque(p) {
    this.pl.title.textContent = p.title; this.pl.ne.textContent = p.ne || ''; this.pl.sub.textContent = p.sub;
    this.pl.street.textContent = p.street ? p.street : ''; this.pl.street.classList.toggle('hidden', !p.street);
  }
  /** Big centred "entering …" banner. First visit says DISCOVERED. */
  banner(p, time) {
    const last = this.shownAt.get(p.key);
    if (last !== undefined && time - last < 90) return;
    this.shownAt.set(p.key, time);
    const first = !this.seen.has(p.key);
    if (first) { this.seen.add(p.key); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen])); } catch { /* private mode */ } }
    this.disc.cap.textContent = first ? 'Discovered' : '';
    this.disc.title.textContent = p.title; this.disc.ne.textContent = p.ne || ''; this.disc.sub.textContent = p.sub;
    this.disc.box.classList.remove('on'); void this.disc.box.offsetWidth; this.disc.box.classList.add('on');
    this._disc = WAYFINDING.bannerSeconds + 0.8;
    this.onDiscover?.(p, first);
    events.emit('discover', { ...p, first });
  }

  update(dt, { pup, weather, renderer, world, camera, waypoint, pins, time, frameDt=dt }) {
    this._fps.push(frameDt); if (this._fps.length > 60) this._fps.shift();
    if (!this.debug.classList.contains('hidden')) {
      const fps = this._fps.length / this._fps.reduce((a, b) => a + b, 0), r = renderer.renderer.info.render;
      this.debug.textContent = `FPS ${fps.toFixed(0)} · scale ${renderer.scale.toFixed(2)} · draws ${r.calls} · tris ${(r.triangles / 1000) | 0}k · tiles ${world.streamer.tiles.size} · ${pup.pos.x.toFixed(0)}, ${pup.pos.z.toFixed(0)}`;
    }
    const gz = world.gazetteer;
    if ((this._t -= dt) <= 0) {
      this._t = 0.25;
      const p = gz.describe(pup.pos.x, pup.pos.z);
      if (!this.cur || p.title !== this.cur.title || p.street !== this.cur.street || p.sub !== this.cur.sub) this.#plaque(p);
      if (!this.cur || p.key !== this.cur.key) { this.pending = p; this.pendingT = WAYFINDING.bannerDelay; }
      this.cur = p;
    }
    if (this.pending && !this.quiet && (this.pendingT -= dt) <= 0) {   // quiet (cutscenes, story) holds it for later
      if (this.pending.key === this.cur.key) this.banner(this.pending, time);
      this.pending = null;
    }
    if (this._disc > 0 && (this._disc -= dt) <= 0) this.disc.box.classList.remove('on');
    this.compass.update(dt, { camera, pos: pup.pos, gazetteer: gz, waypoint, pins });
    if (this.focus.textContent !== this.compass.focus) this.focus.textContent = this.compass.focus;
    const h = weather.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    this.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const fest = world.festival?.today;
    this.weather.textContent = `${weather.label.icon} ${weather.label.label}${fest ? ` · ${fest.icon} ${fest.name}` : ''}`;
    this.stam.style.width = (pup.stamina * 100).toFixed(0) + '%';
    this.stamBox.classList.toggle('show', pup.stamina < 0.99);
    if (this._toast > 0 && (this._toast -= dt) <= 0) this.toastEl.classList.remove('on');
  }
}
