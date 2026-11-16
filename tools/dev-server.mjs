#!/usr/bin/env node
// Minimal static dev server (no dependencies): `npm run dev` then open http://localhost:5173
// Serves the project root with correct MIME types and gzip for JSON/JS (map tiles compress ~4x).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) throw new Error('outside root');
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    let body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
    if (/json|javascript|css|html/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
    res.writeHead(200, headers); res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log(`KUKUR dev server: http://localhost:${PORT}`));
