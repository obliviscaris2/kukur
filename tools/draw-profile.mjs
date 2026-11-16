/** Attribute GPU time to material families for one live frame; diagnostic only, with complete query cleanup. */
export async function profileDraws(app) {
  const renderer=app.renderer.renderer,gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!ext)return {unsupported:true};
  const original=renderer.renderBufferDirect,pending=[],sums={};let active=true;
  renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
    if(!active)return original.call(this,camera,scene,geometry,material,object,group);
    const name=material.isMeshDepthMaterial?'shadow':object.name||material.customProgramCacheKey().slice(0,42),q=gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT,q);
    try{return original.call(this,camera,scene,geometry,material,object,group);}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({q,name});}
  };
  try{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));active=false;renderer.renderBufferDirect=original;
    const start=performance.now();
    while(pending.length&&performance.now()-start<4000){
      for(let i=pending.length-1;i>=0;i--){const {q,name}=pending[i];if(!gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE))continue;
        if(!gl.getParameter(ext.GPU_DISJOINT_EXT)){const s=sums[name]??={ms:0,calls:0};s.ms+=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;s.calls++;}
        gl.deleteQuery(q);pending.splice(i,1);
      }
      await new Promise(r=>setTimeout(r,20));
    }
    return Object.entries(sums).map(([name,s])=>({name,ms:+s.ms.toFixed(2),calls:s.calls})).sort((a,b)=>b.ms-a.ms).slice(0,14);
  }finally{active=false;renderer.renderBufferDirect=original;for(const {q} of pending)gl.deleteQuery(q);}
}
