/** Sample real frame intervals and inclusive CPU costs without changing simulation time or camera. */
export async function profileFrames(app, seconds = 6) {
  const slots = [], costs = {}, frames = [], original = [];
  const visit = (object, prefix, names) => {
    for (const name of names) if (typeof object?.[name] === 'function') {
      const key = `${prefix}.${name}`, fn = object[name];
      costs[key] = { total: 0, calls: 0, max: 0 };
      original.push([object, name, fn]);
      object[name] = function (...args) {
        const start = performance.now();
        try { return fn.apply(this, args); } finally {
          const ms = performance.now() - start, c = costs[key];
          c.total += ms; c.calls++; c.max = Math.max(c.max, ms);
        }
      };
    }
  };
  for (const key of ['pup','cam','world','npcs','traffic','game','hud','minimap','bubbles','senses','fx','critters','audio']) visit(app[key], key, ['update']);
  visit(app.renderer,'renderer',['render']);
  visit(app.world.physics,'physics',['refreshBodies']);
  for (const [key,value] of Object.entries(app.world)) if (value && typeof value === 'object') visit(value, `world.${key}`, ['update']);
  const start = performance.now(); let last = start;
  try {
    await new Promise(resolve => {
      const tick = now => {
        frames.push(now-last); last=now;
        if (now-start >= seconds*1000) resolve(); else slots.push(requestAnimationFrame(tick));
      };
      slots.push(requestAnimationFrame(tick));
    });
    const sorted=frames.slice(1).sort((a,b)=>a-b), round=n=>+n.toFixed(2);
    return { fps:round((frames.length-1)*1000/(last-start-frames[0])), renderedFps:round(costs['renderer.render'].calls*1000/(last-start)), frameP50:round(sorted[Math.floor(sorted.length*.5)]), frameP95:round(sorted[Math.floor(sorted.length*.95)]), frames:frames.length,
      cpu:Object.entries(costs).map(([name,c])=>({name,msPerFrame:round(c.total/frames.length),calls:c.calls,max:round(c.max)})).sort((a,b)=>b.msPerFrame-a.msPerFrame).slice(0,18) };
  } finally { for (const [o,k,fn] of original) o[k]=fn; for(const id of slots)cancelAnimationFrame(id); }
}
