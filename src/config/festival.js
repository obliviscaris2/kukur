/**
 * Festivals (world/festival/). Tihar is the five-day festival of lights; KUKUR's story starts on Kukur Tihar (day 0).
 * The city stays decorated for the next two days (diyos, rangoli, Laxmi footprints, fireworks at night).
 * Days come from the game calendar (weather.day, saved; 16-minute game days — see TIME in config/weather.js).
 */
export const FESTIVAL = {
  /** day index -> name shown by the clock. Days not listed have no festival. */
  days: {
    0: { name: 'Kukur Tihar', ne: 'कुकुर तिहार', icon: '🐕' },
    1: { name: 'Laxmi Puja', ne: 'लक्ष्मी पूजा', icon: '🪔' },
    2: { name: 'Mha Puja', ne: 'म्ह पूजा', icon: '🪔' },
  },
  /** decorations: per streamed tile, along streets (only where the city is dense enough) */
  decor: {
    minDensity: 0.25,
    diyoClusters: 70,       // clusters of little oil lamps on doorsteps & sills, per tile
    diyoPerCluster: [3, 8],
    rangoli: 18,            // painted floor mandalas at doors, per tile (some with Laxmi's red footprints)
    drawRadius: 90,         // only the ones this close are drawn
  },
  /** fireworks: only at night on festival days */
  fireworks: {
    nightFrom: 18.2, nightTo: 1.5,
    rocketEvery: [1.8, 5.5],   // seconds between rockets somewhere in the sky around you
    rocketRange: [35, 170],
    groundEvery: [4, 11],      // gamala (flower-pot fountains) and chakra (ground spinners) in the street near you
    groundRange: [7, 32],
    scareRadius: 12,           // a bang this close and the pup flinches (dogs hate crackers)
    colors: ['#ffd23f', '#ff4fa3', '#4cf0ff', '#7dff6a', '#b48cff', '#ff6b3d', '#ffffff'],
  },
  /** what people call out on festival nights (Deusi-Bhailo carols, greetings) */
  lines: ['Shubha Deepawali!', 'Bhailo re!', 'Deusi re!', 'Jai Laxmi Mata!', 'Hera, phataka!', 'Tihar ko shubhakamana!'],
};
