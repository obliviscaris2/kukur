/** Register temple steps, sanctums and archways in the very same local-to-world frame as their glTF mesh. */
import { rect } from '../physics.js';
import { footprintRange } from '../terrain.js';
import { LANDMARKS, WORLD } from '../../config/index.js';

export function landmarkFootprint(x, z, size, ang, model) {
  return rect(x, z, size / 2, size * (LANDMARKS.shapes[model]?.depth ?? 1) / 2, -ang);
}

export function registerLandmark(physics, owner, { x, z, size, ang, y, model, meta, peak }) {
  const shape = { ...meta, ...LANDMARKS.shapes[model] }, angle = -ang, top = y + shape.steps * shape.step_h * size;
  const footprint = landmarkFootprint(x, z, size, ang, model);
  const bottom = Math.min(y, footprintRange(footprint, physics.terrain).low) - WORLD.foundations.embed;
  const at = (u, v) => [x + (u * Math.cos(ang) - v * Math.sin(ang)) * size, z + (u * Math.sin(ang) + v * Math.cos(ang)) * size];
  for (let s = 0; s < shape.steps; s++) {
    const half = (0.5 - s * shape.inset + (model.startsWith('pagoda') || ['trailokya','maju_dega','taleju','nyatapola','pashupati_gold'].includes(model) ? LANDMARKS.stoneLip : 0)) * size;
    physics.addPlatformBox(owner, x, z, half, half * (shape.depth ?? 1), angle, y + (s + 1) * shape.step_h * size, bottom);
    // Boudha's four projecting terrace segments are real walkable geometry, not just paint on the plinth.
    if (model === 'stupa_boudha') for (let side = 0; side < 4; side++) {
      const h = 0.5 - s * shape.inset, a = side * Math.PI / 2, [px, pz] = at(Math.sin(a) * (h + 0.03), Math.cos(a) * (h + 0.03));
      physics.addPlatformBox(owner, px, pz, h * 0.25 * size, 0.03 * size, angle + a, y + (s + 1) * shape.step_h * size, bottom);
    }
  }
  if (shape.arch) {
    for (const u of [-0.36, 0.36]) { const [px, pz] = at(u, 0); physics.addBox(owner, px, pz, 0.07 * size, 0.07 * size, angle, y + 0.78 * size, top); }
    physics.addBox(owner, x, z, 0.475 * size, 0.06 * size, angle, y + 0.83 * size, y + 0.77 * size);
  } else if (shape.round) {
    if (model !== 'stupa_boudha') physics.addPlatformBox(owner, x, z, shape.core * 0.5625 * size, shape.core * 0.5625 * size, angle, top + 0.03 * size, top);
    const radius = shape.core / 2 * size, centre = top + (model === 'stupa_boudha' ? 0 : 0.03 * size), rise = radius * (model === 'stupa_boudha' ? 0.62 : 0.92);
    for (let i = 0; i < LANDMARKS.domeSlices; i++) {
      const t = i / LANDMARKS.domeSlices;
      physics.addCircle(owner, x, z, radius * Math.sqrt(1-t*t), centre + rise * (i+1)/LANDMARKS.domeSlices, centre + rise*t);
    }
    // The harmika and finial are narrow; a full-width cylinder up to the sky made empty air collide.
    physics.addBox(owner, x, z, radius*.35, radius*.35, angle, peak ?? top + shape.core_h*size, centre+rise);
  } else physics.addBox(owner, x, z, shape.core / 2 * size, shape.core / 2 * size, angle, top + shape.core_h * size, bottom);
  if (shape.pillars) for (const a of [-1, -1 / 3, 1 / 3, 1]) for (const b of [-1, -1 / 3, 1 / 3, 1]) {
    const [px, pz] = at(a * shape.pillars, b * shape.pillars);
    physics.addCircle(owner, px, pz, 0.016 * size, top + 0.22 * size, top);
  }
  return { footprint, bottom, top };
}
