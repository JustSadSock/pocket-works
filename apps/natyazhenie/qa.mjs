import assert from 'node:assert/strict';
import game,{MIN_PLAYERS,MAX_PLAYERS} from './server/module.ts';
import {CHAPTERS,ROPE,FLOOR,worldFor,stageFor,simulate,validateLayouts,ropeDistance,viewWorld} from './physics.js';
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
 // Level 1: the painted seesaws must have actual collision. Standing on
 // the floor *under* them cannot charge a single beam.
 for(let count=2;count<=5;count++){
  const w=worldFor(people.slice(0,count),0),beams=w.stage.balances;
  const first=beams[0].x-(count===5?90:count===4?100:110);
  const targets=[first];for(const beam of beams)targets.push(2*beam.x-targets.at(-1));
  w.players.forEach((p,i)=>{p.x=targets[i];p.y=522;p.ground=true;});
  for(let j=0;j<220;j++)controls(w,()=>({}));
  assert.ok(w.beamCharge.every(x=>x===0),'standing underneath does not count ('+count+' players)');
  assert.ok(w.players.every(p=>p.y>503),'floor characters cannot be placed on top of a decorative seesaw');
  // Reset and approach on the floor, jump THROUGH the board, land on its
  // actual sloping collider, then actively balance against the spring.
  const trial=worldFor(people.slice(0,count),0);
  let phase=0,landed=false;
  for(let step=0;step<1600&&!trial.gateOpen;step++){
   if(phase===0&&trial.players.every((p,i)=>Math.abs(p.x-targets[i])<12&&p.ground))phase=1;
   controls(trial,(p,i)=>({dir:Math.max(-1,Math.min(1,(targets[i]-p.x)*.14)),
    jump:phase===1&&trial.players.every(q=>q.y>485)&&step%60===0}));
   if(trial.players.every(p=>p.ground&&p.y+18<515))landed=true;
  }
  assert.ok(landed,'all '+count+' must be able to jump onto real physical boards');
  assert.ok(trial.gateOpen,'real on-board team balancing must open the door ('+count+')');
  assert.ok(trial.beamCharge.every(x=>x>=(count===5?.65:1)),'every linked board participates');
  // Movement to the exit after a solved puzzle is also playable.
  let walked=false;
  for(let step=0;step<600&&!walked;step++){
   const before=trial.level;controls(trial,()=>({dir:1}));
   walked=trial.level!==before;
  }
  assert.ok(walked,'balanced team can physically reach the next stage ('+count+')');
 }
 // Level 2: real approaches, one-way raft boarding, rider driving the
 // full distance and *all* passengers/shore holders reaching the far bank.
 for(let count=2;count<=5;count++){
  const ferry=worldFor(people.slice(0,count),1),bracer=count===5?2:0,driver=count-1;
  let phase=0,boarded=false,docked=false;
  for(let step=0;step<1700&&!ferry.gateOpen;step++){
   if(phase===0&&ferry.players[0].x>(count===5?285:335))phase=1;
   if(phase===1&&ferry.players[driver].ground&&ferry.players[driver].y<500){phase=2;boarded=true;}
   if(phase===2&&ferry.ferryDone){phase=3;docked=true;}
   controls(ferry,(p,i)=>{
    if(phase===0)return {dir:1};
    if(phase===1)return {anchor:i===bracer,jump:(count===5?i>=3:i===driver)&&step%(count===5?30:25)<3};
    if(phase===2)return {anchor:i===bracer,dir:count===5?+(i>=3):+(i===driver)};
    return {dir:1,jump:p.ground&&p.x<705&&step%55<3};
   });
  }
  assert.ok(boarded,'driver can actually jump from below onto the deck ('+count+')');
  assert.ok(docked&&ferry.ferryDone,'raft must reach opposite bank with players aboard ('+count+')');
  assert.ok(ferry.gateOpen,'every player must be able to disembark and reach far bank ('+count+')');
  assert.ok(ferry.players.every(p=>p.x>=ferry.stage.floors[1].x+25&&p.ground&&p.y+18>=FLOOR-3),
   'far-shore condition checks physical footing of everyone ('+count+')');
  let walked=false;
  for(let step=0;step<300&&!walked;step++){
   const before=ferry.level;controls(ferry,()=>({dir:1}));
   walked=ferry.level!==before;
  }
  assert.ok(walked,'whole crew can leave level two after docking ('+count+')');
 }
 // Cargo reacts to obstacles and resets without losing the level.
 const cargo=worldFor(people.slice(0,3),2);
 cargo.cargoBall.x=424;cargo.cargoBall.y=386;
 for(let i=0;i<3;i++){
  cargo.players[i].x=400+i*18;cargo.players[i].y=500;cargo.players[i].ground=false;
 }
 controls(cargo,()=>({}));
 assert.ok(cargo.cargoBall.cracks>=1,'glass cargo cracks when it hits an obstacle');
 assert.equal(cargo.level,2);assert.ok(!cargo.finished);
 // Level 3: traverse ALL three glass hazards with real movement / jump pulses.
 for(let count=2;count<=5;count++){
  const w=worldFor(people.slice(0,count),2);let phase=0,launch=0,achieved=false;
  for(let step=0;step<700&&!w.gateOpen&&w.cargoBall.cracks===0;step++){
   const ball=w.cargoBall;
   if(phase===0&&ball.x>=290){phase=1;launch=step;}
   if(phase===1&&step-launch>=24)phase=2;
   if(phase===2&&ball.x>465)phase=3;
   if(phase===3&&ball.x>700){phase=4;launch=step;}
   if(phase===4&&step-launch>=24)phase=5;
   controls(w,()=>({dir:[1,0,1,1,0,1][phase],
    jump:step===launch&&(phase===1||phase===4)}));
  }
  assert.ok(w.gateOpen&&w.cargoBall.cracks===0,
   'unbroken cargo can really travel over, under, over the maze ('+count+')');
  let walked=false;
  for(let step=0;step<350&&!walked;step++){
   const before=w.level;controls(w,()=>({dir:1}));walked=w.level!==before;
  }
  assert.ok(walked,'cargo team can physically finish after delivering ('+count+')');
 }

 // Pulse: success requires genuine jumps, designated turns and spread positions.
 const pulse=worldFor(people.slice(0,3),3);
 pulse.players.forEach((p,i)=>{p.x=pulse.stage.waveSlots[i].x;p.y=522;p.ground=true;});
 controls(pulse,(p,i)=>({jump:i===2}));
 assert.equal(pulse.waveIndex,0,'wrong first actor cannot skip sequence');
 const pulseStart=worldFor(people.slice(0,3),3);
 pulseStart.players.forEach((p,i)=>{p.x=pulseStart.stage.waveSlots[i].x;p.y=522;p.ground=true;});
 controls(pulseStart,(p,i)=>({jump:i===0}));
 assert.equal(pulseStart.waveIndex,1,'real first jump starts relay');
 for(let i=0;i<180;i++)controls(pulseStart,()=>({}));
 assert.equal(pulseStart.waveIndex,0,'missed reply resets the pulse without reloading');
 // Complete physically triggered jump relay, including the middle friend's return jump.
 for(const n of [2,3,4,5]){
  const w=worldFor(people.slice(0,n),3);
  w.players.forEach((p,i)=>{p.x=w.stage.waveSlots[i].x;p.y=522;p.ground=true;});
  for(const [j,actor] of w.stage.waveSequence.entries()){
   controls(w,(p,i)=>({jump:i===actor,anchor:i!==actor}));
   assert.equal(w.waveIndex,j+1,'relay pulse '+j+' of '+n+' must be a genuine jump');
   for(let t=0;t<86;t++)controls(w,(p,i)=>({anchor:i!==actor}));
  }
  assert.ok(w.gateOpen,'full up-and-down relay unlocks the gate for '+n);
 }
 // Force a cargo endpoint without faking the goal flag. The ball itself must arrive.
 const delivered=worldFor(people.slice(0,3),2);
 delivered.players.forEach((p,i)=>{p.x=910+i*21;p.y=522;p.ground=true;});
 delivered.cargoBall.x=918;delivered.cargoBall.y=415;
 controls(delivered,()=>({}));
 assert.ok(delivered.gateOpen,'delivering the unbroken shared cargo opens the actual door');
 // Level 4: approach the coloured spots by walking in from the actual spawn.
 for(let count=2;count<=5;count++){
  const w=worldFor(people.slice(0,count),3);
  let prepared=false;
  for(let step=0;step<900;step++){
   controls(w,(p,i)=>({dir:Math.max(-1,Math.min(1,(w.stage.waveSlots[i].x-p.x)*.12))}));
   if(w.players.every((p,i)=>Math.abs(p.x-w.stage.waveSlots[i].x)<10&&p.ground)){prepared=true;break;}
  }
  assert.ok(prepared,'real walking lets all '+count+' assemble on wave spots');
  for(const [step,actor] of w.stage.waveSequence.entries()){
   controls(w,(p,i)=>({jump:i===actor,anchor:i!==actor}));
   assert.equal(w.waveIndex,step+1,'physical jump impulse '+step+'/'+count);
   for(let t=0;t<86;t++)controls(w,(p,i)=>({anchor:i!==actor}));
  }
  assert.ok(w.gateOpen,'up-and-down chain of '+count+' friends opens gate');
  let walked=false;
  for(let step=0;step<650&&!walked;step++){
   const before=w.level;controls(w,()=>({dir:1}));walked=w.level!==before;
  }
  assert.ok(walked,'wave team reaches final prototype ('+count+')');
 }
 // Level 5: independently drive each actor into a realistic <=250px
 // straddling configuration, hook real rope segments, then escape the gate.
 for(let count=2;count<=5;count++){
  const w=worldFor(people.slice(0,count),4),hooks=w.stage.hooks;
  const targets=[hooks[0].x-80];for(const hook of hooks)targets.push(hook.x+80);
  for(let step=0;step<1000&&!w.braidDone;step++)
   controls(w,(p,i)=>({dir:Math.max(-1,Math.min(1,(targets[i]-p.x)*.09)),
    anchor:i===0&&Math.abs(targets[0]-p.x)<9}));
  assert.ok(w.braidDone&&w.gateOpen,'all '+count+' friends can catch the proper pegs');
  assert.ok(w.wraps.every((hook,i)=>hook===i),'each physical segment has its proper peg');
  const initial=w.escapeLeft;
  for(let step=0;step<850&&!w.finished;step++)controls(w,()=>({dir:1}));
  assert.ok(w.finished,'whole group must physically escape before closing time ('+count+')');
  assert.ok(w.escapeLeft>0&&w.escapeLeft<initial,'real shared countdown is still running');
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
 console.log('NATYAZHENIE acceptance passed: all 5 stages COMPLETE with real 2–5 player inputs, solid seesaws, docked raft, fragile cargo, jump chain, hook escape, and ready-gated network lifecycle.');
}finally{Date.now=originalNow;}
