/**
 * The pup's hearts. Damage (stones, traffic, bites) arrives as events.emit('damage', { amount, from, source });
 * App forwards it here. Hearts regenerate slowly; at zero the pup faints (event 'faint') and App respawns it.
 */
import { HEALTH } from '../config/index.js';
import { events } from '../core/events.js';

export class Health {
  constructor() { this.max = HEALTH.hearts; this.hearts = this.max; this.inv = 0; this.since = 0; this.dead = false; }
  get invulnerable() { return this.inv > 0 || this.dead; }
  /** @returns {boolean} true if the hit landed */
  damage(amount = 1, source = '') {
    if (this.invulnerable) return false;
    this.hearts = Math.max(0, this.hearts - amount); this.inv = HEALTH.invulnerable; this.since = 0;
    events.emit('hearts', this);
    if (this.hearts <= 0) { this.dead = true; events.emit('faint', source); }
    return true;
  }
  heal(n) { if (this.dead || this.hearts >= this.max) return false; this.hearts = Math.min(this.max, this.hearts + n); events.emit('hearts', this); return true; }
  revive() { this.dead = false; this.hearts = this.max; this.inv = 2.5; this.since = 0; events.emit('hearts', this); }
  update(dt) {
    this.inv = Math.max(0, this.inv - dt); this.since += dt;
    if (!this.dead && this.hearts < this.max && this.since > HEALTH.regenAfter) { this.since = HEALTH.regenAfter * 0.4; this.heal(1); }
  }
}
