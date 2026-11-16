/** Bounded, wind-driven veils beneath trees and temple lights; one instanced draw, no ray marching or extra lights. */
import * as THREE from 'three';
import { MYTHIC } from '../../config/index.js';
import { U } from '../../render/toon.js';

export class Atmosphere {
  constructor(scene){
    const cfg=MYTHIC.atmosphere;
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{uTime:U.uTime,uNight:U.uNight,uWind:U.uWind,uNoise:U.uNoise,uRight:{value:new THREE.Vector3(1,0,0)},uStrength:{value:cfg.mistOpacity}},
      vertexShader:`attribute vec2 veil;varying vec2 vUv;varying vec3 vTint;varying float vKind,vDistance;uniform vec3 uRight;uniform float uTime,uWind;
        void main(){vUv=uv;vKind=veil.x;vTint=instanceColor;vec3 anchor=instanceMatrix[3].xyz;
          float width=length(instanceMatrix[0].xyz),height=length(instanceMatrix[1].xyz);
          vec3 p=anchor+uRight*(position.x*width+sin(uTime*.12+veil.y)*.45*uWind)+vec3(0,position.y*height,0);
          if(vKind>.5)p+=uRight*position.y*.65;
          vec4 mv=modelViewMatrix*vec4(p,1);vDistance=-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform sampler2D uNoise;uniform float uTime,uNight,uStrength;varying vec2 vUv;varying vec3 vTint;varying float vKind,vDistance;
        void main(){vec2 p=vUv*2.0-1.0;float edge=pow(max(0.0,1.0-dot(p,p)),2.0);
          float grain=texture2D(uNoise,(vUv*vec2(5.0,2.0)+vec2(uTime*.035,uTime*.012))/128.0).r;
          float fade=smoothstep(2.5,6.0,vDistance)*(1.0-smoothstep(28.0,45.0,vDistance));
          float alpha=edge*fade*uStrength*(.4+grain*.9)*mix(.4,1.0,uNight);
          if(vKind>.5)alpha*=1.5*(1.0-abs(p.x));
          gl_FragColor=vec4(vTint,alpha);
          #include <colorspace_fragment>
        }`});
    const geometry=new THREE.PlaneGeometry(1,1);
    this.veils=new THREE.InstancedBufferAttribute(new Float32Array(cfg.mistCount*2),2);
    geometry.setAttribute('veil',this.veils);
    this.mesh=new THREE.InstancedMesh(geometry,this.material,cfg.mistCount);this.mesh.count=0;this.mesh.visible=false;this.mesh.frustumCulled=false;this.mesh.renderOrder=4;scene.add(this.mesh);
    this.matrix=new THREE.Matrix4();this.position=new THREE.Vector3();this.scale=new THREE.Vector3();this.rotation=new THREE.Quaternion();this.colour=new THREE.Color();this.last=new THREE.Vector3(1e6,0,0);this.timer=0;
  }
  update(dt,{focus,camera,props,lights,heightAt,solidAt}){
    const e=camera.matrixWorld.elements;this.material.uniforms.uRight.value.set(e[0],0,e[2]).normalize();
    this.timer-=dt;if(this.timer>0&&this.last.distanceToSquared(focus)<9)return;
    this.timer=.8;this.last.copy(focus);let count=0;const cfg=MYTHIC.atmosphere;
    const add=(x,y,z,width,height,kind,colour)=>{
      if(count>=cfg.mistCount||solidAt(x,y,z))return;
      this.matrix.compose(this.position.set(x,y,z),this.rotation,this.scale.set(width,height,1));this.mesh.setMatrixAt(count,this.matrix);
      this.mesh.setColorAt(count,this.colour.set(colour));this.veils.setXY(count,kind,x*.73+z*.29);count++;
    };
    for(const [x,,z,kind,scale] of props.treesNear(focus,cfg.mistRadius,10)){
      const y=heightAt(x,z);add(x,y+.8,z,7+scale*2,1.7,0,'#789e9b');
      if(kind===2||kind===0)add(x+.8,y+2.6,z+.6,1.3,4.5,1,cfg.glow);
    }
    for(const light of lights||[]){const p=light.position;if(p.distanceToSquared(focus)<900)add(p.x,p.y+.75,p.z,1.5,2.0,1,cfg.warm);}
    this.mesh.count=count;this.mesh.visible=count>0;this.mesh.instanceMatrix.needsUpdate=true;this.veils.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
}
