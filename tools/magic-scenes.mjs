/** Repeatable real-world nature/temple review frames, with safe cameras and the normal gameplay view included. */
import * as THREE from 'three';
import { view } from './art-scenes.mjs';
import { blossoms } from './mellow-scenes.mjs';

export async function frame(app, place, hour, kind = null) {
  app.state = 'play';
  app.pup.control = false;
  app.storyCalm = true;
  app.pup.root.visible = true;
  if (kind === 2) await blossoms(app, place);
  else await app.placeAt(place);
  app.world.weather.hour = hour;
  app.world.weather.set('sunny', true);
  app.world.festival.paused = true;
  app.pup.cancelPose();
  app.pup.idle = 0;
  app.cam.clearShot();
  app.cam.snapBehind(app.pup);
  app.world.update(0.016, app.pup.pos, app.camera, app.time);
  if (kind !== null) {
    const tree = app.world.props
      .treesNear(app.pup.pos, 180, 400)
      .filter((t) => t[3] === kind)
      .sort((a, b) => Math.hypot(a[0] - app.pup.pos.x, a[2] - app.pup.pos.z) - Math.hypot(b[0] - app.pup.pos.x, b[2] - app.pup.pos.z))[0];
    if (!tree) throw Error('No tree of kind ' + kind + ' at ' + place);
    const [x, y, z, , s] = tree,
      look = new THREE.Vector3(x, y + 3 * s, z);
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2,
        pos = new THREE.Vector3(x + Math.sin(angle) * 9 * s, y + 3 * s, z + Math.cos(angle) * 9 * s);
      if (app.world.physics.sweepSphere(pos, pos, 0.2) < 1) continue;
      app.pup.placeAt(x + Math.sin(angle) * 2.6 * s, z + Math.cos(angle) * 2.6 * s, angle + Math.PI, app.world);
      app.pup.control = false;
      app.world.update(0.016, app.pup.pos, app.camera, app.time);
      view(app, pos, look);
      break;
    }
  }
  return { place, hour, kind, pup: app.pup.pos.toArray() };
}

export function stats(app) {
  const w = app.world,
    s = w.sanctuary;
  return {
    nearTrees: w.props.trees.map((t) => t.near.mesh.count),
    gardens: s?.gardens.count,
    shrineDiyos: s?.diyos.count,
    lights: s?.lights.length,
    drawCalls: app.renderer.renderer.info.render.calls,
    triangles: app.renderer.renderer.info.render.triangles,
    cameraClear: w.physics.sweepSphere(app.camera.position, app.camera.position, 0.15) === 1,
  };
}

export async function closeShrine(app, place) {
  await frame(app, place, 20);
  const temples = [...app.world.landmarks.all()]
    .filter((l) => l.model && l.model !== 'tower' && l.size > 3)
    .sort((a, b) => Math.hypot(a.x - app.pup.pos.x, a.z - app.pup.pos.z) - Math.hypot(b.x - app.pup.pos.x, b.z - app.pup.pos.z));
  for (const l of temples) {
    const radius = l.size * 0.5 + 3;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + l.object.rotation.y,
        x = l.x + Math.sin(angle) * radius,
        z = l.z + Math.cos(angle) * radius,
        y = app.world.heightAt(x, z);
      if (
        !app.world.physics.isBoxFree({ x, z, y, heading: angle, halfWidth: 0.4, halfLength: 0.6, height: 0.8 }, 0.1) ||
        app.world.waterAt(x, z) !== null
      )
        continue;
      app.pup.placeAt(x, z, Math.atan2(l.x - x, l.z - z), app.world);
      app.pup.control = false;
      app.cam.clearShot();
      app.cam.snapBehind(app.pup);
      app.world.update(0.016, app.pup.pos, app.camera, app.time);
      return { temple: l.name || l.model, pup: app.pup.pos.toArray() };
    }
  }
  throw Error('No clear temple approach');
}

export function diyoClose(app) {
  const field = app.world.sanctuary?.diyos;
  if (!field?.bodyCount) return 'No close bowl';
  const matrix = new THREE.Matrix4();
  field.cups.getMatrixAt(0, matrix);
  const centre = new THREE.Vector3().setFromMatrixPosition(matrix),
    q = new THREE.Quaternion();
  matrix.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(q),
    look = centre.clone().add(new THREE.Vector3(0, 0.09, 0));
  const position = centre
    .clone()
    .addScaledVector(outward, 0.58)
    .add(new THREE.Vector3(0.12, 0.3, 0));
  if (app.world.physics.sweepSphere(position, position, 0.08) < 1) return 'Close camera obstructed';
  app.state = 'paused';
  view(app, position, look);
  return 'Clay bowl, oil, wick and flame';
}
