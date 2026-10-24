import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
const entrypoints=['app.js','art.js','economy.js','feedback.js','debug-console.js','debug-state.js','art/artifacts.js','art/characters.js','sw.js'];

for(const file of entrypoints){
 test('JavaScript parses: '+file,()=>{
  const check=spawnSync(process.execPath,['--check',join(root,file)],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr||check.stdout);
 });
}

test('lobby retains player list, occupancy and controls in one expression',()=>{
 const source=readFileSync(join(root,'app.js'),'utf8');
 const lobby=source.slice(source.indexOf('function renderLobby(){'),source.indexOf('function scoreBox(){'));
 assert.ok(lobby.startsWith('function renderLobby(){'),'Lobby renderer must exist');
 for(const action of ['copy-code','copy-url','kick-player','start','leave']){
  assert.ok(lobby.includes('data-action="'+action+'"'),'Missing lobby action '+action);
 }
 assert.match(lobby,/\.join\(''\)\+'<\/div>'\+/,'Lobby player cards and following sections must concatenate');
 assert.ok(lobby.includes('data-action="select-avatar"'),'Lobby must provide actual avatar selection');
 assert.ok(lobby.includes('aria-pressed'),'Selected portrait must expose its state');
});


test('entry form provides a real cancellation path only while connecting',()=>{
 const source=readFileSync(join(root,'app.js'),'utf8');
 const home=source.slice(source.indexOf('function renderHome(){'),source.indexOf('function renderLobby(){'));
 assert.ok(home.startsWith('function renderHome(){'));
 const render=connecting=>{
  const context={
   connecting,mode:'',activeSheet:null,selectedArtifact:null,playStarted:false,
   document:{body:{classList:{remove(){}}}},
   app:{innerHTML:''},decorativeGuests:[],characterMarkup:()=>'',brandEmblem:()=>'',
   esc:String,name:'Тест',hintRoom:'',svgIcon:()=>'',
   applyCharacterArt(){}
  };
  return new Function(...Object.keys(context),home+'\nrenderHome();return app.innerHTML;')(...Object.values(context));
 };
 const idle=render(false),busy=render(true);
 assert.doesNotMatch(idle,/data-action="cancel-connect"/);
 assert.match(idle,/data-action="create"\s*>/);
 assert.match(idle,/data-action="join"\s*>/);
 assert.match(busy,/data-action="create" disabled/);
 assert.match(busy,/data-action="join" disabled/);
 assert.match(busy,/data-action="cancel-connect"/);
 assert.match(busy,/role="status"/);
});

test('cancellation closes old socket, clears resume token and restores entry state',()=>{
 const src=readFileSync(join(root,'app.js'),'utf8');
 const cancel=src.slice(src.indexOf('function cancelConnect(){'),src.indexOf('function wire(client){'));
 assert.ok(cancel.startsWith('function cancelConnect(){'));
 const simulate=new Function('ctx',[
  'let connecting=ctx.connecting,net=ctx.net,connected=true,me={},',
  "state={},roomId='ABCD',roomVersion='v17',onlinePlayerIds=new Set();",
  "const ORIGIN='/pocketnet',netStorage={removeItem:key=>ctx.removed.push(key)};",
  'function renderHome(){ctx.rendered++}',
  'function message(text){ctx.notice=text}',
  cancel,
  'cancelConnect();',
  'return {connecting,connected,net,state,roomId,roomVersion};'
 ].join('\n'));
 for(const connecting of [true,false]){
  const ctx={connecting,closed:0,rendered:0,removed:[],notice:null,net:null};
  ctx.net={close(){ctx.closed++}};
  const state=simulate(ctx);
  if(connecting){
   assert.equal(ctx.closed,1);
   assert.equal(ctx.rendered,1);
   assert.deepEqual(ctx.removed,['pocket-net:/pocketnet']);
   assert.equal(state.connecting,false);
   assert.equal(state.net,null);
   assert.equal(state.state,null);
   assert.equal(state.roomId,'');
   assert.match(ctx.notice,/отменено/i);
  }else{
   assert.equal(ctx.closed,0);
   assert.equal(ctx.rendered,0);
  }
 }
 assert.match(src,/catch\(e\)\{\s*if\(net!==client\)\{try\{client\?\.close\(\);\}catch\{\}return;\}/,
  'A rejected abandoned connect must not overwrite a newer connection');
});


test('late PocketNet responses are closed and cannot create ghost rooms',async()=>{
 const source=readFileSync(join(root,'app.js'),'utf8');
 const cancel=source.slice(source.indexOf('function cancelConnect(){'),source.indexOf('function wire(client){'));
 const connect=source.slice(source.indexOf('async function connect(kind,code='),source.indexOf('function request(payload){'));
 assert.ok(cancel.startsWith('function cancelConnect(){'));
 assert.ok(connect.startsWith('async function connect(kind,code='));
 const tracker={clients:[],messages:[],rendered:0};
 const build=new Function('tracker',[
  'let debugPreview=false,connecting=false,connected=false,net=null,me=null,state=null,',
  "roomId='',roomVersion=null,onlinePlayerIds=null,name='Тест';",
  "const ORIGIN='/pocketnet',GAME_ID='black-bazaar';",
  'const netStorage={removeItem(){}};',
  'function renderHome(){tracker.rendered++}',
  'function message(text){tracker.messages.push(text)}',
  'function wire(){}',
  'class PocketNet {',
  'constructor(){this.closed=false;this.closeCount=0;this.createCount=0;tracker.clients.push(this)}',
  'connect(){return new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject})}',
  'close(){this.closed=true;this.closeCount++}',
  'createRoom(){this.createCount++}',
  'joinRoom(){this.createCount++}',
  '}',
  cancel,connect,
  'return {connect,cancelConnect,snapshot:()=>({connecting,net,roomId})}'
 ].join('\n'));
 const env=build(tracker);
 const old=env.connect('create');
 assert.equal(tracker.clients.length,1);
 env.cancelConnect();
 assert.equal(tracker.clients[0].closeCount,1);
 const current=env.connect('create');
 assert.equal(tracker.clients.length,2);
 tracker.clients[0].resolve();
 await old;
 assert.equal(tracker.clients[0].createCount,0,'A canceled client must never create a room');
 assert.ok(tracker.clients[0].closeCount>=2,'Late socket must be closed again');
 assert.equal(env.snapshot().connecting,true,'New request still pending');
 tracker.clients[1].resolve();
 await current;
 assert.equal(tracker.clients[1].createCount,1,'Current request may create its room');
 env.cancelConnect();
 const rejected=env.connect('create');
 tracker.clients[2].reject(new Error('new session denied'));
 await rejected;
 assert.equal(env.snapshot().connecting,false,'A current failure re-enables the form');
 assert.ok(tracker.messages.at(-1).includes('new session denied'));
});


test('countdown distinguishes disconnected, server-paused and running sessions',()=>{
 const src=readFileSync(join(root,'app.js'),'utf8');
 const clock=src.slice(src.indexOf('function updateTurnClock(){'),src.indexOf('function eventBlock(){'));
 assert.ok(clock.startsWith('function updateTurnClock(){'));
 const run=new Function('config',[
  'const connected=config.connected,debugPreview=config.debugPreview,state=config.state;',
  'const node={textContent:"",setAttribute(k,v){this[k]=v}};',
  'const urgent={textContent:""};',
  "const document={querySelector:key=>key==='#turnClock'?node:key==='#urgentClock'?urgent:null};",
  clock,'updateTurnClock();return {text:node.textContent,aria:node["aria-label"],urgent:urgent.textContent}'
 ].join('\n'));
 const active={deadlineAt:Date.now()+80_000,offlinePaused:false};
 const disconnected=run({connected:false,debugPreview:false,state:active});
 assert.equal(disconnected.text,'Нет связи');
 assert.equal(disconnected.urgent,'Нет связи');
 const paused=run({connected:true,debugPreview:false,state:{...active,offlinePaused:true,deadlineAt:null}});
 assert.equal(paused.text,'Пауза');
 assert.equal(paused.aria,'Пауза');
 const idle=run({connected:true,debugPreview:false,state:{deadlineAt:null}});
 assert.equal(idle.text,'—');
 const running=run({connected:true,debugPreview:false,state:active});
 assert.match(running.text,/^\d+:\d{2}$/);
 assert.equal(running.urgent,running.text);
 const preview=run({connected:false,debugPreview:true,state:active});
 assert.match(preview.text,/^\d+:\d{2}$/);
});


test('authenticated transport is not usable until room_joined',()=>{
 const source=readFileSync(join(root,'app.js'),'utf8');
 const wire=source.slice(source.indexOf('function wire(client){'),source.indexOf('async function connect(kind,code='));
 assert.ok(wire.startsWith('function wire(client){'));
 const harness=new Function('events',[
  "let net=null,me=null,connected=false,state={phase:'play'},roomId='',roomVersion=null,onlinePlayerIds=null,connecting=true;",
  "const messages=[],netStorage={removeItem(){}};",
  "function message(text){messages.push(text)}",
  "function render(){}",
  "function renderHome(){}",
  "function closeRoom(){}",
  wire,
  "net={on:(name,cb)=>events[name]=cb,close(){}};",
  "wire(net);return {get:()=>({connected,roomId,connecting}),messages};"
 ].join('\n'));
 const handlers={},runtime=harness(handlers);
 handlers.connected({player:{id:'me'}});
 assert.equal(runtime.get().connected,false,'Authentication alone cannot authorize game actions');
 assert.match(runtime.messages.at(-1),/Восстанавливаем комнату/);
 handlers.room_joined({version:'v17',roomId:'TABLE1',state:{phase:'lobby',host:'me',players:[]}});
 assert.equal(runtime.get().connected,true);
 assert.equal(runtime.get().roomId,'TABLE1');
 assert.equal(runtime.get().connecting,false);
 handlers.disconnected();
 assert.equal(runtime.get().connected,false);
});

test('voluntary offline exit clears token without pretending to notify server',()=>{
 const src=readFileSync(join(root,'app.js'),'utf8');
 const close=src.slice(src.indexOf('function closeRoom(){'),src.indexOf('function cancelConnect(){'));
 assert.ok(close.startsWith('function closeRoom(){'));
 const run=new Function('wasConnected',[
  'let cueTimer=null,activeSheet=null,selectedArtifact=null,playStarted=false;',
  "const readDeals=new Set(),readTasks=new Set(),document={body:{classList:{remove(){}}}};",
  "let connected=wasConnected,connecting=true,me={},state={},roomId='TABLE',roomVersion='v17',onlinePlayerIds=null;",
  "const events=[],ORIGIN='/pocketnet',netStorage={removeItem:key=>events.push('clear:'+key)};",
  "let net={leaveRoom(){events.push('leave')},close(){events.push('close')}};",
  "function message(){events.push('message')}",
  "function renderHome(){events.push('home')}",
  close,'closeRoom();return {events,roomId,net,connected}'
 ].join('\n'));
 const offline=run(false);
 assert.equal(offline.events.includes('leave'),false);
 assert.deepEqual(offline.events.slice(0,2),['close','clear:pocket-net:/pocketnet']);
 assert.equal(offline.net,null);
 assert.equal(offline.roomId,'');
 const online=run(true);
 assert.deepEqual(online.events.slice(0,3),['leave','close','clear:pocket-net:/pocketnet']);
});

test('Cosmetic selection is reachable only in the waiting room',()=>{
 const source=readFileSync(join(root,'app.js'),'utf8');
 assert.match(source,/if\(action==='select-avatar'\)/);
 assert.match(source,/state\?\.phase!=='lobby'/);
 assert.match(source,/request\(\{type:'select_avatar',avatarId\}\)/);
 assert.match(source,/avatarOf\(p\)/);
 assert.match(source,/return-lobby/);
});
