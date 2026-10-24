import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnLaneX,SPAWN_BAY_WIDTH,SPAWN_BAY_HEIGHT} from '../spawn-bays.js';
const {default:server}=await import('data:text/javascript;base64,'+
  Buffer.from(await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8')).toString('base64'));
const players=Array.from({length:4},(_,i)=>({
  id:'player-'+i,name:'Ник '+(i+1),color:['#FF1493','#00D9FF','#FFDB58','#39FF14'][i]
}));
function start(count){
  let state=server.createRoom({player:players[0]}).state;
  for(let i=1;i<count;i++)state=server.onJoin({state,player:players[i]}).state;
  for(let i=0;i<count;i++)state=server.onMessage({state,player:players[i],payload:{type:'ready'}}).state;
  return state;
}
for(const count of [2,3,4]){
  test(count+' player bays are 4 cells wide, non-overlapping, with 2 rows of clearance',()=>{
    const width=10+4*(count-1);
    const lanes=Array.from({length:count},(_,i)=>spawnLaneX(i,count,width));
    assert.equal(SPAWN_BAY_WIDTH,4);assert.equal(SPAWN_BAY_HEIGHT,2);
    for(let i=0;i<count;i++){
      assert.ok(lanes[i]>=0&&lanes[i]+4<=width);
      if(i)assert.ok(lanes[i]>=lanes[i-1]+5);
    }
    const state=start(count);
    assert.equal(state.engine.boardWidth,width);
    state.engine.players.forEach((p,i)=>{
      assert.equal(p.spawnLaneX,lanes[i]);
      assert.equal(p.name,players[i].name);
      assert.equal(p.position.x,lanes[i]+Math.floor((4-p.currentPiece[0].length)/2));
      assert.equal(p.position.y,0);
      assert.ok(p.currentPiece.length<=2);
    });
  });
}
test('blocked personal entrance eliminates exactly its owner, with no fallback spawn',()=>{
  let state=start(2);
  const first=state.engine.players[0], second=state.engine.players[1];
  const entrance=first.spawnLaneX;
  for(let x=entrance;x<entrance+4;x++){state.engine.board[0][x]=2;state.engine.board[1][x]=2;}
  state=server.onMessage({state,player:players[0],payload:{type:'input',input:{action:'hardDrop'}}}).state;
  assert.equal(state.engine.players[0].gameOver,true);
  assert.equal(state.engine.players[0].currentPiece,null);
  assert.equal(state.engine.players[0].spawnLaneX,entrance);
  assert.equal(state.engine.players[1].gameOver,false);
  assert.equal(state.engine.isGameOver,false);
  assert.doesNotThrow(()=>server.onMessage({state,player:players[1],payload:{type:'input',input:{action:'move',direction:1}}}));
});
test('one-seat online room remains in lobby; solo keeps a central 10-column spawn',async()=>{
  const state=start(1);
  assert.equal(state.started,false,'online requires at least two connected players');
  assert.equal(state.engine,null,'a one-seat online lobby must not start a match');
  assert.equal(state.players.length,1);
  assert.equal(spawnLaneX(0,1,10),3,'solo entrance remains centred on a 10-column board');
  const js=await fs.readFile(new URL('../game.js',import.meta.url),'utf8');
  assert.match(js,/this\.startGame\(1\)/,'single-player mode uses the local engine');
});
test('UI has aligned physical bays, nicknames and the Backquote screen inspector',async()=>{
  const js=await fs.readFile(new URL('../game.js',import.meta.url),'utf8');
  const css=await fs.readFile(new URL('../styles.css',import.meta.url),'utf8');
  const sw=await fs.readFile(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(js,/bay\.style\.left=\(100\*player\.spawnLaneX\/gameState\.boardWidth\)/);
  assert.match(js,/bay\.style\.width=\(400\/gameState\.boardWidth\)/);
  assert.match(js,/id=\`bay-next-\$/);
  assert.match(js,/e\.code==='Backquote'/);
  assert.match(js,/debugOpenScreen\(id\)/);
  assert.match(css,/\.spawn-bay__mouth/);
  assert.match(css,/\.spawn-bay\.is-out/);
  assert.match(sw,/spawn-bays\.js/);
});
