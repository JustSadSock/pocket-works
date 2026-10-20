import test from 'node:test';
import assert from 'node:assert/strict';
import sim from '../server/game/sim.cjs';
import module from '../server/entry.js';
const {GameRoom}=sim;
test('a lethal hit changes the actual fighter and resets exactly after 600 ms',()=>{
 const room=new GameRoom('kill-test','echo-trap',()=>{});room.map.walls=[];const a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');a.state.x=0;b.state.x=1;a.state.attacking=true;a.state.attackPower=1000;room.resolveCombat();assert.equal(b.alive,false);assert.ok(room.roundResetAt);room.step(599);assert.equal(b.alive,false);room.step(1);assert.equal(b.alive,true);assert.equal(a.state.x,-4);assert.equal(b.state.x,4);
});
test('fresh shield parries, an older shield absorbs and breaks',()=>{
 const room=new GameRoom('parry-test','echo-trap',()=>{});const a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');room.map.walls=[];a.state.x=0;b.state.x=1;b.state.facing=Math.PI;a.state.attacking=true;b.state.shieldUp=true;b.state.parryWindow=100;room.tryHit(a,b);assert.equal(a.state.stagger,400);assert.equal(b.alive,true);b.state.shieldUp=true;b.state.parryWindow=0;b.state.shieldStrength=1;a.state.attacking=true;room.tryHit(a,b);assert.equal(b.state.shieldUp,false);assert.equal(b.state.shieldCooldown,2000);assert.equal(b.alive,true);
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
