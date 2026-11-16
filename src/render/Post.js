/**
 * Restrained post-processing tuned for weak GPUs:
 *   bloom   bright things (sun, neon, lamps, gold, sparkles) glow; blurred at 1/4 and 1/8 resolution
 *   grade   gentle contrast and highlight compression, preserving coat/skin hues from scene lighting
 * Strength follows the time of day. Tunables: POST in config/quality.js.
 */
import * as THREE from 'three';
import { POST } from '../config/index.js';
import { U } from './toon.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0 });
    this.a = rt(4, 4); this.b = rt(4, 4); this.c = rt(4, 4); this.d = rt(4, 4);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.qs = new THREE.Scene(); this.qs.add(this.quad);
    this.bright = pass(/* glsl */ `uniform sampler2D tex; uniform float uTh; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tex, vUv).rgb; float l = max(c.r, max(c.g, c.b));
        float k = smoothstep(uTh, uTh + 0.35, l); gl_FragColor = vec4(c * k, 1.0); }`, { tex: { value: null }, uTh: { value: POST.threshold } });
    this.blur = pass(/* glsl */ `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec3 s = texture2D(tex, vUv).rgb * 0.227;
        s += (texture2D(tex, vUv + dir * 1.385).rgb + texture2D(tex, vUv - dir * 1.385).rgb) * 0.316;
        s += (texture2D(tex, vUv + dir * 3.231).rgb + texture2D(tex, vUv - dir * 3.231).rgb) * 0.070;
        gl_FragColor = vec4(s, 1.0); }`, { tex: { value: null }, dir: { value: new THREE.Vector2() } });
    this.final = pass(/* glsl */ `uniform sampler2D tex, b1, b2; uniform vec2 uTexel; uniform float uBloom, uNight, uVib, uSniff, uContrast, uFilmic; varying vec2 vUv;
      // FXAA in the existing composite: filter diagonal silhouette edges, retain quiet surface detail.
      vec3 sceneColour(vec2 uv){
        vec3 centre=texture2D(tex,uv).rgb;
        ${POST.antialias ? `
        vec3 nw=texture2D(tex,uv+vec2(-1.0,-1.0)*uTexel).rgb,ne=texture2D(tex,uv+vec2(1.0,-1.0)*uTexel).rgb;
        vec3 sw=texture2D(tex,uv+vec2(-1.0,1.0)*uTexel).rgb,se=texture2D(tex,uv+vec2(1.0,1.0)*uTexel).rgb;
        vec3 weights=vec3(0.299,0.587,0.114);
        float m=dot(centre,weights),a=dot(nw,weights),b=dot(ne,weights),c=dot(sw,weights),d=dot(se,weights);
        float lo=min(m,min(min(a,b),min(c,d))),hi=max(m,max(max(a,b),max(c,d)));
        if(hi-lo<max(0.016,hi*0.16))return centre;
        vec2 dir=vec2(-((a+b)-(c+d)),(a+c)-(b+d));
        float reduce=max((a+b+c+d)*0.03125,0.0078125);
        dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-8.0),vec2(8.0))*uTexel;
        vec3 first=0.5*(texture2D(tex,uv+dir*(-1.0/6.0)).rgb+texture2D(tex,uv+dir*(1.0/6.0)).rgb);
        vec3 second=first*0.5+0.25*(texture2D(tex,uv-dir*0.5).rgb+texture2D(tex,uv+dir*0.5).rgb);
        float l=dot(second,weights);return (l<lo||l>hi)?first:second;` : 'return centre;'}
      }
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      void main(){
        vec3 c = sceneColour(vUv);
        vec3 bl = texture2D(b1, vUv).rgb * 0.6 + texture2D(b2, vUv).rgb * 0.8;
        c += bl * uBloom;
        // vibrance: boost the dull colours more than the already-saturated ones
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        c = mix(vec3(l), c, 1.0 + uVib * (1.0 - sat) * (1.0 - uSniff));
        // Preserve coat/skin hue; the sky lights already supply the warm/cool separation.
        c = max(vec3(0.0),(c-0.18)*uContrast+0.18);
        c = mix(c, aces(c), uFilmic);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`, { tex: { value: null }, b1: { value: null }, b2: { value: null },uTexel:{value:new THREE.Vector2()}, uBloom: { value: POST.bloom }, uNight: { value: 0 }, uVib: { value: POST.vibrance }, uSniff: { value: 0 },uContrast:{value:POST.contrast},uFilmic:{value:POST.filmic} });
    this.size = new THREE.Vector2();
  }

  #resize() {
    const s = this.r.getDrawingBufferSize(this.size), w = Math.max(4, s.x), h = Math.max(4, s.y);
    if (this.scene.width === w && this.scene.height === h) return;
    this.scene.setSize(w, h);
    this.final.uniforms.uTexel.value.set(1/w,1/h);
    this.a.setSize(w >> 2, h >> 2); this.b.setSize(w >> 2, h >> 2); this.c.setSize(w >> 3, h >> 3); this.d.setSize(w >> 3, h >> 3);
  }
  #draw(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.cam); }

  render(scene, camera) {
    this.#resize();
    const r = this.r, night = U.uNight.value;
    r.setRenderTarget(this.scene); r.render(scene, camera);
    this.bright.uniforms.tex.value = this.scene.texture; this.bright.uniforms.uTh.value = THREE.MathUtils.lerp(POST.threshold,POST.nightThreshold,night);
    this.#draw(this.bright, this.a);
    const blur = (src, dst, w, h, x) => { this.blur.uniforms.tex.value = src.texture; this.blur.uniforms.dir.value.set(x ? 1 / w : 0, x ? 0 : 1 / h); this.#draw(this.blur, dst); };
    blur(this.a, this.b, this.a.width, this.a.height, true); blur(this.b, this.a, this.a.width, this.a.height, false);
    this.blur.uniforms.tex.value = this.a.texture; this.blur.uniforms.dir.value.set(0, 0); this.#draw(this.blur, this.c);       // downsample
    blur(this.c, this.d, this.c.width, this.c.height, true); blur(this.d, this.c, this.c.width, this.c.height, false);
    const f = this.final.uniforms;
    f.tex.value = this.scene.texture; f.b1.value = this.a.texture; f.b2.value = this.c.texture;
    f.uBloom.value = POST.bloom * THREE.MathUtils.lerp(1,POST.nightBloom,night); f.uNight.value = night; f.uSniff.value = U.uSniff.value;
    this.#draw(this.final, null);
  }
}
