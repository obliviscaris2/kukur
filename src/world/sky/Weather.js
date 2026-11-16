/**
 * Clock + weather state machine. Picks the next weather (weights in config/weather.js), blends all
 * parameters smoothly, drives rain/debris effects, lightning, rainbows and the global shader uniforms.
 *   weather.params  -> current blended values { cloud, rain, wind, fogNear, fogFar, grey, leaves, dust, rainbow }
 */
import { WEATHERS, WEATHER_ORDER, TIME, EFFECTS } from '../../config/index.js';
import { U } from '../../render/toon.js';
import { events } from '../../core/events.js';
import { Rain } from '../effects/Rain.js';
import { Debris } from '../effects/Debris.js';
import { WindStreaks } from '../effects/WindStreaks.js';
import { Wind } from './Wind.js';
import { Motes } from '../effects/Motes.js';
import { Petals } from '../effects/Petals.js';

export class Weather {
  constructor(scene,quality) {
    this.hour = TIME.startHour;
    // the calendar: day 0 = Kukur Tihar (the prologue night); saved so the festival days carry across sessions
    try { this.day = Number(localStorage.getItem('kukur.day.v1') ?? 1) || 0; } catch { this.day = 1; }
    this.name = 'sunny';
    this.params = { ...WEATHERS.sunny, rainbow: 0 };
    this.nextChange = this.#interval();
    this.sinceRain = 99; this.flash = 0;
    this.rain = new Rain(scene);
    this.debris = new Debris(scene);
    this.petals = new Petals(scene,quality);
    this.wind = new Wind();
    this.streaks = new WindStreaks(scene);
    this.motes = new Motes(scene);
    this.greenery = 0;
  }
  #interval() { const [a, b] = TIME.weatherChangeHours; return a + Math.random() * (b - a); }
  get label() { return WEATHERS[this.name]; }
  set(name, instant = false) {
    if (!WEATHERS[name]) return;
    this.name = name; this.nextChange = this.#interval();
    if (instant) Object.assign(this.params, WEATHERS[name]);
    events.emit('weather', name);
  }
  /** Jump the calendar (the prologue sets 0 = Kukur Tihar, then 1 = the morning after). Emits 'day'. */
  setDay(d) { this.day = d; try { localStorage.setItem('kukur.day.v1', String(d)); } catch { /* private mode */ } events.emit('day', d); }
  cycle() { this.set(WEATHER_ORDER[(WEATHER_ORDER.indexOf(this.name) + 1) % WEATHER_ORDER.length]); return this.label; }
  #pickNext() {
    const morning = this.hour > 5 && this.hour < 9;
    const options = WEATHER_ORDER.filter((n) => !WEATHERS[n].morningOnly || morning);
    let total = 0; for (const n of options) total += WEATHERS[n].weight;
    let r = Math.random() * total;
    for (const n of options) if ((r -= WEATHERS[n].weight) <= 0) return n;
    return 'sunny';
  }

  update(dt, ctx) {
    const { camera, focus, heightAt, solidAt, time, props, landmarks, shrineLights,groves=[] } = ctx;
    this.hour += dt * TIME.speed;
    if (this.hour >= 24) { this.hour -= 24; this.setDay(this.day + 1); }
    this.nextChange -= dt * TIME.speed;
    if (this.nextChange <= 0) this.set(this.#pickNext());
    if (this.name === 'mist' && (this.hour > 10 && this.hour < 20)) this.set('sunny');
    const T = WEATHERS[this.name], P = this.params, k = 1 - Math.exp(-dt * 0.35);
    for (const key of ['cloud', 'rain', 'wind', 'fogNear', 'fogFar', 'grey', 'leaves', 'dust']) P[key] += (T[key] - P[key]) * k;
    // rainbow shortly after rain stops, when the sun is out
    if (P.rain > 0.3) this.sinceRain = 0; else this.sinceRain += dt * TIME.speed;
    const rb = this.sinceRain < EFFECTS.rainbowAfterRainHours && P.cloud < 0.85 && this.hour > 7 && this.hour < 17.5 ? 1 : 0;
    P.rainbow += (rb - P.rainbow) * dt * 0.2;
    this.wind.update(dt, P.wind, focus);
    U.uWet.value += ((P.rain > 0.3 ? 1 : 0) - U.uWet.value) * dt * (P.rain > 0.3 ? 0.15 : 0.03);
    // lightning
    if (T.storm && Math.random() < dt * 0.06) { this.flash = 1; events.emit('lightning'); }
    this.flash = Math.max(0, this.flash - dt * 4);
    this.rain.update(dt, P.rain, P.wind, camera, focus, heightAt);
    if (!this._petalT || (this._petalT -= dt) <= 0) {
      this._petalT = 1;
      this.debris.petalSources = props ? props.nearbyTrees(2, focus, 30) : [];
      this.petals.sources=this.debris.petalSources;
      this.debris.templeSources = landmarks ? landmarks.scent.filter((s) => s.distanceToSquared(focus) < 1600).map((s) => [s.x, s.y, s.z]) : [];
      let trees = 0; if (props) for (let k = 0; k < 5; k++) trees += props.nearbyTrees(k, focus, 30, 8).length;
      this.greenery = Math.min(1, trees / 14);
    }
    this.debris.update(dt, P, focus, heightAt, time, this.wind);
    this.petals.update(dt,{focus,camera,heightAt,solidAt,time,wind:this.wind,rain:P.rain});
    this.streaks.update(dt, this.wind, camera, focus, heightAt);
    const temples=shrineLights?.filter(l=>l.warm).map(l=>[l.position.x,l.position.y,l.position.z])||this.debris.templeSources;
    this.motes.update(dt, { focus, night: U.uNight.value, temples, groves, flowering:this.petals.sources, greenery: this.greenery, heightAt, solidAt, wind: this.wind, rain: P.rain });
  }
}
