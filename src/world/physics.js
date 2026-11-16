/**
 * 2.5D collision world. Everything is registered per owner (a map tile or a landmark) so it can be
 * removed when that tile streams out.
 *   solids    footprint prisms (houses, temple sanctums)  -> walls you bump into
 *   platforms walkable tops (temple steps, chautari)       -> heightAt()
 *   circles   trunks, poles, scooters
 * Ground height also includes the terrain hills.
 */
import { boxCorners, polygonsOverlap, boxOverlap, circleBoxOverlap } from '../core/collision.js';
import { prismFrac, circlePrismFrac } from '../core/sweep.js';

const CELL = 8;
const key = (ix, iz) => ix * 100003 + iz;
const EMPTY = [];

export class Physics {
  constructor(terrainHeight = () => 0) {
    this.dynamic = [];   // (x, z) => height | null — moving things you can stand on (vehicle roofs, crates)
    this.bodies = [];    // providers of nearby moving boxes/circles (street clutter and traffic)
    this.terrain = terrainHeight;
    this.polys = new Map(); this.plats = new Map(); this.circles = new Map(); this.occluders = new Map();
    this.owned = new Map();
    this.bodyCells = null;
  }

  /** Rebuild moving-body broad phase at simulation boundaries. Padding covers motion within the current actor batch. */
  refreshBodies(padding = 1.2) {
    const cells = this.bodyCells ??= new Map(); cells.clear();
    for(const provider of this.bodies) for(const body of provider()) {
      if(body.disabled)continue;
      const reach=(body.radius ?? Math.hypot(body.halfWidth,body.halfLength))+padding;
      if(!Number.isFinite(body.x+body.y+body.z+reach+body.height+(body.radius?0:body.heading)))continue;
      for(let x=Math.floor((body.x-reach)/CELL);x<=Math.floor((body.x+reach)/CELL);x++)
        for(let z=Math.floor((body.z-reach)/CELL);z<=Math.floor((body.z+reach)/CELL);z++) {
          const k=key(x,z);let list=cells.get(k);if(!list)cells.set(k,list=[]);list.push(body);
        }
    }
  }

  *nearBodies(x,z,radius=0) {
    if(!this.bodyCells){for(const provider of this.bodies)yield* provider();return;}
    const seen=new Set();
    for(let ix=Math.floor((x-radius)/CELL);ix<=Math.floor((x+radius)/CELL);ix++)
      for(let iz=Math.floor((z-radius)/CELL);iz<=Math.floor((z+radius)/CELL);iz++)
        for(const body of this.bodyCells.get(key(ix,iz))||EMPTY)if(!seen.has(body)){seen.add(body);yield body;}
  }
  #put(map, owner, o, x0, z0, x1, z1) {
    const touched = this.owned.get(owner) ?? this.owned.set(owner, []).get(owner);
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const k = key(ix, iz); let a = map.get(k); if (!a) map.set(k, (a = []));
        a.push(o); touched.push(map, k);
      }
  }
  #near(map, x, z) { return map.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY; }

  /** roof: the standable top (a flat roof's deck sits below its parapet); defaults to h */
  addSolid(owner, pts, h, base = -10, roof = h) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    const poly = { owner, pts, h, base, roof, x0, z0, x1, z1 };
    this.#put(this.polys, owner, poly, x0, z0, x1, z1);
  }
  addBox(owner, cx, cz, hw, hd, ang, h, base = -10) { this.addSolid(owner, rect(cx, cz, hw, hd, ang), h, base); }
  addCircle(owner, x, z, r, h = 50, base = this.terrain(x, z)) { this.#put(this.circles, owner, { owner, x, z, r, h, base }, x - r, z - r, x + r, z + r); }
  addPlatform(owner, pts, h, base = -Infinity) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    this.#put(this.plats, owner, { owner, pts, h, base, x0, z0, x1, z1 }, x0, z0, x1, z1);
  }
  addPlatformBox(owner, cx, cz, hw, hd, ang, h, base = -Infinity) { this.addPlatform(owner, rect(cx, cz, hw, hd, ang), h, base); }
  /** Roof silhouettes block cameras and overhead jumps without turning an open pavilion into a solid house. */
  addOccluder(owner, pts, h, base) {
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    this.#put(this.occluders, owner, { owner, pts, h, base }, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
  }

  removeOwner(owner) {
    const touched = this.owned.get(owner);
    if (!touched) return;
    for (let i = 0; i < touched.length; i += 2) {
      const map = touched[i], k = touched[i + 1], a = map.get(k);
      if (a) { const f = a.filter((o) => o.owner !== owner); if (f.length) map.set(k, f); else map.delete(k); }
    }
    this.owned.delete(owner);
  }

  heightAt(x, z) {
    let h = this.terrain(x, z);
    for (const p of this.#near(this.plats, x, z)) if (p.h > h && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && inside(x, z, p.pts)) h = p.h;
    return h;
  }

  /** Read-only footprint test for a vehicle; checks its whole rectangle without pushing it off its route. */
  isBoxFree(box, step = 0.22) {
    const points = boxCorners(box), radius = Math.hypot(box.halfWidth, box.halfLength), seen = new Set();
    for (let ix = Math.floor((box.x - radius) / CELL); ix <= Math.floor((box.x + radius) / CELL); ix++) for (let iz = Math.floor((box.z - radius) / CELL); iz <= Math.floor((box.z + radius) / CELL); iz++) {
      const k = key(ix, iz);
      for (const map of [this.polys, this.plats]) for (const p of map.get(k) || EMPTY) {
        if (seen.has(p)) continue; seen.add(p);
        if (box.y >= (p.roof ?? p.h) - 0.025 || box.y + box.height < (p.base ?? -Infinity) || (map === this.plats && p.h - box.y <= step)) continue;
        if (polygonsOverlap(points, p.pts)) return false;
      }
      for (const c of this.circles.get(k) || EMPTY) {
        if (seen.has(c)) continue; seen.add(c);
        if (box.y >= c.h || box.y + box.height < c.base) continue;
        if (circleBoxOverlap(box, c)) return false;
      }
    }
    for (const body of this.nearBodies(box.x,box.z,radius)) {
      if (!body.blocksTraffic || body.disabled || box.y >= body.y + body.height || box.y + box.height <= body.y) continue;
      if (body.radius ? circleBoxOverlap(box, body) : boxOverlap(box, body)) return false;
    }
    return true;
  }

  /** Sweep in steps smaller than the body radius, so a dash cannot tunnel through a thin wall. */
  move(pos, dx, dz, r, { height = 0.4, step = 0.18, heading = 0, halfLength = 0, ignore = null } = {}) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
    const sample = { x: 0, y: 0, z: 0 }, fx = Math.sin(heading) * halfLength, fz = Math.cos(heading) * halfLength;
    let hit = false;
    for (let i = 0; i < n; i++) {
      const x = pos.x, z = pos.z, nx = x + dx / n, nz = z + dz / n;
      const limit = Math.max(pos.y, this.terrain(x, z)) + step + 0.01;
      if (this.terrain(nx, nz) <= limit) { pos.x = nx; pos.z = nz; }
      else if (this.terrain(nx, z) <= limit) pos.x = nx;
      else if (this.terrain(x, nz) <= limit) pos.z = nz;
      else hit = true;
      hit = this.collide(pos, r, height, step, ignore) || hit;
      // Recheck the centre and both ends as one body: resolving the nose must not put the flank back in a wall.
      if (halfLength) for (let pass = 0; pass < 3; pass++) {
        let adjusted = false;
        for (const sign of [-1, 0, 1]) {
        const sx = pos.x + fx * sign, sz = pos.z + fz * sign;
        sample.x = sx; sample.y = pos.y; sample.z = sz;
        if (this.collide(sample, r, height, step, ignore)) { pos.x += sample.x - sx; pos.z += sample.z - sz; hit = adjusted = true; }
        }
        if (!adjusted) break;
      }
    }
    return hit;
  }

  /** Resolve a body's sides, including objects it starts inside and low obstacles at chest height. */
  collide(pos, r, height = 0, step = 0, ignore = null) {
    let hit = false;
    const seen = new Set();
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      seen.clear();
      for (const dx of [-r, r]) for (const dz of [-r, r]) {
        for (const map of [this.polys, this.plats]) for (const p of this.#near(map, pos.x + dx, pos.z + dz)) {
          if (seen.has(p)) continue;
          seen.add(p);
          const roof = p.roof ?? p.h, parapet = map === this.polys && p.h > roof + 0.025 && pos.y >= roof - 0.025;
          const top = parapet ? p.h : roof;
          if (pos.y >= top - 0.025 || pos.y + height < (p.base ?? -Infinity) || (map === this.plats && top - pos.y <= step + 0.01)) continue;
          if (pos.x + r < p.x0 || pos.x - r > p.x1 || pos.z + r < p.z0 || pos.z - r > p.z1) continue;
          if (pushPolygon(pos, r, p.pts, parapet)) hit = moved = true;
        }
        for (const c of this.#near(this.circles, pos.x + dx, pos.z + dz)) {
          if (seen.has(c)) continue;
          seen.add(c);
          if (pos.y >= c.h - 0.025 || pos.y + height < c.base) continue;
          if (pushCircle(pos, r, c.x, c.z, c.r)) hit = moved = true;
        }
      }
      if (height > 0) for (const b of this.nearBodies(pos.x,pos.z,r)) {
        if (!Number.isFinite(b.x + b.y + b.z + b.height + (b.radius ?? b.halfWidth) + (b.radius ?? b.halfLength) + (b.radius ? 0 : b.heading))) continue;
        if (b.disabled || (ignore && b.owner === ignore) || Math.abs(pos.x - b.x) > (b.halfLength ?? b.radius) + r + (b.halfWidth ?? 0) || Math.abs(pos.z - b.z) > (b.halfLength ?? b.radius) + r + (b.halfWidth ?? 0)) continue;
        let top = b.y + b.height;
        if (b.surface) top = b.surface(pos.x, pos.z) ?? top;
        else if (b.pitch || b.roll) {
          const ox = pos.x - b.x, oz = pos.z - b.z, sn = Math.sin(b.heading), cs = Math.cos(b.heading);
          top += -Math.sin(b.pitch || 0) * (ox * sn + oz * cs) + Math.sin(b.roll || 0) * (ox * cs - oz * sn);
        }
        if (pos.y >= top - 0.025 || pos.y + height < b.y || top - pos.y <= step + 0.01) continue;
        if (b.radius ? pushCircle(pos, r, b.x, b.z, b.radius) : pushBox(pos, r, b)) hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }
  /**
   * Highest walkable surface at (x, z) that is not above `y` (+ a hair): terrain, temple steps, wall tops,
   * roof decks and anything dynamic (vehicle roofs, crates) registered in physics.dynamic. Lets the pup climb.
   */
  groundAt(x, z, y = Infinity) {
    let h = this.terrain(x, z);
    for (const p of this.#near(this.plats, x, z)) if (p.h > h && p.h <= y + 0.025 && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && inside(x, z, p.pts)) h = p.h;
    for (const p of this.#near(this.polys, x, z)) if (p.roof > h && p.roof <= y + 0.05 && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && inside(x, z, p.pts)) h = p.roof;
    for (const f of this.dynamic || []) { const d = f(x, z); if (d !== null && d > h && d <= y + 0.05) h = d; }
    return h;
  }
  solidAt(x, y, z) {
    for (const map of [this.polys, this.plats]) for (const p of this.#near(map, x, z)) if (y < (p.roof ?? p.h) && y > p.base && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && inside(x, z, p.pts)) return true;
    for (const c of this.#near(this.circles, x, z)) if (y < c.h && y > c.base && Math.hypot(x - c.x, z - c.z) < c.r) return true;
    return false;
  }

  /** Walk crossed spatial cells, with neighbours for the radius; a long aerial shot never scans a whole rectangle. */
  *#along(a, b, radius = 0) {
    const seen = new Set(), cells = new Set(), dx = b.x - a.x, dz = b.z - a.z;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (CELL * 0.5))), pad = Math.ceil(radius / CELL);
    for (let i = 0; i <= n; i++) {
      const ix = Math.floor((a.x + dx * i / n) / CELL), iz = Math.floor((a.z + dz * i / n) / CELL);
      // One neighbour also covers a segment that briefly crosses the corner between samples.
      for (let x = ix - Math.max(1, pad); x <= ix + Math.max(1, pad); x++) for (let z = iz - Math.max(1, pad); z <= iz + Math.max(1, pad); z++) {
        const k = key(x, z); if (cells.has(k)) continue; cells.add(k);
        for (const map of [this.polys, this.plats, this.circles, this.occluders]) for (const p of map.get(k) || EMPTY) {
          if (!seen.has(p)) { seen.add(p); yield p; }
        }
      }
    }
  }

  *#cameraBodies(a,b,radius) {
    const x0=Math.min(a.x,b.x)-radius,x1=Math.max(a.x,b.x)+radius,z0=Math.min(a.z,b.z)-radius,z1=Math.max(a.z,b.z)+radius;
    for(const provider of this.bodies)for(const b of provider()) {
      if(b.disabled || (b.radius && !b.blocksTraffic))continue;
      const reach=b.radius??Math.hypot(b.halfWidth,b.halfLength);
      if(!Number.isFinite(b.x+b.y+b.z+reach+b.height+(b.radius?0:b.heading)) || b.x+reach<x0 || b.x-reach>x1 || b.z+reach<z0 || b.z-reach>z1)continue;
      const h=b.y+b.height+Math.abs(Math.sin(b.pitch||0))*(b.halfLength||0)+Math.abs(Math.sin(b.roll||0))*(b.halfWidth||0);
      yield b.radius?{x:b.x,z:b.z,r:b.radius,base:b.y,h}:{pts:boxCorners(b),base:b.y,h};
    }
  }

  /** Continuous camera volume / sight line: includes thin walls, platforms, roof rims, pillars and terrain. */
  sweepSphere(a, b, radius = 0) {
    let t = 1;
    for (const p of this.#along(a, b, radius)) {
      if (p.pts) {
        t = Math.min(t, prismFrac(a, b, p.pts, p.base, p.roof ?? p.h, radius));
        if (p.roof < p.h) t = Math.min(t, prismFrac(a, b, p.pts, p.roof, p.h, radius, true));
      } else t = Math.min(t, circlePrismFrac(a, b, p, radius));
    }
    if(radius>0)for(const p of this.#cameraBodies(a,b,radius))t=Math.min(t,p.pts?prismFrac(a,b,p.pts,p.base,p.h,radius):circlePrismFrac(a,b,p,radius));
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.5));
    const under = (u) => { const x = a.x + dx * u, z = a.z + dz * u; return a.y + dy * u < this.terrain(x, z) + radius; };
    for (let i = 0; i <= n && i / n <= t; i++) if (under(i / n)) {
      let lo = Math.max(0, (i - 1) / n), hi = i / n;
      for (let j = 0; j < 8; j++) { const mid = (lo + hi) / 2; if (under(mid)) hi = mid; else lo = mid; }
      t = Math.min(t, lo); break;
    }
    return t;
  }
  /** Retains the old call signature; exact intersections no longer depend on sampling step size. */
  rayFrac(a, b) { return this.sweepSphere(a, b); }

  /** Roof clearance for a cinematic detour; only shapes intersecting the horizontal corridor contribute. */
  clearanceHeight(a, b, radius = 0) {
    const p0 = { x: a.x, y: 0, z: a.z }, p1 = { x: b.x, y: 0, z: b.z };
    let h = -Infinity;
    for (const p of this.#along(a, b, radius)) {
      const t = p.pts ? prismFrac(p0, p1, p.pts, -Infinity, Infinity, radius) : circlePrismFrac(p0, p1, { ...p, base: -Infinity, h: Infinity }, radius);
      if (t <= 1) h = Math.max(h, p.h + radius);
    }
    if(radius>0)for(const p of this.#cameraBodies(a,b,radius)) {
      const t=p.pts?prismFrac(p0,p1,p.pts,-Infinity,Infinity,radius):circlePrismFrac(p0,p1,{...p,base:-Infinity,h:Infinity},radius);
      if(t<=1)h=Math.max(h,p.h+radius);
    }
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
    for (let i = 0; i <= n; i++) h = Math.max(h, this.terrain(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n) + radius);
    return h;
  }

  /** Lowest underside over a head-sized footprint, used by jumps and mantles under landings. */
  ceilingAt(x, z, head, radius = 0) {
    const a = { x, y: head, z }, b = { x, y: head + 100, z };
    let h = Infinity;
    for (const p of this.#along(a, a, radius)) if (p.base >= head - 0.025 && p.base < h) {
      const t = p.pts ? prismFrac(a, b, p.pts, p.base, p.roof ?? p.h, radius) : circlePrismFrac(a, b, p, radius);
      if (t <= 1) h = p.base;
    }
    return h;
  }
  /** Is there room for something of radius r here (used to place NPCs)? */
  isFree(x, z, r = 0.4) { const p = { x, y: this.heightAt(x, z) + 0.1, z }; return !this.collide(p, r) && !this.solidAt(x, p.y + 0.5, z); }
}

export function inside(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function rect(cx, cz, hw, hd, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [cx + u * c + v * s, cz - u * s + v * c]);
}

function pushCircle(pos, r, x, z, radius) {
  const dx = pos.x - x, dz = pos.z - z, d = Math.hypot(dx, dz), min = r + radius;
  if (d >= min) return false;
  pos.x = x + (d > 1e-6 ? dx / d : 1) * (min + 0.001);
  pos.z = z + (d > 1e-6 ? dz / d : 0) * (min + 0.001);
  return true;
}

function pushBox(pos, r, b) {
  const cs = Math.cos(b.heading), sn = Math.sin(b.heading), dx = pos.x - b.x, dz = pos.z - b.z;
  let x = dx * cs - dz * sn, z = dx * sn + dz * cs;
  const qx = Math.max(-b.halfWidth, Math.min(b.halfWidth, x)), qz = Math.max(-b.halfLength, Math.min(b.halfLength, z));
  const ox = x - qx, oz = z - qz, d = Math.hypot(ox, oz);
  if (d >= r) return false;
  if (d > 1e-6) { x = qx + ox / d * (r + 0.001); z = qz + oz / d * (r + 0.001); }
  else if (b.halfWidth - Math.abs(x) < b.halfLength - Math.abs(z)) x = (x < 0 ? -1 : 1) * (b.halfWidth + r + 0.001);
  else z = (z < 0 ? -1 : 1) * (b.halfLength + r + 0.001);
  pos.x = b.x + x * cs + z * sn; pos.z = b.z - x * sn + z * cs;
  return true;
}

function pushPolygon(pos, r, pts, hollow = false) {
  const within = inside(pos.x, pos.z, pts);
  let d2 = Infinity, qx = 0, qz = 0, ex = 0, ez = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i], sx = b[0] - a[0], sz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((pos.x - a[0]) * sx + (pos.z - a[1]) * sz) / (sx * sx + sz * sz || 1)));
    const x = a[0] + sx * t, z = a[1] + sz * t, dd = (pos.x - x) ** 2 + (pos.z - z) ** 2;
    if (dd < d2) { d2 = dd; qx = x; qz = z; ex = sx; ez = sz; }
  }
  if ((!within || hollow) && d2 >= r * r) return false;
  const d = Math.sqrt(d2);
  let nx = d > 1e-6 ? (pos.x - qx) / d * (within && !hollow ? -1 : 1) : ez / (Math.hypot(ex, ez) || 1);
  let nz = d > 1e-6 ? (pos.z - qz) / d * (within && !hollow ? -1 : 1) : -ex / (Math.hypot(ex, ez) || 1);
  if (d <= 1e-6 && inside(qx + nx * 0.001, qz + nz * 0.001, pts) !== (hollow && within)) { nx = -nx; nz = -nz; }
  pos.x = qx + nx * (r + 0.001); pos.z = qz + nz * (r + 0.001);
  return true;
}
