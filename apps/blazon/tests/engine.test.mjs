import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILD_STEPS,
  canPlaceElement,
  choosePatronage,
  createCampaign,
  evaluateHeraldry,
  isLegalTincture,
  placeElement,
  requirementStatus,
  resolveTrial
} from '../engine.js';

test('law of tincture separates metals and colours', () => {
  assert.equal(isLegalTincture('or', 'gules'), true);
  assert.equal(isLegalTincture('or', 'argent'), false);
  assert.equal(isLegalTincture('azure', 'gules'), false);
});

test('key is locked until tower or bordure exists', () => {
  const campaign = createCampaign('lion', 2);
  assert.equal(requirementStatus(campaign, 'key').ok, false);
  campaign.board.charges[0] = { id: 'tower-x', device: 'tower', tincture: 'argent' };
  assert.equal(requirementStatus(campaign, 'key').ok, true);
});

test('placing four elements unlocks one chapter trial instead of combat every turn', () => {
  const campaign = createCampaign('lion', 4);
  for (let i = 0; i < BUILD_STEPS; i += 1) {
    campaign.offer = [{ id: `rose-${i}`, device: 'rose', tincture: i % 2 ? 'argent' : 'or' }];
    const slot = [0,1,2,4][i];
    assert.equal(placeElement(campaign, `rose-${i}`, slot).ok, true);
  }
  assert.equal(campaign.pendingTrial, true);
  assert.equal(campaign.history.filter((x) => x.kind === 'trial').length, 0);
});

test('tower and key activate gatekeeper combination', () => {
  const campaign = createCampaign('stag', 8);
  campaign.board.charges[0] = { id: 'tower', device: 'tower', tincture: 'argent' };
  campaign.board.charges[1] = { id: 'key', device: 'key', tincture: 'or' };
  const result = evaluateHeraldry(campaign);
  assert.ok(result.combos.some((x) => x.id === 'gatekeeper'));
});

test('dragon scandal is reduced by chain combination', () => {
  const campaign = createCampaign('raven', 9);
  campaign.board.charges[0] = { id: 'dragon', device: 'dragon', tincture: 'or' };
  const before = evaluateHeraldry(campaign).scandal;
  campaign.board.ornaments.push({ id: 'chain', device: 'chain', tincture: null });
  const after = evaluateHeraldry(campaign).scandal;
  assert.ok(after < before);
});

test('an unavailable slot cannot accept a charge', () => {
  const campaign = createCampaign('lion', 10);
  campaign.offer = [{ id: 'lion-2', device: 'lion', tincture: 'argent' }];
  assert.equal(canPlaceElement(campaign, campaign.offer[0], 3).ok, false);
});

test('trial resolves only after chapter build and opens patronage', () => {
  const campaign = createCampaign('lion', 11);
  campaign.pendingTrial = true;
  campaign.step = BUILD_STEPS;
  campaign.board.charges[0] = { id: 'sword', device: 'sword', tincture: 'argent' };
  campaign.board.charges[1] = { id: 'cross', device: 'cross', tincture: 'or' };
  const result = resolveTrial(campaign, 'charge');
  assert.equal(result.ok, true);
  assert.equal(campaign.pendingTrial, false);
  assert.equal(campaign.pendingPatronage || campaign.failed, true);
});

test('patronage advances to the next chapter', () => {
  const campaign = createCampaign('lion', 12);
  campaign.pendingPatronage = true;
  campaign.patronageOffer = ['enamel'];
  assert.equal(choosePatronage(campaign, 'enamel'), true);
  assert.equal(campaign.chapter, 1);
  assert.ok(campaign.offer.length === 3);
});

test('a full shield evolves by replacing non-founder charges', () => {
  const campaign = createCampaign('lion', 15);
  campaign.board.charges = campaign.board.charges.map((entry, index) => entry || { id: `rose-${index}`, device: 'rose', tincture: 'argent' });
  campaign.offer = [{ id: 'sword-new', device: 'sword', tincture: 'argent' }];
  assert.equal(canPlaceElement(campaign, campaign.offer[0], 0).ok, true);
  assert.equal(placeElement(campaign, 'sword-new', 0).ok, true);
  assert.equal(campaign.board.charges[0].device, 'sword');
  assert.equal(campaign.board.charges[3].founder, true);
});
