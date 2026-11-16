/** Local canine silhouettes and scale ranges; the Blender generator preserves one shared bone/clip contract. */
export const DOGS = {
  revision: 'local-v5-eyes',
  face: { blinkSeconds:0.16,closed:0.07,interval:[2,5],doubleChance:0.15,doubleDelay:0.25 },
  player: 'village',
  outline: 0.0025,
  variants: {
    village: { name: 'Local village dog', model: 'pup.glb', weight: 7, scale: [1.15, 1.45], eye: [0.038, 0.404, 0.352] },
    bhote: {
      name: 'Bhote type',
      model: 'bhote.glb',
      weight: 1.5,
      scale: [1.25, 1.5],
      eye: [0.049, 0.412, 0.366],
      patterns: { blacktan: 5, solid: 1 },
      coats: [
        ['#29221c', '#bd8b56'],
        ['#3b2c23', '#c7a274'],
      ],
    },
    spitz: {
      name: 'Spitz mix',
      model: 'spitz.glb',
      weight: 1.5,
      scale: [1.0, 1.25],
      eye: [0.036, 0.387, 0.324],
      patterns: { solid: 5, patches: 1 },
      coats: [
        ['#e0d4bd', '#f5f0e5'],
        ['#cbb28d', '#efe5d1'],
      ],
    },
  },
};
