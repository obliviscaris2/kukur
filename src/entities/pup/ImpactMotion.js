/** Spring-driven torso and joint motion for vehicle tumbles, followed by a smooth stand-up recovery. */
import * as THREE from 'three';
import { PUP } from '../../config/index.js';

const Q = new THREE.Quaternion(), E = new THREE.Euler();

export class ImpactMotion {
  constructor(dog) {
    this.dog = dog; this.active = false; this.weight = 0; this.roll = 0; this.pitch = 0; this.cooldown = 0;
    this.joints = ['neck', 'head', 'upperarmL', 'upperarmR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'shinL', 'shinR'].map((name, i) => ({ bone: dog.bones[name], angle: 0, velocity: 0, sign: i % 2 ? -1 : 1 }));
  }
  start(vx, vz, heading) {
    if (this.active || this.cooldown > 0) return;
    const speed = Math.hypot(vx, vz);
    if (speed < PUP.impact.threshold) return;
    this.active = true; this.age = 0; this.groundTime = 0; this.weight = 1;
    const side = vx * Math.cos(heading) - vz * Math.sin(heading);
    this.spin = (side < 0 ? -1 : 1) * Math.min(7, speed * 0.8); this.pitchVelocity = -Math.min(3, speed * 0.35);
    for (const j of this.joints) { j.angle = 0; j.velocity = j.sign * speed * 0.7; }
  }
  update(dt, grounded) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.active) return;
    this.age += dt;
    if (grounded) this.groundTime += dt;
    const recover = this.groundTime > 0.16 || this.age > PUP.impact.maxTime;
    this.weight = recover ? Math.max(0, this.weight - dt / PUP.impact.recoverTime) : 1;
    this.spin += (-this.roll * (grounded ? 32 : 3) - this.spin * (grounded ? 8 : 1.7)) * dt;
    this.pitchVelocity += (-this.pitch * 22 - this.pitchVelocity * 7) * dt;
    this.roll = THREE.MathUtils.clamp(this.roll + this.spin * dt, -1.35, 1.35);
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.pitchVelocity * dt, -0.5, 0.5);
    for (const j of this.joints) {
      const target = recover ? 0 : j.sign * 0.55;
      j.velocity += ((target - j.angle) * 35 - j.velocity * 5) * dt;
      j.angle = THREE.MathUtils.clamp(j.angle + j.velocity * dt, -1.1, 1.1);
    }
    if (this.weight === 0) this.reset();
  }
  apply() {
    if (!this.active) return;
    for (const j of this.joints) if (j.bone) {
      E.set(j.angle * this.weight, 0, Math.sin(this.age * 9) * 0.08 * this.weight * j.sign);
      j.bone.quaternion.multiply(Q.setFromEuler(E));
    }
  }
  reset() { this.active = false; this.weight = this.roll = this.pitch = 0; this.cooldown = PUP.impact.cooldown; }
}
