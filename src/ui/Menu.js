/**
 * Main menu, pause menu, settings, controls and credits — all built from plain DOM.
 * The App passes callbacks: { onPlay(startName), onResume(), onQuit() }.
 */
import { $, el, show } from './dom.js';
import { settings } from '../core/settings.js';
import { CONTROL_HELP } from '../config/index.js';

export class Menu {
  constructor(callbacks, starts) {
    this.cb = callbacks; this.starts = starts;
    this.root = $('#menu'); this.panel = $('#menuPanel');
    this.mode = 'main';
  }
  open(mode = 'main') { this.mode = mode; show(this.root, true); this.root.classList.toggle('paused', mode === 'pause'); this.#render(mode === 'pause' ? 'pause' : 'main'); }
  close() { show(this.root, false); }
  get isOpen() { return !this.root.classList.contains('hidden'); }

  #render(view) {
    const p = this.panel; p.innerHTML = '';
    const btn = (label, onclick, cls = '') => el('button' + cls, { onclick }, label);
    const back = () => btn('Back', () => this.#render(this.mode === 'pause' ? 'pause' : 'main'));
    if (view === 'main') {
      p.append(el('div.logo', {}, 'कुकुर'), el('h1', {}, 'KUKUR'), el('p.tag', {}, 'A pup, a valley of temples, prayer flags and pigeons.'),
        btn('Play', () => this.cb.onPlay(settings.get('startAt')), '.primary'),
        btn('Start location', () => this.#render('start')), btn('Settings', () => this.#render('settings')), btn('Controls', () => this.#render('controls')), btn('Credits', () => this.#render('credits')),
        el('p.small', {}, `Starting at: ${settings.get('startAt')}`));
    } else if (view === 'pause') {
      p.append(el('h2', {}, 'Paused'), btn('Resume', () => this.cb.onResume(), '.primary'), btn('Valley map', () => this.cb.onMap()), btn('Settings', () => this.#render('settings')),
        btn('Controls', () => this.#render('controls')), btn('Quit to menu', () => this.cb.onQuit()));
    } else if (view === 'start') {
      p.append(el('h2', {}, 'Where does the pup wake up?'));
      for (const name of Object.keys(this.starts)) p.append(btn(name, () => { settings.set('startAt', name); this.#render('main'); }, settings.get('startAt') === name ? '.selected' : ''));
      p.append(back());
    } else if (view === 'settings') {
      const row = (label, input) => el('label.row', {}, el('span', {}, label), input);
      const range = (k, min, max, step) => { const i = el('input', { type: 'range', min, max, step }); i.value = settings.get(k); i.oninput = () => settings.set(k, +i.value); return i; };
      const check = (k) => { const i = el('input', { type: 'checkbox' }); i.checked = settings.get(k); i.onchange = () => settings.set(k, i.checked); return i; };
      const q = el('select', {}, ...['auto', 'low', 'medium', 'high'].map((v) => el('option', { value: v }, v[0].toUpperCase() + v.slice(1))));
      q.value = settings.get('quality'); q.onchange = () => { settings.set('quality', q.value); note.textContent = 'Quality changes apply after reloading the page.'; };
      const note = el('p.small');
      p.append(el('h2', {}, 'Settings'), row('Graphics quality', q), row('Volume', range('volume', 0, 1, 0.05)), row('Music', range('music', 0, 1, 0.05)),
        row('Mouse sensitivity', range('sensitivity', 0.3, 2.5, 0.05)), row('Invert mouse Y', check('invertY')), row('Show FPS', check('showFps')), row('Skip intro scene', check('skipIntro')), note, back());
    } else if (view === 'controls') {
      p.append(el('h2', {}, 'Controls'), el('table.keys', {}, ...CONTROL_HELP.map(([k, d]) => el('tr', {}, el('td', {}, k), el('td', {}, d)))), back());
    } else if (view === 'credits') {
      p.append(el('h2', {}, 'Credits'), el('p', {}, 'Streets, buildings, parks and temples of Kathmandu, Lalitpur & Bhaktapur: © OpenStreetMap contributors (ODbL).'),
        el('p', {}, 'Pup, people and temples modelled procedurally in Blender. Rendered with three.js.'), el('p', {}, 'Made with love for the street dogs of Kathmandu.'), back());
    }
  }
}
