/**
 * The grimoire's journal. TASKS are small open-world goals tracked from game events (progress + a reward).
 * CHAPTERS are the story missions to come — listed (sealed) so the journal already has its shape.
 *   event: the game event that counts (see gameplay/Journal.js), count: how many, where?: filter on the event
 */
export const TASKS = [
  { id:'stun3', title:'Bhau of Courage', desc:'Stagger attackers with a charged roar three times.', event:'stun', count:3, reward:['bone',1] },
  { id:'roof3', title:'Above the Tole', desc:'Climb into three different houses’ rooftop terraces.', event:'roofVisit', count:3, reward:['coin',3] },
  { id:'roofCache3', title:'Roof Baskets', desc:'Search three rooftop baskets.', event:'roofCache', count:3, reward:['biscuit',2] },
  { id: 'discover10', title: 'Nose of the City', desc: 'Discover 10 places.', event: 'discover', count: 10, reward: ['bone', 1] },
  { id: 'befriend', title: 'Bone Diplomacy', desc: 'Win over a dog pack or a lone guardian with a gift.', event: 'befriend', count: 1, reward: ['selroti', 1] },
  { id: 'smash10', title: 'Little Earthquake', desc: 'Knock over or smash 10 things.', event: 'smash', count: 10, reward: ['momo', 1] },
  { id: 'bones3', title: 'Treasure Hunter', desc: 'Dig up or find 3 bones.', event: 'pickup', where: 'bone', count: 3, reward: ['bell', 1] },
  { id: 'ride', title: 'Free Ride', desc: 'Ride on the roof of a moving vehicle.', event: 'ride', count: 1, reward: ['coin', 3] },
  { id: 'roar', title: 'The Voice', desc: 'Let loose a Kukur Roar (hold F).', event: 'roar', count: 1, reward: ['biscuit', 2] },
  { id: 'petted5', title: 'Good Pup', desc: 'Get petted by 5 kind people.', event: 'petted', count: 5, reward: ['marigold', 1] },
  { id: 'pilgrim', title: 'Pilgrim Pup', desc: 'Visit Boudha, Swayambhu and Pashupatinath.', event: 'discover', where: /boud|baudh|swayam|pashupati/i, count: 3, reward: ['bell', 1] },
  { id: 'swim', title: 'Splash!', desc: 'Go for a swim in a pond or river.', event: 'swim', count: 1, reward: ['biscuit', 1] },
  { id: 'cats5', title: 'Cat Herder', desc: 'Send 5 street cats running. (They always win: up the wall they go.)', event: 'catChase', count: 5, reward: ['biscuit', 2] },
  { id: 'flock3', title: 'Wings Over the Temple', desc: 'Send 3 pigeon flocks wheeling into the sky.', event: 'flock', count: 3, reward: ['marigold', 1] },
  { id: 'fireworks', title: 'Festival of Lights', desc: 'Stay out for 15 fireworks on a Tihar night. Bravely.', event: 'firework', count: 15, reward: ['selroti', 1] },
  { id: 'nest', title: 'Up in the Branches', desc: 'Find a bird\'s nest in a tree.', event: 'nest', count: 1, reward: ['biscuit', 1] },
  { id: 'frog', title: 'Rain Friends', desc: 'Meet a frog out in the rain.', event: 'frog', count: 1, reward: ['biscuit', 1] },
  { id: 'junk5', title: 'River Keeper', desc: 'Nudge 5 bits of floating plastic. The river deserves better.', event: 'junk', count: 5, reward: ['coin', 2] },
  { id: 'puddles', title: 'Puddle Jumper', desc: 'Splash through 20 puddles in the rain.', event: 'puddle', count: 20, reward: ['momo', 1] },
  { id: 'leaves5', title: 'Autumn Zoomies', desc: 'Send 5 piles of leaves flying under your paws.', event: 'leaves', count: 5, reward: ['ball', 1] },
  { id: 'rummage3', title: 'A Very Good Nose', desc: 'Investigate 3 bins or rubbish bags.', event: 'rummage', count: 3, reward: ['biscuit', 2] },
  { id: 'crossing', title: 'Traffic Dai', desc: 'Ask a traffic officer to hold the road for you.', event: 'safeCrossing', count: 1, reward: ['biscuit', 1] },
  { id: 'playChase', title: 'Catch Me If You Can', desc: 'Tag a schoolkid during a game of chase.', event: 'playChase', count: 1, reward: ['ball', 1] },
  { id: 'ridehail', title: 'Two Wheels, One Friend', desc: 'Greet a rider waiting beside the road.', event: 'ridehail', count: 1, reward: ['coin', 1] },
];

export const CHAPTERS = [
  { title: 'I · The Van at Dawn', hint: 'Something rumbles through the old city before sunrise…' },
  { title: 'II · Aama', hint: 'A scent you remember from the day you were born.' },
  { title: 'III · Kukur Tihar', hint: 'One day a year, the city remembers its dogs.' },
  { title: 'IV · Teeth', hint: 'Some debts are paid in the dark.' },
];
