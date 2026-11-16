/** Exact critically damped scalar spring: stable for sparse NPC updates and 30–144 Hz rendering. */
export function spring(state, target, frequency, dt) {
  const t = Math.max(0, dt), w = Math.max(.01, frequency), decay = Math.exp(-w * t);
  const offset = state.a - target, velocity = state.v + w * offset;
  state.a = target + (offset + velocity * t) * decay;
  state.v = (state.v - w * velocity * t) * decay;
  return state.a;
}
