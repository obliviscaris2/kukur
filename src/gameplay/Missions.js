/**
 * Mission runner. Missions are data (config/missions.js). The player picks one in the grimoire (Missions tab);
 * its current objective becomes the waypoint (light column + compass + map marker) and is shown on the HUD.
 *   missions.track(id) · missions.list() · missions.active · missions.step
 * Step types: reach · collect · event · locked (see config/missions.js). Progress persists in localStorage.
 */
import { MISSIONS, ITEMS } from '../config/index.js';
import { events } from '../core/events.js';
import { $ } from '../ui/dom.js';

const KEY = 'kukur.missions.v1';

export class Missions {
  constructor({ app, bag, hud, audio, journal, gazetteer }) {
    Object.assign(this, { app, bag, hud, audio, journal, gz: gazetteer });
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); this.state = s.state || {}; this.activeId = s.active || null; } catch { this.state = {}; this.activeId = null; }
    for (const e of ['roar', 'befriend', 'bell', 'vet', 'give', 'smash', 'pickup', 'petted', 'swim', 'ride', 'discover']) events.on(e, (d) => this.#event(e, d));
  }
  #save() { try { localStorage.setItem(KEY, JSON.stringify({ state: this.state, active: this.activeId })); } catch { /* ok */ } }
  get active() { return MISSIONS.find((m) => m.id === this.activeId) || null; }
  get step() { const m = this.active; return m ? m.steps[this.state[m.id]?.step || 0] : null; }
  list() { return MISSIONS.map((m) => ({ ...m, step: this.state[m.id]?.step || 0, done: !!this.state[m.id]?.done, tracked: m.id === this.activeId })); }

  /** Where a step points on the map (or null). */
  target(step) {
    if (!step || step.type !== 'reach') return null;
    if (step.place) { const d = this.gz.destinations.find((x) => x.name === step.place); return d ? { x: d.x, z: d.z, name: step.place } : null; }
    return null;
  }
  track(id) {
    if (this.state[id]?.done) return;
    this.activeId = id; this.state[id] ??= { step: 0, n: 0 }; this.#save();
    const m = this.active; this.hud.toast(`◆ Tracking: ${m.title}`, 2.4); this.audio.bell(6);
    this.#point();
  }
  #point() { if (this.paused) return; const t = this.target(this.step); this.app.setWaypoint(t ? { ...t, name: `◆ ${t.name}` } : null); this.render(); }

  #advance() {
    const m = this.active, st = this.state[m.id];
    st.step++; st.n = 0;
    this.audio.discover(false); this.hud.toast('✦ Objective complete', 1.8);
    if (st.step >= m.steps.length) {
      st.done = true; this.activeId = null;
      const [item, n] = m.reward || []; if (item) for (let i = 0; i < n; i++) this.bag.add(item);
      this.hud.toast(`🏆 Mission complete: ${m.title}${item ? ` — ${ITEMS[item].icon} ×${n}` : ''}`, 4);
      this.journal.write('🏆', `Finished "${m.title}".`);
      this.app.setWaypoint(null);
    } else if (m.steps[st.step].type === 'locked') this.journal.write('📜', `${m.title}: ${m.steps[st.step].text}`);
    this.#save(); this.#point();
  }
  #event(name, d) {
    const s = this.step; if (!s || this.paused || s.type !== 'event' || s.event !== name) return;
    if (s.where && (d?.item ?? d?.id) !== s.where) return;
    const st = this.state[this.activeId]; st.n = (st.n || 0) + 1;
    if (st.n >= (s.count || 1)) this.#advance(); else { this.#save(); this.render(); }
  }

  update(dt, pup) {
    const s = this.step; if (!s || this.paused) return;   // paused during story scenes
    if (s.type === 'reach') { const t = this.target(s); if (t && Math.hypot(t.x - pup.pos.x, t.z - pup.pos.z) < (s.r || 25)) this.#advance(); }
    else if (s.type === 'collect' && this.bag.count(s.item) >= s.count) this.#advance();
    if ((this._t = (this._t || 0) - dt) <= 0) { this._t = 0.5; this.render(pup); }
  }
  /** HUD objective line under the hearts. */
  render(pup) {
    const el = $('#objective'); if (!el || this.paused) return;
    const m = this.active, s = this.step;
    if (!m || !s) { el.innerHTML = ''; return; }
    const t = this.target(s), d = t && pup ? Math.hypot(t.x - pup.pos.x, t.z - pup.pos.z) : null;
    const prog = s.type === 'collect' ? ` (${Math.min(this.bag.count(s.item), s.count)}/${s.count})` : s.type === 'event' && (s.count || 1) > 1 ? ` (${this.state[m.id].n || 0}/${s.count})` : '';
    el.innerHTML = `<div class="ob-t">${m.main ? '★' : '◆'} ${m.title}</div><div class="ob-s">${s.text}${prog}${d ? ` · ${d < 950 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km'}` : ''}</div>`;
  }
}
