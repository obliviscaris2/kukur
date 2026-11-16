/**
 * Shared soft lighting: matte painted scenery, gentle specular highlights on coats, eyes, water and metal.
 * Every material goes through toonify(), which adds:
 *   - drifting cloud shadows, rain wetness
 *   - the pup's senses (smell-vision greys the world, dog-eyes dichromacy)
 * Global shader uniforms live in U and are updated by the weather/sky/senses systems.
 */
import * as THREE from 'three';
import { noiseTexture, SURFACE_NORMAL } from './surfaceLibrary.js';
import { ART, NATURE, MYTHIC } from '../config/index.js';

export const U = {
  uNoise: {value:noiseTexture()},
  uLeaves:{value:null},uStone:{value:null},uMoss:{value:null},uBrick:{value:null},uWood:{value:null},
  uEarth:{value:null},uCobble:{value:null},uPlaster:{value:null},uRoof:{value:null},
  uPup: {value: new THREE.Vector4(0, -10000, 0, 0)},
  uTime: { value: 0 }, uSniff: { value: 0 }, uDog: { value: 0 }, uWind: { value: 0.5 }, uWet: { value: 0 },
  uNight: { value: 0 }, uCloud: { value: 0.2 }, uCloudOff: { value: new THREE.Vector2() }, uRimColor: { value: new THREE.Color('#fff2d6') },
  /** prevailing wind direction (xz, unit) — set by world/sky/Wind.js */
  uWindDir: { value: new THREE.Vector2(0.6, 0.8) },
  uViewport: { value: new THREE.Vector2(1280,720) },
  uShrinePos:{value:Array.from({length:NATURE.shrines.lightSlots},()=>new THREE.Vector4())},
  uShrineColour:{value:Array.from({length:NATURE.shrines.lightSlots},()=>new THREE.Vector3())},
};

let grad = null;
export function gradientMap() {
  if (grad) return grad;
  const R=ART.lightRamp,d=new Uint8Array(R.samples*4);
  for(let i=0;i<R.samples;i++){
    const light=R.floor+(1-R.floor)*Math.max(0,2*i/(R.samples-1)-1)**R.curve;
    d.set([light*255,light*255,light*255,255],i*4);
  }
  grad = new THREE.DataTexture(d, R.samples, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.LinearFilter;
  grad.needsUpdate = true;
  return grad;
}

export const HEAD = /* glsl */ `
uniform sampler2D uNoise, uLeaves, uStone, uMoss, uBrick, uWood, uEarth, uCobble, uPlaster, uRoof;
uniform vec4 uPup;
uniform float uTime, uSniff, uDog, uWet, uNight, uWind, uCloud;
uniform vec2 uCloudOff, uWindDir;
uniform vec3 uRimColor;
uniform vec4 uShrinePos[${NATURE.shrines.lightSlots}];
uniform vec3 uShrineColour[${NATURE.shrines.lightSlots}];
// gust fronts rolling downwind — keep in sync with Wind.gust() in world/sky/Wind.js
float windGust(vec2 p) { float a = dot(p, uWindDir), b = dot(p, vec2(-uWindDir.y, uWindDir.x));
  float g = 0.5 + 0.5 * sin((a - uTime * 9.0) * 0.045 + 1.7 * sin(b * 0.013 + uTime * 0.11)); return g * g * g; }
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) { return texture2D(uNoise,(p+0.5)/128.0).r; }
vec3 dogEyes(vec3 c) { return mat3(0.367322, 0.280085, -0.011820, 0.860646, 0.672501, 0.042940, -0.227968, 0.047413, 0.968881) * c; }
varying vec2 vCloudP;`;

const CLOUD_VERT = /* glsl */ `
  { vec4 cwp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      cwp = instanceMatrix * cwp;
    #endif
    cwp = modelMatrix * cwp; vCloudP = cwp.xz; }`;

const TAIL = /* glsl */ `
{ vec3 c = gl_FragColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // Light carries the time-of-day colour. Do not paint a second purple wash over coats and skin.
  c = mix(c, vec3(l) * vec3(0.58, 0.64, 0.88), uSniff * 0.78);
  c = mix(c, dogEyes(c), uDog);
  gl_FragColor.rgb = c; }`;

/**
 * @param {THREE.Material} mat
 * @param {object} o  rim, wind ('tree'|'flag'|'cloth'), wet, key (cache key), uniforms, vertexHead, vertexMain,
 *                    fragHead, fragMap (replaces map_fragment), fragEmissive, onShader(shader)
 */
export function toonify(mat, o = {}) {
  const subject=ART.subjects[o.subject];
  const rim = (o.rim ?? 0.35)*(subject?1:ART.surfaceRim);
  mat.onBeforeCompile = (sh) => {
    // Four-tap filtered basic shadows avoid the expensive 9/17-tap kernels on the integrated preset.
    sh.fragmentShader=sh.fragmentShader.replace('#include <shadowmap_pars_fragment>',THREE.ShaderChunk.shadowmap_pars_fragment.replace(
      'shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );',
      `vec2 tap=vec2(.65)/shadowMapSize;
       shadow=.25*(texture2DCompare(shadowMap,shadowCoord.xy+tap,shadowCoord.z)+texture2DCompare(shadowMap,shadowCoord.xy-tap,shadowCoord.z)+texture2DCompare(shadowMap,shadowCoord.xy+vec2(tap.x,-tap.y),shadowCoord.z)+texture2DCompare(shadowMap,shadowCoord.xy+vec2(-tap.x,tap.y),shadowCoord.z));`));
    Object.assign(sh.uniforms, U, o.uniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HEAD + (o.vertexHead || ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + CLOUD_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HEAD + (o.fragHead || ''));
    if (o.wind) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND[o.wind]);
    if (o.vertexMain) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.vertexMain);
    if (o.fragMap) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', o.fragMap);
    if(o.surface){
      const scale=MYTHIC.surface[o.surface]||MYTHIC.surface.stone;
      const sampler={stone:'uStone',wood:'uWood',brick:'uBrick',moss:'uMoss',earth:'uEarth',cobble:'uCobble',plaster:'uPlaster',roof:'uRoof'}[o.surface]||'uStone';
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nfloat surfaceHeight=0.0;');
      sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        vec3 swp=vec3(vCloudP.x,cameraPosition.y-dot(viewMatrix[1].xyz,vViewPosition),vCloudP.y);
        vec3 axis=abs(inverseTransformDirection(normalize(vNormal),viewMatrix));
        vec2 st=axis.y>.65?swp.xz:(axis.x>axis.z?swp.zy:swp.xy);
        vec3 materialPaint=texture2D(${sampler},st/${scale.toFixed(3)}).rgb;
        surfaceHeight=dot(materialPaint,vec3(.2126,.7152,.0722));
        // Paint adds shallow variation instead of multiplying two dark albedos together.
        diffuseColor.rgb*=.78+surfaceHeight*.65;
      `);
      sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+SURFACE_NORMAL);
    }
    if (o.normalMap) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n'+o.normalMap);
    if (o.fragEmissive) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + o.fragEmissive);
    let pre = `{ float cs = smoothstep(0.45, 0.7, tNoise(vCloudP * 0.0045 + uCloudOff)) * smoothstep(0.15, 0.55, uCloud) * (1.0 - smoothstep(0.85, 1.0, uCloud));
      outgoingLight *= 1.0 - cs * ${subject?'0.05':ART.cloudShadow.toFixed(3)}; }\n`;
    if (o.wet !== false) pre += `outgoingLight *= 1.0 - uWet * ${ART.wetDarken.toFixed(3)};\n`;
    // Lambert's broad light is vertex-based. Give the existing sampled relief a small per-pixel grazing-light response.
    if(o.surface||o.normalMap)pre+=`{vec3 rake=normalize(mat3(viewMatrix)*vec3(-.45,.8,.35));float reliefLight=dot(normal,rake)-dot(normalize(vNormal),rake);outgoingLight*=clamp(1.0+reliefLight*.65,.82,1.16);}\n`;
    if (!subject) pre += `outgoingLight += diffuseColor.rgb * mix(${ART.worldFill[0].toFixed(3)},${ART.worldFill[1].toFixed(3)},uNight);\n`;
    if(subject) {
      const day=new THREE.Color(ART.rim.day),night=new THREE.Color(ART.rim.night),v=c=>`vec3(${c.toArray().map(n=>n.toFixed(4)).join(',')})`;
      pre+=`{ float key = smoothstep(-0.3,0.8,dot(normal,normalize(vec3(-0.45,0.7,0.85))));
        float floorLight = mix(${subject.fill[0].toFixed(3)},${subject.fill[1].toFixed(3)},uNight) + key * ${subject.key.toFixed(3)};
        outgoingLight += diffuseColor.rgb * floorLight * (.65+.35*key);
        float edge = pow(1.0-clamp(dot(normal,normalize(vViewPosition)),0.0,1.0),2.5);
        outgoingLight += mix(${v(day)},${v(night)},uNight) * edge * mix(${subject.rim[0].toFixed(3)},${subject.rim[1].toFixed(3)},uNight);
      }\n`;
    } else if (rim > 0) pre += `{ float r = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
      outgoingLight += uRimColor * r * ${rim.toFixed(2)} * (1.0 - uNight * 0.7) * diffuseColor.rgb; }\n`;
    // Reuse the existing position varyings and literal uniform indices: no extra interpolators or driver-dependent array loops.
    pre+=`{float surfaceY=cameraPosition.y-dot(viewMatrix[1].xyz,vViewPosition);\n`+
      Array.from({length:NATURE.shrines.lightSlots},(_,i)=>`{
        vec3 delta=uShrinePos[${i}].xyz-vec3(vCloudP.x,surfaceY,vCloudP.y);float d2=dot(delta,delta),radius=uShrinePos[${i}].w;
        float falloff=clamp(1.0-d2/max(.01,radius*radius),0.0,1.0);
        outgoingLight+=diffuseColor.rgb*uShrineColour[${i}]*falloff*falloff/(1.0+d2*.22);
      }`).join('\n')+'}\n';
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', pre + '#include <opaque_fragment>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + TAIL);
    o.onShader?.(sh);
  };
  mat.customProgramCacheKey = () => 'toon:' + (o.key || '') + rim + (o.wind || '') + (o.subject || 'world')+(o.surface||'');
  return mat;
}

const WIND_POS = /* glsl */ `
    #ifdef USE_INSTANCING
      vec2 ip = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xz;
      vec3 lw = transpose(mat3(instanceMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y);
    #else
      vec2 ip = modelMatrix[3].xz;
      vec3 lw = transpose(mat3(modelMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y);
    #endif
    vec2 wl = normalize(lw.xz + 1e-5);
    float gst = windGust(ip);`;
const WIND = {
  // trees lean downwind and shiver; the lean grows as a gust front passes through
  tree: WIND_POS + /* glsl */ `
    float hk = max(transformed.y - 1.0, 0.0);
    float lean = hk * 0.05 * (0.15 + uWind * (0.3 + 1.3 * gst));
    float shiver = hk * 0.018 * (0.3 + uWind * (0.5 + gst)) * sin(uTime * (2.0 + 3.0 * gst) + ip.x * 0.37 + transformed.y * 1.3);
    transformed.x += wl.x * lean + wl.y * shiver;
    transformed.z += wl.y * lean - wl.x * shiver;`,
  // prayer flags: fast flutter, much stronger in gusts
  flag: WIND_POS + /* glsl */ `
    float ph = ip.x * 1.7 + ip.y * 0.9;
    float k = -transformed.y * 2.2, amp = 0.4 + uWind * (0.5 + 1.5 * gst);
    transformed.z += sin(uTime * (5.0 + uWind * 4.0 + gst * 6.0) + ph + transformed.x * 6.0) * 0.07 * k * amp;
    transformed.x += cos(uTime * 3.0 + ph) * 0.02 * k * amp;`,
  // grass tufts & flowers: bend from the root, ripple as gust fronts pass
  grass: WIND_POS + /* glsl */ `
    float hk = max(transformed.y, 0.0);
    float bend = hk * hk * (0.6 + uWind * (0.8 + 2.4 * gst));
    float wob = sin(uTime * (2.2 + 4.0 * gst) + ip.x * 1.7 + ip.y * 1.3) * hk * 0.12 * (0.4 + uWind);
    transformed.x += wl.x * bend * 0.35 + wl.y * wob;
    transformed.z += wl.y * bend * 0.35 - wl.x * wob;`,
  // laundry: slower billow
  cloth: WIND_POS + /* glsl */ `
    float ph = ip.x * 0.7 + ip.y * 1.3;
    float k = -transformed.y * 1.5, amp = 0.3 + uWind * (0.4 + 1.4 * gst);
    transformed.z += sin(uTime * (2.5 + uWind * 2.0 + gst * 3.0) + ph) * 0.12 * k * amp;`,
};

export function toon(color, o = {}) {
  const subject=ART.subjects[o.subject];
  const m = subject
    ? new THREE.MeshPhongMaterial({color,shininess:o.subject==='detail'?48:10,specular:o.subject==='detail'?'#4d5351':'#242c29',...(o.params||{})})
    : o.params?.shininess !== undefined || o.key === 'water'
      ? new THREE.MeshPhongMaterial({ color, shininess: 24, specular: '#303d45', ...(o.params || {}) })
      : new THREE.MeshLambertMaterial({ color, ...(o.params || {}) });
  return toonify(m, o);
}

/** Unlit material that still respects the senses filter (sky things, glows). */
export function unlit(params, o = {}) {
  const m = new THREE.MeshBasicMaterial(params);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HEAD).replace('#include <project_vertex>', '#include <project_vertex>\n' + CLOUD_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HEAD).replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + (o.senses === false ? '' : TAIL));
    if (o.wind) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND[o.wind]);
  };
  m.customProgramCacheKey = () => 'unlit:' + (o.key || '') + (o.senses === false ? 'ns' : '') + (o.wind || '');
  return m;
}
