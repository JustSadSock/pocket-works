import test from "node:test";
import assert from "node:assert/strict";
import {createInitialState,forecastTurn} from "../shared/game-engine.js";
import {LAW_CARDS} from "../shared/game-data.js";
import {VISION_PHASES,createCounselVision,selectedVisionResult,selectedVisionFrame,alternateVisionFrame,visionPaths,visionGhosts,visionDifference} from "../client/counsel-vision.js";

const phases=["start","laws","priest","champion","guard","beast","thief","throne","settled"];

test("all 25 decrees can be previewed in 9 truthful phases without touching a real match",()=>{
  const state=createInitialState({mode:"ai",seed:"advisory-all-decrees"});
  const untouched=structuredClone(state);
  for(const card of LAW_CARDS){
    const vision=createCounselVision(state,"p1",card.id,forecastTurn);
    assert.deepEqual(vision.current.frames.map(x=>x.phase),phases);
    assert.deepEqual(vision.proposed.frames.map(x=>x.phase),phases);
    assert.equal(vision.proposed.state.slots[card.slot].activeCardId,card.id);
    assert.deepEqual(vision.current.frames[0].state,untouched);
    assert.deepEqual(vision.proposed.frames[0].state,untouched);
    assert.deepEqual(vision.current.frames.at(-1).state,vision.current.state);
    assert.deepEqual(vision.proposed.frames.at(-1).state,vision.proposed.state);
    assert.deepEqual(vision.current.frames.flatMap(x=>x.moves),vision.current.tracker.movementTimeline);
    assert.deepEqual(vision.proposed.frames.flatMap(x=>x.moves),vision.proposed.tracker.movementTimeline);
    assert.deepEqual(vision.current.frames.flatMap(x=>x.logs),vision.current.logs);
    assert.deepEqual(vision.proposed.frames.flatMap(x=>x.logs),vision.proposed.logs);
    assert.equal(vision.assumedNoOpponentLaw,true);
    assert.equal(vision.current.assumedNoOpponentLaw,true);
    assert.equal(vision.proposed.assumedNoOpponentLaw,true);
    assert.deepEqual(state,untouched);
  }
});
test("switching scenarios changes ONLY which engine snapshot is displayed",()=>{
 const state=createInitialState({seed:"scenario-switch"});
 const selected=state.players.p1.hand[0];
 const vision=createCounselVision(state,"p1",selected,forecastTurn);
 vision.step=5;
 assert.equal(VISION_PHASES[vision.step][0],"beast");
 const chosen=selectedVisionResult(vision);
 assert.equal(selectedVisionFrame(vision),chosen.frames[5]);
 vision.side="current";
 assert.equal(selectedVisionResult(vision),vision.current);
 assert.equal(selectedVisionFrame(vision),vision.current.frames[5]);
 assert.equal(alternateVisionFrame(vision),vision.proposed.frames[5]);
 assert.deepEqual(state,vision.current.frames[0].state);
});
test("visualization routes exactly follow tracker movements, never invented movement",()=>{
 const state=createInitialState({seed:"routes"});
 const vision=createCounselVision(state,"p1",state.players.p1.hand[0],forecastTurn);
 for(const frame of vision.proposed.frames) {
   const routes=visionPaths(frame);
   assert.equal(routes.length,frame.moves.length);
   for(let i=0;i<routes.length;i++) {
     assert.deepEqual(routes[i].from,frame.moves[i].from);
     assert.deepEqual(routes[i].to,frame.moves[i].to);
     assert.equal(routes[i].id,frame.moves[i].pieceId);
   }
 }
});
test("ghost positions are exactly differences between the two hypothetical scenarios",()=>{
 const state=createInitialState({seed:"difference"});
 const vision=createCounselVision(state,"p1",state.players.p1.hand[0],forecastTurn);
 for(let i=0;i<9;i++){
   const ghost=visionGhosts(vision.proposed.frames[i],vision.current.frames[i]);
   for(const p of ghost){
     const a=vision.current.frames[i].state.pieces[p.id];
     const b=vision.proposed.frames[i].state.pieces[p.id];
     assert.ok(a.x!==b.x||a.y!==b.y);
     assert.deepEqual({x:p.x,y:p.y},{x:a.x,y:a.y});
   }
 }
 const differences=visionDifference(vision);
 for(const value of Object.values(differences))assert.ok(value>=0);
});
test("forecast without a selected decree remains fully functional",()=>{
 const state=createInitialState({seed:"no-card"});
 const vision=createCounselVision(state,"p1",null,forecastTurn);
 assert.equal(vision.side,"current");
 assert.equal(vision.proposed,null);
 assert.equal(visionGhosts(selectedVisionFrame(vision),alternateVisionFrame(vision)).length,0);
 assert.deepEqual(visionDifference(vision),{moved:0,crowns:0,shields:0,status:0,law:0});
});
