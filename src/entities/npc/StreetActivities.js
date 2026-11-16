/** Anchored shopkeepers and traffic police, safe crossing requests, and short schoolkid chase games. */
import * as THREE from 'three';
import { STREET_LIFE, NPC } from '../../config/index.js';
import { events } from '../../core/events.js';

export class StreetActivities {
  constructor({ world, quality, people, navs, spawn, say }) {
    Object.assign(this, { world, people, navs, spawn, say });
    this.maxPolice = STREET_LIFE.police.max[quality.npc]; this.maxShops = STREET_LIFE.shopkeepers.max[quality.npc];
    this.tiles = new Map(); this.time = 0; this.tick = 0;
    this.junctions = [];
    events.on('trafficJunctions', ({junctions}) => { this.junctions = junctions; });
    world.onTile((event, tile) => { if (event === 'load') this.tiles.set(tile.key, { shops: tile.data.shops || [], signs: tile.data.signs || [] }); else this.tiles.delete(tile.key); });
  }
  #occupied(id) { return this.people().some((p) => p.anchor?.id === id); }
  #keeper(pup) {
    if (this.people().filter((p) => p.role === 'shopkeeper').length >= this.maxShops) return;
    const candidates = [];
    for (const [tile, data] of this.tiles) for (const shop of data.shops) {
      const distance = Math.hypot(shop.x - pup.pos.x, shop.z - pup.pos.z);
      if (distance > 14 && distance < NPC.people.spawnRadius[1] && !this.#occupied(shop.id)) candidates.push({ ...shop, tile, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const anchor = candidates[0]; if (!anchor) return;
    const p = this.spawn('shopkeeper'); if (!p) return;
    p.anchor = anchor; p.shop = anchor; p.mood = 'kind'; p.standAt(anchor.x, anchor.z, anchor.heading); p.pos.y = anchor.y; p.cool = 1e9;
  }
  #police(pup) {
    const cfg = STREET_LIFE.police, people = this.people();
    if (people.filter(p => p.role === 'police').length >= this.maxPolice) return;
    const candidates = [];
    const locations = this.junctions.length ? this.junctions.map(j => [j.tile, { signs: [[j.x, j.z, j.arms]] }]) : this.tiles;
    for (const [tile, data] of locations) for (const [x, z, arms] of data.signs) {
      const id = `${tile}:police:${Math.round(x)},${Math.round(z)}`, distance = Math.hypot(x - pup.pos.x, z - pup.pos.z);
      if (arms.length < 3 || distance < cfg.spawnRadius[0] || distance > cfg.spawnRadius[1] || this.#occupied(id)) continue;
      if (people.some(p => p.signal && Math.hypot(p.signal.x - x, p.signal.z - z) < cfg.spacing)) continue;
      candidates.push({ x, z, arms, id, tile, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const junction of candidates) for (const [angle, , armWidth] of junction.arms) {
      const { x, z } = junction, fx = Math.sin(angle), fz = Math.cos(angle);
      const width = armWidth ?? this.navs().find(n => n.w >= 5.5 && n.pts.some((v, k) => k % 2 === 0 && Math.hypot(v - x, n.pts[k + 1] - z) < 5))?.w;
      if (!width || width < 5.5) continue;
      for (const approach of cfg.approaches) for (const side of [1, -1]) {
        const offset = (width / 2 - cfg.kerbInset) * side;
        const px = x + fx * approach + fz * offset, pz = z + fz * approach - fx * offset;
        const pos = { x: px, y: this.world.heightAt(px, pz), z: pz };
        if (this.world.physics.collide(pos, NPC.people.radius, NPC.people.height) || !this.world.physics.isFree(px, pz, NPC.people.radius)) continue;
        const p = this.spawn('police'); if (!p) return;
        p.anchor = { id: junction.id, tile: junction.tile };
        p.signal = { x, z, radius: cfg.radius, axis: 'ns', hold: false };
        p.mood = 'kind'; p.cool = 1e9;
        p.standAt(px, pz, angle + Math.PI * 0.5); p.pos.y = this.world.heightAt(px, pz); return;
      }
    }
  }

  update(dt, pup) {
    this.time += dt;
    for (const p of this.people()) {
      if (p.signal) {
        const axis = Math.floor((this.time + p.id * 0.7) / STREET_LIFE.police.phase) % 2 ? 'ns' : 'ew';
        if (axis !== p.signal.axis) { p.state = 'wave'; p.stateT = 1.5; }
        p.signal.axis = axis; p.signal.hold = (p.holdUntil || 0) > this.time;
      }
      if (p.playSession) {
        const game = p.playSession; game.age += dt;
        const tagged = game.age > STREET_LIFE.chase.warmup && Math.hypot(p.pos.x - pup.pos.x, p.pos.z - pup.pos.z) < STREET_LIFE.chase.tagDistance;
        if (tagged || game.age > STREET_LIFE.chase.seconds) {
          p.walkSpeed = game.speed; p.playSession = null; p.state = 'wave'; p.stateT = 2; p.cool = 12; p.playCooldown = this.time + 30;
          this.say(p, tagged ? 'Samatyau! Hehe, ramro kukur!' : 'Arko pali! Catch me next time!');
          if (tagged) { events.emit('playChase', p); events.emit('streetTreat', { pos: p.pos.clone() }); pup.setMood('excited', 4); }
        }
      }
    }
    if ((this.tick -= dt) > 0) return;
    this.tick = 0.55; this.#police(pup); this.#keeper(pup);
  }
  signals() { return this.people().filter((p) => p.signal).map((p) => p.signal); }
  nearest(pos) {
    let nearest = null, distance = STREET_LIFE.shopkeepers.interactRadius;
    for (const p of this.people()) if (['shopkeeper', 'police', 'kid'].includes(p.role) && !p.playSession) {
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < distance && Math.abs(p.pos.y - pos.y) < 1) { nearest = p; distance = d; }
    }
    return nearest;
  }
  prompt(pos) {
    const p = this.nearest(pos); if (!p) return '';
    return p.role === 'police' ? 'Ask traffic dai for a crossing' : p.role === 'kid' ? 'Play chase with the schoolkid' : 'Greet the shopkeeper';
  }
  interact(pup) {
    const p = this.nearest(pup.pos); if (!p) return null;
    if (p.role === 'police') {
      p.holdUntil = this.time + STREET_LIFE.police.crossing; p.signal.hold = true; p.state = 'wave'; p.stateT = 2;
      this.say(p, 'La, bato kaata. Traffic rokeko chu!'); events.emit('safeCrossing', { pos: p.pos.clone() });
      return '🚦 Traffic dai holds the traffic. Across you go, little pup!';
    }
    if (p.role === 'kid') {
      if (p.playCooldown > this.time || p.mode !== 'walk' || !p.nav) return 'The schoolkid waves. Catch your breath, then play again!';
      p.playSession = { age: 0, speed: p.walkSpeed }; p.walkSpeed = STREET_LIFE.chase.runSpeed; p.state = 'move'; p.cool = 1e9;
      this.say(p, 'Malai samata! Catch me!'); pup.setMood('excited', 4); return '🐾 Chase the schoolkid and get close to tag them!';
    }
    p.state = 'wave'; p.stateT = 1.5;
    this.say(p, NPC.lines.shopkeeper[Math.floor(Math.random() * NPC.lines.shopkeeper.length)]);
    if ((p.giftUntil || 0) <= this.time) {
      p.giftUntil = this.time + STREET_LIFE.shopkeepers.giftCooldown;
      events.emit('streetTreat', { pos: new THREE.Vector3(p.shop.entryX, p.shop.y, p.shop.entryZ) });
      return '🍪 The shopkeeper leans over the counter with a biscuit for you.';
    }
    return 'The shopkeeper smiles. Bring a coin and offer it with G for a snack.';
  }
  hasTile(key) { return this.tiles.has(key); }
}
