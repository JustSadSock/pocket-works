export const TILE_CODES = [
  '1m','2m','3m','4m','5m','6m','7m','8m','9m',
  '1p','2p','3p','4p','5p','6p','7p','8p','9p',
  '1s','2s','3s','4s','5s','6s','7s','8s','9s',
  'E','S','W','N','P','F','C'
];

export const TILE_NAMES = [
  '1 ман','2 ман','3 ман','4 ман','5 ман','6 ман','7 ман','8 ман','9 ман',
  '1 пин','2 пин','3 пин','4 пин','5 пин','6 пин','7 пин','8 пин','9 пин',
  '1 соу','2 соу','3 соу','4 соу','5 соу','6 соу','7 соу','8 соу','9 соу',
  'Восток','Юг','Запад','Север','Белый дракон','Зелёный дракон','Красный дракон'
];

export function tileId(code) {
  return TILE_CODES.indexOf(code);
}

export function tileCode(id) {
  return TILE_CODES[id] ?? '?';
}

export function tileName(id) {
  return TILE_NAMES[id] ?? '?';
}

export function isHonor(id) { return id >= 27; }
export function isTerminal(id) { return !isHonor(id) && id % 9 === 0 || !isHonor(id) && id % 9 === 8; }
export function isSimple(id) { return !isHonor(id) && !isTerminal(id); }
export function suitOf(id) {
  if (id < 9) return 'm';
  if (id < 18) return 'p';
  if (id < 27) return 's';
  return 'z';
}
export function rankOf(id) { return isHonor(id) ? id - 26 : id % 9 + 1; }

export function makeWall() {
  const wall = [];
  for (let id = 0; id < 34; id++) for (let copy = 0; copy < 4; copy++) wall.push(id);
  return wall;
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function countsFromTiles(tiles) {
  const counts = Array(34).fill(0);
  for (const tile of tiles) {
    if (!Number.isInteger(tile) || tile < 0 || tile > 33) throw new TypeError(`Invalid tile ${tile}`);
    counts[tile] += 1;
    if (counts[tile] > 4) throw new RangeError(`Too many copies of ${tileCode(tile)}`);
  }
  return counts;
}

export function sortTiles(tiles) { return [...tiles].sort((a, b) => a - b); }

function normalShantenFromCounts(source) {
  const counts = [...source];
  let best = 8;

  function walk(index, melds, pairs, taatsu) {
    while (index < 34 && counts[index] === 0) index += 1;
    if (index >= 34) {
      const usefulTaatsu = Math.min(taatsu, 4 - melds);
      const value = 8 - melds * 2 - usefulTaatsu - Math.min(1, pairs);
      if (value < best) best = value;
      return;
    }

    if (melds > 4 || taatsu > 4) return;

    // Triplet.
    if (counts[index] >= 3) {
      counts[index] -= 3;
      walk(index, melds + 1, pairs, taatsu);
      counts[index] += 3;
    }

    // Sequence.
    if (index < 27 && index % 9 <= 6 && counts[index + 1] > 0 && counts[index + 2] > 0) {
      counts[index] -= 1; counts[index + 1] -= 1; counts[index + 2] -= 1;
      walk(index, melds + 1, pairs, taatsu);
      counts[index] += 1; counts[index + 1] += 1; counts[index + 2] += 1;
    }

    // Pair can be the head or an incomplete group.
    if (counts[index] >= 2) {
      counts[index] -= 2;
      walk(index, melds, pairs + 1, taatsu);
      walk(index, melds, pairs, taatsu + 1);
      counts[index] += 2;
    }

    // Ryanmen / penchan taatsu.
    if (index < 27 && index % 9 <= 7 && counts[index + 1] > 0) {
      counts[index] -= 1; counts[index + 1] -= 1;
      walk(index, melds, pairs, taatsu + 1);
      counts[index] += 1; counts[index + 1] += 1;
    }

    // Kanchan taatsu.
    if (index < 27 && index % 9 <= 6 && counts[index + 2] > 0) {
      counts[index] -= 1; counts[index + 2] -= 1;
      walk(index, melds, pairs, taatsu + 1);
      counts[index] += 1; counts[index + 2] += 1;
    }

    // Ignore one tile and continue. This branch is essential for finding the optimum.
    counts[index] -= 1;
    walk(index, melds, pairs, taatsu);
    counts[index] += 1;
  }

  walk(0, 0, 0, 0);
  return best;
}

function chiitoiShanten(counts) {
  let pairs = 0;
  let unique = 0;
  for (const count of counts) {
    if (count > 0) unique += 1;
    if (count >= 2) pairs += 1;
  }
  return 6 - pairs + Math.max(0, 7 - unique);
}

const KOKUSHI = new Set([0,8,9,17,18,26,27,28,29,30,31,32,33]);
function kokushiShanten(counts) {
  let unique = 0;
  let pair = 0;
  for (const id of KOKUSHI) {
    if (counts[id] > 0) unique += 1;
    if (counts[id] > 1) pair = 1;
  }
  return 13 - unique - pair;
}

export function shanten(tilesOrCounts) {
  const counts = Array.isArray(tilesOrCounts) && tilesOrCounts.length === 34
    ? [...tilesOrCounts]
    : countsFromTiles(tilesOrCounts);
  return Math.min(normalShantenFromCounts(counts), chiitoiShanten(counts), kokushiShanten(counts));
}

export function isWinning(tiles) {
  return tiles.length % 3 === 2 && shanten(tiles) === -1;
}

export function ukeireForThirteen(tiles) {
  const counts = countsFromTiles(tiles);
  const base = shanten(counts);
  const waits = [];
  let total = 0;
  for (let id = 0; id < 34; id++) {
    if (counts[id] >= 4) continue;
    counts[id] += 1;
    const next = shanten(counts);
    counts[id] -= 1;
    if (next < base) {
      const left = 4 - counts[id];
      waits.push({ id, left, next });
      total += left;
    }
  }
  return { shanten: base, waits, total };
}

export function analyzeDiscards(hand) {
  if (hand.length % 3 !== 2) throw new RangeError(gDiscard analysis expects a 14-tile hand');
  const seen = new Set();
  const rows = [];
  for (let index = 0; index < hand.length; index++) {
    const id = hand[index];
    if (seen.has(id)) continue;
    seen.add(id);
    const next = hand.slice();
    next.splice(index, 1);
    const info = ukeireForThirteen(next);
    rows.push({ id, shanten: info.shanten, ukeire: info.total, waits: info.waits });
  }
  rows.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire || a.id - b.id);
  const best = rows[0];
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    best: row.shanten === best.shanten && row.ukeire === best.ukeire
  }));
}

function consumeMelds(counts, groups, start = 0) {
  let i = start;
  while (i < 34 && counts[i] === 0) i += 1;
  if (i === 34) return groups.map((g) => ({ ...g }));
  if (counts[i] >= 3) {
    counts[i] -= 3;
    groups.push({ type: 'triplet', tiles: [i, i, i] });
    const result = consumeMelds(counts, groups, i);
    if (result) return result;
    groups.pop();
    counts[i] += 3;
  }
  if (i < 27 && i % 9 <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0) {
    counts[i] -= 1; counts[i + 1] -= 1; counts[i + 2] -= 1;
    groups.push({ type: 'sequence', tiles: [i, i + 1, i + 2] });
    const result = consumeMelds(counts, groups, i);
    if (result) return result;
    groups.pop();
    counts[i] += 1; counts[i + 1] += 1; counts[i + 2] += 1;
  }
  return null;
}

export function decomposeStandard(tiles) {
  const counts = countsFromTiles(tiles);
  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const groups = consumeMelds(counts, []);
    counts[pair] += 2;
    if (groups && groups.length === 4) return { pair, groups };
  }
  return null;
}

export function isChiitoitsu(tiles) {
  if (tiles.length !== 14) return false;
  return countsFromTiles(tiles).filter((count) => count === 2).length === 7;
}

export function isKokushi(tiles) {
  if (tiles.length !== 14) return false;
  const counts = countsFromTiles(tiles);
  let pair = false;
  for (const id of KOKUSHI) {
    if (counts[id] === 0) return false;
    if (counts[id] >= 2) pair = true;
  }
  return pair;
}

export function detectClosedYaku(tiles, context = {}) {
  if (!isWinning(tiles)) return [];
  const yaku = [];
  const counts = countsFromTiles(tiles);
  const standard = decomposeStandard(tiles);

  if (context.riichi) yaku.push({ key: 'riichi', name: 'Риичи', han: 1 });
  if (context.tsumo) yaku.push({ key: 'tsumo', name: 'Мензен цумо', han: 1 });
  if (isChiitoitsu(tiles)) yaku.push({ key: 'chiitoi', name: 'Чиито:цу', han: 2 });
  if (isKokushi(tiles)) yaku.push({ key: 'kokushi', name: 'Кокуши мусо', han: 13 });
  if (tiles.every(isSimple)) yaku.push({ key: 'tanyao', name: 'Танъяо', han: 1 });

  const suits = new Set(tiles.filter((id) => id < 27).map(suitOf));
  const hasHonor = tiles.some(isHonor);
  if (suits.size === 1 && !hasHonor) yaku.push({ key: 'chinitsu', name: 'Чиницу', han: 6 });
  else if (suits.size === 1 && hasHonor) yaku.push({ key: 'honitsu', name: 'Хоницу', han: 3 });

  if (standard) {
    if (standard.groups.every((g) => g.type === 'triplet')) yaku.push({ key: 'toitoi', name: 'Тойтой', han: 2 });

    const seqKeys = standard.groups.filter((g) => g.type === 'sequence').map((g) => g.tiles.join('-'));
    if (new Set(seqKeys).size < seqKeys.length) yaku.push({ key: 'iipeikou', name: 'Иипэйко:', han: 1 });

    for (const group of standard.groups.filter((g) => g.type === 'triplet')) {
      const id = group.tiles[0];
      if (id >= 31) yaku.push({ key: `dragon-${id}`, name: `Якухай · ${tileName(id)}`, han: 1 });
      if (id === context.seatWind) yaku.push({ key: 'seat-wind', name: `Якухай · ветер места`, han: 1 });
      if (id === context.roundWind) yaku.push({ key: 'round-wind', name: `Якухай · ветер раунда`, han: 1 });
    }
  }

  return yaku;
}

export function hasYaku(tiles, context = {}) {
  return detectClosedYaku(tiles, context).length > 0;
}

export function formatWaits(waits) {
  return waits.map(({ id, left }) => `${tileCode(id)}×${left}`).join(' · ');
}

export function seededRandom(seed = Date.now()) {
  let value = (seed >>> 0) || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}
