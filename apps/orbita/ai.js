import {
  RINGS,
  SECTORS,
  colorForTurn,
  findWinningPath,
  isRotationAllowed,
  placeStone,
  rotateRing,
  swapSides
} from './engine.js';

export const AI_LEVELS = {
  easy: { label: 'УЧЕНИК', description: 'Ошибается и играет быстро' },
  medium: { label: 'СТРАТЕГ', description: 'Видит угрозы на ход вперёд' },
  hard: { label: 'ОРАКУЛ', description: 'Просчитывает ответ соперника' }
};

const DIRECTIONS = [-1, 1];
const CELL_COUNT = RINGS * SECTORS;

function neighbors(ring, sector) {
  const result = [
    [ring, (sector - 1 + SECTORS) % SECTORS],
    [ring, (sector + 1) % SECTORS]
  ];
  if (ring > 0) result.push([ring - 1, sector]);
  if (ring < RINGS - 1) result.push([ring + 1, sector]);
  return result;
}

function boardKey(board) {
  return board.flat().map((cell) => cell === null ? '-' : cell).join('');
}

function latestRotationKey(state) {
  const turn = [...state.history].reverse().find((entry) => entry.type === 'turn');
  return turn ? `${turn.rotatedRing}:${turn.direction}` : '-';
}

function resultKey(state) {
  return [
    boardKey(state.board),
    state.challengeColor ?? '-',
    state.challengeCooldownColor ?? '-',
    state.winnerSeat ?? '-',
    state.turnSeat,
    latestRotationKey(state)
  ].join(':');
}

function entryCost(cell, color) {
  if (cell === color) return 0;
  if (cell === null) return 1;
  return 7;
}

export function connectionCost(board, color) {
  const distances = Array.from({ length: RINGS }, () => Array(SECTORS).fill(Infinity));
  const queue = [];

  for (let sector = 0; sector < SECTORS; sector += 1) {
    const cost = entryCost(board[0][sector], color);
    distances[0][sector] = cost;
    queue.push([cost, 0, sector]);
  }

  while (queue.length) {
    queue.sort((left, right) => left[0] - right[0]);
    const [distance, ring, sector] = queue.shift();
    if (distance !== distances[ring][sector]) continue;
    if (ring === RINGS - 1) return distance;

    for (const [nextRing, nextSector] of neighbors(ring, sector)) {
      const nextDistance = distance + entryCost(board[nextRing][nextSector], color);
      if (nextDistance >= distances[nextRing][nextSector]) continue;
      distances[nextRing][nextSector] = nextDistance;
      queue.push([nextDistance, nextRing, nextSector]);
    }
  }

  return CELL_COUNT;
}

function componentStats(board, color) {
  const seen = new Set();
  let largestSize = 0;
  let largestSpan = 0;
  let endpointComponents = 0;

  for (let ring = 0; ring < RINGS; ring += 1) {
    for (let sector = 0; sector < SECTORS; sector += 1) {
      if (board[ring][sector] !== color) continue;
      const startKey = `${ring}:${sector}`;
      if (seen.has(startKey)) continue;

      const queue = [[ring, sector]];
      seen.add(startKey);
      let size = 0;
      let minRing = ring;
      let maxRing = ring;

      while (queue.length) {
        const [currentRing, currentSector] = queue.shift();
        size += 1;
        minRing = Math.min(minRing, currentRing);
        maxRing = Math.max(maxRing, currentRing);
        for (const [nextRing, nextSector] of neighbors(currentRing, currentSector)) {
          const nextKey = `${nextRing}:${nextSector}`;
          if (seen.has(nextKey) || board[nextRing][nextSector] !== color) continue;
          seen.add(nextKey);
          queue.push([nextRing, nextSector]);
        }
      }

      largestSize = Math.max(largestSize, size);
      largestSpan = Math.max(largestSpan, maxRing - minRing + 1);
      if (minRing === 0 || maxRing === RINGS - 1) endpointComponents += 1;
    }
  }

  return { largestSize, largestSpan, endpointComponents };
}

function structuralScore(board, color) {
  let radialLinks = 0;
  let arcLinks = 0;
  let endpointStones = 0;
  let stones = 0;

  for (let ring = 0; ring < RINGS; ring += 1) {
    for (let sector = 0; sector < SECTORS; sector += 1) {
      if (board[ring][sector] !== color) continue;
      stones += 1;
      if (ring === 0 || ring === RINGS - 1) endpointStones += 1;
      if (ring < RINGS - 1 && board[ring + 1][sector] === color) radialLinks += 1;
      if (board[ring][(sector + 1) % SECTORS] === color) arcLinks += 1;
    }
  }

  return { radialLinks, arcLinks, endpointStones, stones };
}

export function evaluatePosition(state, perspectiveSeat) {
  if (state.winnerSeat === perspectiveSeat) return 1_000_000;
  if (state.winnerSeat !== null && state.winnerSeat !== perspectiveSeat) return -1_000_000;
  if (state.draw) return 0;

  const ownColor = state.seatColors[perspectiveSeat];
  const opponentColor = state.seatColors[1 - perspectiveSeat];
  const ownCost = connectionCost(state.board, ownColor);
  const opponentCost = connectionCost(state.board, opponentColor);
  const ownComponent = componentStats(state.board, ownColor);
  const opponentComponent = componentStats(state.board, opponentColor);
  const ownStructure = structuralScore(state.board, ownColor);
  const opponentStructure = structuralScore(state.board, opponentColor);
  const challengeScore = state.challengeColor === ownColor
    ? 180_000
    : state.challengeColor === opponentColor
      ? -180_000
      : 0;
  const cooldownScore = state.challengeCooldownColor === ownColor
    ? -85
    : state.challengeCooldownColor === opponentColor
      ? 85
      : 0;

  return (
    challengeScore + cooldownScore +
    (opponentCost - ownCost) * 92 +
    (ownComponent.largestSpan - opponentComponent.largestSpan) * 42 +
    (ownComponent.largestSize - opponentComponent.largestSize) * 11 +
    (ownComponent.endpointComponents - opponentComponent.endpointComponents) * 5 +
    (ownStructure.radialLinks - opponentStructure.radialLinks) * 18 +
    (ownStructure.arcLinks - opponentStructure.arcLinks) * 7 +
    (ownStructure.endpointStones - opponentStructure.endpointStones) * 9 +
    (ownStructure.stones - opponentStructure.stones) * 2
  );
}

export function generateLegalTurns(state) {
  if (state.phase !== 'place' || state.winnerSeat !== null || state.draw) return [];
  const results = [];
  const seen = new Set();

  for (let ring = 0; ring < RINGS; ring += 1) {
    for (let sector = 0; sector < SECTORS; sector += 1) {
      if (state.board[ring][sector] !== null) continue;
      const placed = placeStone(state, ring, sector);
      for (let rotatedRing = 0; rotatedRing < RINGS; rotatedRing += 1) {
        for (const direction of DIRECTIONS) {
          if (!isRotationAllowed(placed, rotatedRing, direction)) continue;
          const nextState = rotateRing(placed, rotatedRing, direction);
          const key = resultKey(nextState);
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ ring, sector, rotatedRing, direction, state: nextState });
        }
      }
    }
  }

  return results;
}

export function chooseAiRotation(state, difficulty = 'medium') {
  if (state.phase !== 'rotate') return null;
  const seat = state.turnSeat;
  const candidates = [];
  for (let rotatedRing = 0; rotatedRing < RINGS; rotatedRing += 1) {
    for (const direction of DIRECTIONS) {
      if (!isRotationAllowed(state, rotatedRing, direction)) continue;
      const nextState = rotateRing(state, rotatedRing, direction);
      candidates.push({
        rotatedRing,
        direction,
        state: nextState,
        score: evaluatePosition(nextState, seat)
      });
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  if (difficulty === 'easy' && candidates.length > 1) {
    return candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];
  }
  return candidates[0] || null;
}

function opponentCanWinImmediately(state, perspectiveSeat) {
  if (state.phase !== 'place' || state.turnSeat === perspectiveSeat) return false;
  for (const candidate of generateLegalTurns(state)) {
    if (candidate.state.winnerSeat === state.turnSeat) return true;
  }
  return false;
}

function scoreMedium(candidate, seat) {
  if (candidate.state.winnerSeat === seat) return 1_000_000;
  const staticScore = evaluatePosition(candidate.state, seat);
  const danger = opponentCanWinImmediately(candidate.state, seat) ? 240_000 : 0;
  return staticScore - danger;
}

function scoreHard(candidate, seat) {
  if (candidate.state.winnerSeat === seat) return 1_000_000;
  const ownScore = evaluatePosition(candidate.state, seat);
  const opponentMoves = generateLegalTurns(candidate.state);
  if (!opponentMoves.length) return ownScore;

  let worstReply = Infinity;
  for (const reply of opponentMoves) {
    const replyScore = evaluatePosition(reply.state, seat);
    if (replyScore < worstReply) worstReply = replyScore;
    if (reply.state.winnerSeat === 1 - seat) return -900_000;
  }
  return worstReply * 0.88 + ownScore * 0.12;
}

function pickWithNoise(candidates, topCount, noise) {
  const shortlist = candidates.slice(0, Math.max(1, Math.min(topCount, candidates.length)));
  let best = shortlist[0];
  let bestNoisyScore = -Infinity;
  for (const candidate of shortlist) {
    const noisyScore = candidate.score + (Math.random() - 0.5) * noise;
    if (noisyScore > bestNoisyScore) {
      bestNoisyScore = noisyScore;
      best = candidate;
    }
  }
  return best;
}

export function chooseAiTurn(state, difficulty = 'medium') {
  if (state.phase !== 'place') return null;
  const seat = state.turnSeat;
  const candidates = generateLegalTurns(state);
  if (!candidates.length) return null;

  const winningMove = candidates.find((candidate) => candidate.state.winnerSeat === seat);
  if (winningMove) return winningMove;

  if (difficulty === 'easy') {
    for (const candidate of candidates) candidate.score = evaluatePosition(candidate.state, seat);
    candidates.sort((left, right) => right.score - left.score);
    return pickWithNoise(candidates, Math.max(6, Math.ceil(candidates.length * 0.28)), 180);
  }

  if (difficulty === 'medium') {
    for (const candidate of candidates) candidate.score = scoreMedium(candidate, seat);
    candidates.sort((left, right) => right.score - left.score);
    return pickWithNoise(candidates, 4, 24);
  }

  for (const candidate of candidates) candidate.preScore = evaluatePosition(candidate.state, seat);
  candidates.sort((left, right) => right.preScore - left.preScore);
  const finalists = candidates.slice(0, Math.min(28, candidates.length));
  for (const candidate of finalists) candidate.score = scoreHard(candidate, seat);
  finalists.sort((left, right) => right.score - left.score || right.preScore - left.preScore);
  return finalists[0];
}

export function shouldAiSwap(state, difficulty = 'medium') {
  if (!state.canSwap || state.phase !== 'place') return false;
  if (difficulty === 'easy') return Math.random() < 0.35;

  const firstTurn = state.history.find((entry) => entry.type === 'turn');
  const openingRing = firstTurn?.placed?.ring;
  if (difficulty === 'medium') return openingRing === 0 || openingRing === RINGS - 1;

  const aiSeat = state.turnSeat;
  const swapped = swapSides(state);
  const swapValue = evaluatePosition(swapped, aiSeat);
  const keepValue = evaluatePosition(state, aiSeat) + 36;
  return swapValue >= keepValue || openingRing === 0 || openingRing === RINGS - 1;
}
