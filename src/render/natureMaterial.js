/** Shared leaf transmission, tiny luminous buds and complementary near/far stipple fades on merged botanical meshes. */
import * as THREE from 'three';
import { toon, unlit, U } from './toon.js';
import { NATURE } from '../config/index.js';

export function natureMaterial(key, wind = 'grass', lod = false) {
  const T = NATURE.trees;
  const gold = T.golden.map(
    (hex) =>
      `vec3(${new THREE.Color(hex)
        .toArray()
        .map((v) => v.toFixed(4))
        .join(',')})`,
  );
  return toon('#ffffff', {
    key: 'nature-' + key,
    rim: 0.25,
    wind,
    params: { vertexColors: true, side: wind==='tree'?THREE.FrontSide:THREE.DoubleSide, shadowSide: THREE.FrontSide },
    vertexHead: `attribute vec2 nature; varying vec2 vNature; varying vec2 vLeafUv;${key === 'flower' ? 'varying vec3 vStemColour;' : ''}${lod ? 'attribute vec3 treeLod; varying vec3 vTreeLod;' : ''}`,
    vertexMain: `vNature=nature;vLeafUv=uv;${key === 'flower' ? 'vStemColour=color;' : ''}${lod ? 'vTreeLod=treeLod;' : ''}
      float flutter=nature.x*smoothstep(.05,.3,position.y);
      transformed.x += flutter*sin(uTime*2.1+position.y*3.7+position.z*4.0)*0.018*uWind;
      transformed.z += flutter*cos(uTime*1.7+position.x*3.3)*0.012*uWind;
      ${wind === 'grass' ? `
        vec3 baseP=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vec2 away=baseP.xz-uPup.xz;float d=length(away);
        float brushBend=(1.0-smoothstep(.12,.85,d))*(1.0-smoothstep(.3,.8,abs(baseP.y-uPup.y)));
        vec2 localAway=vec2(dot(instanceMatrix[0].xz,away),dot(instanceMatrix[2].xz,away))/max(.12,d);
        transformed.xz+=localAway*brushBend*min(position.y,.5)*.85;
        transformed.y-=brushBend*max(0.0,position.y)*.3;
      ` : ''}`, 
    fragHead: `varying vec2 vNature;varying vec2 vLeafUv;${key === 'flower' ? 'varying vec3 vStemColour;' : ''}${lod ? 'varying vec3 vTreeLod;' : ''}`,
    fragMap:
      `#include <map_fragment>
        if(vNature.x>1.5){
          vec4 leaf=texture2D(uLeaves,vLeafUv);if(leaf.a<.48)discard;
          float tone=dot(leaf.rgb,vec3(.2126,.7152,.0722));
          diffuseColor.rgb*=.45+tone*1.7;
        }else if(vNature.x<.1){
          float grain=texture2D(uWood,vec2(vCloudP.x+vCloudP.y,cameraPosition.y-dot(viewMatrix[1].xyz,vViewPosition))*.7).r;
          diffuseColor.rgb*=.7+grain*1.7;
        }
      ` +
      (lod
        ? `float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
      if(vTreeLod.y<.5 ? grain<vTreeLod.x : grain>=vTreeLod.x)discard;
      float value=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      vec3 gold=mix(${gold[0]},${gold[1]},smoothstep(.015,.24,value));gold=mix(gold,${gold[2]},smoothstep(.24,.65,value));
      diffuseColor.rgb=mix(diffuseColor.rgb,gold,min(1.0,vNature.x)*vTreeLod.z);`
        : ''),
    fragEmissive: `totalEmissiveRadiance += diffuseColor.rgb*(min(1.0,vNature.x)*mix(${T.leafFill.toFixed(3)},${T.nightFill.toFixed(3)},uNight)+vNature.y*mix(${key.startsWith('wish-tree')?'1.8':'.12'},${T.seedGlow.toFixed(3)},uNight)*(.88+.12*sin(uTime*1.2+vCloudP.x*.08+vCloudP.y*.06)));`,
    onShader:
      key === 'flower'
        ? (sh) => {
            sh.fragmentShader = sh.fragmentShader.replace(
              '#include <color_fragment>',
              'diffuseColor.rgb *= (vNature.y>.05&&vNature.y<.4)?vColor.rgb:vStemColour;',
            );
          }
        : undefined,
  });
}

/** Distant canopy keeps painted colour, wind, fog and senses, without per-pixel shadows or light-pool calculations. */
export function distantNatureMaterial() {
  const mat=unlit({vertexColors:true,side:THREE.FrontSide},{key:'distant-canopy',wind:'tree'}),base=mat.onBeforeCompile;
  const palette=NATURE.trees.golden.map(hex=>`vec3(${new THREE.Color(hex).toArray().map(v=>v.toFixed(4)).join(',')})`);
  mat.onBeforeCompile=sh=>{
    base(sh);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 nature;attribute vec3 treeLod;varying vec2 vNature;varying vec2 vLeafUv;varying vec3 vLod;varying float vPaintLight;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvNature=nature;vLeafUv=uv;vLod=treeLod;vPaintLight=.9+max(0.0,normal.y)*.35;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vNature;varying vec2 vLeafUv;varying vec3 vLod;varying float vPaintLight;')
      .replace('#include <map_fragment>',`float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
        if(grain>=vLod.x)discard;
        if(vNature.x>1.5){vec4 leaf=texture2D(uLeaves,vLeafUv);if(leaf.a<.48)discard;diffuseColor.rgb*=.45+dot(leaf.rgb,vec3(.2126,.7152,.0722))*1.7;}
        float value=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        vec3 gold=mix(${palette[0]},${palette[1]},smoothstep(.015,.24,value));gold=mix(gold,${palette[2]},smoothstep(.24,.65,value));
        diffuseColor.rgb=mix(diffuseColor.rgb,gold,min(1.0,vNature.x)*vLod.z);`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.rgb*=vPaintLight*mix(1.18,.68,uNight);`);
  };
  return mat;
}

/** Alpha cutout is shared by foliage and its shadow; leaf cards never cast rectangular shadows. */
let DEPTH;
export function natureDepth(){
  if(DEPTH)return DEPTH;
  const material=DEPTH=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  material.onBeforeCompile=sh=>{
    sh.uniforms.uLeaves=U.uLeaves;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 nature;varying vec2 leafUv;varying float leafRole;').replace('#include <begin_vertex>','#include <begin_vertex>\nleafUv=uv;leafRole=nature.x;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uLeaves;varying vec2 leafUv;varying float leafRole;').replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(leafRole>1.5&&texture2D(uLeaves,leafUv).a<.48)discard;');
  };
  material.customProgramCacheKey=()=> 'foliage-cutout-depth';return material;
}
