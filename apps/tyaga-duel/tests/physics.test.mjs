import assert from "node:assert/strict";
import { createGame, resizeGame, serve, claim, stepGame, STEP, WIN_SCORE, ARENAS, getBumpers } from "../physics.js";
for (const arena of ARENAS) {
  const game = createGame(arena.id, 700);
  assert.equal(game.score[0], 0);
  assert.equal(claim(game, 0), true);
  assert.equal(claim(game, 0), false);
  assert.equal(game.gravity < 0, true);
  for (let i = 0; i < 2000 && game.phase === "play"; i++) {
    stepGame(game, STEP);
    assert.ok(Number.isFinite(game.ball.x) && Number.isFinite(game.ball.y));
  }
  assert.notEqual(game.phase, "play", "Unopposed pull must end round");
  assert.equal(game.score[0], 1, "Top pull must score at top");
  assert.equal(game.score[1], 0);
  serve(game);
  resizeGame(game, 820);
  assert.ok(Math.abs(game.ball.y - 410) < .00001);
  assert.equal(claim(game, 1), true);
  for (let i = 0; i < 2000 && game.phase === "play"; i++) stepGame(game, STEP);
  assert.equal(game.score[1], 1, "Bottom pull must score at bottom");
  assert.equal(getBumpers(game).length > 0, arena.id !== "open");
}
const game = createGame("open");
for (let i = 0; i < WIN_SCORE; i++) {
  if (i) serve(game);
  claim(game, 1);
  for (let n = 0; n < 2000 && game.phase === "play"; n++) stepGame(game, STEP);
}
assert.equal(game.phase, "finished");
assert.equal(game.score[1], WIN_SCORE);
console.log("gravity duel: 3 arenas, scoring, resize, input and match end PASS");
