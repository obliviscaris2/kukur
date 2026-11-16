/** Graphics regressions using shipped canine geometry and the real bounded blossom simulation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Petals } from '../src/world/effects/Petals.js';
import { ART, DOGS } from '../src/config/index.js';

for(const[breed,variant]of Object.entries(DOGS.variants)){
  const b=readFileSync(`assets/models/${variant.model}`);
  const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  let parts,body;gltf.scene.traverse(m=>{if(m.isMesh){if(m.material.name==='Parts')parts=m;else body=m;}});
  test(`${breed}: every nose/mouth vertex stays fixed when the explicit eye mask closes`,()=>{
    const a=parts.geometry.attributes,eyeY=variant.eye[1];let nose=0,eyes=0;
    assert.ok(a._blink,'Rebuild the dogs with the exported eye mask');
    for(let i=0;i<a.position.count;i++){
      const mask=a._blink.getX(i),r=a.color.getX(i),g=a.color.getY(i),b=a.color.getZ(i);
      assert.ok(mask===0||mask===1);
      if(r+g+b<.002)nose++;
      const eye=(r>.0018&&r<.0023&&g<.001&&b<.0002)||Math.abs(r-1)<1e-6;
      assert.equal(mask,eye?1:0,`wrong blink membership at vertex ${i}`);
      const y=a.position.getY(i),closed=y+(eyeY+(y-eyeY)*DOGS.face.closed-y)*mask;
      if(!eye)assert.equal(closed,y,'Blink moved the nose, jaw or tongue');else eyes++;
    }
    assert.ok(nose>=100);assert.ok(eyes>300);
  });
  test(`${breed}: the upper muzzle is attached to the head rather than the opening jaw`,()=>{
    const a=body.geometry.attributes;let points=0;
    for(let i=0;i<a.position.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(a.position,i);
      if(p.z/variant.eye[2]<1.14||p.y/variant.eye[1]<.904||p.y/variant.eye[1]>.953||Math.abs(p.x)/variant.eye[0]>.7)continue;
      let head=0;
      for(let j=0;j<4;j++)if(body.skeleton.bones[a.skinIndex.array[i*4+j]]?.name==='head')head+=a.skinWeight.array[i*4+j];
      assert.ok(head>.98,`${breed} muzzle head weight ${head}`);points++;
    }
    assert.ok(points>0,'No muzzle sample found');
  });
}

function fixture(){
  const scene=new THREE.Scene(),petals=new Petals(scene,{npc:'low'}),focus=new THREE.Vector3(0,20,0),camera=new THREE.PerspectiveCamera();
  camera.position.set(0,21,-4);
  const ctx={focus,camera,heightAt:()=>20,solidAt:()=>false,wind:{at(x,z,h,out){return out.set(.8,0,.4);}},time:0,rain:0};
  return {scene,petals,ctx};
}
test('blossom stays in one fixed pool across storms and long-distance travel',()=>{
  const {scene,petals,ctx}=fixture(),buffer=petals.mesh.instanceMatrix;
  for(let i=0;i<1200;i++){
    if(i===300){ctx.focus.set(500,20,500);ctx.rain=1;}
    if(i===600){ctx.rain=0;petals.sources=[[500,20,500],[504,20,500]];}
    ctx.time+=1/60;petals.update(1/60,ctx);
    assert.ok(petals.mesh.count<=ART.petals.capacity.low);
    for(let j=0;j<petals.mesh.count;j++){
      const q=petals.p[j];assert.ok(Number.isFinite(q.pos.x+q.pos.y+q.pos.z));
      assert.ok(q.pos.y>=20,'Petal passed below the terrain');
      assert.ok(petals.fade.getX(j)>=0&&petals.fade.getX(j)<=1);
    }
  }
  assert.equal(scene.children.length,1);assert.equal(petals.mesh.instanceMatrix,buffer);
});
test('blossom cannot spawn or remain visible inside solid buildings',()=>{
  const {petals,ctx}=fixture();ctx.solidAt=()=>true;
  for(let i=0;i<120;i++)petals.update(1/60,ctx);
  for(let i=0;i<petals.mesh.count;i++)assert.equal(petals.fade.getX(i),0);
});
test('a landing petal settles on elevated terrain, and petals near the lens disappear',()=>{
  const {petals,ctx}=fixture();petals.update(1/60,ctx);
  const q=petals.p[0];q.pos.set(0,20.016,0);q.fall=.3;q.life=10;q.age=3;
  petals.update(1/60,ctx);
  assert.equal(q.pos.y,20.015);assert.ok(q.settled>0);
  ctx.camera.position.copy(q.pos);petals.update(1/60,ctx);assert.equal(petals.fade.getX(0),0);
});
