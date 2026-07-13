const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export const BOT_READS = {
  calm: { 9: 2, 13: 1, 19: 1 },
  steady: { 9: 4, 13: 3, 19: 2 },
  sharp: { 9: 7, 13: 5, 19: 3 }
};

export function transformPoint(x, y, size, transform = 0) {
  const last = size - 1;
  switch (transform & 7) {
    case 1: return { x: last - y, y: x };
    case 2: return { x: last - x, y: last - y };
    case 3: return { x: y, y: last - x };
    case 4: return { x: last - x, y };
    case 5: return { x, y: last - y };
    case 6: return { x: y, y: x };
    case 7: return { x: last - y, y: last - x };
    default: return { x, y };
  }
}

export function inverseTransformPoint(x, y, size, transform = 0) {
  if ((transform & 7) === 1) return transformPoint(x, y, size, 3);
  if ((transform & 7) === 3) return transformPoint(x, y, size, 1);
  return transformPoint(x, y, size, transform);
}

export function sgfCoord(x, y) {
  return `${LETTERS[x]}${LETTERS[y]}`;
}

export function buildSgf(game, transform = 0, extraMove = null) {
  const size = game.size;
  const moves = [];
  for (const move of game.moves || []) {
    const color = move.color === 1 ? 'B' : 'W';
    if (move.pass) moves.push(`;${color}[]`);
    else {
      const point = transformPoint(move.x, move.y, size, transform);
      moves.push(`;${color}[${sgfCoord(point.x, point.y)}]`);
    }
  }
  if (extraMove) {
    const color = extraMove.color === 1 ? 'B' : 'W';
    if (extraMove.pass) moves.push(`;${color}[]`);
    else {
      const point = transformPoint(extraMove.x, extraMove.y, size, transform);
      moves.push(`;${color}[${sgfCoord(point.x, point.y)}]`);
    }
  }
  return `(;GM[1]FF[4]CA[UTF-8]AP[SENTE:2.0]RU[Chinese]SZ[${size}]KM[${Number(game.komi || 6.5)}]${moves.join('')})`;
}

export function parseGeneratedMove(sgf, expectedColor, size, transform = 0) {
  const matches = [...String(sgf || '').matchAll(/;([BW])\[([^\]]*)\]/g)];
  const wanted = expectedColor === 1 ? 'B' : 'W';
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const [, color, coordinate] = matches[index];
    if (color !== wanted) continue;
    if (!coordinate || coordinate.length < 2) return { pass: true };
    const x = LETTERS.indexOf(coordinate[0]);
    const y = LETTERS.indexOf(coordinate[1]);
    if (x < 0 || y < 0 || x >= size || y >= size) return { pass: true };
    return inverseTransformPoint(x, y, size, transform);
  }
  return null;
}

export function readsFor(level, size) {
  const profile = BOT_READS[level] || BOT_READS.steady;
  return profile[size] || profile[9];
}

export function makeReadPlan(level, size, seed) {
  const reads = readsFor(level, size);
  const plan = [];
  let value = seed >>> 0;
  for (let index = 0; index < reads; index += 1) {
    value = Math.imul(value ^ (value >>> 16) ^ (index + 1), 0x45d9f3b) >>> 0;
    plan.push({
      seed: (value & 0x7fffffff) || index + 1,
      transform: (value + index * 3) & 7
    });
  }
  return plan;
}

function moveKey(move) {
  return move?.pass ? 'pass' : move ? `${move.x},${move.y}` : 'invalid';
}

function seededUnit(seed) {
  let value = seed >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function chooseConsensus(votes, level, seed) {
  const valid = votes.filter((vote) => vote?.move);
  if (!valid.length) return null;
  const groups = new Map();
  for (const vote of valid) {
    const key = moveKey(vote.move);
    const group = groups.get(key) || { key, move: vote.move, count: 0, first: vote.index, seeds: [] };
    group.count += 1;
    group.first = Math.min(group.first, vote.index);
    group.seeds.push(vote.seed);
    groups.set(key, group);
  }
  const ranked = [...groups.values()].sort((a, b) => b.count - a.count || a.first - b.first || a.key.localeCompare(b.key));
  if (level === 'sharp' || ranked.length === 1) return { ...ranked[0], alternatives: ranked };
  if (level === 'steady') {
    const top = ranked[0];
    const runner = ranked[1];
    if (!runner || top.count > runner.count) return { ...top, alternatives: ranked };
    const pick = seededUnit(seed ^ 0x9e3779b9) < 0.78 ? top : runner;
    return { ...pick, alternatives: ranked };
  }
  const pool = ranked.filter((item) => item.count >= Math.max(1, ranked[0].count - 1)).slice(0, 3);
  const total = pool.reduce((sum, item) => sum + item.count, 0);
  let roll = seededUnit(seed ^ 0x85ebca6b) * total;
  for (const item of pool) {
    roll -= item.count;
    if (roll <= 0) return { ...item, alternatives: ranked };
  }
  return { ...pool[0], alternatives: ranked };
}

export function gameSeed(game, salt = 0) {
  let hash = 2166136261 ^ salt;
  hash ^= game.size;
  hash = Math.imul(hash, 16777619);
  hash ^= game.moveNumber || 0;
  hash = Math.imul(hash, 16777619);
  for (const move of (game.moves || []).slice(-12)) {
    hash ^= move.pass ? 251 : (move.x + 1) * 17 + (move.y + 1) * 31 + move.color * 131;
    hash = Math.imul(hash, 16777619);
  }
  const entropy = Math.floor(Math.random() * 0x7fffffff);
  return (hash ^ entropy) >>> 0;
}
