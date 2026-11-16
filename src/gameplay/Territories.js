/**
 * Dog territories. Some streets belong to a pack (an alpha + members in matching bandanas) or to a lone dog.
 *   - Scent markers on the territory edge glow while sniffing; smelling one (or being warned) DISCOVERS it.
 *   - Walk in uninvited: they growl a warning. Linger (or push towards the middle) and they chase and nip (hearts!).
 *   - Leave, and they trot home. Offer a bone (G) to any of them and the territory becomes FRIENDLY for good.
 * Territories are generated deterministically per tile; discovered/friendly state persists in localStorage.
 * Rules and odds: config/gameplay.js TERRITORY.
 */
import * as THREE from 'three';
import { TERRITORY, THREATS } from '../config/index.js';
import { rng, hash } from '../core/rng.js';
import { events } from '../core/events.js';
import { Stray } from '../entities/npc/Stray.js';

const KEY = 'kukur.territories.v1';

export class Territories {
  constructor(scene, world, npcs, hud, quality={npc:'low'}) {
    this.scene = scene; this.world = world; this.npcs = npcs; this.hud = hud;
    this.maxGuards=THREATS.guards.maxActive[quality.npc];
    this.list = new Map(); this.active = new Set();
    try { this.saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { this.saved = {}; }
    // one ring mesh per active territory (cheap line loop)
    this.ringGeo = new THREE.RingGeometry(0.985, 1, 96).rotateX(-Math.PI / 2);
    world.onTile((ev, tile) => { if (ev === 'load') this.#generate(tile); else this.#drop(tile.key); });
  }
  #save() { try { localStorage.setItem(KEY, JSON.stringify(this.saved)); } catch { /* ok */ } }

  #generate(tile) {
    this.#houseGuard(tile);
    const r = rng(hash(tile.tx, tile.tz, 313));
    if (r() > TERRITORY.chance || (tile.data.density ?? 0) < 0.12 || !tile.data.navs.length) return;
    const nav = tile.data.navs[Math.floor(r() * tile.data.navs.length)], k = Math.floor(r() * (nav.pts.length / 2)) * 2;
    const x = nav.pts[k], z = nav.pts[k + 1], rad = TERRITORY.radius[0] + r() * (TERRITORY.radius[1] - TERRITORY.radius[0]);
    const pack = r() < TERRITORY.packShare, id = tile.key;
    const where = this.world.gazetteer.describe(x, z).tole?.name || this.world.gazetteer.describe(x, z).title;
    const alphaName = TERRITORY.loneNames[Math.floor(r() * TERRITORY.loneNames.length)];
    const t = {
      id, tile: tile.key, x, z, y:this.world.terrain(x,z), r: pack ? rad : rad * 0.7, pack, color: pack ? TERRITORY.colors[Math.floor(r() * TERRITORY.colors.length)] : '#c9a27a',
      name: pack ? `${where} ${TERRITORY.names[Math.floor(r() * TERRITORY.names.length)]}` : `${alphaName}'s corner`, alphaName,
      size: pack ? TERRITORY.packSize[0] + Math.floor(r() * (TERRITORY.packSize[1] - TERRITORY.packSize[0] + 1)) : 1,
      seed: hash(tile.tx, tile.tz, 5), dogs: [], inside: 0, state: 'calm', ...(this.saved[id] || {}),
    };
    t.markers = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + r() * 0.3; return new THREE.Vector3(x + Math.cos(a) * t.r, 0, z + Math.sin(a) * t.r); });
    for (const m of t.markers) m.y = this.world.heightAt(m.x, m.z) + 0.2;
    this.list.set(id, t);
  }
  #houseGuard(tile){
    const r=rng(hash(tile.tx,tile.tz,931)),houses=tile.data.houses||[];
    if(!houses.length||r()>THREATS.guards.chance)return;
    const house=houses[Math.floor(r()*houses.length)],id=house.id+':guard',x=house.entry.x+Math.sin(house.heading)*.7,z=house.entry.z+Math.cos(house.heading)*.7;
    const t={id,tile:tile.key,x,z,y:house.entry.y,r:THREATS.guards.radius[0]+r()*(THREATS.guards.radius[1]-THREATS.guards.radius[0]),pack:false,guard:true,color:'#be8051',name:'Bhote’s doorway',alphaName:'Bhote',size:1,seed:hash(tile.tx,tile.tz,933),dogs:[],markers:[],inside:0,state:'calm',...(this.saved[id]||{})};
    this.list.set(id,t);
  }
  #drop(tileKey){for(const[id,t]of this.list)if(t.tile===tileKey){this.#despawn(t);this.active.delete(t);this.list.delete(id);}}

  async #spawn(t) {
    t.spawning = true;
    const r = rng(t.seed);
    for (let i = 0; i < t.size; i++) {
      const alpha = i === 0;
      const s = await Stray.create(r, { breed:t.guard?'bhote':undefined, scale: alpha ? (t.guard ? 1.45 : t.pack ? 1.45 : 1.35) : 1.1 + r() * .2, bandana: t.pack ? t.color : null });
      if(this.list.get(t.id)!==t){t.spawning=false;return;}
      const a = r() * 6.28, d = t.guard?0:r() * t.r * 0.4;
      s.root.position.set(t.x + Math.cos(a) * d, 0, t.z + Math.sin(a) * d); s.root.position.y = this.world.physics.groundAt(s.root.position.x,s.root.position.z,this.world.terrain(s.root.position.x,s.root.position.z)+.2);
      s.terr = t; s.alpha = alpha; s.owned = true; s.tstate = t.friendly ? 'friend' : 'guard'; s.greeted = true; s.name = alpha ? t.alphaName : null;
      this.scene.add(s.root); this.npcs.strays.push(s); t.dogs.push(s);
    }
    t.spawning = false;
  }
  #despawn(t) { for (const s of t.dogs) { this.scene.remove(s.root); const i = this.npcs.strays.indexOf(s); if (i >= 0) this.npcs.strays.splice(i, 1); } t.dogs = []; if (t.ring) { this.scene.remove(t.ring); t.ring = null; } }
  #discover(t, how) {
    if (t.discovered) return;
    t.discovered = true; this.saved[t.id] = { ...(this.saved[t.id] || {}), discovered: true }; this.#save();
    this.hud?.toast(how === 'smell' ? `👃 You smell ${t.pack ? `the ${t.name}` : t.name} — their territory!` : `⚠️ ${t.pack ? `The ${t.name}` : t.name}: you're on their turf!`, 3.2);
  }
  #setDogs(t, state) { for (const s of t.dogs) if (s.tstate !== state) { s.tstate = state; s.pose = null; s.stateT = 0; } }

  /** G pressed: offer an item to the nearest territory dog. Returns a message or null. */
  offer(pos, bag) {
    let best = null, bd = 3;
    for (const t of this.active) for (const s of t.dogs) { const d = s.root.position.distanceTo(pos); if (d < bd) { bd = d; best = s; } }
    if (!best) return null;
    const t = best.terr;
    if (t.friendly) { if (bag.remove('biscuit')) { best.pose = 'Wiggle'; best.poseT = 2; return `🍪 ${best.name || 'The dog'} gobbles the biscuit and wags!`; } return `${best.name || 'They'} already trust you 💛`; }
    const item = bag.count('bone') ? 'bone' : !t.pack && bag.count('biscuit') ? 'biscuit' : null;
    if (!item) return '🦴 You need a bone to win them over' + (t.pack ? '' : ' (a biscuit works for a lone dog)');
    bag.remove(item);
    t.friendly = true; t.discovered = true; this.saved[t.id] = { discovered: true, friendly: true }; this.#save();
    this.#setDogs(t, 'friend'); best.pose = 'Wiggle'; best.poseT = 2.5;
    events.emit('befriend', { t, pos: best.root.position.clone() });
    return t.pack ? `🦴 ${t.alphaName} accepts your ${item}. The ${t.name} welcome you!` : `🦴 ${t.alphaName} takes the ${item} and lets you stay 💛`;
  }
  /** Scent sources for the sniff view (markers in the pack colour). */
  scents(pos) {
    const out = [];
    for (const t of this.list.values()) if (Math.hypot(t.x - pos.x, t.z - pos.z) < t.r + 60) for (const m of t.markers) out.push({ p: m, c: new THREE.Color(t.color), up: 0.4 });
    return out;
  }
  /** Nearest territory dog within r (for the G prompt). */
  nearestDog(pos, r = 3) { let best = null, bd = r; for (const t of this.active) for (const s of t.dogs) { const d = s.root.position.distanceTo(pos); if (d < bd) { bd = d; best = s; } } return best; }

  update(dt, pup, sniff, time) {
    for (const t of this.list.values()) {
      const d = Math.hypot(pup.pos.x - t.x, pup.pos.z - t.z);
      // bring dogs in/out with distance
      if (d < t.r + 70 && !t.dogs.length && !t.spawning && (!t.guard||[...this.active].filter(t=>t.guard).length<this.maxGuards)) { this.#spawn(t); this.active.add(t); }
      else if (d > t.r + 110 && t.dogs.length) { this.#despawn(t); this.active.delete(t); continue; }
      if (!t.dogs.length) continue;
      // smelling a marker discovers the territory
      if (sniff > 0.5 && !t.discovered && t.markers.some((m) => Math.hypot(m.x - pup.pos.x, m.z - pup.pos.z) < 6)) this.#discover(t, 'smell');
      // ring on the ground: visible while sniffing, near the edge, or when hostile
      const showRing = (sniff > 0.3 || Math.abs(d - t.r) < 12 || t.state !== 'calm') && (t.discovered || t.state !== 'calm' || sniff > 0.3);
      if (showRing && !t.ring) {
        t.ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
        t.ring.scale.setScalar(t.r); t.ring.position.set(t.x, this.world.heightAt(t.x, t.z) + 0.08, t.z); t.ring.renderOrder = 3; this.scene.add(t.ring);
      }
      if (t.ring) {
        t.ring.visible = showRing;
        t.ring.material.color.set(t.friendly ? '#7cff9b' : t.state === 'chase' ? '#ff3b3b' : t.color);
        t.ring.material.opacity = (t.state === 'chase' ? 0.45 + 0.3 * Math.sin(time * 8) : 0.35) * (t.friendly ? 0.6 : 1);
      }
      if (t.friendly) continue;
      // trespassing rules
      const inside = d < t.r && Math.abs(pup.pos.y-(t.y??this.world.terrain(t.x,t.z)))<1.2 && !pup.swimming;
      if (inside) {
        t.inside += dt;
        if (t.state === 'calm') { t.state = 'warn'; this.#setDogs(t, 'warn'); this.#discover(t, 'warn'); }
        if (t.state === 'warn' && (t.inside > (t.guard?THREATS.guards.grace:TERRITORY.graceSeconds) || (t.inside>TERRITORY.minimumWarning&&d < t.r * 0.45))) { t.state = 'chase'; this.#setDogs(t, 'chase'); events.emit('chased', t); }
      } else if ((!inside&&(pup.swimming||Math.abs(pup.pos.y-(t.y??this.world.terrain(t.x,t.z)))>1.2)) || d > t.r * TERRITORY.chaseBeyond || (t.state === 'warn' && d > t.r)) {
        if (t.state !== 'calm') { t.state = 'calm'; t.inside = 0; this.#setDogs(t, 'return'); }
      }
    }
  }
}
