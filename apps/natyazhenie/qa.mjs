import assert from 'node:assert/strict';
import game,{MIN_PLAYERS,MAX_PLAYERS} from './server/module.ts';
import {CHAPTERS,ROPE,worldFor,stageFor,simulate,validateLayouts,ropeDistance,viewWorld} from './physics.js';
import {newLocal,tickLocal,verifyLocalLayouts} from './local.js';
import {advancePosition} from './engine.js';
import {rubberPoints} from './art.js';

assert.equal(MIN_PLAYERS,2);assert.equal(MAX_PLAYERS,5);
assert.equal(CHAPTERS.length,5,'the old twelve stages must be completely replaced');
assert.deepEqual(CHAPTERS.map(c=>c.kind),['balance','ferry','cargo','pulse','braid']);
assert.deepEqual(validateLayouts(),[]);assert.deepEqual(verifyLocalLayouts(),[]);
const people=Array.from({length:5},(_,i)=>({id:'p'+i,name:'Member '+i}));
const originalNow=Date.now;let now=originalNow();
Date.now=()=>now;
const controls=(w,fn)=>{
 now+=11;
 for(let i=0;i<w.players.length;i++)
  w.inputs[w.players[i].id]={dir:0,jump:false,anchor:false,...fn(w.players[i],i),at:now};
 simulate(w,.011,now);
};
try{
 for(let count=2;count<=5;count++)for(let level=0;level<5;level++){
  const w=worldFor(people.slice(0,count),level),kind=w.stage.kind;
  for(let tick=0;tick<250;tick++){
   controls(w,(p,i)=>({dir:((tick%120<50?1:-1)*(i%2?1:-1))*.73,
    jump:tick%87===0,anchor:tick%140>100&&i===Math.floor(count/2)}));
   assert.ok(w.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.vx)));
   for(let i=0;i<w.players.length-1;i++){
    const a=w.players[i],b=w.players[i+1];
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<=ROPE.max+5,'finite tether '+count+'/'+kind+'/'+i);
    assert.ok(ropeDistance(w,i)<=ROPE.max+9,'routed band length '+count+'/'+kind+'/'+i);
   }
  }
  assert.equal(w.stage.index,level,'challenge cannot change spontaneously');
  console.log('Stable: '+count+' players in '+kind);
 }
 // Physics-derived geometry is always downward and reversible.
 for(const a of [{x:100,y:400},{x:450,y:310}]){
  for(const b of [{x:520,y:520},{x:130,y:340}]){
   for(const t of [0,.4,1.7]){
    const f=rubberPoints(a,b,{time:t,tight:0});
    f.forEach((p,i)=>assert.ok(p.y>=(a.y+(b.y-a.y)*i/(f.length-1))-.001,'gravity is always downward'));
    const reverse=rubberPoints(b,a,{time:0,tight:0,reduced:true});
    const original=rubberPoints(a,b,{time:0,tight:0,reduced:true});
    assert.ok(Math.abs(original[Math.floor(original.length/2)].y-reverse[Math.floor(reverse.length/2)].y)<.1,'reverse identical');
   }
  }
 }
 // Prototype adaptation: 3 players => 2 interacting segments; 2 and 4/5 also authored.
 for(let n=2;n<=5;n++){
  const b=stageFor(0,n),p=stageFor(3,n),r=stageFor(4,n);
  assert.equal(b.balances.length,n-1);
  assert.equal(p.waveSequence.length,2*n-1);
  assert.equal(r.hooks.length,n-1);
 }
 // Dual and triple-actor counterweight must work with real input acceleration.
 for(const count of [2,3,4,5]){
  const w=worldFor(people.slice(0,count),0),beams=w.stage.balances;
  const start=beams[0].x-110;
  const initial=[start];for(const beam of beams)initial.push(beam.x*2-initial.at(-1));
  w.players.forEach((p,i)=>Object.assign(p,{x:initial[i],y:522,vx:0,vy:0,ground:true}));
  for(let step=0;step<1050&&!w.gateOpen;step++){
   const targets=[start];for(let i=0;i<beams.length;i++)
    targets.push(2*(beams[i].x-Math.sin(w.clock*2.3+i*1.9)*17)-targets[i]);
   controls(w,(p,i)=>({dir:Math.max(-1,Math.min(1,(targets[i]-p.x)*.13))}));
  }
  assert.ok(w.gateOpen,'balancing team '+count+' must be able to open the gate');
 }
 // Ferry: an actual grounded rider and anchored teammate, no virtual button.
 const ferry=worldFor(people.slice(0,3),1);
 ferry.players[0].x=337;ferry.players[0].y=522;ferry.players[0].ground=true;
 ferry.players[1].x=440;ferry.players[1].y=438;ferry.players[1].ground=true;
 ferry.players[2].x=505;ferry.players[2].y=438;ferry.players[2].ground=true;
 const start=ferry.ferryX;
 for(let t=0;t<55;t++){
  controls(ferry,(p,i)=>i===0?{anchor:true}:{dir:t%9<6?1:-.4});
 }
 assert.ok(ferry.ferryX>start+5,'anchored teammate allows a passenger to drive ferry');
 // Cargo reacts to obstacles and resets without losing the level.
 const cargo=worldFor(people.slice(0,3),2);
 cargo.cargoBall.x=424;cargo.cargoBall.y=386;
 for(let i=0;i<3;i++){
  cargo.players[i].x=400+i*18;cargo.players[i].y=500;cargo.players[i].ground=false;
 }
 controls(cargo,()=>({}));
 assert.ok(cargo.cargoBall.cracks>=1,'glass cargo cracks when it hits an obstacle');
 assert.equal(cargo.level,2);assert.ok(!cargo.finished);
 // Pulse: success requires genuine jumps, designated turns and spread positions.
 const pulse=worldFor(people.slice(0,3),3);
 pulse.players.forEach((p,i)=>{p.x=pulse.stage.waveSlots[i].x;p.y=522;p.ground=true;});
 controls(pulse,(p,i)=>({jump:i===2}));
 assert.equal(pulse.waveIndex,0,'wrong first actor cannot skip sequence');
 controls(pulse,(p,i)=>({jump:i===0}));
 assert.equal(pulse.waveIndex,1,'real first jump starts relay');
 for(let i=0;i<180;i++)controls(pulse,()=>({}));
 assert.equal(pulse.waveIndex,0,'missed reply resets the pulse without reloading');
 // Rope braiding requires every correct hook simultaneously and a grounded anchor.
 for(let n=2;n<=5;n++){
  const w=worldFor(people.slice(0,n),4),hooks=w.stage.hooks;
  const xs=[hooks[0].x-95];for(const h of hooks)xs.push(h.x*2-xs.at(-1));
  w.players.forEach((p,i)=>Object.assign(p,{x:xs[i],y:522,ground:true,vx:0,vy:0}));
  for(let j=0;j<240&&!w.braidDone;j++)controls(w,()=>({anchor:true}));
  assert.ok(w.braidDone,'all '+n+' people can latch every physical peg');
  assert.ok(w.gateOpen&&w.escapeLeft>0,'braid starts a real group escape window');
 }
 // Room lifecycle: unanimous briefing, no simulation while reading, every transition freezes.
 for(let count=2;count<=5;count++){
  let state=game.createRoom({player:people[0]}).state;
  state=game.onJoin({state,players:people.slice(0,count)}).state;
  state=game.onMessage({state,player:people[0],payload:{type:'start'}}).state;
  assert.equal(state.phase,'briefing');
  const fixedX=state.world.players[0].x;
  now+=100;state=game.onMessage({state,player:people[0],payload:{type:'input',dir:1}}).state;
  assert.equal(state.world.players[0].x,fixedX,'inputs ignored before everyone confirms');
  for(let i=0;i<count-1;i++){
   state=game.onMessage({state,player:people[i],payload:{type:'ready'}}).state;
   assert.equal(state.phase,'briefing','all players must individually press ready');
  }
  state=game.onMessage({state,player:people[count-1],payload:{type:'ready'}}).state;
  assert.equal(state.phase,'play');
  for(let level=0;level<5;level++){
   assert.equal(state.world.level,level);
   state.world.gateOpen=true;state.world.escapeLeft=30;
   state.world.players.forEach((p,i)=>{p.x=1138-(count-1-i)*32;p.y=522;p.ground=true;p.anchor=false;p.vx=0;p.vy=0;});
   now+=100;state=game.onMessage({state,player:people[0],payload:{type:'input',dir:0,jump:false,anchor:false}}).state;
   if(level===4)assert.equal(state.phase,'done');
   else{
    assert.equal(state.phase,'briefing','a completed level must stop at the next book');
    assert.deepEqual(state.ready,{});
    for(let i=0;i<count;i++)state=game.onMessage({state,player:people[i],payload:{type:'ready'}}).state;
    assert.equal(state.phase,'play');
   }
  }
  state=game.onMessage({state,player:people[0],payload:{type:'start'}}).state;
  assert.equal(state.phase,'briefing','replay restarts from book one');
 }
 // Local play: controls are unchanged and the same deterministic physics is used.
 const local=newLocal();
 for(let i=0;i<170;i++){now+=16;tickLocal(local,[{dir:1,jump:i%44===0},{dir:1,jump:i%51===0}],1/60);}
 assert.equal(local.level,0);
 const estimate=advancePosition(local.players[0],{dir:1,jump:false},1/60,{...local.stage,open:false},local.players);
 assert.ok(Number.isFinite(estimate.x));
 assert.equal(viewWorld(local).stage.kind,'balance');
 console.log('NATYAZHENIE five prototypes passed: 2–5 players, actual puzzle rules, all-ready server briefings, local prediction.');
}finally{Date.now=originalNow;}
