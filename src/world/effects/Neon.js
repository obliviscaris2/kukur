/**
 * Night magic for busy streets: strings of fairy lights zig-zagging across lanes (Tihar style) and glowing
 * vertical "blade" signs on shopfronts. Generated per tile from the street network (busy tiles only), drawn as
 * one instanced bulb mesh, one instanced sign mesh, one halo point cloud and one wire line set.
 * Brightness follows the night (Sky's uNight); by day the bulbs are just coloured beads.
 */
import * as THREE from 'three';
import { rng, hash } from '../../core/rng.js';
import { U } from '../../render/toon.js';
import { ART } from '../../config/index.js';

const L=ART.lanterns,BULB=L.bulbs,SIGN=L.signs;
const MAXB = 3000, MAXS = 360;

export class Neon {
  constructor(scene, world) {
    this.world = world; this.byTile = new Map(); this.dirty = true; this._t = 0;
    this.last = new THREE.Vector3(1e9,0,0); this.lights = [];
    this.bulbs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAXB);
    this.signs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.5, 0.55), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAXS);
    for (const m of [this.bulbs, this.signs]) { m.count = 0; m.frustumCulled = false; m.setColorAt(0, new THREE.Color()); scene.add(m); }
    this.wires = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#2a2420' })); this.wires.frustumCulled = false; scene.add(this.wires);
    // soft halos (additive points) around every light
    const hg = new THREE.BufferGeometry();
    this.hPos = new Float32Array((MAXB + MAXS) * 3); this.hCol = new Float32Array((MAXB + MAXS) * 3); this.hSize = new Float32Array(MAXB + MAXS);
    hg.setAttribute('position', new THREE.BufferAttribute(this.hPos, 3)); hg.setAttribute('color', new THREE.BufferAttribute(this.hCol, 3)); hg.setAttribute('aSize', new THREE.BufferAttribute(this.hSize, 1));
    this.u = { uNight: { value: 0 }, uT: { value: 0 } };
    this.halo = new THREE.Points(hg, new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: 'uniform float uT; attribute float aSize; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * (0.85 + 0.15 * sin(uT * 3.0 + position.x)) * 420.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uNight; varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-r * r * 4.0) * uNight; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }',
    }));
    this.halo.frustumCulled = false; this.halo.renderOrder = 5; scene.add(this.halo);
    world.onTile((ev, tile) => { if (ev === 'load') this.#generate(tile); else this.byTile.delete(tile.key); this.dirty = true; });
  }

  #generate(tile) {
    const dens = tile.data.density ?? 0, core = tile.data.core ?? 0;
    if (dens < 0.3) return;
    const r = rng(hash(tile.tx, tile.tz, 404)), H = (x, z) => this.world.heightAt(x, z), bulbs = [], signs = [], wires = [], lights = [];
    for (const n of tile.data.navs) {
      if (n.w < 3 || n.w > 12) continue;
      const P = n.pts;
      for (let i = 2; i < P.length; i += 2) {
        const ax = P[i - 2], az = P[i - 1], dx = P[i] - ax, dz = P[i + 1] - az, L = Math.hypot(dx, dz); if (L < 6) continue;
        const ux = dx / L, uz = dz / L, nx = -uz, nz = ux, half = n.w / 2 + 1.2;
        // fairy-light strings across the lane every ~9-14 m
        for (let d = 4 + r() * 6; d < L - 3; d += 9 + r() * 6) {
          if (r() > 0.35 + dens * 0.6) continue;
          const cx = ax + ux * d, cz = az + uz * d, y0 = H(cx, cz) + 5.2 + r() * 1.2, skew = (r() - 0.5) * 4;
          lights.push({position:new THREE.Vector3(cx,y0-2.2,cz),colour:new THREE.Color('#ffe0aa'),radius:ART.lanterns.lightRadius,power:ART.lanterns.lightPower,warm:true});
          const a = [cx + nx * half - ux * skew, cz + nz * half - uz * skew], b = [cx - nx * half + ux * skew, cz - nz * half + uz * skew];
          const cnt = Math.max(6, Math.round((half * 2) / 0.55)), base = Math.floor(r() * BULB.length), prev = [];
          for (let k = 0; k <= cnt; k++) {
            const t = k / cnt, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = y0 - Math.sin(t * Math.PI) * 0.9;
            bulbs.push(x, y, z, (base + k) % BULB.length);
            if (prev.length) wires.push(prev[0], prev[1], prev[2], x, y, z);
            prev.splice(0, 3, x, y, z);
          }
        }
        // blade signs on shopfronts (more in the old cores and Thamel-dense tiles)
        for (let d = 3 + r() * 5; d < L - 2; d += 7 + r() * 8) {
          if (r() > 0.25 + dens * 0.4 + core * 0.2) continue;
          const side = r() < 0.5 ? -1 : 1, off = n.w / 2 + 0.55, x = ax + ux * d + nx * off * side, z = az + uz * d + nz * off * side;
          signs.push(x, H(x, z) + 3.2 + r() * 1.6, z, Math.atan2(ux, uz), Math.floor(r() * SIGN.length));
        }
      }
    }
    this.byTile.set(tile.key, { bulbs, signs, wires, lights });
  }

  #rebuild(focus) {
    this.dirty = false;
    this.last.copy(focus); this.lights = [];
    const near=(x,z)=>(x-focus.x)**2+(z-focus.z)**2<L.radius**2;
    const M = new THREE.Matrix4(), C = new THREE.Color(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(1, 1, 1), Pv = new THREE.Vector3();
    let nb = 0, ns = 0, nh = 0; const wires = [];
    for (const { bulbs, signs, wires: w, lights } of this.byTile.values()) {
      for (const light of lights) if (light.position.distanceToSquared(focus)<1600) this.lights.push(light);
      for (let i = 0; i < bulbs.length && nb < MAXB; i += 4) {
        if(!near(bulbs[i],bulbs[i+2]))continue;
        M.makeTranslation(bulbs[i], bulbs[i + 1], bulbs[i + 2]); this.bulbs.setMatrixAt(nb, M); C.set(BULB[bulbs[i + 3]]); this.bulbs.setColorAt(nb, C); nb++;
        this.hPos.set([bulbs[i], bulbs[i + 1], bulbs[i + 2]], nh * 3); C.toArray(this.hCol, nh * 3); this.hSize[nh++] = L.bulbHalo;
      }
      for (let i = 0; i < signs.length && ns < MAXS; i += 5) {
        if(!near(signs[i],signs[i+2]))continue;
        M.compose(Pv.set(signs[i], signs[i + 1], signs[i + 2]), Q.setFromAxisAngle(Y, signs[i + 3]), S); this.signs.setMatrixAt(ns, M); C.set(SIGN[signs[i + 4]]); this.signs.setColorAt(ns, C); ns++;
        this.hPos.set([signs[i], signs[i + 1], signs[i + 2]], nh * 3); C.toArray(this.hCol, nh * 3); this.hSize[nh++] = L.signHalo;
      }
      for (let i = 0; i < w.length; i+=6) if(near(w[i],w[i+2])) for(let j=0;j<6;j++)wires.push(w[i+j]);
    }
    this.bulbs.count = nb; this.signs.count = ns; this.bulbs.visible = nb > 0; this.signs.visible = ns > 0;
    for (const m of [this.bulbs, this.signs]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    const hg = this.halo.geometry; hg.setDrawRange(0, nh); hg.attributes.position.needsUpdate = hg.attributes.color.needsUpdate = hg.attributes.aSize.needsUpdate = true;
    this.wires.geometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.wires.visible = wires.length > 0;
    this.lights.sort((a,b)=>a.position.distanceToSquared(focus)-b.position.distanceToSquared(focus));
    this.lights.length=Math.min(8,this.lights.length);
  }

  update(dt, focus) {
    this._t-=dt;
    if ((this.dirty || focus.distanceToSquared(this.last)>16) && this._t<=0) { this._t = 0.4; this.#rebuild(focus); }
    const night = U.uNight.value;
    this.u.uNight.value = (.12+.88*night)*L.haloOpacity; this.u.uT.value += dt;
    const k = L.bulbDay + night * L.bulbNight;
    this.bulbs.material.color.setScalar(k); this.signs.material.color.setScalar(L.signDay + night * L.signNight);
    this.halo.visible = this.bulbs.count+this.signs.count>0;
  }
}
