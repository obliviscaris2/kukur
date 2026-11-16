/** Rebuild each local dog silhouette with Blender, using the same rig and named animation clips. */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
for (const variant of ['village', 'bhote', 'spitz']) {
  const child = spawn(
    'blender',
    ['-b', '-noaudio', '--factory-startup', '--python', 'pipeline/blender/pup.py', '--', `--variant=${variant}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let exported = false,
    tail = '',
    shutdown;
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    tail = (tail + chunk).slice(-2000);
    if (!exported && tail.includes('DOG EXPORTED')) {
      exported = true;
      shutdown = setTimeout(() => child.kill('SIGKILL'), 3000);
    }
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const code = await new Promise((resolve) => child.on('exit', resolve));
  clearTimeout(shutdown);
  // Some headless PulseAudio setups hang during Blender shutdown after a successful export.
  if (code !== 0 && !exported) process.exit(code || 1);
  const name = { village: 'pup', bhote: 'bhote', spitz: 'spitz' }[variant],
    buf = readFileSync(`assets/models/${name}.glb`);
  if (buf.toString('ascii', 0, 4) !== 'glTF' || buf.readUInt32LE(8) !== buf.length) throw Error(`Invalid ${name} GLB export`);
}
