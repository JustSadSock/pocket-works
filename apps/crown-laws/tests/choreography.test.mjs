import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, resolveTurn } from "../shared/game-engine.js";
import { LAW_CARDS } from "../shared/game-data.js";
import { planTurnFilm, soundForFrame, PHASE_ORDER } from "../client/choreography.js";
import { COURT_SOUNDS, playCourtSound } from "../client/soundscape.js";

test("resolution snapshots expose each authoritative phase without changing game output", () => {
  for (let n = 0; n < 12; n++) {
    const before=createInitialState({ seed: "film-snapshot-"+n });
    const original=structuredClone(before);
    const p1=before.players.p1.hand[n % before.players.p1.hand.length];
    const p2=before.players.p2.hand[(n+1) % before.players.p2.hand.length];
    const result=resolveTurn(before,{p1:{cardId:p1},p2:{cardId:p2}});
    assert.deepEqual(before,original,"Input state must be untouched");
    assert.deepEqual(result.frames.map(f=>f.phase),["start",...PHASE_ORDER,"settled"]);
    assert.deepEqual(result.frames[0].state,before);
    assert.deepEqual(result.frames.at(-1).state,result.state);
    const rawMoves=result.frames.flatMap(f=>f.moves);
    assert.deepEqual(rawMoves,result.tracker.movementTimeline);
    assert.deepEqual(result.frames.flatMap(f=>f.crowns),result.tracker.crownEvents);
    assert.deepEqual(result.frames.flatMap(f=>f.logs),result.logs);
    const film=planTurnFilm({before,after:result.state,frames:result.frames,logs:result.logs,conflicts:result.conflicts});
    assert.equal(film.length,9);
    assert.ok(film.every(frame=>frame.source==="engine"&&frame.duration>0));
    assert.ok(film.every((frame,i)=>frame.state.turn===result.frames[i].state.turn));
  }
});

test("a shared law conflict is captured before actors execute the new law",()=>{
 const start=createInitialState({seed:"two-conflicting-decrees"});
 // Select identical slot on each side; conflicting old/new laws revert to stone.
 let selected=null;
 for(const left of start.players.p1.hand){
  const card=LAW_CARDS.find(c=>c.id===left);
  const right=start.players.p2.hand.find(id=>LAW_CARDS.some(c=>c.id===id&&c.slot===card.slot));
  if(right){selected={p1:{cardId:left},p2:{cardId:right},slot:card.slot};break}
 }
 assert.ok(selected,"Need two comparable decree categories");
 const result=resolveTurn(start,{p1:selected.p1,p2:selected.p2});
 assert.ok(result.conflicts.includes(selected.slot));
 assert.equal(result.frames[1].phase,"laws");
 assert.equal(result.frames[1].state.slots[selected.slot].activeCardId,null);
 const film=planTurnFilm({before:start,after:result.state,frames:result.frames,conflicts:result.conflicts});
 assert.deepEqual(film[1].conflicts,result.conflicts);
 assert.equal(soundForFrame(film[1]),"conflict");
});

test("online playback NEVER synthesizes unknown intermediate actor positions",()=>{
 const before=createInitialState({seed:"online-phase-privacy"});
 const after=resolveTurn(before,{p1:{cardId:before.players.p1.hand[0]},p2:{cardId:before.players.p2.hand[0]}}).state;
 const film=planTurnFilm({before,after,logs:after.battleLog.slice(0,12)});
 assert.deepEqual(film.map(f=>f.phase),["start","outcome","settled"]);
 assert.ok(film.every(f=>f.source==="network"));
 assert.deepEqual(film[0].state,before);
 assert.deepEqual(film[1].state,after);
 assert.ok(film.every(f=>f.moves.length===0));
});

test("reduced motion has finite very short phases and preserves final state",()=>{
 const before=createInitialState({seed:"motion"});
 const r=resolveTurn(before,{p1:{cardId:before.players.p1.hand[0]},p2:{cardId:before.players.p2.hand[0]}});
 const film=planTurnFilm({before,after:r.state,frames:r.frames},{compact:true});
 assert.ok(film.every(f=>f.duration<=90));
 assert.deepEqual(film.at(-1).state,r.state);
});

test("sound palette can be previewed without AudioContext and includes all court actors",()=>{
 for(const name of ["tap","ready","move","champion","priest","guard","beast","thief","conflict","crown","shield","seal"]) {
  assert.ok(COURT_SOUNDS.includes(name),name);
 }
 assert.equal(playCourtSound(null,"crown"),false);
 assert.equal(playCourtSound(undefined,"beast"),false);
});

test("AI search can skip all cinematic snapshots without changing the game result",()=>{
  const before=createInitialState({seed:"ai-lightweight-film"});
  const a={p1:{cardId:before.players.p1.hand[0]},p2:{cardId:before.players.p2.hand[0]}};
  const normal=resolveTurn(before,a);
  const quick=resolveTurn(before,a,{captureFrames:false});
  assert.equal(quick.frames.length,0);
  assert.deepEqual(quick.state,normal.state);
  assert.deepEqual(quick.logs,normal.logs);
  assert.deepEqual(quick.conflicts,normal.conflicts);
  assert.deepEqual(quick.tracker.movementTimeline,normal.tracker.movementTimeline);
});
