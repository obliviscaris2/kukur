/** Living tree bases and permanent temple diyos, with two bounded pools of bounced light shared by the scene. */
import * as THREE from 'three';
import { NATURE, LANDMARKS } from '../../config/index.js';
import { rng, hash } from '../../core/rng.js';
import { U } from '../../render/toon.js';
import { natureMaterial } from '../../render/natureMaterial.js';
import { gardenGeometry, garlandGeometry } from '../props/natureGeometry.js';
import { DiyoField } from '../festival/DiyoField.js';

const UP = new THREE.Vector3(0, 1, 0),
  S = NATURE.shrines,
  P = NATURE.planting;

/** Local terrace rims rotated exactly like the landmark; leave the middle of every approach open. */
export function shrineLamps(landmark, meta, heightAt, solidAt) {
  if (!meta || !landmark.object) return [];
  const list = [],
    size = landmark.size,
    angle = landmark.object.rotation.y,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const at = (u, v) => [landmark.x + u * c + v * s, landmark.z - u * s + v * c];
  if (meta.round) {
    const radius = size * 0.5 - S.edgeInset,
      count = Math.min(64, Math.ceil((radius * Math.PI * 2) / S.spacing));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.13 || Math.abs(Math.cos(a)) < 0.13) continue;
      const [x, z] = at(Math.sin(a) * radius, Math.cos(a) * radius),
        y = heightAt(x, z);
      if (!solidAt(x, y + 0.08, z)) list.push({ x, y, z, yaw: angle + a });
    }
  } else {
    const half = size * 0.5 - S.edgeInset,
      depth = LANDMARKS.shapes[landmark.model]?.depth ?? 1,
      count = Math.min(S.maxPerSide, Math.floor(size / S.spacing));
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < count; i++) {
        const along = (i - (count - 1) / 2) * Math.min(S.spacing, (size * 0.85) / Math.max(1, count - 1));
        if (Math.abs(along) < 0.65) continue;
        const a = (side * Math.PI) / 2,
          u = Math.sin(a) * half + Math.cos(a) * along,
          v = (Math.cos(a) * half - Math.sin(a) * along) * depth;
        const [x, z] = at(u, v),
          y = heightAt(x, z);
        if (!solidAt(x, y + 0.08, z)) list.push({ x, y, z, yaw: angle + a });
      }
  }
  return list;
}

export class Sanctuary {
  constructor(scene) {
    this.gardens = new THREE.InstancedMesh(gardenGeometry(), natureMaterial('garden'), P.capacity);
    this.gardens.count = 0;
    this.gardens.visible = false;
    this.gardens.frustumCulled = false;
    this.gardens.receiveShadow = true;
    scene.add(this.gardens);
    this.diyos = new DiyoField(scene, S.capacity, true);
    this.garlands = new THREE.InstancedMesh(garlandGeometry(), natureMaterial('garland', null), 64);
    this.garlands.count = 0;
    this.garlands.visible = false;
    this.garlands.frustumCulled = false;
    scene.add(this.garlands);
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.clock = 0;
    this.lights = [];
    this.sites = [];
    this.slots = Array.from({ length: S.lightSlots }, () => ({ light: null, level: 0 }));
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.yaw = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.colour = new THREE.Color();
  }

  update(dt, { focus, props, landmarks, physics, heightAt, waterAt, night, streetLights=[] }) {
    this.clock -= dt;
    if (this.clock <= 0 || this.last.distanceToSquared(focus) > 4) {
      this.clock = P.refresh;
      this.last.copy(focus);
      this.lights = [];
      this.sites = [];
      this.#gardens(focus, props, physics, heightAt, waterAt);
      this.#shrines(focus, landmarks, physics, heightAt);
      this.lights.push(...streetLights);
      this.lights = this.lights.filter(l => Number.isFinite(l.position.x+l.position.y+l.position.z+l.radius+l.power) && l.radius>0 && l.power>=0);
      this.lights.sort((a, b) => a.position.distanceToSquared(focus) - b.position.distanceToSquared(focus));
      this.lights = this.lights.slice(0, S.lightSlots);
    }
    this.diyos.update(night);
    this.#lightSlots(dt, night);
  }

  #lightSlots(dt, night) {
    const remaining = new Set(this.lights),
      wanted = new Set();
    for (const slot of this.slots) {
      const match = [...remaining].find((l) => slot.light && l.position.distanceToSquared(slot.light.position) < 0.01);
      if (match) {
        slot.light = match;
        remaining.delete(match);
        wanted.add(slot);
      }
    }
    for (let i = 0; i < S.lightSlots; i++) {
      const slot = this.slots[i];
      if (!wanted.has(slot) && slot.level < 0.015) {
        slot.light = remaining.values().next().value || null;
        if (slot.light) {
          remaining.delete(slot.light);
          wanted.add(slot);
        }
      }
      slot.level += ((wanted.has(slot) ? 1 : 0) - slot.level) * (1 - Math.exp(-dt * S.fade));
      const light = slot.light,
        p = U.uShrinePos.value[i],
        colour = U.uShrineColour.value[i];
      if (!light) {
        p.w = 0;
        colour.set(0, 0, 0);
        continue;
      }
      p.set(light.position.x, light.position.y, light.position.z, light.radius);
      colour
        .set(light.colour.r, light.colour.g, light.colour.b)
        .multiplyScalar(light.power * (light.warm ? 0.2 + 0.8 * night : night) * slot.level);
    }
  }

  #gardens(focus, props, physics, heightAt, waterAt) {
    let count = 0;
    const trees = props
      .treesNear(focus, P.radius, 64)
      .sort((a, b) => (a[0] - focus.x) ** 2 + (a[2] - focus.z) ** 2 - ((b[0] - focus.x) ** 2 + (b[2] - focus.z) ** 2));
    for (const [x, , z, kind, scale] of trees) {
      if (kind === 1 || kind === 3) continue;
      const random = rng(hash(Math.round(x * 10), Math.round(z * 10), 'garden'));
      for (let j = 0; j < P.perTree && count < P.capacity; j++) {
        const a = j * 2.399963 + random(),
          r = (0.85 + random() * 0.8) * scale,
          px = x + Math.sin(a) * r,
          pz = z + Math.cos(a) * r,
          h = heightAt(px, pz);
        if (
          waterAt(px, pz) !== null ||
          physics.solidAt(px, h + 0.25, pz) ||
          !physics.isBoxFree({ x: px, z: pz, y: h, heading: 0, halfWidth: 0.3, halfLength: 0.3, height: 0.5 }, 0.04)
        )
          continue;
        const dx = (heightAt(px + 0.25, pz) - heightAt(px - 0.25, pz)) / 0.5,
          dz = (heightAt(px, pz + 0.25) - heightAt(px, pz - 0.25)) / 0.5;
        if (Math.hypot(dx, dz) > P.maxSlope) continue;
        this.normal.set(-dx, 1, -dz).normalize();
        this.quaternion.setFromUnitVectors(UP, this.normal);
        this.yaw.setFromAxisAngle(UP, a);
        this.quaternion.multiply(this.yaw);
        this.matrix.compose(this.position.set(px, h + 0.012, pz), this.quaternion, this.scale.setScalar(0.75 + random() * 0.5));
        this.gardens.setMatrixAt(count++, this.matrix);
      }
      if (kind === 2) {
        const a = random() * Math.PI * 2,
          px = x + Math.sin(a) * 0.9,
          pz = z + Math.cos(a) * 0.9,
          h = heightAt(px, pz);
        if (!physics.solidAt(px, h + 0.35, pz))
          this.lights.push({
            position: new THREE.Vector3(px, h + 0.35, pz),
            colour: new THREE.Color(S.cool),
            power: S.coolPower,
            radius: S.coolRadius,
            warm: false,
          });
      }
    }
    this.gardens.count = count;
    this.gardens.visible = count > 0;
    this.gardens.instanceMatrix.needsUpdate = true;
  }

  #shrines(focus, landmarks, physics, heightAt) {
    this.diyos.begin();
    let garlands = 0;
    const nearby = [...landmarks.all()]
      .filter((l) => l.object && l.model !== 'tower' && Math.hypot(l.x - focus.x, l.z - focus.z) < S.radius + l.size * 0.5)
      .sort((a, b) => (a.x - focus.x) ** 2 + (a.z - focus.z) ** 2 - ((b.x - focus.x) ** 2 + (b.z - focus.z) ** 2));
    for (const landmark of nearby) {
      const lamps = shrineLamps(landmark, landmarks.meta[landmark.model], heightAt, (x, y, z) => physics.solidAt(x, y, z));
      for (const p of lamps) {
        const distance = Math.hypot(p.x - focus.x, p.z - focus.z);
        if (distance < S.radius) this.diyos.push(p.x, p.y, p.z, p.yaw, distance < NATURE.diyo.bodyRadius);
      }
      if (!lamps.length) continue;
      this.sites.push(landmark.name || landmark.model);
      const meta = landmarks.meta[landmark.model];
      if (!meta.round && !LANDMARKS.shapes[landmark.model]?.arch) {
        const half = (meta.core * landmark.size) / 2,
          angle = landmark.object.rotation.y,
          y =
            landmark.object.position.y +
            (meta.steps * meta.step_h + (LANDMARKS.shapes[landmark.model]?.core_h ?? meta.core_h) * 0.78) * landmark.size;
        for (let side = 0; side < 4 && garlands < 64; side++) {
          const a = (side * Math.PI) / 2,
            u = Math.sin(a) * (half + 0.08),
            v = Math.cos(a) * (half + 0.08),
            c = Math.cos(angle),
            s = Math.sin(angle);
          this.position.set(landmark.x + u * c + v * s, y, landmark.z - u * s + v * c);
          this.quaternion.setFromAxisAngle(UP, angle + a);
          this.matrix.compose(this.position, this.quaternion, this.scale.set(half * 0.9, 1, 1));
          this.garlands.setMatrixAt(garlands++, this.matrix);
        }
      }
      // A compact group of oil lamps lights the approach. Light positions are outside the sanctum walls.
      const groups = [0, 1, 2, 3].map((side) => lamps.filter((_, i) => i % 4 === side));
      for (const group of groups) {
        if (!group.length) continue;
        const p = group.reduce(
          (best, p) => (Math.hypot(p.x - focus.x, p.z - focus.z) < Math.hypot(best.x - focus.x, best.z - focus.z) ? p : best),
          group[0],
        );
        const position = new THREE.Vector3(p.x, p.y + 0.28, p.z);
        if (!this.lights.some((l) => l.warm && l.position.distanceToSquared(position) < 9))
          this.lights.push({ position, colour: new THREE.Color(S.warm), power: S.warmPower, radius: S.warmRadius, warm: true });
      }
    }
    this.diyos.end();
    this.garlands.count = garlands;
    this.garlands.visible = garlands > 0;
    this.garlands.instanceMatrix.needsUpdate = true;
  }
}
