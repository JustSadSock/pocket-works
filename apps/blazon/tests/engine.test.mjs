import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUGMENTS,
  CHARGES,
  HOUSES,
  OPPONENTS,
  chooseEnemyAction,
  chooseReward,
  createCampaign,
  finishBattle,
  generateRewards,
  isLegalPlacement,
  playRound,
  previewAction,
  rankEnemyActions,
  restartBattle
} from '../engine.js';

test('campaign creates a playable first battle with three cards per side', () => {
  const campaign = createCampaign('lion', 12345);
  assert.equal(campaign.houseId, HOUSES.lion.id);
  assert.equal(campaign.stage, 0);
  assert.equal(campaign.battle.enemy.id, OPPONENTS[0].id);
  assert.equal(campaign.battle.player.hand.length, 3);
  assert.equal(campaign.battle.enemy.hand.length, 3);
  assert.equal(campaign.battle.phase, 'player');
});

test('rule of tincture rejects metal on metal and color on color', () => {
  const campaign = createCampaign('lion', 7);
  const player = campaign.battle.player;
  assert.equal(isLegalPlacement(player, { kind: 'charge', device: 'lion', tincture: 'or' }, 0), true);
  assert.equal(isLegalPlacement(player, { kind: 'charge', device: 'lion', tincture: 'azure' }, 0), false);
  player.ordinary = { kind: 'ordinary', device: 'chief', tincture: 'or' };
  assert.equal(isLegalPlacement(player, { kind: 'charge', device: 'lion', tincture: 'argent' }, 1), false);
  assert.equal(isLegalPlacement(player, { kind: 'charge', device: 'lion', tincture: 'azure' }, 1), true);
});

test('illegal placement gains force but inflicts dishonor damage', () => {
  const campaign = createCampaign('lion', 9);
  const battle = campaign.battle;
  const illegal = { id: 'x', kind: 'charge', device: 'boar', tincture: 'azure' };
  const legal = { id: 'y', kind: 'charge', device: 'boar', tincture: 'or' };
  const illegalPreview = previewAction(battle, 'player', illegal, 0);
  const legalPreview = previewAction(battle, 'player', legal, 0);
  assert.equal(illegalPreview.legal, false);
  assert.equal(illegalPreview.selfDamage, 1);
  assert.ok(illegalPreview.attack > legalPreview.attack);
  assert.ok(legalPreview.honor > illegalPreview.honor);
});

test('a complete round advances turn and draws a new hand', () => {
  const campaign = createCampaign('stag', 42);
  const battle = campaign.battle;
  const playerCard = battle.player.hand[0];
  const target = playerCard.kind === 'ordinary' ? 'ordinary' : 3;
  const enemyChoice = chooseEnemyAction(battle);
  const result = playRound(battle, playerCard.id, target, enemyChoice);
  assert.equal(result.ok, true);
  assert.equal(result.battle.turn, 2);
  assert.equal(result.battle.history.length, 1);
  assert.equal(result.battle.player.hand.length, 3);
  assert.equal(result.battle.enemy.hand.length, 3);
});

test('AI ranks every card-target combination and returns a legal action', () => {
  const campaign = createCampaign('raven', 101);
  const battle = campaign.battle;
  const ranked = rankEnemyActions(battle);
  assert.ok(ranked.length >= 3);
  const choice = chooseEnemyAction(battle);
  assert.ok(battle.enemy.hand.some((card) => card.id === choice.cardId));
});

test('victory produces rewards and chosen reward starts next opponent', () => {
  let campaign = createCampaign('lion', 555);
  campaign.battle.winner = 'player';
  campaign.battle.phase = 'reward';
  campaign = finishBattle(campaign, campaign.battle);
  assert.equal(campaign.victories, 1);
  assert.equal(campaign.rewards.length, 3);
  const reward = campaign.rewards[0];
  assert.ok(AUGMENTS[reward]);
  campaign = chooseReward(campaign, reward);
  assert.equal(campaign.stage, 1);
  assert.ok(campaign.augments.includes(reward));
  assert.equal(campaign.battle.enemy.id, OPPONENTS[1].id);
});

test('restart keeps campaign identity and augment list', () => {
  let campaign = createCampaign('stag', 77);
  const generated = generateRewards(campaign);
  campaign.rewards = generated.rewards;
  campaign = chooseReward(campaign, campaign.rewards[0]);
  const before = [...campaign.augments];
  campaign.battle.turn = 5;
  const restarted = restartBattle(campaign);
  assert.equal(restarted.stage, campaign.stage);
  assert.deepEqual(restarted.augments, before);
  assert.equal(restarted.battle.turn, 1);
  assert.equal(restarted.battle.player.renown, restarted.battle.player.maxRenown);
});

test('charge catalogue retains distinct tactical identities', () => {
  assert.ok(CHARGES.boar.attack > CHARGES.tower.attack);
  assert.ok(CHARGES.tower.guard > CHARGES.lion.guard);
  assert.ok(CHARGES.fleur.honor > CHARGES.boar.honor);
});
