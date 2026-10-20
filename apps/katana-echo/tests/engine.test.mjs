import test from 'node:test';
import assert from 'node:assert/strict';
import sim from '../server/game/sim.cjs';
import module from '../server/entry.js';
const {GameRoom}=sim;
test('a lethal hit changes the actual fighter and resets exactly after 600 ms',()=>{
 const room=new GameRoom('kill-test','echo-trap',()=>{});room.map.walls=[];const a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');a.state.x=0;b.state.x=1;a.state.attacking=true;a.state.attackPower=1000;room.resolveCombat();assert.equal(b.alive,false);assert.ok(room.roundResetAt);room.step(599);assert.equal(b.alive,false);room.step(1);assert.equal(b.alive,true);assert.equal(a.state.x,-4);assert.equal(b.state.x,4);
});
test('fresh shield parries, an older shield absorbs and breaks',()=>{
 const room=new GameRoom('parry-test','echo-trap',()=>{});const a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');room.map.walls=[];a.state.x=0;b.state.x=1;b.state.facing=Math.PI;a.state.attacking=true;b.state.shieldUp=true;b.state.parryWindow=100;room.tryHit(a,b);assert.equal(a.state.stagger,460);assert.equal(b.alive,true);b.state.shieldUp=true;b.state.parryWindow=0;b.state.shieldStrength=1;a.state.attacking=true;room.tryHit(a,b);assert.equal(b.state.shieldUp,false);assert.equal(b.state.shieldCooldown,1400);assert.equal(b.alive,true);
});
for(const mode of ['echo-trap','shadow-tail','channel-echo'])test(mode+' survives serialized input history and stays under PocketNet limit',()=>{
 const actual=Date.now;let now=1e6;Date.now=()=>now;
 try{let state=module.createRoom({player:{id:'a',name:'A'},payload:{mode}}).state;state=module.onJoin({state,player:{id:'b',name:'B'}}).state;
 for(let i=0;i<330;i++){now+=1000/60;state=module.onMessage({state:JSON.parse(JSON.stringify(state)),player:{id:'a'},payload:{type:'input',payload:{keys:{},mouseAngle:0,ghostToggle:i===270}}}).state;state=module.onMessage({state:JSON.parse(JSON.stringify(state)),player:{id:'b'},payload:{type:'input',payload:{keys:{}}}}).state;assert.ok(Buffer.byteLength(JSON.stringify(state))<256*1024);}
 const view=module.viewForPlayer({state,player:{id:'a'}});assert.equal(view.mode,mode);assert.equal(view.players.length,2);assert.ok(view.players.every(p=>Number.isFinite(p.state.x)));assert.equal('buffer' in view.players[0].ghost,false);
 if(mode==='echo-trap')assert.ok(view.players[0].ghost.cooldown>0);else if(mode==='shadow-tail')assert.equal(view.players[0].ghostActor.alive,true);else assert.ok(view.players[0].ghost.energy<1);
 }finally{Date.now=actual;}
});

test('blade cannot hit behind the attacker, across walls, or damage its own echo',()=>{
 const room=new GameRoom('blade-angle','echo-trap',()=>{}),a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');
 room.map.walls=[];a.state.x=0;a.state.y=0;b.state.x=-1;b.state.y=0;
 a.state.facing=0;a.state.attacking=true;a.state.attackPower=1100;
 room.tryHit(a,b);assert.equal(b.alive,true,'behind attacker');
 b.state.x=1;room.map.walls=[{x:.5,y:0,w:.22,h:1.5}];room.tryHit(a,b);
 assert.equal(b.alive,true,'wall shields target');
 room.map.walls=[];a.ghostActor.alive=true;a.ghostActor.state.x=1;
 room.resolvePair(a,a.ghostActor);assert.equal(a.ghostActor.alive,true,'no friendly fire');
});
test('dash is faster than walking and collision prevents walking into obstacles',()=>{
 const room=new GameRoom('collision','echo-trap',()=>{});
 room.map.walls=[{x:0,y:0,w:1.8,h:3}];
 const s=room.addPlayer(null,'A').state;s.x=-3;s.y=0;s.facing=0;
 room.applyInputToActor(s,{keys:{d:true},mouseAngle:0,dash:true},16.67);
 assert.ok(s.vx>7,'dash velocity is not clamped to walking');
 for(let i=0;i<140;i++)room.applyInputToActor(s,{keys:{d:true},mouseAngle:0},16.67);
 assert.ok(s.x<=-1.36, 'fighter must stop at wall');
});
test('training engine mirrors PocketNet rules without a network connection',async()=>{
 const {default:training}=await import('../training-engine.js');
 let state=training.createRoom({player:{id:'local',name:'Local'},payload:{mode:'channel-echo'}}).state;
 state=training.onJoin({state,player:{id:'bot',name:'Bot'}}).state;
 state=training.onMessage({state,player:{id:'local'},payload:{type:'input',payload:{seq:1,keys:{d:true},mouseAngle:0}}}).state;
 const view=training.viewForPlayer({state,player:{id:'local'}});
 assert.equal(view.players.length,2);assert.equal(view.phase,'playing');
 assert.ok(view.players.every(p=>typeof p.score==='number'),'score in view');
});

test('ultra-short taps survive network packets with zero time between press and release',()=>{
 const actual=Date.now;let now=1_000_000;Date.now=()=>now;
 try{
  let state=module.createRoom({player:{id:'a',name:'A'},payload:{mode:'echo-trap'}}).state;
  state=module.onJoin({state,player:{id:'b',name:'B'}}).state;
  // Test all buttons without relying on a long-held browser pointer.
  const send=(seq,payload)=>{state=module.onMessage({state,player:{id:'a'},payload:{type:'input',payload:{seq,keys:{},mouseAngle:0,...payload}}}).state;};
  send(1,{lmb:true});send(2,{lmb:false});
  assert.ok(state.players.find(p=>p.id==='a').state.charge>=95,'tap is captured on pointerdown');
  now+=1000/60;send(3,{});
  assert.equal(module.viewForPlayer({state}).players.find(p=>p.id==='a').state.attacking,true,'released tap produces an attack');
  now+=250;send(4,{}); // previous sword swing has finished
  send(5,{rmb:true});send(6,{rmb:false});
  now+=1000/60;send(7,{});
  const guard=module.viewForPlayer({state}).players.find(p=>p.id==='a').state;
  assert.equal(guard.shieldUp,true,'quick shield remains raised to offer a parry window');
  assert.ok(guard.parryWindow>0,'parry window survives sub-frame input');
  now+=210;send(8,{});
  assert.equal(module.viewForPlayer({state}).players.find(p=>p.id==='a').state.shieldUp,false,'tap guard expires');
  send(9,{dash:true});send(10,{dash:false});
  now+=1000/60;send(11,{});
  const dash=module.viewForPlayer({state}).players.find(p=>p.id==='a').state;
  assert.ok(dash.dashCooldown>0,'one-shot dash was not dropped');
  const before=JSON.stringify(module.viewForPlayer({state}).players.find(p=>p.id==='a').state);
  send(10,{lmb:true}); // stale sequence must never resurrect an action
  const after=JSON.stringify(module.viewForPlayer({state}).players.find(p=>p.id==='a').state);
  assert.equal(before,after,'stale input ignored');
 }finally{Date.now=actual;}
});
test('new round clears held input and faces both duelists towards each other',()=>{
 const room=new GameRoom('neutral-reset','echo-trap',()=>{});
 room.map.walls=[];
 const a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');
 assert.ok(Math.abs(b.state.facing-Math.PI)<0.01);
 room.handleInput(a.id,{keys:{d:true},lmb:true,dash:true,rmb:true});
 room.handleInput(b.id,{keys:{w:true},lmb:true,ghostToggle:true});
 a.state.x=0;a.state.y=0;b.state.x=1;b.state.y=0;
 a.state.attacking=true;a.state.attackPower=400;a.state.facing=0;
 room.tryHit(a,b);assert.equal(b.alive,false);
 room.step(600);
 assert.equal(a.inputState.lmb,false);
 assert.equal(b.inputState.lmb,false);
 assert.equal(a.inputState.dash,false);
 assert.deepEqual(a.inputState.keys,{});
 assert.equal(a.state.facing,0);
 assert.equal(b.state.facing,Math.PI);
 assert.equal(a.pendingDash,false);
 assert.equal(a.triggers.spawnGhost,false);
});
test('version 3 rules remain immutable and shared exactly with offline practice',async()=>{
 const {readFileSync}=await import('node:fs');
 const {fileURLToPath}=await import('node:url');
 const {dirname,resolve}=await import('node:path');
 const dir=dirname(fileURLToPath(import.meta.url));
 const read=path=>readFileSync(resolve(dir,'..',path),'utf8');
 const bundled=read('server/module.ts');
 assert.equal(read('training-engine.js'),bundled);
 assert.equal(read('../../pocketnet/module-versions/katana-echo/v3.ts'),bundled);
 const lock=JSON.parse(read('../../pocketnet/modules.lock.json'));
 assert.equal(lock['katana-echo'].current,'v3');
 assert.deepEqual(lock['katana-echo'].versions,['v1','v2','v3']);
});
test('event identifiers advance monotonically and survive serialization',()=>{
 const room=new GameRoom('events','echo-trap',()=>{});
 room.map.walls=[];
 const a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');
 a.state.x=0;a.state.y=0;b.state.x=1;b.state.y=0;a.state.facing=0;
 a.state.attacking=true;a.state.attackTimer=230;a.state.attackPower=300;
 room.step(16.67);
 const ids=[...a.events,...b.events].map(e=>e.id);
 assert.ok(ids.length>0&&ids.every(Number.isSafeInteger));
 assert.equal(new Set(ids).size,ids.length);
 room.step(16.67);
 assert.equal(room.eventSerial,ids.length);
});


test('reloaded client accepts fresh input sequence but rejects packets from older input epochs',()=>{
 const actual=Date.now;Date.now=()=>1_000_000;
 try{
  let state=module.createRoom({player:{id:'a',name:'A'},payload:{mode:'echo-trap'}}).state;
  state=module.onJoin({state,player:{id:'b',name:'B'}}).state;
  const send=(stream,seq,lmb)=>{
   state=module.onMessage({state,player:{id:'a'},payload:{type:'input',payload:{stream,seq,keys:{},mouseAngle:0,lmb}}}).state;
  };
  send(1000,57,true);
  send(1000,56,false);
  assert.equal(state.players.find(p=>p.id==='a').inputState.lmb,true,'out-of-order same stream is ignored');
  send(1001,1,false);
  assert.equal(state.players.find(p=>p.id==='a').inputState.lmb,false,'new stream resets sequence');
  send(1000,58,true);
  assert.equal(state.players.find(p=>p.id==='a').inputState.lmb,false,'old page cannot overwrite new input stream');
 }finally{Date.now=actual;}
});
test('charged sword cannot strike through an actively raised shield',()=>{
 const room=new GameRoom('guard-balance','echo-trap',()=>{});
 room.map.walls=[];
 const s=room.addPlayer(null,'Guard').state;
 s.charge=800;s.shieldUp=true;s.shieldStrength=3;
 room.applyInputToActor(s,{keys:{},mouseAngle:0,lmb:false,rmb:true},16.67);
 assert.equal(s.attacking,false);
 assert.equal(s.charge,0,'charge is cancelled rather than stored during guard');
});
