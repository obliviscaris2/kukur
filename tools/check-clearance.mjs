/** Geometry regressions for camera sweeps, terrain contact, temple alignment, mantle clearance and stair smoothing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Physics, rect, inside } from '../src/world/physics.js';
import { terrainAt, footprintRange } from '../src/world/terrain.js';
import { registerLandmark } from '../src/world/landmarks/landmarkCollision.js';
import { PupCamera } from '../src/entities/pup/PupCamera.js';
import { CameraTravel } from '../src/entities/pup/CameraTravel.js';
import { Pup } from '../src/entities/pup/Pup.js';
import { ImpactMotion } from '../src/entities/pup/ImpactMotion.js';
import { PUP, WORLD } from '../src/config/index.js';
import { IntroScene } from '../src/scenes/IntroScene.js';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
const meta = JSON.parse(readFileSync(new URL('../assets/models/temples/meta.json',import.meta.url)));
function player(physics) {
  const p = new Pup(), root = new THREE.Group(), holder = new THREE.Group(); root.add(holder);
  p.root=root; p.pos=root.position;
  p.dog={root,holder,bones:{},model:new THREE.Group(),blob:{visible:true,position:V(0,0,0),material:{}},update(){}};
  p.anim={update(){},clipLength:()=>1}; p.feet={update(){}}; p.impact=new ImpactMotion(p.dog);
  const world={physics,terrain:physics.terrain,heightAt:(x,z)=>physics.heightAt(x,z),waterAt:()=>null,weather:{hour:12},sky:{}};
  const input={axis:()=>({x:0,y:1}),hit:()=>false,down:()=>false,run:false,walk:true};
  p.placeAt(0,-1,0,world);
  return {p,world,input,tick(dt=1/60){p.update(dt,input,{yaw:Math.PI},world,0);}};
}

test('continuous sight lines catch millimetre walls at any sampling phase',()=>{
  for(const z of [0.001,0.149,0.311,0.987]) {
    const ph=new Physics(); ph.addBox('wall',0,z,2,0.0005,0,4);
    const t=ph.rayFrac(V(0,1,-1),V(0,1,2));
    assert.ok(Math.abs(t-(z-0.0005+1)/3)<1e-8);
  }
});
test('fast travel drops an old cinematic route and starts with a clear camera beside the new pup',()=>{
  const ph=new Physics(),{p,world}=player(ph),camera=new THREE.PerspectiveCamera(66,16/9,.05,6000),cam=new PupCamera(camera);
  cam.setShot(V(-300,90,500),V(-300,20,500));cam.shotK=1;cam.travel.reset(V(-300,90,500),V(-300,20,500));
  p.placeAt(1100,700,1.2,world);cam.placeBehind(p,ph);
  assert.equal(cam.shot,null);assert.equal(cam.shotK,0);assert.equal(cam._lastShot,null);
  assert.ok(camera.position.distanceTo(p.pos)<PUP.camera.distance+2);
  assert.equal(ph.sweepSphere(camera.position,camera.position,PUP.camera.collisionRadius),1);
  assert.ok(cam.lookPoint.distanceTo(p.pos)<2);
});
test('camera volume catches a corner that a centre ray misses',()=>{
  const ph=new Physics(); ph.addBox('house',0,0,1,1,0,5);
  const a=V(1.12,1,-3),b=V(1.12,1,3);
  assert.equal(ph.rayFrac(a,b),1); assert.ok(ph.sweepSphere(a,b,0.18)<0.4);
});
test('platform sides, undersides, pillars and hollow parapets all stop the camera',()=>{
  const ph=new Physics(); ph.addPlatformBox('landing',0,0,1,1,0,1.2,1);
  assert.ok(ph.sweepSphere(V(0,.5,0),V(0,2,0),.1)<.3);
  assert.equal(ph.sweepSphere(V(-2,.5,0),V(2,.5,0),.1),1);
  ph.addCircle('pillar',3,0,.12,3,0);
  assert.ok(ph.sweepSphere(V(2,1,0),V(4,1,0),.1)<.5);
  ph.addSolid('roof',rect(0,4,2,2,0),3,0,2);
  assert.equal(ph.sweepSphere(V(0,2.5,4),V(.5,2.5,4),.1),1);
  assert.ok(ph.sweepSphere(V(0,2.5,4),V(4,2.5,4),.1)<.5);
});
test('a camera flight takes a continuous route above a blocking house',()=>{
  for(const fps of [30,60,144]) {
    const ph=new Physics(); ph.addBox('house',0,0,2,1,0,6);
    const travel=new CameraTravel(),goal=V(0,1,-4),anchor=V(0,.4,-5);
    travel.reset(V(0,2,4),anchor); let peak=0;
    for(let i=0;i<fps*5;i++){
      const previous=travel.pos.clone(),p=travel.update(1/fps,goal,anchor,ph,true);
      assert.equal(ph.sweepSphere(previous,p,PUP.camera.collisionRadius),1,`flight crossed a house at ${fps} fps`);
      peak=Math.max(peak,p.y);
    }
    assert.ok(peak>6.5); assert.ok(travel.pos.distanceTo(goal)<.05);
  }
});
test('the entire opening camera choreography follows the starting elevation',async()=>{
  const record=async(y)=>{
    const shots=[],pup={pos:V(100,y,200),startPose(){},cancelPose(){},bark(){},anim:{clipLength:()=>0}};
    const scene={app:{pup,world:{weather:{set(){}}},cam:{snapBehind(){},clearShot(){}},audio:{shake(){}}},cards:{},card(){},wait:async()=>{},shot:async(...args)=>shots.push(args.slice(0,4))};
    await IntroScene.prototype.run.call(scene);return shots;
  };
  const flat=await record(0);
  for(const elevation of [-25,83]) {
    const elevated=await record(elevation);
    elevated.forEach((shot,i)=>shot.forEach((point,j)=>assert.ok(Math.abs(point.y-flat[i][j].y-elevation)<1e-8,'a cinematic waypoint used an absolute height')));
  }
});
test('vehicles stop the camera volume without becoming self-blocking sight-line targets',()=>{
  const ph=new Physics();ph.bodies.push(()=>[{x:0,y:0,z:0,halfWidth:1,halfLength:2,heading:.3,height:1.6}]);
  assert.ok(ph.sweepSphere(V(0,.7,-4),V(0,.7,4),.18)<.5);
  assert.equal(ph.rayFrac(V(0,.7,-4),V(0,.7,4)),1);
});
test('a newly streamed obstacle cannot leave the camera stuck inside it',()=>{
  const ph=new Physics(),travel=new CameraTravel(),anchor=V(0,.4,-5),goal=V(0,1,-4);
  travel.reset(V(0,1,0),anchor);ph.addBox('new-tile',0,0,2,2,0,5);
  travel.update(1/60,goal,anchor,ph,false);
  assert.equal(ph.sweepSphere(travel.pos,travel.pos,.18),1);
  assert.ok(travel.pos.distanceTo(goal)<.01);
});
test('a follow camera recovers around a wall when its old pivot is already occluded',()=>{
  const ph=new Physics();ph.addBox('house',0,0,2,1,0,5);
  const travel=new CameraTravel(),anchor=V(0,.4,-4),goal=V(0,1,-3);
  travel.reset(V(0,1,4),anchor);
  for(let i=0;i<480;i++){const prev=travel.pos.clone();travel.update(1/60,goal,anchor,ph,false);assert.equal(ph.sweepSphere(prev,travel.pos,.175),1);}
  assert.ok(travel.pos.distanceTo(goal)<.05);
});
test('a short respawn across a building resets the follow rig instead of staring through its wall',()=>{
  const ph=new Physics();ph.addBox('house',0,0,2,1,0,5);
  const {p}=player(ph);p.pos.set(0,0,3);p.heading=Math.PI;
  const camera=new THREE.PerspectiveCamera(66,16/9,.05,6000),cam=new PupCamera(camera),input={consumeLook:()=>[0,0,0],hit:()=>false};
  for(let i=0;i<60;i++)cam.update(1/60,p,input,ph);
  p.pos.z=-3;cam.update(1/60,p,input,ph);
  assert.ok(camera.position.distanceTo(p.pos)<3);
  assert.equal(ph.sweepSphere(p.pos.clone().add(V(0,.34,0)),camera.position,.17),1);
});
test('the final cinematic blend and return to the dog stay outside buildings',()=>{
  const ph=new Physics(); ph.addBox('house',0,1.5,2,.5,0,5);
  const {p}=player(ph);p.pos.set(0,0,-2);p.heading=Math.PI;
  const camera=new THREE.PerspectiveCamera(66,16/9,.05,6000),cam=new PupCamera(camera),input={consumeLook:()=>[0,0,0],hit:()=>false};
  cam.snapBehind(p);
  for(let i=0;i<60;i++)cam.update(1/60,p,input,ph);
  cam.setShot(V(0,2,5),V(0,.3,-2));
  for(let i=0;i<240;i++){const prev=camera.position.clone();cam.update(1/60,p,input,ph);assert.equal(ph.sweepSphere(prev,camera.position,.175),1);}
  cam.clearShot();cam.snapBehind(p);
  for(let i=0;i<300;i++){const prev=camera.position.clone();cam.update(1/60,p,input,ph);assert.equal(ph.sweepSphere(prev,camera.position,.175),1);}
  assert.ok(camera.position.distanceTo(p.pos)<3);
});
test('rotated temples stop the whole pup at the same side as their rendered steps',()=>{
  for(const model of ['pagoda2','pagoda3','nyatapola','shikhara'])for(const ang of [.17,.59,1.2]){
    const ph=new Physics(),size=14,y=0;
    registerLandmark(ph,'temple',{x:0,z:0,size,ang,y,model,meta:meta[model]});
    const rotation=new THREE.Matrix4().makeRotationY(-ang),start=V(0,0,-size).applyMatrix4(rotation),movement=V(0,0,size*2).applyMatrix4(rotation);
    ph.move(start,movement.x,movement.z,PUP.radius,{height:PUP.bodyHeight,heading:Math.PI-ang,halfLength:PUP.bodyHalfLength});
    start.applyMatrix4(rotation.clone().invert());
    assert.ok(start.z < -size*.5-PUP.radius+.01,`${model}, angle ${ang}, stopped at ${start.z}`);
    const corner=V(size*.48,0,size*.48).applyMatrix4(rotation);
    assert.ok(ph.heightAt(corner.x,corner.z)>0);
  }
});
test('the Krishna Mandir side segments and bell arch match their actual widths',()=>{
  const ph=new Physics(); registerLandmark(ph,'temple',{x:0,z:0,size:10,ang:0,y:0,model:'shikhara',meta:meta.shikhara});
  assert.equal(ph.solidAt(2.9,1.2,0),true);
  const bell=new Physics();registerLandmark(bell,'bell',{x:0,z:0,size:4,ang:.4,y:0,model:'bell',meta:meta.bell});
  assert.equal(bell.solidAt(0,.8,0),false);
});
test('a stupa dome narrows with height, leaving empty air beside its spire collision-free',()=>{
  const ph=new Physics();registerLandmark(ph,'stupa',{x:0,z:0,size:10,ang:0,y:0,model:'stupa_boudha',meta:meta.stupa_boudha,peak:8});
  assert.equal(ph.solidAt(2.8,1,0),true);
  assert.equal(ph.solidAt(2.8,5,0),false);
  assert.equal(ph.sweepSphere(V(2.8,5,-4),V(2.8,5,4),.18),1);
});
test('unloading a landmark removes roof-camera proxies as well as its physical steps',()=>{
  const ph=new Physics();ph.addOccluder('tile/lm',rect(0,0,2,2,.4),5,2);
  assert.ok(ph.rayFrac(V(-4,3,0),V(4,3,0))<1);
  ph.removeOwner('tile/lm');assert.equal(ph.rayFrac(V(-4,3,0),V(4,3,0)),1);assert.equal(ph.occluders.size,0);
});
test('rendered ground triangles and contact heights agree on both sides of tile boundaries',()=>{
  const cell=WORLD.tileSize/WORLD.terrain.meshSegments;
  const dem={x0:-300,z0:-300,cell:24,w:40,h:40,k:.1,zero:0,data:Uint16Array.from({length:1600},(_,i)=>500+Math.round(Math.sin(i%40*.8)*20+Math.cos(Math.floor(i/40)*.7)*30))};
  for(const x of [-256.1,-35.2,-.1,.1,111.3,255.9,256.1])for(const z of [-256.1,-3.1,.2,255.8]) {
    const ix=Math.floor(x/cell),iz=Math.floor(z/cell),x0=ix*cell,z0=iz*cell;
    const vertex=(dx,dz)=>V(x0+dx*cell,terrainAt(dem,[],x0+dx*cell,z0+dz*cell),z0+dz*cell);
    const a=vertex(0,0),c=vertex(1,1),q=(x-x0 >= z-z0)?vertex(1,0):vertex(0,1);
    const plane=new THREE.Plane().setFromCoplanarPoints(a,q,c),expected=-(plane.normal.x*x+plane.normal.z*z+plane.constant)/plane.normal.y;
    assert.ok(Math.abs(terrainAt(dem,[],x,z)-expected)<1e-8);
  }
});
test('footings include a low patch halfway along a long building edge',()=>{
  const pts=rect(0,0,15,8,0),height=(x,z)=>2-4*Math.exp(-x*x/9-(z+8)**2/2);
  const corners=Math.min(...pts.map(([x,z])=>height(x,z))),range=footprintRange(pts,height);
  assert.ok(corners-range.low>3.9);
});
test('a jump cannot pass upwards through a stair landing',()=>{
  const ph=new Physics();ph.addPlatformBox('ceiling',0,0,3,3,0,.95,.75);
  const {p,input,tick}=player(ph);p.pos.set(0,0,0);let peak=0,first=true;
  input.hit=(k)=>k==='jump'&&first;input.down=(k)=>k==='jump';input.axis=()=>({x:0,y:0});
  for(let i=0;i<160;i++){tick();first=false;peak=Math.max(peak,p.pos.y);assert.ok(p.pos.y+PUP.bodyHeight<=.7501);}
  assert.ok(peak>.15);assert.equal(p.grounded,true);
});
test('mantles abort safely if a new wall blocks the transfer',()=>{
  const ph=new Physics();ph.addPlatformBox('ledge',0,1,2,.6,0,.45);
  const {p,input,tick}=player(ph);input.walk=false;
  for(let i=0;i<180&&!p.mantle;i++)tick();assert.ok(p.mantle);
  ph.addBox('side',0,.8,.035,1,0,4,0);
  for(let i=0;i<120;i++){tick();assert.equal(inside(p.pos.x,p.pos.z,rect(0,.8,.035,1,0)),false);}
});
test('stair smoothing preserves exact support and stays bounded while the body eases',()=>{
  const ph=new Physics();for(let i=0;i<8;i++)ph.addPlatformBox('steps',0,(i+.5)*.42,1,.21,0,(i+1)*.16);
  const {p,tick}=player(ph);let smoothed=false,previous=p.pos.y,visible=p.pos.y+p.dog.holder.position.y;
  for(let i=0;i<400;i++){
    tick();assert.ok(Math.abs(p.stepOffset)<=PUP.maxStepOffset+.001);
    const nextVisible=p.pos.y+p.dog.holder.position.y;
    if(p.pos.y-previous>.1)assert.ok(nextVisible-visible<.1,'visible body jolted up a full tread');
    previous=p.pos.y;visible=nextVisible;
    if(p.grounded)assert.ok(Math.abs(p.pos.y-ph.groundAt(p.pos.x,p.pos.z,p.pos.y))<1e-8);
    smoothed ||= p.stepOffset<-.01;
  }
  assert.ok(smoothed);assert.ok(p.pos.z>3.3);
});
