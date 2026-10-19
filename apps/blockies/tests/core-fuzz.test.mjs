import test from 'node:test';
import assert from 'node:assert/strict';
import {SHAPES,collision,rotateWithKick,chooseSpawn,clearCompletedRows,lineScore,sevenBag} from '../engine-core-v1.js';

function rng(seed){
 let x=seed>>>0;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};
}
test('deterministic 2000-case collision/rotation property check for 1–4 players',()=>{
 const rand=rng(0xB10C1E5),pieces=Object.values(SHAPES);
 for(let n=0;n<2000;n++){
  const seats=1+Math.floor(rand()*4),width=10+(seats-1)*4,height=20;
  const board=Array.from({length:height},()=>Array.from({length:width},()=>rand()<.08?1:0));
  const piece=pieces[Math.floor(rand()*pieces.length)];
  const pos={x:Math.floor(rand()*(width+6))-3,y:Math.floor(rand()*(height+8))-4};
  const other=[];
  for(let i=1;i<seats;i++)other.push({
   id:i,gameOver:false,currentPiece:pieces[Math.floor(rand()*pieces.length)],
   position:{x:Math.floor(rand()*width),y:Math.floor(rand()*height)}
  });
  const collided=collision(piece,pos,board,other,0,width,height);
  assert.equal(typeof collided.collides,'boolean');
  if(!collided.collides){
   for(let py=0;py<piece.length;py++)for(let px=0;px<piece[py].length;px++){
    if(!piece[py][px])continue;
    const x=pos.x+px,y=pos.y+py;
    assert.ok(x>=0&&x<width&&y<height,'no legal move exits the well');
    if(y>=0)assert.equal(board[y][x],0,'no legal move overlays a locked cell');
   }
  }
  const attempt=rotateWithKick(piece,pos,(p,where)=>collision(p,where,board,other,0,width,height));
  if(attempt)assert.equal(collision(attempt.piece,attempt.position,board,other,0,width,height).collides,false);
  const initial=chooseSpawn(piece,width/2,width,
   (p,where)=>collision(p,where,board,other,0,width,height));
  if(initial)assert.equal(collision(piece,initial,board,other,0,width,height).collides,false);
 }
});
test('deterministic 1000-case board compression and scoring keeps ownership and dimensions',()=>{
 const rand=rng(0xC011AB),width=18,height=20;
 for(let i=0;i<1000;i++){
  const board=Array.from({length:height},()=>Array.from({length:width},()=>rand()<.78?1+Math.floor(rand()*4):0));
  if(i%3===0)board[19]=Array.from({length:width},()=>1+Math.floor(rand()*4));
  const before=board.map(row=>[...row]);
  const count=before.filter(row=>row.every(Boolean)).length;
  const rows=clearCompletedRows(board,width);
  assert.equal(rows.length,count);
  assert.equal(board.length,height);
  assert.ok(board.every(row=>row.length===width));
  assert.ok(rows.every(row=>row.owners.length===width&&row.owners.every(x=>x>=1&&x<=4)));
  if(rows.length){
   const score=lineScore(rows.length,Math.floor(rand()*8));
   assert.ok(score.gained>=rows.length*100&&Number.isInteger(score.gained));
  }
 }
});
test('seven-bag seed determinism survives JSON serialization boundaries',()=>{
 const r1=rng(1848),r2=rng(1848),a={pieceBag:[]},b={pieceBag:[]};
 for(let i=0;i<200;i++){
  assert.deepEqual(sevenBag(a,r1),sevenBag(b,r2));
  const cloned=JSON.parse(JSON.stringify(a));
  assert.deepEqual(cloned,b);
 }
});
