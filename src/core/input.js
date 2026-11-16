/**
 * Input: keyboard (bindings in config/controls.js), mouse look (pointer lock or drag), touch joystick + buttons.
 *   input.down('sniff')  -> held this frame        input.hit('bark') -> pressed this frame
 *   input.axis()         -> {x, y, analog}         input.consumeLook() -> [dx, dy, wheel]
 */
import { KEYS } from '../config/controls.js';
import { settings } from './settings.js';

export class Input {
  held = new Set();
  hits = new Set();
  look = [0, 0, 0];
  joy = { x: 0, y: 0, id: null };
  runToggle = false;
  isTouch = false;
  locked = false;
  enabled = true;

  constructor(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      if (['Space', 'Tab', 'F3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.held.has(a)) this.hits.add(a);
      this.held.add(a);
    });
    addEventListener('keyup', (e) => this.held.delete(KEYS[e.code]));
    addEventListener('blur', () => this.held.clear());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (this.isTouch) return;
      if (e.button === 2) this.held.add('sniff');
      if (e.button === 0) {
        if (this.locked) this.hits.add('bark');
        else { this.dragging = true; this.dragMoved = 0; }
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this.held.delete('sniff');
      if (e.button === 0 && this.dragging) {
        this.dragging = false;
        if (this.dragMoved < 6 && this.wantLock) this.lock();
      }
    });
    addEventListener('mousemove', (e) => {
      const s = settings.get('sensitivity'), inv = settings.get('invertY') ? -1 : 1;
      if (this.locked) { this.look[0] += e.movementX * s; this.look[1] += e.movementY * s * inv; }
      else if (this.dragging) {
        this.look[0] += e.movementX * 1.4 * s; this.look[1] += e.movementY * 1.4 * s * inv;
        this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    });
    addEventListener('wheel', (e) => { this.look[2] += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    if (matchMedia('(pointer: coarse)').matches) this.#enableTouch();
    addEventListener('touchstart', () => this.#enableTouch(), { once: true, passive: true });
  }

  lock() { if (!this.isTouch && this.canvas.requestPointerLock) { try { this.canvas.requestPointerLock()?.catch?.(() => {}); } catch {} } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(a) { return this.enabled && this.held.has(a); }
  hit(a) { return this.enabled && this.hits.has(a); }
  /** Menu-level keys work even while gameplay input is disabled. */
  hitAlways(a) { return this.hits.has(a); }
  get run() { return this.down('run') || this.runToggle; }
  get walk() { return this.down('walk'); }
  axis() {
    let x = 0, y = 0;
    if (!this.enabled) return { x, y, analog: false };
    if (this.held.has('left')) x -= 1;
    if (this.held.has('right')) x += 1;
    if (this.held.has('up')) y += 1;
    if (this.held.has('down')) y -= 1;
    x += this.joy.x; y -= this.joy.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, analog: this.joy.id !== null };
  }
  consumeLook() { const r = this.enabled ? [...this.look] : [0, 0, 0]; this.look = [0, 0, 0]; return r; }
  endFrame() { this.hits.clear(); }

  #enableTouch() {
    if (this.isTouch) return;
    this.isTouch = true;
    document.body.classList.add('touch');
    const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob');
    if (!joy) return;
    const setJoy = (t) => {
      const r = joy.getBoundingClientRect();
      let x = (t.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      this.joy.x = x; this.joy.y = y; knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
    };
    joy.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; this.joy.id = t.identifier; setJoy(t); }, { passive: false });
    joy.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === this.joy.id) setJoy(t); }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === this.joy.id) { this.joy.id = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; } };
    joy.addEventListener('touchend', end); joy.addEventListener('touchcancel', end);
    let cam = null;
    this.canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; if (!cam) cam = { id: t.identifier, x: t.clientX, y: t.clientY }; }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (cam && t.identifier === cam.id) { this.look[0] += (t.clientX - cam.x) * 2.2; this.look[1] += (t.clientY - cam.y) * 2.2; cam.x = t.clientX; cam.y = t.clientY; }
    }, { passive: true });
    const endCam = (e) => { for (const t of e.changedTouches) if (cam && t.identifier === cam.id) cam = null; };
    this.canvas.addEventListener('touchend', endCam); this.canvas.addEventListener('touchcancel', endCam);
    for (const b of document.querySelectorAll('#tbtns button')) {
      const k = b.dataset.k;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (k === 'run') { this.runToggle = !this.runToggle; b.classList.toggle('on', this.runToggle); return; }
        this.hits.add(k); this.held.add(k); b.classList.add('on');
      }, { passive: false });
      const up = (e) => { e.preventDefault(); if (k !== 'run') { this.held.delete(k); b.classList.remove('on'); } };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
    }
  }
}
