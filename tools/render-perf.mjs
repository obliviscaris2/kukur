/** Measure actual GPU execution with timer queries, plus CPU submission time; restore the live renderer on every exit. */
export async function measureRender(app, seconds = 3) {
  const R = app.renderer,
    gl = R.renderer.getContext(),
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    original = R.render;
  const pending = [],
    gpu = [],
    cpu = [];
  let frames = 0;
  const poll = () => {
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
      pending.splice(i, 1);
    }
  };
  const mean = (list) => list.reduce((sum, n) => sum + n, 0) / Math.max(1, list.length),
    round = (n) => +n.toFixed(2);
  R.render = function (scene) {
    if (ext) poll();
    const q = ext && pending.length < 64 ? gl.createQuery() : null;
    if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    const start = performance.now();
    try {
      original.call(this, scene);
    } finally {
      if (q) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push(q);
      } else if (!ext) gl.finish();
      cpu.push(performance.now() - start);
      frames++;
    }
  };
  try {
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => (performance.now() - start < seconds * 1000 || frames < 20 ? requestAnimationFrame(tick) : resolve());
      requestAnimationFrame(tick);
    });
    R.render = original;
    const end = performance.now();
    while (pending.length && performance.now() - end < 2000) {
      poll();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const samples = ext ? gpu : cpu,
      sorted = [...samples].sort((a, b) => a - b);
    if (!samples.length) throw Error('GPU timer returned no valid samples');
    return {
      gpuMs: round(mean(samples)),
      p95: round(sorted[Math.floor((sorted.length - 1) * 0.95)]),
      cpuMs: round(mean(cpu)),
      method: ext ? 'GPU timer query' : 'gl.finish fallback',
      samples: samples.length,
      drawCalls: R.renderer.info.render.calls,
      triangles: R.renderer.info.render.triangles,
      scale: R.scale,
      gpu: R.gpu,
    };
  } finally {
    R.render = original;
    for (const q of pending) gl.deleteQuery(q);
  }
}
