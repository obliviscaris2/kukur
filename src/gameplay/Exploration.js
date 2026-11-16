/** Streamed climbing gardens and wish-tree discoveries across the valley; touch responses share the existing FX pool. */
import * as THREE from 'three';
import { EXPLORATION as C, MYTHIC } from '../config/index.js';
import { hash, rng } from '../core/rng.js';
import { events } from '../core/events.js';
import { toon } from '../render/toon.js';
import { SURFACE_NORMAL } from '../render/surfaceLibrary.js';
import { natureMaterial, natureDepth } from '../render/natureMaterial.js';
import { gardenGeometry } from '../world/props/natureGeometry.js';
import { stoneGeometry,logGeometry,discoveryTreeGeometry,soilGeometry,registerStone,registerLog } from '../world/props/explorationGeometry.js';

export class Exploration {
  constructor({scene,world,fx,audio,hud,pickups,journal}) {
    Object.assign(this,{world,fx,audio,hud,pickups,journal});
    this.tiles=new Map();this.active=new Map();this.places=new Map();this.sites=[];this.refresh=0;this.steps=0;this.touch=new Map();this.time=0;this.epoch=0;this.attempted=new Map();
    try {this.found=new Set(JSON.parse(localStorage.getItem('kukur.wishTrees.v1')||'[]'));}catch{this.found=new Set();}
    const field=(geometry,material,cap,shadow=false)=>{
      const mesh=new THREE.InstancedMesh(geometry,material,cap);mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.castShadow=shadow;mesh.receiveShadow=true;scene.add(mesh);return mesh;
    };
    this.stones=field(stoneGeometry(),toon('#ffffff',{key:'explore-stone',surface:'stone'}),C.maxClusters*3+C.maxSites*3,true);
    this.logs=field(logGeometry(),toon(C.bark,{key:'explore-log',surface:'wood'}),C.maxClusters,true);
    this.gardens=field(gardenGeometry(),natureMaterial('discovery-garden'),C.maxClusters*3+C.maxSites*8);
    this.soil=new THREE.Mesh(new THREE.BufferGeometry(),toon('#ffffff',{
      key:'discovery-soil',rim:0,params:{transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4},
      vertexHead:'varying vec2 vBed;',vertexMain:'vBed=uv;',fragHead:'varying vec2 vBed;float surfaceHeight=0.0;',
      fragMap:`vec3 soilPaint=texture2D(uEarth,vCloudP/${MYTHIC.surface.earth.toFixed(2)}).rgb;
        diffuseColor.rgb=soilPaint*(.94+.12*tNoise(vCloudP*.5));surfaceHeight=dot(soilPaint,vec3(.2126,.7152,.0722));
        diffuseColor.a*=1.0-smoothstep(.78,1.04,length(vBed)+(tNoise(vCloudP*4.0)-.5)*.14);
        if(diffuseColor.a<.02)discard;`,normalMap:SURFACE_NORMAL,
    }));
    this.soil.visible=false;this.soil.receiveShadow=true;scene.add(this.soil);this.soilKey='';
    this.trees=[false,true].map(gold=>{
      const mat=natureMaterial('wish-tree-'+gold,'tree');
      const mesh=field(discoveryTreeGeometry(gold),mat,C.maxSites,true);mesh.customDepthMaterial=natureDepth();return mesh;
    });
    this.matrix=new THREE.Matrix4();this.quat=new THREE.Quaternion();this.scale=new THREE.Vector3();this.point=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);this.colour=new THREE.Color();this.last=new THREE.Vector3(1e9,0,0);
    world.onTile((ev,t)=>{
      if(ev==='load'){
        const trees=t.data.props.trees,list=[],r=rng(hash('exploration',t.key));
        for(let i=0;i<trees.length&&list.length<C.candidatesPerTile;i+=5){
          if(r()>.2)continue;
          const angle=r()*Math.PI*2;
          list.push({id:'garden:'+t.key+':'+i,x:trees[i]+Math.cos(angle)*4,z:trees[i+2]+Math.sin(angle)*4,angle,kind:r()<.5?'log':'stones'});
        }
        this.tiles.set(t.key,list);
      }else this.tiles.delete(t.key);
      this.refresh=0;this.epoch++;
    });
    events.on('bark',pos=>{
      for(const o of this.active.values())if(Math.hypot(o.x-pos.x,o.z-pos.z)<5){
        this.point.set(o.x,o.y+(o.kind==='wish'?2.6:.25),o.z);
        this.fx.burst('leaf',this.point,o.kind==='wish'?10:5,{colors:['#e7c0d7','#a9d3cf','#f5dfa3'],size:.055,spread:1.4,speed:.45,up:.6,life:2.5});
      }
    });
  }

  #ready(x,z) { const size=this.world.manifest.tileSize;return this.world.streamer.tiles.get(`${Math.floor(x/size)}_${Math.floor(z/size)}`)?.state==='ready'; }
  #clear(x,z,r) {
    const w=this.world,y=w.terrain(x,z);
    if(!this.#ready(x-r,z-r)||!this.#ready(x+r,z+r)||w.waterAt(x,z)!==null)return false;
    if(!w.physics.isBoxFree({x,y:y+.04,z,heading:0,halfWidth:r,halfLength:r,height:6},.08))return false;
    for(const [dx,dz] of [[-r,-r],[r,-r],[r,r],[-r,r],[0,0]])if(Math.abs(w.terrain(x+dx,z+dz)-y)>C.maxSlope||w.waterAt(x+dx,z+dz)!==null)return false;
    for(const t of w.streamer.ready())for(const n of t.data.navs)for(let i=2;i<n.pts.length;i+=2){
      const ax=n.pts[i-2],az=n.pts[i-1],dx=n.pts[i]-ax,dz=n.pts[i+1]-az;
      const s=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1),0,1);
      if(Math.hypot(x-ax-dx*s,z-az-dz*s)<n.w/2+r+.4)return false;
    }
    return true;
  }
  #site(destination) {
    if(this.places.has(destination.name))return this.places.get(destination.name);
    if(this.world.landmarkLoads.size||!this.#ready(destination.x,destination.z))return null;
    if(this.attempted.get(destination.name)===this.epoch)return null;
    this.attempted.set(destination.name,this.epoch);
    const seed=hash(destination.name),angle=seed*.01;
    for(let i=0;i<72;i++){
      const a=angle+i*2.399963,r=12+(destination.size||8)*.55+i*.9;
      const x=destination.x+Math.cos(a)*r,z=destination.z+Math.sin(a)*r;
      if(!this.#clear(x,z,C.placementRadius))continue;
      const site={id:'wish:'+destination.name,name:destination.name,x,z,y:this.world.terrain(x,z),angle:a,kind:'wish',golden:seed%2};
      this.places.set(destination.name,site);return site;
    }
    return null;
  }
  #push(mesh,p,sx,sy,sz,angle=0,col=null) {
    const i=mesh.count;if(i>=mesh.instanceMatrix.count)return;
    this.quat.setFromAxisAngle(this.up,angle);this.scale.set(sx,sy,sz);this.point.set(p.x,p.y,p.z);
    mesh.setMatrixAt(i,this.matrix.compose(this.point,this.quat,this.scale));if(col)mesh.setColorAt(i,this.colour.set(col));mesh.count++;
  }
  #build(o) {
    const owner=o.id,p=this.world.physics;
    const point=(dx,dz)=>({x:o.x+dx,y:this.world.terrain(o.x+dx,o.z+dz),z:o.z+dz});
    o.y=this.world.terrain(o.x,o.z);o.stones=[];
    if(o.kind==='wish'){
      p.addCircle(owner,o.x,o.z,.42,o.y+3.5,o.y-.2);
      // A curved approach ends at a perch beside the trunk, not through it.
      for(let i=0;i<3;i++){
        const q=point(2.5-i*.75,1.35+Math.sin(i)*.38),h=C.stepHeights[i];
        registerStone(p,owner,q,C.stepRadius,h);o.stones.push({...q,h});
      }
      o.perch={...o.stones[2],y:o.stones[2].y+C.stepHeights[2]};
    }else if(o.kind==='stones'){
      for(let i=0;i<3;i++){
        const q=point(Math.cos(o.angle)*(i-1)*1.1,Math.sin(o.angle)*(i-1)*1.1),h=C.stepHeights[i];
        registerStone(p,owner,q,C.stepRadius,h);o.stones.push({...q,h});
      }
    }else registerLog(p,owner,o,o.angle);
  }
  #refresh(pos) {
    const next=new Map();this.sites=[];
    const destinations=this.world.gazetteer.destinations.filter(d=>C.siteIcons.includes(d.icon)&&Math.hypot(d.x-pos.x,d.z-pos.z)<C.radius+100).sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z));
    for(const d of destinations){
      if(this.sites.length>=C.maxSites)break;
      const site=this.#site(d);if(site&&Math.hypot(site.x-pos.x,site.z-pos.z)<C.radius+25){this.sites.push(site);next.set(site.id,site);}
    }
    let count=0;
    for(const candidates of this.tiles.values())for(const o of candidates){
      if(count>=C.maxClusters||Math.hypot(o.x-pos.x,o.z-pos.z)>C.radius)continue;
      if(this.sites.some(s=>Math.hypot(s.x-o.x,s.z-o.z)<9))continue;
      if(!this.active.has(o.id)&&(!this.#clear(o.x,o.z,2)||[...next.values()].some(s=>Math.hypot(s.x-o.x,s.z-o.z)<5)))continue;
      next.set(o.id,o);count++;
    }
    for(const [id] of this.active)if(!next.has(id)){this.world.physics.removeOwner(id);this.touch.delete(id);}
    for(const [id,o] of next)if(!this.active.has(id))this.#build(o);
    this.active=next;
    const soilKey=this.sites.map(s=>s.id).join('|');
    if(soilKey!==this.soilKey){
      this.soilKey=soilKey;this.soil.geometry.dispose();this.soil.geometry=soilGeometry(this.sites,(x,z)=>this.world.terrain(x,z));this.soil.visible=this.sites.length>0;
    }
    const meshes=[this.stones,this.logs,this.gardens,...this.trees];for(const m of meshes)m.count=0;
    for(const o of next.values()){
      for(const s of o.stones)this.#push(this.stones,s,C.stepRadius,s.h,C.stepRadius,0,C.stone[hash(o.id)%3]);
      if(o.kind==='log')this.#push(this.logs,o,1,1,1,o.angle);
      if(o.kind==='wish')this.#push(this.trees[o.golden],o,1.05,1.05,1.05,o.angle);
      const n=o.kind==='wish'?8:3;
      for(let i=0;i<n;i++){
        const a=i*2.399963+o.angle,r=o.kind==='wish'?2.7:1.7,x=o.x+Math.cos(a)*r,z=o.z+Math.sin(a)*r;
        this.#push(this.gardens,{x,y:this.world.terrain(x,z),z},1.3,1.2,1.3,a);
      }
    }
    for(const m of meshes){m.visible=m.count>0;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
  }
  nearest(pos) {return this.sites.find(s=>s.perch&&Math.hypot(s.perch.x-pos.x,s.perch.z-pos.z)<C.interactRadius&&Math.abs(s.perch.y-pos.y)<.23);}
  prompt(pos) {const site=this.nearest(pos);return site?(this.found.has(site.id)?'Rest with the junkiris':'Make a wish beneath the glowing tree'):'';}
  interact(pup) {
    const s=this.nearest(pup.pos);if(!s)return null;
    if((s.cooldown||0)>this.time)return 'The junkiris are settling back into the leaves.';
    s.cooldown=this.time+4;pup.startPose('Sit',2);pup.setMood('happy',4);pup.stamina=1;
    this.audio.bell(4);this.fx.burst('sparkle',new THREE.Vector3(s.perch.x,s.perch.y+.45,s.perch.z),24,{colors:['#a6e8e3','#ffe6ad','#d8baff'],up:1.2,speed:.7,size:.045,life:2.5});
    events.emit('wishTree',{name:s.name,pos:pup.pos.clone(),first:!this.found.has(s.id)});
    if(this.found.has(s.id))return 'A quiet moment. The junkiris dance around your ears.';
    this.found.add(s.id);try{localStorage.setItem('kukur.wishTrees.v1',JSON.stringify([...this.found]));}catch{/* private mode */}
    this.pickups.drop('biscuit',new THREE.Vector3(s.perch.x,s.perch.y+.25,s.perch.z));
    this.journal.write('✧',`Found a wish tree near ${s.name}. For a moment, even the little lights stopped to listen.`);
    return `A little wonder near ${s.name}. You found a treat among the blossoms!`;
  }
  scents(pos) {return this.sites.filter(s=>!this.found.has(s.id)&&Math.hypot(s.x-pos.x,s.z-pos.z)<40).map(s=>({p:new THREE.Vector3(s.x,s.y+.3,s.z),c:new THREE.Color('#9ce0da'),up:.7}));}
  update(dt,pup) {
    this.time+=dt;this.refresh-=dt;
    if(this.refresh<=0||this.last.distanceToSquared(pup.pos)>100){this.refresh=C.refresh;this.#refresh(pup.pos);this.last.copy(pup.pos);}
    this.bloom=(this.bloom||0)-dt;
    if(this.bloom<=0){
      this.bloom=C.bloomCooldown;
      for(const s of this.sites)if(Math.hypot(s.x-pup.pos.x,s.z-pup.pos.z)<22){
        const a=this.time*.6;this.point.set(s.x+Math.cos(a)*1.8,s.y+2.9,s.z+Math.sin(a)*1.8);
        this.fx.burst('sparkle',this.point,2,{colors:s.golden?['#ffe3a1','#fff5d4']:['#ade4eb','#d6c3f3'],size:.035,up:.12,speed:.12,life:2.6});
      }
    }
    for(const o of this.active.values()){
      const d=Math.hypot(o.x-pup.pos.x,o.z-pup.pos.z);
      if(d>3||pup.speed<.2||(this.touch.get(o.id)||0)>this.time)continue;
      this.touch.set(o.id,this.time+C.touchCooldown);
      this.point.set(pup.pos.x,pup.pos.y+.12,pup.pos.z);
      this.fx.burst('leaf',this.point,5,{colors:o.kind==='wish'?['#9ccee0','#d6b7ed','#f7dda5']:['#b9be7c','#dbc387'],speed:.6,up:.75,size:.06,life:1.4});
      if(o.kind==='wish')this.fx.burst('sparkle',this.point,5,{colors:['#a6e8d5','#fff1b8'],size:.035,speed:.5,up:.8,life:1.6});
    }
    // No accumulating per-step emitters: a handful of particles reuse the shared bounded pool.
    if(pup.grounded&&!pup.swimming&&pup.speed>.8){
      this.steps+=pup.speed*dt;if(this.steps>C.stepDistance){
        this.steps%=C.stepDistance;const kind=this.world.surfaceAt(pup.pos.x,pup.pos.z,pup.pos.y);
        this.point.copy(pup.pos);this.point.y+=.035;
        if(['grass','forest','park','garden','scrub','orchard'].includes(kind))this.fx.burst('leaf',this.point,2,{colors:['#a7b67a','#c3cc9a'],size:.035,up:.45,speed:.35,life:.7});
        else if(kind==='earth'||kind==='farmland')this.fx.burst('dust',this.point,2,{colors:['#c7ad87','#dfc8a4'],size:.045,up:.25,speed:.2,life:.5});
      }
    }
  }
}
