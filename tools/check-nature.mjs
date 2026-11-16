/** Real geometry, streaming transforms, slope planting and permanent shrine-light regressions without a GPU. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { treeGeometry, plantGeometry, flowerGeometry, gardenGeometry } from '../src/world/props/natureGeometry.js';
import { Props } from '../src/world/props/Props.js';
import { Sanctuary, shrineLamps } from '../src/world/effects/Sanctuary.js';
import { DiyoField } from '../src/world/festival/DiyoField.js';
import { Physics } from '../src/world/physics.js';
import { registerLandmark } from '../src/world/landmarks/landmarkCollision.js';
import { NATURE, QUALITY } from '../src/config/index.js';
import { U } from '../src/render/toon.js';

test('all five tree species have finite folded foliage, embedded roots and inexpensive matching distance silhouettes', () => {
  for (let kind = 0; kind < 5; kind++) {
    const near = treeGeometry(kind, 0),
      far = treeGeometry(kind, 1);
    assert.ok(near.attributes.position.count / 3 < 4000);
    assert.ok(far.attributes.position.count / 3 < 600);
    for (const geo of [near, far]) {
      assert.ok(geo.boundingBox.min.y < 0);
      assert.ok(geo.boundingBox.max.y > 1);
      assert.equal(geo.attributes.nature.count, geo.attributes.position.count);
      for (const attr of Object.values(geo.attributes)) for (const value of attr.array) assert.ok(Number.isFinite(value));
      for (let i = 0; i < geo.attributes.normal.count; i++)
        assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, i).length() - 1) < 0.005);
    }
    assert.ok(Math.abs(near.boundingBox.max.y - far.boundingBox.max.y) < 0.6);
    assert.ok(Math.abs(near.boundingBox.max.x - far.boundingBox.max.x) < 1);
  }
  for (const g of [plantGeometry(), flowerGeometry(), gardenGeometry()])
    assert.ok(g.attributes.position.count > 0 && g.attributes.nature.count === g.attributes.position.count);
});

test('a tree keeps its orientation and colour when a preceding tree leaves the streaming radius', () => {
  const original = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
  };
  try {
    const p = new Props(new THREE.Scene(), QUALITY.low),
      empty = () =>
        Object.fromEntries(
          ['poles', 'lamps', 'bikes', 'tanks', 'solar', 'plants', 'laundry', 'benches', 'flags'].map((k) => [k, new Float32Array()]),
        );
    p.addTile('first', { ...empty(), trees: new Float32Array([140, 0, 0, 0, 1]) });
    p.addTile('target', { ...empty(), trees: new Float32Array([0, 0, 0, 0, 1]) });
    p.update(0.5, new THREE.Vector3(), 0);
    const before = new THREE.Matrix4();
    p.trees[0].near.mesh.getMatrixAt(0, before);
    const colourBefore = new THREE.Color();
    p.trees[0].near.mesh.getColorAt(0, colourBefore);
    p.update(0.5, new THREE.Vector3(-30, 0, 0), 0);
    const after = new THREE.Matrix4();
    p.trees[0].near.mesh.getMatrixAt(0, after);
    const colourAfter = new THREE.Color();
    p.trees[0].near.mesh.getColorAt(0, colourAfter);
    assert.deepEqual(after.elements, before.elements);
    assert.deepEqual(colourAfter, colourBefore);
    assert.equal(p.trees[0].near.mesh.geometry.attributes.treeLod.itemSize, 3);
  } finally {
    globalThis.document = original;
  }
});

function fixture(terrain = () => 0) {
  const physics = new Physics(terrain),
    scene = new THREE.Scene(),
    s = new Sanctuary(scene),
    focus = new THREE.Vector3();
  const props = { treesNear: () => [] },
    landmarks = { all: () => [], meta: {} };
  const ctx = { focus, props, landmarks, physics, heightAt: (x, z) => physics.heightAt(x, z), waterAt: () => null, night: 1 };
  return { s, scene, ctx, physics };
}
function temple(f) {
  const meta = { steps: 3, step_h: 0.07, inset: 0.0766666667, core: 0.42, core_h: 0.35 },
    object = new THREE.Group();
  object.rotation.y = -0.72;
  const landmark = { object, x: 0, z: 0, size: 10, model: 'pagoda2', name: 'Test shrine' };
  registerLandmark(f.physics, 'shrine', { ...landmark, ang: 0.72, y: 0, meta, peak: 10 });
  f.ctx.landmarks = { all: () => [landmark], meta: { pagoda2: meta } };
  return { landmark, meta };
}

test('diyos follow the rotated visible terrace height and leave its approaches open', () => {
  const f = fixture(),
    { landmark, meta } = temple(f),
    lamps = shrineLamps(landmark, meta, f.ctx.heightAt, (x, y, z) => f.physics.solidAt(x, y, z));
  assert.ok(lamps.length > 12);
  for (const p of lamps) {
    assert.equal(p.y, f.physics.heightAt(p.x, p.z));
    assert.equal(f.physics.solidAt(p.x, p.y + 0.08, p.z), false);
    assert.ok(p.y > 0.65 && p.y < 0.75);
  }
  f.s.update(0.1, f.ctx);
  assert.equal(f.s.diyos.count, lamps.length);
  assert.equal(f.s.garlands.count, 4);
  for (let i = 0; i < f.s.diyos.count; i++) {
    const m = new THREE.Matrix4();
    f.s.diyos.cups.getMatrixAt(i, m);
    assert.ok(Math.abs(m.elements[13] - 0.706) < 0.001);
  }
});

test('permanent temple lamps burn by day while festival flames follow the night, with fixed instance capacity', () => {
  const scene = new THREE.Scene(),
    permanent = new DiyoField(scene, 2, true),
    festival = new DiyoField(scene, 2);
  for (const field of [permanent, festival]) {
    field.begin();
    for (let i = 0; i < 20; i++) field.push(i, 0, 0);
    field.end();
    field.update(0);
    assert.equal(field.count, 2);
    assert.equal(field.cups.count, 2);
  }
  assert.equal(permanent.flames.visible, true);
  assert.equal(festival.flames.visible, false);
  festival.update(1);
  assert.equal(festival.flames.visible, true);
  festival.update(1, false);
  assert.equal(festival.cups.visible, false);
});

test('tree-base plants follow the slope normal and exact support height', () => {
  const f = fixture((x, z) => x * 0.25 + z * 0.1);
  f.ctx.props.treesNear = () => [[0, 0, 0, 0, 1]];
  f.s.update(0.1, f.ctx);
  assert.ok(f.s.gardens.count > 0);
  const expected = new THREE.Vector3(-0.25, 1, -0.1).normalize();
  for (let i = 0; i < f.s.gardens.count; i++) {
    const m = new THREE.Matrix4(),
      position = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    f.s.gardens.getMatrixAt(i, m);
    m.decompose(position, q, scale);
    assert.ok(Math.abs(position.y - f.ctx.heightAt(position.x, position.z) - 0.012) < 0.001);
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(q).dot(expected) > 0.999);
  }
});

test('distant lamps retain their flame while their subpixel bowl is omitted', () => {
  const field = new DiyoField(new THREE.Scene(), 4, true);
  field.begin();
  field.push(0, 0, 0, 0, false);
  field.end();
  field.update(1);
  assert.equal(field.cups.count, 0);
  assert.equal(field.cups.visible, false);
  assert.equal(field.flames.count, 1);
  assert.equal(field.flames.visible, true);
});

test('wet or occupied ground does not fill with decorative plants', () => {
  const f = fixture();
  f.ctx.props.treesNear = () => [[0, 0, 0, 0, 1]];
  f.ctx.waterAt = () => 0;
  f.s.update(0.1, f.ctx);
  assert.equal(f.s.gardens.count, 0);
  f.ctx.waterAt = () => null;
  f.physics.addBox('occupied', 0, 0, 10, 10, 0, 3);
  f.s.clock = 0;
  f.s.update(0.1, f.ctx);
  assert.equal(f.s.gardens.count, 0);
});

test('light uniforms remain bounded and finite, then fade out when a shrine unloads', () => {
  const f = fixture();
  temple(f);
  for (let i = 0; i < 60; i++) f.s.update(1 / 60, f.ctx);
  assert.ok(f.s.lights.length > 0 && f.s.lights.length <= NATURE.shrines.lightSlots);
  for (const p of U.uShrinePos.value) for (const v of p.toArray()) assert.ok(Number.isFinite(v));
  for (const c of U.uShrineColour.value) for (const v of c.toArray()) assert.ok(Number.isFinite(v));
  const before = U.uShrineColour.value.reduce((sum, c) => sum + c.length(), 0);
  assert.ok(before > 0);
  f.ctx.landmarks.all = () => [];
  f.s.clock = 0;
  f.s.update(1 / 60, f.ctx);
  const fading = U.uShrineColour.value.reduce((sum, c) => sum + c.length(), 0);
  assert.ok(fading > 0 && fading < before);
  for (let i = 0; i < 120; i++) f.s.update(1 / 60, f.ctx);
  assert.equal(f.s.diyos.count, 0);
  assert.equal(f.s.diyos.cups.visible, false);
  assert.equal(f.s.garlands.visible, false);
  assert.ok(U.uShrineColour.value.every((c) => c.length() < 0.001));
});
