/** Reproduce the runtime material atlas from its checked-in painted source; never edit the generated copy. */
import { mkdir, copyFile } from 'node:fs/promises';
const output = new URL('../../assets/textures/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['storybook-materials.png', 'fairy-leaves.png', 'exploration-materials.png']) {
  await copyFile(new URL('./source/' + name, import.meta.url), new URL(name, output));
  console.log('Built assets/textures/' + name);
}
