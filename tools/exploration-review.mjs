/** Browser audit: reach wish-tree perches with the real pup controller, claim once, and inspect streamed gardens. */
import * as THREE from 'three';

export async function visitGrove(app,name) {
  const d=app.world.gazetteer.destinations.find(d=>d.name===name);if(!d)throw Error('Unknown destination '+name);
  await app.respawnAt(d.x,d.z);app.pup.cancelPose();app.pup.control=true;
  const start=performance.now();
  while(!app.game.exploration.sites.some(s=>s.name===name)&&performance.now()-start<7000)await new Promise(r=>setTimeout(r,100));
  const s=app.game.exploration.sites.find(s=>s.name===name);if(!s)throw Error('No safe wish-tree site near '+name);
  return s;
}

export function climbGrove(app,site) {
  const pup=app.pup,world=app.world,state=app.state,calm=app.storyCalm;
  app.state='paused';app.storyCalm=true;pup.control=true;pup.cancelPose();
  const first=site.stones[0];pup.placeAt(first.x+1.6,first.z,-Math.PI/2,world);
  const input={axis:()=>({x:0,y:1}),hit:()=>false,down:()=>false,walk:true,run:false};
  let ticks=0,mantles=0;
  try {
    for(const step of site.stones){
      for(let i=0;i<300;i++){
        const dx=step.x-pup.pos.x,dz=step.z-pup.pos.z,d=Math.hypot(dx,dz),heading=Math.atan2(dx,dz);
        input.axis=()=>({x:0,y:d>.12?1:0});
        pup.update(1/60,input,{yaw:heading+Math.PI},world,0);ticks++;if(pup.mantle)mantles++;
        if(d<.18&&Math.abs(pup.pos.y-(step.y+step.h))<.045&&pup.grounded)break;
      }
    }
    const g=app.game.exploration,prompt=g.prompt(pup.pos);
    if(!prompt)throw Error(`Perch unreachable: pup ${pup.pos.toArray()}, perch ${JSON.stringify(site.perch)}`);
    const first=!g.found.has(site.id),result=g.interact(pup);if(!g.found.has(site.id))throw Error('Discovery was not persisted');
    const found=g.found.size;g.time+=5;g.interact(pup);if(g.found.size!==found)throw Error('Repeat visit duplicated discovery');
    return {name:site.name,ticks,mantles,first,prompt,result,at:pup.pos.toArray()};
  } finally {app.state=state;app.storyCalm=calm;}
}

export function frameGrove(app,site,hour=17) {
  app.world.weather.hour=hour;app.world.weather.set('sunny',true);app.pup.cancelPose();app.pup.control=false;
  const physics=app.world.physics;
  for(let i=0;i<32;i++){
    const a=.7+i*Math.PI*2/32,dx=Math.sin(a),dz=Math.cos(a),x=site.x+dx*2.3,z=site.z+dz*2.3;
    const eye=new THREE.Vector3(site.x+dx*5.2,site.y+1.8,site.z+dz*5.2),target=new THREE.Vector3(site.x+dx*.95,site.y+1.6,site.z+dz*.95);
    if(physics.solidAt(x,app.world.heightAt(x,z)+.3,z)||physics.sweepSphere(eye,target,.2)<1)continue;
    app.pup.placeAt(x,z,a+Math.PI,app.world);
    app.cam.pivot.copy(app.pup.pos).y+=.4;app.cam.lastPup.copy(app.pup.pos);
    app.camera.position.copy(eye);app.camera.lookAt(target);app.cam.lookPoint.copy(target);app.cam.lookInit=true;
    app.cam.setShot(eye,target);app.cam.shotK=1;app.cam.travel.reset(eye,target);return;
  }
  // Tight courtyards still get the normal collision-aware player view.
  app.pup.placeAt(site.perch.x,site.perch.z,0,app.world);app.pup.pos.y=site.perch.y;app.cam.placeBehind(app.pup,physics);
}
