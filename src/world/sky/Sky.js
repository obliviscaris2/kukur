/**
 * Sky dome (gradient, sun, stars, rainbow), sun + hemisphere light with a shadow box that follows the pup,
 * soft cloud density, and a distant backdrop (Himalaya to the north, layered valley ridges) that travels with you.
 */
import * as THREE from 'three';
import { U } from '../../render/toon.js';
import { ART } from '../../config/index.js';
import { ridgeGeometry } from './ridgeGeometry.js';

const C = (h) => new THREE.Color(h);
const KEYS=ART.sky.map(key=>({...key,...Object.fromEntries(['top','hor','sun','hs','hg','fog'].map(k=>[k,C(key[k])]))}));

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.direction=new THREE.Vector3();this.moonDirection=new THREE.Vector3(-.4,.8,-.3).normalize();
    this.fogColour=new THREE.Color();this.stormColour=new THREE.Color('#526a71');
    this.palette=Object.fromEntries(['top','hor','sun','hs','hg','fog'].map(key=>[key,new THREE.Color()]));
    this.u = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() },
      noise:U.uNoise, cloud:{value:0}, stars: { value: 0 }, grey: { value: 0 }, rainbow: { value: 0 }, time: U.uTime };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.u, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 top, hor, sunDir, sunCol; uniform sampler2D noise; uniform float cloud, stars, grey, rainbow, time; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float noiseAt(vec2 p){return texture2D(noise,(p+.5)/128.0).r;}
        float cloudField(vec2 p){return noiseAt(p)*.56+noiseAt(p*2.07+19.0)*.29+noiseAt(p*4.17-11.0)*.15;}
        vec3 hue(float t){ return clamp(abs(mod(t * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ vec3 d = normalize(vP); float y = d.y;
          vec3 c = mix(hor, top, pow(smoothstep(-0.02, 0.6, y), 0.8));
          c = mix(c, vec3(dot(c, vec3(0.33))) * vec3(0.85, 0.9, 1.0), grey);
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += sunCol * (smoothstep(0.9975, 0.999, s) * 1.6 + pow(s, 18.0) * 0.35) * (1.0 - grey * 0.8);
          // One dome samples layered, wind-stretched density instead of drawing opaque cloud cut-outs.
          if(y>0.008){
            vec2 cp=d.xz/(y+.22)*4.8+vec2(time*.008,time*.003);
            float density=cloudField(cp),densityBack=cloudField(cp+sunDir.xz*.17);
            float mask=smoothstep(.59-cloud*.22,.73-cloud*.18,density)*smoothstep(.01,.17,y);
            vec3 silver=mix(vec3(.68,.77,.76),vec3(.12,.22,.29),stars);
            silver=mix(silver,sunCol*(.65+pow(s,8.0)*.4),clamp((density-densityBack)*4.0+.3,0.0,1.0)*(1.0-stars));
            c=mix(c,silver,mask*.84);
            c+=sunCol*pow(s,32.0)*mask*.12*(1.0-stars);
          }
          if (rainbow > 0.0 && y > 0.0) { float a = acos(dot(d, -normalize(vec3(sunDir.x, 0.0, sunDir.z)))) ; float band = (a - 0.62) / 0.08;
            if (band > 0.0 && band < 1.0) c = mix(c, hue(band * 0.8), rainbow * 0.45 * sin(band * 3.1416) * smoothstep(0.0, 0.25, y)); }
          if(stars>0.0&&y>.05){
            vec2 sp=vec2(atan(d.z,d.x)*180.0,y*230.0),cell=floor(sp);
            float point=1.0-smoothstep(.03,.19,length(fract(sp)-.5));
            c+=vec3(.68,.82,1.0)*point*step(.993,h(cell))*stars*(1.0-grey)*(.7+.3*sin(time*.7+h(cell+1.0)*20.0));
          }
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.dome.renderOrder = -10; this.dome.frustumCulled = false; scene.add(this.dome);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const R = quality.shadowRange, sc = this.sun.shadow.camera; sc.left = sc.bottom = -R; sc.right = sc.top = R; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xbfe6ff, 80, 380);
    this.fogScale = quality.fogScale;
    this.#backdrop();

  }

  #backdrop() {
    this.backMat=new THREE.MeshBasicMaterial({vertexColors:true,fog:false,side:THREE.DoubleSide});
    this.backdrop=new THREE.Mesh(ridgeGeometry(),this.backMat);this.backdrop.renderOrder=-5;this.backdrop.frustumCulled=false;
    this.scene.add(this.backdrop);this.clouds=[];
  }
  #palette(e) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) if (e >= KEYS[i].e && e <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const k = e <= KEYS[0].e ? 0 : e >= KEYS[KEYS.length - 1].e ? 1 : (e - a.e) / (b.e - a.e);
    const o = this.palette; for (const key of ['top', 'hor', 'sun', 'hs', 'hg','fog']) o[key].copy(a[key]).lerp(b[key], k);
    o.sunI = a.sunI + (b.sunI - a.sunI) * k; o.hI = a.hI + (b.hI - a.hI) * k; return o;
  }

  /** @returns {{night:number, elev:number}} */
  update(dt, hour, W, focus, camera, flash = 0) {
    const t = ((hour - 6) / 12) * Math.PI, elev = Math.sin(t);
    const night = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.08);
    const pal = this.#palette(elev);
    const dir=this.direction.set(Math.cos(t),Math.max(elev,0.05)*1.2,0.45).normalize().lerp(this.moonDirection,night).normalize();
    this.sun.position.copy(focus).addScaledVector(dir, 120); this.sun.target.position.copy(focus);
    this.sun.color.copy(pal.sun); this.sun.intensity = pal.sunI * (1 - W.grey * 0.75);
    this.hemi.color.copy(pal.hs); this.hemi.groundColor.copy(pal.hg); this.hemi.intensity = pal.hI * (1 - W.grey * 0.15) + flash * 2.5;
    this.u.top.value.copy(pal.top); this.u.hor.value.copy(pal.hor); this.u.sunDir.value.copy(dir); this.u.sunCol.value.copy(pal.sun);
    this.u.stars.value = night; this.u.grey.value = W.grey * (1 - flash * 0.8); this.u.rainbow.value = W.rainbow * (1 - night);
    const fogc = this.fogColour.copy(pal.fog).lerp(this.stormColour,W.grey*.65);
    // high cameras (intro flyover, aerial shots) see across the valley: the haze thins with altitude
    const lift = camera ? Math.max(0, camera.position.y - focus.y - 40) / 45 : 0;
    this.scene.fog.color.copy(fogc); this.scene.fog.near = W.fogNear * this.fogScale * (1 + lift * 2); this.scene.fog.far = W.fogFar * (1 - night * 0.3) * this.fogScale * (1 + lift * 1.6);
    this.dome.position.copy(camera.position);
    this.backdrop.position.set(camera.position.x, 0, camera.position.z);
    const bright = 0.35 + 0.65 * (1 - night);
    this.backMat.color.setRGB(bright, bright, bright * (1 + night * 0.3)).lerp(fogc, 0.3 + W.grey * 0.4);
    this.u.cloud.value=W.cloud;
    U.uNight.value = night; U.uCloud.value = W.cloud;
    U.uCloudOff.value.x += dt * 0.02 * (0.4 + W.wind); U.uCloudOff.value.y += dt * 0.008;
    return { night, elev, fogFar: this.scene.fog.far };
  }
}
