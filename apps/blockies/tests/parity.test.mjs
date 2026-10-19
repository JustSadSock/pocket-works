import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SHAPES,sevenBag,collision,rotateWithKick,chooseSpawn,clearCompletedRows,lineScore} from '../engine-core-v1.js';

const client=await readFile(new URL('../game.js',import.meta.url),'utf8');
const server=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const coreName='engine-core-v1.js';
function segment(source,begin,end) {
 const start=source.indexOf(begin);
 assert.ok(start>=0,'missing '+begin);
 const finish=source.indexOf(end,start+begin.length);
 assert.ok(finish>start,'missing '+end);
 return source.slice(start,finish).trim();
}
test('browser and pinned server source share the same immutable core module',()=>{
 assert.match(client,/from '\.\/engine-core-v1\.js'/);
 assert.match(server,/from '\.\.\/\.\.\/\.\.\/apps\/blockies\/engine-core-v1\.js'/);
 assert.ok(client.includes('coreCollision(')&&server.includes('coreCollision('));
 for(const source of [client,server]) {
  assert.ok(source.includes('rotateWithKick('));
  assert.ok(source.includes('clearCompletedRows('));
  assert.ok(source.includes('lineScore('));
  assert.ok(source.includes('sevenBag('));
  assert.ok(source.includes('chooseSpawn('));
 }
});
for(const [name,start,end] of [
 ['collision','    checkCollision(','    move(dir,'],
 ['rotation','    rotate({ broadcast','    drop({ broadcast'],
 ['spawn','    placeSpawn()','    checkCollision('],
 ['seven bag','function nextBaggedPiece()','function formatKeyLabel(']
]){
 test('client/server wrapper parity: '+name,()=>{
  assert.equal(segment(client,start,end),segment(server,start,end));
 });
}
test('seven bag only emits valid independent tetromino copies',()=>{
 const state={pieceBag:[]},rand=()=>.325;
 const entries=[];
 for(let i=0;i<7;i++){
  const piece=sevenBag(state,rand);
  entries.push(JSON.stringify(piece));
 }
 assert.equal(new Set(entries).size,7);
 assert.equal(entries.length,Object.keys(SHAPES).length);
});
test('shared collision rejects walls, locked cells and other active shapes',()=>{
 const board=Array.from({length:20},()=>Array(10).fill(0));
 const piece=[[1,1]];
 const players=[{id:0,currentPiece:piece,position:{x:4,y:7},gameOver:false},
                {id:1,currentPiece:piece,position:{x:6,y:7},gameOver:false}];
 assert.equal(collision(piece,{x:9,y:0},board,players,0,10,20).withLocked,true);
 assert.equal(collision(piece,{x:5,y:7},board,players,0,10,20).withActive,true);
 board[7][4]=1;
 assert.equal(collision(piece,{x:4,y:7},board,players,0,10,20).withLocked,true);
});
test('shared row compaction keeps a fixed 20x10 board and player ownership',()=>{
 const board=Array.from({length:20},()=>Array(10).fill(0));
 board[19]=Array.from({length:10},(_,i)=>i%2+1);
 const rows=clearCompletedRows(board,10);
 assert.equal(rows.length,1);
 assert.equal(rows[0].y,19);
 assert.equal(rows[0].owners.length,10);
 assert.equal(board.length,20);
 assert.ok(board.every(row=>row.length===10));
 assert.equal(board[19].filter(Boolean).length,0);
});
test('shared rotation, spawn and scoring are deterministic pure functions',()=>{
 const rotated=rotateWithKick([[1],[1],[1],[1]],{x:9,y:5},
  (shape,pos)=>({collides:pos.x+shape[0].length>10}));
 assert.equal(rotated.position.x,6);
 assert.equal(rotated.piece[0].length,4);
 const spawn=chooseSpawn([[1,1]],5,10,()=>({collides:false}));
 assert.deepEqual(spawn,{x:4,y:0});
 assert.equal(lineScore(1,0).gained,100);
 assert.ok(lineScore(4,3).gained>400);
});
