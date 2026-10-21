import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8')).toString('base64'));
const a={id:'a',name:'A'},b={id:'b',name:'B'};
function start(players=[a]){let state=game.createRoom({player:players[0]}).state;for(const player of players.slice(1))state=game.onJoin({state,player}).state;for(const player of players)state=game.onMessage({state,player,payload:{type:'ready'}}).state;return state;}
test('serialized shared board clears a complete line and awards team score',()=>{let state=start();const width=state.engine.boardWidth;state.engine.board=Array.from({length:20},()=>Array(width).fill(0));state.engine.board[19]=Array.from({length:width},(_,i)=>i<4?0:1);const p=state.engine.players[0];p.currentPiece=[[1,1,1,1]];p.position={x:0,y:0};state=game.onMessage({state:JSON.parse(JSON.stringify(state)),player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.sharedStats.lines,1);assert.ok(state.engine.sharedStats.score>0);assert.ok(state.engine.board.every(row=>row.every(v=>v===0)));});
test('two players share locked cells; foreign input cannot mutate the well',()=>{let state=start([a,b]);state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.board.flat().filter(Boolean).length,4);assert.throws(()=>game.onMessage({state,player:{id:'intruder'},payload:{type:'input',input:{action:'hardDrop'}}}));assert.deepEqual(game.onJoin({state,player:b}).state.engine,state.engine);});
test('blocked spawn reaches game over rather than continuing to accept pieces',()=>{let state=start();state.engine.board=state.engine.board.map((row,y)=>row.map((_,x)=>y<4&&x<row.length-1?1:0));state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.isGameOver,true);});



test('leaving during a match preserves board, score and surviving players',()=>{
 let state=start([a,b]);
 state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;
 const board=structuredClone(state.engine.board),score=state.engine.sharedStats.score;
 state=game.onLeave({state,player:a}).state;
 assert.equal(state.started,true);
 assert.equal(state.hostId,'b');
 assert.deepEqual(state.engine.board,board);
 assert.equal(state.engine.sharedStats.score,score);
 assert.equal(state.players[0].left,true);
 assert.equal(state.engine.players[0].gameOver,true);
 assert.equal(state.engine.players[0].currentPiece,null);
 assert.equal(state.players[1].left,false);
 assert.doesNotThrow(()=>game.onMessage({state,player:b,payload:{type:'input',input:{action:'move',direction:1}}}));
 assert.throws(()=>game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}),/Игрок не в комнате/);
});
test('pause is host-only, protects state and resumes without a time jump',()=>{
 let state=start([a,b]);
 assert.throws(()=>game.onMessage({state,player:b,payload:{type:'pause'}}),/ведущему/);
 state=game.onMessage({state,player:a,payload:{type:'pause'}}).state;
 assert.equal(state.paused,true);
 const engine=structuredClone(state.engine);
 state.lastTick=Date.now()-9000;
 state=game.onMessage({state,player:b,payload:{type:'pulse'}}).state;
 assert.deepEqual(state.engine,engine);
 assert.throws(()=>game.onMessage({state,player:b,payload:{type:'input',input:{action:'hardDrop'}}}),/приостановлена/);
 state=game.onMessage({state,player:a,payload:{type:'pause'}}).state;
 assert.equal(state.paused,false);
 assert.ok(Date.now()-state.lastTick<1000);
});
test('only host can rematch a finished round; new round removes departed players',()=>{
 let state=start([a,b]);
 state=game.onLeave({state,player:a}).state;
 state.engine.isGameOver=true;
 state.phase='finished';
 assert.throws(()=>game.onMessage({state,player:a,payload:{type:'rematch'}}),/не в комнате/);
 const oldRound=state.round;
 state=game.onMessage({state,player:b,payload:{type:'rematch'}}).state;
 assert.equal(state.round,oldRound+1);
 assert.equal(state.started,true);
 assert.equal(state.players.length,1);
 assert.equal(state.players[0].id,'b');
 assert.equal(state.engine.players.length,1);
 assert.equal(state.engine.isGameOver,false);
 assert.equal(state.phase,'playing');
});
test('reconnect preserves the room and cannot introduce a fifth player',()=>{
 let state=start([a,b]);
 const oldRound=state.round;
 state=game.onJoin({state,player:a}).state;
 assert.equal(state.round,oldRound);
 assert.equal(state.players.length,2);
 assert.throws(()=>game.onJoin({state,player:{id:'c',name:'C'}}),/уже началась/);
});


import {saveSolo,loadSolo,clearSolo,validateSoloSnapshot,SOLO_KEY} from '../solo-save.js';
function checkpoint(){
 return {version:1,updatedAt:Date.now(),randomSeed:0x12345678,rngState:0x97654321,
  board:Array.from({length:20},()=>Array(10).fill(0)),
  sharedStats:{score:450,lines:2,level:1,comboChain:0,lastClearDetail:null},
  player:{currentPiece:[[0,1,0],[1,1,1]],nextPiece:[[1,1],[1,1]],
   position:{x:4,y:5},dropCounter:320,dropInterval:910,spawnAnchor:5,color:'#00D9FF'}};
}
function memoryStorage(){
 const map=new Map();
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),
  removeItem:k=>map.delete(k)};
}
test('a checkpoint preserves exact board, piece positions, color and RNG sequence',()=>{
 const storage=memoryStorage(),input=checkpoint();
 input.board[18][3]=1;
 assert.equal(saveSolo(input,storage),true);
 const loaded=loadSolo(storage);
 assert.deepEqual(loaded.board,input.board);
 assert.deepEqual(loaded.player.currentPiece,input.player.currentPiece);
 assert.deepEqual(loaded.player.nextPiece,input.player.nextPiece);
 assert.deepEqual(loaded.player.position,input.player.position);
 assert.equal(loaded.player.color,'#00D9FF');
 assert.equal(loaded.rngState,input.rngState);
 input.board[18][3]=0;
 assert.equal(loaded.board[18][3],1,'saved data is copied independently');
 clearSolo(storage);
 assert.equal(loadSolo(storage),null);
});
test('corrupt, stale and incompatible checkpoints cannot overwrite the playfield',()=>{
 const storage=memoryStorage();
 const invalid=[{...checkpoint(),board:[[1]]},
   {...checkpoint(),updatedAt:Date.now()-31*24*3600*1000},
   {...checkpoint(),rngState:'bad'},
   {...checkpoint(),player:{...checkpoint().player,position:{x:9,y:19}}},
   {...checkpoint(),board:Array.from({length:20},()=>Array(10).fill(5))}];
 for(const item of invalid){
  assert.equal(validateSoloSnapshot(item),null);
  storage.setItem(SOLO_KEY,JSON.stringify(item));
  assert.equal(loadSolo(storage),null);
  assert.equal(storage.getItem(SOLO_KEY),null);
 }
 storage.setItem(SOLO_KEY,'{');
 assert.equal(loadSolo(storage),null);
});
test('checkpoint gracefully handles storage failures and discards arbitrary fields',()=>{
 const data=checkpoint(),storage={
  getItem(){throw Error('Access denied');},
  setItem(){throw Error('Quota exceeded');},
  removeItem(){throw Error('Access denied');}
 };
 assert.equal(saveSolo(data,storage),false);
 assert.equal(loadSolo(storage),null);
 const valid=validateSoloSnapshot({...data,unexpected:{secret:'ignored'}});
 assert.ok(valid);
 assert.equal(Object.hasOwn(valid,'unexpected'),false);
});


import {NetworkManager} from '../network.js';
test('network round snapshots initialize once and subsequent snapshots refresh the field',()=>{
 const originalDocument=globalThis.document;
 globalThis.document={querySelector:()=>null};
 const net=new NetworkManager();
 net.connected=true;
 net.socket.id='a';
 net.code='TESTCODE';
 let starts=0,snapshots=0,health=0;
 net.on('gameStart',()=>starts++);
 net.on('snapshot',()=>snapshots++);
 net.on('connectionHealth',({status})=>{if(status==='online')health++;});
 const state={started:true,round:1,seed:123,hostId:'a',players:[{id:'a',color:'#FF1493'}],
  paused:false,engine:{isGameOver:false,board:[],players:[]}};
 try {
  net.apply(state,true);
  net.apply(state);
  assert.equal(starts,1);
  assert.equal(snapshots,2);
  assert.ok(net.timer);
  net.stale=true;
  net.apply(state);
  assert.equal(health,1);
  assert.equal(net.stale,false);
  net.apply({...state,round:2});
  assert.equal(starts,2);
  net.apply({...state,round:2,engine:{isGameOver:true}});
  assert.equal(net.timer,null,'game-over should not waste PocketNet pulses');
 }finally{
  net.stopClock();
  globalThis.document=originalDocument;
 }
});
test('network distinguishes disconnection and blocks stale player inputs',()=>{
 const net=new NetworkManager();
 const outgoing=[];
 net.started=true;
 net.connected=true;
 net.net={sendGame:payload=>outgoing.push(payload)};
 net.sendPlayerInput({action:'rotate'});
 net.stale=true;
 net.sendPlayerInput({action:'hardDrop'});
 net.connected=false;
 net.stale=false;
 net.sendPlayerInput({action:'move',direction:1});
 assert.equal(outgoing.length,1);
 assert.deepEqual(outgoing[0],{type:'input',input:{action:'rotate'}});
});


test('full interface keeps all core navigation targets unique and actionable',async()=>{
 const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'duplicate element ids would break game listeners');
 const required=['main-menu','coop-setup-screen','online-lobby-screen','game-screen','settings-screen',
  'pause-menu','gameover-menu','mode-single','mode-local','mode-online','resume-solo',
  'nickname-input','join-code','join-code-btn','copy-room-code','create-room-btn','ready-btn',
  'game-container','team-score','team-lines','next-pieces-preview','player-info-sidebar',
  'touch-controls','pause-btn','quit-btn','settings-btn','language-selector',
  'resume-btn','restart-btn','play-again-btn','menu-btn','online-network-status'];
 for(const id of required)assert.ok(ids.includes(id),'missing functional target: '+id);
 const actions=[...html.matchAll(/\bdata-action="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(actions.sort(),['down','drop','left','right','rotate'].sort());
 assert.match(html,/viewport-fit=cover/);
});
test('new control deck fits both phone orientations and expands wide shared wells',async()=>{
 const css=await fs.readFile(new URL('../styles.css',import.meta.url),'utf8');
 const script=await fs.readFile(new URL('../game.js',import.meta.url),'utf8');
 assert.match(css,/orientation:portrait/);
 assert.match(css,/orientation:landscape/);
 assert.match(css,/\.wide-well/);
 assert.match(css,/\.touch-deck/);
 assert.match(css,/touch-action:none/);
 assert.match(script,/installBoardGestures\(canvas\)/);
 assert.match(script,/rect\.width-padX-frameX/);
 assert.match(script,/classList\.toggle\('wide-well',numPlayers>1\)/);
 assert.match(script,/player\.rotate\(\);/);
});
test('PWA release matches interface, new icon and built-in Pocket Works shell',async()=>{
 const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
 const config=JSON.parse(await fs.readFile(new URL('../app.config.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(await fs.readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
 const sw=await fs.readFile(new URL('../sw.js',import.meta.url),'utf8');
 const icon=await fs.readFile(new URL('../icons/icon.svg',import.meta.url),'utf8');
 assert.equal(config.version,'0.4.0');
 assert.match(html,/data-app-version="0\.4\.0"/);
 assert.match(sw,/blockies-v0\.4\.0/);
 assert.equal(config.orientation,'any');
 assert.equal(manifest.orientation,'any');
 assert.equal(manifest.theme_color,'#f4f1e9');
 assert.match(html,/data-app-shell/);
 assert.match(html,/class="pocket-exit"/);
 assert.match(icon,/viewBox="0 0 512 512"/);
});


import {assessBlockiesAwards} from '../../../pocketnet/blockies-awards.mjs';
import {blockiesAchievements} from '../../../shared/capabilities/blockies-achievements.js';
const match='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function verifiedRound(metrics,lines=0,round=1){
 const players=metrics.map((p,i)=>({id:String.fromCharCode(97+i),left:!!p.left}));
 return {started:true,round,players,engine:{board:[],isGameOver:false,
   sharedStats:{score:lines*100,lines},
   players:metrics.map(p=>({piecesLocked:p.pieces??0,hardDrops:p.drops??0,
     linesClearedByMe:p.lines??0}))}};
}
const byId=awards=>new Set(awards.map(a=>a.achievementId));
test('server counts confirmed pieces and hard drops, not button presses alone',()=>{
 let state=start();
 assert.equal(state.engine.players[0].piecesLocked,0);
 state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'rotate'}}}).state;
 assert.equal(state.engine.players[0].piecesLocked,0);
 state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;
 assert.equal(state.engine.players[0].piecesLocked,1);
 assert.equal(state.engine.players[0].hardDrops,1);
 assert.equal(state.engine.players[0].linesClearedByMe,0);
});
test('verified Blockies catalog has eight unique ID/slot/item pairs',()=>{
 assert.equal(blockiesAchievements.length,8);
 assert.equal(new Set(blockiesAchievements.map(a=>a.id)).size,8);
 for(const item of blockiesAchievements){
   assert.equal(item.id.startsWith('blockies.'),true);
   assert.ok(['title','face','hat','clothes','background','portraitFrame'].includes(item.slot));
 }
});
test('server awards first lock, player-scored line, ten hard drops and double line',()=>{
 const prev=verifiedRound([{pieces:9,drops:9,lines:0}],0);
 const next=verifiedRound([{pieces:10,drops:10,lines:2}],2);
 assert.deepEqual(byId(assessBlockiesAwards(prev,next,match)),
   new Set(['blockies.first-lock','blockies.first-line','blockies.ten-locks','blockies.double']));
 const again=assessBlockiesAwards(next,next,match);
 assert.equal(byId(again).has('blockies.double'),false,'double lines requires one confirmed transition');
});
test('team achievements require real shared contributions, quorum and no leavers',()=>{
 const both=verifiedRound([{pieces:10,drops:10,lines:12},{pieces:10,drops:10,lines:8}],40);
 const earned=assessBlockiesAwards(null,both,match);
 for(const name of ['blockies.duo','blockies.steadfast','blockies.master'])
   assert.equal(earned.filter(a=>a.achievementId===name).length,2,name);
 const lone=verifiedRound([{pieces:40,drops:40,lines:40}],40);
 assert.equal(byId(assessBlockiesAwards(null,lone,match)).has('blockies.master'),false);
 const leaver=verifiedRound([{pieces:10,drops:10,lines:12},{pieces:10,drops:10,lines:8,left:true}],40);
 const gone=byId(assessBlockiesAwards(null,leaver,match));
 assert.equal(gone.has('blockies.duo'),false);
 assert.equal(gone.has('blockies.master'),false);
 const quartet=verifiedRound(Array.from({length:4},()=>({pieces:3,drops:2,lines:2})),6);
 assert.equal(assessBlockiesAwards(null,quartet,match).filter(a=>a.achievementId==='blockies.quartet').length,4);
 const missing=verifiedRound([{pieces:3},{pieces:3},{pieces:3},{pieces:1}],6);
 assert.equal(byId(assessBlockiesAwards(null,missing,match)).has('blockies.quartet'),false);
});
test('v2 and tampered missing metrics never receive server-v3 awards',()=>{
 const before=verifiedRound([{pieces:5}],1);
 const after=structuredClone(before);
 delete after.engine.players[0].piecesLocked;
 assert.deepEqual(assessBlockiesAwards(before,after,match),[]);
 assert.deepEqual(assessBlockiesAwards(null,{...before,started:false},match),[]);
});
