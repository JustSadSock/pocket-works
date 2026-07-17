import assert from 'node:assert/strict';
import { createInitialState, applyAction, hasConnection, legalActions, indexOf, deserializeState, serializeState } from '../engine.js';

let state = createInitialState();
assert.equal(state.board.length, 64);
assert.equal(legalActions(state).length, 64);

let result = applyAction(state, { type: 'place', to: indexOf(3, 3) });
assert.equal(result.ok, true);
state = result.state;
assert.equal(state.turn, 2);
assert.equal(legalActions(state).some((a) => a.type === 'claim'), true);

result = applyAction(state, { type: 'claim' });
assert.equal(result.ok, true);
state = result.state;
assert.equal(state.board[indexOf(3, 3)], 2);
assert.equal(state.turn, 1);

state = createInitialState();
for (const [player, q, r] of [[1,0,3],[2,1,3],[1,7,0],[2,2,3]]) {
  state.board[indexOf(q,r)] = player;
}
state.turn = 1;
state.moveNo = 4;
state.history = [state.board.join('')];
result = applyAction(state, { type: 'place', to: indexOf(3,3) });
assert.equal(result.ok, true);
assert.deepEqual(result.captured.sort((a,b)=>a-b), [indexOf(1,3), indexOf(2,3)]);

state = createInitialState();
for (let r = 0; r < 8; r += 1) state.board[indexOf(2,r)] = 1;
assert.equal(hasConnection(state, 1), true);
assert.equal(hasConnection(state, 2), false);

state = createInitialState();
state.board[indexOf(0,0)] = 1;
state.turn = 1;
state.moveNo = 2;
state.shiftsLeft[1] = 1;
state.history = [state.board.join('')];
result = applyAction(state, { type: 'shift', from: indexOf(0,0), to: indexOf(1,0) });
assert.equal(result.ok, true);
assert.equal(result.state.shiftsLeft[1], 0);

const restored = deserializeState(serializeState(result.state));
assert.deepEqual(restored.board, result.state.board);
assert.equal(restored.moveNo, result.state.moveNo);
console.log('engine tests: ok');
