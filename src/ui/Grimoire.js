/**
 * The Grimoire — the pup's leather-bound book (I/B opens the Bag, J opens the Journal).
 *   Bag      items: use (E), give (G), drop (X)
 *   Journal  tasks with progress + sealed story chapters (config/quests.js)
 *   Diary    the pup's own notes about what happened (gameplay/Journal.js)
 *   Packs    dog territories you've met: who, where, friend or foe
 *   Places   everywhere you've discovered
 * Keys while open: A/D or ←/→ change tab (page-turn), W/S select, E/G/X act, I/B/J/Esc close.
 */
import { el, show } from './dom.js';
import { CHAPTERS } from '../config/index.js';

const TABS = [['bag', '🎒', 'Bag', 'झोला'], ['missions', '◆', 'Missions', 'मिसन'], ['journal', '📜', 'Journal', 'पत्रिका'], ['diary', '🪶', 'Diary', 'डायरी'], ['packs', '🐕', 'Packs', 'बथान'], ['places', '🗺️', 'Places', 'ठाउँ']];

export class Grimoire {
  /** @param {HTMLElement} root  @param {{onUse, onGive, onDrop}} actions  @param {{bag, journal, territories, seenPlaces}} data */
  constructor(root, actions, data) {
    this.root = root; this.actions = actions; this.data = data; this.tab = 'bag'; this.sel = 0;
    this.tabsEl = el('div.gr-tabs'); this.left = el('div.gr-page.gr-left'); this.right = el('div.gr-page.gr-right');
    this.book = el('div.gr-book', {}, el('div.gr-corner.tl'), el('div.gr-corner.tr'), el('div.gr-corner.bl'), el('div.gr-corner.br'), this.tabsEl, el('div.gr-spread', {}, this.left, el('div.gr-spine'), this.right));
    root.append(this.book);
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      const k = e.code, i = TABS.findIndex((t) => t[0] === this.tab);
      if (k === 'KeyA' || k === 'ArrowLeft') this.go(TABS[(i + TABS.length - 1) % TABS.length][0]);
      else if (k === 'KeyD' || k === 'ArrowRight') this.go(TABS[(i + 1) % TABS.length][0]);
      else if (k === 'KeyW' || k === 'ArrowUp') this.select(this.sel - 1);
      else if (k === 'KeyS' || k === 'ArrowDown') this.select(this.sel + 1);
      else if (this.tab === 'bag' && (k === 'KeyE' || k === 'Enter')) this.#act('onUse');
      else if (this.tab === 'bag' && k === 'KeyG') this.#act('onGive');
      else if (this.tab === 'bag' && k === 'KeyX') this.#act('onDrop');
      else return;
      e.preventDefault(); e.stopPropagation();
    }, true);
  }
  get open() { return !this.root.classList.contains('hidden'); }
  toggle(on, tab) { if (tab) this.tab = tab; show(this.root, on ?? !this.open); if (this.open) { this.sel = 0; this.render(true); } }
  go(tab) { if (tab === this.tab) return; this.tab = tab; this.sel = 0; this.render(true); }
  select(i) { const n = this.#count(); this.sel = n ? (i + n) % n : 0; this.render(); }
  #count() { return this.tab === 'bag' ? this.data.bag.list().length : 0; }
  #act(kind) { const it = this.data.bag.list()[this.sel]; if (it) { this.actions[kind]?.(it.id); this.render(); } }

  render(flip = false) {
    if (!this.open) return;
    this.tabsEl.innerHTML = '';
    for (const [id, ic, name] of TABS) this.tabsEl.append(el('button.gr-tab' + (id === this.tab ? '.on' : ''), { onclick: () => this.go(id) }, el('span', {}, ic), name));
    if (flip) { this.right.classList.remove('flip'); void this.right.offsetWidth; this.right.classList.add('flip'); }
    const [, icon, title, ne] = TABS.find((t) => t[0] === this.tab);
    this.left.innerHTML = ''; this.right.innerHTML = '';
    this.left.append(el('div.gr-title', {}, el('span.gr-ic', {}, icon), title), el('div.gr-ne', {}, ne), el('div.gr-rule', {}, '❦'));
    ({ missions: () => this.#missions(), bag: () => this.#bag(), journal: () => this.#journal(), diary: () => this.#diary(), packs: () => this.#packs(), places: () => this.#places() })[this.tab]();
  }

  #bag() {
    const items = this.data.bag.list(); this.sel = Math.min(this.sel, Math.max(0, items.length - 1));
    const list = el('div.gr-list');
    if (!items.length) list.append(el('p.gr-empty', {}, 'Empty… Sniff (Q) for buried treasure, smash pots, make friends.'));
    items.forEach((it, i) => list.append(el('button.gr-item' + (i === this.sel ? '.on' : ''), { onclick: () => this.select(i) }, el('span.ic', {}, it.icon), el('span.nm', {}, it.name), el('span.ct', {}, '×' + it.n))));
    this.left.append(list, el('p.gr-keys', {}, 'W/S choose · E use · G give · X drop'));
    const it = items[this.sel]; if (!it) return;
    const tags = [it.heal && `❤ heals ${it.heal}`, it.gift && 'a gift', it.throw && 'throwable', it.wear && 'wearable', it.ring && 'ring it'].filter(Boolean);
    this.right.append(el('div.gr-big', {}, it.icon), el('h3', {}, it.name), el('div.gr-ne', {}, it.ne), el('p.gr-desc', {}, it.desc), el('div.gr-tags', {}, tags.join(' · ')),
      el('div.gr-acts', {}, el('button', { onclick: () => this.#act('onUse') }, it.heal ? 'Eat' : it.throw ? 'Throw' : it.wear ? 'Wear' : it.ring ? 'Ring' : 'Use'), el('button', { onclick: () => this.#act('onGive') }, 'Give'), el('button', { onclick: () => this.#act('onDrop') }, 'Drop')));
  }
  #missions() {
    const ms = this.data.missions.list(), card = (m) => el('div.gr-task' + (m.done ? '.done' : ''), {},
      el('div.gr-tt', {}, `${m.main ? '★' : '◆'} ${m.title} `, el('span.gr-ne', {}, m.ne || '')), el('div.gr-td', {}, m.desc),
      el('div.gr-bar', {}, el('div', { style: `width:${(Math.min(m.step, m.steps.length) / m.steps.length) * 100}%` })),
      m.done ? el('div.gr-tn', {}, 'Complete ✦') : el('div.gr-acts', {}, el('button', { onclick: () => { this.data.missions.track(m.id); this.render(); } }, m.tracked ? 'Tracking ◆' : 'Track on map')));
    this.left.append(el('div.gr-sub', {}, 'The Story'), ...ms.filter((m) => m.main).map(card));
    this.right.append(el('div.gr-sub', {}, 'Around the Valley'), ...ms.filter((m) => !m.main).map(card));
  }
  #journal() {
    const tasks = this.data.journal.tasks(), open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
    const row = (t) => el('div.gr-task' + (t.done ? '.done' : ''), {}, el('div.gr-tt', {}, (t.done ? '✦ ' : '◇ ') + t.title), el('div.gr-td', {}, t.desc),
      el('div.gr-bar', {}, el('div', { style: `width:${(t.n / t.count) * 100}%` })), el('div.gr-tn', {}, `${t.n} / ${t.count}`));
    this.left.append(el('div.gr-sub', {}, 'Tasks'), ...open.map(row), ...(done.length ? [el('div.gr-sub', {}, 'Completed'), ...done.map(row)] : []));
    this.right.append(el('div.gr-sub', {}, 'The Story'), ...CHAPTERS.map((c) => el('div.gr-chapter', {}, el('div.gr-seal', {}, '🔒'), el('div', {}, el('div.gr-tt', {}, c.title), el('div.gr-td', {}, c.hint)))),
      el('p.gr-empty', {}, 'These pages are still sealed. They will open as the story arrives.'));
  }
  #diary() {
    const d = this.data.journal.diary.slice().reverse(), half = Math.ceil(Math.min(d.length, 14) / 2);
    const entry = (e) => el('div.gr-entry', {}, el('span.gr-eic', {}, e.icon), el('div', {}, el('div.gr-date', {}, new Date(e.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })), el('div.gr-etext', {}, e.text)));
    this.left.append(...d.slice(0, half).map(entry)); this.right.append(...d.slice(half, half * 2).map(entry));
  }
  #packs() {
    const terr = [...this.data.territories.list.values()].filter((t) => t.discovered);
    const card = (t) => el('div.gr-pack', {}, el('span.gr-dot', { style: `background:${t.color}` }), el('div', {}, el('div.gr-tt', {}, t.pack ? `The ${t.name}` : t.name),
      el('div.gr-td', {}, t.pack ? `Alpha: ${t.alphaName} · ${t.size} dogs` : 'A lone guardian'), el('div.gr-td', {}, t.friendly ? '💛 Friends — you may pass' : '⚠️ Territorial — bring a bone')));
    if (!terr.length) this.left.append(el('p.gr-empty', {}, 'No packs met yet. Sniff (Q) near street corners: their markers glow in their colour.'));
    this.left.append(...terr.filter((t) => !t.friendly).map(card)); this.right.append(el('div.gr-sub', {}, 'Friends'), ...terr.filter((t) => t.friendly).map(card));
  }
  #places() {
    const seen = [...this.data.seenPlaces()].map((k) => k.slice(2)).sort();
    const half = Math.ceil(seen.length / 2);
    this.left.append(el('div.gr-sub', {}, `${seen.length} discovered`), ...seen.slice(0, half).map((n) => el('div.gr-place', {}, '✧ ' + n)));
    this.right.append(...seen.slice(half).map((n) => el('div.gr-place', {}, '✧ ' + n)));
  }
}
