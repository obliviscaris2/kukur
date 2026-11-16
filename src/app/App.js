/**
 * Application shell. Owns every system and runs the frame loop through a small state machine:
 *   loading -> menu -> (intro) -> play <-> paused        (+ travel between start locations)
 * Systems only talk to each other through this class or the event bus (core/events.js).
 */
import * as THREE from 'three';
import { WORLD, WAYFINDING, PUP, ART } from '../config/index.js';
import { settings } from '../core/settings.js';
import { events } from '../core/events.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { angDiff } from '../core/geo.js';
import { Renderer } from '../render/Renderer.js';
import { U } from '../render/toon.js';
import { World } from '../world/World.js';
import { Pup } from '../entities/pup/Pup.js';
import { PupCamera } from '../entities/pup/PupCamera.js';
import { Senses } from '../entities/pup/Senses.js';
import { NpcManager } from '../entities/npc/NpcManager.js';
import { IntroScene } from '../scenes/IntroScene.js';
import { PrologueScene } from '../scenes/PrologueScene.js';
import { Hud } from '../ui/Hud.js';
import { Menu } from '../ui/Menu.js';
import { Minimap } from '../ui/Minimap.js';
import { BigMap } from '../ui/BigMap.js';
import { Bubbles } from '../ui/Bubbles.js';
import { Fx } from '../render/Fx.js';
import { Critters } from '../world/effects/Critters.js';
import { Traffic } from '../entities/traffic/Traffic.js';
import { Gameplay } from '../gameplay/Gameplay.js';
import { Grimoire } from '../ui/Grimoire.js';
import { $, show } from '../ui/dom.js';

const progress = (text, k) => { $('#loadText').textContent = text; $('#loadFill').style.width = Math.round(k * 100) + '%'; };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class App {
  state = 'loading';
  time = 0;

  async boot() {
    progress('Waking up Kathmandu…', 0.02);
    this.renderer = new Renderer($('#game'));
    this.camera = this.renderer.camera;
    this.scene = new THREE.Scene();this.scene.matrixAutoUpdate=false;
    this.input = new Input($('#game'));
    this.audio = new Audio();
    this.world = new World(this.scene, this.renderer.quality);
    await this.world.init((t, k) => progress(t, 0.05 + k * 0.2));
    this.world.festival.setAudio(this.audio);
    progress('Teaching the pup to walk…', 0.25); await frame();
    this.bubbles = new Bubbles($('#bubbles'), this.camera);
    this.fx = new Fx(this.scene); this.critters = new Critters(this.scene);
    this.traffic = new Traffic(this.scene, this.world, this.renderer.quality, this.audio);
    this.npcs = new NpcManager(this.scene, this.world, this.renderer.quality, { say: (w, t) => this.bubbles.say(w, t) }, this.audio);
    this.world.crowd = () => this.npcs.people; this.world.say = (w, t) => this.bubbles.say(w, t);   // festival greetings
    await this.npcs.init();
    this.pup = new Pup(); await this.pup.load(this.scene);
    this.cam = new PupCamera(this.camera);
    this.senses = new Senses(this.scene);
    this.hud = new Hud();
    this.minimap = new Minimap($('#minimap'), this.world.streamer);
    this.waypoint = null;
    try { this.pins = JSON.parse(localStorage.getItem('kukur.pins.v1') || '[]'); } catch { this.pins = []; }
    this.bigmap = new BigMap($('#bigmap'), { onTravel: (name) => this.travel(name), onWaypoint: (wp) => this.setWaypoint(wp) });
    this.hud.onDiscover = (p, first) => this.audio.discover(first);
    this.game = new Gameplay({ scene: this.scene, world: this.world, npcs: this.npcs, traffic: this.traffic, pup: this.pup, cam: this.cam, fx: this.fx, audio: this.audio, hud: this.hud, bubbles: this.bubbles, app: this });
    this.world.discoverySources=()=>this.game.exploration.sites;
    this.bag = new Grimoire($('#bag'), { onUse: (id) => this.game.use(id), onGive: (id) => { this.#toggleBag(false); this.game.give(id); }, onDrop: (id) => this.game.drop(id) },
      { bag: this.game.bag, journal: this.game.journal, missions: this.game.missions, territories: this.game.territories, seenPlaces: () => this.hud.seen });
    this.menu = new Menu({ onPlay: (n) => this.play(n), onResume: () => this.resume(), onQuit: () => this.quitToMenu(), onMap: () => this.#openMap() }, this.world.starts);
    this.#wireEvents();
    const start = this.world.starts[settings.get('startAt')] ? settings.get('startAt') : WORLD.defaultStart;
    await this.placeAt(start, (k) => progress('Painting houses & planting trees…', 0.3 + k * 0.7));
    progress('Lighting the first street…', 1);
    this.world.update(.016, this.pup.pos, this.camera, this.time);
    this.pup.animate(.016, this.world);
    await this.renderer.prepare(this.scene);
    show($('#loading'), false);
    this.state = 'menu'; this.menu.open('main');
    this.clock = new THREE.Clock();
    window.__app = this;
    this.#loop();
    if (new URLSearchParams(location.search).has('autostart')) this.play(start);
  }

  #wireEvents() {
    events.on('streetTreat', ({ pos }) => { this.npcs.treats.drop(pos.x, pos.z, pos.y + 0.8); this.audio.happy(); });
    events.on('bark', () => { this.audio.bark(true); this.bubbles.say(this.pup, ['Woof!', 'Bhau!', 'Arf!', 'Wuff!'][Math.floor(Math.random() * 4)], 1.2); });
    events.on('hop2', (p) => { this.audio.play('whoosh', { vol: 0.4, rate: 1.5 }); this.fx.burst('sparkle', p.clone().setY(p.y + 0.15), 16, { speed: 1.6, up: 0.4, colors: ['#ffe066', '#9bf6ff', '#ffadde', '#caffbf'] }); });
    events.on('climb', (p) => { this.audio.thump(260, 0.06); this.fx.burst('dust', p.clone().setY(p.y + 0.3), 4, { speed: 0.6 }); });
    events.on('scramble', (p) => { this.audio.play('clonk', { vol: 0.35, rate: 1.6 }); this.fx.burst('dust', p.clone().setY(p.y + 0.4), 6, { speed: 1 }); });
    events.on('hop', (p) => { this.audio.hop(); if (p) { this.fx.burst('dust', p, 5, { speed: 0.9 }); this.fx.burst('sparkle', p.clone().setY(p.y + 0.2), 6, { up: 1.2, speed: 0.8 }); } });
    events.on('land', (p, k = 0.5) => { this.audio.land(k); this.cam.bump(k * 0.7); if (p) { this.fx.burst('dust', p, 4 + Math.round(k * 8), { speed: 0.5 + k, size: 0.11, up: 0.3 }); if (k > 0.5) this.fx.burst('sparkle', p, 4, { size: 0.065, life: 0.55, up: 0.8 }); } });
    events.on('splash', (p, k = 0.5) => { this.audio.splash(k); this.fx.burst('drop', p.clone().setY(p.y + 0.1), 8 + Math.round(k * 22), { speed: 1 + k * 2, up: 2 + k * 2 }); this.fx.ripple(p, 1.2 + k); this.fx.ripple(p, 0.6); });
    events.on('shake', () => this.audio.shake());
    events.on('howl', () => { this.audio.howl(true); this.bubbles.say(this.pup, 'Aoooooo~', 2); });
    events.on('petted', () => {
      this.pets = (this.pets || 0) + 1;
      if (this.pets === 3 && !this.pup.dog.tihar) { this.pup.dog.setTihar(true); this.hud.toast('🌼 Someone gave you a marigold mala and a red tika — Kukur Tihar blessings!', 4); this.audio.bell(5); }
      this.audio.happy(); this.fx.burst('heart', this.pup.pos.clone().setY(this.pup.pos.y + 0.55), 5, { speed: 0.4, up: 0.9 }); });
    events.on('yelp', () => { this.audio.whimper?.(); this.bubbles.say(this.pup, ['Kaai!', 'Yelp!', 'Kaai kaai!'][Math.floor(Math.random() * 3)], 1.4); });
    events.on('treat', (who) => {
      if (who === this.pup) { this.pup.eat(); this.audio.happy(); this.hud.toast('🍪 Yum! A biscuit from a kind stranger', 2.5); this.fx.burst('sparkle', this.pup.pos.clone().setY(this.pup.pos.y + 0.3), 14); this.fx.burst('heart', this.pup.pos.clone().setY(this.pup.pos.y + 0.5), 3); }
      else this.bubbles.say(who, 'Nom!', 1);
    });
    events.on('lightning', () => setTimeout(() => this.audio.thunder(), 300 + Math.random() * 1500));
    events.on('weather', (w) => this.state === 'play' && this.hud.toast(`${this.world.weather.label.icon} ${this.world.weather.label.label}`));
    // clicking only skips the short aerial intro (never the story), and never with the same click that pressed Play
    addEventListener('click', () => { if (this.state === 'intro') this.intro?.requestSkip('click'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.pause(); });
  }

  /** Move the pup to a named start location (waits for the map around it to stream in). */
  async placeAt(name, onProgress) {
    const [x, z] = this.world.starts[name];
    this.at = name;
    await this.world.prepare(x, z, onProgress);
    let px = x, pz = z;
    outer: for (let r = 0; r < 90; r += 1.5) for (let a = 0; a < 8; a++) {
      const tx = x + Math.cos(a * 0.785) * r, tz = z + Math.sin(a * 0.785) * r;
      if (this.#goodSpawn(tx, tz)) { px = tx; pz = tz; break outer; }
    }
    this.pup.placeAt(px, pz, this.#openHeading(px, pz), this.world);
    this.cam.placeBehind(this.pup, this.world.physics);
    this.npcs.clear(); this.traffic?.clear();
    if (this.clock) {
      this.world.update(.016, this.pup.pos, this.camera, this.time);
      await this.renderer.prepare(this.scene);
    }
  }

  /** Flat open ground: not in a wall, not in water, not on/against a temple plinth (the camera hates those). */
  #goodSpawn(x, z) {
    const P = this.world.physics, g = P.heightAt(x, z), t = this.world.terrain(x, z);
    if (!P.isFree(x, z, 0.6) || this.world.waterAt(x, z) !== null || Math.abs(g - t) > 0.05) return false;
    for (let a = 0; a < 8; a++) if (P.heightAt(x + Math.cos(a * 0.785) * 1.5, z + Math.sin(a * 0.785) * 1.5) - g > 0.3) return false;
    // must be ON a street (not a courtyard between houses)
    for (const tile of this.world.streamer.ready()) for (const n of tile.data.navs) {
      if (n.w < 3) continue;
      for (let i = 2; i < n.pts.length; i += 2) {
        const ax = n.pts[i - 2], az = n.pts[i - 1], dx = n.pts[i] - ax, dz = n.pts[i + 1] - az, L = dx * dx + dz * dz || 1e-9;
        const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
        if (Math.hypot(x - ax - dx * k, z - az - dz * k) < n.w / 2) return true;
      }
    }
    return false;
  }

  /** Heading with the most open view ahead and room for the camera behind (so we never spawn facing a wall). */
  #openHeading(x, z) {
    const ph = this.world.physics, y = this.world.heightAt(x, z) + 1.2, a = new THREE.Vector3(x, y, z), b = new THREE.Vector3();
    const free = (h, d) => ph.rayFrac(a, b.set(x + Math.sin(h) * d, y, z + Math.cos(h) * d)) * d;
    let best = Math.PI, score = -1;
    for (let i = 0; i < 16; i++) {
      const h = (i / 16) * Math.PI * 2, bx = x - Math.sin(h) * 3, bz = z - Math.cos(h) * 3;
      const s = free(h, 40) + Math.min(free(h + Math.PI, 7), 7) * 4 - (ph.groundAt(bx, bz, y + 3) > y - 0.7 ? 40 : 0);   // nothing raised where the camera sits
      if (s > score) { score = s; best = h; }
    }
    return best;
  }

  /** Respawn the pup near (x, z) — used after fainting. */
  async respawnAt(x, z) {
    await this.world.streamer.ensureAround(x, z, 160);
    let px = x, pz = z;
    outer: for (let r = 0; r < 90; r += 1.5) for (let a = 0; a < 8; a++) {
      const tx = x + Math.cos(a * 0.785) * r, tz = z + Math.sin(a * 0.785) * r;
      if (this.#goodSpawn(tx, tz)) { px = tx; pz = tz; break outer; }
    }
    this.pup.placeAt(px, pz, this.#openHeading(px, pz), this.world); this.cam.placeBehind(this.pup, this.world.physics);
  }
  #toggleBag(on, tab) { this.bag.toggle(on, tab); if (this.bag.open) this.input.unlock(); else this.input.lock(); }

  async play(name) {
    this.menu.close();
    this.audio.init(); this.input.wantLock = true; this.input.lock();
    show($('#touch'), this.input.isTouch);
    if (name !== this.at) { await this.#fade(1); await this.placeAt(name); await this.#fade(0); }
    this.hud.visible(true);
    const q = new URLSearchParams(location.search), prologue = q.has('prologue') || (!settings.get('prologueDone') && !q.has('noprologue'));   // ?prologue replays the story
    if (prologue || !settings.get('skipIntro')) {
      this.state = 'intro'; this.intro = prologue ? new PrologueScene(this) : new IntroScene(this);
      $('#skip').textContent = prologue ? 'Esc twice to skip the story' : 'Space / click to skip'; show($('#skip'), true);
      await this.intro.run();
      show($('#skip'), false);
    }
    this.cam.clearShot(); this.pup.control = true; this.pup.cancelPose();
    this.state = 'play';
  }
  pause() { if (this.state !== 'play') return; this.state = 'paused'; this.input.unlock(); this.menu.open('pause'); }
  resume() { this.menu.close(); this.bigmap.toggle(false); this.state = 'play'; this.input.lock(); }
  quitToMenu() { this.menu.open('main'); this.hud.visible(false); this.state = 'menu'; this.input.unlock(); }
  async travel(name) {
    this.menu.close(); await this.#fade(1);
    await this.placeAt(name);
    await this.#fade(0);
    this.state = 'play'; this.input.lock();
  }
  #mapCtx() { return { pup: this.pup, starts: this.world.starts, gazetteer: this.world.gazetteer, waypoint: this.waypoint, pins: this.pins, onPins: (p) => { try { localStorage.setItem('kukur.pins.v1', JSON.stringify(p)); } catch { /* private mode */ } } }; }
  #openMap() { this.bigmap.toggle(true, this.#mapCtx()); }
  /** Waypoint shown on the compass, the map and as a column of light in the world. null clears it. */
  setWaypoint(wp) { this.waypoint = wp; if (wp && !wp.prologue) this.hud.toast(`🐾 Waypoint: ${wp.name}`); }

  #fade(to) { const f = $('#fade'); f.style.opacity = to; return new Promise((r) => setTimeout(r, 650)); }

  #loop() {
    requestAnimationFrame(() => this.#loop());
    const frameDt = this.clock.getDelta(), dt = Math.min(0.05, frameDt);
    this.time += dt; U.uTime.value = this.time;
    const inp = this.input, pup = this.pup, world = this.world;
    if (this.state === 'play') this.#playInput();
    else if (this.state === 'intro') { for (const k of ['jump', 'confirm', 'pause']) if (inp.hitAlways(k)) this.intro.requestSkip(k); }
    else if (this.state === 'paused' && inp.hitAlways('pause')) this.resume();
    const live = this.state !== 'paused' && !this.bigmap.open && !this.bag.open;
    this._stillFor = live ? 0 : (this._stillFor || 0) + frameDt;
    if (live) {
      world.physics.refreshBodies();
      if (this.state === 'menu') { // slow orbit around the sleeping pup behind the menu
        const a = this.time * 0.05, p = pup.pos;
        this.cam.setShot(new THREE.Vector3(p.x + Math.cos(a) * 34, p.y + 26, p.z + Math.sin(a) * 34), p.clone().add(new THREE.Vector3(0, 4, 0)));
        if (!pup.pose) pup.startPose('Lie', 1e9);
      }
      if ((this.state === 'intro' || this.state === 'play') && this.intro) this.intro.update(dt);   // story cards keep timing while you play the prologue
      if (this.state === 'play' || this.state === 'intro' || this.state === 'menu') pup.update(dt, this.state === 'play' ? inp : idleInput, this.cam, world, U.uWet.value);
      U.uPup.value.set(pup.pos.x,pup.pos.y,pup.pos.z,pup.speed);
      const near = this.npcs.nearest(pup.pos, 8);
      pup.look = near ? { yaw: angDiff(pup.heading, Math.atan2(near.pos.x - pup.pos.x, near.pos.z - pup.pos.z)), pitch: near.headPos ? 0.25 : 0 } : null;
      const sky = world.update(dt, pup.pos, this.camera, this.time, this.state === 'play' ? this.waypoint : null, this.pins);
      const V=ART.vignette,vig=V.base+sky.night*V.night+world.weather.params.grey*V.storm+(pup.sniffing?V.sniff:0);
      if (Math.abs(vig - (this._vig ?? 0)) > 0.01) { this._vig = vig; $('#vignette').style.opacity = vig.toFixed(2); }
      if (this.waypoint && !this.waypoint.prologue && Math.hypot(this.waypoint.x - pup.pos.x, this.waypoint.z - pup.pos.z) < WAYFINDING.arriveRadius) {
        this.hud.toast(`🐾 You made it to ${this.waypoint.name}!`, 3); this.audio.happy(); this.waypoint = null;
      }
      const tile = world.streamer.tiles.get(`${Math.floor(pup.pos.x / 256)}_${Math.floor(pup.pos.z / 256)}`);
      this.#juice(dt, sky);
      if (this.state === 'play') this.game.update(dt, this.senses.sniff, this.time, this.input);
      world.physics.refreshBodies();
      this.traffic.calm = this.state !== 'play' || !!this.storyCalm;
      this.traffic.update(dt, pup, this.camera, [...this.npcs.people,...this.npcs.strays], this.npcs.street.signals());
      world.physics.refreshBodies();
      this.npcs.update(dt, pup, { rain: world.weather.params.rain, night: sky.night, density: tile?.data?.density ?? 0.4, camera: this.camera, calm: this.state!=='play'||!!this.storyCalm, actorFade: !this.storyCalm });
      world.physics.refreshBodies();
      this.senses.update(dt, pup, this.state === 'play' && pup.sniffing, { landmarks: world.landmarks, npcs: this.npcs, extra: (p) => this.game.scents(p) });
      this.audio.listen(this.camera);
      this.audio.update(dt, { x: pup.pos.x, z: pup.pos.z, hour: world.weather.hour, swimming: pup.swimming, speed: Math.min(1, pup.speed / 2), panting: pup.panting, nearStupa: [...world.landmarks.all()].some((l) => /stupa/.test(l.model || '') && Math.hypot(l.x - pup.pos.x, l.z - pup.pos.z) < l.size * 0.6 + 45), rain: world.weather.params.rain, wind: world.weather.wind.strength * (0.5 + world.weather.wind.gust(pup.pos.x, pup.pos.z)), cityDensity: tile?.data?.density ?? 0.3, night: sky.night > 0.5, nearTemple: world.landmarks.scent.some((s) => s.distanceToSquared(pup.pos) < 3600) });
    }
    this.cam.update(dt, pup, this.state === 'play' ? inp : idleInput, world.physics);
    this.hud.quiet = this.state !== 'play' || !!this.storyCalm;   // no discovery banners mid-story: the first one greets you when you wake
    if (this.state === 'play' || this.state === 'intro') { this.hud.update(dt, { pup, weather: world.weather, renderer: this.renderer, world, camera: this.camera, waypoint: this.waypoint, pins: this.pins, time: this.time, frameDt }); this.minimap.update(dt, pup, this.cam); }
    this.bubbles.update(dt);
    if (live) this.renderer.adapt(frameDt);
    inp.endFrame();
    // Let the camera settle, then keep the last canvas frame while paused. UI still responds every frame.
    const renderNow = live || this._stillFor < .7 || performance.now() - (this._stillRenderAt || 0) > 500;
    if (renderNow) { this.renderer.render(this.scene); this._stillRenderAt = performance.now(); }
  }

  /** Continuous little effects: zoomies fairy-dust trail, footstep puffs, swimming ripples, critters. */
  #juice(dt, sky) {
    const pup = this.pup, w = this.world;
    this._fxT = (this._fxT || 0) - dt;
    if (this._fxT <= 0) {
      this._fxT = 0.07;
      if (pup.swimming) {
        if ((this._ripT = (this._ripT || 0) - 0.07) <= 0) { this._ripT = pup.speed > 0.3 ? 0.3 : 0.9; this.fx.ripple(pup.pos, 0.7 + pup.speed * 0.3); }
        if (pup.speed > 0.4 && Math.random() < 0.5) this.fx.burst('drop', pup.pos.clone().add(pup.forward().multiplyScalar(0.3)).setY(pup.pos.y + 0.2), 2, { speed: 0.6, up: 1.4 });
      }
    }
    if (pup.grounded && !pup.swimming && !pup.impact.active && pup.gaitSpeed > 0.4) {
      const f = pup.forward(), speed = pup.gaitSpeed;
      this._pawDistance = (this._pawDistance || 0) + speed * dt;
      this._starT = (this._starT || 0) - dt; this._skidT = (this._skidT || 0) - dt;
      if (this._pawDistance >= PUP.effects.stepDistance) {
        this._pawDistance %= PUP.effects.stepDistance; this._pawSide = -(this._pawSide || 1);
        const p = pup.pos.clone(); p.x += f.z * this._pawSide * 0.07 - f.x * 0.1; p.z -= f.x * this._pawSide * 0.07 + f.z * 0.1;
        this.fx.burst('dust', p, speed > 3 ? 2 : 1, { size: 0.055, speed: 0.2, up: 0.15, life: 0.35, spread: 0.035 });
      }
      if (speed > PUP.effects.starSpeed && this._starT <= 0) {
        this._starT = PUP.effects.starEvery;
        this.fx.burst('sparkle', pup.pos.clone().addScaledVector(f, -0.22), 1, { size: 0.055, speed: 0.2, up: 0.35, life: 0.5 });
      }
      if (speed * Math.abs(pup.turnRate) > 5 && this._skidT <= 0) {
        this._skidT = PUP.effects.skidEvery;
        this.fx.burst('dust', pup.pos, 2, { size: 0.09, speed: 0.6, up: 0.12, life: 0.4, vx: -f.x * 0.3, vz: -f.z * 0.3 });
      }
    } else this._pawDistance = 0;
    this.fx.update(dt);
    this.critters.update(dt, { focus: pup.pos, pup, day: 1 - sky.night, rain: w.weather.params.rain, greenery: w.weather.greenery, heightAt: (x, z) => w.heightAt(x, z), waterNear: (x, z, r) => w.waterNear(x, z, r) });
  }

  #playInput() {
    const inp = this.input, w = this.world;
    if (this.bag.open) { if (inp.hitAlways('pause') || inp.hitAlways('bag') || inp.hitAlways('journal')) this.#toggleBag(false); return; }
    if (inp.hitAlways('pause') && this.intro?.storyRunning && !this.bigmap.open) { this.intro.requestSkip('pause'); return; }   // during the prologue's playable parts Esc twice skips
    if (inp.hitAlways('pause')) { if (this.bigmap.open) { this.bigmap.toggle(false); inp.lock(); } else this.pause(); return; }
    if (inp.hit('bag')) { this.#toggleBag(true, 'bag'); return; }
    if (inp.hit('journal')) { this.#toggleBag(true, 'missions'); return; }
    if (inp.hit('interact')) this.game.interact();
    if (inp.hit('give')) this.game.give();
    if (inp.hit('map')) { const open = !this.bigmap.open; this.bigmap.toggle(open, this.#mapCtx()); if (open) inp.unlock(); else inp.lock(); }
    if (this.bigmap.open) return;
    if (inp.hit('bark')) this.pup.bark();
    if (inp.hit('weather')) { const l = w.weather.cycle(); this.hud.toast(`${l.icon} ${l.label}`); }
    if (inp.hit('time')) w.weather.hour = (w.weather.hour + 1) % 24;
    if (inp.hit('dogEyes')) this.hud.toast(this.senses.toggleEyes() ? '👁 Dog eyes: blue & yellow' : '👁 Human colours');
    if (inp.hit('help')) this.hud.toggleHelp();
    if (inp.hit('debug')) this.hud.toggleFps();
  }

  streetPrompt() { return this.npcs.street.prompt(this.pup.pos) || (this.traffic.nearestRider(this.pup.pos) ? 'Greet the waiting rider' : ''); }
  interactStreet() {
    const text = this.npcs.street.interact(this.pup) || this.traffic.interact(this.pup);
    if (text) { this.hud.toast(text, 3.5); return { text }; }
    return null;
  }
}

/** Input stand-in while the player is not in control (menu, intro). */
const idleInput = { axis: () => ({ x: 0, y: 0, analog: false }), down: () => false, hit: () => false, run: false, walk: false, consumeLook: () => [0, 0, 0] };
