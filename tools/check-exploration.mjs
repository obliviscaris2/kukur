/** Actual mesh/collider agreement, animation stability, pooled junkiris and streaming ownership regressions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Physics } from '../src/world/physics.js';
import { stoneGeometry,logGeometry,soilGeometry,registerStone,registerLog } from '../src/world/props/explorationGeometry.js';
import { spring } from '../src/core/spring.js';
import { DogAnimator } from '../src/entities/dog/DogAnimator.js';
import { Motes } from '../src/world/effects/Motes.js';
import { EXPLORATION as C, PUP, NATURE } from '../src/config/index.js';
import { WORLD } from '../src/config/index.js';
import { terrainAt } from '../src/world/terrain.js';
import { terrainPieces } from '../src/world/tiles/drape.js';

test('paving clips to the same rolling ground triangles as paw contact, including negative coordinates',()=>{
  const dem={x0:-300,z0:-300,cell:20,w:40,h:40,k:1,zero:100,data:new Uint16Array(1600).fill(100)},cell=WORLD.tileSize/WORLD.terrain.meshSegments;
  const ground=(x,z)=>terrainAt(dem,[],x,z),heights=[];
  for(let z=-100;z<=100;z+=cell)for(let x=-100;x<=100;x+=cell)heights.push(ground(x,z));
  assert.ok(Math.max(...heights)-Math.min(...heights)>.3,'flat DEM receives gentle earth relief');
  for(const p of [[[-27,-18],[18,-21],[15,31]],[[-2,-3],[42,-9],[29,16],[-3,12]]]){
    const pieces=terrainPieces(p,cell);assert.ok(pieces.length>2);
    for(const piece of pieces)for(let i=1;i<piece.length-1;i++){
      const [a,b,c]=[piece[0],piece[i],piece[i+1]],x=(a[0]+b[0]+c[0])/3,z=(a[1]+b[1]+c[1])/3;
      const rendered=(ground(...a)+ground(...b)+ground(...c))/3;
      assert.ok(Math.abs(rendered-ground(x,z))<1e-9,'an overlay must not bridge a dip in the ground');
    }
  }
  const bed=soilGeometry([{x:-22.4,z:18.2,angle:1.4}],ground),positions=bed.attributes.position;
  for(let i=0;i<positions.count;i+=3){
    const x=(positions.getX(i)+positions.getX(i+1)+positions.getX(i+2))/3,z=(positions.getZ(i)+positions.getZ(i+1)+positions.getZ(i+2))/3;
    const y=(positions.getY(i)+positions.getY(i+1)+positions.getY(i+2))/3;
    assert.ok(Math.abs(y-ground(x,z)-C.soilLift)<1e-5);assert.ok(bed.attributes.normal.getY(i)>.95,'soil bed faces the sky');
  }
});

test('secondary springs give the same pose at 30/60/144 Hz and remain bounded through a stalled frame',()=>{
  const result=[];
  for(const rate of [30,60,144]){
    const s={a:0,v:0};for(let i=0;i<rate;i++)spring(s,-.3,9,1/rate);result.push(s.a);
    spring(s,.2,9,.4);assert.ok(s.a>-.3&&s.a<.2);assert.ok(Number.isFinite(s.v));
  }
  assert.ok(Math.max(...result)-Math.min(...result)<1e-12);
});

test('stone and rotated log collision tops follow their actual rendered meshes',()=>{
  for(const kind of ['stone','log'])for(const angle of [0,.73,2.1]){
    const ph=new Physics(),p={x:3,y:.7,z:-2},owner='test',r=C.stepRadius,h=.65;
    const mesh=new THREE.Mesh(kind==='stone'?stoneGeometry():logGeometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    mesh.position.set(p.x,p.y,p.z);mesh.rotation.y=angle;
    if(kind==='stone'){mesh.scale.set(r,h,r);registerStone(ph,owner,p,r,h);}else registerLog(ph,owner,p,angle);
    mesh.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(),point=new THREE.Vector3(),down=new THREE.Vector3(0,-1,0);
    for(let x=-.45;x<=.45;x+=.09)for(let z=-.17;z<=.17;z+=.085){
      point.set(x,3,z).applyAxisAngle(new THREE.Vector3(0,1,0),angle).add(mesh.position);ray.set(point,down);
      const hit=ray.intersectObject(mesh)[0];if(!hit)continue;
      const top=ph.groundAt(point.x,point.z,4);
      assert.ok(Math.abs(hit.point.y-top)<.065,`${kind}: visible ${hit.point.y}, physical ${top}`);
    }
    assert.ok(ph.solidAt(p.x,p.y+.25,p.z));
    ph.removeOwner(owner);assert.equal(ph.groundAt(p.x,p.z,4),0);
  }
});

test('regenerated local dog rigs survive fast travel and sparse updates without ear or spine explosions',async()=>{
  for(const name of ['pup','bhote','spitz']){
    const file=readFileSync(new URL(`../assets/models/${name}.glb`,import.meta.url)),g=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
    const bones={};g.scene.traverse(o=>{if(o.isBone)bones[o.name]=o;});
    const holder=new THREE.Group();holder.scale.setScalar(PUP.modelScale);holder.add(g.scene);
    const animator=new DogAnimator({model:g.scene,holder,bones,animations:g.animations});
    for(const hz of [30,60,144,5])for(let i=0;i<50;i++){
      animator.update(1/hz,{speed:i%8<4?5:0,turnRate:i%2?8:-8,y:i<20?100:-30,wind:1,mood:'happy'});
      assert.ok(Math.abs(animator.ear.a)<.8,`${name} ear angle ${animator.ear.a}`);
      assert.ok(Math.abs(animator.body.a)<.12);
      for(const bone of Object.values(bones))assert.ok(bone.quaternion.toArray().every(Number.isFinite));
    }
  }
});

test('junkiris stay pooled, appear by day at discoveries, scatter from the pup and reset after travel',()=>{
  const motes=new Motes(new THREE.Scene()),focus=new THREE.Vector3(),groves=[{x:2,y:0,z:1}],wind={dir:new THREE.Vector2(1,0),strength:.2};
  const ctx={focus,groves,wind,night:0,temples:[],flowering:[],greenery:1,rain:0,heightAt:()=>0,solidAt:()=>false};
  for(let i=0;i<600;i++)motes.update(1/30,ctx);
  assert.ok(motes.count>=C.firefly.dayPerGrove);assert.ok(motes.p.some(p=>p.kind===3&&p.life>0));
  const q=motes.p.find(p=>p.kind===3&&p.life>1);focus.set(q.x+.2,q.y,q.z);const vx=q.vx;
  motes.update(.1,ctx);assert.ok(q.vx<vx,'a nearby firefly flees away from the pup');
  focus.set(500,0,500);motes.update(.5,ctx);motes.update(.5,ctx);
  assert.ok(motes.count<=NATURE.motes.capacity);
  for(let i=0;i<motes.count;i++){assert.ok(Number.isFinite(motes.pos[i*3]));assert.ok(Math.hypot(motes.pos[i*3]-500,motes.pos[i*3+2]-500)<45);}
});
