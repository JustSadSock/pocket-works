import test from 'node:test';
import assert from 'node:assert/strict';

test('board module parses and exports its view before the UI boots', async () => {
  const module = await import(`../board-view.js?test=${Date.now()}`);
  assert.equal(typeof module.BoardView, 'function');
});
