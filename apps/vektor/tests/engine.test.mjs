import assert from "node:assert/strict";
import { applyMove, createInitialState, deserializeState, legalMoves, resolveSwap, serializeState } from "../engine.js";

const initial = createInitialState();
assert.equal(legalMoves(initial).length, 15, "Стартовая фигура должна видеть 15 клеток");
const first = applyMove(initial, 20);
assert.equal(first.ply, 1);
assert.equal(first.swapStatus, "pending");
assert.equal(first.turn, 1);
assert.equal(first.positions[0], 20);
const declined = resolveSwap(first, false);
assert.deepEqual(declined.ownerByColor, [0, 1]);
assert.equal(declined.swapStatus, "declined");
const swapped = resolveSwap(first, true);
assert.deepEqual(swapped.ownerByColor, [1, 0]);
assert.equal(swapped.turn, 1, "После обмена ход остаётся за оранжевым цветом");
assert.throws(() => applyMove(swapped, 2), /Недопустимый ход|партия/i);
const restored = deserializeState(serializeState(swapped));
assert.equal(restored.blocked, swapped.blocked);
assert.deepEqual(restored.positions, swapped.positions);
assert.deepEqual(restored.ownerByColor, swapped.ownerByColor);
let state = declined;
for (let i = 0; i < 20 && state.winnerColor === null; i += 1) {
  const moves = legalMoves(state);
  assert.ok(moves.length > 0);
  const before = state.blocked;
  state = applyMove(state, moves[0]);
  assert.notEqual(state.blocked, before, "Каждый ход обязан удалить новую клетку");
}
console.log("engine.test.mjs: ok");
