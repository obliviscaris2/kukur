/**
 * Opening scene: dawn over the Kathmandu valley, the camera swoops down to the start square where the pup
 * is asleep; it wakes, stretches, shakes, barks — and you take over. Skippable (Space / Enter / Esc / click).
 * Write new scenes the same way: an async script using `this.wait()`, `this.shot()` and `this.card()`.
 */
import * as THREE from 'three';
import { $ } from '../ui/dom.js';

export class IntroScene {
  constructor(app) { this.app = app; this.t = 0; this.skipped = false; this.cards = $('#cards'); }
  /** game-clock wait that resolves instantly when skipped */
  wait(s) { const end = this.t + s; return new Promise((res) => { const check = () => (this.skipped || this.t >= end ? res() : requestAnimationFrame(check)); check(); }); }
  /** move the camera along a short tween */
  async shot(from, to, lookFrom, lookTo, seconds) {
    const t0 = this.t;
    while (this.t - t0 < seconds && !this.skipped) {
      const k = (this.t - t0) / seconds, e = k * k * (3 - 2 * k);
      this.app.cam.setShot(from.clone().lerp(to, e), lookFrom.clone().lerp(lookTo, e));
      await new Promise((r) => requestAnimationFrame(r));
    }
    this.app.cam.setShot(to, lookTo);
  }
  async card(html, seconds) {
    if (this.skipped) return;
    this.cards.innerHTML = `<div class="card">${html}</div>`;
    requestAnimationFrame(() => this.cards.firstChild?.classList.add('on'));
    await this.wait(seconds);
    this.cards.firstChild?.classList.remove('on');
    await this.wait(0.6);
  }
  update(dt) { this.t += dt; }
  skip() { this.skipped = true; }
  /** Space / Enter / Esc / click. Ignored for the first moment so the click that pressed Play can't skip it. */
  requestSkip() { if (this.t > 0.8) this.skip(); }

  async run() {
    const { pup, world, cam } = this.app;
    const p = pup.pos.clone();
    world.weather.hour = 6.05; world.weather.set('sunny', true);
    pup.control = false; pup.startPose('Lie', 1e9);
    const sky = new THREE.Vector3(p.x - 1100, p.y + 720, p.z + 1400);
    const high = new THREE.Vector3(p.x - 380, p.y + 260, p.z + 520), mid = new THREE.Vector3(p.x - 40, p.y + 38, p.z + 60), low = new THREE.Vector3(p.x + 2.4, p.y + 1.0, p.z + 2.6);
    const lookFar = new THREE.Vector3(p.x, p.y + 120, p.z - 2000), lookCity = new THREE.Vector3(p.x, p.y + 10, p.z), lookPup = p.clone().add(new THREE.Vector3(0, 0.25, 0));
    this.card('<span class="small">Kathmandu · Lalitpur · Bhaktapur</span>One valley. A million footsteps. A few thousand dogs.', 4.4);
    await this.shot(sky, high, lookFar.clone().setY(p.y + 260), lookFar.clone().setY(p.y + 140), 6);
    this.card('<span class="small">Kathmandu Valley · 6:03 AM</span>The bells wake the city before the sun does.', 4.2);
    await this.shot(high, high.clone().add(new THREE.Vector3(60, -20, -60)), lookFar.clone().setY(p.y + 140), lookFar.clone().setY(p.y + 60), 4);
    await this.shot(high.clone().add(new THREE.Vector3(60, -20, -60)), mid, lookFar.clone().setY(p.y + 60), lookCity, 5);
    this.card('Pigeons. Incense. Momo steam. A thousand prayer flags.', 3.2);
    await this.shot(mid, low, lookCity, lookPup, 4.5);
    this.card('<span class="small">and somewhere in the square…</span>a pup is waking up.', 3.4);
    await this.wait(2.2);
    pup.startPose('Stretch'); await this.wait(pup.anim.clipLength('Stretch'));
    pup.startPose('Shake'); this.app.audio.shake(); await this.wait(pup.anim.clipLength('Shake'));
    pup.cancelPose(); pup.bark();
    await this.wait(0.8);
    this.cards.innerHTML = '';
    cam.snapBehind(pup); cam.clearShot();
    pup.control = true;
  }
}
