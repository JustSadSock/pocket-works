import assert from "node:assert/strict";
import { createGame, resizeGame, serve, claim, stepGame, STEP, WIN_SCORE, ARENAS, HOLD_RAMP, getBumpers, getBoosters } from "../physics.js";

for (const arena of ARENAS) {
  const game = createGame(arena.id, 700);
  assert.equal(game.score[0], 0);
  assert.equal(claim(game, 0), true);
  assert.equal(claim(game, 0), false, "One player cannot spam their own claim");
  assert.equal(game.gravity < 0, true);
  for (let i = 0; i < 2000 && game.phase === "play"; i++) {
    stepGame(game, STEP);
    assert.ok(Number.isFinite(game.ball.x) && Number.isFinite(game.ball.y));
    assert.ok(Number.isFinite(game.ball.vx) && Number.isFinite(game.ball.vy));
  }
  assert.notEqual(game.phase, "play", "Unopposed pull must end round: " + arena.id);
  assert.equal(game.score[0], 1, "Top pull scores at top: " + arena.id);
  serve(game);
  resizeGame(game, 820);
  assert.ok(Math.abs(game.ball.y - 410) < .00001);
  assert.equal(game.charge, 0, "New round clears hold pressure");
  assert.equal(claim(game, 1), true);
  for (let i = 0; i < 2000 && game.phase === "play"; i++) stepGame(game, STEP);
  assert.equal(game.score[1], 1, "Bottom pull scores at bottom: " + arena.id);
  assert.equal(getBumpers(game).length > 0, arena.id !== "open");
  assert.equal(getBoosters(game).length > 0, arena.id !== "open");
}

const g = createGame("open", 900);
claim(g, 0);
assert.equal(g.lastCounter, 115);
const startGravity = Math.abs(g.gravity);
for(let i=0;i<Math.ceil(HOLD_RAMP/STEP)+5;i++){
  // Keep the ball mid-field to isolate the accumulation mechanic from scoring.
  g.ball.x=180;g.ball.y=450;g.ball.vx=0;g.ball.vy=0;
  stepGame(g, STEP);
}
assert.equal(g.charge,1,"Pressure reaches full charge");
assert.ok(Math.abs(g.gravity)>startGravity*2,"Gravity must increase while possessed");
assert.equal(claim(g,1),true);
assert.equal(g.lastCounter,570,"Stealing fully charged gravity grants maximum counter-kick");
assert.equal(g.charge,0,"A steal starts a fresh pressure cycle");
assert.ok(g.ball.vy>500,"Counter-kick actually changes the velocity");
assert.equal(claim(g,1),false);
assert.equal(claim(g,0),true);
assert.equal(g.lastCounter,115,"Immediate steal has only the baseline kick");

function findEvent(game, target, limit=80) {
  for(let i=0;i<limit;i++){
    const event=stepGame(game,STEP);
    if(event?.kind===target)return event;
  }
  return null;
}
for(const arena of ["pins","swing"]) {
  const gateGame=createGame(arena,720);
  const gate=getBoosters(gateGame)[0];
  gateGame.ball.x=gate.x+gate.w*.42;gateGame.ball.y=gate.y-36;
  gateGame.ball.vx=0;gateGame.ball.vy=440;
  const e=findEvent(gateGame,"boost",45);
  assert.ok(e,"Accelerator must fire in "+arena);
  assert.ok(e.strength>0 && e.combo===1);
  assert.ok(gateGame.boostFlash[e.gate]>.5);
  assert.ok(Math.abs(gateGame.ball.vx)>90,"Gate must bend trajectory");
  assert.ok(gateGame.ball.vy>440,"Gate must add kinetic energy");
  let extras=0;
  for(let i=0;i<8;i++)if(stepGame(gateGame,STEP)?.kind==="boost")extras++;
  assert.equal(extras,0,"Staying in gate cannot retrigger it");
}

const chainGame=createGame("pins",720);
const reflector=getBumpers(chainGame)[0], lane=getBoosters(chainGame)[0];
chainGame.ball.x=reflector.x;chainGame.ball.y=reflector.y-reflector.r-12-2;
chainGame.ball.vx=0;chainGame.ball.vy=460;
const bounce=findEvent(chainGame,"impact",15);
assert.ok(bounce,"Reflector contact must be emitted");
assert.equal(chainGame.lastCollision,"reflect");
chainGame.ball.x=lane.x+lane.w*.4;chainGame.ball.y=lane.y-35;
chainGame.ball.vx=0;chainGame.ball.vy=440;
const combo=findEvent(chainGame,"boost",40);
assert.ok(combo && combo.combo>=2,"Reflector into gate must create a chain");
assert.equal(chainGame.lastCollision,"boost");

const match=createGame("open");
for(let i=0;i<WIN_SCORE;i++){
  if(i)serve(match);
  claim(match,1);
  for(let j=0;j<2000&&match.phase==="play";j++)stepGame(match,STEP);
}
assert.equal(match.phase,"finished");
assert.equal(match.score[1],WIN_SCORE);
console.log("TYAGA: scoring, hold/counter, kinetic gates, combos, win condition PASS");
