/** Swept camera travel: cinematic flights go over roofs, follow-camera corners retract through the last clear pivot. */
import * as THREE from 'three';
import { PUP } from '../../config/index.js';
import { damp } from '../../core/geo.js';

export class CameraTravel {
  constructor() { this.pos = new THREE.Vector3(); this.anchor = new THREE.Vector3(); this.ready = false; this.route = []; this.speed = 0; }
  reset(pos, anchor) { this.pos.copy(pos); this.anchor.copy(anchor); this.ready = true; this.route.length = 0; this.speed = 0; }

  update(dt, goal, anchor, physics, cinematic, radius = PUP.camera.collisionRadius) {
    const C = PUP.camera, r = radius;
    // A moving shot can bring its endpoint into a house. Approach it from above rather than entering the roof.
    const destination = goal.clone();
    if (physics.sweepSphere(destination, destination, r) < 1) destination.y = physics.clearanceHeight(destination, destination, r) + C.flightClearance;
    if (!this.ready) this.reset(destination, anchor);
    // A just-streamed mesh or moving vehicle may enclose last frame's camera. Recover to a clear endpoint.
    if (physics.sweepSphere(this.pos,this.pos,r)<1) this.reset(destination,anchor);
    if (!this.route.length && physics.sweepSphere(this.pos, destination, r) < 1) {
      if (cinematic || physics.sweepSphere(this.pos,this.anchor,r)<1) {
        const y = Math.max(this.pos.y, destination.y, physics.clearanceHeight(this.pos, destination, r)) + C.flightClearance;
        this.route = [new THREE.Vector3(this.pos.x, y, this.pos.z), new THREE.Vector3(destination.x, y, destination.z), destination.clone()];
        this.rate = Math.max(3, (this.pos.distanceTo(this.route[0]) + this.route[0].distanceTo(this.route[1]) + this.route[1].distanceTo(destination)) / C.returnSeconds);
      } else {
        // This was visible on the previous frame, so it is a safe way around an occluding street corner.
        this.route = [this.anchor.clone(),destination.clone()]; this.rate = Math.max(3, this.pos.distanceTo(this.anchor) * C.retractRate);
      }
    }
    let next = this.pos.clone().lerp(destination,damp(cinematic?C.flightRate:C.retractRate,dt));
    if (this.route.length) {
      const approach = this.route.length>1 ? this.route[this.route.length-2] : this.pos;
      if(physics.sweepSphere(approach,destination,r)===1)this.route[this.route.length-1].copy(destination);
      const waypoint = this.route[0], distance = this.pos.distanceTo(waypoint);
      this.speed += (Math.min(this.rate,Math.max(0.5,distance*C.flightRate))-this.speed)*damp(10,dt);
      next = this.pos.clone().lerp(waypoint, distance > 1e-6 ? Math.min(1, this.speed * dt / distance) : 1);
    }
    // Camera choreography stays gentle at dog height and can still cover the valley during an aerial intro.
    const altitude=Math.max(0,this.pos.y-physics.terrain(this.pos.x,this.pos.z));
    const limit=Math.min(C.maxFlightSpeed,C.flightSpeed+altitude*C.flightHeightSpeed)*dt,distanceToNext=this.pos.distanceTo(next);
    if(distanceToNext>limit)next.lerpVectors(this.pos,next,limit/distanceToNext);
    const distance = this.pos.distanceTo(next), t = physics.sweepSphere(this.pos, next, r);
    if (t < 1) {
      this.pos.lerp(next, Math.max(0, t - C.collisionSkin / Math.max(distance, 1e-6)));
      this.route.length = 0;
    } else {
      this.pos.copy(next);
      if(this.route.length&&this.pos.distanceToSquared(this.route[0])<1e-10)this.route.shift();
    }
    this.anchor.copy(anchor);
    return this.pos;
  }
}
