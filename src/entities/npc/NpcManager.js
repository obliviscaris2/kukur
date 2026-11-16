/**
 * Populates the streets around the pup and despawns what's far away. Counts come from config/npc.js
 * (scaled by quality, night, rain and how busy the street is). Roles are chosen from context:
 *   vendors on busy streets · devotees circling the nearest temple/stupa · elders on chautari steps ·
 *   chatting groups on the pavement · walkers, kids and porters on the street network.
 * Also owns the biscuits people toss (Treats), the stones cruel people throw (Stones) and pigeon flocks.
 */
import * as THREE from 'three';
import { NPC, BREAKABLES, MYTHIC } from '../../config/index.js';
import { loadGLB } from '../../core/assets.js';
import { rng, weighted, pick } from '../../core/rng.js';
import { events } from '../../core/events.js';
import { Person } from './Person.js';
import { Stray } from './Stray.js';
import { Pigeons } from './Pigeons.js';
import { Birds } from './Birds.js';
import { Cats } from './Cats.js';
import { WaterLife } from '../../world/effects/WaterLife.js';
import { Stones } from './Stones.js';
import { Treats } from '../items/Treats.js';
import { StreetActivities } from './StreetActivities.js';
import { fadeActor } from '../../render/actorFade.js';

const TEMPLE = /pagoda|stupa|kastha|maju|taleju|trailokya|nyatapola|shikhara/;

export class NpcManager {
  constructor(scene, world, quality, ui, audio) {
    this.scene = scene; this.world = world; this.ui = ui; this.audio = audio;
    this.maxPeople = NPC.people.max[quality.npc]; this.maxStrays = NPC.strays.max[quality.npc];
    this.people = []; this.strays = []; this.navs = []; this.groups = new Map(); this.r = rng(Date.now() & 0xffff); this.ids = 0;
    this.pigeons = new Pigeons(scene); this.treats = new Treats(scene); this.stones = new Stones(scene);
    this.birds = new Birds(scene, world, audio); this.cats = new Cats(scene, world, ui, audio);   // crows, sparrows, kites, nests · street cats
    this.water = new WaterLife(scene, world, ui, audio);   // fish, floating junk, ripples, rain frogs
    this._t = 0; this.spawning = false;this.view=new THREE.Frustum();this.viewMatrix=new THREE.Matrix4();this.bound=new THREE.Sphere();
    this.bodies = [];
    world.physics.bodies.push(() => this.bodies);
    this.street = new StreetActivities({ world, quality, people: () => this.people, navs: () => this.navs, say: (who, text) => this.ui.say(who, text), spawn: (role) => this.personGltf && this.people.length < this.maxPeople ? this.#add(new Person(this.personGltf, this.r, { role, mood: 'kind' })) : null });
    world.onTile((ev, tile) => {
      if (ev === 'load') {
        for (const n of tile.data.navs) { n.tile = tile.key; this.navs.push(n); }
        for (const l of tile.data.landmarks) if (TEMPLE.test(l[4]) && this.r() < 0.9)
          this.pigeons.addFlock(tile.key + l[0], l[0] + l[2] * 0.9, l[1], 14 + Math.floor(this.r() * 18), (x, z) => world.heightAt(x, z));
      } else { this.navs = this.navs.filter((n) => n.tile !== tile.key); this.#dropTile(tile.key); }
    });
    events.on('smash', ({ pos }) => {    // people nearby get cross (a short chase, nothing serious)
      if (!this.ctx) return;
      for (const p of this.people) if (p.pos.distanceTo(pos) < BREAKABLES.angryRadius) p.startle(this.ctx);
    });
    events.on('howl', () => {   // night chorus: nearby strays answer the pup's howl
      if (!this.ctx) return;
      this.strays.filter((s) => s.pos.distanceTo(this.ctx.pup.pos) < 60).forEach((s, i) => setTimeout(() => s.howl(this.ctx), 600 + i * 450 + Math.random() * 500));
    });
    events.on('bark', (pos) => {
      if (this.pigeons.scare(pos, 10)) this.audio.flutter();
      if (!this.ctx) return;
      for (const s of this.strays) s.onBark(this.ctx);
      for (const p of this.people) p.onBark(this.ctx, p.pos.distanceTo(pos));
    });
  }
  async init() { this.personGltf = await loadGLB(NPC.personModel); }
  #dropTile(key) { for (const k of [...this.pigeons.flocks.keys()]) if (k.startsWith(key)) this.pigeons.removeFlock(k); }

  /** A random street polyline near a point (used for spawning and stray wandering). */
  randomNav(near, radius, filter) {
    const cands = [];
    for (const n of this.navs) { const P = n.pts, i = Math.floor(P.length / 4) * 2; if (Math.hypot(P[i] - near.x, P[i + 1] - near.z) < radius && (!filter || filter(n))) cands.push(n); }
    return cands.length ? cands[Math.floor(this.r() * cands.length)] : null;
  }
  /** Nearest interesting thing for the pup to look at. */
  nearest(pos, radius) {
    let best = null, bd = radius;
    for (const e of [...this.people, ...this.strays]) { const d = e.pos.distanceTo(pos); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  #nearTemple(pos, radius = 70) {
    let best = null, bd = radius;
    for (const l of this.world.landmarks.all()) {
      if (!TEMPLE.test(l.model || '')) continue;
      const d = Math.hypot(l.x - pos.x, l.z - pos.z) - l.size / 2;
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }
  #pickRole(pup, density) {
    const temple = this.#nearTemple(pup.pos);
    const role = weighted(this.r, Object.entries(NPC.roles).map(([name, R]) => {
      let weight = R.weight;
      if (R.nearTemple) weight = temple ? R.nearTemple : 0;
      if (R.minDensity && density < R.minDensity) weight = 0;
      return { name, weight };
    })).name;
    return { role, temple };
  }
  /** A spot on the pavement beside a street: [x, z, headingTowardsStreet]. */
  #kerbSpot(pup, minW = 3.5) {
    const [r0, r1] = NPC.people.spawnRadius;
    for (let tries = 0; tries < 6; tries++) {
      const n = this.randomNav(pup.pos, r1, (nv) => nv.w >= minW && nv.pts.length >= 4 && nv.kind !== 'motorway');
      if (!n) return null;
      const i = Math.floor(this.r() * (n.pts.length / 2 - 1)), P = n.pts;
      const ax = P[i * 2], az = P[i * 2 + 1], bx = P[i * 2 + 2], bz = P[i * 2 + 3], L = Math.hypot(bx - ax, bz - az) || 1;
      const t = this.r(), side = this.r() < 0.5 ? -1 : 1, nx = (-(bz - az) / L) * side, nz = ((bx - ax) / L) * side, off = n.w / 2 + 0.9;
      const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
      const d = Math.hypot(x - pup.pos.x, z - pup.pos.z);
      if (d < r0 * 0.6 || d > r1 || !this.world.physics.isFree(x, z, 0.5)) continue;
      return [x, z, Math.atan2(-nx, -nz)];
    }
    return null;
  }
  #chautari(pup) {
    for (const t of this.world.streamer.ready()) for (const [name, x, z] of t.data.names) {
      if (name !== 'Chautari' || Math.hypot(x - pup.pos.x, z - pup.pos.z) > NPC.people.spawnRadius[1]) continue;
      const a = Math.floor(this.r() * 4) * (Math.PI / 2), sx = x + Math.sin(a) * 2.75, sz = z + Math.cos(a) * 2.75;
      if (!this.people.some((p) => p.mode === 'sit' && Math.hypot(p.pos.x - sx, p.pos.z - sz) < 1)) return [sx, sz, a];
    }
    return null;
  }
  #add(p) { p.id = ++this.ids; p.pos.y = p.mode==='sit'?this.world.heightAt(p.pos.x,p.pos.z):this.world.physics.groundAt(p.pos.x,p.pos.z,this.world.terrain(p.pos.x,p.pos.z)+.2); this.scene.add(p.root); this.people.push(p); return p; }

  async #spawnPerson(pup, density) {
    const { role, temple } = this.#pickRole(pup, density);
    if (role === 'devotee' && temple) {
      const p = new Person(this.personGltf, this.r, { role, nearStupa: /stupa/.test(temple.model) });
      p.circle(temple.x, temple.z, Math.max(4, temple.size * 0.62 + 1.3) + this.r() * 1.5, this.r() * Math.PI * 2);
      return this.#add(p);
    }
    if (role === 'elder' && this.r() < 0.6) {
      const c = this.#chautari(pup);
      if (c) { const p = new Person(this.personGltf, this.r, { role }); p.sitAt(c[0], c[1], c[2]); return this.#add(p); }
    }
    if (role === 'vendor') {
      const s = this.#kerbSpot(pup, 4);
      if (s) { const p = new Person(this.personGltf, this.r, { role }); p.standAt(s[0], s[1], s[2]); return this.#add(p); }
      return null;
    }
    if (role === 'chatter') {
      const s = this.#kerbSpot(pup, 3);
      if (!s) return null;
      const n = NPC.roles.chatter.group[0] + Math.floor(this.r() * (NPC.roles.chatter.group[1] - NPC.roles.chatter.group[0] + 1)), gid = 'g' + this.ids;
      const members = [];
      for (let i = 0; i < n; i++) {
        const a = s[2] + (i / n) * Math.PI * 2, x = s[0] + Math.sin(a) * 0.75, z = s[1] + Math.cos(a) * 0.75;
        const p = new Person(this.personGltf, this.r, { role: 'chatter' }); p.standAt(x, z, a + Math.PI); p.group = gid; members.push(this.#add(p));
      }
      this.groups.set(gid, { members, t: 1 + this.r() * 3 });
      return members[0];
    }
    const [r0, r1] = NPC.people.spawnRadius;
    for (let tries = 0; tries < 8; tries++) {
      const nav = this.randomNav(pup.pos, r1);
      if (!nav || nav.pts.length < 4 || nav.kind === 'motorway' || nav.kind === 'trunk') continue;
      const nseg = nav.pts.length / 2 - 1, seg = Math.floor(this.r() * nseg), dir = this.r() < 0.5 ? 1 : -1;
      const p = new Person(this.personGltf, this.r, { role: role === 'devotee' || role === 'vendor' || role === 'chatter' ? 'walker' : role });
      p.placeOn(nav, dir > 0 ? seg : seg + 1, this.r(), dir);
      p.pos.y = this.world.physics.groundAt(p.pos.x,p.pos.z,this.world.terrain(p.pos.x,p.pos.z)+.2);
      const d = p.pos.distanceTo(pup.pos);
      if (d < r0 || d > r1 || !this.world.physics.isFree(p.pos.x,p.pos.z,NPC.people.radius) || this.people.some(o=>Math.hypot(o.pos.x-p.pos.x,o.pos.z-p.pos.z)<1)) continue;
      p.onPathEnd = (who) => this.#continuePath(who);
      return this.#add(p);
    }
    return null;
  }
  #continuePath(p) {
    const P = p.nav.pts, end = p.dir > 0 ? P.length - 2 : 0, ex = P[end], ez = P[end + 1];
    let best = null, bd = 4;
    for (const n of this.navs) {
      if (n === p.nav) continue;
      for (const [i, d] of [[0, 1], [n.pts.length - 2, -1]]) { const dd = Math.hypot(n.pts[i] - ex, n.pts[i + 1] - ez); if (dd < bd && this.r() < 0.8) { bd = dd; best = [n, i / 2, d]; } }
    }
    if (best) { p.nav = best[0]; p.seg = best[1]; p.dir = best[2]; }
    else { p.dir = -p.dir; p.side = -p.side; }
  }
  async #spawnStray(pup) {
    const nav = this.randomNav(pup.pos, NPC.strays.spawnRadius[1]);
    if (!nav) return;
    const i = Math.floor(this.r() * (nav.pts.length / 2)), x = nav.pts[i * 2] + (this.r() - 0.5) * 3, z = nav.pts[i * 2 + 1] + (this.r() - 0.5) * 3;
    if (Math.hypot(x - pup.pos.x, z - pup.pos.z) < NPC.strays.spawnRadius[0] || !this.world.physics.isFree(x, z, 0.4)) return;
    // sometimes a little pack: a leader and one or two followers
    const n = this.strays.length + 2 <= this.maxStrays && this.r() < 0.4 ? 2 + (this.r() < 0.4 ? 1 : 0) : 1;
    let leader = null;
    for (let k = 0; k < n; k++) {
      const s = await Stray.create(this.r);
      s.root.position.set(x + (k ? (this.r() - 0.5) * 3 : 0), this.world.physics.groundAt(x,z,this.world.terrain(x,z)+.2), z + (k ? (this.r() - 0.5) * 3 : 0));
      if (leader) { s.leader = leader; s.state = leader.state; s.pose = leader.pose; s.offset = [(this.r() - 0.5) * 3, -1.2 - this.r() * 1.5]; } else leader = s;
      this.scene.add(s.root); this.strays.push(s);
    }
  }

  update(dt, pup, env) {
    const raining = env.rain > 0.3, nightK = 1 - env.night * 0.7, heightAt = (x, z) => this.world.heightAt(x, z);
    this.ctx = { dt, world: this.world, pup, raining, events, audio: this.audio, treats: this.treats, stones: this.stones, say: (who, text) => this.ui.say(who, text), randomNav: (p, r) => this.randomNav(p, r), cats: this.cats, calm: !!env.calm };
    this._lodT = (this._lodT || 0) - dt;
    const doLod = this._lodT <= 0; if (doLod) this._lodT = 0.25;
    if(env.camera){env.camera.updateMatrixWorld();this.view.setFromProjectionMatrix(this.viewMatrix.multiplyMatrices(env.camera.projectionMatrix,env.camera.matrixWorldInverse));}
    const visible=actor=>{
      const distance=actor.pos.distanceTo(pup.pos);this.bound.center.copy(actor.pos);this.bound.center.y+=.9;this.bound.radius=2.2;
      const always=actor.scripted||env.calm||!env.camera;
      actor.root.visible=always||distance<NPC.lod.hide&&(distance<12||this.view.intersectsSphere(this.bound));
      // Invisible distant rigs still have live collision positions; avoid rebuilding all their bone matrices.
      actor.root.matrixWorldAutoUpdate=always||actor.root.visible||distance<MYTHIC.performance.npcFullRate;
      actor.animationInterval=always||distance<MYTHIC.performance.npcFullRate?0:1/(distance<MYTHIC.performance.npcMidRate?MYTHIC.performance.npcMidHz:MYTHIC.performance.npcFarHz);
    };
    for (const p of this.people) { if (doLod) p.lod(p.pos.distanceTo(pup.pos)); visible(p); p.update(this.ctx); fadeActor(p, env.camera, dt, env.actorFade !== false); }
    for (const s of this.strays) { if (doLod) s.lod(s.pos.distanceTo(pup.pos)); visible(s); s.update(this.ctx); fadeActor(s, env.camera, dt, env.actorFade !== false); }
    this.street.update(dt, pup);
    // Solid, live positions prevent invisible colliders and keep people and carts out of each other.
    this.bodies.length = 0;
    for (const p of this.people) {
      p.collider ??= { owner: p, get x(){return p.pos.x;},get y(){return p.pos.y;},get z(){return p.pos.z;},radius:NPC.people.radius*p.model.scale.x,height:NPC.people.height*p.model.scale.y };
      p.collider.disabled = !p.root.parent; this.bodies.push(p.collider);
      if (p.cart) {
        p.cartBody ??= { owner:p,halfWidth:.65,halfLength:.36,height:.82,blocksTraffic:true };
        Object.assign(p.cartBody,{x:p.pos.x+Math.cos(p.heading)*.95+Math.sin(p.heading)*.35,z:p.pos.z-Math.sin(p.heading)*.95+Math.cos(p.heading)*.35,y:p.pos.y,heading:p.heading,disabled:!p.root.parent});this.bodies.push(p.cartBody);
      }
    }
    for(const dog of this.strays){
      dog.collider??={owner:dog,get x(){return dog.pos.x;},get y(){return dog.pos.y;},get z(){return dog.pos.z;},get disabled(){return !dog.root.parent;},radius:.14*dog.scale,height:.38*dog.scale};
      this.bodies.push(dog.collider);
    }
    for(let i=0;i<this.people.length;i++)for(let j=i+1;j<this.people.length;j++) {
      const a=this.people[i],b=this.people[j]; if(a.scripted||b.scripted||a.anchor||b.anchor||Math.abs(a.pos.y-b.pos.y)>.4)continue;
      const dx=b.pos.x-a.pos.x,dz=b.pos.z-a.pos.z,d=Math.hypot(dx,dz),min=NPC.people.radius*(a.model.scale.x+b.model.scale.x)+.08;
      if(d<min&&d>.001){const push=Math.min(.04,(min-d)*.5);a.pos.x-=dx/d*push;a.pos.z-=dz/d*push;b.pos.x+=dx/d*push;b.pos.z+=dz/d*push;}
    }
    // chatting groups take turns talking
    for (const g of this.groups.values()) {
      if ((g.t -= dt) > 0) continue;
      g.t = 2.5 + this.r() * 3;
      const who = pick(this.r, g.members);
      if (who.state === 'move' && who.pos.distanceTo(pup.pos) < 30) { this.ui.say(who, pick(this.r, NPC.lines.chat)); who.state = 'call'; who.stateT = 1.2; }
    }
    this.treats.update(dt, pup, this.strays, heightAt);
    this.stones.update(dt, pup, heightAt, this.world.physics);
    this.pigeons.update(dt,pup.pos);
    this.birds.update(dt, pup); this.cats.update(dt, pup, this.strays, env.camera);
    this.water.update(dt, pup, env.rain);
    if (pup.speed > 3.5 && this.pigeons.scare(pup.pos, 3)) this.audio.flutter();
    // spawn / despawn a few times per second
    this._t -= dt;
    if (this._t > 0 || this.spawning) return;
    this._t = 0.35;
    const far = NPC.people.despawnRadius;
    this.people = this.people.filter((p) => {
      const gone = !Number.isFinite(p.pos.x+p.pos.y+p.pos.z+p.heading) || !p.scripted && (p.pos.distanceTo(pup.pos) > far || p.anchor && !this.street.hasTile(p.anchor.tile) || p.mode === 'walk' && !this.navs.includes(p.nav));
      if (gone) this.#remove(p);
      return !gone;
    });
    for (const [id, g] of this.groups) if (!g.members.some((m) => this.people.includes(m))) this.groups.delete(id);
    this.strays = this.strays.filter((s) => { if (!s.owned && s.pos.distanceTo(pup.pos) > NPC.strays.despawnRadius) { this.scene.remove(s.root); return false; } return true; });
    for (const s of this.strays) if (s.leader && !this.strays.includes(s.leader)) s.leader = null;
    const density = env.density ?? 0.5;
    const wantPeople = Math.round(this.maxPeople * nightK * (raining ? 0.6 : 1) * Math.min(1, 0.4 + density));
    const walkers = wantPeople - Math.max(0, this.street.maxPolice - this.people.filter(p => p.role === 'police').length);
    this.spawning = true;
    const jobs = [];
    if (this.people.length < walkers && this.personGltf) jobs.push(this.#spawnPerson(pup, density));
    if (this.people.length < walkers * 0.7 && this.personGltf) jobs.push(this.#spawnPerson(pup, density));   // fill busy streets quickly
    if (this.strays.filter((s) => !s.owned).length < this.maxStrays) jobs.push(this.#spawnStray(pup));
    Promise.all(jobs).finally(() => { this.spawning = false; });
  }
  #remove(p) { if(p.collider)p.collider.disabled=true;if(p.cartBody)p.cartBody.disabled=true;this.scene.remove(p.root); this.world.physics.removeOwner('npc' + p.id); }
  clear() {
    for (const p of this.people) if(!p.scripted)this.#remove(p);
    for (const s of this.strays) if (!s.owned) this.scene.remove(s.root);
    this.people = this.people.filter(p=>p.scripted); this.strays = this.strays.filter((s) => s.owned); this.groups.clear(); this.bodies.length=0;
  }
}
