/**
 * A Kathmandu local. Dressed from config/npc.js (outfit, skin, hair, hat) and given a role and a mood.
 *
 * Roles (what they do):  walker · kid · porter · elder · vendor · chatter · devotee
 *   mode 'walk'   follow the real street network            (walker, kid, porter, elder)
 *   mode 'circle' walk clockwise around a temple or stupa    (devotee)
 *   mode 'stand'  stay put, facing the street or a friend    (vendor with a cart, chatting groups)
 *   mode 'sit'    sit on a chautari step                     (elder)
 *
 * Moods (how they treat the pup): kind (pet, wave, toss a biscuit) · neutral · grumpy (shoo) · cruel (throw a stone)
 * Kids chase the pup to play and run away squealing when it barks.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NPC, THREATS, ART } from '../../config/index.js';
import { toon } from '../../render/toon.js';
import { angDiff, damp } from '../../core/geo.js';
import { pick, weighted } from '../../core/rng.js';
import { setLod } from './lod.js';
import { ACTOR_FADE } from '../../render/actorFade.js';
import { characterOutline } from '../../render/characterOutline.js';

// regions baked by pipeline/blender/human.py (vertex colour R = id / 13)
const REGION_SHADER = /* glsl */ `
  { int ri = int(floor(vColor.r * 13.0 + 0.5));
    vec3 rc = ri == 0 ? cSkin : ri == 1 ? cTop : ri == 2 ? cBottom : ri == 3 ? cShoes : ri == 4 ? cHat : ri == 5 ? cHair
      : ri == 6 ? vec3(0.13, 0.07, 0.04) : ri == 7 ? vec3(1.5) : ri == 8 ? vec3(1.0, 0.55, 0.6) : ri == 9 ? cAccent
      : ri == 10 ? vec3(0.6, 0.15, 0.18) : ri == 11 ? cDrape : ri == 12 ? vec3(0.45, 0.3, 0.18) : vec3(1.0, 0.76, 0.24);
    float weave=tNoise(vCloth.xy*vec2(100.0,35.0)+vCloth.z*31.0);
    if(ri==1||ri==2||ri==4||ri==11)rc*=.88+weave*.16;
    if(ri==0)rc*=.94+.06*smoothstep(.4,1.5,vCloth.y);
    diffuseColor.rgb *= rc; }`;
// optional parts (vertex colour G = id / 15)
const PARTS = ['base', 'Hair_short', 'Hair_bun', 'Hair_braid', 'Hat_dhaka', 'Hat_cap', 'Hat_shawl', 'Tunic', 'Patuka', 'Vest', 'Sari', 'Pallu', 'Skirt', 'Tie', 'Stick'];
const BIT = Object.fromEntries(PARTS.map((p, i) => [p, 1 << i]));

/** One index buffer per combination of worn parts, sharing the vertex buffers (cached on the source geometry). */
function geometryFor(src, mask) {
  const cache = (src.userData.byMask ??= new Map());
  if (cache.has(mask)) return cache.get(mask);
  if (!src.userData.tris) {
    const col = src.attributes.color, idx = src.index.array, tris = PARTS.map(() => []);
    for (let t = 0; t < idx.length; t += 3) { const p = Math.round(col.getY(idx[t]) * 15); (tris[p] || tris[0]).push(idx[t], idx[t + 1], idx[t + 2]); }
    src.userData.tris = tris;
  }
  const g = new THREE.BufferGeometry();
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  const list = []; src.userData.tris.forEach((t, i) => { if (mask & (1 << i)) list.push(...t); });
  g.setIndex(list); g.boundingSphere = src.boundingSphere; g.boundingBox = src.boundingBox;
  cache.set(mask, g);
  return g;
}

const ANIM_OF = { goto: 'Walk', pet: 'Pet', feed: 'Pet', wave: 'Wave', call: 'Wave', shoo: 'Shoo', throw: 'Shoo', idle: 'Idle', talk: 'Idle', chase: 'Walk', flee: 'Walk', angry: 'Walk', hunt: 'Walk', strike: 'Shoo', stunned: 'Idle' };
const PRODUCE = ['#e63946', '#ffcc29', '#7ac74f', '#ff9f1c', '#9b5de5', '#f4f1de'];

/** A little wooden vendor cart with a striped canopy and heaps of produce. */
function vendorCart(r) {
  const pieces = [], wood = '#8a6546', canopy = pick(r, ['#ae5146', '#568c7c', '#b99749', '#597c93']);
  const add = (geo, color, x, y, z) => {
    let g = geo.index ? geo.toNonIndexed() : geo; g.translate(x, y, z);
    for (const name of Object.keys(g.attributes)) if (!['position','normal'].includes(name)) g.deleteAttribute(name);
    const colors = new Float32Array(g.attributes.position.count * 3), c = new THREE.Color(color);
    for (let i = 0; i < g.attributes.position.count; i++) c.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); pieces.push(g);
  };
  add(new THREE.BoxGeometry(1.25, 0.12, 0.7), wood, 0, 0.72, 0);
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12).rotateZ(Math.PI / 2), wood, sx * 0.66, 0.26, 0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), wood, sx * 0.58, 1.25, sz * 0.32);
  add(new THREE.ConeGeometry(0.95, 0.3, 4, 1, true).rotateY(Math.PI / 4).scale(1, 1, 0.65), canopy, 0, 1.85, 0);
  for (let i = 0; i < 14; i++) add(new THREE.IcosahedronGeometry(0.065, 0), pick(r, PRODUCE), (r() - 0.5) * 1.0, 0.83 + r() * 0.08, (r() - 0.5) * 0.5);
  const mesh = new THREE.Mesh(mergeGeometries(pieces), toon('#ffffff', { key: 'vendorCart', params: { vertexColors: true, side: THREE.DoubleSide } })); mesh.castShadow = true; return mesh;
}

export class Person {
  /** @param {object} gltf  @param {Function} r rng  @param {{role?: string, mood?: string, nearStupa?: boolean}} o */
  constructor(gltf, r, o = {}) {
    this.r = r; this.role = o.role || 'walker';
    this.mood = o.mood || weighted(r, Object.entries(NPC.moods).map(([name, weight]) => ({ name, weight }))).name;
    if (this.role === 'devotee' && this.mood === 'cruel') this.mood = 'neutral';
    const kid = this.role === 'kid', elder = this.role === 'elder';
    const pool = NPC.outfits.filter((f) => (kid ? f.who === 'kid' || f.name === 'casual' || f.name === 'kurta' : f.who !== 'kid') && f.name !== 'monk' && f.name !== 'traffic' && f.name !== 'catcher');
    const outfit = this.role === 'catcher' ? NPC.outfits.find(f=>f.name==='catcher') : this.role === 'police' ? NPC.outfits.find((f) => f.name === 'traffic') : this.role === 'devotee' && o.nearStupa && r() < 0.35 ? NPC.outfits.find((f) => f.name === 'monk') : weighted(r, pool);
    const woman = outfit.who === 'woman' || ((outfit.who === 'any' || outfit.who === 'kid') && r() < 0.5);
    const hat = elder && outfit.name === 'daura' ? 'dhaka' : pick(r, outfit.hats);
    // which parts this person wears
    let mask = BIT.base;
    for (const p of outfit.parts) mask |= BIT[p];
    if (outfit.vest && r() < outfit.vest) mask |= BIT.Vest;
    if (outfit.skirt && woman && r() < outfit.skirt * 2) mask |= BIT.Skirt;
    if (hat === 'dhaka') mask |= BIT.Hat_dhaka; else if (hat === 'cap') mask |= BIT.Hat_cap; else if (hat === 'shawl') mask |= BIT.Hat_shawl;
    if (!outfit.bald && hat !== 'shawl') mask |= woman ? (kid && r() < 0.6 ? BIT.Hair_braid : r() < 0.7 ? BIT.Hair_bun : BIT.Hair_braid) : BIT.Hair_short;
    if (elder) mask |= BIT.Stick;
    const C = (h) => { const c = new THREE.Color(h), hsl = {}; c.getHSL(hsl); return c.setHSL(hsl.h, hsl.s * NPC.people.saturation, hsl.l); };
    const top = pick(r, outfit.top), hair = elder ? pick(r, ['#cfcfcf', '#e6e2da', '#9a948c']) : pick(r, NPC.hairs);
    this.cameraFade = { value: 1 };
    const mat = toon('#ffffff', {
      rim: 0.45, subject: 'npc', key: 'person', params: { vertexColors: true },
      uniforms: {
        uCameraFade: this.cameraFade,
        cSkin: { value: C(pick(r, NPC.skins)) }, cTop: { value: C(top) }, cBottom: { value: C(pick(r, outfit.bottom)) }, cShoes: { value: C(this.role === 'police' ? '#242b34' : pick(r, ['#3b2b22', '#6b4a2a', '#c0392b', '#f1f1f1', '#2b2d42'])) },
        cHat: { value: C(this.role === 'police' ? '#f0f0e8' : hat === 'dhaka' ? pick(r, ['#b23a48', '#8d5cf6', '#e76f51', '#2a9d8f']) : hat === 'shawl' ? pick(r, ['#e63946', '#ff6fa8', '#ffcc29', '#f1faee']) : pick(r, ['#ffcc29', '#2a5bd7', '#e63946', '#ffffff', '#ff6fa8'])) },
        cHair: { value: C(hair) }, cAccent: { value: C(pick(r, outfit.accent || ['#ffcc29'])) }, cDrape: { value: C(pick(r, outfit.drape || [top])) },
      },
      vertexHead:'varying vec3 vCloth;',vertexMain:'vCloth=position;',
      fragHead: 'varying vec3 vCloth; uniform float uCameraFade; uniform vec3 cSkin, cTop, cBottom, cShoes, cHat, cHair, cAccent, cDrape;',
      onShader: (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', REGION_SHADER + ACTOR_FADE); },
    });
    this.root = new THREE.Group();
    this.model = cloneSkinned(gltf.scene);
    this.porter = this.role === 'porter';
    const baseName = (n) => n.replace(/(_\d+|\.\d+)$/, '');
    this.model.traverse((m) => {
      if (m.isBone && m.name === 'head') this.headBone = m;
      if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      const base = baseName(m.name) === 'Umbrella' || baseName(m.parent?.name || '') === 'Umbrella' ? 'Umbrella' : baseName(m.name) === 'Doko' || baseName(m.parent?.name || '') === 'Doko' ? 'Doko' : 'Person';
      if (base === 'Umbrella') { (this.umbrellaParts ??= []).push(m); m.visible = false; m.material = toon(m.material.name === 'Doko' ? '#6b4a2a' : pick(r, ['#e63946', '#2a5bd7', '#ffcc29', '#2a9d4b', '#ff6fa8']), { key: 'umb' + m.material.name, params: { side: THREE.DoubleSide } }); }
      else if (base === 'Doko') { m.visible = this.porter; m.material = toon('#b5874a', { key: 'doko' }); }
      else if (m.isSkinnedMesh) {
        m.geometry = geometryFor(m.geometry, mask); m.material = mat; this.body = m;
        if(ART.subjects.npc.inkPixels>0){
          const ink = new THREE.SkinnedMesh(m.geometry, characterOutline('npc')); ink.bind(m.skeleton, m.bindMatrix); ink.frustumCulled = false; ink.castShadow = false;
          m.parent.add(ink); this.outline = ink;
        }
      }
    });
    const s = (kid ? 0.7 : elder ? 0.96 : 1.0) + r() * 0.1;
    this.model.scale.setScalar(s); this.kid = kid;
    this.root.add(this.model);
    if(this.role==='catcher'){const hand=this.model.getObjectByName('handR')||this.model;const pole=new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(.012,.012,1.0,5).translate(0,.42,0),new THREE.TorusGeometry(.13,.01,4,10).translate(0,.99,0)]),toon('#8b7961',{key:'catchpole'}));pole.rotation.z=.18;hand.add(pole);this.catchpole=pole;}
    if (this.role === 'vendor') { this.cart = vendorCart(r); this.cart.position.set(0.95, 0, 0.35); this.root.add(this.cart); }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.act = {};
    for (const c of gltf.animations) {
      const clip = c.name === 'Umbrella' ? new THREE.AnimationClip('Umbrella', c.duration, c.tracks.filter((t) => /upperarmR|forearmR|handR/.test(t.name))) : c;
      const a = this.mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); a.time = r() * c.duration; this.act[c.name] = a;
    }
    this.w = Object.fromEntries(Object.keys(this.act).map((k) => [k, 0]));
    if (this.act.Idle) { this.w.Idle = 1; this.act.Idle.setEffectiveWeight(1); }
    const R = NPC.roles[this.role] || {};
    this.walkSpeed = (NPC.people.walkSpeed[0] + r() * (NPC.people.walkSpeed[1] - NPC.people.walkSpeed[0])) * (R.speed || 1);
    this.speed = this.visualSpeed = 0; this.heading = 0; this.state = 'move'; this.stateT = 0; this.cool = 2 + r() * 4; this.lineT = 3 + r() * 8;
    this.mode = 'walk'; this.side = r() < 0.5 ? -1 : 1; this.done = false;
  }
  get pos() { return this.root.position; }
  headPos(out = new THREE.Vector3()) { if (this.headBone) { this.headBone.getWorldPosition(out); out.y += 0.13 * this.model.scale.y; return out; } return out.copy(this.pos).setY(this.pos.y + NPC.people.headHeight * this.model.scale.y); }
  lod(dist) { setLod(this, dist); }
  setCameraFade(value) { this.cameraFade.value = value; this.model.visible = value > 0.015; if (this.outline) this.outline.visible = this._outlineLod && value > 0.95; }

  // ---- placement (called by NpcManager)
  placeOn(nav, segIndex, t, dir) {
    this.mode = 'walk'; this.nav = nav; this.dir = dir; this.seg = segIndex;
    const P = nav.pts, ax = P[segIndex * 2], az = P[segIndex * 2 + 1], bx = P[(segIndex + dir) * 2], bz = P[(segIndex + dir) * 2 + 1];
    const length = Math.hypot(bx - ax, bz - az) || 1, offset = (nav.w / 2 - NPC.people.radius - NPC.people.kerbOffset) * this.side;
    this.root.position.set(ax + (bx - ax) * t - (bz - az) / length * offset, 0, az + (bz - az) * t + (bx - ax) / length * offset);
    this.heading = Math.atan2(bx - ax, bz - az);
  }
  /** Scripted walk (cutscenes): head to (x, z), then stand idle facing the pup. */
  walkTo(x, z, speed = 1.4) { this.scripted = true; this.goal = { x, z }; this.goalSpeed = speed; this.state = 'goto'; this.stateT = 1e9; }
  standAt(x, z, heading) { this.mode = 'stand'; this.root.position.set(x, 0, z); this.heading = heading; }
  sitAt(x, z, heading) { this.mode = 'sit'; this.root.position.set(x, 0, z); this.heading = heading; }
  circle(cx, cz, radius, theta) { this.mode = 'circle'; this.center = { x: cx, z: cz }; this.radius = radius; this.theta = theta; this.root.position.set(cx + Math.cos(theta) * radius, 0, cz + Math.sin(theta) * radius); }

  /** ctx = { dt, world, pup, raining, say, events, treats, stones, audio } */
  update(ctx) {
    const { dt, world, pup } = ctx;
    this.cool -= dt; this.stateT -= dt; this.lineT -= dt;
    this.aggression = Math.max(0, (this.aggression || 0) - dt);
    this.stunImmune = Math.max(0, (this.stunImmune || 0) - dt);
    if (this.stunFor > 0) { this.stunFor = Math.max(0, this.stunFor - dt); this.speed = this.visualSpeed = 0; this.state = 'stunned'; this.#animate(dt, false); return; }
    if (this.state === 'stunned') { this.state = 'move'; this.cool = Math.max(this.cool, THREATS.stun.recover); }
    const p = this.root.position, oldX = p.x, oldZ = p.z, toPup = Math.hypot(pup.pos.x - p.x, pup.pos.z - p.z);
    this.#catcher(ctx, toPup);
    const calm = this.state === 'move' || this.state === 'idle' || this.state === 'talk' || this.state === 'call';
    if (calm && this.cool <= 0 && !pup.sniffing && !this.playSession) this.#react(ctx, toPup);
    const facePup = () => { this.heading += angDiff(this.heading, Math.atan2(pup.pos.x - p.x, pup.pos.z - p.z)) * damp(6, dt); };
    let move = 0;
    switch (this.state) {
      case 'move':
        if (this.mode === 'walk') move = this.#walk(dt, ctx.raining);
        else if (this.mode === 'circle') move = this.#circle(dt);
        else if (this.role === 'vendor' && this.lineT <= 0) { ctx.say(this, pick(this.r, NPC.lines.vendor)); this.state = 'call'; this.stateT = 1.4; this.lineT = 7 + this.r() * 9; }
        else if (this.role === 'devotee' && this.lineT <= 0) { ctx.say(this, pick(this.r, NPC.lines.devotee)); this.lineT = 14 + this.r() * 12; }
        break;
      case 'goto': {
        const gx = this.goal.x - p.x, gz = this.goal.z - p.z;
        if (Math.hypot(gx, gz) < 0.5) { this.state = 'idle'; this.stateT = 1e9; break; }
        this.heading += angDiff(this.heading, Math.atan2(gx, gz)) * damp(6, dt); move = this.goalSpeed;
        break;
      }
      case 'chase':
        this.heading += angDiff(this.heading, Math.atan2(pup.pos.x - p.x, pup.pos.z - p.z)) * damp(5, dt); move = 2.6;
        if (toPup < 1.3) { this.state = 'pet'; this.stateT = 2.4; ctx.events.emit('petted', this); pup.setMood('excited', 3); }
        break;
      case 'hunt':
        this.heading += angDiff(this.heading, Math.atan2(pup.pos.x-p.x,pup.pos.z-p.z))*damp(5,dt); move=THREATS.catcher.speed;
        if(toPup<THREATS.catcher.reach+.25){this.state='strike';this.stateT=THREATS.catcher.windup;this.struck=false;move=0;ctx.say(this,'Hold F to stagger me — or dodge!');}
        break;
      case 'strike':
        facePup();
        if(!this.struck&&this.stateT<THREATS.catcher.strikeAt){this.struck=true;this.cool=THREATS.catcher.cooldown;this.aggression=THREATS.aggressionMemory;const target=pup.pos.clone().setY(pup.pos.y+.3);if(toPup<THREATS.catcher.reach&&Math.abs(p.y-pup.pos.y)<.8&&world.physics.rayFrac(this.headPos(),target)>.95)ctx.events.emit('damage',{amount:1,from:p.clone(),source:'catchpole'});}
        break;
      case 'angry':   // a short, harmless chase after the pup broke something
        this.heading += angDiff(this.heading, Math.atan2(pup.pos.x - p.x, pup.pos.z - p.z)) * damp(5, dt); move = toPup > 1.3 ? 3.1 : 0;
        if (toPup < 1.3) { this.state = 'shoo'; this.stateT = 1.4; }
        if (this.lineT <= 0) { ctx.say(this, pick(this.r, NPC.lines.angry)); this.lineT = 2.5; }
        break;
      case 'flee':
        this.heading += angDiff(this.heading, Math.atan2(p.x - pup.pos.x, p.z - pup.pos.z)) * damp(6, dt); move = 3.0;
        break;
      case 'throw':
        facePup();
        if (!this.thrown && this.stateT < 0.5) { this.thrown = true; this.aggression=THREATS.aggressionMemory; ctx.stones.throw(this.headPos().addScaledVector(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)), 0.3), pup.pos); }
        break;
      case 'feed':
        facePup();
        if (!this.fed && this.stateT < 1.0) { this.fed = true; const k = Math.min(1, 0.7 / Math.max(toPup, 0.01)); ctx.treats.drop(p.x + (pup.pos.x - p.x) * k, p.z + (pup.pos.z - p.z) * k, p.y + 1.0); ctx.say(this, pick(this.r, NPC.lines.feed)); }
        break;
      case 'pet': case 'wave': case 'shoo': case 'idle':
        facePup();
        break;
      default: break;
    }
    if (this.state !== 'move' && this.stateT <= 0) { this.state = 'move'; this.thrown = this.fed = false; }
    this.speed += (move - this.speed) * damp(4, dt);
    let dx = Math.sin(this.heading) * this.speed * dt, dz = Math.cos(this.heading) * this.speed * dt;
    if (this.mode === 'circle' && this.state === 'move') { dx = p.x - oldX; dz = p.z - oldZ; p.x = oldX; p.z = oldZ; }
    const hit = world.physics.move(p, dx, dz, NPC.people.radius * this.model.scale.x, { height: NPC.people.height * this.model.scale.y, step: 0.2, ignore: this });
    const travelled = Math.hypot(p.x - oldX, p.z - oldZ);
    this.visualSpeed += (Math.min(this.speed,travelled/Math.max(dt,.001))-this.visualSpeed)*damp(15,dt);
    this.blocked = hit && travelled < Math.hypot(dx,dz) * 0.25 ? (this.blocked || 0) + dt : 0;
    if (this.blocked > 1.4 && this.mode === 'walk' && this.state === 'move' && !this.scripted) { const dir=this.dir;this.seg+=dir;this.dir=-dir;this.side=-this.side; this.seg = Math.max(0,Math.min(this.nav.pts.length/2-1,this.seg)); if(this.seg+this.dir<0||this.seg+this.dir>=this.nav.pts.length/2)this.dir=-this.dir; this.blocked=0; }
    p.y = this.shop ? this.shop.y : world.physics.groundAt(p.x, p.z, p.y + 0.2);
    this.root.rotation.y = this.heading;
    const umb = ctx.raining && !this.porter && this.mode !== 'sit' && this.role !== 'vendor';
    if (this.umbrellaParts) for (const m of this.umbrellaParts) m.visible = umb;
    this.#animate(dt, umb);
  }

  /** Something got smashed nearby (or the pup dashed past). Vendors always mind; kids think it's hilarious. */
  startle(ctx, angryChance = 0.55) {
    if (this.stunFor>0 || ['throw','hunt','strike'].includes(this.state) || this.mode === 'sit' || this.state === 'angry') return;
    if (this.kid) { ctx.say(this, pick(this.r, NPC.lines.laugh)); this.state = 'wave'; this.stateT = 1.5; return; }
    const canChase = this.mode === 'walk';          // vendors (with carts) and devotees stay put and shake a fist
    if (canChase && this.r() < angryChance) { this.state = 'angry'; this.stateT = 3.5 + this.r() * 2; this.lineT = 0; this.cool = 12; }
    else { ctx.say(this, pick(this.r, NPC.lines.angry)); this.state = 'shoo'; this.stateT = 1.6; }
  }

  /** The pup barked nearby. */
  onBark(ctx, d) {
    if (this.stunFor>0 || this.role==='catcher' || d > 9 || this.state === 'throw') return;
    if (this.kid && this.mood !== 'cruel') { this.state = 'flee'; this.stateT = 2.2; ctx.say(this, pick(this.r, NPC.lines.flee)); this.cool = 6; }
    else if (this.mood === 'cruel' && this.mode !== 'sit') this.#startThrow(ctx);
    else if (this.mood === 'grumpy' && this.mode !== 'sit') { this.state = 'shoo'; this.stateT = 1.6; ctx.say(this, pick(this.r, NPC.lines.grumpy)); }
  }

  /** Interrupt an attack without hurting neutral bystanders. */
  stun(seconds) {
    if (this.scripted || this.stunImmune > 0) return false;
    this.stunFor=seconds;this.stunImmune=seconds+THREATS.stun.immunity;
    this.state='stunned';this.speed=this.visualSpeed=0;this.thrown=this.struck=true;this.aggression=0;
    this.cool=seconds+THREATS.stun.recover;return true;
  }

  #catcher(ctx, distance) {
    if(this.role!=='catcher'||this.scripted||ctx.calm||this.state==='strike')return;
    const p=this.pos,cfg=THREATS.catcher,target=ctx.pup.pos;
    const visible=Math.abs(target.y-p.y)<1.2&&!ctx.pup.swimming&&ctx.world.physics.rayFrac(this.headPos(),target.clone().setY(target.y+.3))>.95;
    if(this.state==='hunt') {
      this.lostFor=visible?0:(this.lostFor||0)+ctx.dt;
      if(distance>cfg.leash||this.lostFor>2){this.state='move';this.cool=cfg.cooldown;this.aggression=0;}
    } else if(this.cool<=0&&distance<cfg.sight&&distance>cfg.minimumDistance&&visible) {
      this.state='hunt';this.stateT=12;this.lostFor=0;ctx.say(this,NPC.lines.catcher[Math.floor(this.r()*NPC.lines.catcher.length)]);
    }
  }

  #startThrow(ctx) { this.state = 'throw'; this.stateT = 1.1; this.thrown = false; ctx.say(this, pick(this.r, NPC.lines.cruel)); this.cool = 9 + this.r() * 6; }

  #react(ctx, d) {
    if(ctx.calm||this.role==='catcher')return;
    const { pup } = ctx, sitting = this.mode === 'sit';
    if (this.mood === 'cruel' && !sitting && d < 9 && d > 2) { if (this.r() < 0.5) this.#startThrow(ctx); else this.cool = 3; return; }
    if (this.kid && this.mood !== 'grumpy' && d < 5.5) { this.state = 'chase'; this.stateT = 3.5; ctx.say(this, pick(this.r, NPC.lines.kid)); this.cool = 16; return; }
    if (d > 3.2) return;
    if (this.mood === 'kind') {
      if (!sitting && !this.porter && this.r() < NPC.feedChance) { this.state = 'feed'; this.stateT = 2.0; this.fed = false; }
      else { this.state = d < 1.8 && !this.porter ? 'pet' : 'wave'; this.stateT = this.state === 'pet' ? 3.2 : 2.2; ctx.say(this, pick(this.r, NPC.lines.kind) + ' ❤️'); ctx.events.emit('petted', this); }
      pup.setMood('excited', 3);
      this.cool = 18;
    } else if (this.mood === 'grumpy' || this.mood === 'cruel') {
      this.state = sitting ? 'idle' : 'shoo'; this.stateT = 1.6; ctx.say(this, pick(this.r, NPC.lines.grumpy)); pup.setMood('scared', 1.5); this.cool = 10;
    } else { this.state = 'idle'; this.stateT = 1.2; this.cool = 12; }
  }

  #walk(dt, raining) {
    const n = this.nav;
    if (!n || n.pts.length < 4) { this.state = 'idle'; this.stateT = 3; return 0; }
    const i = this.seg, P = n.pts;
    const ax = P[i * 2], az = P[i * 2 + 1], bx = P[(i + this.dir) * 2], bz = P[(i + this.dir) * 2 + 1];
    if(!Number.isFinite(ax+az+bx+bz)) { this.seg=this.dir>0?0:P.length/2-1;this.state='idle';this.stateT=1;return 0; }
    const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
    const off = Math.max(0, n.w / 2 - NPC.people.radius - NPC.people.kerbOffset) * this.side;
    const tx = bx - uz * off, tz = bz + ux * off, p = this.root.position;
    this.heading += angDiff(this.heading, Math.atan2(tx - p.x, tz - p.z)) * damp(5, dt);
    if (Math.hypot(tx - p.x, tz - p.z) < 0.6) {
      this.seg += this.dir;
      const last = this.dir > 0 ? P.length / 2 - 1 : 0;
      if (this.seg === last) { this.onPathEnd?.(this); if (this.r() < 0.15) { this.state = 'idle'; this.stateT = 2 + this.r() * 4; } }
    }
    return (raining ? 1.3 : 1) * this.walkSpeed;
  }
  #circle(dt) {
    this.theta += (this.walkSpeed / this.radius) * dt;     // increasing angle = clockwise seen from above (+Z is south)
    const p = this.root.position, x = this.center.x + Math.cos(this.theta) * this.radius, z = this.center.z + Math.sin(this.theta) * this.radius;
    this.heading = Math.atan2(x - p.x, z - p.z) || this.heading;
    p.x = x; p.z = z;
    return this.walkSpeed;
  }

  #animate(dt, umbrella) {
    const target = { Walk: 0, Idle: 0, Wave: 0, Pet: 0, Shoo: 0, Sit: 0, Umbrella: 0 };
    if (this.mode === 'sit' && (this.state === 'move' || this.state === 'idle' || this.state === 'talk')) target.Sit = 1;
    else if (this.state === 'move') target[(this.mode === 'walk' || this.mode === 'circle') && this.visualSpeed>.06 ? 'Walk' : 'Idle'] = 1;
    else target[ANIM_OF[this.state] || 'Idle'] = 1;
    if (umbrella && target.Walk) target.Umbrella = 1;
    for (const k in this.act) { this.w[k] += ((target[k] || 0) - this.w[k]) * damp(6, dt); this.act[k].setEffectiveWeight(this.w[k]); }
    if (this.act.Walk) this.act.Walk.timeScale = Math.max(0.1, this.visualSpeed / 1.05);
    this.animationDebt=(this.animationDebt||0)+dt;
    if(this.root.visible&&this.animationDebt>=(this.animationInterval||0)){this.mixer.update(this.animationDebt);this.animationDebt=0;}
    else if(!this.root.visible)this.animationDebt=Math.min(this.animationDebt,.2);
  }
}
