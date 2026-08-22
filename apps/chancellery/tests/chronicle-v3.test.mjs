import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChronicle, sparklinePoints } from '../chronicle.js';

const first = {
  hash: 'a', metadata: { date: '1350.01.01' },
  economy: { treasury: 100, balance: 2, totalDebt: 0 },
  country: { population: 1000, averageControl: 60 },
  locations: [{ id: '1' }]
};
const second = {
  hash: 'b', metadata: { date: '1351.01.01' },
  economy: { treasury: 80, balance: -2, totalDebt: 100 },
  country: { population: 900, averageControl: 50 },
  locations: [{ id: '1' }, { id: '2' }]
};

test('builds chronological events from snapshot changes', () => {
  const chronicle = buildChronicle([second, first]);
  assert.equal(chronicle.entries[0].hash, 'a');
  assert.equal(chronicle.entries[1].events.some((item) => item.title === 'Расширение'), true);
  assert.equal(chronicle.entries[1].events.some((item) => item.title === 'Бюджет ушёл в минус'), true);
  assert.deepEqual(chronicle.series.debt, [0, 100]);
});

test('builds sparkline points for known values', () => {
  assert.equal(sparklinePoints([1, 2, 3]).split(' ').length, 3);
  assert.equal(sparklinePoints([null, 2, null]), '');
});
