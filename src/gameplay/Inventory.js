/**
 * The bag. Item definitions live in config/items.js; counts persist in localStorage.
 *   bag.add('bone') · bag.remove('bone') · bag.count('bone') · bag.list() -> [{ id, n, ...def }]
 * Emits 'bag' whenever it changes.
 */
import { ITEMS } from '../config/index.js';
import { events } from '../core/events.js';

const KEY = 'kukur.bag.v1';

export class Inventory {
  constructor() {
    try { this.items = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { this.items = {}; }
    if (!Object.keys(this.items).length) this.items = { biscuit: 2, bone: 1 };   // a little start kit
  }
  #save() { try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* private mode */ } events.emit('bag', this); }
  count(id) { return this.items[id] || 0; }
  /** @returns {boolean} false if the bag can't hold more of it */
  add(id, n = 1) {
    const def = ITEMS[id]; if (!def) return false;
    if (this.count(id) >= def.max) return false;
    this.items[id] = Math.min(def.max, this.count(id) + n); this.#save(); return true;
  }
  remove(id, n = 1) { if (this.count(id) < n) return false; this.items[id] -= n; if (!this.items[id]) delete this.items[id]; this.#save(); return true; }
  list() { return Object.entries(this.items).filter(([id, n]) => n > 0 && ITEMS[id]).map(([id, n]) => ({ id, n, ...ITEMS[id] })); }
}
