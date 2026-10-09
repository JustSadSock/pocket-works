import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,LEVEL_COUNT,boardSize,createBoard,restoreTurns,maskOf,traceLight,neededTurns,rotateMask,verifyLevels} from '../logic.js';

test('500 levels, ten books, growing size and relic count',()=>{
 assert.equal(LEVEL_COUNT,500);assert.equal(LEVELS.length,500);
 assert.equal(LEVELS[0].size,4);assert.equal(LEVELS[30].size,5);
 assert.equal(LEVELS[140].size,6);assert.equal(LEVELS[400].size,7);
 assert.equal(LEVELS[0].exits.length,1);assert.equal(LEVELS[499].exits.length,4);
 assert.equal(new Set(LEVELS.map(level=>level.book)).size,10);
 for(const [i,level] of LEVELS.entries()){
   assert.equal(level.index,i);assert.equal(level.size,boardSize(i));
   assert.equal(level.solution.length,level.size*level.size);
   assert.ok(level.exits.every(col=>col>=0&&col<level.size));
 }
});
test('all authored routes form a connected, solved glass circuit',()=>{
 assert.equal(verifyLevels(),true);
});
test('2,000 shuffled boards are deterministic, initially incomplete and hint-solvable',()=>{
 const layouts=new Set();
 for(let index=0;index<LEVEL_COUNT;index++){
   const {solution}=LEVELS[index];
   for(let variant=0;variant<4;variant++){
     const board=createBoard(index,variant),same=createBoard(index,variant);
     const stamp=board.map(tile=>tile.baseMask+':'+tile.turns).join(',');
     assert.equal(stamp,same.map(tile=>tile.baseMask+':'+tile.turns).join(','));
     if(variant===0)layouts.add(stamp);
     assert.equal(board.length,solution.length);
     assert.equal(traceLight(board,index).complete,false);
     let guard=0;
     while(!traceLight(board,index).complete&&guard++<board.length+1){
       const hint=neededTurns(board,index);
       assert.ok(hint,'missing hint for level '+(index+1));
       assert.equal(rotateMask(maskOf(board[hint.index]),hint.clockwise),board[hint.index].solvedMask);
       board[hint.index].turns=(board[hint.index].turns+hint.clockwise)%4;
     }
     assert.equal(traceLight(board,index).complete,true,'unsolved level '+(index+1));
   }
 }
 assert.equal(layouts.size,500);
});
test('save restoration accepts exact pane rotations only',()=>{
 const board=createBoard(499),turns=board.map(tile=>tile.turns);
 const altered=createBoard(499);
 assert.equal(restoreTurns(altered,turns),true);
 assert.deepEqual(altered.map(tile=>tile.turns),turns);
 assert.equal(restoreTurns(altered,[0,1,2]),false);
 assert.equal(restoreTurns(altered,turns.map(()=>9)),false);
});
