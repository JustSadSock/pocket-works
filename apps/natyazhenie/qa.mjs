import assert from 'node:assert/strict';
import game,{MIN_PLAYERS,MAX_PLAYERS} from './server/module.ts';
import {CHAPTERS,ROPE,stageFor,worldFor,simulate,validateLayouts,ropeDistance,currentGoal} from './physics.js';
import {newLocal,tickLocal,verifyLocalLayouts} from './local.js';
import {advancePosition} from './engine.js';
import {rubberPoints} from './art.js';
assert.equal(MIN_PLAYERS,2);assert.equal(MAX_PLAYERS,5);assert.equal(CHAPTERS.length,12);
assert.deepEqual(validateLayouts(),[],'all capacities must have reachable layouts');
assert.deepEqual(verifyLocalLayouts(),[]);
const people=Array.from({length:5},(_,i)=>({id:'p'+i,name:'Player '+i}));
const wasNow=Date.now;let now=Date.now();Date.now=()=>now;
try{
 for(let count=2;count<=5;count++)for(let level=0;level<CHAPTERS.length;level++){
  const w=worldFor(people.slice(0,count),level);
  assert.equal(w.stage.pads.length,stageFor(level,count).pads.length);
  for(let tick=0;tick<300;tick++){
   now+=12;
   w.players.forEach((p,i)=>{
    const dir=(tick%110<45?1:tick%110<65?0:-1)*(i%2?-1:1);
    w.inputs[p.id]={dir,jump:tick%61===0,anchor:tick%150>90&&i===0,at:now};
   });
   simulate(w,.012,now);
   assert.ok(w.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),'nonfinite body');
   for(let i=1;i<w.players.length;i++){
    const a=w.players[i-1],b=w.players[i],d=Math.hypot(a.x-b.x,a.y-b.y);
    assert.ok(d<=ROPE.max+5,'unbounded rope at '+count+'/'+level+' length '+d.toFixed(2));
    assert.ok(ropeDistance(w,i-1)<=ROPE.max+8,'rope path grew without bound '+count+'/'+level);
   }
  }
  console.log('Physics stable: '+count+' players, chapter '+(level+1));
 }
 // Every switch formation must be holdable for the required duration, even
 // while moving obstacles cycle, for every team size.
 for(let count=2;count<=5;count++)for(let level=0;level<CHAPTERS.length;level++){
  const w=worldFor(people.slice(0,count),level);
  if(!w.stage.pads.length||w.stage.sequence.length&&w.stage.sequence[0]!=='pads')continue;
  w.players.forEach((p,i)=>{p.x=w.stage.pads[i].x;p.y=522;p.ground=true;p.vx=0;p.vy=0;});
  for(let tick=0;tick<270;tick++){
   now+=11;for(const p of w.players)w.inputs[p.id]={dir:0,jump:false,anchor:true,at:now};
   simulate(w,.011,now);
   if(w.level!==level)break;
  }
  assert.ok(w.level!==level||w.plateCharge>.98,'unsustainable pads at '+count+'/'+level);
 }
 const hold=worldFor(people.slice(0,2),2);hold.players[0].x=420;hold.players[1].x=610;const start=hold.players[0].x;
 for(let i=0;i<170;i++){now+=11;hold.inputs.p0={dir:0,jump:false,anchor:true,at:now};hold.inputs.p1={dir:1,jump:false,anchor:false,at:now};simulate(hold,.011,now);}
 assert.ok(Math.abs(hold.players[0].x-start)<1.5,'anchor must hold the ground');
 assert.ok(hold.wheelDone[0],'the hooked pulley must be chargeable with two characters');
 assert.ok(hold.phase>=1,'charged drum advances puzzle phase');
 const power=worldFor(people.slice(0,2),5);power.players[0].x=400;power.players[1].x=625;
 for(let i=0;i<170;i++){now+=11;power.inputs.p0={dir:0,jump:false,anchor:true,at:now};power.inputs.p1={dir:1,jump:false,anchor:false,at:now};simulate(power,.011,now);}
 assert.ok(power.wheelDone[0],'tension chapter drum can charge with anchored team');
 const plates=worldFor(people,0);
 for(let i=0;i<5;i++){plates.players[i].x=plates.stage.pads[i].x;plates.players[i].y=522;}
 for(let i=0;i<85;i++){now+=11;plates.players.forEach(p=>{plates.inputs[p.id]={dir:0,jump:false,anchor:true,at:now};});simulate(plates,.011,now);}
 assert.ok(plates.gateOpen,'all five colored plates should unlock gate');
 // Reaching a prize too early may not skip a real puzzle phase.
 const gated=worldFor(people.slice(0,2),5);
 gated.players[0].x=gated.stage.stars[0].x;gated.players[0].y=gated.stage.stars[0].y;
 now+=11;gated.players.forEach(p=>gated.inputs[p.id]={dir:0,jump:false,anchor:false,at:now});
 simulate(gated,.011,now);
 assert.equal(currentGoal(gated),'wheels');
 assert.equal(gated.stars[0],false,'early star must not bypass pulley phase');
 // Anchor-assisted launch is stronger than an ordinary jump.
 const sling=worldFor(people.slice(0,2),9);
 sling.players[0].x=400;sling.players[1].x=621;sling.players[0].ground=true;sling.players[1].ground=true;
 now+=11;sling.inputs.p0={dir:0,jump:false,anchor:true,at:now};sling.inputs.p1={dir:0,jump:false,anchor:false,at:now};
 simulate(sling,.011,now);
 now+=11;sling.inputs.p1={dir:0,jump:true,anchor:false,at:now};simulate(sling,.011,now);
 assert.ok(sling.players[1].vy<-580,'tension launches friend into a higher jump');
 // Recover a deliberately suspended friend without teleporting or resetting a stage.
 const rescue=worldFor(people.slice(0,2),10);
 rescue.players[0].x=412;rescue.players[0].y=522;rescue.players[0].ground=true;
 rescue.players[1].x=500;rescue.players[1].y=645;rescue.players[1].vy=0;rescue.players[1].ground=false;rescue.players[1].hang=1.1;
 for(let i=0;i<160;i++){now+=11;rescue.inputs.p0={dir:0,jump:false,anchor:true,at:now};rescue.inputs.p1={dir:0,jump:false,anchor:false,at:now};simulate(rescue,.011,now);if(rescue.saveCount)break;}
 assert.ok(rescue.saveCount>=1,'an anchored friend must be able to reel a dangling person to safety');
 assert.equal(currentGoal(rescue),'signals','rescue unlocks physical sensor puzzle');
 // Rendered slack always falls DOWN in world coordinates regardless of endpoint order,
 // and stays the same even if the players exchange sides or one anchors.
 for(const a of [{x:220,y:420},{x:610,y:505},{x:400,y:550}]){
  for(const b of [{x:650,y:490},{x:230,y:310},{x:620,y:550}]){
   const f=rubberPoints(a,b,{reduced:true,tight:0}),r=rubberPoints(b,a,{reduced:true,tight:0});
   const m=f[Math.floor(f.length/2)],nr=r[Math.floor(r.length/2)];
   const fy=(a.y+b.y)/2;
   assert.ok(m.y>=fy-1,'rubber cannot float upward under gravity');
   assert.ok(Math.abs(m.y-nr.y)<1.7,'reversing linked friends cannot invert sag');
   for(const [source,dest] of [[a,b],[b,a]]){
    for(const time of [0,.7,2.3]){
     const pts=rubberPoints(source,dest,{time,tight:0,reduced:false});
     pts.forEach((p,i)=>assert.ok(p.y>=(source.y+(dest.y-source.y)*i/(pts.length-1))-.01,
      'animated loose rubber must hang downward, even if endpoints swap'));
    }
   }
  }
 }
 // Signals are actual geometric crossings of the physical cord, not pickups by a body.
 const relay=worldFor(people.slice(0,2),3);
 assert.equal(currentGoal(relay),'signals');
 let lens=relay.stage.signals[0];
 relay.players[0].x=lens.x-86;relay.players[0].y=lens.y+63;relay.players[1].x=lens.x+86;relay.players[1].y=lens.y-63;
 for(let i=0;i<2;i++){now+=11;relay.players.forEach(p=>relay.inputs[p.id]={dir:0,jump:false,anchor:false,at:now});simulate(relay,.011,now);}
 assert.equal(relay.signalIndex,1,'first airborne lens registers a stretched cord');
 assert.ok(!relay.gateOpen,'one signal is insufficient');
 lens=relay.stage.signals[1];
 relay.players[0].x=lens.x-85;relay.players[0].y=lens.y+61;relay.players[1].x=lens.x+85;relay.players[1].y=lens.y-61;
 now+=11;relay.players.forEach(p=>relay.inputs[p.id]={dir:0,jump:false,anchor:false,at:now});simulate(relay,.011,now);
 assert.ok(relay.signalDone&&relay.gateOpen,'second sensor opens the route');
 const lapse=worldFor(people.slice(0,2),3);
 let l=lapse.stage.signals[0];
 lapse.players[0].x=l.x-90;lapse.players[0].y=l.y+61;lapse.players[1].x=l.x+90;lapse.players[1].y=l.y-61;
 now+=11;lapse.players.forEach(p=>lapse.inputs[p.id]={dir:0,jump:false,anchor:false,at:now});simulate(lapse,.011,now);
 assert.equal(lapse.signalIndex,1);
 lapse.players.forEach(p=>{p.x=120;p.y=522;}); // clear the first lens
 for(let j=0;j<50;j++){now+=120;lapse.players.forEach(p=>lapse.inputs[p.id]={dir:0,jump:false,anchor:false,at:now});simulate(lapse,.12,now);}
 assert.equal(lapse.signalIndex,0,'failed rapid relay resets without reloading the level');
 // Real moving bodies can react to the counterweight's oscillating drift.
 const balance=worldFor(people.slice(0,2),4),center=balance.stage.balance.x;
 balance.players[0].x=center-111;balance.players[1].x=center+111;
 balance.players.forEach(p=>{p.y=522;p.vx=0;p.vy=0;p.ground=true;});
 for(let tick=0;tick<900;tick++){
  now+=11;
  const offset=Math.sin(balance.clock*2.3)*11;
  // A real two-input controller must resist the tether's inward pull while
  // moving both ends slightly to counter the changing wind.
  balance.players.forEach((p,i)=>{
   const target=center+(i?114:-114)+offset;
   const dir=Math.max(-1,Math.min(1,(target-p.x)*.14));
   balance.inputs[p.id]={dir,jump:false,anchor:false,at:now};
  });
  simulate(balance,.011,now);
  if(balance.balanceDone)break;
 }
 assert.ok(balance.balanceDone,'counterweight must be achievable with player directional inputs');
 // Expiring after the signal pulse closes temporary gates and allows retry.
 const sprint=worldFor(people.slice(0,2),6);
 sprint.signalDone=true;sprint.phase=sprint.stage.sequence.length;sprint.gateOpen=true;sprint.escapeLeft=.04;
 now+=110;sprint.players.forEach(p=>sprint.inputs[p.id]={dir:0,jump:false,anchor:false,at:now});
 simulate(sprint,.12,now);
 assert.ok(!sprint.gateOpen&&!sprint.signalDone,'expired gate resets the puzzle without softlocking');
 for(let n=2;n<=5;n++){
  let state=game.createRoom({player:people[0]}).state;
  state=game.onJoin({state,players:people.slice(0,n)}).state;
  state=game.onMessage({state,player:people[0],payload:{type:'start'}}).state;
  assert.equal(state.phase,'play');
  for(let level=0;level<CHAPTERS.length;level++){
   assert.equal(state.world.level,level);
   state.world.gateOpen=true;state.world.escapeLeft=10;
   state.world.players.forEach((p,i)=>{p.x=1138-(n-1-i)*34;p.y=522;p.ground=true;p.anchor=false;p.vx=0;p.vy=0;});
   now+=100;state=game.onMessage({state,player:people[0],payload:{type:'input',dir:0,jump:false,anchor:false}}).state;
  }
  assert.equal(state.phase,'done');state=game.onMessage({state,player:people[0],payload:{type:'start'}}).state;
  assert.equal(state.phase,'play');
 }
 const w=newLocal();
 for(let i=0;i<220;i++){now+=16;tickLocal(w,[{dir:1,jump:i%39===0,anchor:false},{dir:1,jump:i%43===0,anchor:false}],1/60);}
 assert.equal(w.level,0,'running right alone must not clear tutorial');
 const p=advancePosition(w.players[0],{dir:1,jump:false,anchor:false},1/60,{...w.stage,open:false},w.players);
 assert.ok(Number.isFinite(p.x),'client prediction must stay finite');
 console.log('NATYAZHENIE v1.3: 12 stages, gravity ribbon, physical relay puzzles, counterweights, exit timer and multiplayer lifecycle passed');
}finally{Date.now=wasNow;}
