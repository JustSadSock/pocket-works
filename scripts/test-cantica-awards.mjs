import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,createBoard,neededTurns,traceLight} from '../apps/cantica-glass/logic.js';
import {verifyCanticaProof,canticaEligible,MAX_CANTICA_STEPS} from '../pocket-social/cantica-proof.mjs';
import {canticaAchievements} from '../shared/capabilities/cantica-achievements.js';
function valid(level,variant=0){
 const board=createBoard(level,variant),turns=[];
 let guard=0;
 while(!traceLight(board,level).complete&&guard++<500){
  const target=neededTurns(board,level);assert.ok(target);
  for(let n=0;n<target.clockwise;n++){
   turns.push([target.index,1]);board[target.index].turns=(board[target.index].turns+1)%4;
   if(traceLight(board,level).complete)break;
  }
 }
 assert.equal(traceLight(board,level).complete,true);
 return {level,variant,turns};
}
test('authoritative replay validates every size and all altar variants',()=>{
 for(const level of [0,25,135,190,304,305,359,360,499]){
  const proof=valid(level);
  const result=verifyCanticaProof(proof);
  assert.ok(result,'level '+level);
  assert.equal(result.size,LEVELS[level].size);
  assert.equal(result.moves,proof.turns.length);
  assert.equal(result.exits,LEVELS[level].exits.length);
 }
});
test('forged, incomplete or trailing-turn receipts cannot earn profile cosmetics',()=>{
 const proof=valid(0);
 for(const corrupted of [{...proof,turns:[]},{...proof,turns:[[9999,1]]},
   {...proof,turns:[[0,42]]},{...proof,turns:'solved'},
   {...proof,variant:-1},{...proof,level:500},
   {...proof,turns:proof.turns.slice(0,-1)},
   {...proof,turns:[...proof.turns,[0,1]]},
   {...proof,turns:Array(MAX_CANTICA_STEPS+1).fill([0,1])}])
  assert.equal(verifyCanticaProof(corrupted),null);
});
test('reward catalogue maps unique achievements to unique profile items',()=>{
 assert.equal(canticaAchievements.length,9);
 assert.equal(new Set(canticaAchievements.map(a=>a.id)).size,9);
 assert.equal(new Set(canticaAchievements.map(a=>a.slot+':'+a.item)).size,9);
 const base=verifyCanticaProof(valid(0));
 assert.ok(canticaEligible(base,1).includes('cantica.first-light'));
 assert.ok(canticaEligible(base,25).includes('cantica.twenty-five'));
 assert.ok(canticaEligible(verifyCanticaProof(valid(360)),100).includes('cantica.four-altars'));
 assert.ok(canticaEligible(verifyCanticaProof(valid(305)),100).includes('cantica.seven'));
 assert.ok(canticaEligible(base,500).includes('cantica.complete'));
});
