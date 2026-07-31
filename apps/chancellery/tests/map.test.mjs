import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCartogramLayout } from '../map.js';

test('builds stable grid cartogram without coordinates', () => {
  const locations = [
    { id: '2', owner: 'POL', market: 'B' },
    { id: '1', owner: 'POL', market: 'A' },
    { id: '3', owner: 'BOH', market: 'A' }
  ];
  const first = buildCartogramLayout(locations);
  const second = buildCartogramLayout(locations);
  assert.deepEqual(first.map(({ id, cx, cy }) => ({ id, cx, cy })), second.map(({ id, cx, cy }) => ({ id, cx, cy })));
  assert.equal(first.length, 3);
});

test('uses relative coordinates when most locations provide them', () => {
  const layout = buildCartogramLayout([
    { id: '1', x: 10, y: 20 },
    { id: '2', x: 20, y: 40 },
    { id: '3', x: 30, y: 60 },
    { id: '4', x: 40, y: 80 }
  ]);
  assert.equal(layout[0].cx, 0);
  assert.equal(layout[3].cy, 800);
});
