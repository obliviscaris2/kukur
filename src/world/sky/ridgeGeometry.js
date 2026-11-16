/** Painted, sloping valley ridges: baked soft light and haze in one static mesh, with no per-frame terrain work. */
import * as THREE from 'three';
import { MYTHIC } from '../../config/index.js';

export function ridgeGeometry() {
  const cfg=MYTHIC.ridges, positions=[], indices=[], colours=[], rows=8;
  const sun=new THREE.Vector3(-.5,.8,.25).normalize();
  for(let layer=cfg.layers-1;layer>=0;layer--){
    const start=positions.length/3, radius=cfg.radius+layer*210;
    for(let row=0;row<=rows;row++)for(let i=0;i<=cfg.segments;i++){
      const a=i/cfg.segments*Math.PI*2, t=row/rows;
      const crest=210+layer*80+Math.sin(a*3+layer)*40+Math.sin(a*9+layer*2)*32+Math.cos(a*19+layer)*15
        +Math.max(0,-Math.cos(a))**10*(240+Math.abs(Math.sin(a*15))*150);
      const r=radius-t*680;
      const folds=(Math.sin(a*23+t*2)+.4*Math.cos(a*39-t*3))*t*(1-t)*60;
      const y=-150+(crest+150)*(1-t)**1.5+folds;
      positions.push(Math.sin(a)*r,y,Math.cos(a)*r);
    }
    for(let row=0;row<rows;row++)for(let i=0;i<cfg.segments;i++){
      const a=start+row*(cfg.segments+1)+i,b=a+cfg.segments+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const normal=new THREE.Vector3(), colour=new THREE.Color(), mist=new THREE.Color('#d0e1d8');
  const stride=(rows+1)*(cfg.segments+1);
  for(let i=0;i<positions.length/3;i++){
    const layer=cfg.layers-1-Math.floor(i/stride), row=Math.floor((i%stride)/(cfg.segments+1));
    normal.fromBufferAttribute(geometry.attributes.normal,i);
    if(normal.y<0)normal.negate();
    const light=.86+.14*Math.max(0,normal.dot(sun));
    colour.set(cfg.colours[layer]).multiplyScalar(light).lerp(mist,.08+row/rows*.42);
    colour.toArray(colours,colours.length);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geometry.computeBoundingSphere();
  return geometry;
}
