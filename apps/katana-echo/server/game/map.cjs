const seedrandom = require('seedrandom');

function rectCollides(a, b) {
  return !(a.x + a.w / 2 < b.x - b.w / 2 || a.x - a.w / 2 > b.x + b.w / 2 || a.y + a.h / 2 < b.y - b.h / 2 || a.y - a.h / 2 > b.y + b.h / 2);
}

function generateMap(seed) {
  const rng = seedrandom(seed);
  const walls = [];
  const bounds = { w: 22, h: 14 };

  // two guaranteed lanes so there is always a rotation path
  walls.push({ id: 'lane-top', x: 0, y: -2.2, w: bounds.w - 4, h: 0.8 });
  walls.push({ id: 'lane-bottom', x: 0, y: 2.2, w: bounds.w - 4, h: 0.8 });

  // generate small blockers but avoid overlaps so pockets stay readable
  let attempts = 0;
  let placed = 0;
  const target = 10;
  while (placed < target && attempts < 80) {
    attempts++;
    const w = 1.1 + rng() * 1.2;
    const h = 0.9 + rng() * 1.4;
    const x = rng() * (bounds.w - 6) - (bounds.w - 6) / 2;
    const y = rng() * (bounds.h - 6) - (bounds.h - 6) / 2;
    const rect = { id: `b${placed}`, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), w: Number(w.toFixed(2)), h: Number(h.toFixed(2)) };
    if (walls.some((w) => rectCollides(w, rect))) continue;
    walls.push(rect);
    placed++;
  }

  // pockets for mind-games
  const pockets = [
    { id: 'pocket-left', x: -bounds.w / 2 + 3, y: bounds.h / 2 - 2, w: 2.2, h: 1.4 },
    { id: 'pocket-right', x: bounds.w / 2 - 3, y: -bounds.h / 2 + 2, w: 2.2, h: 1.4 }
  ];

  return { seed, walls: walls.concat(pockets), bounds };
}

module.exports = { generateMap };
