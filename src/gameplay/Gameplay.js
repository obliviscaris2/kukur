/**
 * Gameplay coordinator: wires the pup's hearts, bag, pickups, breakables and dog territories together and turns
 * game events into feedback (sound, particles, toasts). App owns one; it forwards input:
 *   game.interact()  E — pick up / dig          game.give()  G — offer a bone/biscuit (dogs) or return a chappal (people)
 *   game.use(id) / game.drop(id) — from the bag screen
 * Respawn: when the pup faints it wakes up at the last major place discovered (HUD discovery banner).
 */
import { DASH, ITEMS, FESTIVAL, BREAKABLES } from '../config/index.js';
import { events } from '../core/events.js';
import { $ } from '../ui/dom.js';
import { Health } from './Health.js';
import { Inventory } from './Inventory.js';
import { Pickups } from './Pickups.js';
import { Breakables } from './Breakables.js';
import { Territories } from './Territories.js';
import { Scan } from './Scan.js';
import { Journal } from './Journal.js';
import { Missions } from './Missions.js';
import { Rooftops } from './Rooftops.js';
import { Threats } from './Threats.js';
import { Exploration } from './Exploration.js';

export class Gameplay {
  /** @param {{scene, world, npcs, pup, cam, fx, audio, hud, bubbles, app}} o */
  constructor(o) {
    Object.assign(this, o);
    this.health = new Health();
    this.bag = new Inventory();
    this.journal = new Journal(this.bag, o.hud, o.audio);
    this.missions = new Missions({ app: o.app, bag: this.bag, hud: o.hud, audio: o.audio, journal: this.journal, gazetteer: o.world.gazetteer });
    this.pickups = new Pickups(o.scene, o.world);
    this.breakables = new Breakables(o.scene, o.world, o.fx, this.pickups);
    this.territories = new Territories(o.scene, o.world, o.npcs, o.hud, o.app.renderer.quality);
    this.lastSafe = null;
    this.threats = new Threats(o);
    this.rooftops=new Rooftops({...o,pickups:this.pickups});
    this.exploration=new Exploration({...o,pickups:this.pickups,journal:this.journal});
    this.scan = new Scan({ scene: o.scene, game: this, npcs: o.npcs, traffic: o.traffic, audio: o.audio, fx: o.fx, cam: o.cam, hud: o.hud,
      vets: () => o.world.gazetteer.vets.map((v) => ({ x: v.x, y: o.world.heightAt(v.x, v.z), z: v.z })) });
    this.#wire();
    this.renderHearts();
  }

  #wire() {
    const { audio, fx, hud, pup, cam } = this;
    events.on('damage', ({ amount = 1, from, source }) => {
      if (this.app.state !== 'play' || this.app.storyCalm || !this.health.damage(amount, source)) return;   // storyCalm: nobody gets hurt during the prologue
      pup.hurt(from || pup.pos); cam.bump(0.9);
      fx.burst('dust', pup.pos.clone().setY(pup.pos.y + 0.3), 8, { colors: ['#ffffff', '#ffd6d6'], speed: 2 });
      const h = $('#hurt'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 120);
      if (source === 'vehicle') hud.toast('🛵 Oof! Watch the traffic!', 1.8);
    });
    events.on('hearts', () => this.renderHearts());
    // crackers: street dogs hate them — a bang close by and the pup flinches (and maybe whimpers)
    events.on('firework', ({ pos }) => {
      if (this.app.state !== 'play' || pos.distanceTo(pup.pos) > FESTIVAL.fireworks.scareRadius) return;
      pup.setMood('scared', 2.5); if (!this._eekT || performance.now() - this._eekT > 9000) { this._eekT = performance.now(); audio.play('pup_whine', { vol: 0.5 }); this.app.bubbles.say(pup, ['Eek!', 'Too loud!', 'Yikes!'][(Math.random() * 3) | 0], 1.4); }
    });
    events.on('faint', () => this.#faint());
    events.on('pickup', ({ id, pos, dug }) => {
      const def = ITEMS[id];
      if (!this.bag.add(id)) { hud.toast(`${def.icon} Your bag can't hold more ${def.name}s`, 1.6); this.pickups.drop(id, pos); return; }
      audio.play('pickup', { vol: 0.6, rate: 0.95 + Math.random() * 0.1 }); if (dug) audio.play('dig', { vol: 0.9 });
      fx.burst('sparkle', pos, 12, { up: 1.4 }); if (dug) fx.burst('dust', pos.clone().setY(pos.y - 0.3), 10, { colors: ['#8a6a48', '#6b4a2a'], speed: 1.6 });
      hud.toast(`${def.icon} +1 ${def.name}${dug ? ' (dug up!)' : ''}`, 1.6);
    });
    events.on('smash', ({ pos, kind }) => audio.play(kind === 'crate' || kind === 'basket' ? 'crate' : 'smash', { vol: 0.9, pos, rate: 0.9 + Math.random() * 0.25 }));
    events.on('bump', ({ pos }) => { if (!this._bumpT || performance.now() - this._bumpT > 120) { this._bumpT = performance.now(); audio.play('clonk', { vol: 0.5, pos, rate: 0.8 + Math.random() * 0.4 }); } });
    events.on('dash', (p) => { audio.play('whoosh', { vol: 0.9, rate: 1 + Math.random() * 0.15 }); fx.burst('sparkle', p.clone().setY(p.y + 0.3), 14, { speed: 2.4 }); fx.burst('dust', p, 6, { speed: 1.5 }); });
    events.on('befriend', ({ pos }) => { audio.happy(); audio.bell(4); fx.burst('heart', pos.clone().setY(pos.y + 0.8), 8, { speed: 0.6, up: 1 }); });
    events.on('chased', (t) => hud.toast(`🐕 The ${t.pack ? t.name : t.alphaName} are after you — run, or offer a bone (G)!`, 2.6));
    events.on('trafficImpact', ({ pos, power }) => {
      fx.burst('dust', pos, 5 + Math.round(power * 5), { size: 0.1, speed: 0.5 + power, up: 0.3, life: 0.6 });
      if (power > 0.4) fx.burst('sparkle', pos, 4, { colors: ['#ffe6a0', '#fff6db'], size: 0.06, speed: 1, life: 0.4 });
    });
    events.on('trafficBrush', ({ pos, dx, dz, power, reach }) => this.breakables.knock(pos, dx, dz, power, reach, true));
    // the last place discovered is where you wake up after fainting
    const prev = hud.onDiscover;
    hud.onDiscover = (p, first) => { prev?.(p, first); if (p.at && (p.kind === 'landmark' || p.kind === 'area' || first)) this.lastSafe = { ...p.at, name: p.title }; };
  }

  defensiveRoar(origin){return this.threats.roar(origin);}

  renderHearts() {
    const el = $('#hearts'); if (!el) return;
    const h = this.health, prev = this._shown ?? h.hearts;
    el.innerHTML = '';
    for (let i = 0; i < h.max; i++) { const s = document.createElement('span'); s.textContent = i < h.hearts ? '❤️' : '🤍'; if (i >= h.hearts) s.className = 'empty'; if (h.hearts > prev && i === h.hearts - 1) s.classList.add('pop'); el.append(s); }
    if (h.hearts < prev) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
    this._shown = h.hearts;
  }

  async #faint() {
    const { pup, audio, app } = this, f = $('#faint');
    pup.control = false; pup.startPose('Lie', 1e9); audio.whimper();
    const where = this.lastSafe || { ...app.world.starts[app.at] && { x: app.world.starts[app.at][0], z: app.world.starts[app.at][1] }, name: app.at };
    f.querySelector('.t1').textContent = 'You fainted…'; f.querySelector('.t2').textContent = `waking up at ${where.name || 'a safe spot'}`;
    f.classList.add('on');
    await new Promise((r) => setTimeout(r, 2600));
    await app.respawnAt(where.x ?? pup.pos.x, where.z ?? pup.pos.z);
    this.health.revive(); pup.cancelPose(); pup.control = true;
    f.classList.remove('on');
    this.hud.toast('💛 Back on your paws. Hearts restored.', 2.2);
  }

  /** Things E can do right here (besides picking up): ring a temple bell, rest on a chautari, drink at the water. */
  #spot() {
    const pos = this.pup.pos, w = this.world;
    for (const v of w.gazetteer.vets) if (Math.hypot(v.x - pos.x, v.z - pos.z) < 28) return { kind: 'vet', v };
    for (const l of w.landmarks.all()) if (l.model && l.model !== 'tower' && Math.hypot(l.x - pos.x, l.z - pos.z) < l.size * 0.62 + 2.5) return { kind: 'bell', l };
    for (const t of w.streamer.ready()) for (const [name, x, z] of t.data.names) if (name === 'Chautari' && Math.hypot(x - pos.x, z - pos.z) < 3.6) return { kind: 'rest' };
    for (let a = 0; a < 6; a++) { const x = pos.x + Math.cos(a) * 1.4, z = pos.z + Math.sin(a) * 1.4; if (w.waterAt(x, z) !== null && !this.pup.swimming) return { kind: 'drink', x, z }; }
    return null;
  }

  /** E: pick up / dig, or use the spot you're at. */
  interact() {
    const got = this.pickups.interact(this.pup.pos); if (got) return got;
    const home=this.rooftops.interact(this.pup);if(home){this.hud.toast(home,3.5);return{text:home};}
    const wonder=this.exploration.interact(this.pup);if(wonder){this.hud.toast(wonder,3.5);return{text:wonder};}
    const street = this.app.interactStreet(); if (street) return street;
    const play = this.breakables.interact(this.pup);
    if (play) { this.hud.toast(play.text, 2.8); this.audio.play('dig', { vol: 0.35, rate: 1.15 }); return play; }
    const s = this.#spot(), { pup, hud, audio, fx, health } = this, now = performance.now() / 1000;
    if (!s) return null;
    if (s.kind === 'vet') {
      health.revive(); pup.startPose('Sit', 3); audio.happy(); fx.burst('heart', pup.pos.clone().setY(pup.pos.y + 0.6), 10);
      hud.toast(`✚ ${s.v.name}: a gentle check-up and a treat. Fully healed!`, 3); this.bag.add('biscuit'); events.emit('vet', s.v);
      this.journal.write('✚', `The vet at ${s.v.name} was kind. My paw doesn't hurt any more.`);
    } else if (s.kind === 'bell') {
      events.emit('bell', s.l);
      audio.bell(2); fx.burst('sparkle', pup.pos.clone().setY(pup.pos.y + 1.2), 18, { up: 1.6, colors: ['#ffd166', '#fff3c4', '#ffb703'] });
      const key = s.l.name || `${s.l.x | 0},${s.l.z | 0}`; this.blessed ??= {};
      if (!this.blessed[key] || now - this.blessed[key] > 300) { this.blessed[key] = now; const healed = health.heal(1); hud.toast(`🔔 Ding… ${s.l.name || 'the temple'} blesses you${healed ? ' (+1 ❤️)' : ''}`, 2.4); this.journal.write('🔔', `Rang the bell at ${s.l.name || 'a temple'}. My ears are still ringing.`); }
      else hud.toast('🔔 Ding!', 1);
    } else if (s.kind === 'rest') {
      pup.startPose('Sit', 4); hud.toast('🌳 You rest on the chautari under the peepal tree…', 2.5);
      setTimeout(() => { if (health.heal(1)) hud.toast('💛 Rested (+1 ❤️)', 1.6); }, 3500);
    } else if (s.kind === 'drink') {
      pup.startPose('SniffIdle', 2.2); audio.play('paddle', { vol: 0.5, rate: 1.4 }); fx.ripple({ x: s.x, y: this.world.heightAt(s.x, s.z) + 0.05, z: s.z }, 0.8);
      if (!this._drinkT || now - this._drinkT > 60) { this._drinkT = now; health.heal(1); hud.toast('💧 Lap lap lap… refreshing (+1 ❤️)', 2); } else hud.toast('💧 Lap lap…', 1.2);
    }
    return s;
  }

  /** G: offer something to whoever is close. */
  give() {
    const { pup, bag, hud } = this, pos = pup.pos;
    const msg = this.territories.offer(pos, bag);
    if (msg) { hud.toast(msg, 3); return; }
    const stray = this.npcs.strays.find((s) => !s.terr && s.root.position.distanceTo(pos) < 2.6);
    if (stray) {
      const item = bag.count('bone') ? 'bone' : bag.count('biscuit') ? 'biscuit' : null;
      if (!item) { hud.toast('Nothing tasty to share', 1.4); return; }
      bag.remove(item); stray.state = 'play'; stray.stateT = 12; stray.pose = 'Wiggle'; stray.poseT = 2;
      this.fx.burst('heart', stray.root.position.clone().setY(stray.root.position.y + 0.7), 5); this.audio.happy();
      hud.toast(`${ITEMS[item].icon} You shared a ${ITEMS[item].name}. New best friend!`, 2.2); return;
    }
    const person = this.npcs.people.find((p) => p.pos.distanceTo(pos) < 2.4);
    if (person) {
      if (bag.count('chappal')) { bag.remove('chappal'); events.emit('give', { item: 'chappal', to: person }); this.bubbles.say(person, 'Mero chappal! Dhanyabad!'); this.pickups.drop(Math.random() < 0.5 ? 'momo' : 'biscuit', person.pos); person.state = 'feed'; person.stateT = 1.6; return; }
      if (bag.count('coin') && (person.role === 'vendor' || person.role === 'shopkeeper')) { bag.remove('coin'); events.emit('give', { item: 'coin', to: person }); this.bubbles.say(person, 'Le, ek plate momo!'); this.pickups.drop('momo', person.pos); return; }
      this.bubbles.say(person, 'Hehe, ramro kukur!'); return;
    }
    hud.toast('Get close to a dog or a person to give something (G)', 1.8);
  }

  /** Use an item from the bag. */
  use(id) {
    const def = ITEMS[id], { pup, bag, hud, health, fx, audio } = this;
    if (def.heal) {
      if (!health.heal(def.heal)) { hud.toast('Your hearts are already full 💛', 1.4); return; }
      bag.remove(id); audio.happy(); fx.burst('heart', pup.pos.clone().setY(pup.pos.y + 0.5), 6); hud.toast(`${def.icon} Yum! +${def.heal} ❤️`, 1.6);
    } else if (def.throw) {
      bag.remove(id); const f = pup.forward(); this.pickups.drop(id, pup.pos.clone().add(f.multiplyScalar(6)));
      for (const s of this.npcs.strays) if (s.root.position.distanceTo(pup.pos) < 18 && (!s.terr || s.tstate === 'friend')) { s.state = 'play'; s.stateT = 10; s.greeted = true; }
      hud.toast(`${def.icon} Fetch!`, 1.2);
    } else if (def.wear) {
      if (pup.dog.tihar) { hud.toast('You already wear a mala 🌼', 1.4); return; }
      bag.remove(id); pup.dog.setTihar(true); audio.bell(5); hud.toast('🌼 You look festive! Kukur Tihar blessings.', 2.2);
    } else if (def.ring) {
      audio.bell(3); let n = 0;
      for (const s of this.npcs.strays) if (s.root.position.distanceTo(pup.pos) < 45 && (!s.terr || s.tstate === 'friend')) { s.greeted = false; s.state = 'wander'; n++; }
      hud.toast(n ? `🔔 Ding! ${n} friendly dog${n > 1 ? 's' : ''} come running` : '🔔 Ding! (no friendly dogs nearby)', 2);
    } else hud.toast(`${def.icon} Nothing to do with it — maybe give it to someone (G)?`, 2);
  }
  drop(id) { if (this.bag.remove(id)) this.pickups.drop(id, this.pup.pos.clone().add(this.pup.forward().multiplyScalar(0.8))); }

  /** Extra scent sources for the sniff view. */
  scents(pos) { return [...this.pickups.scents(pos), ...this.territories.scents(pos),...this.rooftops.scents(pos),...this.exploration.scents(pos)]; }

  /** What the context prompt should say right now. */
  prompt() {
    const pos = this.pup.pos, it = this.pickups.nearest(pos, 1.6);
    if (it) return it.hidden ? `<b>E</b> · Dig up ${ITEMS[it.id].icon}` : `<b>E</b> · Pick up ${ITEMS[it.id].icon} ${ITEMS[it.id].name}`;
    const home=this.rooftops.prompt(this.pup.pos);if(home)return `<b>E</b> · ${home}`;
    const wonder=this.exploration.prompt(pos);if(wonder)return `<b>E</b> · ${wonder}`;
    const street = this.app.streetPrompt(); if (street) return `<b>E</b> · ${street}`;
    const play = this.breakables.nearest(pos);
    if (play) return `<b>E</b> · ${BREAKABLES.kinds[play.kind].label}`;
    const dog = this.territories.nearestDog(pos, 3);
    if (dog && !dog.terr.friendly) return this.bag.count('bone') ? `<b>G</b> · Offer a bone to ${dog.alpha ? dog.name || 'the alpha' : 'the pack'}` : 'You need a 🦴 bone for this pack';
    const s = this.#spot();
    if (s?.kind === 'vet') return `<b>E</b> · Visit the vet ✚ ${s.v.name}`;
    if (s) return s.kind === 'bell' ? `<b>E</b> · Ring the bell at ${s.l.name || 'the temple'} 🔔` : s.kind === 'rest' ? '<b>E</b> · Rest on the chautari 🌳' : '<b>E</b> · Drink 💧';
    return '';
  }

  update(dt, sniff, time, input) {
    const pup = this.pup;
    this.scan.update(dt, !!input?.down('bark') && pup.control, pup);
    // running through the rain: every few strides is a puddle splash
    const rain = this.app.world.weather.params.rain;
    if (rain > 0.3 && pup.grounded && !pup.swimming && pup.speed > 2.4 && (this._puddleT = (this._puddleT ?? 0) - dt) <= 0) {
      this._puddleT = 0.45 + Math.random() * 0.4;
      this.fx.burst('dust', pup.pos.clone().setY(pup.pos.y + 0.05), 7, { colors: ['#d8f0ff', '#9fd2f0', '#ffffff'], speed: 1.8, up: 1.4 });
      this.audio.play('splash', { vol: 0.18, rate: 1.5 + Math.random() * 0.4, pos: pup.pos }); events.emit('puddle', pup.pos);
    }
    this.health.update(dt);
    if (pup.dashing) {
      const f = pup.forward();
      this.breakables.knock(pup.pos, f.x, f.z, DASH.speed, DASH.reach);
      if (Math.random() < 0.6) this.fx.burst('sparkle', pup.pos.clone().setY(pup.pos.y + 0.25), 2, { speed: 0.6, up: 0.6 });
      for (const p of this.npcs.people) if (!p._dashed && p.pos.distanceTo(pup.pos) < 1.4) { p._dashed = true; p.startle(this.npcs.ctx, 0.35); setTimeout(() => (p._dashed = false), 3000); }
      if (this.npcs.pigeons.scare(pup.pos, 4)) this.audio.flutter();
    }
    this.pickups.update(dt, pup, sniff);
    this.breakables.update(dt, pup);
    this.territories.update(dt, pup, sniff, time);
    this.threats.update(dt,pup,this.scan);
    this.rooftops.update(pup);
    this.exploration.update(dt,pup);
    this.missions.update(dt, pup);
    if ((this._pT = (this._pT || 0) - dt) <= 0) { this._pT = 0.2; const p = this.prompt(), el = $('#prompt'); if (el.innerHTML !== p) el.innerHTML = p; }
  }
}

