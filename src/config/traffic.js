/**
 * Moving traffic (entities/traffic/Traffic.js). Vehicles drive on the left along real roads near the pup.
 */
export const TRAFFIC = {
  /** vehicles alive around the pup, per quality level */
  max: { low: 46, medium: 66, high: 86 },
  /** Rounded trim uses fewer subdivisions on integrated GPUs; silhouettes and population are retained. */
  detail: { low: 1, medium: 2, high: 2 },
  /** spawn between these distances — and only off-screen unless further than seenSpawnDistance (deep in the haze) */
  spawnRadius: [28, 135], seenSpawnDistance: 125, despawnRadius: 170,
  /** beyond this, a vehicle you can't see is retired (keeps the traffic where you are) */
  unseenKeep: 105,
  spawnEvery: 0.35, spawnAttempts: 24, spawnBatch: 5,
  roadLift: 0.035,
  route: { join: 0.6, minSegment: 0.65, turnSamples: 20, lookAhead: 15, minGap: 1.15, bikeGap: 0.65, reaction: 0.65, acceleration: 1.8, braking: 5.5, planRetry: 1.2, reservationTime: 7, stopLine: 2.5 },
  turnRadius: { scooter: 2.1, scooter2: 2.2, motorbike: 2.3, pathao: 2.3, taxi: 3.7, car: 4, microbus: 5, tempo: 3.8, bus: 7, truck: 6, rickshaw: 2.4 },
  minRoad: { scooter: 3, scooter2: 3, motorbike: 3, pathao: 3, taxi: 4.8, car: 5, microbus: 6.5, tempo: 5, bus: 8, truck: 8, rickshaw: 4 },
  waitingRiders: { max: { low: 2, medium: 3, high: 4 }, seconds: [16, 34], minRoad: 6, spacing: 65, kerbInset: 0.1, mergeDistance: 7 },
  /** how hard a vehicle shoves the pup, per m/s of its speed */
  knock: 0.9,
  impactSpeed: 2.8, impactCooldown: 1.2,
  clutter: { interval: 0.12, reach: 0.35, power: 1.1, minPush: 2.8 },
  storyVan: { length: 4.6, width: 1.9, height: 2.1 },
  /** [length, width, solid height, roof height] in metres. Two-wheelers have no walkable roof. */
  bodies: {
    scooter: [1.68, 0.56, 1.5, 0], scooter2: [1.78, 0.72, 1.5, 0], rickshaw: [2.2, 1.1, 1.62, 1.62],
    motorbike: [1.95, 0.65, 1.55, 0], pathao: [1.95, 0.65, 1.55, 0],
    taxi: [3.5, 1.5, 1.43, 1.43], car: [4.05, 1.72, 1.43, 1.43], microbus: [4.6, 1.9, 1.98, 1.98],
    tempo: [3.3, 1.3, 1.7, 1.7], bus: [9.5, 2.4, 2.8, 2.8], truck: [6.8, 2.3, 2.5, 2.5],
  },
  /** relative frequency of each type (buses & microbuses only on wide roads) */
  mix: { scooter: 5, scooter2: 1.5, motorbike: 5, pathao: 1.5, taxi: 4.5, car: 4, microbus: 1.8, tempo: 0.9, bus: 0.9, truck: 0.5, rickshaw: 0.35 },
  get mixTotal() { return Object.values(this.mix).reduce((a, b) => a + b, 0); },
  /** cruising speed m/s */
  speed: { scooter: 6.5, scooter2: 5.8, motorbike: 7.4, pathao: 7, taxi: 6.3, car: 6.6, microbus: 5.5, tempo: 4.5, bus: 5.5, truck: 4.5, rickshaw: 2.6 },
  colors: ['#b94e45', '#456980', '#c4a44d', '#e9e6dd', '#353c46', '#76856e', '#8d5365', '#54888d', '#bb7546', '#6b6279'],
};
