/** Continuous lane traffic with safe following, reserved junctions, solid footprints and a small curbside rider population. */
import * as THREE from 'three';
import { TRAFFIC, HEALTH, PUP } from '../../config/index.js';
import { events } from '../../core/events.js';
import { angDiff, clamp } from '../../core/geo.js';
import { boxOverlap } from '../../core/collision.js';
import { toon } from '../../render/toon.js';
import { vehicleModels } from './VehicleModels.js';
import { RoadNetwork, edgeFor, lanePoint, makeTurn, makeCurve, sampleCurve, isBike } from './RoadNetwork.js';

const DIMS = TRAFFIC.bodies;

export class Traffic {
  constructor(scene, world, quality, audio) {
    Object.assign(this, { scene, world, audio });
    this.max = TRAFFIC.max[quality.npc] ?? TRAFFIC.max.low;
    this.maxWaiting = TRAFFIC.waitingRiders.max[quality.npc] ?? 2;
    this.types = {}; this.cars = []; this.colliders = []; this.navs = []; this.network = new RoadNetwork();
    this.reservations = new Map(); this.dirty = true; this.time = 0; this.ids = 0; this._t = 0;
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(1, 1, 1); this.P = new THREE.Vector3(); this.E = new THREE.Euler();
    const material = toon('#ffffff', { key: 'vehicle', params: { vertexColors: true }, rim: 0.22 });
    const capacity = TRAFFIC.max.high + TRAFFIC.waitingRiders.max.high + 8;
    for (const [name, [paint, trim]] of Object.entries(vehicleModels(TRAFFIC.detail[quality.npc]))) {
      const a = new THREE.InstancedMesh(paint, material, capacity), b = new THREE.InstancedMesh(trim, material, capacity);
      for (const m of [a, b]) { m.count = 0; m.visible = false; m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
      a.setColorAt(0, new THREE.Color()); this.types[name] = { paint: a, trim: b, list: [] };
    }
    world.physics.bodies.push(() => this.colliders);
    world.physics.dynamic.push((x, z) => this.surfaceAt(x, z));
    world.onTile((event, tile) => {
      if (event === 'load') for (const nav of tile.data.navs) { nav.tile = tile.key; this.navs.push(nav); }
      else this.navs = this.navs.filter((nav) => nav.tile !== tile.key);
      this.dirty = true;
    });
  }

  #ground(x, z) { return (this.world.terrain?.(x, z) ?? this.world.heightAt(x, z)) + TRAFFIC.roadLift; }
  #box(c, point = c) { return { x: point.x, z: point.z, y: this.#ground(point.x, point.z), heading: point.heading, halfWidth: DIMS[c.type][1] * 0.5, halfLength: DIMS[c.type][0] * 0.5, height: DIMS[c.type][2] }; }
  #free(c, point, cars = true) {
    const b = this.#box(c, point);
    if (!Number.isFinite(b.x + b.z + b.heading) || !this.world.physics.isBoxFree(b)) return false;
    if (cars) for (const other of this.cars) {
      if (other === c || Math.abs(other.x - b.x) > 12 || Math.abs(other.z - b.z) > 12) continue;
      if (boxOverlap(b, this.#box(other), 0.06)) return false;
    }
    if(cars)for(const p of this.people||[]) {
      if(Math.abs(p.pos.x-b.x)>8||Math.abs(p.pos.z-b.z)>8||Math.abs(p.pos.y-b.y)>1.5)continue;
      const cs=Math.cos(b.heading),sn=Math.sin(b.heading),dx=p.pos.x-b.x,dz=p.pos.z-b.z,x=dx*cs-dz*sn,z=dx*sn+dz*cs;
      if(Math.hypot(x-clamp(x,-b.halfWidth,b.halfWidth),z-clamp(z,-b.halfLength,b.halfLength))<0.22)return false;
    }
    return true;
  }
  #visible(x, z, radius = 2.6) {
    if (!this.frustum) return false;
    this.sphere.center.set(x, this.#ground(x, z) + 0.8, z); this.sphere.radius = radius;
    if (!this.frustum.intersectsSphere(this.sphere)) return false;
    return !this.eye || this.world.physics.rayFrac(this.eye, this.sphere.center, 0.9) > 0.94;
  }
  #rebuild() {
    this.network.rebuild(this.navs); this.dirty = false;
    events.emit('trafficJunctions', { junctions: this.network.nodes.filter(n=>n.out.length>=3&&n.out.some(e=>e.w>=5.5)).map(n=>({x:n.x,z:n.z,tile:n.out[0].nav.tile,arms:n.out.map(e=>[Math.atan2(e.ux,e.uz),'',e.w])})) });
    this.cars = this.cars.filter((c) => {
      if (!c.edge || c.virtual) return true;
      const edge = this.network.byId.get(c.edge.id); if (!edge) return false;
      c.edge = edge; c.plan = null;
      if (c.turn?.next?.id && !this.network.byId.has(c.turn.next.id)) { c.turn = null; c.s = Math.min(c.s, edge.length - 0.1); }
      else if(c.turn) { c.turn.next=this.network.byId.get(c.turn.next.id); c.turn.node=edge.to; }
      c.planRetry=0;
      return true;
    });
  }
  #newCar(edge, type, distance, waiting = false) {
    const point = lanePoint(edge, distance, type), c = { id: ++this.ids, edge, type, s: distance, ...point, y: this.#ground(point.x, point.z), speed: 0, max: TRAFFIC.speed[type] * (0.88 + Math.random() * 0.22), nav: edge.nav, seg: edge.seg, dir: edge.dir, t: distance / edge.length, wait: 0, honkT: 0, pause: 0, hitCooldown: 0, bob: Math.random() * 6, staticBlocked: 0, stoppedFor: 0, age: 0, waiting, small: isBike(type) || type === 'rickshaw' };
    const color = type === 'taxi' ? '#e9e7df' : type === 'bus' ? '#448064' : type === 'tempo' ? '#65926c' : type === 'microbus' ? '#d9ddd8' : TRAFFIC.colors[Math.floor(Math.random() * TRAFFIC.colors.length)];
    c.color = new THREE.Color(color);
    if (waiting) {
      Object.assign(c, lanePoint(edge, distance, type, edge.w * 0.5 - TRAFFIC.waitingRiders.kerbInset));
      c.waitT = THREE.MathUtils.lerp(...TRAFFIC.waitingRiders.seconds, Math.random()); c.max = TRAFFIC.speed.pathao;
    }
    return c;
  }
  #spawn(focus, waiting = false) {
    const edges = this.network.edges;
    if (!edges.length) return false;
    for (let tries = 0; tries < TRAFFIC.spawnAttempts; tries++) {
      const edge = edges[Math.floor(Math.random() * edges.length)];
      if (edge.length < (waiting ? 20 : 4)) continue;
      const distance = edge.length * (0.12 + Math.random() * 0.48), point = lanePoint(edge, distance, 'scooter');
      const d = Math.hypot(point.x - focus.x, point.z - focus.z);
      if (d < TRAFFIC.spawnRadius[0] || d > TRAFFIC.spawnRadius[1] || (d < TRAFFIC.seenSpawnDistance && this.#visible(point.x, point.z))) continue;
      const pool = Object.entries(TRAFFIC.mix).filter(([type]) => this.network.accepts(edge, type) && edge.length > DIMS[type][0] * 1.4);
      if (!pool.length) continue;
      let type = 'scooter', pick = Math.random() * pool.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [name, weight] of pool) if ((pick -= weight) <= 0) { type = name; break; }
      if (waiting) {
        if (edge.w < TRAFFIC.waitingRiders.minRoad || edge.kind === 'pedestrian' || edge.to.out.length > 2 && edge.length - distance < 14) continue;
        if (this.cars.some((c) => c.waiting && Math.hypot(c.x - point.x, c.z - point.z) < TRAFFIC.waitingRiders.spacing)) continue;
        type = 'pathao';
      }
      const c = this.#newCar(edge, type, distance, waiting);
      if (!waiting && !this.network.next(edge, type)) continue;
      if (!this.#free(c, c) || (!waiting && !this.#free(c, lanePoint(edge, Math.min(edge.length, distance + 3), type), false))) continue;
      c.speed = waiting ? 0 : c.max * 0.65;
      this.cars.push(c); return true;
    }
    return false;
  }
  #plan(c) {
    if (c.plan || c.turn || c.waiting || c.planRetry > this.time) return;
    if (c.edge.length - c.s > Math.max(TRAFFIC.route.lookAhead, TRAFFIC.turnRadius[c.type] * 2 + 4)) return;
    const tried = new Set();
    for (let i = 0; i < 8; i++) {
      const next = this.network.next(c.edge, c.type);
      if (!next || tried.has(next.id)) continue; tried.add(next.id);
      if (next.id === c.avoidNext && c.avoidUntil > this.time) continue;
      let curve = makeTurn(c.edge, next, c.type);
      if (c.s > curve.start + 0.1) {
        const end = lanePoint(next, curve.exit, c.type), f = { x: Math.sin(c.heading), z: Math.cos(c.heading) };
        curve = makeCurve([{ x: c.x, z: c.z }, { x: c.x + f.x * 1.2, z: c.z + f.z * 1.2 }, lanePoint(next, 0, c.type), end], { start: c.s, exit: curve.exit, next, node: c.edge.to });
      }
      let free = true;
      for (let s = 0; s <= curve.length; s += 0.65) if (!this.#free(c, sampleCurve(curve, s), false)) { free = false; break; }
      if (free) { c.plan = curve; c.deadEnd = false; c.planRetry = 0; return; }
    }
    c.deadEnd = true; c.planRetry = this.time + TRAFFIC.route.planRetry;
  }
  #travel(c, distance) {
    if (c.turn) {
      c.curveS += distance;
      if (c.curveS < 0) { c.s = c.turn.start + c.curveS; c.turn = null; c.plan = null; return lanePoint(c.edge, Math.max(0, c.s), c.type); }
      if (c.curveS <= c.turn.length) return sampleCurve(c.turn, c.curveS);
      const curve = c.turn;
      c.edge = curve.next; c.s = curve.exit + c.curveS - curve.length; c.turn = null; c.plan = null; c.deadEnd = false;
      if (c.reserved && this.reservations.get(c.reserved)?.id === c.id) this.reservations.delete(c.reserved); c.reserved = null;
      return lanePoint(c.edge, Math.min(c.edge.length, c.s), c.type);
    }
    c.s = Math.max(0.01, c.s + distance);
    if (c.plan && c.s >= c.plan.start) { c.turn = c.plan; c.curveS = c.s - c.plan.start; return sampleCurve(c.turn, c.curveS); }
    // A centre must reach the next curve even on very short OSM segments. Only a
    // genuine dead end stops a bumper short of the end of the road.
    const margin = c.deadEnd ? DIMS[c.type][0] * 0.5 + 0.3 : 0.01;
    c.s = Math.min(c.s, Math.max(0.01, c.edge.length - margin));
    return lanePoint(c.edge, c.s, c.type);
  }
  #desired(c, pup, people, signals) {
    if (c.pause > 0) return 0;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading), half = DIMS[c.type][0] * 0.5, width = DIMS[c.type][1] * 0.5;
    let gap = Infinity, reason = '', limit = c.max;
    const obstacle = (x, z, radius, front = 0) => {
      const dx = x - c.x, dz = z - c.z, along = dx * fx + dz * fz;
      if (along <= 0 || along > TRAFFIC.route.lookAhead + half || Math.abs(dx * fz - dz * fx) > width + radius) return;
      gap = Math.min(gap, along - half - front); reason = 'crossing';
    };
    const ownRoof = pup.pos.y >= (this.#surface(c, pup.pos.x, pup.pos.z) ?? c.y + DIMS[c.type][2]) - 0.03;
    if (!ownRoof && Math.abs(pup.pos.y - c.y) < 1.2) obstacle(pup.pos.x, pup.pos.z, PUP.radius, PUP.radius);
    for (const p of people) if (Math.abs(p.pos.y - c.y) < 1.5) obstacle(p.pos.x, p.pos.z, 0.22, 0.24);
    for (const other of this.cars) {
      if (other === c || Math.hypot(other.x - c.x, other.z - c.z) > TRAFFIC.route.lookAhead + 10) continue;
      const delta = angDiff(c.heading, other.heading), projectedLength = Math.abs(Math.cos(delta)) * DIMS[other.type][0] * 0.5 + Math.abs(Math.sin(delta)) * DIMS[other.type][1] * 0.5;
      obstacle(other.x, other.z, DIMS[other.type][1] * 0.5 + 0.08, projectedLength);
    }
    if (c.turn) limit = Math.min(limit, isBike(c.type) ? 4 : 3.2);
    if (c.plan && !c.turn) {
      const left = c.plan.start - c.s, junction = c.plan.node;
      if (left < 12 && junction.out.length >= 3) {
        const held = this.reservations.get(junction.id);
        if (held && held.id !== c.id && held.until > this.time) { gap = Math.min(gap, Math.max(0, left - TRAFFIC.route.stopLine)); reason = 'junction'; }
        else if (left < 5) { this.reservations.set(junction.id, { id: c.id, until: this.time + TRAFFIC.route.reservationTime }); c.reserved = junction.id; }
      }
      if (left < 10) limit = Math.min(limit, 3.5 + Math.max(0, left - 3) * 0.4);
    } else if (c.deadEnd) { gap = Math.min(gap, c.edge.length - c.s - half - 0.5); reason = 'end'; }
    for (const signal of signals) {
      const dx = signal.x - c.x, dz = signal.z - c.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      const stopped = signal.hold || (signal.axis === 'ns' ? Math.abs(fz) < 0.7 : Math.abs(fx) < 0.7);
      if (stopped && along > 0 && along < signal.radius + 12 && side < signal.radius * 0.65) { gap = Math.min(gap, Math.max(0, along - signal.radius * 0.55 - half)); reason = 'police'; }
    }
    const spacing = isBike(c.type) ? TRAFFIC.route.bikeGap : TRAFFIC.route.minGap;
    if (Number.isFinite(gap)) {
      const reaction = TRAFFIC.route.braking * TRAFFIC.route.reaction;
      limit = Math.min(limit, Math.sqrt(reaction * reaction + 2 * TRAFFIC.route.braking * Math.max(0, gap - spacing)) - reaction);
    }
    c.reason = limit < 0.2 ? reason : ''; return Math.max(0, limit);
  }
  #move(c, distance) {
    const snapshot = { edge: c.edge, s: c.s, turn: c.turn, curveS: c.curveS, plan: c.plan, deadEnd: c.deadEnd };
    const point = this.#travel(c, distance), dx = point.x - c.x, dz = point.z - c.z, dh = angDiff(c.heading, point.heading);
    const radius = Math.hypot(DIMS[c.type][0], DIMS[c.type][1]) * 0.5;
    const steps = Math.max(1, Math.ceil((Math.hypot(dx, dz) + Math.abs(dh) * radius) / 0.22));
    for (let i = 1; i <= steps; i++) if (!this.#free(c, { x: c.x + dx * i / steps, z: c.z + dz * i / steps, heading: c.heading + dh * i / steps })) { Object.assign(c, snapshot); return false; }
    c.vx = dx; c.vz = dz; c.lastHeading = c.heading; c.x = point.x; c.z = point.z; c.heading += dh; c.y = this.#ground(c.x, c.z);
    c.nav = c.edge.nav; c.seg = c.edge.seg; c.dir = c.edge.dir; c.t = c.s / c.edge.length;
    return true;
  }
  #waiting(c, dt, pup) {
    c.waitT -= dt;
    if (c.waitT > 0) return;
    if (!c.merge) {
      const end = lanePoint(c.edge, Math.min(c.edge.length - 0.5, c.s + TRAFFIC.waitingRiders.mergeDistance), c.type);
      const f = { x: Math.sin(c.heading), z: Math.cos(c.heading) };
      c.merge = makeCurve([{ x: c.x, z: c.z }, { x: c.x + f.x * 2, z: c.z + f.z * 2 }, { x: end.x - f.x * 2, z: end.z - f.z * 2 }, end], { exit: Math.min(c.edge.length - 0.5, c.s + TRAFFIC.waitingRiders.mergeDistance) }); c.mergeS = 0;
    }
    const distance = Math.min(c.merge.length, c.mergeS + dt * 2), point = sampleCurve(c.merge, distance);
    if (Math.hypot(point.x - pup.pos.x, point.z - pup.pos.z) < 1.2 || !this.#free(c, point)) return;
    c.mergeS = distance; c.x = point.x; c.z = point.z; c.heading = point.heading; c.y = this.#ground(c.x, c.z); c.speed = 2;
    if (distance >= c.merge.length) { c.waiting = false; c.s = c.merge.exit; c.merge = null; c.plan = null; }
  }
  #tick(c, dt, pup, people, signals) {
    c.age = (c.age || 0) + dt; c.pause = Math.max(0, (c.pause || 0) - dt); c.hitCooldown = Math.max(0, (c.hitCooldown || 0) - dt); c.honkT = Math.max(0, (c.honkT || 0) - dt);
    if (!c.edge) { c.edge = edgeFor(c.nav, c.seg, c.dir); c.s = c.t * c.edge.length; c.virtual = true; c.id ??= ++this.ids; c.color ??= new THREE.Color('#d7dedb'); }
    if (c.waiting) { this.#waiting(c, dt, pup); return; }
    this.#plan(c);
    c.clutterT = (c.clutterT || 0) - dt;
    if ((c.speed > 0.2 || c.reason === 'blocked') && c.clutterT <= 0 && Math.hypot(c.x-pup.pos.x,c.z-pup.pos.z)<65) {
      const dx=Math.sin(c.heading),dz=Math.cos(c.heading),front=DIMS[c.type][0]*.5+TRAFFIC.clutter.reach;
      events.emit('trafficBrush',{pos:{x:c.x+dx*front,y:c.y,z:c.z+dz*front},dx,dz,power:Math.max(c.speed,TRAFFIC.clutter.minPush)*TRAFFIC.clutter.power,reach:DIMS[c.type][1]*.5+TRAFFIC.clutter.reach});
      c.clutterT=TRAFFIC.clutter.interval;
    }
    let target = this.#desired(c, pup, people, signals), distance;
    if (c.recoverLeft > 0) { target = c.speed = 1.1; distance = -Math.min(c.recoverLeft, dt * target); c.recoverLeft += distance; c.gear = -1; }
    else { c.gear = 1; const rate = target < c.speed ? TRAFFIC.route.braking : TRAFFIC.route.acceleration; c.speed += clamp(target - c.speed, -rate * dt, rate * dt); distance = Math.max(0, c.speed) * dt; }
    const oldX = c.x, oldZ = c.z;
    if (distance && !this.#move(c, distance)) {
      c.speed = 0; c.staticBlocked = (c.staticBlocked || 0) + dt; c.reason = 'blocked';
      if (c.staticBlocked > 2.2 && c.s > 2 && !c.turn) { c.recoverLeft = Math.min(1.8, c.s - 0.3); c.avoidNext = c.plan?.next.id; c.avoidUntil = this.time + 12; c.plan = null; c.staticBlocked = 0; }
    } else c.staticBlocked = 0;
    c.stoppedFor = c.speed < 0.15 ? (c.stoppedFor || 0) + dt : 0;
    if (c.stoppedFor > 5 && !c.honkT && Math.hypot(c.x - pup.pos.x, c.z - pup.pos.z) < 30) { this.audio?.honk?.(Math.hypot(c.x - pup.pos.x, c.z - pup.pos.z), { x: c.x, y: c.y, z: c.z }, c.type === 'bus'); c.honkT = 8 + Math.random() * 5; }
    c.wob = Math.max(0, (c.wob || 0) - dt * 1.5);
    const endX = c.x, endZ = c.z, n = Math.max(1, Math.ceil(Math.hypot(endX - oldX, endZ - oldZ) / 0.15));
    for (let i = 1; i <= n; i++) { c.x = oldX + (endX - oldX) * i / n; c.z = oldZ + (endZ - oldZ) * i / n; this.#hitPup(c, pup); }
    c.x = endX; c.z = endZ;
  }
  #hitPup(c, pup) {
    const [len, wid, height] = DIMS[c.type], fx = Math.sin(c.heading), fz = Math.cos(c.heading), ox = pup.pos.x - c.x, oz = pup.pos.z - c.z;
    const side = ox * fz - oz * fx, along = ox * fx + oz * fz, sx = clamp(side, -wid / 2, wid / 2), sz = clamp(along, -len / 2, len / 2);
    let dx = side - sx, dz = along - sz, d = Math.hypot(dx, dz);
    const radius = PUP.radius + PUP.bodyHalfLength * 0.65, top = this.#surface(c, pup.pos.x, pup.pos.z) ?? c.y + height;
    if (d >= radius || pup.pos.y >= top - 0.025 || pup.pos.y + PUP.bodyHeight < c.y) return;
    if (d < 1e-5) { if (wid / 2 - Math.abs(side) < len / 2 - Math.abs(along)) dx = side < 0 ? -1 : 1; else dz = along < 0 ? -1 : 1; d = 1; }
    const nx = dx / d * fz + dz / d * fx, nz = -dx / d * fx + dz / d * fz;
    const depth = Math.hypot(side - sx, along - sz) < 1e-5 ? radius + Math.min(wid / 2 - Math.abs(side), len / 2 - Math.abs(along)) : radius - d;
    pup.pos.x += nx * (depth + 0.001); pup.pos.z += nz * (depth + 0.001); this.world.physics.collide(pup.pos, PUP.radius, PUP.bodyHeight);
    if (!this.calm && !c.waiting && c.gear !== -1 && c.speed > TRAFFIC.impactSpeed && !c.hitCooldown && !pup.impact?.active && nx * fx + nz * fz > -0.2) {
      const force = c.speed * TRAFFIC.knock;
      events.emit('damage', { amount: HEALTH.damage.vehicle, from: new THREE.Vector3(c.x - fx, c.y, c.z - fz), source: 'vehicle' });
      pup.tumble?.((nx * 0.65 + fx * 0.65) * force, (nz * 0.65 + fz * 0.65) * force, 1.6 + c.speed * 0.18);
      events.emit('trafficImpact', { pos: pup.pos.clone(), power: Math.min(1, c.speed / 8) }); c.hitCooldown = TRAFFIC.impactCooldown; c.speed *= 0.2; c.pause = 1.5; c.wob = 1;
    }
  }
  #surface(c, x, z) {
    if (!DIMS[c.type][3]) return null;
    const [len, width, , roof] = DIMS[c.type], sn = Math.sin(c.heading), cs = Math.cos(c.heading), dx = x - c.x, dz = z - c.z, along = dx * sn + dz * cs, side = dx * cs - dz * sn;
    if (Math.abs(along) > len * 0.49 || Math.abs(side) > width * 0.47) return null;
    let top = roof;
    if (c.type === 'car' || c.type === 'taxi') {
      const rel = along + len * 0.055;
      if (Math.abs(rel) < len * 0.27 && Math.abs(side) < width * 0.435) {
        const slope = Math.max(0, (Math.abs(rel) / len - 0.17) / 0.1, (Math.abs(side) / width - 0.375) / 0.06);
        top = 1.43 - clamp(slope, 0, 1) * 0.65;
      } else top = along > 0 ? 0.84 : 0.78;
    }
    return c.y + top - Math.sin(c.pitch || 0) * along + Math.sin(c.roll || 0) * side;
  }
  surfaceAt(x, z) { let top = null; for (const c of this.cars) { const h = this.#surface(c, x, z); if (h !== null && (top === null || h > top)) top = h; } return top; }
  #upload(dt) {
    this.colliders.length = 0;
    for (const t of Object.values(this.types)) t.list.length = 0;
    for (const c of this.cars) {
      const t = this.types[c.type]; if (!t || t.list.length >= t.paint.instanceMatrix.count) continue;
      const [len, width, height] = DIMS[c.type], fx = Math.sin(c.heading), fz = Math.cos(c.heading), sx = fz * width * 0.4, sz = -fx * width * 0.4;
      c.y = this.#ground(c.x, c.z); c.bob = (c.bob || 0) + dt * (2 + c.speed);
      const H = (x, z) => this.world.terrain?.(x, z) ?? this.world.heightAt(x, z);
      c.pitch = clamp(-Math.atan2(H(c.x + fx * len * 0.4, c.z + fz * len * 0.4) - H(c.x - fx * len * 0.4, c.z - fz * len * 0.4), len * 0.8), -0.35, 0.35);
      const banking = isBike(c.type) && !c.waiting ? clamp(angDiff(c.lastHeading ?? c.heading, c.heading) / Math.max(dt, 0.001) * c.speed * -0.015, -0.15, 0.15) : 0;
      c.roll = clamp(Math.atan2(H(c.x + sx, c.z + sz) - H(c.x - sx, c.z - sz), width * 0.8) + banking + Math.sin(c.bob * 3) * (c.wob || 0) * 0.06, -0.25, 0.25);
      c.halfLength = len / 2; c.halfWidth = width / 2; c.height = c.type === 'car' || c.type === 'taxi' ? 0.78 : isBike(c.type) ? 0.95 : height;
      this.colliders.push(c);
      if (c.height < height) {
        c.cabin ??= { surface: (x, z) => this.#surface(c, x, z) };
        const sedan = !isBike(c.type), offset = sedan ? len * 0.055 : 0.12;
        Object.assign(c.cabin, { x: c.x - fx * offset, z: c.z - fz * offset, y: c.y + c.height, heading: c.heading, pitch: c.pitch, roll: c.roll, halfLength: sedan ? len * 0.27 : 0.21, halfWidth: sedan ? width * 0.435 : 0.15, height: height - c.height });
        if (!sedan) c.cabin.surface = null;
        this.colliders.push(c.cabin);
      }
      const i = t.list.length; t.list.push(c);
      this.E.set(c.pitch, c.heading, c.roll, 'YXZ'); this.M.compose(this.P.set(c.x, c.y, c.z), this.Q.setFromEuler(this.E), this.S);
      t.paint.setMatrixAt(i, this.M); t.trim.setMatrixAt(i, this.M); t.paint.setColorAt(i, c.color);
    }
    for (const t of Object.values(this.types)) {
      t.paint.count = t.trim.count = t.list.length; t.paint.visible = t.trim.visible = t.list.length > 0;
      t.paint.instanceMatrix.needsUpdate = t.trim.instanceMatrix.needsUpdate = true;
      if (t.paint.instanceColor) t.paint.instanceColor.needsUpdate = true;
    }
  }
  update(dt, pup, camera, people = [], signals = []) {
    this.time += dt;
    this.people=people;
    if (camera) {
      this.frustum ??= new THREE.Frustum(); this.sphere ??= new THREE.Sphere(); this.pv ??= new THREE.Matrix4(); this.eye ??= new THREE.Vector3();
      this.frustum.setFromProjectionMatrix(this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); this.eye.copy(camera.position);
    }
    if (this.dirty) this.#rebuild();
    const ride = pup.grounded ? this.cars.find((c) => { const y = this.#surface(c, pup.pos.x, pup.pos.z); return y !== null && Math.abs(y - pup.pos.y) < 0.12; }) : null;
    const previous = ride ? { x: ride.x, z: ride.z, heading: ride.heading } : null;
    if (ride && ride.speed > 1 && this.rode !== ride) { events.emit('ride', ride); this.rode = ride; } else if (!ride) this.rode = null;
    if ((this._t -= dt) <= 0) {
      this._t = TRAFFIC.spawnEvery;
      this.cars = this.cars.filter((c) => {
        if (!Number.isFinite(c.x + c.z + c.heading)) return false;
        const d = Math.hypot(c.x - pup.pos.x, c.z - pup.pos.z);
        return d < TRAFFIC.despawnRadius && (d < TRAFFIC.unseenKeep && (c.stoppedFor || 0) < 24 || this.#visible(c.x, c.z));
      });
      for (const [id, lock] of this.reservations) if (lock.until <= this.time || !this.cars.some((c) => c.id === lock.id)) this.reservations.delete(id);
      for (let i = 0; i < TRAFFIC.spawnBatch && this.cars.filter((c) => !c.waiting).length < this.max; i++) this.#spawn(pup.pos);
      if (this.max > 0 && this.cars.filter((c) => c.waiting).length < this.maxWaiting) this.#spawn(pup.pos, true);
    }
    for (const c of this.cars) this.#tick(c, dt, pup, people, signals);
    if (ride && this.cars.includes(ride)) {
      const dh = ride.heading - previous.heading, x = pup.pos.x - previous.x, z = pup.pos.z - previous.z;
      pup.pos.x = ride.x + x * Math.cos(dh) + z * Math.sin(dh); pup.pos.z = ride.z - x * Math.sin(dh) + z * Math.cos(dh); pup.heading += dh;
      pup.pos.y = this.#surface(ride, pup.pos.x, pup.pos.z) ?? pup.pos.y;
    }
    this.#upload(dt);
  }
  nearestRider(pos) { return this.cars.find((c) => c.waiting && !c.merge && Math.hypot(c.x - pos.x, c.z - pos.z) < 2.4); }
  interact(pup) {
    const c = this.nearestRider(pup.pos); if (!c) return null;
    c.waitT = Math.min(c.waitT, 3);
    events.emit('ridehail', { pos: new THREE.Vector3(c.x, c.y, c.z) });
    return '🛵 Ride aayo! The rider checks the road before pulling out.';
  }
  get stats() { return { vehicles: this.cars.length, moving: this.cars.filter((c) => !c.waiting && c.speed > 0.4).length, waiting: this.cars.filter((c) => c.waiting).length, blocked: this.cars.filter((c) => c.reason === 'blocked').length, edges: this.network.edges.length, rendered: Object.values(this.types).reduce((n, t) => n + t.paint.count, 0) }; }
  clear() { this.cars.length = 0; this.colliders.length = 0; this.reservations.clear(); for (const t of Object.values(this.types)) { t.paint.count = t.trim.count = 0; t.paint.visible = t.trim.visible = false; t.list.length = 0; } }
}
