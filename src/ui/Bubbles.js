/** Speech bubbles that float above whoever is talking (anything with headPos(out) or .pos). */
import * as THREE from 'three';
import { el } from './dom.js';

const V = new THREE.Vector3();
export class Bubbles {
  constructor(layer, camera) { this.layer = layer; this.camera = camera; this.list = []; }
  say(who, text, seconds = 2.2) {
    const old = this.list.find((b) => b.who === who);
    if (old) { old.el.textContent = text; old.t = seconds; return; }
    const node = el('div.bubble', {}, text);
    this.layer.append(node);
    requestAnimationFrame(() => node.classList.add('on'));
    this.list.push({ who, el: node, t: seconds });
  }
  update(dt) {
    const w = innerWidth, h = innerHeight;
    this.list = this.list.filter((b) => {
      b.t -= dt;
      if (b.t <= 0) { b.el.remove(); return false; }
      if (b.who.headPos) b.who.headPos(V); else V.copy(b.who.pos ?? b.who).y += 1;
      const dist = V.distanceTo(this.camera.position);
      V.project(this.camera);
      const vis = V.z < 1 && Math.abs(V.x) < 1.1 && Math.abs(V.y) < 1.1 && dist < 45;
      b.el.style.display = vis ? '' : 'none';
      if (vis) { b.el.style.left = ((V.x + 1) / 2) * w + 'px'; b.el.style.top = ((1 - V.y) / 2) * h + 'px'; b.el.style.opacity = Math.min(1, b.t * 2); }
      return true;
    });
  }
  clear() { for (const b of this.list) b.el.remove(); this.list = []; }
}
