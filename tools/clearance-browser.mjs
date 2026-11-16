/** Real-map visual checks used by tools/snaps/clearance.json: rendered terrain, buried foundations and swept camera flights. */
import * as THREE from 'three';
import { PupCamera } from '../src/entities/pup/PupCamera.js';
import { footprintRange } from '../src/world/terrain.js';

export function auditTerrain(app) {
  let count=0,error=0;
  for(const tile of app.world.streamer.ready()) {
    const p=tile.data.ground.position,n=Math.round(Math.sqrt(p.length/3))-1;
    for(let i=0;i<40;i++) {
      const col=i*7%n,row=i*11%n,u=.23,v=i%2?.72:.14,at=(dx,dz)=>new THREE.Vector3().fromArray(p,((row+dz)*(n+1)+col+dx)*3);
      const a=at(0,0),b=at(1,0),c=at(1,1),d=at(0,1),x=a.x+(b.x-a.x)*u,z=a.z+(d.z-a.z)*v;
      const plane=new THREE.Plane().setFromCoplanarPoints(a,u>=v?b:d,c),rendered=-(plane.normal.x*x+plane.normal.z*z+plane.constant)/plane.normal.y;
      error=Math.max(error,Math.abs(rendered-app.world.terrain(x,z)));count++;
    }
  }
  if(error>.003)throw Error(`Visible ground/contact mismatch: ${error} m`);
  return {samples:count,maxErrorMetres:error};
}

export async function auditFoundations(app) {
  let checked=0,maxGap=-Infinity;
  for(const tile of app.world.streamer.ready()) {
    if(Math.hypot((tile.tx+.5)*256-app.pup.pos.x,(tile.tz+.5)*256-app.pup.pos.z)>450)continue;
    const raw=await fetch(`./assets/map/tiles/${tile.key}.json`).then(r=>r.json());
    for(const b of raw.b.slice(0,12)) {
      const pts=[];for(let i=0;i<b[0].length;i+=2)pts.push([tile.tx*256+b[0][i]/10,tile.tz*256+b[0][i+1]/10]);
      const body=tile.data.solids.find(s=>pts.every(p=>s.pts.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.001)));
      if(!body)continue;
      const ground=footprintRange(pts,app.world.terrain).low,gap=body.base-ground;
      if(gap>-.15)throw Error(`Exposed foundation at ${tile.key}: ${gap}`);
      // Confirm this is also the bottom of a rendered wall, rather than only a buried collision box.
      const positions=tile.data.walls.position;
      let foot=false;
      for(let i=0;i<positions.length;i+=3)if(Math.abs(positions[i+1]-body.base)<.001 && pts.some(p=>Math.hypot(p[0]-positions[i],p[1]-positions[i+2])<.003)){foot=true;break;}
      if(!foot)throw Error(`Collision footing has no matching wall geometry: ${tile.key}`);
      checked++;maxGap=Math.max(maxGap,gap);
    }
  }
  if(!checked)throw Error('No building foundations checked');
  return {buildings:checked,leastBuriedMetres:-maxGap};
}

export function auditCamera(app) {
  const physics=app.world.physics,base=app.pup.pos.clone(),render=new THREE.PerspectiveCamera(66,16/9,.05,6000),cam=new PupCamera(render);
  const pup={pos:base,heading:app.pup.heading,speed:0,grounded:true,sprinting:false,dog:{model:{visible:true}},forward:()=>new THREE.Vector3(Math.sin(pup.heading),0,Math.cos(pup.heading)),eyePosition:()=>base.clone().add(new THREE.Vector3(0,.42,0))};
  const input={consumeLook:()=>[0,0,0],hit:()=>false};let frames=0,maxStep=0,roofDetours=0;
  cam.snapBehind(pup);
  const tick=()=>{
    const previous=render.position.clone(),ready=cam.travel.ready;
    cam.update(1/60,pup,input,physics);frames++;
    if(physics.sweepSphere(render.position,render.position,.17)<1)throw Error('Camera endpoint entered a rendered obstacle');
    if(ready && physics.sweepSphere(previous,previous,.17)===1 && physics.sweepSphere(previous,render.position,.17)<1)throw Error('Camera flight crossed an obstacle');
    if(ready){
      const step=previous.distanceTo(render.position),altitude=Math.max(0,previous.y-physics.terrain(previous.x,previous.z));
      const bound=Math.min(450,10+altitude*3)/60;
      if(step>bound+.01)throw Error(`Camera snapped ${step} m (smooth limit ${bound})`);
      maxStep=Math.max(maxStep,step);
    }
    if(cam.travel.route.length>=3)roofDetours++;
  };
  for(let i=0;i<90;i++)tick();
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
    const x=base.x+Math.sin(angle)*26,z=base.z+Math.cos(angle)*26;
    cam.setShot(new THREE.Vector3(x,physics.terrain(x,z)+8,z),base.clone().add(new THREE.Vector3(0,.3,0)));
    for(let i=0;i<420;i++)tick();
    cam.clearShot();cam.snapBehind(pup);
    for(let i=0;i<480;i++)tick();
    if(render.position.distanceTo(base)>4)throw Error('Camera did not settle behind the pup');
  }
  return {frames,roofDetours,maxFrameTravel:maxStep};
}
