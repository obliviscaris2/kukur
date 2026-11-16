/**
 * Khairey the pup — movement, camera and animation feel.
 */
export const PUP = {
  model: 'assets/models/pup.glb',
  appearance: { coat: ['#b77a43','#f1e6d2'], browColor: '#e5d9c3' },
  radius: 0.19, bodyHalfLength: 0.14, bodyHeight: 0.4,
  speeds: { sniff: 0.5, walk: 0.85, trot: 1.9, run: 5.0, swim: 1.35 },
  /** how deep the pup floats in water (m below the surface) */
  swimDepth: 0.21,
  /** [clip, speed m/s, stride metres per cycle] — must match the gaits baked in pipeline/blender/pup.py */
  gaits: [['Idle', 0, 0.5], ['Walk', 0.85, 0.43], ['Trot', 1.9, 0.64], ['Gallop', 5.0, 1.12]],
  /** easing rates (1/s): higher = snappier. Input smoothing makes key taps feel soft. */
  accel: 6, decel: 10, airControl: 0.22, inputSmoothing: 14,
  /** max turn speed (rad/s) when slow / at full gallop, and how springy turning is */
  turnRate: { slow: 8, fast: 3.4 }, turnStiffness: 7, turnResponse: 14,
  /** hop: hold Space for a higher jump; floaty apex, snappier fall */
  jumpVelocity: 4.2, jumpCut: 0.58, jumpAnticipation: 0.065,
  /** Hela-style climbing: a second hop in the air, a scramble up walls, auto-climb ledges up to this high */
  doubleJump: 3.4, scramble: 3.8, mantleGround: 0.6, mantleAir: 1.5, mantleTime: 0.3, gravity: 18, apexGravity: 0.92, fallGravity: 1.18, stepUp: 0.18, groundSnap: 0.22, coyoteTime: 0.1, jumpBuffer: 0.15,
  /** Four short IK chains plant stance paws on slopes; body tilt stays subtle at ledges. */
  feet: { maxReach: 0.13, frontSole: 0.045, hindSole: 0.065, slopeSample: 0.22, maxSlope: 0.32, blend: 18, plantHeight: .032, releaseHeight: .058, plantReach: .11 },
  /** Ease the visible body over small treads while the collision body stays on the surface. */
  stepSmoothing: 18, maxStepOffset: 0.12,
  /** A spring-driven articulated tumble shares the normal collision controller (no extra rigid bodies). */
  impact: { threshold: 2.8, recoverTime: 0.65, maxTime: 2.3, cooldown: 1.4, drag: 4.5 },
  effects: { stepDistance: 0.34, starEvery: 0.16, skidEvery: 0.09, starSpeed: 3.5 },
  stamina: { drainSeconds: 7, recoverSeconds: 4 },
  idle: { playfulAfter: 6, lieDownAfter: 26 },
  /** Procedural layers added on top of the baked clips. */
  procedural: {
    tailWagSpeed: { calm: 4, happy: 7, excited: 11 },
    tailWagAmount: { calm: 0.12, happy: 0.24, excited: 0.38 },
    earSpring: { stiffness: 90, damping: 9, kick: 0.012 },
    headLook: { maxYaw: 0.9, maxPitch: 0.45, speed: 5 },
    spineBend: 0.035, lean: 0.05, landSquash: 0.035,
    bodySpring: 9, accelerationPitch: .008, tailLag: 12, teleportHeight: 1.5,
  },
  /** model scale (strays are 1.25–1.65: Khairey is still a pup) */
  modelScale: 1.12,
  camera: { distance: 1.8, pitch: 0.2, minDistance: 0, maxDistance: 9, height: 0.34, fov: 66, sprintFovKick: 9, sensitivity: 0.0026,
    lookSmoothing: 22, followLag: 10, lookAhead: 0.35, sprintPullback: 0.7, autoAlignAfter: 1.4, autoAlignRate: 1.6,
    /** mouse untouched this long (s): glide back behind the pup at the default angle (and zoom, if the wheel is idle too) */
    homeAfter: 2.5, homeRate: 1.3, homeZoomAfter: 6,
    collisionRadius: 0.18, collisionSkin: 0.025, retractRate: 24, extendRate: 5,
    flightClearance: 1.2, flightRate: 4, returnSeconds: 1.3,
    flightSpeed: 10, flightHeightSpeed: 3, maxFlightSpeed: 450, teleportDistance: 3 },
};
