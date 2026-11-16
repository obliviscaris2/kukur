/** Stable screen-space ink on existing skinned hulls; width stays readable without adding another render pass. */
import * as THREE from 'three';
import { ART } from '../config/index.js';
import { U } from './toon.js';

const materials=new Map();
export function characterOutline(subject='dog') {
  if(materials.has(subject))return materials.get(subject);
  const material=new THREE.MeshBasicMaterial({color:ART.ink,side:THREE.BackSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uInkViewport=U.uViewport;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform vec2 uInkViewport;');
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      vec2 inkNormal=(projectionMatrix*vec4(transformedNormal,0.0)).xy;
      #ifdef FLIP_SIDED
        inkNormal=-inkNormal;
      #endif
      float inkLength=length(inkNormal);
      if(inkLength>0.001)gl_Position.xy+=inkNormal/inkLength * ${ART.subjects[subject].inkPixels.toFixed(2)} * 2.0/uInkViewport * gl_Position.w;`);
  };
  material.customProgramCacheKey=()=>`character-ink:${subject}`;
  materials.set(subject,material);return material;
}
