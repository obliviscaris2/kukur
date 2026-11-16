/**
 * Weather presets. The weather system blends smoothly between these.
 *   cloud 0..1   sky cover        rain 0..1   rain intensity      wind 0..1.5  tree/flag sway + debris
 *   fogNear/fogFar metres          grey 0..1   desaturation       leaves 0..1 flying leaves & petals
 *   dust 0..1    dust motes         storm      lightning on/off   weight  how often it is picked
 */
export const WEATHERS = {
  sunny: { label: 'Sunny', icon: '☀️', cloud: 0.2, rain: 0, wind: 0.35, fogNear: 80, fogFar: 380, grey: 0, leaves: 0.15, dust: 0.25, weight: 4 },
  breezy: { label: 'Breezy', icon: '🍃', cloud: 0.45, rain: 0, wind: 1.1, fogNear: 80, fogFar: 380, grey: 0.05, leaves: 1, dust: 0.6, weight: 2 },
  cloudy: { label: 'Cloudy', icon: '⛅', cloud: 0.8, rain: 0, wind: 0.6, fogNear: 60, fogFar: 300, grey: 0.25, leaves: 0.35, dust: 0.1, weight: 2 },
  drizzle: { label: 'Drizzle', icon: '🌦️', cloud: 0.85, rain: 0.35, wind: 0.5, fogNear: 40, fogFar: 240, grey: 0.35, leaves: 0.2, dust: 0, weight: 1.5 },
  monsoon: { label: 'Monsoon rain', icon: '🌧️', cloud: 1, rain: 1, wind: 1.0, fogNear: 22, fogFar: 170, grey: 0.55, leaves: 0.4, dust: 0, weight: 1.2 },
  storm: { label: 'Thunderstorm', icon: '⛈️', cloud: 1, rain: 1, wind: 1.5, fogNear: 18, fogFar: 150, grey: 0.68, leaves: 0.9, dust: 0, weight: 0.6, storm: true },
  mist: { label: 'Morning mist', icon: '🌫️', cloud: 0.35, rain: 0, wind: 0.15, fogNear: 6, fogFar: 110, grey: 0.15, leaves: 0, dust: 0, weight: 1, morningOnly: true },
};
export const WEATHER_ORDER = ['sunny', 'breezy', 'cloudy', 'drizzle', 'monsoon', 'storm', 'mist'];

export const TIME = {
  startHour: 6.2,
  /** game hours per real second (1/40 = a 16-minute day) */
  speed: 1 / 40,
  /** weather changes every N game hours (random within range) */
  weatherChangeHours: [3, 7],
};

export const EFFECTS = {
  rainDrops: 1600, splashes: 120, debris: 120, rainbowAfterRainHours: 1.2,
};

/** Ponds & rivers near the pup (world/effects/WaterLife.js). */
export const WATERLIFE = {
  fish: 14, jumpChance: 0.03,          // fish alive near you; chance per second that one leaps
  garbage: 8,                          // floating plastic near you (Bagmati realism, a little)
  frogs: 10,                           // when it rains
  fishColors: ['#ff8a3d', '#ffb347', '#c9ced6', '#e8e2d0'],
  junkColors: ['#4cc9f0', '#2a9d4b', '#f4f4f0', '#ff6fa8', '#e63946', '#ffd23f'],
  frogColors: ['#5a9a3a', '#6fae46', '#4a7f33', '#8a9a3a'],
};
