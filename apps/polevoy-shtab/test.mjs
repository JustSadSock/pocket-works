import assert from 'node:assert/strict';
import {
  COLS,
  ROWS,
  FACTIONS,
  MISSION_TYPES,
  OFFICERS,
  addOfficer,
  applyRouteToBattle,
  attackUnit,
  beginEnemyPhase,
  chooseEnemyAction,
  completeVictory,
  createCampaign,
  evaluateBattle,
  executeEnemyAction,
  finishRound,
  generateBattle,
  generateFrontChoices,
  generateOfficerChoices,
  getUnit,
  getUpgradeChoices,
  migrateCampaignContent,
  missionProgress,
  moveUnit,
  reachableCells,
  resupplyUnit,
  useDoctrine,
  visibleEnemyIds,
} from './game-core.js';

const campaign = migrateCampaignContent(createCampaign(12345, 'maneuver'), 4);
assert.equal(campaign.contentVersion, 2);
assert.equal(campaign.officers.length, 1);
assert.equal(campaign.doctrineMastery, 4);

const routes = generateFrontChoices(campaign);
assert.equal(routes.length, 3);
assert.equal(new Set(routes.map((route) => route.id)).size, 3);
assert.ok(routes.every((route) => FACTIONS[route.faction]));
assert.ok(routes.every((route) => MISSION_TYPES[route.mission]));

const battle = applyRouteToBattle(generateBattle(campaign), campaign, routes[0]);
assert.equal(battle.terrain.length, COLS * ROWS);
assert.equal(battle.objectives.length, 2);
assert.ok(battle.units.filter((unit) => unit.side === 'player').length >= 5);
assert.ok(battle.units.filter((unit) => unit.side === 'enemy').length >= 5);
assert.ok(battle.mission);
assert.ok(battle.enemyCommander);

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

const isolatedCampaign = migrateCampaignContent(createCampaign(999, 'fire'));
const isolatedRoute = {
  id: 'test-control',
  title: 'Тестовый рубеж',
  mission: 'control',
  threat: 1,
  reward: 'renown',
  rewardValue: 10,
  faction: 'crown',
  commander: 'varr',
  note: 'Тест',
};
const isolated = applyRouteToBattle(generateBattle(isolatedCampaign), isolatedCampaign, isolatedRoute);
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
assert.equal(campaign.history.at(-1).mission, battle.mission.type);

const officerChoices = generateOfficerChoices(campaign);
assert.ok(officerChoices.length > 0);
assert.ok(OFFICERS[officerChoices[0]]);
assert.equal(addOfficer(campaign, officerChoices[0]), true);
assert.equal(addOfficer(campaign, officerChoices[0]), false);

const holdCampaign = migrateCampaignContent(createCampaign(77, 'resolve'));
const holdRoute = { ...isolatedRoute, id: 'hold', mission: 'hold', faction: 'foundry', commander: 'holm' };
const holdBattle = applyRouteToBattle(generateBattle(holdCampaign), holdCampaign, holdRoute);
holdBattle.objectives[0].owner = 'player';
const holdBefore = holdBattle.mission.holdProgress;
finishRound(holdBattle, holdCampaign);
assert.equal(holdBattle.mission.holdProgress, holdBefore + 1, 'hold progress advances exactly once per round');
const holdAfter = holdBattle.mission.holdProgress;
evaluateBattle(holdBattle);
assert.equal(holdBattle.mission.holdProgress, holdAfter, 'evaluating the battle must not farm hold progress');

const breachCampaign = migrateCampaignContent(createCampaign(88, 'maneuver'));
const breachRoute = { ...isolatedRoute, id: 'breach', mission: 'breakthrough', faction: 'ash', commander: 'tarek' };
const breachBattle = applyRouteToBattle(generateBattle(breachCampaign), breachCampaign, breachRoute);
breachBattle.mission.target = 2;
breachBattle.units.filter((unit) => unit.side === 'player').slice(0, 2).forEach((unit) => { unit.col = COLS - 1; });
assert.equal(missionProgress(breachBattle).value, 2);
assert.equal(evaluateBattle(breachBattle), 'victory');

const huntCampaign = migrateCampaignContent(createCampaign(99, 'fire'));
const huntRoute = { ...isolatedRoute, id: 'hunt', mission: 'decapitation', faction: 'veil', commander: 'lene' };
const huntBattle = applyRouteToBattle(generateBattle(huntCampaign), huntCampaign, huntRoute);
const commander = huntBattle.units.find((unit) => unit.id === huntBattle.commanderUnitId);
commander.routed = true;
commander.hp = 0;
assert.equal(evaluateBattle(huntBattle), 'victory');

const raidCampaign = migrateCampaignContent(createCampaign(111, 'fire'));
const raidRoute = { ...isolatedRoute, id: 'raid', mission: 'raid', faction: 'foundry', commander: 'selig' };
const raidBattle = applyRouteToBattle(generateBattle(raidCampaign), raidCampaign, raidRoute);
raidBattle.mission.targetIds.forEach((id) => {
  const unit = raidBattle.units.find((candidate) => candidate.id === id);
  unit.routed = true;
  unit.hp = 0;
});
assert.equal(evaluateBattle(raidBattle), 'victory');

console.log('POLEVOY SHTAB 1.1 CORE PASS');
