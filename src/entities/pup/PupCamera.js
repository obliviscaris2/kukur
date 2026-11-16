/**
 * Third-person camera at pup height: smooth follow, never inside houses, FOV kick on zoomies, mouse-wheel
 * zoom down into the pup's own eyes (first person). Cinematics can take over with setShot()/clearShot().
 */
import * as THREE from 'three';
import { PUP } from '../../config/index.js';
import { angDiff, damp, clamp } from '../../core/geo.js';
import { CameraTravel } from './CameraTravel.js';

export class PupCamera {
  constructor(camera) {
    const C = PUP.camera;
    this.cam = camera; this.yaw = 0; this.pitch = C.pitch; this.dist = C.distance; this.want = C.distance;
    this.pivot = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.fp = 0; this.lastLook = 10; this.init = false;
    this.shot = null; this.shotK = 0; this.yawT = 0; this.pitchT = C.pitch; this.dip = 0; this.ahead = new THREE.Vector3();
    this.travel = new CameraTravel(); this.lastPup = new THREE.Vector3();
    this.lookPoint = new THREE.Vector3(); this.lookInit = false;
  }
  /** Small downward nudge (landing impact). */
  bump(k) { this.dip = Math.min(0.25, this.dip + k * 0.12); }
  snapBehind(pup) {
    this.yaw = this.yawT = pup.heading + Math.PI; this.init = false;
    if (this.lastPup.distanceTo(pup.pos) > PUP.camera.teleportDistance) { this.travel.ready = false; this.shotK = 0; this._lastShot = null; this.lookInit = false; }
  }
  /** Teleports happen behind a fade: discard the old cinematic route before any destination frame is revealed. */
  placeBehind(pup, physics) {
    const C=PUP.camera;
    this.clearShot(); this._lastShot=null; this.shotK=0; this.travel.ready=false; this.lookInit=false;
    this.ahead.set(0,0,0); this.dip=0; this.pitch=this.pitchT=C.pitch; this.dist=this.want=C.distance; this.fp=0;
    this.snapBehind(pup);
    this.update(.016,pup,{consumeLook:()=>[0,0,0],hit:()=>false},physics);
  }
  /** Cinematic control: position + look target (Vector3s), blended in. */
  setShot(pos, look) { this.shot = { pos: pos.clone(), look: look.clone() }; }
  clearShot() { this.shot = null; }

  update(dt, pup, input, physics) {
    const C = PUP.camera;
    if(this.travel.ready&&!this.shot&&this.lastPup.distanceTo(pup.pos)>C.teleportDistance)this.snapBehind(pup);
    const [lx, ly, wheel] = input.consumeLook();
    if (lx || ly) this.lastLook = 0; else this.lastLook += dt;
    // mouse look goes to a target that the camera glides to (silky, no jitter)
    this.yawT -= lx * C.sensitivity; this.pitchT = clamp(this.pitchT + ly * C.sensitivity * 0.85, -0.35, 1.25);
    if (wheel) { this.want = clamp(this.want + wheel * 0.45, C.minDistance, C.maxDistance); this.lastWheel = 0; } else this.lastWheel = (this.lastWheel ?? 99) + dt;
    if (input.hit('eyeView')) this.want = this.want < 0.5 ? C.distance : 0;
    // drift back behind the pup while it runs and the mouse is idle (rate grows with speed)
    if (pup.speed > 0.6 && this.lastLook > C.autoAlignAfter) this.yawT += angDiff(this.yawT, pup.heading + Math.PI) * Math.min(1, dt * C.autoAlignRate * Math.min(1.5, pup.speed / 2));
    // hands off the mouse for a moment: glide home — behind the pup, default angle, default zoom (never from first person)
    if (this.lastLook > C.homeAfter && !this.shot) {
      const k = Math.min(1, dt * C.homeRate * Math.min(1, (this.lastLook - C.homeAfter) / 1.5));
      if (pup.speed <= 0.6) this.yawT += angDiff(this.yawT, pup.heading + Math.PI) * k;
      this.pitchT += (C.pitch - this.pitchT) * k;
      if (this.lastWheel > C.homeZoomAfter && this.want > 0.5) this.want += (C.distance - this.want) * k;
    }
    const ls = damp(C.lookSmoothing, dt);
    this.yaw += angDiff(this.yaw, this.yawT) * ls; this.pitch += (this.pitchT - this.pitch) * ls;
    this.dip *= 1 - damp(6, dt);
    const pull = pup.sprinting ? C.sprintPullback * Math.min(1, pup.speed / 4) : 0;
    this.dist += (this.want + (this.want > 0.5 ? pull : 0) - this.dist) * damp(5, dt);
    this.fp += ((this.want < 0.5 ? 1 : 0) - this.fp) * damp(8, dt);
    // pivot leads slightly in the direction of travel; vertical follow is lazier (hops don't jolt the view)
    const f = pup.forward();
    this.ahead.x += (f.x * pup.speed * C.lookAhead * 0.25 - this.ahead.x) * damp(3, dt);
    this.ahead.z += (f.z * pup.speed * C.lookAhead * 0.25 - this.ahead.z) * damp(3, dt);
    const target = new THREE.Vector3(pup.pos.x + this.ahead.x, pup.pos.y + C.height - this.dip, pup.pos.z + this.ahead.z);
    if (!this.init) this.pivot.copy(target);
    this.pivot.x += (target.x - this.pivot.x) * damp(C.followLag, dt);
    this.pivot.z += (target.z - this.pivot.z) * damp(C.followLag, dt);
    this.pivot.y += (target.y - this.pivot.y) * damp(pup.grounded ? 7 : 3, dt);
    const anchor = pup.pos.clone().add(new THREE.Vector3(0, C.height, 0));
    this.#clip(anchor, this.pivot, physics, C.collisionRadius);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), d = Math.max(0.01, this.dist);
    const want = new THREE.Vector3(this.pivot.x + Math.sin(this.yaw) * cp * d, this.pivot.y + 0.25 + sp * d, this.pivot.z + Math.cos(this.yaw) * cp * d);
    const radius = Math.max(C.collisionRadius, this.cam.near * Math.hypot(1, Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * Math.hypot(1, this.cam.aspect)));
    const frac = this.#clip(this.pivot, want, physics, radius);
    if (!this.init) { this.pos.copy(want); this.init = true; }
    this.pos.lerp(want, damp(frac < 1 ? C.retractRate : C.extendRate, dt));
    this.#clip(this.pivot, this.pos, physics, radius);
    const eye = pup.eyePosition();
    const camPos = this.pos.clone().lerp(eye, this.fp);
    const look = new THREE.Vector3(this.pivot.x, this.pivot.y + 0.1, this.pivot.z);
    if (this.fp > 0.01) look.lerp(eye.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * cp, -Math.sin(this.pitch) * 0.8, -Math.cos(this.yaw) * cp)), this.fp);
    // cinematic blend
    this.shotK += ((this.shot ? 1 : 0) - this.shotK) * damp(this.shot ? 3 : 2, dt);
    if (this.shotK > 0.001 && this.shot) { camPos.lerp(this.shot.pos, this.shotK); look.lerp(this.shot.look, this.shotK); }
    else if (this.shotK > 0.001 && this._lastShot) { camPos.lerp(this._lastShot.pos, this.shotK); look.lerp(this._lastShot.look, this.shotK); }
    if (this.shot) this._lastShot = this.shot;
    // Check the final cinematic blend and its entire travelled segment, not just the follow-camera boom.
    const cinematic = !!this.shot || this.shotK > 0.001;
    if (!cinematic) this.#clip(anchor, camPos, physics, radius);
    this.cam.position.copy(this.travel.update(dt, camPos, this.pivot, physics, cinematic, radius));
    if(!this.lookInit){this.lookPoint.copy(look);this.lookInit=true;}
    this.lookPoint.lerp(look,damp(cinematic?C.flightRate:C.lookSmoothing,dt));this.cam.lookAt(this.lookPoint);
    this.lastPup.copy(pup.pos);
    pup.dog.model.visible = (this.fp < 0.6 || this.shotK > 0.5) && this.cam.position.distanceTo(pup.pos) > 0.3;
    const fov = C.fov + (pup.sprinting && pup.speed > 3 ? C.sprintFovKick : 0) + this.fp * 8;
    const nextFov = this.cam.fov + (fov - this.cam.fov) * damp(4, dt);
    if (Math.abs(nextFov - this.cam.fov) > 0.005) { this.cam.fov = nextFov; this.cam.updateProjectionMatrix(); }
  }

  #clip(from, to, physics, radius) {
    const t = physics.sweepSphere(from, to, radius), distance = from.distanceTo(to);
    if (t < 1) to.lerpVectors(from, to, Math.max(0, t - PUP.camera.collisionSkin / Math.max(distance, 1e-6)));
    return t;
  }
}
