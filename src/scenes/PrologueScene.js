/**
 * The prologue (first play; settings.prologueDone — ?prologue replays it).
 *   1. Kukur Tihar night (playable): Aama calls you across a ring of diyo lamps and marigold petals. A didi bows,
 *      gives you tika and a mala and lays out a feast. You eat, then curl up between Aama and Bhai (E).
 *   2. The morning (playable nightmare): haze, muffled sound, a heartbeat. A white van on the nearest road; two
 *      catchers walk over and drag Aama and Bhai into it. Chase it. You can't catch it.
 *   3. Waking alone back in the square; the main mission "Where Is Aama?" starts tracking.
 * Built on IntroScene's helpers (wait / shot / card). Esc twice skips (jumps straight to the end state).
 * Scripted actors use Stray.walkTo/stay and Person.walkTo. Nobody gets hurt while it runs (app.storyCalm).
 */
import * as THREE from 'three';
import { IntroScene } from './IntroScene.js';
import { Stray } from '../entities/npc/Stray.js';
import { Person } from '../entities/npc/Person.js';
import { events } from '../core/events.js';
import { settings } from '../core/settings.js';
import { rng } from '../core/rng.js';
import { angDiff } from '../core/geo.js';
import { toon } from '../render/toon.js';
import { $ } from '../ui/dom.js';
import { TRAFFIC } from '../config/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flatHeading = (v) => Math.atan2(v.x, v.z);

function van() {
  const g = new THREE.Group(), m = (c) => new THREE.MeshLambertMaterial({ color: c });
  const dimensions = TRAFFIC.storyVan;
  const body = new THREE.Mesh(new THREE.BoxGeometry(dimensions.width, dimensions.height - 0.3, dimensions.length), m('#e8e8e2')); body.position.y = (dimensions.height + 0.3) * 0.5; g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.55, 1.2), m('#2a3440')); glass.position.set(0, 1.65, 1.6); g.add(glass);
  const cage = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.9, 2.4), m('#55606a')); cage.position.set(0, 1.4, -0.9); g.add(cage);
  for (const [x, z] of [[-0.85, 1.5], [0.85, 1.5], [-0.85, -1.5], [0.85, -1.5]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12).rotateZ(Math.PI / 2), m('#1b1b1b')); w.position.set(x, 0.34, z); g.add(w); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A ring of clay diyo lamps with glowing flames, and marigold petals strewn inside it (3 draw calls). */
function tiharDecor(c, heightAt) {
  const g = new THREE.Group(), N = 16, R = 3.2, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
  const cups = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.05, 0.06, 8), toon('#b0542a', { key: 'diyo' }), N), fp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R, y = heightAt(x, z);
    cups.setMatrixAt(i, M.makeTranslation(x, y + 0.03, z)); fp.set([x, y + 0.14, z], i * 3);
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x2 = cv.getContext('2d'), grd = x2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.25, 'rgba(255,190,90,0.9)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
  x2.fillStyle = grd; x2.fillRect(0, 0, 64, 64);
  const flames = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(fp, 3)),
    new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), color: new THREE.Color(2.6, 1.5, 0.6), size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const PN = 110, r = rng(77), petals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.06, 6).rotateX(-Math.PI / 2), toon('#ffffff', { key: 'petal' }), PN);
  for (let i = 0; i < PN; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * (R + 0.5), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    petals.setMatrixAt(i, M.compose(P.set(x, heightAt(x, z) + 0.015, z), Q.setFromEuler(E.set(0, r() * 6.28, 0)), S.setScalar(0.7 + r() * 0.9)));
    petals.setColorAt(i, C.set(r() < 0.7 ? '#ff9a1f' : '#ffd23a'));
  }
  g.add(cups, flames, petals); g.userData.flames = flames;
  return g;
}

/** Nearest drivable road (nav width ≥ 5 m) within maxD of (x, z): the point on it, and its centreline onward. */
function road(world, x, z, maxD = 45) {
  let best = null, bd = maxD;
  for (const tile of world.streamer.ready()) for (const n of tile.data.navs) {
    if (n.w < 5) continue;
    for (let i = 2; i < n.pts.length; i += 2) {
      const ax = n.pts[i - 2], az = n.pts[i - 1], dx = n.pts[i] - ax, dz = n.pts[i + 1] - az, L = dx * dx + dz * dz || 1e-9;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), px = ax + dx * k, pz = az + dz * k, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; best = { n, i, x: px, z: pz }; }
    }
  }
  if (!best) return null;
  const { n, i } = best, start = new THREE.Vector2(best.x, best.z), fwd = [], back = [];
  for (let j = i; j < n.pts.length; j += 2) fwd.push(new THREE.Vector2(n.pts[j], n.pts[j + 1]));
  for (let j = i - 2; j >= 0; j -= 2) back.push(new THREE.Vector2(n.pts[j], n.pts[j + 1]));
  const len = (a) => a.reduce((s, q, k) => s + q.distanceTo(k ? a[k - 1] : start), 0);
  const path = (len(fwd) >= len(back) ? fwd : back).filter((q) => q.distanceTo(start) > 0.5);
  return { x: best.x, z: best.z, w: n.w, path };
}

export class PrologueScene extends IntroScene {
  /** wait until cond() is true (or skipped) — checked every frame */
  until(cond) { return new Promise((res) => { const f = () => (this.skipped || cond() ? res() : requestAnimationFrame(f)); f(); }); }
  /** big centre card + HUD objective line (+ optional waypoint) */
  goal(text, at, name) { this.card(`<span class="small">Kukur Tihar</span>${text}`, 3.2); this.objective(text); if (at) this.track(at, name); }
  track(pos, name = 'Aama') { const w = this.app.waypoint; if (w && w.prologue) { w.x = pos.x; w.z = pos.z; w.name = name; } else this.app.setWaypoint({ x: pos.x, z: pos.z, name, prologue: true }); }
  call(who, line) { const now = performance.now(); if (!this._callT || now - this._callT > 4500) { this._callT = now; this.app.bubbles.say(who, line, 2.5); } }
  objective(text) { $('#objective').innerHTML = text ? `<div class="ob-t">★ Kukur Tihar</div><div class="ob-s">${text}</div>` : ''; }
  async fade(to, ms = 900) { $('#fade').style.opacity = to; await sleep(ms); }

  async run() {
    const { pup, world, cam, npcs, audio } = this.app, scene = this.app.scene, H = (x, z) => world.heightAt(x, z);
    this.cleanup = []; this.actors = []; this.app.storyCalm = true;
    const p = pup.pos.clone(), f = pup.forward(), side = new THREE.Vector3(f.z, 0, -f.x);
    const at = (a, b) => { const v = p.clone().addScaledVector(side, a).addScaledVector(f, b); v.y = H(v.x, v.z); return v; };
    // the family's bed: a few metres ahead (spawns always face open street), on free ground
    let bed = at(0, 5);
    for (const d of [5, 4, 6, 3.5, 2.5]) { const c = at(0, d); if (world.physics.isFree(c.x, c.z, 1.2)) { bed = c; break; } }
    const r = rng(2026);
    const mkDog = async (scale, pos) => {
      const s = await Stray.create(r, { scale });
      if (this._ended) return null;
      s.dog.setTihar(true); s.owned = true; s.root.position.copy(pos); s.heading = s.root.rotation.y = flatHeading(p.clone().sub(pos)); s.stay('Sit');
      scene.add(s.root); npcs.strays.push(s); return s;
    };
    const person = (role, mood, pos, heading) => {
      if (!npcs.personGltf || this._ended) return null;
      const c = new Person(npcs.personGltf, r, { role, mood }); c.cool = c.lineT = 1e9; c.standAt(pos.x, pos.z, heading); c.root.position.y = H(pos.x, pos.z);
      scene.add(c.root); npcs.people.push(c); this.actors.push(c); return c;
    };
    this.aama = await mkDog(1.75, bed.clone().addScaledVector(side, 0.9));
    if (this.skipped) return;
    this.bhai = await mkDog(1.25, bed.clone().addScaledVector(side, -0.9));
    if (this.skipped) return;
    const didiHome = bed.clone().addScaledVector(f, 2.4).addScaledVector(side, 1.6);
    this.didi = person('devotee', 'kind', didiHome, flatHeading(bed.clone().sub(didiHome)));
    this.decor = tiharDecor(bed, H); scene.add(this.decor);
    const flicker = () => { if (this._ended) return; this.decor.userData.flames.material.size = 0.46 + Math.random() * 0.09; requestAnimationFrame(flicker); };
    flicker();

    // ---- 1. Kukur Tihar night
    world.weather.set('sunny', true); world.weather.hour = 19.2; world.weather.setDay(0);   // day 0 = Kukur Tihar: fireworks tonight
    pup.control = false; pup.heading = flatHeading(bed.clone().sub(p)); pup.startPose('Lie', 2); this.app.game.missions.paused = true;
    this.card('<span class="small">Kukur Tihar · कुकुर तिहार</span>One night a year, the whole city bows to its dogs.', 4.5);
    const mid = bed.clone().lerp(p, 0.35); mid.y += 0.4;
    await this.shot(at(5, -4).setY(p.y + 5), at(1.6, -3).setY(p.y + 1.9), bed.clone().setY(bed.y + 0.3), mid, 5);
    if (this.skipped) return;
    cam.clearShot(); pup.cancelPose(); pup.control = true; cam.snapBehind(pup); this.app.state = 'play';
    this.goal('Go to Aama — she\'s calling you', this.aama.pos, 'Aama');
    const tGo = performance.now();
    await this.until(() => {
      const a = this.aama.pos, d = Math.hypot(pup.pos.x - a.x, pup.pos.z - a.z);
      this.call(this.aama, 'Khairey! Come here, little one!');
      if (performance.now() - tGo > 12000 && d > 3) this.aama.walkTo(pup.pos.x, pup.pos.z);   // she comes to you if you wander off
      this.track(a, 'Aama');
      return d < 2.2;
    });
    if (this.skipped) return;
    this.aama.stay('Wiggle'); this.bhai.stay('Wiggle'); this.app.setWaypoint(null);

    // ---- the blessing: didi bows, tika + mala, then the feast
    if (this.didi) {
      const t = pup.pos.clone().addScaledVector(pup.forward(), 1.2); this.didi.walkTo(t.x, t.z, 1.5);
      this.app.bubbles.say(this.didi, 'Jai Kukur Tihar! Come here, little Bhairav…', 3);
      const t0 = performance.now(); await this.until(() => this.didi.state === 'idle' || performance.now() - t0 > 6000);
      if (this.skipped) return;
      this.didi.state = 'pet'; this.didi.stateT = 2.8;
    }
    pup.dog.setTihar(true); audio.bell(4); pup.setMood?.('excited', 3); this.app.fx.burst('heart', pup.pos.clone().setY(pup.pos.y + 0.6), 8);
    this.app.hud.toast('🌼 Didi bows to you, presses a red tika on your forehead and hangs a marigold mala around your neck.', 4.5);
    await sleep(1800);
    if (this.skipped) return;
    this.goal('Eat the feast — walk over the treats');
    const fw = pup.forward(), sd = new THREE.Vector3(fw.z, 0, -fw.x), feast = [];
    for (let i = 0; i < 3; i++) { const q = pup.pos.clone().addScaledVector(fw, 1.0 + i * 0.7).addScaledVector(sd, (i - 1) * 0.4); feast.push(npcs.treats.drop(q.x, q.z, pup.pos.y + 0.8)); }
    if (this.didi) this.app.bubbles.say(this.didi, 'Eat, eat! Today is your day.', 3);
    let eaten = 0; this.cleanup.push(events.on('treat', () => eaten++));
    const t1 = performance.now();
    await this.until(() => eaten >= 2 || !feast.some((t) => npcs.treats.list.includes(t)) || performance.now() - t1 > 40000);
    if (this.skipped) return;

    // ---- curl up together
    const bedA = bed.clone().addScaledVector(side, 0.7), bedB = bed.clone().addScaledVector(side, -0.7);
    this.aama.walkTo(bedA.x, bedA.z, 1.4); this.bhai.walkTo(bedB.x, bedB.z, 1.4);
    if (this.didi) this.didi.walkTo(didiHome.x, didiHome.z, 1.2);
    this.app.bubbles.say(this.aama, 'Full tummy? Come, let\'s sleep.', 3);
    this.goal('Curl up between Aama and Bhai — press E (or just stay close)', bed, 'Sleep');
    let near = 0;
    // E is read from the held-keys set: one-frame "hits" are already cleared by the time this check runs
    await this.until(() => {
      for (const s of [this.aama, this.bhai]) if (s.state === 'stay' && s.pose !== 'Lie') s.stay('Lie');
      const d = Math.hypot(pup.pos.x - bed.x, pup.pos.z - bed.z); near = d < 2.0 ? near + 1 : 0;
      return d < 2.0 && (this.app.input.held.has('interact') || near > 150);
    });
    if (this.skipped) return;
    this.app.setWaypoint(null);
    pup.control = false; pup.startPose('Lie', 1e9); this.app.state = 'intro'; this.objective('');
    this.card('That night, Khairey dreamed of marigolds.', 3.4);
    await this.wait(3.6); await this.fade(1, 1400);
    if (this.skipped) return;

    // ---- 2. the morning: a nightmare
    world.weather.set('mist', true); world.weather.hour = 5.75;
    this.decor.userData.flames.visible = false;                       // the diyos burnt out in the night
    for (const s of [this.aama, this.bhai]) s.stay('Lie');
    if (this.didi) { scene.remove(this.didi.root); this.didi.root.visible = false; }
    $('#game').style.filter = 'blur(1.3px) saturate(0.32) contrast(1.15) sepia(0.25)';
    const master = audio.master?.gain.value; if (audio.master) audio.master.gain.value = master * 0.55;
    this.beat = setInterval(() => audio.play?.('taiko', { vol: 0.55, rate: 0.5 }), 950);
    const q = pup.pos.clone(), rd = road(world, q.x, q.z);
    let dir, vp, path = [];
    if (rd) {
      const nx = rd.path[0] || new THREE.Vector2(rd.x + side.x, rd.z + side.z); dir = new THREE.Vector2(nx.x - rd.x, nx.y - rd.z).normalize(); path = rd.path;
      vp = new THREE.Vector3(rd.x + dir.y * rd.w * 0.22, 0, rd.z - dir.x * rd.w * 0.22);   // Nepal drives on the left
    } else { dir = new THREE.Vector2(side.x, side.z); vp = at(4, 11); }
    vp.y = H(vp.x, vp.z);
    const v = van(); v.position.copy(vp); v.rotation.y = Math.atan2(dir.x, dir.y); scene.add(v); this.van = v;
    // The scripted van uses the same solid-body interface as ordinary traffic.
    const dimensions = TRAFFIC.storyVan;
    const vanBody = { get x() { return v.position.x; }, get y() { return v.position.y; }, get z() { return v.position.z; }, get heading() { return v.rotation.y; }, halfWidth: dimensions.width / 2, halfLength: dimensions.length / 2, height: dimensions.height };
    const vanBodies = [vanBody], bodyProvider = () => v.parent ? vanBodies : [];
    const roofProvider = (x, z) => {
      if (!v.parent) return null;
      const dx = x - v.position.x, dz = z - v.position.z, sn = Math.sin(v.rotation.y), cs = Math.cos(v.rotation.y);
      return Math.abs(dx * cs - dz * sn) < dimensions.width / 2 && Math.abs(dx * sn + dz * cs) < dimensions.length / 2 ? v.position.y + dimensions.height : null;
    };
    world.physics.bodies.push(bodyProvider); world.physics.dynamic.push(roofProvider);
    this.cleanup.push(() => {
      for (const [list, provider] of [[world.physics.bodies, bodyProvider], [world.physics.dynamic, roofProvider]]) { const i = list.indexOf(provider); if (i >= 0) list.splice(i, 1); }
    });
    const left = new THREE.Vector3(dir.y, 0, -dir.x), rear = new THREE.Vector3(vp.x - dir.x * 2.9, vp.y, vp.z - dir.y * 2.9);
    const grab = [this.aama, this.bhai].map((dog, i) => {
      const s = i ? -1 : 1, c = person('walker', 'cruel', rear.clone().addScaledVector(left, s * 0.9), flatHeading(dog.pos.clone().sub(rear)));
      if (c) c.walkTo(dog.pos.x + s * 0.4, dog.pos.z, 1.7);
      return { dog, c, phase: 'to' };
    });
    await this.fade(0, 1600);
    if (this.skipped) return;
    this.card('<span class="small">the next morning</span>Then morning came. Not the gentle kind.', 3.6);
    const toV = new THREE.Vector3(vp.x - q.x, 0, vp.z - q.z).normalize();
    const eye0 = q.clone().addScaledVector(toV, -2.6).add(new THREE.Vector3(0, 0.9, 0)), eye1 = q.clone().addScaledVector(toV, -1.8).add(new THREE.Vector3(0, 0.7, 0));
    await this.shot(eye0, eye1, bed.clone().setY(bed.y + 0.5), vp.clone().lerp(bed, 0.4).setY(vp.y + 0.8), 3.4);
    if (this.skipped) return;
    // you're awake now: it's happening, and you can run at them, bark… it changes nothing
    cam.clearShot(); pup.cancelPose(); pup.control = true; cam.snapBehind(pup); this.app.state = 'play';
    this.objective('They\'re taking Aama and Bhai! Bark! RUN!');
    this.app.bubbles.say(pup, 'AAMA!', 2); audio.bark(true, 1);
    this.track(vp, 'The van');
    const tTake = performance.now();
    await this.until(() => {
      const el = performance.now() - tTake;
      for (const g of grab) {
        const { dog, c } = g;
        if (g.phase === 'to' && (!c || c.state === 'idle' || el > 7000)) {
          g.phase = 'drag'; if (c) c.walkTo(rear.x, rear.z, 1.3);
          this.app.bubbles.say(dog, dog === this.aama ? 'Run, Khairey! RUN!' : 'AAMA! Help!', 2.6); audio.play?.('stray_howl', { vol: 0.5 });
        }
        if (g.phase === 'drag') {
          const lead = c ? c.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading)), -0.8) : rear;
          dog.walkTo(lead.x, lead.z, 1.6);
          const there = c ? c.state === 'idle' : Math.hypot(dog.pos.x - rear.x, dog.pos.z - rear.z) < 0.8;
          if (there || el > 18000) {
            g.phase = 'in'; for (const o of [dog.root, c?.root]) if (o) { scene.remove(o); o.visible = false; }
            audio.play?.('crate', { vol: 0.7 });
          }
        }
      }
      return grab.every((g) => g.phase === 'in');
    });
    if (this.skipped) return;
    // you can chase it. you can't catch it.
    this.objective('CHASE THE VAN!');
    audio.play?.('horn', { vol: 0.6 });
    const tC = performance.now(); let k = 0, spd = 0, last = tC, h = v.rotation.y;
    const off = rd ? rd.w * 0.22 : 0;
    await this.until(() => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      spd = Math.min(13, spd + dt * 2.4);
      let move = spd * dt;
      while (move > 1e-4) {
        if (k < path.length) {
          const prev = k ? path[k - 1] : new THREE.Vector2(vp.x, vp.z), sx = path[k].x - prev.x, sz = path[k].y - prev.y, sl = Math.hypot(sx, sz) || 1;
          const tx = path[k].x + (sz / sl) * off, tz = path[k].y - (sx / sl) * off;
          const dx = tx - v.position.x, dz = tz - v.position.z, d = Math.hypot(dx, dz);
          if (d < 1e-3) { k++; continue; }
          h = Math.atan2(dx, dz);
          if (d <= move) { v.position.x = tx; v.position.z = tz; move -= d; k++; } else { v.position.x += (dx / d) * move; v.position.z += (dz / d) * move; move = 0; }
        } else { v.position.x += Math.sin(h) * move; v.position.z += Math.cos(h) * move; move = 0; }
      }
      v.position.y = H(v.position.x, v.position.z); v.rotation.y += angDiff(v.rotation.y, h) * Math.min(1, dt * 6);
      this.track(v.position, 'The van');
      const far = Math.hypot(v.position.x - pup.pos.x, v.position.z - pup.pos.z);
      return (now - tC > 6000 && far > 45) || now - tC > 16000;
    });
    if (this.skipped) return;
    this.app.setWaypoint(null);
    pup.control = false; this.app.state = 'intro'; this.objective('');
    this.card('You ran until your paws burned. The van was gone.', 3.4);
    await this.wait(3.4); await this.fade(1, 1500);
    if (this.skipped) return;
    this.#end();

    // ---- 3. waking alone
    await this.app.respawnAt(p.x, p.z); world.weather.set('sunny', true); world.weather.hour = 7.2;
    if (this.skipped) return;
    pup.startPose('Lie', 3);
    await this.fade(0, 1400);
    if (this.skipped) return;
    this.card('<span class="small">Basantapur · 7:12 AM</span>You are alone now. But your nose remembers.', 4.2);
    await this.wait(4.4);
    if (this.skipped) return;
    pup.cancelPose(); cam.clearShot();
    this.app.hud.toast('★ Main story: Where Is Aama? — press J to open your grimoire and pick a mission', 6);
  }

  /** true while the story is still playing (App routes Esc here instead of the pause menu) */
  get storyRunning() { return !this._ended && !this.skipped; }
  /** restore everything (also used when skipped) */
  #end() {
    if (this._ended) return; this._ended = true;
    const { npcs, scene, audio, game } = this.app;
    clearInterval(this.beat); $('#game').style.filter = ''; this.objective(''); this.app.storyCalm = false;
    if (audio.master) audio.master.gain.value = settings.get('volume');
    for (const o of [this.van, this.decor, this.aama?.root, this.bhai?.root, ...(this.actors || []).map((c) => c.root)]) if (o) scene.remove(o);
    for (const s of [this.aama, this.bhai]) { const i = npcs.strays.indexOf(s); if (i >= 0) npcs.strays.splice(i, 1); }
    for (const c of this.actors || []) { const i = npcs.people.indexOf(c); if (i >= 0) npcs.people.splice(i, 1); }
    for (const fn of this.cleanup || []) if (typeof fn === 'function') fn();
    settings.set('prologueDone', true); game.missions.paused = false; this.app.setWaypoint(null);
    this.app.world.weather.setDay(1);   // the morning after: Laxmi Puja — the city is still dressed for Tihar
    game.missions.track('aama');
    game.journal.write('💔', 'They took Aama and Bhai. I will find them. I will.');
  }
  /** The story is only skipped deliberately: Esc, then Esc again within 3 s (clicks and Space never skip it). */
  requestSkip(key) {
    if (key !== 'pause' || this.t < 0.8) return;
    const now = performance.now();
    if (this._ask && now - this._ask < 3000) { this.skip(); return; }
    this._ask = now; $('#skip').textContent = 'Press Esc again to skip the story';
    setTimeout(() => { if (!this.skipped) $('#skip').textContent = 'Esc twice to skip the story'; }, 3000);
  }
  skip() { super.skip(); this.#end(); $('#fade').style.opacity = 0; this.app.state = 'intro'; const w = this.app.world.weather; w.set('sunny', true); w.hour = 7.2; }   // same morning you'd wake to
}
