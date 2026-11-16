/** Slow, curved blossom carried by the valley wind; one bounded instance pool, with wall checks and soft settling. */
import * as THREE from 'three';
import { ART } from '../../config/index.js';
import { toon } from '../../render/toon.js';

const P=ART.petals, between=range=>range[0]+Math.random()*(range[1]-range[0]);

function petalGeometry() {
  const rim=[[0,-.6],[.3,-.42],[.48,-.1],[.4,.3],[.18,.54],[0,.62],[-.18,.54],[-.4,.3],[-.48,-.1],[-.3,-.42]];
  const positions=[0,.1,0],indices=[];
  for(const[x,z]of rim)positions.push(x,.12*x*x-.05*z,z);
  for(let i=0;i<rim.length;i++)indices.push(0,i+1,(i+1)%rim.length+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  return g;
}

export class Petals {
  constructor(scene,quality={npc:'low'}) {
    this.capacity=P.capacity[quality.npc]||P.capacity.low;
    const g=petalGeometry();
    this.fade=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPetalFade',this.fade);
    const mat=toon('#ffffff',{
      key:'petals',rim:0,wet:false,params:{side:THREE.DoubleSide,transparent:true,depthWrite:false},
      vertexHead:'attribute float aPetalFade; varying float vPetalFade;',vertexMain:'vPetalFade=aPetalFade;',
      fragHead:'varying float vPetalFade;',fragMap:'#include <map_fragment>\ndiffuseColor.a *= vPetalFade;',
    });
    this.mesh=new THREE.InstancedMesh(g,mat,this.capacity);this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count=0;this.mesh.visible=false;this.mesh.frustumCulled=false;scene.add(this.mesh);
    this.p=Array.from({length:this.capacity},()=>({pos:new THREE.Vector3(),rot:new THREE.Euler(),life:0,age:0,settled:0,size:0,fall:0,phase:Math.random()*Math.PI*2}));
    this.sources=[];this.matrix=new THREE.Matrix4();this.rotation=new THREE.Quaternion();this.scale=new THREE.Vector3();this.colour=new THREE.Color();this.wind=new THREE.Vector3();
  }

  update(dt,{focus,camera,heightAt,solidAt=()=>false,wind,rain=0,time=0}) {
    const density=(P.ambient+P.flowering*Math.min(1,this.sources.length/2))*(1-rain*P.rainReduction);
    const count=Math.min(this.capacity,Math.floor(this.capacity*density));
    this.mesh.count=count;this.mesh.visible=count>0;
    for(let i=0;i<count;i++){
      const q=this.p[i];q.life-=dt;q.age+=dt;
      if(q.life<=0||Math.hypot(q.pos.x-focus.x,q.pos.z-focus.z)>P.radius*1.6)this.#spawn(i,q,focus,heightAt,solidAt);
      if(q.life>0){
        const ground=heightAt(q.pos.x,q.pos.z);
        if(!q.settled){
          wind.at(q.pos.x,q.pos.z,q.pos.y-ground,this.wind);
          q.pos.x+=(this.wind.x*P.wind+Math.sin(time*1.3+q.phase)*P.sway)*dt;
          q.pos.z+=(this.wind.z*P.wind+Math.cos(time*.9+q.phase)*P.sway)*dt;
          q.pos.y-=q.fall*dt;
          q.rot.set(Math.sin(time*1.6+q.phase)*.65,q.phase+time*.23,Math.cos(time*1.1+q.phase)*.55);
          if(solidAt(q.pos.x,q.pos.y,q.pos.z))q.life=0;
          else if(q.pos.y<=heightAt(q.pos.x,q.pos.z)+.015){
            q.pos.y=heightAt(q.pos.x,q.pos.z)+.015;q.settled=P.settle;q.life=Math.min(q.life,P.settle);q.rot.x=q.rot.z=0;
          }
        }else q.settled=Math.max(.001,q.settled-dt);
      }
      const near=THREE.MathUtils.smoothstep(q.pos.distanceTo(camera.position),...P.nearFade);
      this.fade.setX(i,Math.max(0,Math.min(1,q.age/P.fadeSeconds,q.life/P.fadeSeconds))*near*.85);
      this.rotation.setFromEuler(q.rot);this.matrix.compose(q.pos,this.rotation,this.scale.setScalar(q.size));this.mesh.setMatrixAt(i,this.matrix);
    }
    if(count){this.mesh.instanceMatrix.needsUpdate=true;this.fade.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;}
    // Hidden slots must not reappear with an old position after weather/district changes.
    for(let i=count;i<this.capacity;i++)this.p[i].life=0;
  }

  #spawn(i,q,focus,heightAt,solidAt) {
    const disperse=q.size===0||Math.hypot(q.pos.x-focus.x,q.pos.z-focus.z)>P.radius*1.6;
    q.life=0;q.age=0;q.settled=0;
    for(let attempt=0;attempt<5;attempt++){
      const source=this.sources.length&&Math.random()<.78?this.sources[Math.floor(Math.random()*this.sources.length)]:null;
      const angle=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*(source?P.sourceRadius:P.radius);
      const x=(source?source[0]:focus.x)+Math.cos(angle)*r,z=(source?source[2]:focus.z)+Math.sin(angle)*r;
      q.pos.set(x,source?source[1]+between(P.height):heightAt(x,z)+between(P.height),z);
      // Enter a district mid-drift, rather than waiting half a minute for every petal to reach eye level.
      if(disperse)q.pos.y=THREE.MathUtils.lerp(heightAt(x,z)+.2,q.pos.y,Math.random());
      if(!solidAt(x,q.pos.y,z)){
        q.life=between(P.life);q.size=between(P.size);q.fall=between(P.fall);q.rot.set(0,q.phase,0);
        this.mesh.setColorAt(i,this.colour.set(P.colours[Math.floor(Math.random()*P.colours.length)]));return;
      }
    }
  }
}
