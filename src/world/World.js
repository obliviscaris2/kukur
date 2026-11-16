/**
 * The world: terrain, collision, streamed map tiles, props, landmarks, sky & weather.
 * App owns one World; entities query it (heightAt, physics, nav paths, place names).
 */
import { WORLD } from '../config/index.js';
import { toLocal, setOrigin } from '../core/geo.js';
import { loadJSON } from '../core/assets.js';
import { createWorldMaterials } from '../render/materials.js';
import { Physics } from './physics.js';
import { TileStreamer } from './tiles/TileStreamer.js';
import { loadTerrain, terrainAt } from './terrain.js';
import { Props } from './props/Props.js';
import { Landmarks } from './landmarks/Landmarks.js';
import { Sky } from './sky/Sky.js';
import { Weather } from './sky/Weather.js';
import { Gazetteer } from './Gazetteer.js';
import { Signposts } from './props/Signposts.js';
import { Beacons } from './landmarks/Beacons.js';
import { Neon } from './effects/Neon.js';
import { Grass } from './effects/Grass.js';
import { FarCity } from './FarCity.js';
import { Festival } from './festival/Festival.js';
import { Sanctuary } from './effects/Sanctuary.js';
import { Atmosphere } from './effects/Atmosphere.js';

export class World {
  constructor(scene, quality) { this.scene = scene; this.quality = quality; }

  async init(onProgress) {
    this.manifest = await loadJSON(WORLD.mapUrl + 'manifest.json');
    setOrigin(...this.manifest.origin);
    this.hills = WORLD.hills.map((h) => { const [x, z] = toLocal(h.lat, h.lon); return { ...h, x, z }; });
    this.dem = await loadTerrain(WORLD.mapUrl, WORLD.terrain?.exaggerate ?? 1);
    this.terrain = (x, z) => terrainAt(this.dem, this.hills, x, z);
    this.physics = new Physics(this.terrain);
    onProgress?.('Mixing paints…', 0.05);
    this.materials = await createWorldMaterials();
    this.props = new Props(this.scene, this.quality);
    this.landmarks = new Landmarks(this.scene, this.physics);
    await this.landmarks.init();
    this.sky = new Sky(this.scene, this.quality);
    this.weather = new Weather(this.scene,this.quality);
    onProgress?.('Learning the street names…', 0.6);
    this.gazetteer = await new Gazetteer().init();
    this.signposts = new Signposts(this.scene, this.physics, this.gazetteer);
    this.beacons = new Beacons(this.scene, this.landmarks, this.terrain);
    await this.beacons.init(this.gazetteer.destinations);
    this.extras = WORLD.extraLandmarks.map((l) => { const [x, z] = toLocal(l.lat, l.lon); return { ...l, x, z, key: `${Math.floor(x / this.manifest.tileSize)}_${Math.floor(z / this.manifest.tileSize)}` }; });
    this.tileListeners = new Set();
    this.landmarkLoads = new Set();
    this.neon = new Neon(this.scene, this);
    this.grass = new Grass(this.scene, this);
    this.farCity = new FarCity(this.scene, this);
    this.festival = new Festival(this.scene, this);   // Tihar days: decorations + fireworks (audio is attached by App)
    this.sanctuary = new Sanctuary(this.scene);
    this.atmosphere = new Atmosphere(this.scene);
    await this.farCity.init();
    this.streamer = new TileStreamer({
      scene: this.scene, materials: this.materials, physics: this.physics, manifest: this.manifest, hills: this.hills, dem: this.dem, quality: this.quality,
      onLoad: (t) => {
        this.props.addTile(t.key, t.data.props);
        const lms = [...t.data.landmarks];
        for (const e of this.extras) if (e.key === t.key) lms.push([e.x, e.z, e.size, 0, e.model, e.name]);
        const pending = this.landmarks.addTile(t.key, lms);
        this.landmarkLoads.add(pending);
        pending.then(() => this.landmarkLoads.delete(pending), error => { this.landmarkLoads.delete(pending); console.error('Landmark load failed', error); });
        this.signposts.addTile(t.key, t.data.signs);
        for (const fn of this.tileListeners) fn('load', t);
      },
      onUnload: (t) => {
        this.props.removeTile(t.key); this.landmarks.removeTile(t.key); this.signposts.removeTile(t.key);
        for (const fn of this.tileListeners) fn('unload', t);
      },
    });
  }

  /** Start / travel points (name -> [x, z]): the manifest's plus WORLD.extraStarts. */
  get starts() {
    if (!this._starts) {
      this._starts = { ...this.manifest.starts };
      for (const s of WORLD.extraStarts) this._starts[s.name] = toLocal(s.lat, s.lon);
    }
    return this._starts;
  }
  heightAt(x, z) { return this.physics.heightAt(x, z); }

  /** Footfall material, queried only on steps: the same polygons and paths that paint the visible tile. */
  surfaceAt(x,z,y=this.heightAt(x,z)) {
    if(y>this.heightAt(x,z)+.2)return 'stone';
    const data=this.streamer.tiles.get(`${Math.floor(x/this.manifest.tileSize)}_${Math.floor(z/this.manifest.tileSize)}`)?.data;
    if(!data)return 'earth';
    for(const n of data.navs)if(nearLine(x,z,n.pts,n.w/2))return n.surface||'stone';
    const areas=data.surfaces||[];
    for(let i=areas.length-1;i>=0;i--)if(pointInFlat(x,z,areas[i].pts))return areas[i].kind;
    return data.density>.2?'stone':'grass';
  }

  /** Water surface height if (x, z) is in a pond or river (and not on a bridge/road), else null. */
  waterAt(x, z) {
    const t = this.streamer.tiles.get(`${Math.floor(x / this.manifest.tileSize)}_${Math.floor(z / this.manifest.tileSize)}`);
    const sw = t?.data?.swim; if (!sw || (!sw.polys.length && !sw.lines.length)) return null;
    let wet = false;
    for (const poly of sw.polys) if (pointInFlat(x, z, poly)) { wet = true; break; }
    if (!wet) for (const [flat, w] of sw.lines) if (nearLine(x, z, flat, w / 2 - 0.4)) { wet = true; break; }
    if (!wet) return null;
    for (const n of t.data.navs) if (n.w > 2 && nearLine(x, z, n.pts, n.w / 2 + 0.3)) return null;   // bridges & roads
    return this.terrain(x, z) + 0.03;
  }
  /** A water point within r of (x, z) (for dragonflies), or null. */
  waterNear(x, z, r) {
    for (const t of this.streamer.ready()) {
      const sw = t.data.swim; if (!sw) continue;
      for (const flat of [...sw.polys, ...sw.lines.map((l) => l[0])]) for (let i = 0; i < flat.length; i += 2) if (Math.hypot(flat[i] - x, flat[i + 1] - z) < r) return { x: flat[i], z: flat[i + 1] };
    }
    return null;
  }
  onTile(fn) { this.tileListeners.add(fn); }

  /** Wait until the area around (x, z) is built. */
  async prepare(x, z, onProgress) {
    await this.streamer.ensureAround(x, z, 220, onProgress);
    // The mesh and collision for a temple arrive asynchronously after its tile geometry.
    await Promise.all(this.landmarkLoads);
  }

  update(dt, focus, camera, time, waypoint = null, pins = []) {
    const W = this.weather;
    W.update(dt, { camera, focus, heightAt: (x, z) => this.heightAt(x, z), solidAt:(x,y,z)=>this.physics.solidAt(x,y,z), shrineLights:this.sanctuary.lights,groves:this.discoverySources?.()||[],time, props: this.props, landmarks: this.landmarks });
    const sky = this.sky.update(dt, W.hour, W.params, focus, camera, W.flash);
    this.streamer.update(dt, focus, sky.fogFar);
    this.landmarks.update(dt, camera, sky.fogFar);
    this.props.update(dt, focus, sky.night, camera);
    this.signposts.update(dt, focus);
    this.neon.update(dt, focus);
    this.grass.update(focus);
    this.sanctuary.update(dt,{focus,props:this.props,landmarks:this.landmarks,physics:this.physics,heightAt:(x,z)=>this.heightAt(x,z),waterAt:(x,z)=>this.waterAt(x,z),night:sky.night,streetLights:this.neon.lights});
    this.atmosphere.update(dt,{focus,camera,props:this.props,lights:this.sanctuary.lights,heightAt:(x,z)=>this.heightAt(x,z),solidAt:(x,y,z)=>this.physics.solidAt(x,y,z)});
    this.festival.update(dt, { focus, people: this.crowd?.(), say: this.say });   // crowd/say are attached by App
    this.farCity.update(camera, focus, this.streamer.radius - 30);
    this.beacons.update(dt, { focus, waypoint, pins, fogColor: this.scene.fog.color, near: this.streamer.radius + 60, time });
    return sky;
  }

}

function pointInFlat(x, z, f) {
  let c = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) if (f[i + 1] > z !== f[j + 1] > z && x < ((f[j] - f[i]) * (z - f[i + 1])) / (f[j + 1] - f[i + 1]) + f[i]) c = !c;
  return c;
}
function nearLine(x, z, f, r) {
  for (let i = 2; i < f.length; i += 2) {
    const ax = f[i - 2], az = f[i - 1], dx = f[i] - ax, dz = f[i + 1] - az, L = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r) return true;
  }
  return false;
}
