import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenario, evaluateScenario, rankScenarios } from '../scenario.js';

const snapshot = {
  economy: { treasury: 500, income: 20, expenses: 15, balance: 5, totalDebt: 100 },
  country: { manpower: 20000, averageControl: 60 },
  military: { soldiers: 12000 },
  locations: [
    { id: '1', name: 'A', control: 40 },
    { id: '2', name: 'B', control: 80 }
  ]
};

test('evaluates direct economic effects and payback', () => {
  const scenario = createScenario('custom', 'Workshop');
  scenario.assumptions = { ...scenario.assumptions, cost: 120, incomeDelta: 4 };
  const result = evaluateScenario(snapshot, scenario);
  assert.equal(result.after.treasury, 380);
  assert.equal(result.after.balance, 9);
  assert.equal(result.paybackMonths, 30);
  assert.equal(result.classification.direct.includes('текущего снимка'), true);
});

test('recomputes average control only for selected territory', () => {
  const scenario = createScenario('control');
  scenario.territoryId = '1';
  scenario.assumptions.controlDelta = 20;
  const result = evaluateScenario(snapshot, scenario);
  assert.equal(result.target.controlAfter, 60);
  assert.equal(result.after.control, 70);
});

test('ranks financially stronger scenarios first', () => {
  const positive = createScenario('custom', 'Income');
  positive.assumptions.incomeDelta = 5;
  const negative = createScenario('custom', 'Expense');
  negative.assumptions.expenseDelta = 5;
  const ranked = rankScenarios(snapshot, [negative, positive]);
  assert.equal(ranked[0].scenario.name, 'Income');
});
