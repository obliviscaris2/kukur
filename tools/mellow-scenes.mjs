/** Real-game close face and flowering-tree captures for the mellow lighting / nose regression review. */
import * as THREE from 'three';
import { stageDogs, view } from './art-scenes.mjs';

export async function face(app,breed='village',closed=false){
  if(!app.__artDogs)await stageDogs(app);
  const actor=app.__artDogs.find(d=>d.breed===breed);app.__face=actor;
  for(const d of app.__artDogs)d.root.visible=d===actor;
  app.pup.root.visible=false;app.state='paused';app.world.weather.hour=9;app.world.weather.set('sunny',true);
  for(let i=0;i<60;i++)actor.anim.update(1/60,{speed:0,air:false,y:actor.pos.y,mood:'calm',panting:.5});
  actor.dog.blink();actor.dog.update(closed?.064:.16);
  app.scene.updateMatrixWorld(true);
  const head=actor.headPos(),look=head.clone().add(new THREE.Vector3(0,-.03,.07));
  const pos=head.clone().add(new THREE.Vector3(.58,.1,1.2));
  if(app.world.physics.sweepSphere(pos,pos,.1)<1)throw Error('Face camera blocked');
  app.world.update(.016,actor.pos,app.camera,app.time);view(app,pos,look);app.renderer.render(app.scene);
  return {breed,eyeOpen:actor.dog.eyeOpen,ink:!!actor.outline};
}

export async function blossoms(app,place='Patan Durbar Square, Lalitpur'){
  app.state='play';app.pup.root.visible=true;app.pup.control=false;app.storyCalm=true;
  if(app.__artDogs)for(const d of app.__artDogs)d.root.visible=false;
  const start=Object.keys(app.world.starts).find(n=>n===place)||Object.keys(app.world.starts).find(n=>n.startsWith(place));
  await app.placeAt(start||place);
  const trees=app.world.props.nearbyTrees(2,app.pup.pos,180,40).sort((a,b)=>Math.hypot(a[0]-app.pup.pos.x,a[2]-app.pup.pos.z)-Math.hypot(b[0]-app.pup.pos.x,b[2]-app.pup.pos.z));
  let found=false;
  for(const tree of trees){
    for(let i=0;i<16;i++){
      const theta=i/16*Math.PI*2,x=tree[0]+Math.sin(theta)*3,z=tree[2]+Math.cos(theta)*3,y=app.world.terrain(x,z);
      if(!app.world.physics.isBoxFree({x,z,y,heading:theta,halfWidth:.5,halfLength:.7,height:.7},.1)||app.world.waterAt(x,z)!==null)continue;
      app.pup.placeAt(x,z,Math.atan2(tree[0]-x,tree[2]-z),app.world);found=true;break;
    }
    if(found)break;
  }
  app.world.weather.hour=16.3;app.world.weather.set('sunny',true);app.world.weather._petalT=0;
  app.pup.cancelPose();app.pup.idle=0;app.pup.control=false;app.cam.clearShot();app.cam.snapBehind(app.pup);
  app.world.update(.016,app.pup.pos,app.camera,app.time);
  return {place,floweringTree:found,sources:app.world.weather.petals.sources.length,count:app.world.weather.petals.mesh.count};
}

export function petalStats(app){
  const p=app.world.weather.petals,v=new THREE.Vector3();let visible=0,blocked=0,onScreen=0;
  for(let i=0;i<p.mesh.count;i++)if(p.fade.getX(i)>.05){
    visible++;const q=p.p[i].pos;if(app.world.physics.solidAt(q.x,q.y,q.z))blocked++;
    v.copy(q).project(app.camera);if(Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z>-1&&v.z<1)onScreen++;
  }
  if(blocked)throw Error('Visible blossom inside a building');
  return {count:p.mesh.count,visible,onScreen,capacity:p.capacity,sources:p.sources.length,blocked};
}
