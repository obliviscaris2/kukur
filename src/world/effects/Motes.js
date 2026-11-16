/**
 * Little lights that make the city feel enchanted (one additive point cloud around the pup):
 *   night  -> fireflies: green-gold, blinking, wandering low (more near trees and parks)
 *   temple -> golden motes rising slowly from the shrine like incense sparks
 *   day    -> pollen glinting in the sun, a few at a time
 */
import * as THREE from 'three';
import { NATURE, EXPLORATION } from '../../config/index.js';
import { U } from '../../render/toon.js';

const M=NATURE.motes,F=EXPLORATION.firefly,N=Math.min(M.capacity,F.capacity);

export class Motes {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.data = new Float32Array(N * 4);   // phase, kind, life, size
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aData', new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    this.u = { uT: { value: 0 }, uScale: { value: 300 }, uNight: { value: 0 },uColours:{value:M.colours.map(c=>new THREE.Color(c))} };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uT, uScale; uniform vec3 uColours[4]; attribute vec4 aData; varying vec3 vC; varying float vA;
        void main() {
          float kind=aData.y,phase=fract(uT*.19+aData.x),pulse=exp(-pow((phase-.22)*13.0,2.0))+.6*exp(-pow((phase-.41)*17.0,2.0));
          float blink=kind<.5||kind>2.5?.12+.88*min(1.0,pulse):.8+.2*sin(uT*1.6+aData.x*9.0);
          vC = uColours[int(kind)];
          vA = blink * clamp(aData.z, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vA *= smoothstep(.6,2.0,-mv.z);gl_PointSize = clamp(aData.w * uScale / max(.1,-mv.z),1.0,18.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0;if(r>1.0)discard;
          float a = (exp(-r * 5.0) + 0.15 * exp(-r * 1.4))*smoothstep(1.0,.6,r);
          gl_FragColor = vec4(vC * a * vA, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 4;
    scene.add(this.points);
    this.p = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, kind: 0, home: null }));
    this.count = 0;
  }

  /** Fireflies keep a home in a garden, scatter around the pup, then settle back; no per-insect draw calls. */
  update(dt, { focus, night, temples, greenery, heightAt, solidAt=()=>false, flowering=[], groves=[], wind, rain }) {
    this.u.uT.value += dt;
    const now=this.u.uT.value;
    this.u.uScale.value=U.uViewport.value.y*.43;
    const nearby=groves.filter(s=>Math.hypot(s.x-focus.x,s.z-focus.z)<F.maxDistance);
    const garden=rain<.6?nearby.length*(night>F.wake?F.perGrove:F.dayPerGrove):0;
    const temple=temples.length?M.temple:0,pollen=night<.3&&rain<.2?M.pollen:0;
    const fire=Math.max(0,Math.min(N-garden-temple-pollen,rain<.3?Math.round(night>F.wake?M.fireflies[0]+M.fireflies[1]*greenery:6*greenery):0));
    const want=Math.min(N,garden+temple+fire+pollen);
    for(let i=want;i<this.count;i++)this.p[i].life=0;
    this.count=want;
    for(let i=0;i<want;i++){
      const q=this.p[i];q.life-=dt;
      const kind=i<garden?3:i<garden+temple?1:i<garden+temple+fire?0:2;
      if(q.kind!==kind)q.life=0;
      if(q.life<=0){
        q.kind=kind;q.max=q.life=6+Math.random()*5;
        let hx,hz;
        if(kind===3){const s=nearby[i%nearby.length];hx=s.x;hz=s.z;}
        else if(kind===1){const t=temples[i%temples.length];hx=t[0];hz=t[2];}
        else if(kind===0&&flowering.length){const t=flowering[i%flowering.length];hx=t[0];hz=t[2];}
        else {const a=Math.random()*6.28,d=3+Math.random()*18;hx=focus.x+Math.cos(a)*d;hz=focus.z+Math.sin(a)*d;}
        const a=Math.random()*6.28,d=kind===3?1+Math.random()*3:Math.random()*2;
        q.x=hx+Math.cos(a)*d;q.z=hz+Math.sin(a)*d;
        q.floor=heightAt(q.x,q.z);q.y=q.floor+.3+Math.random()*(kind===3?2.6:1.9);
        q.home={x:q.x,y:q.y,z:q.z};q.vx=q.vy=q.vz=0;q.check=now+Math.random()*.3;
        this.data[i*4]=Math.random();this.data[i*4+1]=kind;this.data[i*4+3]=kind===3?F.size[i%2]:M.size[kind];
      }
      const t=now+i;
      if(kind===0||kind===3){
        const dx=q.x-focus.x,dz=q.z-focus.z,d=Math.hypot(dx,dz),scare=Math.max(0,1-d/F.scatterRadius);
        q.vx+=(Math.sin(t*.7)*.35+(q.home.x-q.x)*.7+dx/Math.max(.1,d)*scare*3-q.vx*1.6)*dt;
        q.vz+=(Math.cos(t*.6)*.35+(q.home.z-q.z)*.7+dz/Math.max(.1,d)*scare*3-q.vz*1.6)*dt;
        q.vy+=(Math.sin(t*1.3)*.18+(q.home.y-q.y)*.8+scare*.8-q.vy*1.8)*dt;
      }else if(kind===1){q.vy=.22;q.vx=Math.sin(t*1.7)*.18+wind.dir.x*wind.strength*.25;q.vz=Math.cos(t*1.4)*.18+wind.dir.y*wind.strength*.25;}
      else {q.vx=wind.dir.x*wind.strength*.6+Math.sin(t)*.15;q.vz=wind.dir.y*wind.strength*.6;q.vy=Math.sin(t*.9)*.1;}
      q.x+=q.vx*dt;q.y=Math.max(q.floor+.12,q.y+q.vy*dt);q.z+=q.vz*dt;
      this.pos[i*3]=q.x;this.pos[i*3+1]=q.y;this.pos[i*3+2]=q.z;
      this.data[i*4+2]=Math.min(1,q.life,(q.max-q.life)*1.5);
      // Stagger collision work; depth testing still occludes every point against the world each frame.
      if(now>=q.check){
        q.check=now+.3;
        if(solidAt(q.x,q.y,q.z)||Math.hypot(q.x-focus.x,q.z-focus.z)>45){q.life=0;this.data[i*4+2]=0;}
      }
    }
    this.points.geometry.setDrawRange(0,want);this.points.visible=want>0;
    if(want)this.points.geometry.attributes.position.needsUpdate=this.points.geometry.attributes.aData.needsUpdate=true;
  }
}
