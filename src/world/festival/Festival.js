/**
 * Which festival day is it (weather.day + config/festival.js), and what that means for the city:
 *   - Tihar decorations (TiharDecor) stay up on festival days
 *   - at night: rockets in the sky around you, gamala fountains and chakra spinners in the street nearby
 *   - people call out festival greetings and Deusi-Bhailo lines
 * Owned by World. Read `festival.today` ({ name, ne, icon } or null) for the HUD.
 */
import { FESTIVAL } from '../../config/index.js';
import { Fireworks } from './Fireworks.js';
import { TiharDecor } from './TiharDecor.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class Festival {
  constructor(scene, world, audio) {
    this.world = world;
    this.fireworks = new Fireworks(scene, (x, z) => world.terrain(x, z), audio);
    this.decor = new TiharDecor(scene, world);
    this.rocketT = 2; this.groundT = 4; this.lineT = 6;
  }
  setAudio(audio) { this.fireworks.audio = audio; }
  get today() { return FESTIVAL.days[this.world.weather.day] || null; }
  get night() { const h = this.world.weather.hour, F = FESTIVAL.fireworks; return h >= F.nightFrom || h < F.nightTo; }

  /** @param {{ focus, people?, say? }} ctx  people/say let villagers shout greetings */
  update(dt, ctx) {
    const today = this.today, F = FESTIVAL.fireworks, { focus } = ctx;
    this.decor.visible = !!today; this.decor.update(focus);
    this.fireworks.update(dt);
    if (!today || !this.night || this.paused) return;
    if ((this.rocketT -= dt) <= 0) {
      this.rocketT = rnd(...F.rocketEvery);
      const a = Math.random() * Math.PI * 2, d = rnd(...F.rocketRange);
      this.fireworks.rocket(focus.x + Math.cos(a) * d, focus.z + Math.sin(a) * d, F.colors);
    }
    if ((this.groundT -= dt) <= 0) {
      this.groundT = rnd(...F.groundEvery);
      const p = this.#streetSpot(focus, ...F.groundRange);
      if (p) (Math.random() < 0.5 ? this.fireworks.gamala(p.x, p.z) : this.fireworks.chakra(p.x, p.z));
    }
    if (ctx.people && ctx.say && (this.lineT -= dt) <= 0) {
      this.lineT = rnd(5, 12);
      const near = ctx.people.filter((h) => h.pos.distanceTo(focus) < 18 && h.root.visible);
      if (near.length) ctx.say(near[(Math.random() * near.length) | 0], FESTIVAL.lines[(Math.random() * FESTIVAL.lines.length) | 0]);
    }
  }

  /** a free spot on a street between r0 and r1 from the focus */
  #streetSpot(focus, r0, r1) {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, d = rnd(r0, r1), x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d;
      if (this.world.physics.isFree(x, z, 0.6) && this.world.waterAt(x, z) === null) return { x, z };
    }
    return null;
  }
}
