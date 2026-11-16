/** Shared instanced Nepali oil lamps: open clay bowls, dark oil, a wick and small wind-tipped flames. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NATURE } from '../../config/index.js';
import { toon } from '../../render/toon.js';

function colour(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex),
    a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export function diyoGeometry() {
  const D = NATURE.diyo;
  const bowl = colour(
    new THREE.LatheGeometry(
      [
        [0, 0],
        [0.034, 0],
        [0.073, 0.042],
        [0.074, 0.052],
        [0.061, 0.05],
        [0.045, 0.019],
      ].map((p) => new THREE.Vector2(...p)),
      8,
    ).scale(1, 1, 1.4),
    D.clay,
  );
  const c = new THREE.Color(),
    rim = new THREE.Color(D.rim),
    clay = new THREE.Color(D.clay);
  for (let i = 0; i < bowl.attributes.position.count; i++)
    c.copy(clay)
      .lerp(rim, THREE.MathUtils.smoothstep(bowl.attributes.position.getY(i), 0.03, 0.05))
      .toArray(bowl.attributes.color.array, i * 3);
  const oil = colour(
    new THREE.CircleGeometry(0.049, 8)
      .rotateX(-Math.PI / 2)
      .scale(1, 1, 1.35)
      .translate(0, 0.022, 0),
    D.oil,
  );
  const wick = colour(new THREE.CylinderGeometry(0.003, 0.004, 0.034, 3).rotateX(0.9).translate(0, 0.048, 0.066), D.wick);
  return mergeGeometries([bowl, oil, wick]);
}

function flameGeometry() {
  const positions = [],
    colours = [],
    D = NATURE.diyo;
  for (let side = 0; side < 2; side++) {
    const perimeter = [
        [0, 0],
        [-0.027, 0.028],
        [-0.032, 0.065],
        [-0.016, 0.105],
        [0.009, 0.16],
        [0.025, 0.068],
        [0.023, 0.025],
      ],
      centre = [0, 0.055];
    for (let i = 0; i < perimeter.length; i++)
      for (const [x, y] of [centre, perimeter[i], perimeter[(i + 1) % perimeter.length]]) {
        positions.push(side ? 0 : x, (y * D.flameHeight) / 0.16 + 0.06, side ? x + 0.079 : 0.079);
        new THREE.Color(y < 0.07 ? D.hot : D.flame).toArray(colours, colours.length);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}

export class DiyoField {
  constructor(scene, capacity, permanent = false) {
    this.capacity = capacity;
    this.count = this.bodyCount = 0;
    this.permanent = permanent;
    this.on = { value: 0 };
    this.cups = new THREE.InstancedMesh(
      diyoGeometry(),
      toon('#ffffff', { key: 'diyo-bowl', rim: 0.1, params: { vertexColors: true, side: THREE.DoubleSide } }),
      capacity,
    );
    this.flames = new THREE.InstancedMesh(
      flameGeometry(),
      toon('#ffffff', {
        key: 'diyo-flame',
        rim: 0,
        wet: false,
        params: { vertexColors: true, side: THREE.DoubleSide },
        uniforms: { uDiyoOn: this.on },
        vertexHead: 'varying float vFlame;',
        vertexMain: `float phase=instanceMatrix[3].x*1.7+instanceMatrix[3].z*2.3;vFlame=.94+.045*sin(uTime*11.0+phase)+.015*sin(uTime*27.0+phase*2.0);
        float tip=max(0.0,position.y-.06)/${NATURE.diyo.flameHeight.toFixed(3)};
        transformed.x+=tip*tip*(sin(uTime*3.0+phase)*.009+uWindDir.x*uWind*.009);transformed.y=.06+(position.y-.06)*vFlame;`,
        fragHead: 'uniform float uDiyoOn;varying float vFlame;',
        fragEmissive: `totalEmissiveRadiance=diffuseColor.rgb*${NATURE.diyo.strength.toFixed(3)}*vFlame*uDiyoOn;`,
      }),
      capacity,
    );
    for (const mesh of [this.cups, this.flames]) {
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
  }
  begin() {
    this.count = this.bodyCount = 0;
  }
  push(x, y, z, yaw = 0, body = true) {
    if (this.count >= this.capacity) return;
    this.matrix.compose(this.position.set(x, y + 0.006, z), this.rotation.setFromAxisAngle(this.up, yaw), this.scale);
    if (body) this.cups.setMatrixAt(this.bodyCount++, this.matrix);
    this.flames.setMatrixAt(this.count, this.matrix);
    this.count++;
  }
  end() {
    this.cups.count = this.bodyCount;
    this.flames.count = this.count;
    for (const mesh of [this.cups, this.flames]) mesh.instanceMatrix.needsUpdate = true;
  }
  update(night, visible = true) {
    this.on.value = this.permanent ? 0.55 + 0.45 * night : THREE.MathUtils.smoothstep(night, 0.1, 0.5);
    this.cups.visible = visible && this.bodyCount > 0;
    this.flames.visible = visible && this.count > 0 && this.on.value > 0.01;
  }
}
