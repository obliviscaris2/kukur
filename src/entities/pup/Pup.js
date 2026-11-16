/**
 * Khairey, the player pup: movement (camera-relative, momentum, turning arcs, zoomies with stamina, hops,
 * step-up onto plinths), playful idle behaviour, mood, and the hook-up to the shared dog model/animator.
 * Tuning lives in config/pup.js.
 */
import * as THREE from 'three';
import { PUP, DASH } from '../../config/index.js';
import { angDiff, damp, clamp } from '../../core/geo.js';
import { events } from '../../core/events.js';
import { createDog } from '../dog/DogModel.js';
import { DogAnimator } from '../dog/DogAnimator.js';
import { PawPlant } from './PawPlant.js';
import { ImpactMotion } from './ImpactMotion.js';

export class Pup {
  knock = new THREE.Vector2();
  heading = Math.PI; speed = 0; vy = 0; turnRate = 0; hVel = 0; wish = { x: 0, y: 0 }; dashT = 0; dashCd = 0; dashing = false;
  grounded = true; air = 0; coyote = 0; jumpBuf = 0;
  stamina = 1; tired = false; sniffing = false; sprinting = false; panting = 0;
  idle = 0; pose = null; poseT = 0; wet = 0; mood = 'happy'; moodT = 0; barkCd = 0;
  look = null;
  control = true;

  async load(scene) {
    this.dog = await createDog({ outline: true, brows: true, ...PUP.appearance, subject: 'player', scale: PUP.modelScale ?? 1 });
    this.root = this.dog.root; this.pos = this.root.position;
    this.anim = new DogAnimator(this.dog);
    this.feet = new PawPlant(this.dog); this.impact = new ImpactMotion(this.dog);
    scene.add(this.root);
    events.on('lightning', () => this.setMood('scared', 3));
  }
  setMood(m, seconds = 2) { this.mood = m; this.moodT = seconds; }
  /** Hit by a thrown stone: yelp, flinch away, stay scared for a while. */
  /** Shoved (a vehicle, a big dog): slide/fly away with this horizontal velocity, plus a hop. */
  knockback(vx, vz, up = 2.4) { this.knock.set(vx, vz); this.vy = Math.max(this.vy, up); this.grounded = false; this.mantle = null; this.idle = 0; this.jumpWindup = 0; this.cancelPose(); }
  tumble(vx, vz, up = 2.4) { if (this.impact.active || this.impact.cooldown > 0) return; this.knockback(vx, vz, up); this.impact.start(vx, vz, this.heading); this.speed = 0; this.dashT = 0; }
  hurt(from) {
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
    this.knock.x += (dx / l) * 2; this.knock.y += (dz / l) * 2;
    this.vy = Math.max(this.vy, 2.4); this.grounded = false; this.cancelPose(); this.setMood('scared', 6);
    events.emit('yelp', from);
  }
  /** Ate a biscuit: full stamina and a happy wiggle. */
  eat() { this.stamina = 1; this.tired = false; this.setMood('excited', 4); this.startPose('Wiggle'); }
  forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  eyePosition(out = new THREE.Vector3()) {
    const h = this.dog.bones.head;
    if (h) { h.getWorldPosition(out); out.y += 0.05; return out.add(this.forward().multiplyScalar(0.06)); }
    return out.copy(this.pos).add(new THREE.Vector3(0, 0.42, 0));
  }
  placeAt(x, z, heading, world) {
    this.pos.set(x, world.heightAt(x, z), z); this.heading = heading; this.root.rotation.set(0, heading, 0);
    this.speed = this.gaitSpeed = this.vy = this.hVel = this.turnRate = this.air = this.jumpBuf = this.dashT = this.jumpWindup = 0;
    this.knock.set(0, 0); this.wish.x = this.wish.y = 0; this.grounded = true; this.mantle = null; this.swimming = false;
    this.doubled = this.scrambled = this.jumpHeld = false; this.stepOffset = this.bodyLift = 0; this._g = this.pos.y; this.impact?.reset();
    this.anim?.reset?.(this.pos.y); this.feet?.reset?.();
  }
  startPose(name, seconds) { this.pose = name; this.poseT = seconds ?? this.anim.clipLength(name); }
  cancelPose() { this.pose = null; this.poseT = 0; }

  bark() {
    if (this.barkCd > 0) return false;
    this.barkCd = 0.55; this.anim.bark(); this.cancelPose(); this.setMood('excited', 2.5);
    events.emit('bark', this.pos.clone());
    return true;
  }

  update(dt, input, cam, world, wetness) {
    const physics = world.physics;
    this.impact.update(dt, this.grounded);
    const canControl = this.control && !this.impact.active;
    this.barkCd -= dt;
    if ((this.moodT -= dt) <= 0) this.mood = 'happy';
    // ---- wish direction relative to the camera
    let wx = 0, wz = 0, mag = 0, ax = { x: 0, y: 0, analog: false };
    if (canControl) {
      ax = input.axis();
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      wx = fx * ax.y + rx * ax.x; wz = fz * ax.y + rz * ax.x;
      const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    }
    // soften digital input: the wish vector glides towards the keys instead of snapping
    const ks = damp(PUP.inputSmoothing, dt);
    this.wish.x += (wx - this.wish.x) * ks; this.wish.y += (wz - this.wish.y) * ks;
    wx = this.wish.x; wz = this.wish.y; mag = Math.min(1, Math.hypot(wx, wz));
    // ---- water: float and paddle in ponds and rivers
    this.swimT = Math.max(0, (this.swimT || 0) - dt);
    const wl = this.swimT > 0 ? null : world.waterAt?.(this.pos.x, this.pos.z) ?? null;
    const wasSwim = this.swimming;
    this.swimming = wl !== null && this.pos.y <= wl + 0.3;
    if (this.swimming && !wasSwim) { events.emit('swim'); events.emit('splash', this.pos.clone(), Math.min(1, Math.abs(this.vy) / 5 + this.speed / 5)); this.cancelPose(); }
    if (!this.swimming && wasSwim) events.emit('splash', this.pos.clone(), 0.3);
    this.sniffing = canControl && input.down('sniff') && !this.swimming;
    // ---- dash (power move): a short burst that knocks things flying
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (canControl && input.hit('dash') && this.dashCd <= 0 && this.stamina > DASH.stamina * 0.5 && !this.swimming) {
      if (Math.hypot(wx, wz) > 0.1) this.heading = Math.atan2(wx, wz);
      this.dashT = DASH.seconds; this.dashCd = DASH.cooldown; this.stamina = Math.max(0, this.stamina - DASH.stamina);
      this.stretch = 1; this.cancelPose(); this.hVel = 0; events.emit('dash', this.pos.clone());
    }
    this.sprinting = canControl && input.run && mag > 0.3 && !this.tired && !this.sniffing && !this.swimming;
    let target = 0;
    const prevHeading = this.heading;
    if (mag > 0.05) {
      if (this.pose) this.cancelPose();
      this.idle = 0;
      const want = Math.atan2(wx, wz);
      const rate = THREE.MathUtils.lerp(PUP.turnRate.slow, PUP.turnRate.fast, Math.min(1, this.speed / PUP.speeds.run)) * (this.grounded ? 1 : 0.5);
      const diff = angDiff(this.heading, want);
      // springy turning: angular velocity eases towards a target, so turns become smooth arcs
      this.hVel += (clamp(diff * PUP.turnStiffness, -rate, rate) - this.hVel) * damp(PUP.turnResponse, dt);
      const base = this.sniffing ? PUP.speeds.sniff : input.walk ? PUP.speeds.walk : PUP.speeds.trot;
      target = (this.sprinting ? PUP.speeds.run : base) * (ax.analog ? mag : 1) * THREE.MathUtils.lerp(1, 0.35, Math.min(1, Math.abs(diff) / Math.PI));
      if (this.swimming) target = Math.min(target, PUP.speeds.swim * (input.run ? 1.3 : 1));
    } else { this.idle += dt; this.hVel *= 1 - damp(10, dt); }
    this.heading += this.hVel * dt;
    this.turnRate += (angDiff(prevHeading, this.heading) / Math.max(dt, 1e-3) - this.turnRate) * damp(10, dt);
    // eased acceleration (quick at first, soft at the end) + a tiny linear term so it always arrives
    const rateA = (target > this.speed ? PUP.accel : PUP.decel) * (this.grounded ? 1 : PUP.airControl);
    const dv = (target - this.speed) * damp(rateA, dt);
    this.speed += dv + clamp(target - this.speed - dv, -0.6 * dt, 0.6 * dt);
    if (this.dashT > 0) { this.dashT -= dt; this.speed = DASH.speed * (0.6 + 0.4 * (this.dashT / DASH.seconds)); }
    this.dashing = this.dashT > 0;
    // ---- stamina & panting
    if (this.sprinting && this.speed > 2.5) { this.stamina -= dt / PUP.stamina.drainSeconds; this.panting = Math.min(1, this.panting + dt * 0.3); if (this.stamina <= 0) { this.stamina = 0; this.tired = true; } }
    else { this.stamina = Math.min(1, this.stamina + dt / PUP.stamina.recoverSeconds); if (this.stamina > 0.4) this.tired = false; this.panting = Math.max(0, this.panting - dt * 0.08); }
    // ---- hop
    this.coyote = this.grounded ? PUP.coyoteTime : this.coyote - dt;
    this.jumpBuf = canControl && input.hit('jump') ? PUP.jumpBuffer : this.jumpBuf - dt;
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.jumpWindup) { this.jumpWindup = PUP.jumpAnticipation; this.cancelPose(); }
    if (this.jumpWindup > 0) this.jumpWindup = Math.max(0, this.jumpWindup - dt);
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.jumpWindup) {
      if (this.swimming) { this.swimT = 0.45; this.swimming = false; this.pos.y = wl; }   // paddle-hop: lets the pup climb out onto a bank
      this.vy = PUP.jumpVelocity + this.speed * 0.06; this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.cancelPose();
      this.stretch = 1; this.jumpHeld = true; events.emit('hop', this.pos.clone());
    }
    if (this.jumpHeld && (!canControl || !input.down('jump'))) { this.jumpHeld = false; if (this.vy > 0) this.vy *= PUP.jumpCut; }
    // second hop in mid-air: a little fairy flutter
    else if (canControl && input.hit('jump') && !this.grounded && !this.doubled && !this.swimming && this.coyote <= 0 && this.air > 0.08) {
      this.doubled = true; this.jumpBuf = 0; this.vy = Math.max(this.vy, PUP.doubleJump); this.jumpHeld = true; this.stretch = 1; events.emit('hop2', this.pos.clone());
    }
    // ---- climbing: mantle onto ledges, crates, walls and roofs (Hela-style "can I get up there?")
    if (this.mantle) {
      const m = this.mantle, k = Math.min(1, (m.t += dt) / PUP.mantleTime);
      const up = Math.min(1, k * 2), across = Math.max(0, (k - 0.45) / 0.55), lift = up * up * (3 - 2 * up), travel = across * across * (3 - 2 * across);
      const next = new THREE.Vector3(m.from.x + (m.to.x - m.from.x) * travel, m.from.y + (m.to.y - m.from.y) * lift + Math.sin(k * Math.PI) * 0.06, m.from.z + (m.to.z - m.from.z) * travel);
      const ceiling = this.#ceiling(physics);
      const blockedHead = next.y + PUP.bodyHeight > ceiling + 0.001;
      this.pos.y = Math.min(next.y, ceiling - PUP.bodyHeight);
      physics.move(this.pos, next.x - this.pos.x, next.z - this.pos.z, PUP.radius, { height: PUP.bodyHeight, step: 0.025, heading: this.heading, halfLength: PUP.bodyHalfLength });
      const blockedSide = Math.hypot(this.pos.x - next.x, this.pos.z - next.z) > 0.035;
      this.vy = 0; this.grounded = false; this.air = 0.2;
      if (blockedHead || blockedSide) this.mantle = null;
      else if (k >= 1) { this.mantle = null; this.grounded = true; this.air = 0; this.squash = 0.4; events.emit('land', this.pos.clone(), 0.3); }
      this.#behaviour(dt, wetness, world); this.animate(dt, world);
      return;
    }
    const fwd0 = this.forward();
    if (canControl && mag > 0.3 && !this.swimming && !this.dashing && !this.jumpWindup) {
      const px = this.pos.x + fwd0.x * 0.42, pz = this.pos.z + fwd0.z * 0.42, y0 = this.pos.y;
      const reach = this.grounded ? PUP.mantleGround : PUP.mantleAir;
      const blocked = physics.solidAt(px, y0 + 0.15, pz) || physics.heightAt(px, pz) - y0 > PUP.stepUp || physics.groundAt(px, pz, y0 + reach) - y0 > PUP.stepUp;
      const top = physics.groundAt(px, pz, y0 + reach);
      if (blocked && top - y0 > PUP.stepUp && top - y0 <= reach && !physics.solidAt(px, top + 0.3, pz) && (!this.grounded || this.speed > 0.4)) {
        const to = new THREE.Vector3(px + fwd0.x * 0.12, top, pz + fwd0.z * 0.12), check = to.clone();
        physics.move(check, 0, 0, PUP.radius, { height: PUP.bodyHeight, step: 0.025, heading: this.heading, halfLength: PUP.bodyHalfLength });
        const path = this.pos.clone().setY(top);
        physics.move(path, to.x - path.x, to.z - path.z, PUP.radius, { height: PUP.bodyHeight, step: 0.025, heading: this.heading, halfLength: PUP.bodyHalfLength });
        if (check.distanceToSquared(to) < 0.0001 && Math.hypot(path.x-to.x,path.z-to.z)<0.01 && this.#ceiling(physics) >= top + PUP.bodyHeight) {
          this.mantle = { t: 0, from: this.pos.clone(), to };
          this.cancelPose(); events.emit('climb', this.pos.clone());
        }
      } else if (!this.grounded && !this.scrambled && this.vy < 1.5 && physics.solidAt(px, y0 + 0.2, pz)) {
        this.scrambled = true; this.vy = PUP.scramble; events.emit('scramble', this.pos.clone());   // paws scrabbling up the wall
      }
    }
    // ---- move with step-up rules, then push out of walls
    const fwd = this.forward(), kn = this.knock, dx = fwd.x * this.speed * dt + kn.x * dt, dz = fwd.z * this.speed * dt + kn.y * dt;
    kn.multiplyScalar(1 - damp(this.grounded ? PUP.impact.drag : 0.8, dt));
    const oldX = this.pos.x, oldZ = this.pos.z, wasGrounded = this.grounded;
    const hit = physics.move(this.pos, dx, dz, PUP.radius, { height: PUP.bodyHeight, step: this.grounded ? PUP.stepUp : 0.025, heading: this.heading, halfLength: PUP.bodyHalfLength });
    const distance = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ);
    this.gaitSpeed = (this.gaitSpeed || 0) + (Math.min(this.speed, distance / Math.max(dt, 1e-3)) - (this.gaitSpeed || 0)) * damp(18, dt);
    if (hit && distance < Math.hypot(dx, dz) * 0.3) this.speed *= 1 - damp(12, dt);
    if (hit && this.impact.active) this.knock.multiplyScalar(0.65);
    if (this.mantle?.t === 0) this.mantle.from.copy(this.pos);
    const ground = physics.groundAt(this.pos.x, this.pos.z, this.pos.y + (this.grounded ? PUP.stepUp : 0.05));
    this._g = ground;
    if (this.swimming) {
      const fy = wl - PUP.swimDepth + Math.sin(performance.now() * 0.005) * 0.02;
      this.pos.y += (fy - this.pos.y) * damp(6, dt); this.vy = 0; this.grounded = true; this.air = 0; this.wet = 1;
      this.#behaviour(dt, wetness, world); this.animate(dt, world);
      return;
    }
    const gk = this.grounded ? 1 : Math.abs(this.vy) < 1.3 ? PUP.apexGravity : this.vy < 0 ? PUP.fallGravity : 1;
    this.vy -= PUP.gravity * gk * dt;
    let ny = this.pos.y + this.vy * dt;
    if (this.vy > 0) {
      const ceiling = this.#ceiling(physics);
      if (ny + PUP.bodyHeight > ceiling) { ny = ceiling - PUP.bodyHeight; this.vy = 0; }
    }
    if (ny <= ground || (wasGrounded && this.vy <= 0 && this.pos.y - ground <= PUP.groundSnap)) {
      this.doubled = this.scrambled = false;
      if (!this.grounded && this.vy < -2.2) { events.emit('land', new THREE.Vector3(this.pos.x, ground, this.pos.z), Math.min(1, -this.vy / 7)); this.squash = Math.min(1, -this.vy / 6); }
      ny = ground; this.vy = 0; this.grounded = true;
    }
    else if (ny > ground + 0.03) this.grounded = false;
    const rise = ny - this.pos.y;
    if (wasGrounded && this.grounded && Math.abs(rise) > 0.06 && Math.abs(rise) <= PUP.stepUp + 0.03) this.stepOffset = clamp((this.stepOffset || 0) - rise, -PUP.maxStepOffset, PUP.maxStepOffset);
    this.pos.y = ny;
    this.air = this.grounded ? 0 : this.air + dt;
    this.#behaviour(dt, wetness, world);
    this.animate(dt, world);
  }

  #ceiling(physics) {
    const fx = Math.sin(this.heading) * PUP.bodyHalfLength, fz = Math.cos(this.heading) * PUP.bodyHalfLength;
    let ceiling = Infinity;
    for (const sign of [-1,0,1]) ceiling = Math.min(ceiling, physics.ceilingAt(this.pos.x + fx*sign, this.pos.z + fz*sign, this.pos.y + PUP.bodyHeight, PUP.radius));
    return ceiling;
  }

  /** Playful idles: shake after rain, stretch, scratch, play-bow, sit, lie down, howl at night. */
  #behaviour(dt, wetness, world) {
    if (wetness > 0.5) this.wet = 1;
    if (!this.grounded || this.swimming || this.impact.active) { this.idle = 0; return; }
    if (this.wet > 0.6 && wetness < 0.3 && this.idle > 1 && !this.pose) { this.startPose('Shake'); this.wet = 0; events.emit('shake'); }
    if (this.pose) { this.poseT -= dt; if (this.poseT <= 0) this.cancelPose(); return; }
    if (this.idle < PUP.idle.playfulAfter) return;
    if (this.idle > PUP.idle.lieDownAfter) { this.startPose('Lie', 1e9); return; }
    if (Math.random() < dt * 0.3) {
      const night = world?.sky && world.weather.hour > 19.5 || world?.weather.hour < 5;
      const r = Math.random();
      if (night && r < 0.25) { this.startPose('Howl'); events.emit('howl'); }
      else if (r < 0.35) this.startPose('Sit', 6 + Math.random() * 6);
      else if (r < 0.55) this.startPose('Scratch');
      else if (r < 0.75) this.startPose('Stretch');
      else if (r < 0.9) this.startPose('PlayBow');
      else this.startPose('Wiggle');
    }
  }

  animate(dt, world) {
    if (!this.anim) return;
    this.root.rotation.y += angDiff(this.root.rotation.y, this.heading) * damp(16, dt);
    const f = this.forward(), sideX = f.z, sideZ = -f.x, sample = PUP.feet.slopeSample, physics = world.physics;
    let pitch = 0, roll = 0;
    if (this.grounded && !this.swimming && !this.pose) {
      const ground = (x, z) => physics.groundAt(x, z, this.pos.y + PUP.stepUp);
      pitch = clamp(-Math.atan2(ground(this.pos.x + f.x * sample, this.pos.z + f.z * sample) - ground(this.pos.x - f.x * sample, this.pos.z - f.z * sample), sample * 2), -PUP.feet.maxSlope, PUP.feet.maxSlope);
      roll = clamp(Math.atan2(ground(this.pos.x + sideX * sample, this.pos.z + sideZ * sample) - ground(this.pos.x - sideX * sample, this.pos.z - sideZ * sample), sample * 2), -PUP.feet.maxSlope, PUP.feet.maxSlope);
    } else if (!this.grounded) pitch = clamp(-this.vy * 0.035, -0.16, 0.22);
    const impact = this.impact;
    roll += clamp(-this.turnRate * this.speed * PUP.procedural.lean * 0.2, -0.12, 0.12) + impact.roll * impact.weight;
    pitch += impact.pitch * impact.weight;
    this.dog.holder.rotation.z += (roll - this.dog.holder.rotation.z) * damp(12, dt);
    // Bend the legs on landing rather than stretching the vertebrate skeleton.
    this.squash = Math.max(0, (this.squash || 0) - dt * 5); this.stretch = Math.max(0, (this.stretch || 0) - dt * 4);
    this.dog.holder.scale.setScalar(PUP.modelScale ?? 1);
    const crouch = this.squash * PUP.procedural.landSquash + (this.jumpWindup > 0 ? 0.025 : 0);
    this.bodyLift = (this.bodyLift || 0) + (Math.abs(Math.sin(impact.roll)) * 0.13 * impact.weight - crouch - (this.bodyLift || 0)) * damp(20, dt);
    this.dog.holder.position.y = this.bodyLift + (this.stepOffset || 0);
    this.stepOffset = (this.stepOffset || 0) * (1 - damp(PUP.stepSmoothing, dt));
    // swimming: nose up, quick paddling legs
    this.dog.holder.rotation.x += ((this.swimming ? -0.2 : pitch) - this.dog.holder.rotation.x) * damp(10, dt);
    this.dog.blob.visible = !this.swimming;
    const wind = world.weather?.wind;
    this.anim.update(dt, { speed: this.swimming ? Math.max(1.5, this.speed * 1.7) : this.gaitSpeed || 0, sniff: this.sniffing || this.pose === 'SniffIdle', air: !this.grounded, vy: this.vy, pose: impact.active ? null : this.pose, turnRate: this.turnRate, mood: this.mood, look: this.look, panting: this.panting, y: this.pos.y, wind: wind ? wind.strength * (0.3 + wind.gust(this.pos.x, this.pos.z)) : 0 });
    impact.apply(); this.feet.update(dt, this, physics);
    this.dog.update(dt);
    this.dog.blob.material.opacity = 0.22 * Math.max(0.2, 1 - (this.pos.y - (this._g ?? this.pos.y)) * 1.5);
    this.dog.blob.position.y = (this._g ?? this.pos.y) - this.pos.y + 0.018;
  }
}
