import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCampaign,
  evaluateBill,
  getCurrentDossier,
  isCampaignOver,
  resolveVote,
  scoreCampaign,
  toggleClause,
  validateCampaign
} from '../logic.js';

test('campaign generation is deterministic for the same seed', () => {
  const first = createCampaign(1945);
  const second = createCampaign(1945);
  assert.deepEqual(first.dossiers, second.dossiers);
  assert.equal(first.dossiers.length, 6);
  assert.equal(validateCampaign(first), true);
});

test('clause selection toggles and respects the three clause limit', () => {
  let campaign = createCampaign(77);
  const ids = getCurrentDossier(campaign).clauseIds;
  campaign = toggleClause(campaign, ids[0]);
  campaign = toggleClause(campaign, ids[1]);
  campaign = toggleClause(campaign, ids[2]);
  campaign = toggleClause(campaign, ids[3]);
  assert.equal(campaign.selectedClauseIds.length, 3);
  campaign = toggleClause(campaign, ids[1]);
  assert.equal(campaign.selectedClauseIds.includes(ids[1]), false);
});

test('evaluation always accounts for all sixty seats', () => {
  const campaign = createCampaign(2026);
  const result = evaluateBill(campaign);
  const total = result.factions.reduce((sum, faction) => sum + faction.yes + faction.no, 0);
  assert.equal(total, 60);
  assert.equal(result.votes >= 0 && result.votes <= 60, true);
  assert.equal(result.integrity, 100);
});

test('resolving a vote advances the session and records history', () => {
  const campaign = createCampaign(9);
  const next = resolveVote(campaign);
  assert.equal(next.round, 1);
  assert.equal(next.history.length, 1);
  assert.equal(next.selectedClauseIds.length, 0);
});

test('campaign finishes after all dossiers and produces a score', () => {
  let campaign = createCampaign(31);
  while (!isCampaignOver(campaign)) campaign = resolveVote(campaign);
  assert.equal(campaign.finishedAt !== null, true);
  assert.equal(scoreCampaign(campaign) >= 0, true);
});

test('every generated dossier has a route to a majority with at most three clauses', () => {
  const choices = (ids) => {
    const result = [[]];
    for (let first = 0; first < ids.length; first += 1) {
      result.push([ids[first]]);
      for (let second = first + 1; second < ids.length; second += 1) {
        result.push([ids[first], ids[second]]);
        for (let third = second + 1; third < ids.length; third += 1) {
          result.push([ids[first], ids[second], ids[third]]);
        }
      }
    }
    return result;
  };

  for (let seed = 1; seed <= 100; seed += 1) {
    const campaign = createCampaign(seed);
    campaign.dossiers.forEach((dossier, round) => {
      const session = { ...campaign, round, selectedClauseIds: [] };
      const best = Math.max(...choices(dossier.clauseIds).map((ids) => evaluateBill(session, ids).votes));
      assert.equal(best >= 31, true, `seed ${seed}, round ${round + 1} peaked at ${best}`);
    });
  }
});
