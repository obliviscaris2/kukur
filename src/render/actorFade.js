/** Dither nearby actors out of the lens so a passing dog or pedestrian cannot fill the camera with clipped polygons. */
import { NPC } from '../config/index.js';

export const ACTOR_FADE = 'if (uCameraFade < 0.999 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898,78.233))) * 43758.5453) > uCameraFade) discard;';

export function fadeActor(actor, camera, dt, enabled = true) {
  if (!camera) return;
  const height = actor.dog ? 0.6 * actor.scale : NPC.people.height * actor.model.scale.y, p = actor.pos;
  const vertical = Math.max(0, p.y + 0.08 - camera.position.y, camera.position.y - p.y - height);
  const distance = Math.hypot(camera.position.x - p.x, camera.position.z - p.z, vertical), F = NPC.cameraFade;
  const target = enabled ? Math.max(0, Math.min(1, (distance - F.near) / (F.far - F.near))) : 1;
  actor._cameraFade = (actor._cameraFade ?? 1) + (target - (actor._cameraFade ?? 1)) * (1 - Math.exp(-F.rate * dt));
  actor.setCameraFade?.(actor._cameraFade);
}
