/**
 * The wind field shared by everything that moves in the breeze.
 *   - a prevailing direction that slowly wanders, strength from the weather
 *   - gust fronts: bands of stronger wind that roll across the city downwind (trees bend in waves)
 *   - eddies: little whirlwinds that spin leaves and dust up into the air near the pup
 * The gust formula is mirrored in GLSL (render/toon.js `windGust`) so shaders and particles agree.
 */
import * as THREE from 'three';
import { U } from '../../render/toon.js';

export const GUST_SPEED = 9;          // m/s that gust fronts travel downwind

export class Wind {
  constructor() {
    this.angle = 0.6; this.dir = new THREE.Vector2(); this.strength = 0.4; this.t = 0;
    this.eddies = [];
    this.#syncDir();
  }
  #syncDir() { this.dir.set(Math.sin(this.angle), Math.cos(this.angle)); U.uWindDir.value.copy(this.dir); }

  /** 0..1 gustiness at a point (same maths as the shader). */
  gust(x, z, t = this.t) {
    const a = x * this.dir.x + z * this.dir.y, b = -x * this.dir.y + z * this.dir.x;
    const g = 0.5 + 0.5 * Math.sin((a - t * GUST_SPEED) * 0.045 + 1.7 * Math.sin(b * 0.013 + t * 0.11));
    return g * g * g;
  }
  /** Wind velocity (m/s) at a point, including eddies. Writes into `out` (THREE.Vector3). */
  at(x, z, y, out) {
    const g = this.gust(x, z), s = this.strength * (1.6 + 5.5 * g);
    out.set(this.dir.x * s, 0, this.dir.y * s);
    for (const e of this.eddies) {
      const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
      if (d > e.r * 1.6) continue;
      const k = e.power * Math.max(0, 1 - d / (e.r * 1.6)) * Math.min(1, e.life, e.age * 2);
      out.x += (-dz / (d + 0.3)) * 7 * k - (dx / (d + 0.3)) * 1.5 * k;
      out.z += (dx / (d + 0.3)) * 7 * k - (dz / (d + 0.3)) * 1.5 * k;
      out.y += 3.2 * k * Math.max(0, 1 - y / 9);
    }
    return out;
  }

  update(dt, strength, focus) {
    this.t += dt;
    this.angle += Math.sin(this.t * 0.017) * dt * 0.015;
    this.#syncDir();
    this.strength += (strength - this.strength) * Math.min(1, dt * 0.5);
    U.uWind.value = this.strength;
    // whirlwinds: only when it's properly windy, near the pup, usually in a gust
    if (this.strength > 0.55 && this.eddies.length < 2 && Math.random() < dt * 0.05 * this.strength) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14;
      this.eddies.push({ x: focus.x + Math.cos(a) * r, z: focus.z + Math.sin(a) * r, r: 1.4 + Math.random() * 1.4, power: 0.7 + Math.random() * 0.5, life: 5 + Math.random() * 4, age: 0 });
    }
    for (const e of this.eddies) {
      e.age += dt; e.life -= dt;
      e.x += this.dir.x * this.strength * 1.6 * dt; e.z += this.dir.y * this.strength * 1.6 * dt;
    }
    this.eddies = this.eddies.filter((e) => e.life > 0);
  }
}
