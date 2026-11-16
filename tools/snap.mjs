#!/usr/bin/env node
/**
 * Headless test driver: opens the game in Chrome (real GPU), runs a script of steps, prints results and saves
 * screenshots. Great for checking a change without clicking around, and for AI assistants that can't see the screen.
 *
 *   node tools/snap.mjs <url> <steps.json> [outDir]
 *   e.g. npm run dev  &&  node tools/snap.mjs http://localhost:5173/ tools/snaps/smoke.json
 *
 * steps.json is an array run in order; each step may have:
 *   { "wait": 3 }                         seconds
 *   { "eval": "js expression", "label": "x" }   runs in the page (promises are awaited); result is printed
 *   { "shot": "name.png" }                saves a screenshot into outDir (default: tools/snaps/out/)
 *   { "key": "KeyW", "hold": 1.5 }        presses a key (optionally holding it)
 *   { "until": "js expression", "timeout": 30, "label": "x" }   polls (every 250 ms) until it is truthy; prints how long it took
 * In the page, window.__app is the App (see src/app/App.js): __app.pup, __app.world, __app.npcs, __app.cam …
 * Env: CHROME=/path/to/chrome   PORT=9335   SIZE=1280x720
 */
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [,, url, stepFile, outArg] = process.argv;
if (!url || !stepFile) { console.log('usage: node tools/snap.mjs <url> <steps.json> [outDir]'); process.exit(1); }
const steps = JSON.parse(readFileSync(stepFile, 'utf8'));
const out = outArg || new URL('./snaps/out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = Number(process.env.PORT || 9335), [W, H] = (process.env.SIZE || '1280x720').split('x').map(Number);
// a Chrome left over from a killed run would still own the port (and its old localStorage): refuse instead of reusing it
try { await fetch(`http://127.0.0.1:${port}/json/version`); console.error(`port ${port} is busy (a leftover headless Chrome?): pkill -f remote-debugging-port=${port}`); process.exit(2); } catch { /* free */ }
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => done(130));
const profile = mkdtempSync(join(tmpdir(), 'kukur-snap-'));     // fresh profile each run = no stale module cache
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-angle=gl', '--enable-gpu',
  '--ignore-gpu-blocklist', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => { try { chrome.kill('SIGKILL'); } catch { /* gone */ } try { rmSync(profile, { recursive: true, force: true }); } catch { /* busy */ } process.exit(code); };

let targets = [];
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === 'page')) break; } catch { /* starting */ } await sleep(200); }
const page = targets.find((t) => t.type === 'page');
if (!page) { console.error('Chrome did not start (set CHROME=/path/to/chrome)'); done(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0, failed = false; const pending = new Map(), reportedErrors = new Set();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type !== 'debug') {
    if (d.params.type === 'error') failed = true;
    console.log(`[console.${d.params.type}]`, d.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 600));
  }
  if (d.method === 'Runtime.exceptionThrown') {
    failed = true;
    const ed = d.params.exceptionDetails;
    const signature = ed.exception?.description || ed.text;
    if (reportedErrors.has(signature)) return;
    reportedErrors.add(signature);
    console.log('[EXCEPTION]', (ed.exception?.description || ed.text).slice(0, 800));
    console.log('[STACK]', (ed.stackTrace?.callFrames || []).slice(0, 5).map((f) => `${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`).join(' < '));
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
for (const s of steps) {
  if (s.wait) await sleep(s.wait * 1000);
  if (s.until) {
    const t0 = Date.now(), limit = (s.timeout || 30) * 1000; let ok = false;
    while (Date.now() - t0 < limit) { const r = await send('Runtime.evaluate', { expression: `!!(${s.until})`, returnByValue: true }); if (r.result?.result?.value) { ok = true; break; } await sleep(250); }
    console.log('[until]', s.label || s.until.slice(0, 60), ok ? `ok after ${((Date.now() - t0) / 1000).toFixed(1)}s` : `TIMEOUT after ${s.timeout || 30}s`);
    if (!ok) failed = true;
  }
  if (s.eval) {
    const r = await send('Runtime.evaluate', { expression: s.eval, awaitPromise: true, returnByValue: true });
    const ex = r.result?.exceptionDetails, v = r.result?.result?.value;
    if (ex) failed = true;
    console.log('[eval]', s.label || '', ex ? 'ERROR ' + (ex.exception?.description || ex.text) : JSON.stringify(v)?.slice(0, 1000));
  }
  if (s.shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, s.shot), Buffer.from(r.result.data, 'base64')); console.log('[shot]', join(out, s.shot)); }
  if (s.key) for (const type of ['keyDown', 'keyUp']) { await send('Input.dispatchKeyEvent', { type, code: s.key, key: s.key }); if (type === 'keyDown' && s.hold) await sleep(s.hold * 1000); }
}
ws.close();
done(failed ? 1 : 0);
