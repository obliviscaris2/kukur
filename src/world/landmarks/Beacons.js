/**
 * Steer-by-sight: famous landmarks (config/places.js `beacon`) are drawn as hazy silhouettes on the horizon even
 * when their part of the map isn't loaded — Swayambhu on its hill, Boudha's spire, Dharahara, Nyatapola…
 * Also draws the waypoint as a tall column of marigold light.
 * Each beacon is merged into one vertex-coloured mesh (one draw call) that ignores fog and fades into the haze.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WAYFINDING } from '../../config/index.js';

function hazeMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  m.userData.u = { uHaze: { value: new THREE.Color() }, uK: { value: 0.5 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHaze; uniform float uK;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, uK);');
  };
  return m;
}

/** Flatten an object hierarchy into one geometry with vertex colours taken from each mesh's material colour. */
function bake(obj) {
  obj.updateMatrixWorld(true);
  const geos = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(o.matrixWorld);
    const c = o.material.color || new THREE.Color('#ffffff'), n = g.attributes.position.count, col = new Float32Array(n * 3), nrm = g.attributes.normal;
    for (let i = 0; i < n; i++) { const lit = nrm ? 0.72 + 0.28 * Math.max(0, nrm.getY(i) * 0.6 + nrm.getX(i) * 0.4) : 1; col[i * 3] = c.r * lit; col[i * 3 + 1] = c.g * lit; col[i * 3 + 2] = c.b * lit; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  });
  return mergeGeometries(geos);
}

export class Beacons {
  constructor(scene, landmarks, terrain) { this.scene = scene; this.landmarks = landmarks; this.terrain = terrain; this.list = []; this._t = 0; }

  async init(destinations) {
    for (const d of destinations) {
      if (!d.beacon) continue;
      const src = await this.landmarks.createModel(d.beacon, d.size);
      const mat = hazeMaterial(), mesh = new THREE.Mesh(bake(src), mat);
      mesh.position.set(d.x, this.terrain(d.x, d.z), d.z); mesh.frustumCulled = true; mesh.renderOrder = -4;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.visible = false;
      this.scene.add(mesh);
      this.list.push({ mesh, mat, d });
    }
    // waypoint: column of light + ground ring
    const colMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color('#ffb347') }, uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uTime, uFade;
        void main(){ float edge = pow(sin(vUv.x * 3.14159), 2.0); float h = pow(1.0 - vUv.y, 1.6);
          float shimmer = 0.75 + 0.25 * sin(vUv.y * 60.0 - uTime * 3.0);
          gl_FragColor = vec4(uColor * edge * h * shimmer * uFade, 1.0); }`,
    });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 420, 16, 1, true).translate(0, 210, 0), colMat);
    this.pillar.visible = false; this.pillar.frustumCulled = false; this.pillar.renderOrder = 5;
    this.scene.add(this.pillar);
  }

  /** @param {{focus, waypoint, fogColor: THREE.Color, near: number, time: number}} o  near = radius where the real map is loaded */
  update(dt, { focus, waypoint, pins = [], fogColor, near, time }) {
    // pins: thinner cyan light columns (created on demand)
    this.pinCols ??= [];
    while (this.pinCols.length < pins.length && this.pillar) {
      const m = this.pillar.clone(); m.material = this.pillar.material.clone(); m.material.uniforms.uColor.value = new THREE.Color('#3df5ff'); m.scale.set(0.45, 0.35, 0.45); this.scene.add(m); this.pinCols.push(m);
    }
    this.pinCols.forEach((m, i) => {
      const pin = pins[i]; m.visible = !!pin;
      if (pin) { m.position.set(pin.x, this.terrain(pin.x, pin.z), pin.z); m.material.uniforms.uTime.value = time; m.material.uniforms.uFade.value = Math.min(0.8, Math.max(0.1, Math.hypot(pin.x - focus.x, pin.z - focus.z) / 150)); }
    });
    const p = this.pillar;
    if (p) {
      p.visible = !!waypoint;
      if (waypoint) {
        p.position.set(waypoint.x, this.terrain(waypoint.x, waypoint.z), waypoint.z);
        const d = Math.hypot(waypoint.x - focus.x, waypoint.z - focus.z);
        p.material.uniforms.uTime.value = time; p.material.uniforms.uFade.value = Math.min(1, Math.max(0.15, d / 120));
      }
    }
    if ((this._t -= dt) > 0) return;
    this._t = 0.3;
    for (const b of this.list) {
      const d = Math.hypot(b.d.x - focus.x, b.d.z - focus.z);
      b.mesh.visible = d > near && d < WAYFINDING.beacons.maxDist;
      b.mat.userData.u.uHaze.value.copy(fogColor);
      b.mat.userData.u.uK.value = 0.38 + 0.5 * Math.min(1, Math.max(0, (d - near) / 7000));
    }
  }
}
