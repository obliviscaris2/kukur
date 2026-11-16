/**
 * Sound engine (WebAudio). Real recordings (CC0, see assets/audio/CREDITS.md) loaded from assets/audio/manifest.json:
 *   - one-shots and "segments" banks (a file of several barks is split into separate hits automatically)
 *   - looping ambience layers (Kathmandu traffic, crows, monastery chants, rain, wind, paddling, panting)
 *   - 3D positioned sounds (horns, stray barks) relative to the camera
 *   - a generated reverb (temples, bells, the discovery stinger)
 *   - a soft tanpura-like drone instead of music (settings: music volume)
 * Call audio.init() from a user gesture (browsers require it). Everything degrades silently if audio is blocked.
 *
 *   audio.play('bell', { vol: 0.6, pos: {x, y, z}, reverb: 0.5, rate: 1 })
 */
import { settings } from './settings.js';

const BASE = 'assets/audio/';
const rnd = (a, b) => a + Math.random() * (b - a);

export class Audio {
  ctx = null;
  banks = {};          // key -> { spec, buffers: AudioBuffer[] }
  loops = {};          // key -> { gain, src }
  #next = 2;
  #droneT = 0;

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = settings.get('volume');
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.9; this.amb.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = settings.get('music') * 0.5; this.musicBus.connect(this.master);
    settings.onChange((k, v) => { if (k === 'volume') this.master.gain.value = v; if (k === 'music') this.musicBus.gain.value = v * 0.5; });
    // reverb: exponentially decaying stereo noise impulse (temple courtyard)
    this.verb = c.createConvolver(); this.verb.buffer = this.#impulse(3.8, 2.6);
    this.verbIn = c.createGain(); this.verbIn.connect(this.verb); const vOut = c.createGain(); vOut.gain.value = 0.55; this.verb.connect(vOut); vOut.connect(this.master);
    this.#load();
  }
  get t() { return this.ctx.currentTime; }

  #impulse(seconds, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  async #load() {
    let manifest;
    try { manifest = await (await fetch(BASE + 'manifest.json')).json(); } catch { return; }
    for (const [key, spec] of Object.entries(manifest)) {
      this.banks[key] = { spec, buffers: [] };
      for (const f of spec.files) {
        fetch(BASE + f).then((r) => r.arrayBuffer()).then((a) => this.ctx.decodeAudioData(a)).then((buf) => {
          const bank = this.banks[key];
          if (spec.mode === 'segments') bank.buffers.push(...this.#segments(buf));
          else bank.buffers.push(this.#trim(buf, spec.mode === 'loop' ? 0 : 0.015, spec.len));
          if (spec.mode === 'loop' && this.loops[key]?.pending) this.#startLoop(key);
        }).catch(() => {});
      }
    }
  }
  /** Copy part of a buffer [s, e) (samples), normalised to a 0.9 peak. */
  #slice(buf, s, e, normalise = true) {
    const c = this.ctx, n = Math.max(1, e - s), out = c.createBuffer(buf.numberOfChannels, n, buf.sampleRate);
    let peak = 1e-4;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch).subarray(s, e); out.copyToChannel(d, ch); for (let i = 0; i < n; i += 4) peak = Math.max(peak, Math.abs(d[i])); }
    if (normalise) for (let ch = 0; ch < out.numberOfChannels; ch++) { const d = out.getChannelData(ch), k = 0.9 / peak; for (let i = 0; i < n; i++) d[i] *= k; }
    const fade = Math.min(n, Math.floor(buf.sampleRate * 0.01));
    for (let ch = 0; ch < out.numberOfChannels; ch++) { const d = out.getChannelData(ch); for (let i = 0; i < fade; i++) { d[i] *= i / fade; d[n - 1 - i] *= i / fade; } }
    return out;
  }
  #trim(buf, thresh, len) {
    const d = buf.getChannelData(0); let peak = 0; for (let i = 0; i < d.length; i += 8) peak = Math.max(peak, Math.abs(d[i]));
    let s = 0; if (thresh) while (s < d.length && Math.abs(d[s]) < peak * thresh) s++;
    const e = len ? Math.min(d.length, s + Math.floor(len * buf.sampleRate)) : d.length;
    return this.#slice(buf, Math.max(0, s - 64), e, thresh > 0);
  }
  /** Split a recording into separate hits (barks, horns) by its energy envelope. */
  #segments(buf) {
    const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.floor(sr * 0.01), env = [];
    for (let i = 0; i < d.length; i += win) { let s = 0; for (let j = i; j < Math.min(d.length, i + win); j++) s += d[j] * d[j]; env.push(Math.sqrt(s / win)); }
    const peak = Math.max(...env), th = Math.max(0.01, peak * 0.14), out = [];
    let start = -1, quiet = 0;
    for (let k = 0; k <= env.length; k++) {
      const loud = k < env.length && env[k] > th;
      if (loud) { if (start < 0) start = k; quiet = 0; }
      else if (start >= 0 && ++quiet > 6) {
        const a = Math.max(0, (start - 3) * win), b = Math.min(d.length, (k - quiet + 12) * win);
        if (b - a > sr * 0.08 && b - a < sr * 3) out.push(this.#slice(buf, a, b));
        start = -1; quiet = 0;
      }
    }
    return out.length ? out : [this.#trim(buf, 0.015)];
  }

  /** Play a sound from the bank. o: { vol, rate, pos:{x,y,z}, reverb (0..1 send), delay } */
  play(key, o = {}) {
    if (!this.ctx) return null;
    const bank = this.banks[key]; if (!bank?.buffers.length) return null;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
    src.buffer = bank.buffers[(Math.random() * bank.buffers.length) | 0];
    src.playbackRate.value = o.rate ?? rnd(0.94, 1.06);
    g.gain.value = (o.vol ?? 1) * (bank.spec.gain ?? 1);
    let node = src; node.connect(g); node = g;
    if (o.pos && this.listener) {
      const p = c.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.1;
      p.positionX.value = o.pos.x; p.positionY.value = o.pos.y ?? 1; p.positionZ.value = o.pos.z; node.connect(p); node = p;
    }
    node.connect(this.sfx);
    if (o.reverb) { const s = c.createGain(); s.gain.value = o.reverb; node.connect(s); s.connect(this.verbIn); }
    src.start(this.t + (o.delay || 0));
    return src;
  }
  /** Keep the 3D listener on the camera. */
  listen(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener, p = camera.position, f = camera.getWorldDirection(this._f ??= camera.position.clone()), t = this.t;
    this.listener = true;
    if (L.positionX) { L.positionX.setTargetAtTime(p.x, t, 0.05); L.positionY.setTargetAtTime(p.y, t, 0.05); L.positionZ.setTargetAtTime(p.z, t, 0.05);
      L.forwardX.setTargetAtTime(f.x, t, 0.05); L.forwardY.setTargetAtTime(f.y, t, 0.05); L.forwardZ.setTargetAtTime(f.z, t, 0.05); }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  }

  // ---- looping ambience layers
  #startLoop(key) {
    const L = this.loops[key], bank = this.banks[key];
    if (!bank?.buffers.length) { L.pending = true; return; }
    L.pending = false;
    const src = this.ctx.createBufferSource(); src.buffer = bank.buffers[0]; src.loop = true;
    src.playbackRate.value = 1; src.connect(L.gain); src.start(this.t, Math.random() * bank.buffers[0].duration);
    L.src = src;
  }
  setLoop(key, level, smooth = 1.2) {
    if (!this.ctx) return;
    let L = this.loops[key];
    if (!L) { L = this.loops[key] = { gain: this.ctx.createGain() }; L.gain.gain.value = 0; L.gain.connect(this.amb); this.#startLoop(key); }
    L.gain.gain.setTargetAtTime(Math.max(0, level) * (this.banks[key]?.spec.gain ?? 1), this.t, smooth);
  }

  // ---- synth helpers (soft thumps, drones)
  tone(type, f0, f1, dur, peak, delay = 0, bus = this.sfx) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.4, dur * 0.25)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  thump(freq = 140, vol = 0.12) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.45, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.2);
  }

  // ---- game sounds (called from gameplay code)
  bark(pup = true, vol = 1, pos = null) { this.play(pup ? 'pup_bark' : 'stray_bark', { vol, pos, rate: pup ? rnd(1.02, 1.14) : rnd(0.86, 1.02), reverb: 0.08 }); }
  whimper() { this.play('pup_yelp', { vol: 0.9, rate: rnd(1.05, 1.18) }); }
  happy() { this.play('pup_whine', { vol: 0.55, rate: rnd(1.0, 1.12) }); }
  howl(pup = true) { this.play('stray_howl', { vol: pup ? 0.8 : 0.4, rate: pup ? 1.18 : 0.95, reverb: 0.35 }); }
  hop() { this.thump(210, 0.05); }
  land(k = 0.5) { this.thump(120, 0.06 + k * 0.1); }
  shake() { this.play('pup_shake', { vol: 0.9 }); }
  flutter() { this.play('pigeons', { vol: 0.8 }); }
  honk(dist = 30, pos = null, big = false) { this.play(big ? 'horn_bus' : 'horn', { vol: Math.min(1, 9 / (dist + 3)), pos, rate: rnd(0.95, 1.05) }); }
  bell(dist = 30) { this.play('bell', { vol: Math.min(1, 12 / (dist + 6)), reverb: 0.4, rate: rnd(0.96, 1.04) }); }
  chirp() { this.play('crow', { vol: rnd(0.3, 0.6), rate: rnd(0.9, 1.1) }); }
  thunder() { this.play('thunder', { vol: 1, reverb: 0.3, rate: rnd(0.85, 1.0) }); }
  splash(k = 0.5) { this.play('splash', { vol: 0.5 + k * 0.6, rate: 0.62 - k * 0.12 + Math.random() * 0.1, reverb: 0.05 }); }
  /** The big one: a dark, heavy "place discovered" stinger — taiko + boom + gong + temple bell + low drone in reverb. */
  discover(first = true) {
    if (!this.ctx) return;
    if (first) {
      this.play('taiko', { vol: 1, rate: 0.78, reverb: 0.5 });
      this.play('boom', { vol: 0.7, rate: 0.7, reverb: 0.4 });
      this.play('gong', { vol: 0.75, rate: 0.82, reverb: 0.6, delay: 0.12 });
      this.play('bell_big', { vol: 0.65, rate: 0.9, reverb: 0.7, delay: 0.45 });
      for (const [f, v] of [[55, 0.09], [82.4, 0.06], [110, 0.035]]) this.tone('sine', f, f * 0.995, 4.8, v, 0.05, this.musicBus);
    } else {
      this.play('bowl', { vol: 0.6, reverb: 0.5 });
      this.play('bell', { vol: 0.4, rate: 0.9, reverb: 0.6, delay: 0.2 });
    }
  }

  /** Every frame: ambience mix + occasional city / temple / night events. env from App. */
  update(dt, env) {
    if (!this.ctx) return;
    const day = !env.night, busy = env.cityDensity;
    this.setLoop('city', (0.25 + busy * 0.6) * (env.rain > 0.5 ? 0.6 : 1) * (day ? 1 : 0.35));
    this.setLoop('city_busy', day ? Math.max(0, busy - 0.45) * 1.4 : 0);
    this.setLoop('crows', day && env.rain < 0.3 ? 0.35 + 0.4 * (1 - busy) : 0, 3);
    this.setLoop('chant', env.nearStupa ? 0.9 : 0, 2.5);
    this.setLoop('rain', env.rain * 1.1, 1.5);
    this.setLoop('wind', Math.max(0, env.wind - 0.25) * 0.8, 0.8);
    this.setLoop('paddle', env.swimming ? 0.4 + env.speed * 0.4 : 0, 0.25);
    this.setLoop('pup_pant', env.panting * 0.8, 0.6);
    // occasional one-shots
    if ((this.#next -= dt) <= 0) {
      this.#next = 1.2 + Math.random() * 3.5;
      const r = Math.random(), side = () => ({ x: env.x + rnd(-40, 40), y: 1, z: env.z + rnd(-40, 40) });
      if (env.night) {
        if (r < 0.35) this.play('stray_bark', { vol: 0.25, pos: side(), rate: rnd(0.85, 1.05), reverb: 0.4 });
        else if (r < 0.42) this.howl(false);
        else if (r < 0.5 && env.nearTemple) this.bell(30);
      } else {
        if (r < busy * 0.45) this.honk(rnd(15, 60), side(), Math.random() < 0.12);
        else if (r < busy * 0.45 + 0.18) this.play('scooter_pass', { vol: 0.35 + busy * 0.4, pos: side() });
        else if (r < 0.75 && env.nearTemple) this.bell(rnd(10, 35));
        else if (r < 0.85 && env.rain < 0.3) this.chirp();
        if (env.nearTemple && env.hour > 5.5 && env.hour < 7.5 && Math.random() < 0.05) this.play('conch', { vol: 0.35, reverb: 0.5 });
      }
    }
    // tanpura-like drone (Sa–Pa) instead of music: soft plucks, long decays
    if ((this.#droneT -= dt) <= 0) {
      this.#droneT = 1.15;
      this._pl = ((this._pl || 0) + 1) % 4;
      const f = [196.0, 261.6, 261.6, 130.8][this._pl];   // Pa, Sa', Sa', Sa
      this.tone('sawtooth', f, f * 0.999, 3.2, 0.012, 0, this.musicBus);
      this.tone('sine', f * 2, f * 2, 2.6, 0.006, 0.01, this.musicBus);
    }
  }
}
