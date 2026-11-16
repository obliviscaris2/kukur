/** Behaviour-based danger, fair attack tells, defensive roar and a bounded magical aura field. */
export const THREATS = {
  colours: { danger: '#ff7442', neutral: '#c9ced6', good: '#8ce9aa', stunned: '#bdeaff' },
  aura: { maxActors: { low: 22, medium: 32, high: 42 }, pointsPerActor: 6, near: 20, reveal: 48, revealSeconds: 7, size: 0.055 },
  stun: { radius: 9, seconds: [2.4, 3.8], immunity: 1.2, recover: 1.1, height: 2.4, repel: 5 },
  aggressionMemory: 4,
  hintRadius: 14,
  traffic: { seconds: 2.2, minimumSpeed: 2.5, margin: 0.55 },
  catcher: {
    sight: 17,
    leash: 32,
    speed: 2.65,
    reach: 1.35,
    windup: 1.55,
    strikeAt: 0.25,
    recovery: 1.8,
    cooldown: 4.2,
    minimumDistance: 2.8,
  },
  guards: { chance: 0.32, radius: [7, 10], grace: 3.2, maxActive: { low: 2, medium: 3, high: 4 } },
};
