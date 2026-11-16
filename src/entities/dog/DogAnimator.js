/**
 * Makes a dog move like a dog. Two layers:
 *  1. Baked Blender clips: gaits (Idle/Walk/Trot/Gallop + sniff variants) blended by speed with a shared,
 *     stride-synced phase so feet never slide; full-body poses (Sit, Lie, PlayBow, Shake, Scratch, Stretch,
 *     Howl, Wiggle) cross-faded in; Bark as a head-only one-shot; Jump pose while airborne.
 *  2. Procedural secondary motion on top: mood-driven tail wag with lag in turns, springy ears, head look-at,
 *     spine bending into turns, panting after running.
 * Feed it a state object every frame: { speed, sniff, air, pose, turnRate, mood, look, panting }.
 */
import * as THREE from 'three';
import { PUP } from '../../config/index.js';
import { spring } from '../../core/spring.js';

const POSES = ['Sit', 'Lie', 'PlayBow', 'Shake', 'Scratch', 'Stretch', 'Howl', 'Wiggle'];
const LOOPING = new Set(['Sit', 'Lie']);
const Q = new THREE.Quaternion(), E = new THREE.Euler();
const addRot = (bone, x, y, z) => { if (bone) { E.set(x, y, z); Q.setFromEuler(E); bone.quaternion.multiply(Q); } };

export class DogAnimator {
  constructor(dog, gaits = PUP.gaits) {
    this.dog = dog; this.gaits = gaits; this.P = PUP.procedural;
    this.mixer = new THREE.AnimationMixer(dog.model);
    this.actions = {};
    for (const clip of dog.animations) {
      const c = clip.name === 'Bark' ? new THREE.AnimationClip('Bark', clip.duration, clip.tracks.filter((t) => /neck|head|snout|jaw|ear/.test(t.name))) : clip;
      const a = this.mixer.clipAction(c);
      a.play(); a.setEffectiveWeight(0); a.timeScale = 0;
      if (clip.name === 'Bark') { a.setLoop(THREE.LoopOnce); a.timeScale = 1; a.stop(); }
      this.actions[clip.name] = a;
    }
    const b = dog.bones;
    this.b = { tail: [0, 1, 2, 3, 4].map((i) => b['tail' + i]), earL: b.earL, earR: b.earR, neck: b.neck, head: b.head, jaw: b.jaw, spine1: b.spine1, spine2: b.spine2, chest: b.chest };
    this.phase = 0; this.t = {}; this.k = { air: 0, pose: 0, sniff: 0 };
    this.poseW = Object.fromEntries(POSES.map((p) => [p, 0])); this.poseT = Object.fromEntries(POSES.map((p) => [p, 0]));
    this.wag = 0; this.ear = { a: 0, v: 0 }; this.look = { yaw: 0, pitch: 0 }; this.prevY = null; this.vy = 0; this.time = 0;
    this.body = {a:0,v:0}; this.turn = 0; this.prevSpeed = 0; this.tail = Array(5).fill(0);
  }
  reset(y) { this.prevY=y;this.vy=0;this.ear.a=this.ear.v=this.body.a=this.body.v=this.prevSpeed=this.turn=0;this.tail.fill(0);this.look.yaw=this.look.pitch=0; }
  bark() { const a = this.actions.Bark; if (a) { a.reset(); a.setEffectiveWeight(1); a.play(); } }
  clipLength(name) { return this.actions[name]?.getClip().duration ?? 1; }

  update(dt, s) {
    this.time += dt;
    const k = (r) => 1 - Math.exp(-dt * r), A = this.actions;
    this.k.air += ((s.air ? 1 : 0) - this.k.air) * k(12);
    this.k.pose += ((s.pose ? 1 : 0) - this.k.pose) * k(5);
    this.k.sniff += ((s.sniff ? 1 : 0) - this.k.sniff) * k(8);
    // ---- gait blend weights along the speed axis
    const w = {}; for (const [n] of this.gaits) w[n] = 0;
    const sp = s.speed;
    if (sp <= 0) w.Idle = 1;
    else for (let i = 0; i < this.gaits.length - 1; i++) {
      const [a, sa] = this.gaits[i], [bb, sb] = this.gaits[i + 1];
      if (sp <= sb || i === this.gaits.length - 2) { const t = THREE.MathUtils.clamp((sp - sa) / (sb - sa), 0, 1); w[a] = 1 - t; w[bb] = t; break; }
    }
    let stride = 0; for (const [n, , st] of this.gaits) stride += w[n] * st;
    this.phase = (this.phase + (dt * sp) / Math.max(0.3, stride * this.dog.holder.scale.x)) % 1;
    for (const p of POSES) this.poseW[p] += ((s.pose === p ? 1 : 0) - this.poseW[p]) * k(s.pose ? 9 : 12);
    const poseWeight = Math.min(1, Object.values(this.poseW).reduce((a, b) => a + b, 0));
    const base = (1 - poseWeight) * (1 - this.k.air), sn = this.k.sniff;
    const set = (n, weight, time) => { const a = A[n]; if (!a) return; a.setEffectiveWeight(weight); if (time !== undefined) a.time = time; };
    const loopT = (n) => (this.t[n] = ((this.t[n] || 0) + dt) % this.clipLength(n));
    for (const [n] of this.gaits) set(n, w[n] * base * (1 - sn), n === 'Idle' ? loopT('Idle') : this.phase * this.clipLength(n));
    const swk = Math.min(1, sp / 0.5);
    set('SniffIdle', base * sn * (1 - swk), loopT('SniffIdle'));
    set('SniffWalk', base * sn * swk, this.phase * this.clipLength('SniffWalk'));
    set('Jump', this.k.air, THREE.MathUtils.clamp(0.1 + (s.vy || 0) * -0.01, 0.02, this.clipLength('Jump') - 0.001));
    for (const p of POSES) {
      const on = s.pose === p ? 1 : 0;
      if (on) this.poseT[p] = LOOPING.has(p) ? (this.poseT[p] + dt) % this.clipLength(p) : Math.min(this.clipLength(p) - 0.001, this.poseT[p] + dt);
      else if (this.poseW[p] < 0.01) this.poseT[p] = 0;
      set(p, this.poseW[p] * (1 - this.k.air), this.poseT[p]);
    }
    this.mixer.update(dt);
    this.#procedural(dt, s);
  }

  #procedural(dt, s) {
    const P = this.P, b = this.b, k = (r) => 1 - Math.exp(-dt * r);
    const mood = s.mood || 'happy';
    // tail: mood wag + swing opposite to turns + carriage (up when happy, tucked when scared)
    const speed = P.tailWagSpeed[mood] ?? 8, amp = (P.tailWagAmount[mood] ?? 0.3) * (s.pose === 'Lie' ? 0.4 : 1) * (1 - Math.min(1, s.speed / 6) * 0.6);
    this.wag += dt * speed;
    const lift = mood === 'scared' ? -0.9 : mood === 'excited' ? 0.15 : 0;
    this.turn += (THREE.MathUtils.clamp(s.turnRate || 0,-4,4)-this.turn)*k(9);
    b.tail.forEach((t, i) => {
      const target=Math.sin(this.wag-i*.5)*amp*(.35+i*.09)-this.turn*.018;
      this.tail[i]+=(target-this.tail[i])*k(P.tailLag-i);
      addRot(t,i===0?lift:0,0,this.tail[i]);
    });
    // ears: spring driven by vertical bounce + speed (ears fly back when running)
    const y=Number.isFinite(s.y)?s.y:0;
    if(this.prevY===null||Math.abs(y-this.prevY)>P.teleportHeight)this.reset(y);
    this.vy += (THREE.MathUtils.clamp((y-this.prevY)/Math.max(dt,1e-3),-5,5)-this.vy)*k(10);this.prevY=y;
    const target=-Math.min(1,s.speed/5)*.22-(mood==='scared'?.45:0)-this.vy*P.earSpring.kick;
    spring(this.ear,target,Math.sqrt(P.earSpring.stiffness),dt);
    const acceleration=THREE.MathUtils.clamp((s.speed-this.prevSpeed)/Math.max(dt,1e-3),-12,12);this.prevSpeed=s.speed;
    spring(this.body,s.air||s.pose?0:-acceleration*P.accelerationPitch,P.bodySpring,dt);
    // wind (0..~3) makes the ears flutter, more in gusts
    const wf = Math.min(1.2, s.wind || 0);
    addRot(b.earL, this.ear.a - wf * 0.12 + Math.sin(this.time * (7.3 + wf * 9)) * (0.02 + wf * 0.07), 0, Math.sin(this.time * 11.1) * wf * 0.05);
    addRot(b.earR, this.ear.a - wf * 0.12 + Math.sin(this.time * (6.1 + wf * 8) + 1) * (0.02 + wf * 0.07), 0, Math.sin(this.time * 9.7 + 2) * wf * 0.05);
    // head look-at (yaw/pitch shared between neck and head)
    let ty = 0, tp = 0;
    if (s.look && !s.pose) { ty = THREE.MathUtils.clamp(s.look.yaw, -P.headLook.maxYaw, P.headLook.maxYaw); tp = THREE.MathUtils.clamp(s.look.pitch, -P.headLook.maxPitch, P.headLook.maxPitch); }
    ty *= 1 - Math.min(1, s.speed / 3) * 0.7;
    this.look.yaw += (ty - this.look.yaw) * k(P.headLook.speed); this.look.pitch += (tp - this.look.pitch) * k(P.headLook.speed);
    addRot(b.neck, -this.look.pitch * 0.4 - this.body.a*.6, 0, this.look.yaw * 0.4);
    addRot(b.head, -this.look.pitch * 0.6 - this.body.a*.4, 0, this.look.yaw * 0.6);
    if (s.speed < 0.3 && !s.pose && !s.air) addRot(b.head, 0, Math.sin(this.time * 1.7) * 0.025, s.look ? Math.sin(this.time * 1.2) * 0.06 : 0);
    // spine bends into turns
    const bend = THREE.MathUtils.clamp(this.turn * P.spineBend, -0.14, 0.14);
    addRot(b.spine1, this.body.a*.35, 0, bend*.4); addRot(b.spine2, this.body.a*.4, 0, bend*.6); addRot(b.chest, this.body.a*.25, 0, bend*.4);
    // panting after a run
    if (s.panting > 0.05 && !s.pose) { addRot(b.jaw, (0.18 + Math.sin(this.time * 14) * 0.07) * s.panting, 0, 0); addRot(b.chest, Math.sin(this.time * 14) * 0.015 * s.panting, 0, 0); }
  }
}
