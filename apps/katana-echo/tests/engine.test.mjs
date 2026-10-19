import test from 'node:test';
import assert from 'node:assert/strict';
import sim from '../server/game/sim.cjs';
import module from '../server/entry.js';
const {GameRoom}=sim;
test('a lethal hit changes the actual fighter and resets exactly after 600 ms',()=>{
 const room=new GameRoom('kill-test','echo-trap',()=>{});room.map.walls=[];const a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');a.state.x=0;b.state.x=1;a.state.attacking=true;a.state.attackPower=1000;room.resolveCombat();assert.equal(b.alive,false);assert.ok(room.roundResetAt);room.step(599);assert.equal(b.alive,false);room.step(1);assert.equal(b.alive,true);assert.equal(a.state.x,-4);assert.equal(b.state.x,4);
});
test('fresh shield parries, an older shield absorbs and breaks',()=>{
 const room=new GameRoom('parry-test','echo-trap',()=>{});const a=room.addPlayer(null,'A'),b=room.addPlayer(null,'B');a.state.x=0;b.state.x=1;a.state.attacking=true;b.state.shieldUp=true;b.state.parryWindow=100;room.tryHit(a,b);assert.equal(a.state.stagger,400);assert.equal(b.alive,true);b.state.shieldUp=true;b.state.parryWindow=0;b.state.shieldStrength=1;a.state.attacking=true;room.tryHit(a,b);assert.equal(b.state.shieldUp,false);assert.equal(b.state.shieldCooldown,2000);assert.equal(b.alive,true);
});
for(const mode of ['echo-trap','shadow-tail','channel-echo'])test(mode+' survives serialized input history and stays under PocketNet limit',()=>{
 const actual=Date.now;let now=1e6;Date.now=()=>now;
 try{let state=module.createRoom({player:{id:'a',name:'A'},payload:{mode}}).state;state=module.onJoin({state,player:{id:'b',name:'B'}}).state;
 for(let i=0;i<330;i++){now+=1000/60;state=module.onMessage({state:JSON.parse(JSON.stringify(state)),player:{id:'a'},payload:{type:'input',payload:{keys:{},mouseAngle:0,ghostToggle:i===270}}}).state;state=module.onMessage({state:JSON.parse(JSON.stringify(state)),player:{id:'b'},payload:{type:'input',payload:{keys:{}}}}).state;assert.ok(Buffer.byteLength(JSON.stringify(state))<256*1024);}
 const view=module.viewForPlayer({state,player:{id:'a'}});assert.equal(view.mode,mode);assert.equal(view.players.length,2);assert.ok(view.players.every(p=>Number.isFinite(p.state.x)));assert.equal('buffer' in view.players[0].ghost,false);
 if(mode==='echo-trap')assert.ok(view.players[0].ghost.cooldown>0);else if(mode==='shadow-tail')assert.equal(view.players[0].ghostActor.alive,true);else assert.ok(view.players[0].ghost.energy<1);
 }finally{Date.now=actual;}
});
