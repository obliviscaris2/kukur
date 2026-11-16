/**
 * Wayfinding: the well-known places of the valley. They appear on signposts at junctions, on the compass,
 * as distant beacons on the horizon, and as quick waypoints on the map (M).
 * Add or rename freely — lat/lon from any map app (long-press → coordinates).
 *
 *   icon    compass/map glyph: temple | stupa | tower | tole | park | water | palace | plane
 *   beacon  a landmark model drawn far away so you can steer by it (assets/models/temples/<model>.glb or 'tower')
 *   size    beacon footprint in metres
 */
export const DESTINATIONS = [
  { name: 'Basantapur', ne: 'बसन्तपुर', lat: 27.70398, lon: 85.30755, icon: 'temple', beacon: 'taleju', size: 20 },
  { name: 'Asan', ne: 'असन', lat: 27.70785, lon: 85.31160, icon: 'tole' },
  { name: 'Thamel', ne: 'ठमेल', lat: 27.71530, lon: 85.31160, icon: 'tole' },
  { name: 'New Road', ne: 'न्यूरोड', lat: 27.70345, lon: 85.31010, icon: 'tole' },
  { name: 'Ratna Park', ne: 'रत्नपार्क', lat: 27.70575, lon: 85.31500, icon: 'park' },
  { name: 'Rani Pokhari', ne: 'रानीपोखरी', lat: 27.70810, lon: 85.31570, icon: 'water' },
  { name: 'Dharahara', ne: 'धरहरा', lat: 27.70040, lon: 85.31210, icon: 'tower', beacon: 'tower', size: 10 },
  { name: 'Narayanhiti', ne: 'नारायणहिटी', lat: 27.71500, lon: 85.31800, icon: 'palace' },
  { name: 'Swayambhu', ne: 'स्वयम्भू', lat: 27.71490, lon: 85.29030, icon: 'stupa', beacon: 'stupa_boudha', size: 30 },
  { name: 'Boudha', ne: 'बौद्ध', lat: 27.72150, lon: 85.36200, icon: 'stupa', beacon: 'stupa_boudha', size: 60 },
  { name: 'Pashupatinath', ne: 'पशुपतिनाथ', lat: 27.71045, lon: 85.34880, icon: 'temple', beacon: 'pashupati_gold', size: 24 },
  { name: 'Chabahil', ne: 'चाबहिल', lat: 27.71720, lon: 85.34660, icon: 'stupa' },
  { name: 'Baneshwor', ne: 'बानेश्वर', lat: 27.68890, lon: 85.34200, icon: 'tole' },
  { name: 'Koteshwor', ne: 'कोटेश्वर', lat: 27.67870, lon: 85.34950, icon: 'tole' },
  { name: 'Kalanki', ne: 'कलंकी', lat: 27.69360, lon: 85.28160, icon: 'tole' },
  { name: 'Airport', ne: 'विमानस्थल', lat: 27.69660, lon: 85.35910, icon: 'plane' },
  { name: 'Patan Durbar Square', ne: 'पाटन दरबार', lat: 27.67348, lon: 85.32504, icon: 'temple', beacon: 'shikhara', size: 16 },
  { name: 'Jawalakhel', ne: 'जावलाखेल', lat: 27.67280, lon: 85.31370, icon: 'tole' },
  { name: 'Lagankhel', ne: 'लगनखेल', lat: 27.66680, lon: 85.32260, icon: 'tole' },
  { name: 'Kirtipur', ne: 'कीर्तिपुर', lat: 27.67870, lon: 85.27750, icon: 'tole' },
  { name: 'Thimi', ne: 'थिमी', lat: 27.68000, lon: 85.38800, icon: 'tole' },
  { name: 'Bhaktapur Durbar Square', ne: 'भक्तपुर दरबार', lat: 27.67203, lon: 85.42816, icon: 'temple', beacon: 'nyatapola', size: 24 },
];

/** Animal hospitals & vets: E there heals you fully. (approximate locations) */
export const VETS = [
  { name: 'Central Veterinary Hospital', ne: 'केन्द्रीय पशु अस्पताल', lat: 27.69330, lon: 85.31300, icon: 'vet' },
  { name: 'Animal Nepal Clinic', ne: 'एनिमल नेपाल', lat: 27.67100, lon: 85.30100, icon: 'vet' },
  { name: 'Kathmandu Animal Treatment Centre', ne: 'काठमाडौं पशु उपचार केन्द्र', lat: 27.72350, lon: 85.33600, icon: 'vet' },
  { name: 'Bhaktapur Vet Clinic', ne: 'भक्तपुर पशु क्लिनिक', lat: 27.67450, lon: 85.42200, icon: 'vet' },
];

export const WAYFINDING = {
  /** compass: shows ±fov/2 radians around the view; landmarks closer than `nearLandmarks` metres get a marker */
  compass: { fov: Math.PI * 0.9, nearLandmarks: 450, destinations: 6000 },
  /** a new tole/landmark name must stay current for this long before the banner shows */
  bannerDelay: 1.2, bannerSeconds: 4.2,
  /** signpost boards list destinations within this angle (radians) of each road arm and this range (metres) */
  signpost: { arc: 0.6, minDist: 120, maxDist: 9000, perArm: 2, buildRadius: 140 },
  /** beacons fade in beyond the streamed area; waypoint pillar */
  beacons: { maxDist: 9000 },
  arriveRadius: 30,
};
