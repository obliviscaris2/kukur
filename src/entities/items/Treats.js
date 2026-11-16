/**
 * Food on the ground: biscuits tossed by kind people. The pup eats one by walking over it (stamina refill,
 * happy wiggle). Strays nearby will race you for it.
 *   treats.drop(x, z)   ·   treats.update(dt, pup, strays, heightAt)
 */
import * as THREE from 'three';
import { events } from '../../core/events.js';
import { toon } from '../../render/toon.js';

const LIFE = 45;

export class Treats {
  constructor(scene) {
    this.scene = scene; this.list = [];
    this.geo = new THREE.CylinderGeometry(0.07, 0.07, 0.025, 12);
    this.mat = toon('#e2a54b', { key: 'biscuit', rim: 0.6 });
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,240,190,1)'); grd.addColorStop(0.4, 'rgba(255,220,140,0.45)'); grd.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this.glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  }
  drop(x, z, y) {
    const m = new THREE.Mesh(this.geo, this.mat); m.castShadow = true;
    const glow = new THREE.Sprite(this.glowMat); glow.scale.setScalar(0.45); glow.position.y = 0.12; m.add(glow);
    m.position.set(x, y + 0.6, z); m.rotation.set(0.2, 0, 0.1);
    this.scene.add(m);
    const t = { mesh: m, x, z, vy: 1.6, age: 0, landed: false };
    this.list.push(t);
    return t;
  }
  /** Nearest treat within r of a point (strays use this). */
  nearest(pos, r) {
    let best = null, bd = r;
    for (const t of this.list) { const d = Math.hypot(t.x - pos.x, t.z - pos.z); if (t.landed && d < bd) { bd = d; best = t; } }
    return best;
  }
  eat(t, who) {
    this.scene.remove(t.mesh); this.list.splice(this.list.indexOf(t), 1);
    events.emit('treat', who);
  }
  update(dt, pup, strays, heightAt) {
    for (const t of [...this.list]) {
      t.age += dt;
      const g = heightAt(t.x, t.z) + 0.02;
      if (!t.landed) { t.vy -= 9.8 * dt; t.mesh.position.y += t.vy * dt; t.mesh.rotation.x += dt * 8; if (t.mesh.position.y <= g) { t.mesh.position.y = g; t.landed = true; t.mesh.rotation.set(0, Math.random() * 6, 0); } }
      else t.mesh.children[0].material.opacity = 0.35 + 0.25 * Math.sin(t.age * 4);
      if (t.landed && Math.hypot(pup.pos.x - t.x, pup.pos.z - t.z) < 0.55) { this.eat(t, pup); continue; }
      const s = strays.find((st) => Math.hypot(st.pos.x - t.x, st.pos.z - t.z) < 0.5);
      if (t.landed && s) { this.eat(t, s); continue; }
      if (t.age > LIFE) { this.scene.remove(t.mesh); this.list.splice(this.list.indexOf(t), 1); }
    }
  }
}
