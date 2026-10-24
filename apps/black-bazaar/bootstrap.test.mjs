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
 assert.match(lobby,/\.join\(''\)\+'<\/div>'\+\s*'<p class="muted">/,'Lobby occupancy line must be concatenated');
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
 assert.match(idle,/data-action="create">/);
 assert.match(idle,/data-action="join">/);
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
 assert.match(src,/catch\(e\)\{\s*if\(net!==client\)return;/,
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
