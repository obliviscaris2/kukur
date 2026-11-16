/** Package the playable game and its main-thread/worker dependencies for static hosting. */
import { cp, mkdir, readFile, writeFile, rm, readdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor/three', { recursive: true });
for (const path of ['src', 'styles', 'assets', 'sw.js']) await cp(path, `dist/${path}`, { recursive: true });
await cp('node_modules/three/build/three.module.min.js', 'dist/vendor/three/three.module.min.js');
await cp('node_modules/three/examples/jsm', 'dist/vendor/three/addons', { recursive: true });
await cp('node_modules/three/LICENSE', 'dist/vendor/three/LICENSE');
await mkdir('dist/vendor/earcut', { recursive: true });
await cp('node_modules/earcut/src/earcut.js', 'dist/vendor/earcut/earcut.js');
await cp('node_modules/earcut/LICENSE', 'dist/vendor/earcut/LICENSE');
const workerModule = 'dist/src/world/tiles/buildTile.js';
await writeFile(workerModule, (await readFile(workerModule, 'utf8'))
  .replace('../../../node_modules/earcut/src/earcut.js', '../../../vendor/earcut/earcut.js'));
const html = (await readFile('index.html', 'utf8'))
  .replace('./node_modules/three/build/three.module.min.js', './vendor/three/three.module.min.js')
  .replace('./node_modules/three/examples/jsm/', './vendor/three/addons/');
await writeFile('dist/index.html', html);
await writeFile('dist/.nojekyll', '');
// Workers have no document import map. Validate their relative imports as well as the page modules.
async function validateModules(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) { await validateModules(file); continue; }
    if (!file.endsWith('.js')) continue;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(file), specifier);
      if (!target.startsWith(resolve('dist') + '/')) throw Error(`Module escapes static output: ${file}: ${specifier}`);
      try { await access(target); } catch { throw Error(`Missing published module: ${file}: ${specifier}`); }
    }
  }
}
await validateModules('dist/src');
console.log('Static game packaged in dist/');
