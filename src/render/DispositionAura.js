/** One bounded point cloud gives nearby actors quiet silver wisps, friendly green faeries or hostile embers. */
import * as THREE from 'three';
import { THREATS } from '../config/index.js';
import { disposition } from '../gameplay/disposition.js';

export class DispositionAura {
  constructor(scene, quality) {
    this.limit = THREATS.aura.maxActors[quality.npc];
    this.capacity = this.limit * THREATS.aura.pointsPerActor;
    this.time = 0;
    const g = new THREE.BufferGeometry(),
      N = this.capacity;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.dat = new Float32Array(N * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDat', new THREE.BufferAttribute(this.dat, 3).setUsage(THREE.DynamicDrawUsage));
    this.u = { uScale: { value: 420 } };
    this.colours = Object.fromEntries(Object.entries(THREATS.colours).map(([k, c]) => [k, new THREE.Color(c)]));
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.u,
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        vertexShader:
          'attribute vec3 aDat; uniform float uScale; varying vec3 vC,vD; void main(){vC=color;vD=aDat;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(aDat.x*uScale/max(.3,-p.z),1.5,14.);}',
        fragmentShader: `varying vec3 vC,vD;void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p),a;
        if(vD.z>1.5){p.x+=sin(p.y*5.+vD.y)*.15;float flame=length(vec2(p.x*1.25,p.y*.75));a=(1.-smoothstep(.1,1.,flame))*max(0.,1.-p.y*.35);}
        else{vec2 q=abs(p);float star=max(1.-q.x*6.-q.y,1.-q.y*6.-q.x);a=max(smoothstep(0.,.3,star), (1.-smoothstep(0.,1.,r))*.32);}
        a*=vD.y;if(a<.025)discard;gl_FragColor=vec4(vC*1.35,a);}`,
      }),
    );
    this.points.frustumCulled = false;
    this.points.visible = false;
    g.setDrawRange(0, 0);
    scene.add(this.points);
    this.stats = { actors: 0, points: 0, danger: 0, neutral: 0, good: 0, stunned: 0 };
  }
  update(dt, actors, pup, reveal = false, enabled = true) {
    this.time += dt;
    const cfg = THREATS.aura,
      stats = { actors: 0, points: 0, danger: 0, neutral: 0, good: 0, stunned: 0 };
    const nearby = enabled
      ? actors
          .filter(
            (a) =>
              a.root?.parent && a.root.visible && Math.hypot(a.pos.x - pup.pos.x, a.pos.z - pup.pos.z) < (reveal ? cfg.reveal : cfg.near),
          )
          .sort((a, b) => a.pos.distanceToSquared(pup.pos) - b.pos.distanceToSquared(pup.pos))
          .slice(0, this.limit)
      : [];
    let n = 0;
    for (const actor of nearby) {
      const d = disposition(actor),
        key = d.stunned ? 'stunned' : d.cat,
        c = this.colours[key];
      stats.actors++;
      stats[key]++;
      const count = d.stunned ? 6 : d.cat === 'danger' ? 5 : d.cat === 'good' ? 3 : 2;
      const dog = !!actor.dog,
        height = dog ? 0.42 * actor.scale : 1.0 * actor.model.scale.y;
      for (let i = 0; i < count; i++) {
        const phase = this.time * (d.cat === 'danger' ? 1.7 : 0.7) + i * 2.399 + (actor.id || 0),
          rise = (this.time * 0.45 + i * 0.21) % 1;
        const radius = dog ? 0.22 : 0.27,
          fi = n * 3;
        this.pos[fi] = actor.pos.x + Math.cos(phase) * radius;
        this.pos[fi + 2] = actor.pos.z + Math.sin(phase) * radius;
        this.pos[fi + 1] = actor.pos.y + (d.stunned ? height + 0.22 + Math.sin(phase) * 0.04 : height * 0.4 + rise * height * 0.75);
        c.toArray(this.col, fi);
        this.dat[fi] = cfg.size * (d.cat === 'neutral' ? 0.7 : 1);
        this.dat[fi + 1] = (d.cat === 'neutral' ? 0.32 : 0.7) * Math.sin(Math.PI * rise);
        this.dat[fi + 2] = d.cat === 'danger' ? 2 : 0;
        n++;
      }
    }
    stats.points = n;
    this.stats = stats;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    this.points.visible = n > 0;
    for (const a of Object.values(g.attributes)) a.needsUpdate = true;
  }
}
