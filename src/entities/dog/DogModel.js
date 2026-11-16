/**
 * Dog visuals (shared by the player pup and every stray): loads the Blender pup and dresses it with shaders.
 *   coat      recolour the baked two-tone coat (orange/cream regions -> any two colours)
 *   pattern   'solid' | 'patches' | 'brindle' | 'blacktan'   (computed in the bind pose, so it sticks to the body)
 *   socks     white paws        brows   tan/cream "eyebrow" dots (classic Nepali street dog)
 *   tihar     marigold garland around the neck + red tika (Kukur Tihar)   — toggle later with dog.setTihar(on)
 *   outline   stable screen-space ink, shared by the local dog variants
 * dog.update(dt) blinks the eyes.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from '../../core/assets.js';
import { toon } from '../../render/toon.js';
import { DOGS, ART, MYTHIC } from '../../config/index.js';
import { ACTOR_FADE } from '../../render/actorFade.js';
import { characterOutline } from '../../render/characterOutline.js';

// bind-pose landmarks of the pup mesh (glTF space: +Y up, +Z forward), from pipeline/blender/pup.py
const eyeOf=breed=>{const p=DOGS.variants[breed||DOGS.player].eye;return {x:p[0],y:p[1],z:p[2]};};
const PATTERNS = { solid: 0, patches: 1, brindle: 2, blacktan: 3 };

let CONTACT=null;
function contactShadowMap() {
  if(CONTACT)return CONTACT;
  const size=ART.contactShadow.resolution,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const d=((x+.5)/size*2-1)**2+((y+.5)/size*2-1)**2,i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(Math.max(0,1-d)**ART.contactShadow.falloff*255);
  }
  CONTACT=new THREE.DataTexture(data,size,size);CONTACT.minFilter=CONTACT.magFilter=THREE.LinearFilter;CONTACT.needsUpdate=true;
  return CONTACT;
}

function coatMaterial(o, seed, tika, fade) {
  const EYE=eyeOf(o.breed);
  const recolor = o.coat ? 1 : 0;
  const u = {
    coatA: { value: new THREE.Color(o.coat?.[0] || '#ffffff') }, coatB: { value: new THREE.Color(o.coat?.[1] || '#ffffff') },
    uPattern: { value: PATTERNS[o.pattern] ?? 0 }, uSocks: { value: o.socks ? 1 : 0 }, uSeed: { value: seed },
    uBrow: { value: new THREE.Vector4(...new THREE.Color(o.browColor || '#e9b872').toArray(), o.brows ? 1 : 0) }, uTika: tika, uCameraFade: fade,
  };
  return toon('#ffffff', {
    rim: 0.6, subject: o.subject || 'dog', key: 'coat' + recolor + (o.breed||DOGS.player), params: { vertexColors: true }, uniforms: u,
    vertexHead: 'varying vec3 vBind;', vertexMain: 'vBind = position;',
    fragHead: 'uniform vec3 coatA, coatB; uniform float uPattern, uSocks, uSeed, uTika, uCameraFade; uniform vec4 uBrow; varying vec3 vBind;',
    fragMap: '#include <map_fragment>\n' + ACTOR_FADE,
    onShader: (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
        { vec3 vc = vColor.rgb; float mx = max(vc.r, max(vc.g, vc.b)), mn = min(vc.r, min(vc.g, vc.b));
          float sat = (mx - mn) / max(mx, 1e-3), t = smoothstep(0.55, 0.85, sat);
          vec3 base = ${recolor ? 'mix(coatB, coatA * clamp(mx / 0.83, 0.25, 1.2), t)' : 'vc'};
          vec3 b = vBind;
          if (uPattern > 0.5 && uPattern < 1.5) {          // patches: pale dog with big coloured patches
            float n = tNoise(b.xz * 9.0 + b.y * 4.0 + uSeed * 7.0) * 0.7 + tNoise(b.zy * 19.0 + uSeed) * 0.3;
            base = mix(coatB, coatA, smoothstep(0.5, 0.56, n));
          } else if (uPattern > 1.5 && uPattern < 2.5) {   // brindle stripes
            float s = sin(b.z * 95.0 + b.y * 30.0 + tNoise(b.xy * 25.0 + uSeed) * 5.0);
            base = mix(base * 0.62, base, smoothstep(-0.2, 0.3, s));
          } else if (uPattern > 2.5) {                     // black & tan
            float tan = max(step(b.y, 0.15), step(0.31, b.z));
            tan = max(tan, step(b.y, 0.24) * step(0.06, b.z) * step(abs(b.x), 0.05));
            base = mix(coatA, coatB, tan);
          }
          if (uSocks > 0.5) base = mix(base, vec3(0.96, 0.93, 0.86), smoothstep(0.075, 0.06, b.y));
          float brow = length(vec3(abs(b.x) - ${(EYE.x + 0.006).toFixed(3)}, b.y - ${(EYE.y + 0.034).toFixed(3)}, b.z - ${(EYE.z - 0.014).toFixed(3)}));
          base = mix(base, uBrow.rgb, uBrow.a * smoothstep(0.016, 0.011, brow));
          float tika = length(vec3(b.x, b.y - ${(EYE.y + 0.036).toFixed(3)}, b.z - ${(EYE.z - 0.004).toFixed(3)}));
          base = mix(base, vec3(0.85, 0.05, 0.08), uTika * smoothstep(0.016, 0.012, tika));
          float fur=tNoise(b.xy*vec2(160.0,24.0)+b.z*37.0)*.6+tNoise(b.zy*vec2(155.0,18.0))*.4;
          base*=1.0-${MYTHIC.surface.characterGrain.toFixed(3)}*(1.0-fur);
          diffuseColor.rgb *= base; }`);
    },
  });
}

function partsMaterial(blink, fade, breed) {
  const EYE=eyeOf(breed);
  // eyes close by squashing the eye vertices vertically in the bind pose (before skinning)
  return toon('#ffffff', {
    rim: 0.25, subject: 'detail', key: 'dogparts'+(breed||DOGS.player), params: { vertexColors: true }, uniforms: { uBlink: blink, uCameraFade: fade },
    fragHead: 'uniform float uCameraFade;', fragMap: '#include <map_fragment>\n' + ACTOR_FADE,
    vertexHead: 'uniform float uBlink; attribute float _blink;',
    vertexMain: `transformed.y=mix(transformed.y,${EYE.y.toFixed(4)}+(position.y-${EYE.y.toFixed(4)})*uBlink,_blink);`,
  });
}

/** A ring of marigolds (sayapatri) that sits around the neck bone. */
function garland() {
  const cols = ['#ff9f1c', '#ffb703', '#ff7b00', '#ffd166'];
  const g = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.016, 0), toon('#ffffff', { key: 'marigold', rim: 0.5 }), 16);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), euler = new THREE.Euler(), pos = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1), color = new THREE.Color();
  g.frustumCulled = false;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    matrix.compose(pos.set(Math.cos(a) * 0.058, 0, Math.sin(a) * 0.058), rotation.setFromEuler(euler.set(i, i * 2, 0)), scale);
    g.setMatrixAt(i, matrix); g.setColorAt(i, color.set(cols[i % 4]));
  }
  return g;
}

/**
 * @param {{coat?: [string,string], pattern?: string, socks?: boolean, brows?: boolean, browColor?: string, tihar?: boolean, bandana?: string, outline?: boolean, scale?: number}} o
 */
export async function createDog(o = {}) {
  o.breed ||= DOGS.player;
  const gltf=await loadGLB(`assets/models/${DOGS.variants[o.breed].model}?shape=${DOGS.revision}`);
  const model = cloneSkinned(gltf.scene);
  const tika = { value: o.tihar ? 1 : 0 }, blink = { value: 1 }, fade = { value: 1 };
  const coat = coatMaterial(o, Math.random() * 10, tika, fade), parts = partsMaterial(blink, fade, o.breed);
  const bodies = [], inks = [];
  model.traverse((m) => {
    if (!m.isMesh) return;
    m.material = m.material.name === 'Parts' ? parts : coat;
    m.castShadow = true; m.frustumCulled = false;
    if (m.isSkinnedMesh && m.material === coat) bodies.push(m);
  });
  if (o.outline !== false && ART.subjects[o.subject||'dog'].inkPixels>0) for (const b of bodies) { const ol = new THREE.SkinnedMesh(b.geometry, characterOutline(o.subject || 'dog')); ol.bind(b.skeleton, b.bindMatrix); ol.frustumCulled = false; ol.userData.noShadow=true;b.parent.add(ol); inks.push(ol); }
  const bones = {};
  model.traverse((b) => { if (b.isBone) bones[b.name] = b; });
  const root = new THREE.Group();
  const holder = new THREE.Group(); holder.add(model); root.add(holder);
  if (o.scale) holder.scale.setScalar(o.scale);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ color: ART.contactShadow.colour, map:contactShadowMap(), transparent: true, opacity: 0.22, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.scale.set(1, 1.6, 1); blob.scale.multiplyScalar(o.scale || 1);
  root.add(blob);
  blob.userData.noShadow=true;
  // Tihar garland on the neck bone (bone +Y runs along the neck)
  const ring = garland(); ring.position.y = 0.035; ring.visible = !!o.tihar;
  ring.userData.noShadow=true;
  (bones.neck || bones.chest || model).add(ring);
  if (o.bandana) {   // territory dogs wear their pack colour as a chunky collar-bandana
    const band = new THREE.Group(), m = toon(o.bandana, { key: 'bandana' + o.bandana, rim: 0.5 });
    band.add(new THREE.Mesh(new THREE.TorusGeometry(0.057, 0.01, 6, 16).rotateX(Math.PI / 2), m));
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.055, 3), m); knot.position.set(0, -0.01, 0.075); knot.rotation.x = Math.PI / 2; band.add(knot);
    band.position.y = 0.03; (bones.neck || bones.chest || model).add(band);
  }
  let blinkT=1+Math.random()*3,blinkAge=-1;
  return {
    root, holder, model, breed:o.breed, animations: gltf.animations, bones, blob,
    get tihar() { return ring.visible; },
    setTihar(on) { ring.visible = on; tika.value = on ? 1 : 0; },
    blink() { blinkAge=0; },
    get eyeOpen() { return blink.value; },
    setCameraFade(value) { fade.value = value; holder.visible = value > 0.015; for (const ink of inks) ink.visible = value > 0.95; },
    update(dt) {   // blink every few seconds (sometimes a double blink)
      blinkT -= dt;
      const F=DOGS.face;
      if(blinkT<=0){blinkAge=0;blinkT=Math.random()<F.doubleChance?F.doubleDelay:F.interval[0]+Math.random()*(F.interval[1]-F.interval[0]);}
      if(blinkAge>=0){
        blinkAge+=dt;const t=Math.min(1,blinkAge/F.blinkSeconds),phase=t<.4?t/.4:(1-t)/.6,k=phase*phase*(3-2*phase);
        blink.value=1-(1-F.closed)*k;if(t>=1)blinkAge=-1;
      }else blink.value=1;
    },
  };
}
