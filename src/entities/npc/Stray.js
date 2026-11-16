/**
 * Another street dog. Naps in the sun, wanders the lanes, sniffs about, and gets playful when the pup barks:
 * barks back and trots after the pup for a while. Uses the same model + animator as the player.
 */
import * as THREE from 'three';
import { createDog } from '../dog/DogModel.js';
import { DogAnimator } from '../dog/DogAnimator.js';
import { CATS, NPC, DOGS, THREATS } from '../../config/index.js';
import { angDiff, damp } from '../../core/geo.js';
import { pick, weighted } from '../../core/rng.js';
import { setLod } from './lod.js';


export class Stray {
  /** @param {Function} r rng  @param {{scale?, bandana?, alpha?}} o  territory dogs get a bandana in their pack colour */
  static async create(r, o = {}) {
    const s = new Stray();
    s.r = r; s.breed=o.breed||weighted(r,Object.entries(DOGS.variants).map(([name,v])=>({name,weight:v.weight}))).name;const variant=DOGS.variants[s.breed];s.scale=o.scale??variant.scale[0]+r()*(variant.scale[1]-variant.scale[0]);
    const L = NPC.strayLooks, pattern = weighted(r, Object.entries(variant.patterns||L.patterns).map(([name, weight]) => ({ name, weight }))).name;
    s.dog = await createDog({
      breed:s.breed, coat: variant.coats ? pick(r,variant.coats) : pattern === 'blacktan' ? pick(r, L.blacktan) : pick(r, NPC.strayCoats), pattern, scale: s.scale,
      socks: r() < L.socks, brows: pattern === 'blacktan' || r() < L.brows, browColor: pattern === 'blacktan' ? '#c98a4b' : '#f3e3c3', tihar: !o.bandana && r() < L.tihar, bandana: o.bandana,
    });
    s.anim = new DogAnimator(s.dog);
    s.root = s.dog.root;
    s.heading = r() * 6.28; s.speed = 0; s.state = r() < 0.5 ? 'nap' : 'wander'; s.stateT = 5 + r() * 15;
    s.pose = s.state === 'nap' ? 'Lie' : null; s.mood = 'calm'; s.target = null; s.barkCd = 0;
    return s;
  }
  get pos() { return this.root.position; }
  /** Scripted (cutscenes): trot to (x, z), then stay sitting. */
  walkTo(x, z, speed = 1.8) { this.scripted=true; this.goal = { x, z }; this.goalSpeed = speed; this.state = 'goto'; this.pose = null; this.greeted = true; }
  /** Scripted: hold a pose ('Sit', 'Lie', 'Wiggle', 'SniffIdle'…) until told otherwise, facing the pup. */
  stay(pose = 'Sit') { this.state = 'stay'; this.pose = pose; this.poseT = 1e9; this.greeted = true; }
  headPos(out=new THREE.Vector3()){if(this.dog.bones.head){this.dog.bones.head.getWorldPosition(out);out.y+=.08*this.scale;return out;}return out.copy(this.pos).setY(this.pos.y+.45*this.scale);}
  stun(seconds){if(this.scripted||this.stunImmune>0)return false;this.stunFor=seconds;this.stunImmune=seconds+THREATS.stun.immunity;this.speed=0;this.biteCd=seconds+THREATS.stun.recover;return true;}

  /** ctx = { dt, world, pup, say, audio } */
  lod(dist) { setLod(this, dist); }
  setCameraFade(value) { this.dog.setCameraFade(value); }

  update(ctx) {
    const { dt, world, pup } = ctx;
    this.stateT -= dt; this.barkCd -= dt;this.stunImmune=Math.max(0,(this.stunImmune||0)-dt);
    if(this.stunFor>0){this.stunFor=Math.max(0,this.stunFor-dt);this.speed=0;this.anim.update(dt,{speed:0,y:this.pos.y,pose:'Sit',air:false,mood:'scared'});this.dog.update(dt);return;}
    const toPup = this.root.position.distanceTo(pup.pos);
    let want = 0;
    if (this.tstate) want = this.#territorial(ctx, toPup);
    else {
    if (!this.greeted && toPup < 5 && this.state !== 'play' && (this.state !== 'nap' || toPup < 2)) { this.greeted = true; this.state = 'greet'; this.stateT = 4; this.pose = null; ctx.audio?.happy?.(); }
    if (this.state === 'goto') {
      const gx = this.goal.x - this.root.position.x, gz = this.goal.z - this.root.position.z;
      if (Math.hypot(gx, gz) < 0.45) this.stay('Sit'); else { this.#steer(dt, this.goal.x, this.goal.z); want = this.goalSpeed; }
    } else if (this.state === 'stay') {
      if (toPup < 9) this.heading += angDiff(this.heading, Math.atan2(pup.pos.x - this.root.position.x, pup.pos.z - this.root.position.z)) * damp(3, dt);
    } else if (this.state === 'nap') {
      this.pose = 'Lie';
      if (this.stateT <= 0 && !(this.leader && this.leader.state === 'nap')) { this.state = 'wander'; this.stateT = 8 + this.r() * 12; this.pose = this.r() < 0.4 ? 'Stretch' : null; this.poseT = 2; }
    } else if (this.state === 'greet') {   // trot up, sniff noses, wag like mad
      this.mood = 'excited';
      if (toPup > 1.1) { this.#steer(dt, pup.pos.x, pup.pos.z); want = Math.min(2.4, toPup); this.pose = null; }
      else { this.heading += angDiff(this.heading, Math.atan2(pup.pos.x - this.root.position.x, pup.pos.z - this.root.position.z)) * damp(6, dt); this.pose = this.stateT > 1.2 ? 'SniffIdle' : 'Wiggle'; this.poseT = 0.3; }
      if (this.stateT <= 0) { this.pose = null; if (this.r() < 0.5) { this.state = 'play'; this.stateT = 8; } else { this.state = 'wander'; this.stateT = 6; } }
    } else if (this.state === 'play') {
      this.mood = 'excited';
      if (toPup > 2.2) { this.#steer(dt, pup.pos.x, pup.pos.z); want = toPup > 6 ? 4.5 : 2.2; }
      else if (this.r() < dt * 0.6) this.pose = this.r() < 0.5 ? 'PlayBow' : 'Wiggle', this.poseT = 1.5;
      if (this.stateT <= 0 || toPup > 30) { this.state = 'wander'; this.stateT = 10; this.mood = 'calm'; }
    } else { // wander / sniff (or follow the pack leader, or race for a biscuit)
      const treat = ctx.treats?.nearest(this.root.position, 9), L = this.leader;
      this.catCd = Math.max(0, (this.catCd || 0) - dt);
      const cat = !treat && !L && this.catCd <= 0 ? (this.chasing || ctx.cats?.nearest(this.root.position, CATS.dogChase)) : null;
      if (treat) { this.#steer(dt, treat.x, treat.z); want = 3.4; this.mood = 'excited'; }
      else if (cat) {   // a cat! chase it; if it gets up a wall, sit under it and bark, then give up
        this.chasing = cat; this.mood = 'excited'; this.chaseT = (this.chaseT || 0) + dt;
        const d = Math.hypot(cat.p.x - this.root.position.x, cat.p.z - this.root.position.z);
        if (cat.st === 'perch' && d < 1.6) { want = 0; this.pose = 'Sit'; this.poseT = 0.5; this.heading += angDiff(this.heading, Math.atan2(cat.p.x - this.root.position.x, cat.p.z - this.root.position.z)) * damp(5, dt); }
        else { this.#steer(dt, cat.p.x, cat.p.z); want = 4.2; this.pose = null; }
        if (this.barkCd <= 0 && d < 9) { this.barkCd = 1.2 + this.r() * 1.5; ctx.audio?.play?.('stray_bark', { vol: 0.5, pos: this.root.position, rate: 1 + this.r() * 0.2 }); if (this.r() < 0.4) ctx.say?.(this, 'Woof! Woof!'); }
        if (this.chaseT > 9 || d > 25 || !ctx.cats.list.includes(cat)) { this.chasing = null; this.chaseT = 0; this.catCd = 25 + this.r() * 20; this.pose = null; }
      }
      else if (L) {
        const c = Math.cos(L.heading), sn = Math.sin(L.heading);
        const tx = L.pos.x + c * this.offset[0] + sn * this.offset[1], tz = L.pos.z - sn * this.offset[0] + c * this.offset[1];
        const d = Math.hypot(tx - this.root.position.x, tz - this.root.position.z);
        if (d > 0.8) { this.#steer(dt, tx, tz); want = Math.min(4.5, L.speed + d * 0.6); }
        if (L.state === 'nap') { this.state = 'nap'; this.stateT = 4 + this.r() * 6; }
        this.stateT = Math.max(this.stateT, 1);
      } else {
        if (!this.target || this.root.position.distanceTo(this.target) < 1) this.target = this.#pickTarget(ctx);
        if (this.target) { this.#steer(dt, this.target.x, this.target.z); want = this.state === 'sniff' ? 0.5 : 1.0; }
      }
      if (this.stateT <= 0) {
        const r = this.r();
        if (r < 0.3) { this.state = 'nap'; this.stateT = 15 + this.r() * 25; }
        else if (r < 0.55) { this.state = 'sniff'; this.stateT = 4 + this.r() * 4; }
        else { this.state = 'wander'; this.stateT = 6 + this.r() * 10; }
      }
      if (toPup < 4 && this.r() < dt * 0.15) { this.pose = 'Wiggle'; this.poseT = 1.2; }
    }
    }
    if (this.poseT !== undefined && this.state !== 'nap') { this.poseT -= dt; if (this.poseT <= 0) this.pose = null; }
    if (this.pose && this.state !== 'nap') want = 0;
    this.speed += (want - this.speed) * damp(4, dt);
    const p = this.root.position;
    const ox=p.x,oz=p.z;world.physics.move(p,Math.sin(this.heading)*this.speed*dt,Math.cos(this.heading)*this.speed*dt,.16*this.scale,{height:.38*this.scale,step:.18,ignore:this});
    p.y=world.physics.groundAt(p.x,p.z,p.y+.18);
    this.visualSpeed=Math.hypot(p.x-ox,p.z-oz)/Math.max(dt,.001);
    this.root.rotation.y += angDiff(this.root.rotation.y, this.heading) * damp(10, dt);
    const look = toPup < 8 ? { yaw: angDiff(this.heading, Math.atan2(pup.pos.x - p.x, pup.pos.z - p.z)), pitch: 0 } : null;
    if (this.root.visible) { this.dog.update(dt); this.anim.update(dt, { speed: this.visualSpeed / this.scale, sniff: this.state === 'sniff', air: false, pose: this.pose, turnRate: 0, mood: this.mood, look, panting: this.state === 'play' || this.state === 'greet' ? 0.6 : 0, y: p.y }); }
  }

  /**
   * Territory behaviour (states set by gameplay/Territories.js):
   *   guard   amble around home   ·  warn   face the intruder and growl   ·  chase  run at the pup, nip when close
   *   return  trot home           ·  friend relaxed, wag at the pup
   * Returns the wanted speed.
   */
  #territorial(ctx, toPup) {
    const { dt, pup } = ctx, T = this.terr, p = this.root.position;
    this.biteCd = (this.biteCd || 0) - dt;
    switch (this.tstate) {
      case 'warn':
        this.mood = 'scared'; this.pose = null;
        this.heading += angDiff(this.heading, Math.atan2(pup.pos.x - p.x, pup.pos.z - p.z)) * damp(6, dt);
        if (this.barkCd <= 0) { this.anim.bark(); ctx.audio?.play?.(this.r() < 0.5 ? 'stray_growl' : 'stray_bark', { vol: 0.8, pos: p, rate: this.alpha ? 0.8 : 1 }); ctx.say(this, pick(this.r, ['Grrr…', 'Grrrr!', 'Woof! Woof!', 'This is OUR street!'])); this.barkCd = 1.6 + this.r(); }
        return toPup > 5 ? 1.2 : 0;
      case 'chase': {
        this.mood = 'excited'; this.pose = null; this.#steer(dt, pup.pos.x, pup.pos.z);
        if (toPup < 0.9 && Math.abs(p.y-pup.pos.y)<.7 && this.biteCd <= 0 && ctx.world.physics.rayFrac(this.headPos(),pup.pos.clone().setY(pup.pos.y+.25))>.95) {
          this.biteCd = ctx.biteCooldown || 1.3; this.anim.bark(); ctx.audio?.play?.('stray_growl', { vol: 1, pos: p });
          ctx.events.emit('damage', { amount: 1, from: p.clone(), source: 'bite' });
        }
        return toPup > 1 ? (this.alpha ? 5.0 : 4.4) : 0.5;
      }
      case 'return': {
        this.pose = null; this.#steer(dt, T.x, T.z);
        if (Math.hypot(T.x - p.x, T.z - p.z) < T.r * 0.4) this.tstate = 'guard';
        return 2.2;
      }
      case 'friend':
        this.mood = 'happy';
        if (toPup < 6 && toPup > 1.6) { this.#steer(dt, pup.pos.x, pup.pos.z); this.pose = null; return Math.min(2.5, toPup * 0.6); }
        if (toPup <= 1.6) { this.pose = 'Wiggle'; this.poseT = 0.4; return 0; }
      // falls through: friends otherwise mind their own business
      default: {   // guard
        this.mood = 'calm';
        if (!this.target || p.distanceTo(this.target) < 1 || this.stateT <= 0) {
          const a = this.r() * 6.28, d = this.r() * T.r * 0.55;
          this.target = new THREE.Vector3(T.x + Math.cos(a) * d, 0, T.z + Math.sin(a) * d); this.stateT = 6 + this.r() * 8;
          this.pose = this.r() < 0.3 ? (this.r() < 0.5 ? 'Sit' : 'Lie') : null; this.poseT = 5;
        }
        if (this.pose) return 0;
        this.#steer(dt, this.target.x, this.target.z); return 0.9;
      }
    }
  }

  /** Someone howled at night: join the chorus. */
  howl(ctx) {
    if (this.state === 'play') return;
    this.pose = 'Howl'; this.poseT = 3; this.state = 'wander'; this.stateT = 4;
    ctx.audio?.play?.('stray_howl', { vol: 0.4, pos: this.root.position, rate: 0.85 + this.r() * 0.2, reverb: 0.4 });
  }

  /** The pup barked nearby: wake up and play (or bark back). */
  onBark(ctx) {
    if (this.stunFor>0 || this.root.position.distanceTo(ctx.pup.pos) > 14) return;
    if (this.barkCd <= 0) { this.anim.bark(); ctx.audio?.bark(false, 0.7, this.root.position); ctx.say(this, pick(this.r, ['Woof!', 'Bhau bhau!', 'Arf!'])); this.barkCd = 2; }
    this.state = 'play'; this.stateT = 12 + this.r() * 8; this.pose = null;
  }

  #steer(dt, x, z) { this.heading += angDiff(this.heading, Math.atan2(x - this.root.position.x, z - this.root.position.z)) * damp(4, dt); }
  #pickTarget(ctx) {
    const nav = ctx.randomNav?.(this.root.position, 30);
    if (!nav) return null;
    const i = Math.floor(this.r() * (nav.pts.length / 2));
    return new THREE.Vector3(nav.pts[i * 2], 0, nav.pts[i * 2 + 1]);
  }
}
