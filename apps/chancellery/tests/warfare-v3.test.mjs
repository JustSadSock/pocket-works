import test from 'node:test';
import assert from 'node:assert/strict';
import { assessWarPlan } from '../warfare.js';

const snapshot = {
  military: { soldiers: 20000 },
  country: { manpower: 30000 },
  economy: { treasury: 240, balance: 10 },
  locations: [
    { id: 'a', name: 'A', x: 0, y: 0, food: 5, unrest: 1 },
    { id: 'b', name: 'B', x: 3, y: 4, food: -2, unrest: 7 }
  ]
};

test('computes force ratio, runway and route distance', () => {
  const result = assessWarPlan(snapshot, {
    committedTroops: 12000,
    reserveTroops: 4000,
    enemyTroops: 10000,
    monthlyWarCost: 30,
    objectiveIds: ['a', 'b']
  });
  assert.equal(result.ratios.forceRatio, 1.2);
  assert.equal(result.ratios.runwayMonths, 12);
  assert.equal(result.ratios.routeDistance, 5);
  assert.equal(result.risks.some((item) => item.includes('пищевой баланс')), true);
});

test('flags plans that overcommit the army', () => {
  const result = assessWarPlan(snapshot, { committedTroops: 24000, reserveTroops: 0 });
  assert.equal(result.risks.some((item) => item.includes('больше солдат')), true);
  assert.equal(result.readiness < 70, true);
});
