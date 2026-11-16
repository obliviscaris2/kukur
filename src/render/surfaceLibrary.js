/** Mipmapped painted swatches shared by the whole valley; extraction happens once at load time. */
import * as THREE from 'three';
import { MYTHIC } from '../config/index.js';

let promise;
export function loadSurfaces() {
  return promise ??= (async () => {
    const maps = {}, loader = new THREE.ImageLoader();
    const definitions = [
      [MYTHIC.atlas, ['stone', 'moss', 'brick', 'wood']],
      [MYTHIC.explorationAtlas, ['earth', 'cobble', 'plaster', 'roof']],
    ];
    await Promise.all(definitions.map(async ([url, keys]) => {
      const image = await loader.loadAsync(new URL(url, document.baseURI).href);
      keys.forEach((key, i) => {
        const canvas = Object.assign(document.createElement('canvas'), {width: MYTHIC.textureSize, height: MYTHIC.textureSize});
        canvas.getContext('2d').drawImage(image, (i % 2) * image.width / 2, Math.floor(i / 2) * image.height / 2, image.width / 2, image.height / 2, 0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
        texture.anisotropy = 4;
        maps[key] = texture;
      });
    }));
    const leaf = await loader.loadAsync(new URL(MYTHIC.foliage, document.baseURI).href);
    const canvas = Object.assign(document.createElement('canvas'), {width: 512, height: 512});
    canvas.getContext('2d').drawImage(leaf, 0, 0, 512, 512);
    maps.leaves = new THREE.CanvasTexture(canvas);
    maps.leaves.colorSpace = THREE.SRGBColorSpace; maps.leaves.anisotropy = 4;
    return maps;
  })();
}

/** A periodic seeded noise texture replaces repeated four-corner sine hashes in surface/cloud shading. */
export function noiseTexture() {
  const size=128, data=new Uint8Array(size*size*4); let seed=2387101;
  for(let i=0;i<data.length;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; data[i]=seed>>>24; }
  const texture=new THREE.DataTexture(data,size,size);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

/** Derivative bump mapping uses the existing albedo sample and fades naturally through mipmaps. */
export const SURFACE_NORMAL = `{
  vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
  vec3 r1=cross(q1,normal),r2=cross(normal,q0);
  float determinant=dot(q0,r1);
  vec3 slope=(dFdx(surfaceHeight)*r1+dFdy(surfaceHeight)*r2)*${MYTHIC.surface.relief.toFixed(4)};
  vec3 bumped=abs(determinant)*normal-sign(determinant)*slope;
  if(dot(bumped,bumped)>1e-16)normal=normalize(bumped);
}`;
