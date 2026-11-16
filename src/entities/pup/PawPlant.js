/** Analytic two-bone IK keeps the player's stance paws on terrain without stretching the skeleton. */
import * as THREE from 'three';
import { PUP } from '../../config/index.js';

export class PawPlant {
  constructor(dog) {
    this.dog = dog;
    this.legs = [['upperarm', 'forearm', 'fpaw', PUP.feet.frontSole], ['thigh', 'shin', 'hpaw', PUP.feet.hindSole]].flatMap(([a, b, c, sole]) => ['L', 'R'].map((side) => ({ a: dog.bones[a + side], b: dog.bones[b + side], c: dog.bones[c + side], sole, lift: 0 })));
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.c = new THREE.Vector3(); this.target = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.bend = new THREE.Vector3(); this.mid = new THREE.Vector3(); this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.parent = new THREE.Quaternion(); this.world = new THREE.Quaternion();
    for (const leg of this.legs) { leg.anchor = new THREE.Vector3(); leg.planted = false; }
  }
  reset() { for(const leg of this.legs){leg.planted=false;leg.lift=0;} }
  update(dt, pup, physics) {
    if (!pup.grounded || pup.swimming || pup.pose || pup.anim?.k?.pose>.2 || pup.mantle || pup.impact.active) { this.reset(); return; }
    const scale = PUP.modelScale;
    this.dog.root.updateMatrixWorld(true);
    for (const leg of this.legs) {
      if (!leg.a || !leg.b || !leg.c) continue;
      leg.a.getWorldPosition(this.a); leg.b.getWorldPosition(this.b); leg.c.getWorldPosition(this.c);
      const ground = physics.groundAt(this.c.x, this.c.z, pup.pos.y + PUP.stepUp), sole = leg.sole * scale;
      const clearance = this.c.y - sole - pup.pos.y;
      if(clearance>PUP.feet.releaseHeight||leg.anchor.distanceToSquared(this.c)>PUP.feet.plantReach**2||Math.abs(pup.turnRate)>4)leg.planted=false;
      if(!leg.planted&&clearance<PUP.feet.plantHeight&&Math.abs(ground-pup.pos.y)<PUP.stepUp){leg.planted=true;leg.anchor.copy(this.c);}
      // Leave lifted swing paws alone; solve stance contact and small slope changes only.
      const wanted = clearance < 0.035 || ground > this.c.y - sole ? ground + sole - this.c.y : 0;
      leg.lift += (THREE.MathUtils.clamp(wanted, -PUP.feet.maxReach, PUP.feet.maxReach) - leg.lift) * (1 - Math.exp(-dt * PUP.feet.blend));
      if (Math.abs(leg.lift) < 0.001 && !leg.planted) continue;
      this.target.copy(this.c); this.target.y += leg.lift;
      if(leg.planted){this.target.x=leg.anchor.x;this.target.z=leg.anchor.z;}
      const l1 = this.a.distanceTo(this.b), l2 = this.b.distanceTo(this.c);
      this.dir.subVectors(this.target, this.a);
      const d = THREE.MathUtils.clamp(this.dir.length(), Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
      this.dir.normalize(); this.target.copy(this.a).addScaledVector(this.dir, d);
      this.bend.subVectors(this.b, this.a).addScaledVector(this.dir, -this.v.subVectors(this.b, this.a).dot(this.dir));
      if (this.bend.lengthSq() < 1e-7) {const direction=leg.b.name.startsWith('forearm')?-1:1;this.bend.set(Math.sin(pup.heading)*direction,.15,Math.cos(pup.heading)*direction);}
      this.bend.normalize();
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), away = Math.sqrt(Math.max(0, l1 * l1 - along * along));
      this.mid.copy(this.a).addScaledVector(this.dir, along).addScaledVector(this.bend, away);
      this.#aim(leg.a, this.v.subVectors(this.b, this.a), this.w.subVectors(this.mid, this.a));
      leg.a.updateWorldMatrix(false, true); leg.b.getWorldPosition(this.b); leg.c.getWorldPosition(this.c);
      this.#aim(leg.b, this.v.subVectors(this.c, this.b), this.w.subVectors(this.target, this.b));
      leg.b.updateWorldMatrix(false, true);
    }
  }
  #aim(bone, from, to) {
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
    this.q.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(this.world); bone.parent.getWorldQuaternion(this.parent).invert();
    bone.quaternion.copy(this.parent.multiply(this.q.multiply(this.world)));
  }
}
