import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {NetworkManager} from '../network.js';

const {default:mod}=await import('data:text/javascript;base64,'+Buffer.from(
  await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8')).toString('base64'));
const [a,b,c,d]=['a','b','c','d'].map(id=>({id,name:'Player '+id}));
const ids=[a,b,c,d];

function start(size=3){
  let state=mod.createRoom({player:a}).state;
  for(const player of ids.slice(1,size))state=mod.onJoin({state,player}).state;
  for(const player of ids.slice(0,size))
    state=mod.onMessage({state,player,payload:{type:'ready'}}).state;
  return state;
}
const send=(state,player,type,connectedIds,payload={})=>
  mod.onMessage({state,player,payload:{type,...payload},connectedIds}).state;

test('disconnected host is replaced by a real connected survivor without resetting the match',()=>{
  let s=start(3);
  s=send(s,a,'input',['a','b','c'],{input:{action:'hardDrop'}});
  const before=structuredClone(s.engine),round=s.round;
  s=send(s,b,'pulse',['b','c']);
  assert.equal(s.hostId,'b');
  assert.equal(s.round,round);
  assert.deepEqual(s.engine.board,before.board);
  assert.equal(s.engine.sharedStats.score,before.sharedStats.score);
  assert.equal(s.players.length,3);
  assert.equal(s.players.find(p=>p.id==='a').left,false);
  s=send(s,b,'pause',['b','c']);
  assert.equal(s.paused,true);
  assert.throws(()=>send(s,a,'pause',['b','c']),/ведущему/);
  s=send(s,b,'pause',['b','c']);
  assert.equal(s.paused,false);
  assert.equal(mod.onJoin({state:s,player:a}).state.players.length,3);
});

test('no client can become host merely by claiming to be connected',()=>{
  let s=start(2);
  s=send(s,b,'pulse',['a','b']);
  assert.equal(s.hostId,'a');
  s=send(s,b,'pulse',['a']);
  assert.equal(s.hostId,'a');
  assert.throws(()=>send(s,{id:'outsider'},'pause',['outsider']),/не в комнате/);
});

test('lost host after match finish: heartbeat restores rematch authority',()=>{
  let s=start(3),prior=s.round;
  s.engine.isGameOver=true;s.phase='finished';
  s=send(s,c,'pulse',['b','c']);
  assert.equal(s.hostId,'b');
  assert.throws(()=>send(s,c,'rematch',['b','c']),/ведущий/);
  s=send(s,b,'rematch',['b','c']);
  assert.equal(s.round,prior+1);
  assert.equal(s.engine.isGameOver,false);
  assert.equal(s.phase,'playing');
  assert.equal(s.engine.players.length,3);
  assert.equal(s.engine.players[0].gameOver,true,'offline player does not leave an active ghost');
  assert.equal(s.engine.players[0].currentPiece,null);
  assert.equal(s.engine.players[1].gameOver,false);
  assert.equal(s.engine.players[2].gameOver,false);
  assert.equal(s.players[0].id,'a','seat is retained for later reconnect');
  assert.equal(s.players[0].left,false);
});

test('explicit departure still eliminates only the leaver and transfers host safely',()=>{
  let s=start(4);
  const oldBoard=structuredClone(s.engine.board);
  s=mod.onLeave({state:s,player:a}).state;
  assert.equal(s.hostId,'b');
  assert.equal(s.engine.players[0].gameOver,true);
  assert.deepEqual(s.engine.board,oldBoard);
  assert.equal(s.engine.players[1].gameOver,false);
  assert.equal(s.engine.players[2].gameOver,false);
  assert.equal(s.engine.players[3].gameOver,false);
});

test('a reconnected host at the same socket ID retains its seat and role',()=>{
  let s=start(2);
  s=send(s,a,'pulse',['a','b']);
  assert.equal(s.hostId,'a');
  assert.equal(mod.onJoin({state:s,player:a}).state.round,s.round);
  assert.ok(s.engine.players[0].currentPiece);
  assert.equal(s.players[0].left,false);
});

test('client keeps polling finished rounds, dispatches a single round-start per round',()=>{
  const m=new NetworkManager(),events=[];
  m.connected=true;m.socket={id:'b'};m.code='CODE';
  const oldDocument=globalThis.document,oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;
  let tick;
  globalThis.document={hidden:false,querySelector:()=>null};
  globalThis.setInterval=fn=>(tick=fn,1);
  globalThis.clearInterval=()=>{};
  try{
    m.on('gameStart',data=>events.push(['gameStart',data.seed]));
    m.on('hostChanged',data=>events.push(['hostChanged',data.hostId]));
    m.on('snapshot',()=>events.push(['snapshot']));
    m.on('onlinePause',data=>events.push(['onlinePause',data.isHost]));
    m.send=payload=>{events.push(['send',payload.type]);return true;};
    const room={
      players:[{id:'a',name:'A'},{id:'b',name:'B'}],
      hostId:'a',started:true,round:1,seed:111,paused:false,
      engine:{isGameOver:false}
    };
    m.apply(room);
    m.apply({...room,engine:{isGameOver:true}});
    assert.equal(events.filter(e=>e[0]==='gameStart').length,1);
    assert.equal(m.finished,true);
    m.lastPulseAt=-20000;
    tick();
    assert.ok(events.some(e=>e[0]==='send'&&e[1]==='pulse'));
    m.apply({...room,hostId:'b',engine:{isGameOver:true}});
    assert.equal(m.hostId,'b');
    assert.ok(events.some(e=>e[0]==='hostChanged'&&e[1]==='b'));
    assert.ok(events.some(e=>e[0]==='onlinePause'&&e[1]===true));
    m.apply({...room,hostId:'b',round:2,seed:222,engine:{isGameOver:false}});
    assert.equal(events.filter(e=>e[0]==='gameStart').length,2);
    assert.equal(events.filter(e=>e[0]==='gameStart')[1][1],222);
    assert.equal(m.finished,false);
  }finally{
    m.stopClock();
    globalThis.document=oldDocument;globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;
  }
});

test('manual reconnect closes transport but preserves saved room and token',()=>{
  const m=new NetworkManager();const steps=[];
  m.connected=true;m.started=true;m.net={
    token:'persistent-auth-token',roomId:'persistent-room',
    socket:{readyState:1,close(){steps.push('close');}}
  };
  m.on('connectionHealth',({status})=>steps.push(status));
  m.reconnect();
  assert.deepEqual(steps,['recovering','close']);
  assert.equal(m.net.roomId,'persistent-room');
  assert.equal(m.net.token,'persistent-auth-token');
  assert.equal(m.stale,true);
});

test('version pin and hub relay use server-trusted connection IDs',async()=>{
  const [server,pin,hub,locks,net,game]=await Promise.all([
    fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8'),
    fs.readFile(new URL('../../../pocketnet/module-versions/blockies/v14.ts',import.meta.url),'utf8'),
    fs.readFile(new URL('../../../pocketnet/hub.mjs',import.meta.url),'utf8'),
    fs.readFile(new URL('../../../pocketnet/modules.lock.json',import.meta.url),'utf8'),
    fs.readFile(new URL('../network.js',import.meta.url),'utf8'),
    fs.readFile(new URL('../game.js',import.meta.url),'utf8')
  ]);
  assert.equal(pin,server);
  assert.equal(JSON.parse(locks).blockies.current,'v14');
  assert.match(hub,/this\.sockets\(room\.id\)\.map\(peer=>peer\.deserializeAttachment\(\)\?\.id\)/);
  assert.match(server,/connectedIds\.includes\(state\.hostId\)/);
  assert.match(net,/\(this\.finished\|\|this\.paused\)\?1600/);
  assert.match(net,/message\.roomId!==this\.roomId/);
  assert.match(game,/networkManager\.on\('hostChanged'/);
  assert.match(game,/refreshRematchPermission\(\)/);
  assert.match(game,/networkManager\.reconnect\(\)/);
});
