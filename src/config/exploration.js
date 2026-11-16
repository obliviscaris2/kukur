/** Quiet exploration throughout the valley; bounded props and particles, with no additional shadow lights. */
export const EXPLORATION = {
  radius: 72, refresh: .8, maxClusters: 12, maxSites: 3, candidatesPerTile: 10,
  placementRadius: 4.2, maxSlope: .48, interactRadius: 1.65,
  siteIcons: ['temple','stupa','park','palace','tower','tole'],
  stepHeights: [.22,.43,.65], stepRadius: .64, logRadius: .24, logLength: 2.4,
  stone: ['#97aeb0','#b9bdad','#b1a5bd'], bark: '#a47c59',
  soilRadius: 3.35, soilLift: .04, soilSides: 24,
  foliage: ['#488aa3','#83c6cb','#d2b9ee'], gold: ['#a87940','#edbf67','#fff0b4'],
  firefly: { capacity: 168, perGrove: 24, dayPerGrove: 12, wake: .18, scatterRadius: 1.7, maxDistance: 40, size: [.12,.18] },
  stepDistance: .55, touchCooldown: 2.5, bloomCooldown: 1.2,
};
