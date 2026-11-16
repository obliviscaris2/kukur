/** Package the playable game with local Three.js dependencies for static hosting. */
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor/three', { recursive: true });
for (const path of ['src', 'styles', 'assets', 'sw.js']) await cp(path, `dist/${path}`, { recursive: true });
await cp('node_modules/three/build/three.module.min.js', 'dist/vendor/three/three.module.min.js');
await cp('node_modules/three/examples/jsm', 'dist/vendor/three/addons', { recursive: true });
await cp('node_modules/three/LICENSE', 'dist/vendor/three/LICENSE');
const html = (await readFile('index.html', 'utf8'))
  .replace('./node_modules/three/build/three.module.min.js', './vendor/three/three.module.min.js')
  .replace('./node_modules/three/examples/jsm/', './vendor/three/addons/');
await writeFile('dist/index.html', html);
await writeFile('dist/.nojekyll', '');
console.log('Static game packaged in dist/');
