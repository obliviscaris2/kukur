/**
 * WebGL renderer setup: picks a quality preset (config/quality.js, 'auto' = GPU detection) and keeps the
 * frame rate steady with adaptive resolution.
 */
import * as THREE from 'three';
import { QUALITY, ADAPTIVE, POST, MYTHIC } from '../config/index.js';
import { Post } from './Post.js';
import { settings } from '../core/settings.js';
import { U } from './toon.js';

// Preserve the same minimum drawing-buffer budget on large windows; the HTML HUD stays native resolution.
export const viewportScale = (width, height) => Math.min(1, Math.sqrt(ADAPTIVE.referencePixels / Math.max(1, width * height)));

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    const url = new URLSearchParams(location.search);
    let name = url.get('quality') || settings.get('quality');
    if (name === 'auto' || !QUALITY[name]) name = /intel|hd graphics|uhd|swiftshader|llvmpipe|mali|adreno|powervr|apple gpu/i.test(this.gpu) ? 'low' : 'medium';
    this.quality = { ...QUALITY[name], name };
    // The context has no MSAA; the existing post composite filters silhouette edges (POST.antialias).
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, powerPreference: 'high-performance' }));
    this.fixedScale = url.has('scale');
    this.scale = this.fixedScale ? +url.get('scale') : this.quality.pixelRatio * (name === 'low' ? viewportScale(innerWidth, innerHeight) : 1);
    r.setPixelRatio(Math.min(this.scale, devicePixelRatio * 1.5));
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;r.shadowMap.autoUpdate=false;this.shadowAt=-Infinity;
    r.shadowMap.type = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, pcfsoft: THREE.PCFSoftShadowMap }[this.quality.shadowType];
    this.camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.05, 6000);
    addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
    this._acc = { t: 0, n: 0 };
    r.info.autoReset = false;   // stats cover the whole frame (scene + post passes)
    this.post = POST.enabled && !new URLSearchParams(location.search).has('nopost') ? new Post(r) : null;
  }
  /** Compile the destination behind loading/fade overlays, and render one complete lit frame before revealing it. */
  async prepare(scene) {
    scene.updateMatrixWorld(true); this.camera.updateMatrixWorld();
    // compileAsync traverses even hidden objects. Warm only the actual view; unused streamed
    // props and distant district variants otherwise made the loading screen wait for dozens of shaders.
    const warm = new THREE.Scene(), view = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));
    const seen = new Set();
    scene.traverseVisible(object => {
      if (!object.material || object.count===0 || (object.frustumCulled && !view.intersectsObject(object))) return;
      const key = object.material.uuid+':'+object.type+':'+!!object.instanceColor;
      if (seen.has(key)) return;
      seen.add(key); warm.add(object.clone(false));
    });
    await this.renderer.compileAsync(warm, this.camera, scene);
    this.shadowAt = -Infinity;
    this.render(scene);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  /** Nudge the render scale to keep FPS between ADAPTIVE.lowFps and ADAPTIVE.highFps. */
  adapt(dt) {
    if (this.fixedScale) return;
    const a = this._acc; a.t += dt; a.n++;
    if (a.t < ADAPTIVE.every) return;
    const fps = a.n / a.t; this._acc = { t: 0, n: 0 };
    const old = this.scale;
    if (fps < ADAPTIVE.lowFps) this.scale = Math.max(ADAPTIVE.minScale * viewportScale(innerWidth, innerHeight), this.scale - ADAPTIVE.step);
    else if (fps > ADAPTIVE.highFps) this.scale = Math.min(this.quality.maxPixelRatio, this.scale + ADAPTIVE.step * 0.6);
    if (old !== this.scale) this.renderer.setPixelRatio(this.scale);
  }
  render(scene) {
    const now=performance.now();if(now-this.shadowAt>1000/MYTHIC.performance.shadowHz){this.renderer.shadowMap.needsUpdate=true;this.shadowAt=now;}
    this.renderer.getDrawingBufferSize(U.uViewport.value); this.renderer.info.reset(); if (this.post) this.post.render(scene, this.camera); else this.renderer.render(scene, this.camera); }
}
