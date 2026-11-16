/** Rounded stepping stones, fallen timber and luminous foliage, with matching inexpensive collision profiles. */
import * as THREE from 'three';
import { EXPLORATION as C, WORLD } from '../../config/index.js';
import { treeGeometry } from './natureGeometry.js';
import { terrainPieces } from '../tiles/drape.js';

const radiusAt=a=>1+.07*Math.cos(a*3)+.045*Math.sin(a*5);

export function stoneGeometry() {
  // Flat landing area, rolled shoulder, embedded foot: no spherical top to slip off.
  const points=[[0,-.08],[.84,-.08],[1,.12],[1,.72],[.9,1],[0,1]].map(p=>new THREE.Vector2(...p));
  const geo=new THREE.LatheGeometry(points,16),position=geo.attributes.position;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i),r=radiusAt(Math.atan2(x,z));position.setX(i,x*r);position.setZ(i,z*r);
  }
  geo.computeVertexNormals();return geo;
}

export function logGeometry() {
  const geo=new THREE.CylinderGeometry(C.logRadius,C.logRadius,C.logLength,12,1);
  geo.rotateZ(Math.PI/2);geo.translate(0,C.logRadius,0);
  return geo;
}

export function discoveryTreeGeometry(golden=false) {
  const geo=treeGeometry(2), colours=geo.attributes.color, roles=geo.attributes.nature;
  const palette=(golden?C.gold:C.foliage).map(c=>new THREE.Color(c)), col=new THREE.Color();
  for(let i=0;i<colours.count;i++)if(roles.getX(i)>1.5){
    const tone=THREE.MathUtils.clamp(colours.getY(i)*1.7,0,1),t=tone*2,j=Math.min(1,Math.floor(t));
    col.copy(palette[j]).lerp(palette[j+1],t-j);col.toArray(colours.array,i*3);
    roles.setY(i,.12+tone*.08);
  }
  return geo;
}

/** Small scalloped soil beds follow the same terrain planes as the paving underneath. */
export function soilGeometry(sites,heightAt) {
  const vertices=[],uvs=[];
  for(const site of sites){
    const rim=Array.from({length:C.soilSides},(_,i)=>{
      const a=i*Math.PI*2/C.soilSides,r=C.soilRadius*(1+.08*Math.sin(a*5+site.angle)+.045*Math.sin(a*8));
      return [site.x+Math.cos(a)*r,site.z+Math.sin(a)*r];
    });
    for(let i=0;i<rim.length;i++)for(const piece of terrainPieces([[site.x,site.z],rim[i],rim[(i+1)%rim.length]],WORLD.tileSize/WORLD.terrain.meshSegments)){
      for(let j=1;j<piece.length-1;j++)for(const p of [piece[0],piece[j+1],piece[j]]){
        vertices.push(p[0],heightAt(p[0],p[1])+C.soilLift,p[1]);uvs.push((p[0]-site.x)/C.soilRadius,(p[1]-site.z)/C.soilRadius);
      }
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geo.computeVertexNormals();if(vertices.length){geo.computeBoundingBox();geo.computeBoundingSphere();}return geo;
}

/** Identical top dimensions to the render profile; physics stays in the static spatial hash. */
export function registerStone(physics,owner,p,r,h) {
  const ring=radius=>Array.from({length:16},(_,i)=>{const a=i*Math.PI/8,r=radius*radiusAt(a);return[p.x+Math.sin(a)*r,p.z+Math.cos(a)*r];});
  physics.addSolid(owner,ring(r),p.y+h*.72,p.y-.08*h);
  physics.addSolid(owner,ring(r*.9),p.y+h,p.y+h*.72);
}

export function registerLog(physics,owner,p,angle) {
  // Chord strips follow the round log to within 2 cm; they remain solid from below too.
  const r=C.logRadius,ux=Math.cos(angle),uz=-Math.sin(angle),nx=-uz,nz=ux;
  for(let i=0;i<8;i++){
    const lo=-r+i*r/4,hi=lo+r/4,mid=(lo+hi)/2;
    const top=p.y+r+Math.sqrt(Math.max(0,r*r-mid*mid));
    physics.addBox(owner,p.x+nx*mid,p.z+nz*mid,C.logLength/2,(hi-lo)/2,angle,top,p.y+.01);
  }
}
