import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshots, diagnoseSnapshot, groupCampaigns } from '../analysis.js';

function snapshot(date, overrides = {}) {
  return {
    schemaVersion: 2,
    hash: `hash-${date}`,
    campaignKey: 'POL:1337.1.1',
    metadata: { date, tag: 'POL', startDate: '1337.1.1' },
    economy: { treasury: 100, income: 20, expenses: 15, balance: 5, totalDebt: 0, loans: 0 },
    country: { population: 1000, territoryCount: 2, averageControl: 70, manpower: 500 },
    military: { soldiers: 100, ships: 5 },
    locations: [
      { id: '1', name: 'A', owner: 'POL', population: 600, control: 80, buildings: [] },
      { id: '2', name: 'B', owner: 'POL', population: 400, control: 40, buildings: [] }
    ],
    estates: [], goods: [], loans: [], ...overrides
  };
}

test('compares metrics and identifies gained territories', () => {
  const before = snapshot('1400.1.1');
  const after = snapshot('1401.1.1', {
    economy: { treasury: 80, income: 21, expenses: 25, balance: -4, totalDebt: 50, loans: 1 },
    country: { population: 1300, territoryCount: 3, averageControl: 58, manpower: 450 },
    locations: [...before.locations, { id: '3', name: 'C', owner: 'POL', population: 300, control: 35, buildings: [] }]
  });
  const result = compareSnapshots(before, after);
  assert.equal(result.summary.gained, 1);
  assert.equal(result.metrics.find((item) => item.id === 'treasury').delta, -20);
  assert.ok(result.causes.some((item) => item.title === 'Баланс ухудшился'));
  assert.ok(result.causes.some((item) => item.title === 'Новые территории'));
});

test('diagnoses debt and low-control population with evidence locations', () => {
  const current = snapshot('1401.1.1', {
    economy: { treasury: 20, income: 10, expenses: 20, balance: -10, totalDebt: 100, loans: 2 },
    loans: [{ amount: 50, interest: 4 }, { amount: 50, interest: 4 }]
  });
  const diagnosis = diagnoseSnapshot(current);
  assert.ok(diagnosis.fires.some((item) => item.id === 'negative-balance'));
  assert.ok(diagnosis.fires.some((item) => item.id === 'debt'));
  assert.ok(diagnosis.fires.some((item) => item.id === 'low-control'));
  assert.ok(diagnosis.health < 100);
});

test('groups snapshots by stable campaign key and sorts dates', () => {
  const records = [snapshot('1402.1.1'), snapshot('1400.1.1'), { ...snapshot('1401.1.1'), campaignKey: 'FRA:1337.1.1' }].map((item) => ({ hash: item.hash, snapshot: item }));
  const groups = groupCampaigns(records);
  assert.equal(groups.size, 2);
  assert.equal(groups.get('POL:1337.1.1')[0].snapshot.metadata.date, '1400.1.1');
});
