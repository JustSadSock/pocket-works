import assert from 'node:assert/strict';
import {
  PROJECTS,
  SLOT_COUNT,
  advanceFromResolution,
  applyEventChoice,
  buildProject,
  createGame,
  evaluateBoard,
  getCurrentEvent,
  isValidGame,
  locateSector,
  resolveCycle,
  rotateRing,
  sectorAt
} from './game-core.js';

const game = createGame('CORE01', 'water');
assert.equal(isValidGame(game), true);
assert.equal(game.rings.length, 3);
assert.equal(game.rings.every((ring) => ring.length === SLOT_COUNT), true);
assert.equal(new Set(game.rings.flat().map((sector) => sector.uid)).size, 24);
assert.ok(evaluateBoard(game).partialChains.length >= 2, 'generated opening must have at least two working middle lines');

const selected = sectorAt(game, 2, 0);
assert.equal(locateSector(game, selected.uid)?.sector.uid, selected.uid);

const guildGame = createGame('GUILD1', 'guild');
const commandBefore = guildGame.command;
assert.equal(rotateRing(guildGame, 1, 1).ok, true);
assert.equal(guildGame.command, commandBefore, 'guild charter makes the first middle-ring step free');
assert.equal(rotateRing(guildGame, 1, 1).cost, 1);

const projectGame = createGame('BUILD1', 'civic');
projectGame.resources = { rations: 30, parts: 30, mandate: 30 };
assert.equal(buildProject(projectGame, PROJECTS[0].id).ok, true);
assert.equal(projectGame.actionUsed, true);
assert.equal(buildProject(projectGame, PROJECTS[1].id).ok, false, 'only one civic action is allowed per cycle');

const cycleGame = createGame('CYCLE1', 'water');
const resolution = resolveCycle(cycleGame);
assert.equal(resolution.ok, true);
assert.ok(['resolution', 'complete'].includes(cycleGame.phase));
assert.equal(cycleGame.lastResolution.cycle, 1);
assert.equal(Array.isArray(cycleGame.lastResolution.attacks), true);
assert.equal(cycleGame.lastResolution.attacks.length, 1, 'the opening storm attacks one forecast spoke');

if (cycleGame.phase === 'resolution') {
  const advanced = advanceFromResolution(cycleGame);
  assert.equal(advanced.ok, true);
  assert.equal(cycleGame.cycle, 2);
  resolveCycle(cycleGame);
  const eventAdvance = advanceFromResolution(cycleGame);
  assert.ok(eventAdvance.event, 'cycle two must lead into a civic event');
  const event = getCurrentEvent(cycleGame);
  const freeChoice = event.choices.find((choice) => !choice.requires);
  assert.ok(freeChoice);
  assert.equal(applyEventChoice(cycleGame, freeChoice.id).ok, true);
  assert.equal(cycleGame.cycle, 3);
  assert.equal(cycleGame.phase, 'playing');
}

const fatalEventGame = createGame('EVENT0', 'water');
fatalEventGame.phase = 'event';
fatalEventGame.pendingEvent = 'underfloor-hum';
fatalEventGame.integrity = 4;
assert.equal(applyEventChoice(fatalEventGame, 'harvest').ok, true);
assert.equal(fatalEventGame.phase, 'complete', 'a fatal event consequence must end the chronicle immediately');
assert.equal(fatalEventGame.outcome.won, false);

console.log('СВОД core: all deterministic checks passed');
