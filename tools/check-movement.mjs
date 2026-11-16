/** Deterministic regressions for swept collisions, grounding, variable hops, and safe impact recovery. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Physics, rect, inside } from '../src/world/physics.js';
import { Pup } from '../src/entities/pup/Pup.js';
import { ImpactMotion } from '../src/entities/pup/ImpactMotion.js';
import { PawPlant } from '../src/entities/pup/PawPlant.js';
import { DogAnimator } from '../src/entities/dog/DogAnimator.js';
import { PUP, STREET_LIFE } from '../src/config/index.js';

function player(physics = new Physics()) {
  const p = new Pup(), root = new THREE.Group(), holder = new THREE.Group(); root.add(holder);
  p.root = root; p.pos = root.position;
  p.dog = { root, holder, bones: {}, blob: { visible: true, position: new THREE.Vector3(), material: {} }, update() {} };
  p.anim = { update() {}, clipLength: () => 1 }; p.feet = { update() {} }; p.impact = new ImpactMotion(p.dog);
  const world = { physics, terrain: physics.terrain, heightAt: (x, z) => physics.heightAt(x, z), waterAt: () => null, weather: { hour: 12 }, sky: {} };
  const input = { held: new Set(), hits: new Set(), axis: () => ({ x: 0, y: 0 }), down(k) { return this.held.has(k); }, hit(k) { return this.hits.has(k); }, run: false, walk: false };
  p.placeAt(0, 0, 0, world);
  return { p, world, input, tick(dt = 1 / 60) { p.update(dt, input, { yaw: Math.PI }, world, 0); input.hits.clear(); } };
}

test('a fast dash and the whole body stop before a very thin wall', () => {
  const physics = new Physics(); physics.addBox('wall', 0, 1, 3, 0.015, 0, 3);
  const pos = { x: 0, y: 0, z: 0 };
  assert.equal(physics.move(pos, 0, 4, PUP.radius, { height: PUP.bodyHeight, halfLength: PUP.bodyHalfLength }), true);
  assert.ok(pos.z + PUP.radius + PUP.bodyHalfLength < 0.986);
});

test('a diagonal collision slides along the wall', () => {
  const physics = new Physics(); physics.addBox('wall', 0, 1, 20, 0.015, 0, 3);
  const pos = { x: 0, y: 0, z: 0 }; physics.move(pos, 3, 3, 0.2);
  assert.ok(pos.x > 2.9); assert.ok(pos.z < 0.79);
});

test('an actor initially inside a solid is moved outside', () => {
  const physics = new Physics(), pts = rect(0, 0, 1, 1, 0.4); physics.addSolid('house', pts, 4);
  const pos = { x: 0.1, y: 0, z: 0.1 }; assert.equal(physics.collide(pos, 0.2, 0.4), true);
  assert.equal(inside(pos.x, pos.z, pts), false);
});

test('circle collisions work at the centre and across spatial cells', () => {
  const physics = new Physics(); physics.addCircle('pole', 8, 8, 0.12, 4);
  for (const pos of [{ x: 8, y: 0, z: 8 }, { x: 7.9, y: 0, z: 7.9 }]) {
    assert.equal(physics.collide(pos, 0.2), true); assert.ok(Math.hypot(pos.x - 8, pos.z - 8) >= 0.32);
  }
});

test('a high platform does not teleport a pup onto its top', () => {
  const physics = new Physics(); physics.addPlatformBox('step', 0, 1, 1, 0.3, 0, 1.2);
  assert.equal(physics.groundAt(0, 1, 0.18), 0);
  const pos = { x: 0, y: 0, z: 0 }; physics.move(pos, 0, 2, 0.2, { height: 0.4, step: 0.18 });
  assert.ok(pos.z < 0.51); assert.equal(physics.groundAt(0, 1, 1.25), 1.2);
});

test('moving objects have solid sides and a standable top', () => {
  const physics = new Physics(), box = { x: 0, y: 0, z: 1, heading: 0, halfWidth: 0.3, halfLength: 0.3, height: 0.5 };
  physics.bodies.push(() => [box]); physics.dynamic.push((x, z) => Math.abs(x) < 0.25 && Math.abs(z - 1) < 0.25 ? 0.5 : null);
  const pos = { x: 0, y: 0, z: 0 }; physics.move(pos, 0, 2, 0.2);
  assert.ok(pos.z < 0.6); assert.equal(physics.groundAt(0, 1, 0.18), 0); assert.equal(physics.groundAt(0, 1, 0.55), 0.5);
  pos.x = 0; pos.z = 1; pos.y = 0.5; assert.equal(physics.collide(pos, 0.15, 0.4), false);
});

test('box rotation follows three.js positive Y rotation', () => {
  const p = rect(0, 0, 0.2, 1, Math.PI / 4)[0], v = new THREE.Vector3(-0.2, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  assert.ok(Math.abs(p[0] - v.x) < 1e-9 && Math.abs(p[1] - v.z) < 1e-9);
});

test('roof decks remain walkable while their parapets block the edges', () => {
  const physics = new Physics(); physics.addSolid('roof', rect(0, 0, 2, 2, 0), 2.2, -1, 1.5);
  const pos = { x: 0, y: 1.5, z: 0 };
  assert.equal(physics.collide(pos, 0.2, 0.4), false);
  physics.move(pos, 4, 0, 0.2, { height: 0.4, step: 0.1 });
  assert.ok(pos.x < 1.801); assert.ok(pos.x > 1.79);
});

test('a sloping vehicle roof does not push its passenger off the downhill side', () => {
  const physics = new Physics(), body = { x: 0, y: 0, z: 0, heading: 0, halfWidth: 1, halfLength: 2, height: 1.4, pitch: 0.2, roll: 0.1 };
  physics.bodies.push(() => [body]);
  const pos = { x: -0.5, z: 0.8, y: 1.4 - Math.sin(0.2) * 0.8 - Math.sin(0.1) * 0.5 };
  assert.equal(physics.collide(pos, 0.2, 0.4), false);
});

test('paws remain grounded while running down a slope at 30, 60 and 144 fps', () => {
  for (const fps of [30, 60, 144]) {
    const { p, tick, input } = player(new Physics((x, z) => -z * 0.12));
    input.axis = () => ({ x: 0, y: 1 }); input.run = true;
    for (let i = 0; i < fps * 2; i++) { tick(1 / fps); assert.ok(p.grounded); assert.ok(Math.abs(p.pos.y + p.pos.z * 0.12) < 1e-6); }
    assert.ok(p.pos.z > 5);
  }
});

test('a held hop rises higher than a tap, then lands without hovering', () => {
  const hop = (hold) => {
    const { p, tick, input } = player(); let peak = 0, airborne = false;
    input.hits.add('jump'); input.held.add('jump');
    for (let i = 0; i < 150; i++) { if (i / 60 > hold) input.held.delete('jump'); tick(); peak = Math.max(peak, p.pos.y); airborne ||= !p.grounded; }
    assert.ok(airborne); assert.equal(p.pos.y, 0); assert.equal(p.grounded, true); assert.equal(p.vy, 0);
    return peak;
  };
  assert.ok(hop(0.5) > hop(0.015) * 1.5);
});

test('a ledge mantle lifts the paws before carrying the body over the obstacle', () => {
  const physics = new Physics(); physics.addPlatformBox('ledge', 0, 1.6, 1, 0.7, 0, 0.45);
  const { p, tick, input } = player(physics); input.axis = () => ({ x: 0, y: 1 });
  let climbed = false;
  for (let i = 0; i < 120; i++) {
    tick(); climbed ||= !!p.mantle;
    if (p.pos.y < 0.425) assert.ok(p.pos.z + PUP.radius + PUP.bodyHalfLength < 0.905 || p.pos.z > 2.3);
  }
  assert.ok(climbed); assert.ok(p.pos.z > 1);
});

test('hurt uses collision-aware velocity, and respawn clears stale motion', () => {
  const { p, world } = player(); p.hurt({ x: -1, z: 0 }); assert.equal(p.pos.x, 0); assert.ok(p.knock.x > 0);
  p.mantle = {}; p.wish.x = 1; p.placeAt(0, 0, 0, world);
  assert.equal(p.knock.length(), 0); assert.equal(p.mantle, null); assert.equal(p.wish.x, 0); assert.equal(p.grounded, true);
});

test('an impact articulates and recovers while respecting walls', () => {
  const physics = new Physics(); physics.addBox('wall', 0, 1, 5, 0.02, 0, 5);
  const { p, tick } = player(physics); p.impact.cooldown = 0; p.tumble(0, 6, 2.5);
  assert.equal(p.impact.active, true);
  let roll = 0;
  for (let i = 0; i < 240; i++) { tick(); roll = Math.max(roll, Math.abs(p.impact.roll)); assert.ok(p.pos.z < 1); assert.ok(Number.isFinite(p.pos.y)); }
  assert.ok(roll > 0.1); assert.equal(p.impact.active, false); assert.equal(p.grounded, true);
});

async function animatedDog() {
  const file = readFileSync(new URL('../assets/models/pup.glb', import.meta.url));
  const g = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  const root = new THREE.Group(), holder = new THREE.Group(), bones = {};
  holder.scale.setScalar(PUP.modelScale); root.add(holder); holder.add(g.scene);
  g.scene.traverse((b) => { if (b.isBone) bones[b.name] = b; });
  return { root, holder, model: g.scene, bones, animations: g.animations };
}

test('pose, gait and airborne blends retain a full animation weight through transitions', async () => {
  const dog = await animatedDog(), anim = new DogAnimator(dog);
  for (let i = 0; i < 240; i++) {
    anim.update(1 / 60, { speed: i < 80 ? 0 : 3, pose: i < 30 ? 'Lie' : i < 60 ? 'PlayBow' : null, air: i > 140 && i < 170, vy: 0, y: 0 });
    const sum = Object.entries(anim.actions).filter(([name]) => name !== 'Bark').reduce((n, [, action]) => n + action.getEffectiveWeight(), 0);
    assert.ok(Math.abs(sum - 1) < 1e-5, `animation weights total ${sum}`);
  }
});

test('paw planting on uneven ground preserves actual foreleg and hindleg bone lengths', async () => {
  const dog = await animatedDog(), anim = new DogAnimator(dog), feet = new PawPlant(dog);
  const p = { grounded: true, impact: { active: false }, pos: dog.root.position, heading: 0 };
  const physics = new Physics((x, z) => x * 0.16 + z * 0.1);
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < 90; i++) {
    anim.update(1 / 60, { speed: 1.5, y: 0 }); dog.root.updateMatrixWorld(true);
    const lengths = feet.legs.map((l) => [l.a.getWorldPosition(v).distanceTo(l.b.getWorldPosition(w)), l.b.getWorldPosition(v).distanceTo(l.c.getWorldPosition(w))]);
    feet.update(1 / 60, p, physics); dog.root.updateMatrixWorld(true);
    feet.legs.forEach((l, n) => {
      assert.ok(Math.abs(l.a.getWorldPosition(v).distanceTo(l.b.getWorldPosition(w)) - lengths[n][0]) < 1e-5);
      assert.ok(Math.abs(l.b.getWorldPosition(v).distanceTo(l.c.getWorldPosition(w)) - lengths[n][1]) < 1e-5);
      assert.ok(l.a.quaternion.toArray().every(Number.isFinite));
    });
  }
});

test('the full pup capsule walks a flight of configured stair treads without needing to jump',()=>{
  const physics=new Physics(),cfg=STREET_LIFE.parkour,count=14;
  for(let i=0;i<count;i++)physics.addPlatformBox('stairs',0,(i+.5)*cfg.run,cfg.width/2,cfg.run/2,0,(i+1)*cfg.rise);
  const {p,world,input,tick}=player(physics);p.placeAt(0,-.5,0,world);input.axis=()=>({x:0,y:1});input.walk=true;
  let highest=0;for(let i=0;i<600&&highest<count*cfg.rise-.01;i++){tick();highest=Math.max(highest,p.pos.y);}
  assert.ok(highest>=count*cfg.rise-.01,`Pup reached only ${highest}`);
});
