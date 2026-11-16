/**
 * Street clutter you can knock over: clay pots (Bhaktapur style), pot stacks, crates, bins, baskets, plastic
 * chairs, buckets. Placed deterministically along street edges per tile, drawn as one InstancedMesh per kind.
 * A nudge topples them; a dash (or a hard knock) sends them flying, and pots/crates/baskets shatter.
 * Smashing emits 'smash' { pos, kind } (people nearby get cross) and may drop loot into the world.
 * Kinds, colours and odds: config/gameplay.js BREAKABLES.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BREAKABLES } from '../config/index.js';
import { rng, hash } from '../core/rng.js';
import { events } from '../core/events.js';
import { toon } from '../render/toon.js';

function tint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const lathe = (pts, hex, y = 0) => tint(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 12).translate(0, y, 0), hex);
const POT = [[0.001, 0], [0.12, 0.01], [0.2, 0.1], [0.22, 0.2], [0.17, 0.32], [0.09, 0.38], [0.1, 0.43], [0.12, 0.45], [0.09, 0.45]];

/** Geometry per kind (base at y = 0). */
function geometries() {
  const C = BREAKABLES.kinds;
  return {
    pot: mergeGeometries([lathe(POT, C.pot.color), tint(new THREE.TorusGeometry(0.2, 0.012, 4, 14).rotateX(Math.PI / 2).translate(0, 0.2, 0), '#f4e3c1')]),
    potStack: mergeGeometries([lathe(POT, C.potStack.color), lathe(POT.map(([r, h]) => [r * 0.85, h * 0.85]), '#c97a48', 0.42), lathe(POT.map(([r, h]) => [r * 0.7, h * 0.7]), C.potStack.color, 0.78)]),
    crate: mergeGeometries([tint(new RoundedBoxGeometry(0.55, 0.42, 0.42, 1, 0.03).translate(0, 0.21, 0), C.crate.color),
      ...[0, 1, 2, 3, 4].map((i) => tint(new THREE.SphereGeometry(0.06, 6, 4).translate(-0.18 + i * 0.09, 0.45, (i % 2) * 0.08 - 0.04), ['#e63946', '#ffcc29', '#7ac74f', '#ff9f1c', '#e63946'][i]))]),
    bin: mergeGeometries([tint(new THREE.CylinderGeometry(0.26, 0.22, 0.7, 12).translate(0, 0.35, 0), C.bin.color), tint(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12).translate(0, 0.72, 0), '#c0392b')]),
    basket: mergeGeometries([tint(new THREE.CylinderGeometry(0.26, 0.18, 0.3, 12, 1, true).translate(0, 0.15, 0), C.basket.color), tint(new THREE.CircleGeometry(0.18, 12).rotateX(-Math.PI / 2).translate(0, 0.01, 0), '#b07d45'),
      ...[0, 1, 2].map((i) => tint(new THREE.SphereGeometry(0.07, 6, 4).translate(-0.07 + i * 0.07, 0.3, 0), ['#ff9f1c', '#ffcc29', '#e63946'][i]))]),
    chair: mergeGeometries([tint(new RoundedBoxGeometry(0.45, 0.05, 0.42, 1, 0.02).translate(0, 0.42, 0), C.chair.color), tint(new RoundedBoxGeometry(0.45, 0.45, 0.05, 1, 0.02).translate(0, 0.67, -0.2), C.chair.color),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => tint(new THREE.CylinderGeometry(0.025, 0.02, 0.42, 5).translate(x * 0.19, 0.21, z * 0.17), C.chair.color))]),
    bucket: mergeGeometries([tint(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 12, 1, true).translate(0, 0.16, 0), C.bucket.color), tint(new THREE.CircleGeometry(0.13, 12).rotateX(-Math.PI / 2).translate(0, 0.01, 0), '#2a5bd7'),
      tint(new THREE.TorusGeometry(0.17, 0.008, 3, 12, Math.PI).translate(0, 0.32, 0), '#555')]),
    garbageBag: mergeGeometries([tint(new THREE.IcosahedronGeometry(0.25, 1).scale(1, 0.85, 0.9).translate(0, 0.22, 0), C.garbageBag.color), tint(new THREE.ConeGeometry(0.075, 0.12, 5).translate(0, 0.46, 0), '#53616a'), tint(new THREE.TorusGeometry(0.045, 0.015, 3, 7).rotateX(Math.PI / 2).translate(0, 0.43, 0), '#b5aa89')]),
    can: mergeGeometries([tint(new THREE.CylinderGeometry(0.065, 0.065, 0.21, 8).translate(0, 0.115, 0), C.can.color), tint(new THREE.CylinderGeometry(0.067, 0.067, 0.015, 8).translate(0, 0.225, 0), '#d4d7d3'), tint(new THREE.TorusGeometry(0.022, 0.005, 3, 6).rotateX(Math.PI / 2).translate(0, 0.236, 0), '#7d898b')]),
    leafPile: mergeGeometries(Array.from({ length: 28 }, (_, i) => {
      const a = i * 2.399, d = Math.sqrt(i / 28) * 0.49;
      return tint(new THREE.OctahedronGeometry(0.12, 0).scale(0.6, 0.12, 1).rotateY(a).translate(Math.cos(a) * d, 0.03 + (1 - d * 2) * 0.07, Math.sin(a) * d), ['#d4a04d', '#b97538', '#e0bc68', '#8e9b50'][i % 4]);
    })),
  };
}

export class Breakables {
  constructor(scene, world, fx, pickups) {
    this.scene = scene; this.world = world; this.fx = fx; this.pickups = pickups;
    this.byTile = new Map(); this.gone = new Map(); this.active = []; this.bodies = []; this._t = 0;
    const mat = toon('#ffffff', { key: 'breakable', params: { vertexColors: true, side: THREE.DoubleSide }, rim: 0.35 });
    this.meshes = {};
    for (const [k, g] of Object.entries(geometries())) {
      g.computeBoundingBox();
      const m = new THREE.InstancedMesh(g, mat, 400); m.count = 0; m.visible = false; m.castShadow = k !== 'leafPile' && k !== 'can'; m.frustumCulled = false; scene.add(m); this.meshes[k] = m;
    }
    this.kinds = Object.entries(BREAKABLES.kinds).map(([name, k]) => ({ name, weight: k.weight }));
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(); this.S = new THREE.Vector3(1, 1, 1); this.P = new THREE.Vector3();
    world.onTile((ev, tile) => { if (ev === 'load') this.#generate(tile); else this.byTile.delete(tile.key); this._t = 0; });
    // upright crates, bins, chairs and buckets are stepping stones
    this.tops = { crate: 0.42, bin: 0.75, chair: 0.445, bucket: 0.33, potStack: 1.1 };
    (world.physics.dynamic ??= []).push((x, z) => {
      for (const o of this.active) if (!o.disabled && o.state !== 'moving' && Math.hypot(o.x - x, o.z - z) < o.radius * 0.8) return o.y + o.height;
      return null;
    });
    world.physics.bodies.push(() => this.bodies);
  }

  #item(kind, x, z, rot, id) {
    const k = BREAKABLES.kinds[kind];
    return { id, kind, x, z, y: this.world.heightAt(x, z), home: [x, z], rot, tilt: 0, tiltDir: 0, vx: 0, vy: 0, vz: 0, spin: 0, state: 'idle', radius: k.size * 0.5, height: k.height, disabled: !!k.soft, blocksTraffic: !k.soft, scatter: 0 };
  }

  #generate(tile) {
    const r = rng(hash(tile.tx, tile.tz, 77)), list = [], dens = tile.data.density ?? 0.4, core = tile.data.core ?? 0;
    for (const n of tile.data.navs) {
      if (n.w < 3 || n.kind === 'motorway' || n.kind === 'trunk' || list.length >= BREAKABLES.maxPerTile) continue;
      const P = n.pts;
      for (let i = 2; i < P.length; i += 2) {
        const ax = P[i - 2], az = P[i - 1], dx = P[i] - ax, dz = P[i + 1] - az, L = Math.hypot(dx, dz);
        const count = Math.floor((L / 100) * BREAKABLES.perStreet * (0.4 + dens) + r());
        for (let k = 0; k < count; k++) {
          const t = r(), side = r() < 0.5 ? -1 : 1, off = n.w / 2 + 0.5 + r() * 0.7;
          const x = ax + dx * t + (-dz / L) * off * side, z = az + dz * t + (dx / L) * off * side;
          let kind = this.#pick(r);
          if (core > 0.4 && r() < 0.35) kind = r() < 0.7 ? 'pot' : 'potStack';            // old Newari cores: pottery everywhere
          const cluster = kind === 'pot' || kind === 'crate' ? 1 + Math.floor(r() * 3) : 1;
          for (let c = 0; c < cluster; c++) {
            const cx = x + (c ? (r() - 0.5) * 1.1 : 0), cz = z + (c ? (r() - 0.5) * 1.1 : 0);
            if (!this.world.physics.isFree(cx, cz, 0.3)) continue;
            list.push(this.#item(kind, cx, cz, r() * 6.28, `${tile.key}:${list.length}`));
          }
        }
      }
    }
    const trees = tile.data.props.trees;
    for (let i = 0, n = 0; i < trees.length && n < 5; i += 5) {
      const a = r() * Math.PI * 2, x = trees[i] + Math.cos(a) * 1.1, z = trees[i + 2] + Math.sin(a) * 1.1;
      if (this.world.physics.isFree(x, z, 0.55) && this.world.waterAt(x, z) === null) { list.push(this.#item('leafPile', x, z, a, `${tile.key}:leaves:${n++}`)); }
    }
    this.byTile.set(tile.key, list);
  }
  #pick(r) { let x = r() * this.kinds.reduce((s, k) => s + k.weight, 0); for (const k of this.kinds) if ((x -= k.weight) <= 0) return k.name; return 'pot'; }

  /** Knock things near `pos` in direction (dx, dz) with `power` (≈ speed m/s). Returns how many were hit. */
  knock(pos, dx, dz, power, reach = 0.8, deflect = false) {
    let hits = 0;
    for (const o of this.active) {
      if (o.state === 'broken' || o.cool > 0) continue;
      const d = Math.hypot(o.x - pos.x, o.z - pos.z), size = BREAKABLES.kinds[o.kind].size;
      if (d > reach + size * 0.5) continue;
      const k = BREAKABLES.kinds[o.kind], m = 1 / k.mass, ax = (o.x - pos.x) / (d || 1), az = (o.z - pos.z) / (d || 1);
      if (pos.y > o.y + k.height + 0.18 || pos.y + 0.4 < o.y) continue;
      if (k.soft) { this.#ruffle(o, dx * power, dz * power); hits++; continue; }
      const side = ax * dz - az * dx < 0 ? -1 : 1;
      const kx = deflect ? dx * 0.45 + dz * side * 0.8 : dx, kz = deflect ? dz * 0.45 - dx * side * 0.8 : dz;
      o.vx = (kx * 0.7 + ax * 0.6) * Math.min(7, power * m); o.vz = (kz * 0.7 + az * 0.6) * Math.min(7, power * m); o.vy = Math.min(5, (0.5 + power * 0.25) * m);
      o.spin = (Math.random() - 0.5) * power * 2 * m; o.tiltDir = Math.atan2(o.vx, o.vz); o.state = 'moving'; o.cool = 0.25; hits++;
      if (power > 6 && k.breaks) this.#break(o);
      else events.emit('bump', { pos: new THREE.Vector3(o.x, o.y, o.z), kind: o.kind });
    }
    return hits;
  }
  #ruffle(o, vx = 0, vz = 0) {
    o.cool = BREAKABLES.leafCooldown; o.scatter = Math.min(1, o.scatter + 0.45);
    const p = new THREE.Vector3(o.x, o.y + 0.07, o.z);
    this.fx.burst('leaf', p, BREAKABLES.leafBurst, { speed: 1.6, up: 1.9, life: 1.1, size: 0.1, spread: 0.4, vx: vx * 0.18, vz: vz * 0.18 });
    this.fx.burst('sparkle', p, 4, { speed: 0.45, up: 0.9, life: 0.5, size: 0.055 });
    events.emit('leaves', p);
  }
  nearest(pos, radius = 1.5) {
    let best = null, distance = radius;
    for (const o of this.active) if (o.state !== 'broken' && BREAKABLES.kinds[o.kind].searchable && Math.abs(pos.y - o.y) < 0.65) {
      const d = Math.hypot(pos.x - o.x, pos.z - o.z); if (d < distance) { best = o; distance = d; }
    }
    return best;
  }
  /** E: sniff through rubbish or play in a leaf pile; each search has a short refill cooldown. */
  interact(pup) {
    const o = this.nearest(pup.pos); if (!o) return null;
    const k = BREAKABLES.kinds[o.kind], now = performance.now() / 1000;
    if (now < (o.searchedUntil || 0)) return { text: k.soft ? '🍂 Already thoroughly pounced. Try another pile!' : '🐾 Just scraps this time. Keep sniffing!' };
    o.searchedUntil = now + BREAKABLES.searchCooldown;
    pup.startPose(k.soft ? 'PlayBow' : 'SniffIdle', k.soft ? 0.9 : 1.2); pup.setMood('excited', 3);
    if (k.soft) this.#ruffle(o);
    else { this.fx.burst('scrap', new THREE.Vector3(o.x, o.y + k.height, o.z), 9, { size: 0.1, speed: 0.8, up: 1.6, life: 0.8 }); events.emit('rummage', { pos: pup.pos.clone(), kind: o.kind }); }
    if (k.loot.length) this.pickups.drop(k.loot[(Math.random() * k.loot.length) | 0], new THREE.Vector3(o.x, o.y + k.height, o.z));
    return { text: k.soft ? '🍂 Leaves everywhere! There was something hiding underneath…' : '🐾 Nose first… you found something in the rubbish!' };
  }
  #break(o) {
    o.state = 'broken'; o.disabled = true; o.brokenAt = performance.now() / 1000;
    const k = BREAKABLES.kinds[o.kind], p = new THREE.Vector3(o.x, o.y + 0.25, o.z);
    this.fx?.burst('dust', p, 10, { colors: [k.color, '#e9d8bd'], speed: 2.2, size: 0.18 });
    this.fx?.burst('drop', p, 14, { colors: [k.color, '#6b3a1c', '#f4e3c1'], speed: 2.6, up: 3, size: 0.07 });
    if (k.loot?.length && Math.random() < BREAKABLES.lootChance) this.pickups?.drop(k.loot[(Math.random() * k.loot.length) | 0], p);
    this.gone.set(o.id, o.brokenAt);
    events.emit('smash', { pos: p, kind: o.kind });
  }

  update(dt, pup) {
    const now = performance.now() / 1000;
    // collect what's near the pup (and bring old smashed things back once the pup is away)
    if ((this._t -= dt) <= 0) {
      this._t = 0.5; this.active = [];
      for (const list of this.byTile.values()) for (const o of list) {
        if (Math.abs(o.x - pup.pos.x) > BREAKABLES.buildRadius || Math.abs(o.z - pup.pos.z) > BREAKABLES.buildRadius) continue;
        if (o.state === 'broken' && now - o.brokenAt > BREAKABLES.respawn && Math.hypot(o.home[0] - pup.pos.x, o.home[1] - pup.pos.z) > 40) {
          Object.assign(o, { x: o.home[0], z: o.home[1], tilt: 0, vx: 0, vy: 0, vz: 0, spin: 0, state: 'idle' }); o.y = this.world.heightAt(o.x, o.z); this.gone.delete(o.id);
        }
        this.active.push(o);
      }
    }
    // the pup trotting into something nudges it
    if (pup.speed > 0.3 && !pup.dashing && pup.grounded) { const f = pup.forward(); this.knock(pup.pos, f.x, f.z, Math.min(3, pup.speed * 0.6), 0.4); }
    const counts = {};
    this.bodies.length = 0;
    for (const o of this.active) {
      o.cool = Math.max(0, (o.cool || 0) - dt);
      if (o.state === 'moving') {
        o.vy -= 14 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.rot += o.spin * dt;
        o.tilt = Math.min(Math.PI / 2, o.tilt + Math.hypot(o.vx, o.vz) * dt * 2.2);
        const g = this.world.heightAt(o.x, o.z);
        if (o.y <= g) {
          const impact = -o.vy; o.y = g;
          if (impact > 5.5 && BREAKABLES.kinds[o.kind].breaks) { this.#break(o); continue; }
          o.vy = impact > 1.5 ? impact * 0.3 : 0; o.vx *= 0.6; o.vz *= 0.6; o.spin *= 0.6;
          if (impact > 1.5) events.emit('bump', { pos: new THREE.Vector3(o.x, o.y, o.z), kind: o.kind });
          if (Math.hypot(o.vx, o.vz) < 0.15 && o.vy === 0) { o.state = 'fallen'; o.tilt = o.tilt > 0.6 ? Math.PI / 2 : 0; }
        }
        if (this.world.physics.solidAt(o.x, o.y + 0.2, o.z)) { o.x -= o.vx * dt * 1.5; o.z -= o.vz * dt * 1.5; o.vx *= -0.3; o.vz *= -0.3; }
      }
      if (o.state === 'broken') continue;
      const mesh = this.meshes[o.kind], i = (counts[o.kind] = (counts[o.kind] || 0) + 1) - 1;
      if (i >= mesh.instanceMatrix.count) continue;
      this.E.set(Math.cos(o.tiltDir) * o.tilt, o.rot, Math.sin(o.tiltDir) * o.tilt, 'YXZ');
      const spread = o.kind === 'leafPile' ? o.scatter : 0;
      this.S.set(1 + spread * 0.4, 1 - spread * 0.4, 1 + spread * 0.4);
      this.M.compose(this.P.set(0, 0, 0), this.Q.setFromEuler(this.E), this.S);
      const b = mesh.geometry.boundingBox, e = this.M.elements;
      const low = Math.min(b.min.x * e[1], b.max.x * e[1]) + Math.min(b.min.y * e[5], b.max.y * e[5]) + Math.min(b.min.z * e[9], b.max.z * e[9]);
      const high = Math.max(b.min.x * e[1], b.max.x * e[1]) + Math.max(b.min.y * e[5], b.max.y * e[5]) + Math.max(b.min.z * e[9], b.max.z * e[9]);
      o.height = o.tilt < 0.3 ? this.tops[o.kind] ?? high - low : high - low;
      o.disabled = o.state === 'broken' || !!BREAKABLES.kinds[o.kind].soft;
      if (!o.disabled) {
        this.bodies.push(o);
        if (o.kind === 'chair' && o.tilt < 0.3) {
          o.back ??= {};
          Object.assign(o.back, { x: o.x - Math.sin(o.rot) * 0.2, z: o.z - Math.cos(o.rot) * 0.2, y: o.y + 0.445, heading: o.rot, halfWidth: 0.225, halfLength: 0.035, height: 0.45 });
          this.bodies.push(o.back);
        }
      }
      this.M.setPosition(o.x, o.y - low, o.z); mesh.setMatrixAt(i, this.M);
    }
    for (const [k, m] of Object.entries(this.meshes)) { m.count = Math.min(counts[k] || 0, m.instanceMatrix.count); m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; }
  }
}
