/** Behaviour, defensive stun, stacked house navigation and actual local-dog asset regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposition, trafficDanger } from '../src/gameplay/disposition.js';
import { Threats } from '../src/gameplay/Threats.js';
import { Physics } from '../src/world/physics.js';
import { Pup } from '../src/entities/pup/Pup.js';
import { ImpactMotion } from '../src/entities/pup/ImpactMotion.js';
import { Stray } from '../src/entities/npc/Stray.js';
import { Territories } from '../src/gameplay/Territories.js';
import { Person } from '../src/entities/npc/Person.js';
import { DogAnimator } from '../src/entities/dog/DogAnimator.js';
import { planHouseStairs } from '../src/world/tiles/HouseStairs.js';
import { DispositionAura } from '../src/render/DispositionAura.js';
import { THREATS, SCAN } from '../src/config/index.js';

test('calm territory dogs are neutral; warnings and real bite pursuit are hostile', () => {
  const dog = { dog: {}, terr: { friendly: false }, tstate: 'guard' };
  assert.equal(disposition(dog).cat, 'neutral');
  dog.tstate = 'warn';
  assert.equal(disposition(dog).canStun, true);
  assert.equal(disposition(dog).urgent, false);
  dog.tstate = 'chase';
  assert.equal(disposition(dog).urgent, true);
  dog.terr.friendly = true;
  assert.equal(disposition(dog).cat, 'good');
});
test('grumpy and unknown people are neutral, actual attack tells turn red, playing kids stay friendly', () => {
  assert.equal(disposition({ mood: 'cruel', state: 'move' }).cat, 'neutral');
  assert.equal(disposition({ mood: 'grumpy', state: 'shoo' }).cat, 'neutral');
  assert.equal(disposition({ mood: 'cruel', state: 'throw', thrown: false }).canStun, true);
  assert.equal(disposition({ kid: true, state: 'chase' }).cat, 'good');
  assert.equal(disposition({ role: 'catcher', state: 'hunt' }).cat, 'danger');
  assert.equal(disposition({ mood: 'kind', state: 'move' }).canStun, false);
});
test('a recently hostile but stunned actor becomes silver/icy and cannot be chain-stunned', () => {
  const a = { state: 'throw', aggression: 3, stunFor: 2 };
  assert.equal(disposition(a).stunned, true);
  assert.equal(disposition(a).canStun, false);
});
test('traffic is dangerous when its predicted path reaches the pup, rather than just because it is fast', () => {
  const c = { x: 0, y: 0, z: 0, heading: 0, speed: 5, halfLength: 2, halfWidth: 0.85 },
    pup = { pos: new THREE.Vector3(0, 0, 7) };
  assert.equal(trafficDanger(c, pup), true);
  pup.pos.x = 4;
  assert.equal(trafficDanger(c, pup), false);
  pup.pos.set(0, 2, 7);
  assert.equal(trafficDanger(c, pup), false);
});
function threatFixture() {
  const scene = new THREE.Scene(),
    physics = new Physics(),
    people = [],
    strays = [],
    pup = { pos: new THREE.Vector3() };
  const npcs = { people, strays, stones: { repel() {} } },
    app = { renderer: { quality: { npc: 'low' } }, storyCalm: false };
  const threats = new Threats({ scene, world: { physics }, npcs, traffic: { cars: [] }, fx: { burst() {} }, hud: {}, app });
  const actor = (x, z, kind = 'throw') => {
    const a = {
      pos: new THREE.Vector3(x, 0, z),
      state: kind,
      role: 'walker',
      model: { scale: new THREE.Vector3(1, 1, 1) },
      root: new THREE.Group(),
      stun: Person.prototype.stun,
    };
    scene.add(a.root);
    people.push(a);
    return a;
  };
  return { threats, actor, physics, pup, app };
}
test('roar interrupts nearby hostile attacks, leaves friends alone, and respects walls and radius', () => {
  const { threats, actor, physics, pup } = threatFixture(),
    near = actor(0, 3),
    friend = actor(2, 2, 'move'),
    far = actor(0, 13),
    behind = actor(-4, 0);
  friend.mood = 'kind';
  physics.addBox('wall', -2, 0, 0.05, 3, 0, 3);
  assert.equal(threats.roar(pup.pos), 1);
  assert.ok(near.stunFor >= THREATS.stun.seconds[0]);
  assert.equal(near.thrown, true);
  assert.equal(friend.stunFor, undefined);
  assert.equal(far.stunFor, undefined);
  assert.equal(behind.stunFor, undefined);
  assert.equal(threats.roar(pup.pos), 0);
});
test('story scenes suppress defensive combat', () => {
  const { threats, actor, pup, app } = threatFixture();
  actor(0, 3);
  app.storyCalm = true;
  assert.equal(threats.roar(pup.pos), 0);
});
test('the magical actor field stays within one fixed buffer and updates from behaviour', () => {
  const scene = new THREE.Scene(),
    aura = new DispositionAura(scene, { npc: 'low' }),
    actors = [];
  for (let i = 0; i < 60; i++) {
    const root = new THREE.Group();
    root.position.set(i % 8, 0, 2 + Math.floor(i / 8));
    scene.add(root);
    actors.push({ root, pos: root.position, mood: i % 2 ? 'kind' : 'neutral', model: { scale: new THREE.Vector3(1, 1, 1) } });
  }
  aura.update(0.016, actors, { pos: new THREE.Vector3() }, true);
  assert.equal(aura.stats.actors, 22);
  assert.ok(aura.stats.points <= aura.capacity);
  actors.forEach((a) => {
    a.state = 'throw';
    a.thrown = false;
  });
  aura.update(0.016, actors, { pos: new THREE.Vector3() }, true);
  assert.equal(aura.stats.danger, 22);
  assert.equal(aura.stats.neutral, 0);
  aura.update(0.016, actors, { pos: new THREE.Vector3() }, false, false);
  assert.equal(aura.points.visible, false);
});

function controller(physics) {
  const p = new Pup(),
    root = new THREE.Group(),
    holder = new THREE.Group();
  root.add(holder);
  p.root = root;
  p.pos = root.position;
  p.dog = { root, holder, bones: {}, blob: { visible: true, position: new THREE.Vector3(), material: {} }, update() {} };
  p.anim = { update() {}, clipLength: () => 1 };
  p.feet = { update() {} };
  p.impact = new ImpactMotion(p.dog);
  const world = {
    physics,
    terrain: () => 0,
    heightAt: (x, z) => physics.heightAt(x, z),
    waterAt: () => null,
    weather: { hour: 12 },
    sky: {},
  };
  return { p, world };
}
test('a raised stair slab leaves real headroom underneath', () => {
  const physics = new Physics();
  physics.addPlatform(
    'upper',
    [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ],
    2.9,
    2.77,
  );
  const p = { x: 0, y: 0, z: -3 };
  physics.move(p, 0, 6, 0.19, { height: 0.4 });
  assert.ok(p.z > 2.9);
  assert.equal(physics.groundAt(0, 0, 0.2), 0);
});
test('the pup walks every stacked stair flight from a house entrance to its roof', () => {
  for (const deck of [2.9, 5.8, 8.7]) {
    const pts = [
        [-6, -5],
        [6, -5],
        [6, 5],
        [-6, 5],
      ],
      plan = planHouseStairs(
        pts,
        deck,
        () => 0,
        [true, true, true, true],
        () => 0.2,
      );
    assert.ok(plan);
    const physics = new Physics();
    physics.addSolid('house', plan.footprint, deck, 0, deck);
    for (const slab of plan.platforms) physics.addPlatform('stairs', slab.pts, slab.h, slab.base);
    const { p, world } = controller(physics);
    p.placeAt(plan.entry.x, plan.entry.z, Math.PI, world);
    for (const goal of plan.route) {
      for (let i = 0; i < 2500; i++) {
        const dx = goal.x - p.pos.x,
          dz = goal.z - p.pos.z;
        if (Math.hypot(dx, dz) < 0.15 && Math.abs(p.pos.y - goal.y) < 0.2) break;
        const heading = Math.atan2(dx, dz);
        p.update(
          1 / 60,
          { axis: () => ({ x: 0, y: 1 }), down: () => false, hit: () => false, walk: true },
          { yaw: heading + Math.PI },
          world,
          0,
        );
      }
    }
    assert.ok(Math.abs(p.pos.y - deck) < 0.05, `Stuck on ${p.pos.y} while climbing ${deck}`);
  }
});
test('house stair plans can be generated from actual buildings in each main city', () => {
  for (const [label, tx, tz] of [
    ['Kathmandu', 0, 0],
    ['Patan', 6, 13],
    ['Bhaktapur', 46, 13],
  ]) {
    let count = 0;
    for (let z = tz - 1; z <= tz + 1; z++)
      for (let x = tx - 1; x <= tx + 1; x++) {
        let tile;
        try {
          tile = JSON.parse(readFileSync(`assets/map/tiles/${x}_${z}.json`));
        } catch {
          continue;
        }
        for (const [flat, levels, flags] of tile.b) {
          if (levels > 3 || flags & 4) continue;
          const pts = [];
          for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] / 10 + x * 256, flat[i + 1] / 10 + z * 256]);
          if (
            planHouseStairs(
              pts,
              levels * 2.9,
              () => 0,
              pts.map(() => true),
              () => 0.2,
            )
          )
            count++;
        }
      }
    assert.ok(count > 0, `No eligible houses in ${label}`);
  }
});
test('local dog assets have a level back, four low paws, a longer body and intact bone scales in each gait', async () => {
  for (const name of ['pup', 'bhote', 'spitz']) {
    const b = readFileSync(`assets/models/${name}.glb`),
      g = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    const bones = {};
    g.scene.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
    });
    const holder = new THREE.Group();
    holder.add(g.scene);
    const animator = new DogAnimator({ model: g.scene, holder, bones, animations: g.animations }),
      v = new THREE.Vector3();
    for (let i = 0; i < 30; i++) animator.update(1 / 60, { speed: 0, y: 0, mood: 'calm', panting: 0 });
    holder.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(holder).getSize(v);
    assert.ok(size.z > size.y * 1.3, name);
    for (const paw of ['fpawL', 'fpawR', 'hpawL', 'hpawR']) assert.ok(bones[paw].getWorldPosition(v).y < 0.1, `${name} ${paw}`);
    assert.ok(
      bones.forearmL.getWorldPosition(v).z < bones.upperarmL.getWorldPosition(new THREE.Vector3()).z,
      `${name} front elbow bends the wrong way`,
    );
    for (const speed of [0.85, 1.9, 5])
      for (let i = 0; i < 30; i++) {
        animator.update(1 / 60, { speed, y: 0, mood: 'calm', panting: 0 });
        for (const bone of Object.values(bones))
          assert.ok(bone.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 0.005, `${name} stretched ${bone.name}`);
      }
  }
});

test('breaking clutter cannot overwrite an attack tell or cancel an existing stun', () => {
  for (const state of ['throw', 'hunt', 'strike', 'stunned']) {
    const actor = { state, stunFor: state === 'stunned' ? 2 : 0 };
    Person.prototype.startle.call(actor, {});
    assert.equal(actor.state, state);
  }
});

async function personFixture() {
  const b = readFileSync('assets/models/person.glb'),
    g = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  const actor = new Person(g, () => 0.4, { role: 'catcher', mood: 'neutral' }),
    physics = new Physics(),
    damage = [];
  actor.standAt(0, 4, Math.PI);
  actor.cool = -1;
  const pup = { pos: new THREE.Vector3(), swimming: false, setMood() {} },
    world = { physics, heightAt: () => 0 };
  const ctx = {
    dt: 0.05,
    pup,
    world,
    raining: false,
    calm: false,
    say() {},
    events: {
      emit(name, payload) {
        if (name === 'damage') damage.push(payload);
      },
    },
  };
  return { actor, physics, damage, ctx };
}
test('a catcher telegraphs before damaging; stunning the wind-up cancels that attack', async () => {
  const { actor, damage, ctx } = await personFixture();
  for (let i = 0; i < 200 && actor.state !== 'strike'; i++) actor.update(ctx);
  assert.equal(actor.state, 'strike');
  assert.equal(damage.length, 0);
  assert.equal(disposition(actor).canStun, true);
  assert.equal(actor.stun(3), true);
  for (let i = 0; i < 45; i++) actor.update(ctx);
  assert.equal(damage.length, 0);
});
test('a catcher deals one close-range hit after the warning and cannot see through buildings', async () => {
  const { actor, physics, damage, ctx } = await personFixture();
  physics.addBox('wall', 0, 2, 3, 0.05, 0, 3);
  for (let i = 0; i < 20; i++) actor.update(ctx);
  assert.notEqual(actor.state, 'hunt');
  assert.equal(damage.length, 0);
  physics.removeOwner('wall');
  actor.cool = -1;
  for (let i = 0; i < 100; i++) actor.update(ctx);
  assert.equal(damage.length, 1);
  assert.equal(damage[0].source, 'catchpole');
});
test('a stunned chasing dog cannot bite the pup', () => {
  const s = new Stray();
  s.root = new THREE.Group();
  s.root.position.set(0, 0, 0.7);
  s.scale = 1.2;
  s.r = () => 0.4;
  s.heading = Math.PI;
  s.speed = 0;
  s.stateT = 3;
  s.barkCd = 0;
  s.tstate = 'chase';
  s.terr = { x: 0, z: 0, r: 8 };
  s.anim = { bark() {}, update() {} };
  s.dog = { bones: {}, update() {} };
  let bites = 0;
  const ctx = {
    dt: 0.05,
    world: { physics: new Physics() },
    pup: { pos: new THREE.Vector3() },
    audio: { play() {} },
    say() {},
    events: {
      emit() {
        bites++;
      },
    },
  };
  s.stun(3);
  for (let i = 0; i < 40; i++) s.update(ctx);
  assert.equal(bites, 0);
});
test('territory warning allows time to charge a roar, and a rooftop breaks pursuit', () => {
  const world = { onTile() {}, heightAt: () => 0, terrain: () => 0 },
    t = new Territories(new THREE.Scene(), world, { strays: [] }, null),
    dog = { root: new THREE.Group() };
  const territory = {
    id: 'test',
    tile: 'test',
    x: 0,
    z: 0,
    y: 0,
    r: 10,
    dogs: [dog],
    state: 'calm',
    inside: 0,
    markers: [],
    color: '#a66',
    discovered: true,
  };
  t.list.set('test', territory);
  const pup = { pos: new THREE.Vector3(), swimming: false };
  t.update(0.9, pup, 0, 0);
  assert.equal(territory.state, 'warn');
  t.update(0.55, pup, 0, 1.45);
  assert.equal(territory.state, 'chase');
  pup.pos.y = 3;
  t.update(0.05, pup, 0, 1.5);
  assert.equal(territory.state, 'calm');
});

test('catch-pole wind-up gives time to react and charge the defensive roar', () => {
  assert.ok(THREATS.catcher.windup - THREATS.catcher.strikeAt > SCAN.charge + 0.2);
});
