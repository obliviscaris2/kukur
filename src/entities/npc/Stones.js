/**
 * Stones thrown at dogs by cruel people. A short ballistic arc; if it lands near the pup, the pup is hurt
 * (yelps, flinches, gets scared). Not every throw hits.
 */
import * as THREE from 'three';
import { toon } from '../../render/toon.js';
import { events } from '../../core/events.js';

export class Stones {
  constructor(scene) {
    this.scene = scene; this.list = [];
    this.geo = new THREE.DodecahedronGeometry(0.05, 0);
    this.mat = toon('#8d8178', { key: 'stone', rim: 0.2 });
  }
  /** Throw from `from` (Vector3, hand height) towards `target` (Vector3) with some inaccuracy. */
  throw(from, target, accuracy = 0.55) {
    const miss = Math.random() > accuracy ? 1.2 + Math.random() * 1.5 : Math.random() * 0.3, a = Math.random() * 6.28;
    const tx = target.x + Math.cos(a) * miss, tz = target.z + Math.sin(a) * miss, T = 0.75;
    const m = new THREE.Mesh(this.geo, this.mat); m.position.copy(from); m.castShadow = true; this.scene.add(m);
    const v = new THREE.Vector3((tx - from.x) / T, (target.y + 0.2 - from.y) / T + 0.5 * 9.8 * T, (tz - from.z) / T);
    this.list.push({ m, v, age: 0, hit: false });
  }
  repel(origin,radius){for(const s of this.list){const p=s.m.position,dx=p.x-origin.x,dz=p.z-origin.z,d=Math.hypot(dx,dz);if(d<radius){s.hit=true;s.v.set(dx/Math.max(.1,d)*3,2,dz/Math.max(.1,d)*3);}}}
  update(dt, pup, heightAt, physics) {
    for (const s of [...this.list]) {
      const previous=s.m.position.clone();
      s.age += dt; s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 12; s.m.rotation.z += dt * 9;
      const p = s.m.position;
      if(physics&&physics.rayFrac(previous,p,.06)<1){p.copy(previous);s.hit=true;s.v.multiplyScalar(-.2);s.v.y=-.3;}
      if (!s.hit && p.distanceTo(pup.pos.clone().setY(pup.pos.y + 0.25)) < 0.4) { s.hit = true; events.emit('damage', { amount: 1, from: p.clone(), source: 'stone' }); s.v.multiplyScalar(-0.3); }
      const g = heightAt(p.x, p.z);
      if (p.y <= g + 0.04) { p.y = g + 0.04; s.v.set(s.v.x * 0.4, Math.abs(s.v.y) * 0.25, s.v.z * 0.4); if (Math.abs(s.v.y) < 0.3) s.v.set(0, 0, 0); }
      if (s.age > 6) { this.scene.remove(s.m); this.list.splice(this.list.indexOf(s), 1); }
    }
  }
}
