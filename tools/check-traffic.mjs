/** Deterministic regressions for connected lanes, smooth turns, solid traffic, rider merging and live render registries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoadNetwork, lanePoint, makeTurn, sampleCurve } from '../src/entities/traffic/RoadNetwork.js';
import { Traffic } from '../src/entities/traffic/Traffic.js';
import { vehicleModels } from '../src/entities/traffic/VehicleModels.js';
import { Physics } from '../src/world/physics.js';
import { boxOverlap } from '../src/core/collision.js';
import { TRAFFIC } from '../src/config/index.js';
import { StreetActivities } from '../src/entities/npc/StreetActivities.js';
import { Breakables } from '../src/gameplay/Breakables.js';
import { events } from '../src/core/events.js';

const road=(pts,w=10,oneway=0)=>({pts,w,oneway,kind:'residential',tile:'0_0'});
function setup(navs) {
  const callbacks=[],physics=new Physics(),world={physics,terrain:()=>0,heightAt:(x,z)=>physics.heightAt(x,z),onTile:fn=>callbacks.push(fn)};
  const traffic=new Traffic(new THREE.Scene(),world,{npc:'low'},null);traffic.max=0;
  callbacks.forEach(fn=>fn('load',{key:'0_0',data:{navs}}));
  const pup={pos:new THREE.Vector3(45,0,45),grounded:true,speed:0,impact:{active:false},heading:0};traffic.update(0,pup);
  const car=(edge,s,type='car',speed=5)=>({id:traffic.cars.length+1,edge,s,type,...lanePoint(edge,s,type),y:.035,speed,max:6,color:new THREE.Color('#ddd8ca'),pause:0,hitCooldown:0,bob:0,stoppedFor:0,waiting:false});
  return {traffic,physics,world,pup,car,tick:(dt=.05,people=[],signals=[])=>traffic.update(dt,pup,null,people,signals)};
}

test('internal OSM vertices connect junctions, not just the ends of a whole road',()=>{
  const network=new RoadNetwork();network.rebuild([road([0,0,0,20,0,40]),road([-20,20,0,20,20,20])]);
  const junction=network.nodes.find(n=>n.x===0&&n.z===20);assert.equal(junction.out.length,4);
});
test('one-way and pedestrian restrictions survive graph construction',()=>{
  const network=new RoadNetwork();network.rebuild([road([0,0,0,20],8,1),{...road([0,20,20,20],5),kind:'pedestrian'}]);
  assert.equal(network.edges.filter(e=>e.from.z===20&&e.to.z===0).length,0);
  const lane=network.edges.find(e=>e.kind==='pedestrian');assert.equal(network.accepts(lane,'car'),false);assert.equal(network.accepts(lane,'motorbike'),true);
});
test('lane curves are sampled by distance and join both roads continuously',()=>{
  const network=new RoadNetwork();network.rebuild([road([0,0,0,30]),road([0,30,30,30])]);
  const edge=network.edges.find(e=>e.from.z===0),next=network.next(edge,'car',()=>0),curve=makeTurn(edge,next,'car');
  const start=sampleCurve(curve,0),end=sampleCurve(curve,curve.length),expected=lanePoint(next,curve.exit,'car');
  assert.ok(Math.hypot(end.x-expected.x,end.z-expected.z)<1e-6);assert.ok(Math.hypot(start.x-lanePoint(edge,curve.start,'car').x,start.z-lanePoint(edge,curve.start,'car').z)<1e-6);
  let previous=start;for(let d=.1;d<curve.length;d+=.1){const p=sampleCurve(curve,d);assert.ok(Math.hypot(p.x-previous.x,p.z-previous.z)<.12);previous=p;}
});
test('a car advances visibly on every frame inside a long road segment',()=>{
  const {traffic,car,tick}=setup([road([0,0,0,100])]),edge=traffic.network.edges.find(e=>e.from.z===0),c=car(edge,20);traffic.cars.push(c);
  let previous=c.z;for(let i=0;i<20;i++){tick();assert.ok(c.z>previous);assert.ok(c.z-previous<.4);previous=c.z;}
  assert.ok(c.z>24);
});
test('turns preserve finite motion without sliding across a junction',()=>{
  const {traffic,car,tick}=setup([road([0,0,0,60]),road([0,60,60,60]),road([60,60,60,0]),road([60,0,0,0])]);
  const c=car(traffic.network.edges.find(e=>e.from.x===0&&e.from.z===0&&e.to.z===60),52);traffic.cars.push(c);
  let turned=false;
  for(let i=0;i<240;i++){const x=c.x,z=c.z;tick();assert.ok(Number.isFinite(c.x+c.z+c.heading));assert.ok(Math.hypot(c.x-x,c.z-z)<.65);turned ||= !!c.turn;}
  assert.ok(turned);assert.ok(c.x>10);
});
test('bumper spacing prevents following vehicles from overlapping',()=>{
  const {traffic,car,tick}=setup([road([0,0,0,120])]),edge=traffic.network.edges.find(e=>e.from.z===0),front=car(edge,35,'taxi',2);traffic.cars.push(front);const rear=car(edge,26,'car',6);traffic.cars.push(rear);
  for(let i=0;i<160;i++){tick();assert.equal(boxOverlap({x:front.x,z:front.z,heading:front.heading,halfWidth:.75,halfLength:1.75},{x:rear.x,z:rear.z,heading:rear.heading,halfWidth:.86,halfLength:2.025}),null);}
  assert.ok(rear.z>30);
});
test('static obstacles stop the complete car footprint without moving its route through a wall',()=>{
  const {traffic,physics,car,tick}=setup([road([0,0,0,100])]),edge=traffic.network.edges.find(e=>e.from.z===0),c=car(edge,20);traffic.cars.push(c);physics.addBox('wall',0,32,8,.04,0,4);
  for(let i=0;i<160;i++){tick();assert.ok(c.z+TRAFFIC.bodies.car[0]/2<32.01);assert.equal(physics.isBoxFree({x:c.x,z:c.z,y:.035,heading:c.heading,halfWidth:.86,halfLength:2.025,height:1.43}),true);}
});
test('a curbside rider merges gradually and becomes moving traffic',()=>{
  const {traffic,car,tick}=setup([road([0,0,0,100],8)]),edge=traffic.network.edges.find(e=>e.from.z===0),c=car(edge,20,'pathao',0);Object.assign(c,lanePoint(edge,20,'pathao',3.9),{waiting:true,waitT:0});traffic.cars.push(c);
  for(let i=0;i<120;i++){const x=c.x,z=c.z;tick();assert.ok(Math.hypot(c.x-x,c.z-z)<.65);}
  assert.equal(c.waiting,false);assert.ok(c.z>27);
});
test('an officer crossing hold stops an approaching car before the junction',()=>{
  const {traffic,car,tick}=setup([road([0,0,0,100])]),edge=traffic.network.edges.find(e=>e.from.z===0),c=car(edge,20,'car',6);traffic.cars.push(c);
  const signal={x:0,z:40,radius:12,axis:'ns',hold:true};for(let i=0;i<120;i++)tick(.05,[],[signal]);
  assert.ok(c.z<32);assert.ok(c.speed<.1);
});
test('each live vehicle has matching visible paint and trim instances, and clear removes both',()=>{
  const {traffic,car,tick}=setup([road([0,0,0,100])]),edge=traffic.network.edges.find(e=>e.from.z===0);traffic.cars.push(car(edge,20,'motorbike'));tick();
  assert.equal(traffic.stats.rendered,traffic.cars.length);for(const t of Object.values(traffic.types))assert.equal(t.paint.count,t.trim.count);
  traffic.clear();assert.equal(traffic.stats.rendered,0);assert.equal(traffic.colliders.length,0);assert.ok(Object.values(traffic.types).every(t=>!t.paint.visible&&!t.trim.visible));
});
test('bike and rider silhouettes stay substantially narrower and shorter than a car',()=>{
  const models=vehicleModels(),bounds=type=>{models[type].forEach(g=>g.computeBoundingBox());return models[type][0].boundingBox.clone().union(models[type][1].boundingBox);};
  const bike=bounds('motorbike').getSize(new THREE.Vector3()),car=bounds('car').getSize(new THREE.Vector3());assert.ok(bike.x<car.x*.5);assert.ok(bike.z<car.z*.55);assert.ok(bike.y<1.7);
});
test('an actor ignores its own solid body while still colliding with other actors',()=>{
  const physics=new Physics(),owner={},b={owner,x:0,y:0,z:0,radius:.2,height:1.7};physics.bodies.push(()=>[b]);
  const p={x:0,y:0,z:0};assert.equal(physics.collide(p,.2,1.7,0,owner),false);assert.equal(physics.collide(p,.2,1.7),true);
});

test('cars cross OSM segments shorter than their own body instead of queueing forever',()=>{
  const nav=road([0,0,0,20,0,21,0,23,0,24,0,50,0,100]);
  const {traffic,car,tick}=setup([nav]),c=car(traffic.network.edges.find(e=>e.from.z===0),15);traffic.cars.push(c);
  for(let i=0;i<240;i++)tick();
  assert.ok(c.z>40,`Car stalled at ${c.z}`);
});
test('bad dynamic body descriptors cannot poison player positions',()=>{
  const physics=new Physics();physics.bodies.push(()=>[new THREE.Mesh(),{x:0,y:0,z:0,halfWidth:1,halfLength:2,height:2}]);
  const p={x:0,y:0,z:0};physics.move(p,1,0,.2,{height:.4});assert.ok(Math.abs(p.x-1)<1e-9);assert.equal(p.y,0);assert.equal(p.z,0);
});
function streetFixture(){
  const people=[],physics=new Physics(),callbacks=[];
  const world={physics,heightAt:()=>0,onTile:fn=>callbacks.push(fn)};
  const spawn=role=>{const p={role,id:people.length+1,pos:new THREE.Vector3(),heading:0,standAt(x,z,h){this.pos.set(x,0,z);this.heading=h;}};people.push(p);return p;};
  const street=new StreetActivities({world,quality:{npc:'low'},people:()=>people,navs:()=>[],spawn,say:()=>{}}),pup={pos:new THREE.Vector3(),setMood(){}};
  return {street,people,physics,callbacks,pup};
}
test('an officer finds an alternate curb position when the first corner is blocked',()=>{
  const {street,people,physics,pup}=streetFixture();
  physics.addBox('corner',23.76,4.5,1,1,0,3);
  street.junctions=[{x:20,z:0,tile:'0_0',arms:[[0,'',8],[Math.PI/2,'',8],[Math.PI,'',8]]}];
  street.update(.6,pup);const p=people.find(p=>p.role==='police');assert.ok(p);assert.ok(physics.isFree(p.pos.x,p.pos.z,.18));
  pup.pos.copy(p.pos);assert.match(street.interact(pup),/holds the traffic/);assert.equal(p.signal.hold,true);
  street.update(7,pup);assert.equal(p.signal.hold,false);
});
test('shopkeepers greet from the recess, give one treat, and respect the gift cooldown',()=>{
  const {street,people,callbacks,pup}=streetFixture();
  callbacks.forEach(fn=>fn('load',{key:'0_0',data:{shops:[{id:'shop',x:20,z:0,y:0,heading:0,entryX:20,entryZ:1.5}],signs:[]}}));
  let gifts=0;const off=events.on('streetTreat',()=>gifts++);
  try{street.update(.6,pup);const p=people.find(p=>p.role==='shopkeeper');assert.ok(p);pup.pos.set(20,0,1.5);assert.match(street.interact(pup),/biscuit/);street.interact(pup);assert.equal(gifts,1);}finally{off();}
});
test('schoolkid chase begins on their route and tagging restores the walking speed',()=>{
  const {street,people,pup}=streetFixture(),kid={id:1,role:'kid',pos:new THREE.Vector3(0,0,1),mode:'walk',nav:road([0,0,0,30]),walkSpeed:1};people.push(kid);
  let tags=0;const off=events.on('playChase',()=>tags++);
  try{street.interact(pup);assert.ok(kid.playSession);assert.ok(kid.walkSpeed>2);street.update(2.1,pup);assert.equal(tags,1);assert.equal(kid.playSession,null);assert.equal(kid.walkSpeed,1);}finally{off();}
});

test('a vehicle hits a solid movable bin, deflects it, and continues along its lane',()=>{
  const {traffic,physics,world,car,tick,pup}=setup([road([0,0,0,100])]);
  const c=car(traffic.network.edges.find(e=>e.from.z===0),20);traffic.cars.push(c);
  const clutter=new Breakables(traffic.scene,world,null,null),bin={id:'bin',kind:'bin',x:c.x,y:0,z:28,home:[c.x,28],rot:0,tilt:0,tiltDir:0,vx:0,vy:0,vz:0,spin:0,state:'idle',radius:.275,height:.75,blocksTraffic:true};
  clutter.byTile.set('test',[bin]);clutter.update(0,pup);
  assert.equal(physics.isBoxFree({x:bin.x,y:0,z:28,heading:0,halfWidth:.86,halfLength:2,height:1.43}),false);
  const off=events.on('trafficBrush',e=>clutter.knock(e.pos,e.dx,e.dz,e.power,e.reach,true));
  try{for(let i=0;i<220;i++){tick();clutter.update(.05,pup);}assert.ok(Math.abs(bin.x-c.x)>.8,JSON.stringify({car:c.z,speed:c.speed,bin:[bin.x,bin.z],state:bin.state}));assert.ok(c.z>35,`Vehicle stopped at ${c.z}`);}finally{off();}
});
