/** Real-game art review helpers: clear-space cast portraits and rendered-pixel readability measurements. */
import * as THREE from 'three';
import { Stray } from '../src/entities/npc/Stray.js';
import { Person } from '../src/entities/npc/Person.js';
import { rng } from '../src/core/rng.js';

function gallerySpot(app) {
  const ph=app.world.physics,p=app.pup.pos;
  for(let radius=0;radius<=100;radius+=3)for(let i=0;i<24;i++){
    const x=p.x+Math.sin(i/24*Math.PI*2)*radius,z=p.z+Math.cos(i/24*Math.PI*2)*radius,y=app.world.terrain(x,z);
    if(app.world.waterAt(x,z)!==null || Math.abs(ph.heightAt(x,z)-y)>.05)continue;
    if(!ph.isBoxFree({x,z,y,heading:0,halfWidth:3.3,halfLength:4.5,height:3},.05))continue;
    const heights=[[-3,-4.5],[3,-4.5],[-3,4.5],[3,4.5]].map(([dx,dz])=>app.world.terrain(x+dx,z+dz));
    if(Math.max(...heights,y)-Math.min(...heights,y)>.45)continue;
    return new THREE.Vector3(x,y,z);
  }
  throw Error('No clear plaza for cast portraits');
}

export function view(app,position,look) {
  if(app.world.physics.sweepSphere(position,position,.18)<1)throw Error('Portrait camera is obstructed');
  app.cam.setShot(position,look);app.cam.shotK=1;app.cam.travel.reset(position,look);
  app.cam.lookPoint.copy(look);app.cam.lookInit=true;app.camera.position.copy(position);app.camera.lookAt(look);
  app.hud.update(.016,{pup:app.pup,weather:app.world.weather,renderer:app.renderer,world:app.world,camera:app.camera,waypoint:app.waypoint,pins:app.pins,time:app.time});
}

export async function stageDogs(app) {
  const centre=gallerySpot(app);app.__artCentre=centre;app.__artDogs=[];
  app.state='paused';app.world.weather.hour=21;app.world.weather.set('sunny',true);
  app.world.update(.016,app.pup.pos,app.camera,app.time);
  for(const[i,breed]of['village','bhote','spitz'].entries()){
    const dog=await Stray.create(rng(501+i),{breed,scale:1.25}),x=centre.x+(i-1)*1.05,z=centre.z;
    dog.pos.set(x,app.world.physics.groundAt(x,z,app.world.terrain(x,z)+.2),z);
    dog.heading=dog.root.rotation.y=0;dog.stay('Idle');dog.owned=true;
    for(let k=0;k<90;k++)dog.anim.update(1/60,{speed:0,air:false,y:dog.pos.y,mood:'calm'});
    app.scene.add(dog.root);app.npcs.strays.push(dog);app.__artDogs.push(dog);
  }
  view(app,centre.clone().add(new THREE.Vector3(1.6,.85,3.7)),centre.clone().add(new THREE.Vector3(0,.34,0)));
  return app.__artDogs.map(d=>d.breed);
}

export function stagePeople(app) {
  const centre=app.__artCentre;
  for(const dog of app.__artDogs){app.scene.remove(dog.root);app.npcs.strays.splice(app.npcs.strays.indexOf(dog),1);}
  for(const[i,role]of['police','devotee','shopkeeper','elder'].entries()){
    const person=new Person(app.npcs.personGltf,rng(600+i),{role,mood:'neutral',nearStupa:true}),x=centre.x+(i-1.5)*1.05,z=centre.z;
    person.standAt(x,z,0);person.pos.y=app.world.physics.groundAt(x,z,app.world.terrain(x,z)+.2);
    person.state='idle';person.stateT=person.cool=person.lineT=1e9;person.mode='stand';person.mixer.update(1);
    app.scene.add(person.root);app.npcs.people.push(person);
  }
  view(app,centre.clone().add(new THREE.Vector3(1,1.45,4.4)),centre.clone().add(new THREE.Vector3(0,.85,0)));
  return 'Nepali street cast';
}

/** Compare the actual hero silhouette with the scenery behind it, in linear luminance after the real post pass. */
export function measureHero(app) {
  const R=app.renderer,r=R.renderer,gl=r.getContext(),size=r.getDrawingBufferSize(new THREE.Vector2()),root=app.pup.root;
  const read=()=>{const p=new Uint8Array(size.x*size.y*4);gl.readPixels(0,0,size.x,size.y,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const visible=root.visible,blob=app.pup.dog.blob.visible,override=app.scene.overrideMaterial,background=app.scene.background,layers=app.camera.layers.mask,changed=[];
  const clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),white=new THREE.MeshBasicMaterial({color:0xffffff,fog:false});
  let withDog,withoutDog,mask;
  try{
    root.visible=true;R.render(app.scene);withDog=read();root.visible=false;R.render(app.scene);withoutDog=read();root.visible=true;
    root.traverse(o=>{if(o.isMesh){changed.push([o,o.layers.mask]);o.layers.enable(31);}});
    app.pup.dog.blob.visible=false;app.camera.layers.set(31);app.scene.overrideMaterial=white;app.scene.background=new THREE.Color(0);
    r.setRenderTarget(null);r.setClearColor(0,1);r.render(app.scene,app.camera);mask=read();
  }finally{
    root.visible=visible;app.pup.dog.blob.visible=blob;app.scene.overrideMaterial=override;app.scene.background=background;app.camera.layers.mask=layers;
    for(const[o,m]of changed)o.layers.mask=m;
    r.setClearColor(clear,alpha);white.dispose();R.render(app.scene);
  }
  const linear=n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
  let hero=0,back=0,red=0,blue=0,count=0;
  for(let i=0;i<mask.length;i+=4)if(mask[i]>200&&mask[i+1]>200&&mask[i+2]>200){
    const l=p=>.2126*linear(p[i])+.7152*linear(p[i+1])+.0722*linear(p[i+2]);
    hero+=l(withDog);back+=l(withoutDog);red+=withDog[i];blue+=withDog[i+2];count++;
  }
  if(count<200)throw Error('Hero silhouette too small for readability review');
  hero/=count;back/=count;
  // A warm dark coat on light paving is as valid as a light coat against a dark street.
  return {pixels:count,heroLuminance:hero,backgroundLuminance:back,contrast:(Math.max(hero,back)+.05)/(Math.min(hero,back)+.05),polarity:hero>back?'lighter':'darker',warmth:red/Math.max(1,blue)};
}
