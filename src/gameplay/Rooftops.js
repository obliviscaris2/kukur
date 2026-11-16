/** Streamed house doors, climb discoveries and searchable rooftop baskets, shared by every region of the map. */
import * as THREE from 'three';
import { STREET_LIFE } from '../config/index.js';
import { events } from '../core/events.js';

export class Rooftops {
  constructor({ world, pickups, fx, audio }) {
    Object.assign(this, { world, pickups, fx, audio });
    this.tiles = new Map();
    try {
      this.saved = JSON.parse(localStorage.getItem('kukur.rooftops.v1') || '{}');
    } catch {
      this.saved = {};
    }
    world.onTile((event, tile) => {
      if (event === 'load') this.tiles.set(tile.key, tile.data.houses || []);
      else this.tiles.delete(tile.key);
    });
  }
  save() {
    try {
      localStorage.setItem('kukur.rooftops.v1', JSON.stringify(this.saved));
    } catch {
      /* storage optional */
    }
  }
  all(pos, radius) {
    return [...this.tiles.values()]
      .flat()
      .filter((h) => !this.saved[h.id]?.cache && Math.hypot(h.cache.x - pos.x, h.cache.z - pos.z) < radius)
      .map((h) => ({ ...h.cache, id: STREET_LIFE.houses.loot[h.kind] }));
  }
  nearest(pos) {
    let best = null,
      distance = STREET_LIFE.houses.interactRadius;
    for (const houses of this.tiles.values())
      for (const h of houses)
        for (const kind of ['entry', 'cache']) {
          const point = h[kind],
            d = Math.hypot(point.x - pos.x, point.z - pos.z);
          if (d < distance && Math.abs(point.y - pos.y) < 0.55) {
            best = { house: h, kind };
            distance = d;
          }
        }
    return best;
  }
  prompt(pos) {
    const n = this.nearest(pos);
    return n ? (n.kind === 'cache' ? 'Search the rooftop basket' : 'Knock at the house · stairs lead to the roof') : '';
  }
  interact(pup) {
    const n = this.nearest(pup.pos);
    if (!n) return null;
    const h = n.house,
      state = (this.saved[h.id] ||= {});
    if (n.kind === 'entry') {
      this.audio.bell(3);
      pup.startPose('Sit', 0.8);
      if (!state.door) {
        state.door = true;
        this.pickups.drop('biscuit', new THREE.Vector3(h.entry.x, h.entry.y + 0.4, h.entry.z));
        this.save();
        return 'A voice from upstairs: “Ramro kukur! La, biscuit.” Follow the stairs inside.';
      }
      return 'The house is quiet. The open stairwell leads upstairs to a rooftop basket.';
    }
    if (state.cache) return 'You have already sniffed every corner of this basket.';
    state.cache = true;
    this.save();
    pup.startPose('SniffIdle', 1.0);
    const point = new THREE.Vector3(h.cache.x, h.cache.y + 0.35, h.cache.z),
      item = STREET_LIFE.houses.loot[h.kind];
    this.pickups.drop(item, point);
    this.fx.burst('sparkle', point, 12, { colors: ['#aee6b8', '#fff1c8'], up: 1, speed: 0.7 });
    events.emit('roofCache', { pos: point, house: h.id });
    return 'A rooftop treasure! Nose into the basket, then E to collect your find.';
  }
  scents(pos) {
    return [...this.tiles.values()]
      .flat()
      .filter((h) => !this.saved[h.id]?.cache && Math.hypot(h.entry.x - pos.x, h.entry.z - pos.z) < 40)
      .slice(0, 4)
      .map((h) => ({ p: new THREE.Vector3(h.entry.x, h.entry.y + 0.2, h.entry.z), c: new THREE.Color('#a3dcb9'), up: 0.4 }));
  }
  update(pup) {
    for (const houses of this.tiles.values())
      for (const h of houses) {
        if (
          !this.saved[h.id]?.visited &&
          Math.abs(pup.pos.y - h.deck) < 0.4 &&
          Math.hypot(pup.pos.x - h.cache.x, pup.pos.z - h.cache.z) < 2.5
        ) {
          const s = (this.saved[h.id] ||= {});
          s.visited = true;
          this.save();
          events.emit('roofVisit', { house: h.id, pos: pup.pos.clone() });
        }
      }
  }
}
