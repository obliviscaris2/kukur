/**
 * Map tile worker: fetches a tile JSON and turns it into vertex buffers off the main thread.
 * Messages in:  { type: 'init', ctx }  then  { type: 'build', id, tx, tz, url }
 * Messages out: { type: 'built', id, result }  (typed arrays + ImageBitmap are transferred, not copied)
 */
import { buildTile } from './buildTile.js';

let ctx = null;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    const dens = m.ctx.densities;
    ctx = { ...m.ctx, density: (tx, tz) => dens[`${tx}_${tz}`] ?? 0 };
    return;
  }
  if (m.type === 'build') {
    try {
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`${m.url}: ${res.status}`);
      const tile = await res.json();
      const result = buildTile(tile, { ...ctx, tx: m.tx, tz: m.tz });
      self.postMessage({ type: 'built', id: m.id, result }, collectTransfers(result));
    } catch (err) {
      self.postMessage({ type: 'error', id: m.id, error: String(err?.stack || err) });
    }
  }
};

function collectTransfers(obj, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (ArrayBuffer.isView(obj)) { out.push(obj.buffer); return out; }
  if (obj instanceof ImageBitmap) { out.push(obj); return out; }
  for (const v of Array.isArray(obj) ? obj : Object.values(obj)) collectTransfers(v, out);
  return [...new Set(out)];
}
