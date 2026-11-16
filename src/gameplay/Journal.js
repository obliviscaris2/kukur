/**
 * The pup's journal: task progress (config/quests.js TASKS) and a diary written in the pup's own voice when
 * something memorable happens. Listens to game events; persists in localStorage.
 *   journal.tasks() -> [{ ...task, n, done }]     journal.diary -> [{ t, icon, text }]
 */
import { TASKS, ITEMS } from '../config/index.js';
import { events } from '../core/events.js';

const KEY = 'kukur.journal.v1';
const FIRSTS = {
  befriend: ['🦴', 'Gave a bone and made friends with a whole pack. They wag at me now!'],
  faint: ['💫', 'Everything went dark today. I woke up somewhere safe. I must be more careful.'],
  smash: ['🏺', 'I broke a pot. Didi was very loud about it. Worth it.'],
  ride: ['🚌', 'I RODE ON A ROOF. The whole city went by under my paws!'],
  roar: ['📣', 'I barked so hard the street shook. I could feel everyone around me.'],
  petted: ['💛', 'A kind hand scratched behind my ears. I think I like this city.'],
  swim: ['💦', 'Jumped in the water. Cold! Then I shook it all over a pigeon.'],
  stone: ['🪨', 'Someone threw a stone at me. I don\'t understand why.'],
  chased: ['🐕', 'Wandered into another pack\'s street. They did not like that.'],
  catChase: ['🐈', 'Chased a cat! It went straight up a wall and looked at me like I was the silly one.'],
  flock: ['🕊️', 'I ran into the pigeons and the whole sky turned into wings. They circled the temple like a dance.'],
  firework: ['🎆', 'The sky went BANG and turned into flowers. I hid behind a pot. Then I peeked. So pretty. So loud.'],
  nest: ['🪺', 'Found a nest up in a tree. Tiny cheeps. I promised not to bark.'],
  frog: ['🐸', 'A frog came out in the rain! It said "ribbit" and hopped away. Rude.'],
  junk: ['🧴', 'There was plastic floating in the river. I pushed it away from the fish.'],
  puddle: ['💧', 'PUDDLES. Every single one of them. Splash!'],
  leaves: ['🍂', 'Pounced into a pile of leaves. They went EVERYWHERE. I would do it again.'],
  rummage: ['🐾', 'Followed my nose into a rubbish bag. A treasure! Humans throw away the strangest things.'],
  safeCrossing: ['🚦', 'Traffic dai held up a hand. The whole road stopped for my little paws.'],
  playChase: ['🐾', 'Caught a schoolkid! We ran all the way down the street. I won a biscuit.'],
  ridehail: ['🛵', 'Met a rider waiting by the kerb. A beep, a wave, and off to another adventure.'],
};

export class Journal {
  constructor(bag, hud, audio) {
    this.bag = bag; this.hud = hud; this.audio = audio;
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); this.counts = s.counts || {}; this.done = s.done || {}; this.diary = s.diary || []; this.firsts = s.firsts || {}; }
    catch { this.counts = {}; this.done = {}; this.diary = []; this.firsts = {}; }
    if (!this.diary.length) this.write('🐾', 'Woke up in the old city. Everything smells of incense, momo and adventure.');
    const on = (name, fn) => events.on(name, (e) => { fn?.(e); this.#count(name, e); });
    on('discover', (p) => { if (p.first) this.write('📍', `Found ${p.title}${p.sub ? ' (' + p.sub + ')' : ''}.`); });
    // every event a task (config/quests.js) or a diary first listens for — add a task there and it just works
    for (const k of new Set([...TASKS.map((t) => t.event), ...Object.keys(FIRSTS)].filter((k) => k !== 'discover' && k !== 'faint' && k !== 'stone'))) on(k);
    events.on('faint', () => this.#first('faint'));
    events.on('damage', (d) => { if (d.source === 'stone') this.#first('stone'); });
  }
  #save() { try { localStorage.setItem(KEY, JSON.stringify({ counts: this.counts, done: this.done, diary: this.diary.slice(-80), firsts: this.firsts })); } catch { /* ok */ } }
  #first(kind) { if (this.firsts[kind] || !FIRSTS[kind]) return; this.firsts[kind] = true; this.write(...FIRSTS[kind]); }
  write(icon, text) { this.diary.push({ t: Date.now(), icon, text }); this.#save(); }

  #count(event, e) {
    if (event === 'discover' && !e?.first) return;
    this.#first(event);
    for (const t of TASKS) {
      if (t.event !== event || this.done[t.id]) continue;
      if (t.where) { const v = event === 'pickup' ? e?.id : e?.title || ''; if (t.where instanceof RegExp ? !t.where.test(v) : v !== t.where) continue; }
      this.counts[t.id] = (this.counts[t.id] || 0) + 1;
      if (this.counts[t.id] >= t.count) {
        this.done[t.id] = true;
        const [item, n] = t.reward || [];
        if (item) for (let i = 0; i < n; i++) this.bag.add(item);
        this.hud.toast(`📜 Task complete: ${t.title}${item ? ` — reward ${ITEMS[item].icon} ×${n}` : ''}`, 4);
        this.audio.discover(false);
        this.write('📜', `Completed "${t.title}". ${item ? `Got ${n} ${ITEMS[item].name}${n > 1 ? 's' : ''}.` : ''}`);
      }
    }
    this.#save();
  }
  tasks() { return TASKS.map((t) => ({ ...t, n: Math.min(t.count, this.counts[t.id] || 0), done: !!this.done[t.id] })); }
}
