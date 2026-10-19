import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8')).toString('base64'));
const a={id:'a',name:'A'},b={id:'b',name:'B'};
function start(players=[a]){let state=game.createRoom({player:players[0]}).state;for(const player of players.slice(1))state=game.onJoin({state,player}).state;for(const player of players)state=game.onMessage({state,player,payload:{type:'ready'}}).state;return state;}
test('serialized shared board clears a complete line and awards team score',()=>{let state=start();const width=state.engine.boardWidth;state.engine.board=Array.from({length:20},()=>Array(width).fill(0));state.engine.board[19]=Array.from({length:width},(_,i)=>i<4?0:1);const p=state.engine.players[0];p.currentPiece=[[1,1,1,1]];p.position={x:0,y:0};state=game.onMessage({state:JSON.parse(JSON.stringify(state)),player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.sharedStats.lines,1);assert.ok(state.engine.sharedStats.score>0);assert.ok(state.engine.board.every(row=>row.every(v=>v===0)));});
test('two players share locked cells; foreign input cannot mutate the well',()=>{let state=start([a,b]);state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.board.flat().filter(Boolean).length,4);assert.throws(()=>game.onMessage({state,player:{id:'intruder'},payload:{type:'input',input:{action:'hardDrop'}}}));assert.deepEqual(game.onJoin({state,player:b}).state.engine,state.engine);});
test('blocked spawn reaches game over rather than continuing to accept pieces',()=>{let state=start();state.engine.board=state.engine.board.map((row,y)=>row.map((_,x)=>y<4&&x<row.length-1?1:0));state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.isGameOver,true);});

test('leaving a running shared well preserves occupied slots and lets teammates continue',()=>{
 let state=start([a,b]);
 state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;
 const locked=JSON.stringify(state.engine.board);
 const width=state.engine.boardWidth;
 state=game.onLeave({state,player:a,players:[b]}).state;
 assert.equal(state.phase,'playing');
 assert.equal(state.players.length,2,'old ownership slots must not be reindexed');
 assert.equal(state.players[0].departed,true);
 assert.equal(state.engine.players[0].gameOver,true);
 assert.equal(state.engine.players[0].currentPiece,null);
 assert.equal(state.engine.boardWidth,width);
 assert.equal(JSON.stringify(state.engine.board),locked,'existing blocks remain in place');
 assert.throws(()=>game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}));
 state=game.onMessage({state,player:b,payload:{type:'input',input:{action:'hardDrop'}}}).state;
 assert.equal(state.engine.board.flat().filter(Boolean).length,8);
});

test('game over permits unanimous server-side rematch with a new empty board',()=>{
 let state=start([a,b]);
 state.engine.isGameOver=true;
 state=game.onMessage({state,player:a,payload:{type:'pulse'}}).state;
 assert.equal(state.phase,'results');
 assert.equal(state.started,false);
 const previousRound=state.round;
 state=game.onMessage({state,player:a,payload:{type:'rematch'}}).state;
 assert.equal(state.phase,'results');
 assert.equal(state.players[0].ready,true);
 state=game.onMessage({state,player:b,payload:{type:'rematch'}}).state;
 assert.equal(state.phase,'playing');
 assert.equal(state.started,true);
 assert.equal(state.round,previousRound+1);
 assert.equal(state.engine.isGameOver,false);
 assert.equal(state.engine.board.flat().filter(Boolean).length,0);
 assert.ok(state.engine.players.every(player=>!player.gameOver));
});

test('the surviving teammate can rematch alone after another player departed',()=>{
 let state=start([a,b]);
 state=game.onLeave({state,player:a,players:[b]}).state;
 const originalWidth=state.engine.boardWidth;
 assert.equal(state.players.length,2);
 state.engine.isGameOver=true;
 state=game.onMessage({state,player:b,payload:{type:'pulse'}}).state;
 assert.equal(state.phase,'results');
 state=game.onMessage({state,player:b,payload:{type:'rematch'}}).state;
 assert.equal(state.phase,'playing');
 assert.equal(state.players.length,1);
 assert.equal(state.players[0].id,b.id);
 assert.equal(state.engine.players.length,1);
 assert.ok(state.engine.boardWidth<originalWidth);
 assert.equal(state.engine.board.flat().filter(Boolean).length,0);
});

test('players can reclaim a departed seat during results but cannot enter active rounds',()=>{
 let state=start([a,b]);
 state=game.onLeave({state,player:a,players:[b]}).state;
 assert.throws(()=>game.onJoin({state,player:a}),/идёт/);
 state.engine.isGameOver=true;
 state=game.onMessage({state,player:b,payload:{type:'pulse'}}).state;
 state=game.onJoin({state,player:a}).state;
 assert.equal(state.players.length,2);
 assert.equal(state.players[0].departed,false);
 assert.equal(state.players[0].ready,false);
});

test('wall kicks resolve an I tetromino against the right wall without clipping the well',()=>{
 let state=start();const p=state.engine.players[0],width=state.engine.boardWidth;
 p.currentPiece=[[1],[1],[1],[1]];p.position={x:width-1,y:6};
 state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'rotate'}}}).state;
 const rotated=state.engine.players[0];
 assert.deepEqual(rotated.currentPiece,[[1,1,1,1]]);
 assert.equal(rotated.position.x,width-4);
 assert.equal(rotated.position.y,6);
 assert.equal(state.engine.board.flat().filter(Boolean).length,0);
});

test('a rotation fails if all legal wall kick locations are obstructed',()=>{
 let state=start();const p=state.engine.players[0],w=state.engine.boardWidth;
 p.currentPiece=[[1],[1],[1],[1]];p.position={x:w-1,y:6};
 for(let y=0;y<9;y++) for(let x=0;x<w-1;x++) state.engine.board[y][x]=1;
 const original=JSON.stringify({piece:p.currentPiece,position:p.position});
 state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'rotate'}}}).state;
 assert.equal(JSON.stringify({
  piece:state.engine.players[0].currentPiece,
  position:state.engine.players[0].position
 }),original);
});

test('rotation rejects other active tetrominoes in a shared well',()=>{
 let state=start([a,b]);const one=state.engine.players[0],two=state.engine.players[1];
 one.currentPiece=[[1],[1],[1],[1]];one.position={x:6,y:8};
 two.currentPiece=[[1,1,1,1]];two.position={x:4,y:8};
 // Every horizontal kick intersects the second player's active row, and vertical
 // escape paths are blocked by fixed blocks in the next two rows.
 for(let y=5;y<=7;y++) for(let x=3;x<14;x++)state.engine.board[y][x]=2;
 for(let x=8;x<14;x++) state.engine.board[8][x]=2;
 const before=JSON.stringify({shape:one.currentPiece,pos:one.position});
 state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'rotate'}}}).state;
 const after=state.engine.players[0];
 assert.equal(JSON.stringify({shape:after.currentPiece,pos:after.position}),before);
});
