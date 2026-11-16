/** Split indexed static geometry into spatial batches sharing vertex buffers, so hidden streets never reach the GPU. */
import * as THREE from 'three';

export function spatialGeometry(geometry, size = 96) {
  const position=geometry.attributes.position,index=geometry.index,buckets=new Map();
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    const x=Math.floor((position.getX(a)+position.getX(b)+position.getX(c))/(3*size)),z=Math.floor((position.getZ(a)+position.getZ(b)+position.getZ(c))/(3*size));
    const key=`${x}:${z}`;let bucket=buckets.get(key);if(!bucket)buckets.set(key,bucket=[]);bucket.push(a,b,c);
  }
  const point=new THREE.Vector3();
  return [...buckets.values()].map(indices=>{
    const g=new THREE.BufferGeometry();for(const [key,attribute] of Object.entries(geometry.attributes))g.setAttribute(key,attribute);
    g.setIndex(indices);g.boundingBox=new THREE.Box3();
    for(const i of indices)g.boundingBox.expandByPoint(point.fromBufferAttribute(position,i));
    g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return g;
  });
}
