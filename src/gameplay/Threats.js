/** Coordinates defensive stun, readable threat hints and a behaviour-driven magical aura across streamed regions. */
import * as THREE from 'three';
import { THREATS } from '../config/index.js';
import { disposition, trafficDanger } from './disposition.js';
import { DispositionAura } from '../render/DispositionAura.js';
import { events } from '../core/events.js';

export class Threats {
  constructor({ scene, world, npcs, traffic, fx, hud, app }) {
    Object.assign(this, { world, npcs, traffic, fx, hud, app });
    this.reveal = 0;
    this.stunned = 0;
    this.aura = new DispositionAura(scene, app.renderer.quality);
  }
  actors() {
    return [...this.npcs.people, ...this.npcs.strays];
  }
  roar(origin) {
    this.reveal = THREATS.aura.revealSeconds;
    let count = 0;
    const cfg = THREATS.stun;
    if (!this.app.storyCalm)
      for (const a of this.actors()) {
        const d = disposition(a),
          distance = a.pos.distanceTo(origin);
        if (!d.canStun || distance > cfg.radius || Math.abs(a.pos.y - origin.y) > cfg.height) continue;
        const from = origin.clone().add(new THREE.Vector3(0, 0.35, 0)),
          to = a.pos.clone().add(new THREE.Vector3(0, 0.4, 0));
        if (this.world.physics.rayFrac(from, to) < 0.95) continue;
        const seconds = THREE.MathUtils.lerp(cfg.seconds[1], cfg.seconds[0], distance / cfg.radius);
        if (a.stun?.(seconds)) {
          count++;
          this.fx.burst('sparkle', to, 7, { colors: [THREATS.colours.stunned, '#ffffff'], size: 0.07, speed: 0.5, up: 0.6, life: 0.7 });
        }
      }
    this.npcs.stones.repel(origin, cfg.repel);
    this.stunned = count;
    if (count) events.emit('stun', { count, pos: origin.clone() });
    return count;
  }
  update(dt, pup, scan) {
    this.reveal = Math.max(0, this.reveal - dt);
    const actors = this.actors(),
      enabled = !this.app.storyCalm;
    this.aura.update(dt, actors, pup, this.reveal > 0, enabled);
    const closest = enabled
      ? actors
          .filter((a) => a.root.parent && disposition(a).cat === 'danger' && a.pos.distanceTo(pup.pos) < THREATS.hintRadius)
          .sort((a, b) => a.pos.distanceToSquared(pup.pos) - b.pos.distanceToSquared(pup.pos))[0]
      : null;
    const vehicle = enabled && this.traffic.cars.some((c) => trafficDanger(c, pup));
    this.current = closest
      ? { actor: closest, ...disposition(closest) }
      : vehicle
        ? { cat: 'danger', reason: 'Vehicle approaching — leave the lane' }
        : null;
    this.hud.threat?.(this.current, scan);
  }
}
