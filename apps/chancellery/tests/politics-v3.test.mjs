import test from 'node:test';
import assert from 'node:assert/strict';
import { simulatePolitics } from '../politics.js';

const estates = [
  { id: 'nobles', name: 'Nobles', power: 45, satisfaction: 40 },
  { id: 'burghers', name: 'Burghers', power: 25, satisfaction: 55 }
];

test('identifies political winners and losers', () => {
  const result = simulatePolitics(estates, {
    nobles: { powerDelta: -10, satisfactionDelta: -20 },
    burghers: { powerDelta: 8, satisfactionDelta: 10 }
  });
  assert.equal(result.winners[0].name, 'Burghers');
  assert.equal(result.losers[0].name, 'Nobles');
  assert.equal(result.risks.some((item) => item.includes('Nobles')), true);
});
