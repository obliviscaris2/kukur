/**
 * Player settings, persisted in localStorage. Read with settings.get('volume'), write with settings.set(...).
 * Listeners registered with settings.onChange(fn) are called with (key, value).
 */
const KEY = 'kukur.settings.v1';
const DEFAULTS = {
  quality: 'auto', // auto | low | medium | high
  volume: 0.7,
  music: 0.5,
  sensitivity: 1.0,
  invertY: false,
  showFps: false,
  startAt: 'Basantapur, Kathmandu',
  skipIntro: false,
};

class Settings {
  #values = { ...DEFAULTS };
  #listeners = new Set();
  constructor() {
    try {
      Object.assign(this.#values, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch {}
  }
  get(k) { return this.#values[k]; }
  set(k, v) {
    this.#values[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.#values)); } catch {}
    for (const fn of this.#listeners) fn(k, v);
  }
  onChange(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  get all() { return { ...this.#values }; }
}
export const settings = new Settings();
