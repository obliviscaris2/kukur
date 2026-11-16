/** Rendering/performance regressions that exercise real spatial batches, moving colliders, lamps and exported temple treads. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Physics } from '../src/world/physics.js';
import { spatialGeometry } from '../src/render/spatialGeometry.js';
import { Atmosphere } from '../src/world/effects/Atmosphere.js';
import { Neon } from '../src/world/effects/Neon.js';
import { ridgeGeometry } from '../src/world/sky/ridgeGeometry.js';
import { viewportScale } from '../src/render/Renderer.js';
import { MYTHIC } from '../src/config/index.js';

test('large and ultrawide windows can reach the same minimum pixel budget as 720p', () => {
  const referencePixels=768*432;
  for(const [w,h] of [[1280,720],[1920,1080],[3440,1440],[3840,2160]]) {
    const scale=.6*viewportScale(w,h);
    assert.ok(Math.abs(w*h*scale*scale-referencePixels)<.001);
  }
  assert.equal(viewportScale(800,600),1,'small windows do not lose further resolution');
  assert.ok(Number.isFinite(viewportScale(0,0)),'a temporarily empty viewport stays finite');
});

test('moving-body lookup preserves collision and vehicle clearance across positive and negative cell borders', () => {
  const bodies=[];
  for(let x=-24;x<=24;x+=8)for(let z=-24;z<=24;z+=8){
    bodies.push({x:x-.1,y:0,z:z+.1,radius:.4,height:1,blocksTraffic:true});
    bodies.push({x:x+3,y:0,z:z+4,halfWidth:.5,halfLength:1.2,heading:.6,height:1.5,blocksTraffic:true});
  }
  const linear=new Physics(),indexed=new Physics();
  linear.bodies.push(()=>bodies);indexed.bodies.push(()=>bodies);indexed.refreshBodies();
  for(const b of bodies)for(const dx of [-1,-.3,0,.3,1]){
    const a={x:b.x+dx,y:0,z:b.z+.1},c={...a};
    assert.equal(indexed.collide(a,.25,.4,.18),linear.collide(c,.25,.4,.18));
    assert.ok(Math.hypot(a.x-c.x,a.z-c.z)<1e-7);
    const box={x:b.x+dx,y:0,z:b.z,halfWidth:.4,halfLength:.7,heading:.3,height:1};
    assert.equal(indexed.isBoxFree(box),linear.isBoxFree(box));
  }
});

test('moving-body cells cover within-frame motion and refresh after teleport, removal or spawn',()=>{
  const p=new Physics(),body={x:7.8,y:0,z:0,radius:.3,height:1};let bodies=[body];p.bodies.push(()=>bodies);p.refreshBodies();
  body.x+=1.1;assert.equal(p.collide({x:9,y:0,z:0},.3,.4),true);
  body.disabled=true;assert.equal(p.collide({x:9,y:0,z:0},.3,.4),false);
  body.disabled=false;body.x=100;p.refreshBodies();
  assert.equal(p.collide({x:100.1,y:0,z:0},.3,.4),true);
  bodies=[];p.refreshBodies();assert.equal(p.collide({x:100.1,y:0,z:0},.3,.4),false);
  bodies=[{x:-100,y:0,z:-100,radius:.5,height:1}];p.refreshBodies();
  assert.equal(p.collide({x:-100.1,y:0,z:-100},.3,.4),true);
});

test('far moving bodies are excluded from nearby narrow-phase checks',()=>{
  const p=new Physics(),bodies=Array.from({length:2000},(_,i)=>({x:i*5,y:0,z:0,radius:.3,height:1}));
  p.bodies.push(()=>bodies);p.refreshBodies();
  const nearby=[...p.nearBodies(0,0,.5)];assert.ok(nearby.includes(bodies[0]));assert.ok(nearby.length<5);
});

test('spatial batches retain every triangle exactly once and only bound their own referenced vertices',()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-129,0,-1,-127,0,-1,-128,2,1, 30,0,40,32,0,40,31,2,41, 300,0,200,301,0,200,300,2,201],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(18),2));g.setIndex([0,1,2,3,4,5,6,7,8]);
  const parts=spatialGeometry(g,128),seen=[];
  assert.equal(parts.length,3);
  for(const p of parts){
    assert.equal(p.attributes.position,g.attributes.position);assert.equal(p.attributes.uv,g.attributes.uv);
    assert.ok(p.boundingBox.getSize(new THREE.Vector3()).x<=2);
    for(const i of p.index.array){seen.push(i);assert.ok(p.boundingBox.containsPoint(new THREE.Vector3().fromBufferAttribute(g.attributes.position,i)));}
  }
  assert.deepEqual(seen.sort((a,b)=>a-b),[0,1,2,3,4,5,6,7,8]);
});

test('atmosphere stays bounded and cannot remain inside walls or after unloading its sources',()=>{
  const scene=new THREE.Scene(),a=new Atmosphere(scene),camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld();
  const trees=Array.from({length:20},(_,i)=>[i,3,0,2,1]);
  const ctx={focus:new THREE.Vector3(),camera,props:{treesNear:()=>trees},lights:[],heightAt:()=>3,solidAt:()=>false};
  a.update(1,ctx);assert.ok(a.mesh.count>0&&a.mesh.count<=MYTHIC.atmosphere.mistCount);assert.equal(scene.children.length,1);
  for(const n of a.mesh.instanceMatrix.array)assert.ok(Number.isFinite(n));
  ctx.solidAt=()=>true;a.update(1,ctx);assert.equal(a.mesh.count,0);assert.equal(a.mesh.visible,false);
  ctx.solidAt=()=>false;ctx.props.treesNear=()=>[];a.update(1,ctx);assert.equal(a.mesh.count,0);
});

test('distant ridges are a finite bounded single mesh, including the joined azimuth seam',()=>{
  const g=ridgeGeometry();assert.ok(g.index.count/3<15000);
  for(const a of Object.values(g.attributes))for(const n of a.array)assert.ok(Number.isFinite(n));
  assert.ok(g.boundingSphere.radius<3000);
});

test('street light candidates have finite power and radius, and disappear when their tile unloads',()=>{
  let onTile;
  const n=new Neon(new THREE.Scene(),{heightAt:()=>7,onTile(fn){onTile=fn;}});
  const tile={key:'0_0',tx:0,tz:0,data:{density:1,core:1,navs:[{w:6,pts:[-30,0,30,0]}]}};
  onTile('load',tile);n.update(1,new THREE.Vector3(0,7,0));assert.ok(n.lights.length>0);
  for(const l of n.lights){assert.ok(Number.isFinite(l.radius+l.power));assert.ok(l.radius>0&&l.power>0);}
  onTile('unload',tile);n.update(1,new THREE.Vector3(0,7,0));assert.equal(n.lights.length,0);assert.equal(n.bulbs.count,0);
});

const meta=JSON.parse(readFileSync('assets/models/temples/meta.json','utf8'));
for(const name of ['pagoda2','nyatapola','pashupati_gold']){
  const data=readFileSync(`assets/models/temples/${name}.glb`);
  const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  test(`${name}: stone treads cover brick with no coplanar competing faces`,()=>{
    const m=meta[name],cast=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
    for(let step=0;step<m.steps;step++){
      const h=(step+1)*m.step_h,edge=.5-step*m.inset,x=edge-m.inset*.4;
      cast.set(new THREE.Vector3(x,h+.001,.017),down);
      const hits=cast.intersectObject(gltf.scene,true).filter(hit=>hit.point.y>h-m.step_h*.5);
      assert.ok(hits.length>0,`No visible tread at step ${step}`);
      assert.equal(hits[0].object.material.name,'Stone');
      const brick=hits.find(hit=>hit.object.material.name==='Brick');
      if(brick)assert.ok(hits[0].point.y-brick.point.y>m.step_h*.1,'Brick and stone share the same depth');
      assert.ok(Math.abs(hits[0].point.y-h)<.0003,'Collision step height changed');
    }
  });
}
