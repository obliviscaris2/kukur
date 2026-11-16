/**
 * "Kukur Roar" — hold F to charge, and the pup lets loose a fus-ro-dah of a bark:
 *   - a shockwave ring rolls out, shoving clutter, scattering birds, startling people, making traffic brake
 *   - what matters within range lights up THROUGH WALLS, colour-coded like a traffic light, nearest few only:
 *       🔴 danger   hostile packs, cruel people, fast traffic close by
 *       🟡 careful  grumpy people, dogs you don't know yet, slow traffic
 *       🟢 good     food, treasure, kind people, friends, vets
 * Markers are neon pins ("!" / "?" / the item itself) that fade after a few seconds. Tunables: SCAN in config/gameplay.js.
 */
import * as THREE from 'three';
import { SCAN, ITEMS, THREATS } from '../config/index.js';
import { events } from '../core/events.js';
import { disposition, trafficDanger } from './disposition.js';

/** atlas cells: 0 '!'  1 '?'  2 '♥'  3 '+' (vet)  then every item's emoji. Glyphs are white (tinted), emoji keep their colours. */
const GLYPHS = ['!', '?', '♥', '✚'], ICONS = [...GLYPHS, ...Object.values(ITEMS).map((d) => d.icon)];
const ITEM0 = GLYPHS.length;
const CAT=Object.fromEntries(Object.entries(THREATS.colours).map(([k,c])=>[k,new THREE.Color(c).multiplyScalar(SCAN.marker.brightness)]));
const CELL = 64, COLS = 8;

function atlas() {
  const rows = Math.ceil(ICONS.length / COLS), c = document.createElement('canvas'); c.width = COLS * CELL; c.height = rows * CELL;
  const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
  ICONS.forEach((ic, i) => {
    const glyph = i < ITEM0;
    g.font = glyph ? `900 ${CELL * 0.62}px "Cinzel", "Georgia", serif` : `${CELL * 0.66}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    g.fillStyle = '#ffffff'; g.fillText(ic, (i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2 + 3);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { tex: t, rows };
}

export class Scan {
  /** @param {{scene, game, npcs, traffic, audio, fx, cam, hud, pup}} o */
  constructor(o) {
    Object.assign(this, o);
    this.hold = 0; this.cool = 0; this.marks = []; this.wave = null;
    // shockwave: two additive rings
    const ringMat = (c) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color(c) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; uniform vec3 uC; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(0.82, 0.97, r) * smoothstep(1.0, 0.97, r) + smoothstep(0.5, 0.97, r) * 0.12; gl_FragColor = vec4(uC * a * uA, a * uA); }',
    });
    this.rings = ['#ffe9a8', '#9be7ff'].map((c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), ringMat(c)); m.visible = false; m.renderOrder = 8; m.frustumCulled = false; this.scene.add(m); return m; });
    // charge glow under the pup
    this.charge = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), ringMat('#ffd166')); this.charge.visible = false; this.scene.add(this.charge);
    // x-ray markers (drawn on top of everything)
    const { tex, rows } = atlas(), N = 64, g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3); this.dat = new Float32Array(N * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('aDat', new THREE.BufferAttribute(this.dat, 3));
    this.u = { uTex: { value: tex }, uRows: { value: rows }, uT: { value: 0 }, uPin:{value:new THREE.Vector3(SCAN.marker.min,SCAN.marker.max,SCAN.marker.scale)} };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthTest: false, depthWrite: false, vertexColors: true,
      // a neon pin: soft halo, bright rim, pulsing outer ring, glyph (tinted) or item emoji inside; smaller with distance
      vertexShader: 'uniform vec3 uPin; attribute vec3 aDat; varying vec3 vD; varying vec3 vC; void main(){ vD = aDat; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(uPin.z / max(1.0, -mv.z), uPin.x, uPin.y); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform sampler2D uTex; uniform float uRows, uT; varying vec3 vD; varying vec3 vC;
        void main() {
          vec2 pc = gl_PointCoord; float r = length(pc - 0.5) * 2.0;
          float pulse = fract(uT * 1.2 + vD.z * 0.37);
          float rim = smoothstep(0.62, 0.7, r) * smoothstep(0.82, 0.72, r);
          float wave = smoothstep(0.05, 0.0, abs(r - (0.7 + pulse * 0.3))) * (1.0 - pulse);
          float halo = smoothstep(1.0, 0.3, r) * 0.22;
          vec2 cell = vec2(mod(vD.x, ${COLS}.0), floor(vD.x / ${COLS}.0));
          vec2 q = (pc - 0.5) * 1.5 + 0.5;
          vec4 icon = (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0 && r < 0.66) ? texture2D(uTex, vec2((cell.x + q.x) / ${COLS}.0, 1.0 - (cell.y + q.y) / uRows)) : vec4(0.0);
          vec3 glyph = vD.x < ${ITEM0}.0 ? mix(vC,vec3(1.0),.25) : icon.rgb;
          vec4 c = vec4(vC * .8, rim*.55 + halo*.16 + wave*.2);
          c.rgb = mix(c.rgb, glyph, icon.a); c.a = max(c.a, icon.a);
          if (c.a * vD.y < 0.02) discard;
          gl_FragColor = vec4(c.rgb, c.a * vD.y);
        }`,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 60; this.scene.add(this.points);
    this.C = new THREE.Color();
  }

  /** Called every frame with the bark key state. Holding it charges; at full charge the roar fires. */
  update(dt, holding, pup) {
    this.cool = Math.max(0, this.cool - dt); this.u.uT.value += dt;
    if(!holding)this.latched=false;
    if (holding && !this.latched && this.cool <= 0 && !pup.swimming) {
      this.hold += dt;
      const k = Math.min(1, Math.max(0, (this.hold - 0.2) / (SCAN.charge - 0.2)));
      this.charge.visible = k > 0; this.charge.position.set(pup.pos.x, pup.pos.y + 0.05, pup.pos.z); this.charge.scale.setScalar(0.6 + k * 1.4);
      this.charge.material.uniforms.uA.value = k * (0.6 + 0.4 * Math.sin(this.u.uT.value * 20));
      if (k > 0 && !pup.pose) { pup.startPose('PlayBow', 0.3); }
      if (k >= 1) this.#fire(pup);
    } else { this.hold = 0; this.charge.visible = false; }
    // shockwave
    const w = this.wave;
    if (w) {
      w.t += dt; const r = w.t * SCAN.waveSpeed;
      this.rings.forEach((m, i) => { const rr = r * (i ? 0.7 : 1); m.visible = rr < SCAN.radius; m.position.set(w.x, w.y + 0.3, w.z); m.scale.setScalar(Math.max(0.1, rr)); m.material.uniforms.uA.value = Math.max(0, 1 - rr / SCAN.radius) * 1.4; });
      if (r > SCAN.radius) { this.wave = null; for (const m of this.rings) m.visible = false; }
    }
    // markers follow their targets, pop in as the wave reaches them, fade out at the end
    let n = 0;
    this.marks = this.marks.filter((m) => (m.age += dt) < SCAN.show + m.delay);
    for (const m of this.marks) {
      if (m.age < m.delay || n >= 64) continue;
      const p = m.get(); if (!p) continue;
      const a = Math.min(1, (m.age - m.delay) * 4) * Math.min(1, (SCAN.show + m.delay - m.age) / 1.2);
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y + m.lift + Math.sin(this.u.uT.value * 3 + n) * 0.08; this.pos[n * 3 + 2] = p.z;
      if(m.actor){const state=disposition(m.actor);m.cat=state.stunned?'stunned':state.cat;}
      CAT[m.cat].toArray(this.col, n * 3); this.dat[n * 3] = m.icon; this.dat[n * 3 + 1] = a; this.dat[n * 3 + 2] = n; n++;
    }
    const g = this.points.geometry; this.points.visible=n>0; g.setDrawRange(0, n); g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.aDat.needsUpdate = true;
  }

  /** Everything worth knowing within range → traffic-light categories, nearest few of each, delayed until the wave arrives. */
  #classify(o) {
    const R = SCAN.radius, found = { danger: [], neutral: [], good: [] };
    const add = (cat, get, icon, lift, actor=null) => { const p = get(); if (!p) return; const d = Math.hypot(p.x - o.x, p.z - o.z); if (d <= R) found[cat].push({ get, cat, icon, lift, d, actor }); };
    for (const s of this.npcs.strays) {
      if (!s.root.parent) continue;
      const cat=disposition(s).cat;
      add(cat, () => s.root.parent && s.root.position, cat === 'danger' ? 0 : cat === 'good' ? 2 : 1, .65*s.scale, s);
    }
    for (const p of this.npcs.people) {
      const cat=disposition(p).cat;
      if (cat) add(cat, () => p.root.parent && p.pos, cat === 'danger' ? 0 : cat === 'good' ? 2 : 1, 1.85*p.model.scale.y, p);
    }
    for (const c of this.traffic.cars) {
      const d = Math.hypot(c.x - o.x, c.z - o.z); if (d > 28) continue;
      add(trafficDanger(c,this.game.pup) ? 'danger' : 'neutral', () => (this.traffic.cars.includes(c) ? { x: c.x, y: c.y ?? o.y, z: c.z } : null), 0, 2.2);
    }
    for (const it of [...this.game.pickups.all(o,R),...this.game.rooftops.all(o,R)]) add('good', () => it, ITEM0 + Object.keys(ITEMS).indexOf(it.id), 0.7);
    for (const v of this.vets?.() || []) add('good', () => v, 3, 2.5);
    const out = [], counts = {};
    for (const [cat, list] of Object.entries(found)) {
      list.sort((a, b) => a.d - b.d); counts[cat] = list.length;
      for (const m of list.slice(0, SCAN.maxMarks[cat])) out.push({ ...m, delay: m.d / SCAN.waveSpeed, age: 0 });
    }
    const line=[this.lastStunned&&`${this.lastStunned} staggered`,counts.danger&&`${counts.danger} active threats`,counts.neutral&&`${counts.neutral} neutral`,counts.good&&`${counts.good} friends / finds`].filter(Boolean).join(' · ');
    this.hud.toast(line ? `📣 ${line}` : '📣 All quiet around you…', 4);
    return out;
  }

  #fire(pup) {
    this.hold = 0; this.latched=true; this.cool = SCAN.cooldown; this.charge.visible = false;
    const o = pup.pos.clone(), { audio, fx, cam } = this;
    this.wave = { x: o.x, y: o.y, z: o.z, t: 0 };
    pup.cancelPose(); pup.startPose('PlayBow', .5); pup.anim.bark();
    audio.play('boom', { vol: 1, rate: 0.6, reverb: 0.5 }); audio.play('taiko', { vol: 0.8, rate: 0.7, reverb: 0.4 }); audio.play('pup_bark', { vol: 1, rate: 0.75, reverb: 0.6 });
    audio.play('whoosh', { vol: 0.8, rate: 0.6, delay: 0.05 });
    cam.bump(1.2); fx.burst('sparkle', o.clone().setY(o.y + 0.4), 10, { speed: 3, up: 1 });   // no dust cloud: keep the view clear for the markers
    // the physical part: shove clutter outward, scatter birds, startle people, make traffic hit the brakes
    this.lastStunned=this.game.defensiveRoar(o);
    const br = this.game.breakables;
    for (const b of br.active) { const d = Math.hypot(b.x - o.x, b.z - o.z); if (d < SCAN.push && d > 0.01) br.knock(new THREE.Vector3(b.x - (b.x - o.x) / d * 0.5, b.y, b.z - (b.z - o.z) / d * 0.5), (b.x - o.x) / d, (b.z - o.z) / d, 9 * (1 - d / SCAN.push) + 2, 0.7); }
    this.npcs.pigeons.scare(o, 30);
    for (const c of this.traffic.cars) if (Math.hypot(c.x - o.x, c.z - o.z) < 18) c.pause = 1.5;
    this.marks.push(...this.#classify(o));
    events.emit('roar', o);
  }
}
