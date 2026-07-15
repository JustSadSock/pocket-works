import assert from 'node:assert/strict';
import {
  COLS,
  ROWS,
  attackUnit,
  chooseEnemyAction,
  completeVictory,
  createCampaign,
  executeEnemyAction,
  finishRound,
  generateBattle,
  getUnit,
  getUpgradeChoices,
  moveUnit,
  reachableCells,
  resupplyUnit,
  useDoctrine,
  visibleEnemyIds,
  beginEnemyPhase,
} from './game-core.js';

const campaign = createCampaign(12345, 'maneuver');
const battle = generateBattle(campaign);
assert.equal(battle.terrain.length, COLS * ROWS);
assert.equal(battle.objectives.length, 2);
assert.ok(battle.units.filter((unit) => unit.side === 'player').length >= 5);
assert.ok(battle.units.filter((unit) => unit.side === 'enemy').length >= 5);

const line = getUnit(battle, 'p0');
const cells = reachableCells(battle, campaign, line.id);
assert.ok(cells.length > 0, 'player unit must have reachable cells');
const destination = cells[0];
const beforeCommand = battle.command;
const move = moveUnit(battle, campaign, line.id, destination.row, destination.col);
assert.equal(move.ok, true);
assert.equal(battle.command, beforeCommand - 1);
assert.equal(line.acted, true);

const doctrine = useDoctrine(battle, campaign, line.id);
assert.equal(doctrine.ok, true);
assert.equal(line.acted, false, 'maneuver doctrine refreshes selected unit');
assert.equal(battle.doctrineUsed, true);

line.supply = 1;
line.acted = false;
const supply = resupplyUnit(battle, campaign, line.id);
assert.equal(supply.ok, true);
assert.ok(line.supply > 1);

const isolatedCampaign = createCampaign(999, 'fire');
const isolated = generateBattle(isolatedCampaign);
const attacker = getUnit(isolated, 'p0');
const target = isolated.units.find((unit) => unit.side === 'enemy');
attacker.row = target.row;
attacker.col = target.col - 1;
attacker.acted = false;
const attack = attackUnit(isolated, isolatedCampaign, attacker.id, target.id);
assert.equal(attack.ok, true);
assert.ok(attack.damage >= 1);

beginEnemyPhase(isolated);
const enemy = isolated.units.find((unit) => unit.side === 'enemy' && !unit.routed);
enemy.acted = false;
const action = chooseEnemyAction(isolated, isolatedCampaign, enemy.id);
assert.ok(['attack', 'move', 'entrench', 'wait'].includes(action.type));
const response = executeEnemyAction(isolated, isolatedCampaign, action);
assert.equal(typeof response.ok, 'boolean');
finishRound(isolated, isolatedCampaign);
assert.equal(isolated.phase, 'player');
assert.equal(isolated.turn, 2);

const visible = visibleEnemyIds(isolated);
assert.ok(visible instanceof Set);
const choices = getUpgradeChoices(campaign);
assert.equal(choices.length, 3);
const oldStage = campaign.stage;
completeVictory(campaign, battle, choices[0]);
assert.equal(campaign.stage, oldStage + 1);
assert.equal(campaign.victories, 1);
assert.equal(campaign.upgrades[choices[0]], 1);

console.log('POLEVOY SHTAB CORE PASS');
