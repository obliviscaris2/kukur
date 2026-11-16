/**
 * Level-of-detail for NPCs (people and strays). Shadows and skinning are the expensive parts on weak GPUs,
 * so only NPCs near the pup cast shadows and anything beyond the cut-off is hidden and stops animating.
 * Distances live in config/npc.js (NPC.lod).
 */
import { NPC } from '../../config/index.js';

export function setLod(npc, dist) {
  const shadow = dist < NPC.lod.shadow, visible = dist < NPC.lod.hide;
  npc.root.visible = visible;
  npc._outlineLod = dist < NPC.lod.outline;
  if (npc.outline) npc.outline.visible = npc._outlineLod;
  if (npc._shadow === shadow) return;
  npc._shadow = shadow;
  npc.root.traverse((o) => { if (o.isMesh) o.castShadow = shadow && o !== npc.outline && !o.userData.noShadow; });
}
