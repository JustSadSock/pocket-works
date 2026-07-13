import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BLACK,
  WHITE,
  EMPTY,
  createGame,
  getGroup,
  inspectMove,
  passTurn,
  playMove
} from '../apps/sente/go-engine.js';
import { isEyeFill } from '../apps/sente/ai-core.js';
import {
  buildSgf,
  chooseConsensus,
  makeReadPlan,
  parseGeneratedMove
} from '../apps/sente/gnugo-protocol.js';
import { loadSenteGnugo } from './sente-gnugo-node.mjs';

const root = process.cwd();
const outputDirectory = path.join(root, 'apps', 'sente');
const failures = [];
const checks = [];

function check(name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), details });
  if (!passed) failures.push({ name, details });
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function boardAscii(game) {
  const rows = [];
  for (let y = 0; y < game.size; y += 1) {
    let row = '';
    for (let x = 0; x < game.size; x += 1) {
      const value = game.board[y * game.size + x];
      row += value === BLACK ? '●' : value === WHITE ? '○' : '·';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

function compactGame(game) {
  return {
    size: game.size,
    komi: game.komi,
    turn: game.turn,
    moveNumber: game.moveNumber,
    moves: game.moves
  };
}

function coordinate(move) {
  return move?.pass ? 'pass' : move ? `${String.fromCharCode(65 + move.x)}${move.y + 1}` : 'invalid';
}

async function engineMove(engine, game, level, seed, readOverride = null) {
  const plan = makeReadPlan(level, game.size, seed);
  if (readOverride) plan.splice(readOverride);
  const votes = [];
  for (let index = 0; index < plan.length; index += 1) {
    const read = plan[index];
    const output = engine.play(read.seed, buildSgf(compactGame(game), read.transform));
    const move = parseGeneratedMove(output, game.turn, game.size, read.transform);
    votes.push({ index, seed: read.seed, move });
  }
  return chooseConsensus(votes, level, seed)?.move || null;
}

function setupProbe(engine, name, sgf, color, expected, forbidden = null, seed = 1) {
  const output = engine.play(seed, sgf);
  const move = parseGeneratedMove(output, color, 9, 0);
  const passed = expected
    ? move && !move.pass && move.x === expected.x && move.y === expected.y
    : move && (!forbidden || move.pass || move.x !== forbidden.x || move.y !== forbidden.y);
  check(name, passed, { move: coordinate(move), expected: expected ? coordinate(expected) : undefined, forbidden: forbidden ? coordinate(forbidden) : undefined });
  return move;
}

function localCounts(game, x, y, color, radius) {
  let count = 0;
  for (let py = Math.max(0, y - radius); py <= Math.min(game.size - 1, y + radius); py += 1) {
    for (let px = Math.max(0, x - radius); px <= Math.min(game.size - 1, x + radius); px += 1) {
      if (px === x && py === y) continue;
      if (Math.max(Math.abs(px - x), Math.abs(py - y)) > radius) continue;
      if (game.board[py * game.size + px] === color) count += 1;
    }
  }
  return count;
}

function scriptedMove(game, style, rng) {
  const opponent = game.turn === BLACK ? WHITE : BLACK;
  const candidates = [];
  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const inspection = inspectMove(game, x, y, game.turn);
      if (!inspection.legal || isEyeFill(game, x, y, game.turn)) continue;
      const group = getGroup(inspection.board, game.size, x, y);
      const ownNear = localCounts(game, x, y, game.turn, 2);
      const enemyNear = localCounts(game, x, y, opponent, 2);
      const edge = Math.min(x, y, game.size - 1 - x, game.size - 1 - y);
      let score = inspection.captured.length * 500 + Math.min(6, group.liberties.length) * 5;
      if (style === 'expansion') score += (ownNear === 0 ? 45 : ownNear === 1 ? 18 : -ownNear * 10) + (edge === 2 ? 16 : 0);
      else if (style === 'contact') score += enemyNear * 24 + ownNear * 3;
      else score += (edge >= 2 ? 10 : -8) - ownNear * 4 + enemyNear * 8;
      score += rng() * 4;
      candidates.push({ x, y, inspection, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

async function playObservedGame(engine, options) {
  const game = createGame({ size: 9, komi: 6.5 });
  const rng = seeded(options.seed ^ 0xabc123);
  const snapshots = [{ move: 0, board: boardAscii(game) }];
  const moveLog = [];
  let engineMoves = 0;
  let illegalEngineMoves = 0;
  let eyeFills = 0;
  let densePeaceful = 0;
  let firstPass = null;

  for (let ply = 0; ply < 120 && game.phase === 'playing'; ply += 1) {
    const engineTurn = options.engineBoth || game.turn === options.engineColor;
    let move;
    if (engineTurn) move = await engineMove(engine, game, options.level || 'steady', options.seed + ply * 7919, options.auditReads || 1);
    else move = scriptedMove(game, options.opponentStyle || 'expansion', rng);

    if (!move || move.pass) {
      if (firstPass === null) firstPass = game.moveNumber;
      passTurn(game);
      moveLog.push({ number: game.moveNumber, color: game.turn === BLACK ? WHITE : BLACK, move: 'pass', engine: engineTurn });
    } else {
      const inspection = inspectMove(game, move.x, move.y, game.turn);
      if (engineTurn) {
        engineMoves += 1;
        if (!inspection.legal) illegalEngineMoves += 1;
        if (isEyeFill(game, move.x, move.y, game.turn) && !inspection.captured?.length) eyeFills += 1;
        const opponent = game.turn === BLACK ? WHITE : BLACK;
        const peaceful = localCounts(game, move.x, move.y, opponent, 2) === 0 && !inspection.captured?.length;
        if (peaceful && localCounts(game, move.x, move.y, game.turn, 2) >= 3) densePeaceful += 1;
      }
      if (!inspection.legal) {
        passTurn(game);
        moveLog.push({ number: game.moveNumber, color: game.turn === BLACK ? WHITE : BLACK, move: 'illegal→pass', engine: engineTurn });
      } else {
        const color = game.turn;
        playMove(game, move.x, move.y);
        moveLog.push({ number: game.moveNumber, color, move: coordinate(move), engine: engineTurn, captured: inspection.captured.length });
      }
    }
    if (game.moveNumber % 10 === 0 || game.phase !== 'playing') snapshots.push({ move: game.moveNumber, board: boardAscii(game) });
  }

  if (game.phase === 'playing') {
    passTurn(game);
    if (game.phase === 'playing') passTurn(game);
  }
  const occupied = game.board.reduce((sum, value) => sum + (value === EMPTY ? 0 : 1), 0);
  return {
    name: options.name,
    options,
    moves: game.moveNumber,
    endedNaturally: firstPass !== null && game.moveNumber < 122,
    firstPass,
    occupied,
    occupancy: occupied / game.board.length,
    captures: game.captures,
    engineMoves,
    illegalEngineMoves,
    eyeFills,
    densePeaceful,
    densePeacefulRate: engineMoves ? densePeaceful / engineMoves : 0,
    snapshots,
    moveLog
  };
}

const startedAt = new Date().toISOString();
const engine = await loadSenteGnugo();
check('GNU Go runtime version', /^3\./.test(engine.version), { version: engine.version });

const captureBlack = '(;GM[1]FF[4]SZ[9]KM[6.5]AB[de][ed][fe]AW[ee]PL[B])';
const saveBlack = '(;GM[1]FF[4]SZ[9]KM[6.5]AB[ee]AW[de][ed][fe]PL[B])';
const captureWhite = '(;GM[1]FF[4]SZ[9]KM[6.5]AW[de][ed][fe]AB[ee]PL[W])';
const saveWhite = '(;GM[1]FF[4]SZ[9]KM[6.5]AW[ee]AB[de][ed][fe]PL[W])';
setupProbe(engine, 'Black captures a stone in atari', captureBlack, BLACK, { x: 4, y: 5 }, null, 11);
setupProbe(engine, 'Black saves a stone in atari', saveBlack, BLACK, { x: 4, y: 5 }, null, 12);
setupProbe(engine, 'White captures a stone in atari', captureWhite, WHITE, { x: 4, y: 5 }, null, 13);
setupProbe(engine, 'White saves a stone in atari', saveWhite, WHITE, { x: 4, y: 5 }, null, 14);

const blackEye = '(;GM[1]FF[4]SZ[9]KM[6.5]AB[dd][ed][fd][de][fe][df][ef][ff]PL[B])';
const whiteEye = '(;GM[1]FF[4]SZ[9]KM[6.5]AW[dd][ed][fd][de][fe][df][ef][ff]PL[W])';
for (let seed = 20; seed < 28; seed += 1) setupProbe(engine, `Black does not fill own eye seed ${seed}`, blackEye, BLACK, null, { x: 4, y: 4 }, seed);
for (let seed = 30; seed < 38; seed += 1) setupProbe(engine, `White does not fill own eye seed ${seed}`, whiteEye, WHITE, null, { x: 4, y: 4 }, seed);

const openingMoves = [];
for (const size of [9, 13, 19]) {
  for (let seed = 101; seed <= 108; seed += 1) {
    const game = createGame({ size, komi: 6.5 });
    const move = await engineMove(engine, game, 'steady', seed * size, 1);
    const legal = Boolean(move?.pass || (move && inspectMove(game, move.x, move.y, BLACK).legal));
    const edge = move?.pass ? -1 : Math.min(move.x, move.y, size - 1 - move.x, size - 1 - move.y);
    check(`Opening ${size}x${size} seed ${seed} is legal`, legal, { move: coordinate(move), edge });
    check(`Opening ${size}x${size} seed ${seed} avoids first line`, Boolean(move && !move.pass && edge >= 1), { move: coordinate(move), edge });
    openingMoves.push({ size, seed, move: coordinate(move), edge });
  }
}
const uniqueNine = new Set(openingMoves.filter((item) => item.size === 9).map((item) => item.move)).size;
check('9x9 openings vary across seeds', uniqueNine >= 2, { unique: uniqueNine, openings: openingMoves.filter((item) => item.size === 9) });

const games = [];
const gamePlans = [
  { name: 'Club bot as Black vs expansion', seed: 4001, engineColor: BLACK, level: 'steady', opponentStyle: 'expansion' },
  { name: 'Club bot as White vs expansion', seed: 4002, engineColor: WHITE, level: 'steady', opponentStyle: 'expansion' },
  { name: 'Club bot as Black vs contact', seed: 4003, engineColor: BLACK, level: 'steady', opponentStyle: 'contact' },
  { name: 'Club bot as White vs contact', seed: 4004, engineColor: WHITE, level: 'steady', opponentStyle: 'contact' },
  { name: 'GNU Go self-play A', seed: 4005, engineBoth: true, level: 'steady' },
  { name: 'GNU Go self-play B', seed: 4006, engineBoth: true, level: 'steady' }
];
for (const plan of gamePlans) games.push(await playObservedGame(engine, { ...plan, auditReads: 1 }));

for (const game of games) {
  check(`${game.name}: no illegal engine moves`, game.illegalEngineMoves === 0, { illegal: game.illegalEngineMoves });
  check(`${game.name}: no true-eye filling`, game.eyeFills === 0, { eyeFills: game.eyeFills });
  check(`${game.name}: engine does not mainly clump`, game.densePeacefulRate < 0.38, { rate: game.densePeacefulRate, dense: game.densePeaceful, engineMoves: game.engineMoves });
  if (game.options.engineBoth) {
    check(`${game.name}: finishes by passes`, game.firstPass !== null && game.moves <= 120, { firstPass: game.firstPass, moves: game.moves });
    check(`${game.name}: board is not filled solid`, game.occupancy < 0.92, { occupancy: game.occupancy, occupied: game.occupied });
  }
}

const passed = checks.filter((item) => item.passed).length;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  startedAt,
  engine: { name: 'GNU Go', version: engine.version, upstreamCommit: '382df5a9b14b62ea451012ec7d2e81c61162e037' },
  summary: { total: checks.length, passed, failed: checks.length - passed, criticalFailures: failures.length },
  checks,
  openings: openingMoves,
  observedGames: games
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, 'AI_AUDIT.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const markdown = [
  '# SENTE AI audit',
  '',
  `Generated: ${report.generatedAt}`,
  `Engine: GNU Go ${engine.version}`,
  `Checks: ${passed}/${checks.length} passed`,
  '',
  '## Failures',
  failures.length ? failures.map((failure) => `- ${failure.name}: \`${JSON.stringify(failure.details)}\``).join('\n') : '- None',
  '',
  '## Opening probes',
  ...openingMoves.map((item) => `- ${item.size}×${item.size}, seed ${item.seed}: ${item.move}, edge distance ${item.edge}`),
  '',
  '## Observed games',
  ...games.flatMap((game) => [
    '',
    `### ${game.name}`,
    '',
    `Moves: ${game.moves}; first pass: ${game.firstPass ?? 'none'}; occupancy: ${(game.occupancy * 100).toFixed(1)}%; eye fills: ${game.eyeFills}; dense peaceful moves: ${(game.densePeacefulRate * 100).toFixed(1)}%.`,
    '',
    ...game.snapshots.flatMap((snapshot) => [`Move ${snapshot.move}:`, '```text', snapshot.board, '```'])
  ])
].join('\n');
await writeFile(path.join(outputDirectory, 'AI_AUDIT.md'), `${markdown}\n`, 'utf8');

console.log(`SENTE AI audit: ${passed}/${checks.length} checks passed; ${games.length} observed games.`);
const critical = failures.filter((failure) => /runtime|captures|saves|illegal|true-eye/i.test(failure.name));
if (critical.length) throw new Error(`SENTE AI audit has ${critical.length} critical failure(s). See apps/sente/AI_AUDIT.md.`);
