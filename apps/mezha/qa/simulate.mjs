import assert from 'node:assert/strict';
import {createGame,action,tick,stats,save,load,W,H,WORLD_SCALE,LIMIT,DOMINATION_SITES,DOMINATION_SECONDS,SITE_DEFS} from '../engine.js';
const dt=.05,P=n=>n*WORLD_SCALE;
function play(s,secs,turn=()=>{}) {
 for(let i=0;i<secs/dt&&s.phase==='battle';i++){
  turn(s,i);tick(s,dt);
  if(i%20===0){
   for(const p of s.players)for(const k of ['base','food','wood','gold'])assert.ok(Number.isFinite(p[k])&&p[k]>=0&&p[k]<=999,k);
   for(const u of s.squads)assert.ok(u.hp>0&&u.hp<=u.maxHp&&u.morale>=0&&u.morale<=100&&u.x>=0&&u.x<=W&&u.y>=0&&u.y<=H,'unit invariant');
  }
 }
 return s;
}
function testCore(){
 const s=createGame(42,false);
 assert.equal(s.squads.length,8,'missing initial armies');
 assert.deepEqual([stats(s,0).troops,stats(s,1).troops],[4,4]);
 assert.equal(action(s,0,{kind:'order',captain:2,mode:'capture',x:450,y:300}).ok,false);
 assert.equal(action(s,0,{kind:'order',captain:0,mode:'raid',x:P(479),y:P(306)}).ok,true);
 assert.equal(action(s,0,{kind:'recruit',type:'levy'}).ok,true);
 assert.equal(stats(s,0).troops,5);
 assert.equal(action(s,0,{kind:'fort',site:'orchard'}).ok,true);
 assert.equal(s.sites[0].fort,1);
 s.players[0].gold=999;s.players[0].wood=999;s.players[0].food=999;
 for(let i=0;i<20;i++)action(s,0,{kind:'recruit',type:'levy'});
 assert.equal(stats(s,0).troops,12,'recruit cap');
 const a=createGame(711,false);
 action(a,0,{kind:'order',captain:0,mode:'capture',x:P(850),y:P(310)});
 play(a,90);
 assert.ok(a.squads.some(u=>u.side===0&&u.x>P(540)),'river crossing');
 const b=createGame(121,true);
 play(b,10);const restored=load(save(b));
 assert.deepEqual(restored,b,'snapshot mismatch');
 play(b,10);play(restored,10);
 assert.deepEqual(restored,b,'deterministic resume');
}
function testSiege(){
 function siege(supplied){
  const s=createGame(900,false);s.squads=s.squads.filter(u=>u.side===0);
  for(const u of s.squads){u.x=P(836);u.y=P(309);u.maxHp=u.hp=1000;u.morale=100}
  for(const c of s.orders.filter(c=>c.side===0)){c.x=P(850);c.y=P(310);c.site=null}
  if(supplied)s.sites.find(z=>z.id==='ford').owner=0;
  play(s,5);return {loss:480-s.players[1].base,damage:1000-s.squads[0].hp};
 }
 const dry=siege(false),wet=siege(true);
 assert.ok(dry.loss>0&&wet.loss>dry.loss*4,'supply must matter');
 assert.ok(dry.damage>0,'garrison should shoot');
 return {unsupported:+dry.loss.toFixed(1),supplied:+wet.loss.toFixed(1)};
}
function run(seed,strategy){
 const s=createGame(seed,true);
 play(s,LIMIT,(s,i)=>{
  if(i%300===0&&strategy!=='passive'){
   const p=s.players[0];const type=p.gold>=104&&p.wood>=24?'knight':p.gold>=70&&p.wood>=16?'bow':'levy';
   action(s,0,{kind:'recruit',type});
  }
  if(i%700!==0)return;
  if(strategy==='rush')for(let c=0;c<2;c++)action(s,0,{kind:'order',captain:c,mode:'capture',x:P(842),y:P(310)});
  if(strategy==='frontier'||strategy==='control'){
   if(i===0){
    action(s,0,{kind:'order',captain:0,mode:'capture',x:P(482),y:P(122)});
    action(s,0,{kind:'order',captain:1,mode:'capture',x:P(strategy==='control'?478:485),y:P(strategy==='control'?306:516)});
   }else if(strategy==='frontier'){
    for(let c=0;c<2;c++){
     const o=s.orders[c],remaining=s.sites.filter(z=>z.owner!==0).sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y));
     const z=remaining[Math.min(c,remaining.length-1)];if(z)action(s,0,{kind:'order',captain:c,mode:'capture',x:z.x,y:z.y});
    }
   }
  }
 });
 assert.equal(s.phase,'end','match must finish');
 return {winner:s.winner,t:s.time,sites:stats(s,0).sites};
}
function testRaidAndTowers(){
 const s=createGame(501,false),target=s.sites.find(z=>z.id==='eastwood');
 s.squads=s.squads.filter(u=>u.side===0);
 for(const u of s.squads){u.x=target.x;u.y=target.y;u.morale=100}
 for(const o of s.orders.filter(o=>o.side===0)){o.mode='raid';o.x=target.x;o.y=target.y}
 s.players[0].wood=10;s.players[1].wood=100;
 tick(s,.05);
 assert.ok(s.players[1].wood<100&&s.players[0].wood>10,'raid did not steal resources');
 assert.ok(target.raided>0,'raiding sprite not flagged');
 const t=createGame(502,false),loc=t.sites.find(z=>z.id==='orchard');
 loc.fort=2;t.squads=t.squads.filter(u=>u.side===1);
 const victim=t.squads[0];victim.x=loc.x+P(30);victim.y=loc.y;
 const before=victim.hp;tick(t,.05);
 assert.ok(victim.hp<before,'fort tower did not shoot nearby opponent');
}

function testDistinctOrders(){
 function occupancy(mode){
  const s=createGame(937,false);
  s.squads=s.squads.filter(u=>u.side===0&&u.captain===0);
  for(const u of s.squads){u.x=P(478);u.y=P(306);u.retreat=false}
  action(s,0,{kind:'order',captain:0,mode,x:P(478),y:P(306)});
  play(s,40);
  return s.sites.find(z=>z.id==='ford').owner;
 }
 assert.equal(occupancy('capture'),0,'explicit capture must annex objective');
 assert.equal(occupancy('defend'),-1,'defensive stance must not annex neutral objective');
 assert.equal(occupancy('raid'),-1,'raid must not annex objective');
 const guard=createGame(994,false);
 guard.squads=guard.squads.filter(u=>u.side===0&&u.captain===0);
 const orchard=guard.sites.find(z=>z.id==='orchard');
 orchard.capture=60;orchard.attacker=1;
 for(const u of guard.squads){u.x=orchard.x;u.y=orchard.y}
 action(guard,0,{kind:'order',captain:0,mode:'defend',x:orchard.x,y:orchard.y});
 play(guard,3);
 assert.ok(orchard.owner===0&&orchard.capture<46,'guard should clear contested progress at defended site');
 function incoming(mode){
  const s=createGame(77,false);
  const defender=s.squads.find(u=>u.side===0&&u.captain===0);
  const attacker=s.squads.find(u=>u.side===1&&u.captain===2);
  s.squads=[defender,attacker];
  defender.x=P(236);defender.y=P(146);defender.attack=100;
  attacker.x=P(250);attacker.y=P(146);attacker.attack=0;
  action(s,0,{kind:'order',captain:0,mode,x:P(236),y:P(146)});
  action(s,1,{kind:'order',captain:2,mode:'capture',x:P(236),y:P(146)});
  const hp=defender.hp;tick(s,.05);return hp-defender.hp;
 }
 const inCapture=incoming('capture'),inDefend=incoming('defend');
 assert.ok(inCapture>0&&inDefend>0,'melee matchup should inflict damage');
 assert.ok(inDefend<inCapture*.85,'defensive stance must reduce local incoming damage');
 return {captureIncoming:+inCapture.toFixed(2),defendIncoming:+inDefend.toFixed(2)};
}
function testTerritorialVictory(){
 const s=createGame(599,false),desired=s.sites.slice(0,DOMINATION_SITES);
 for(const z of desired)z.owner=0;
 s.squads=[]; // isolate the territorial rule from autonomous recapture
 play(s,DOMINATION_SECONDS-16);
 assert.equal(s.phase,'battle','domination must require a sustained hold');
 assert.ok(s.progress[0]>DOMINATION_SECONDS-19,'territorial progress did not advance');
 desired[3].owner=1;
 const before=s.progress[0];
 play(s,12);
 assert.ok(s.progress[0]<before,'losing the territory must reverse domination');
 desired[3].owner=0;
 play(s,44);
 assert.equal(s.phase,'end','holding six territories must decide battle');
 assert.equal(s.winner,0);
 assert.equal(s.victory,'domination');
 return {threshold:DOMINATION_SITES,holdSeconds:DOMINATION_SECONDS};
}
function testAutonomousRival(){
 const s=createGame(816,true,'regular');
 s.botClock=0;
 tick(s,.05);
 assert.ok(s.botPlans.length>0,'AI must plan from the opening, not sit idle on starting farms');
 assert.ok(s.orders.some(o=>o.side===1&&['silver','ford','fen'].includes(o.site)),'AI must contest central objectives');
 const danger=createGame(817,true,'regular');
 const attackers=danger.squads.filter(u=>u.side===0);
 for(const u of attackers){u.x=P(842+(u.id%2)*8);u.y=P(310);u.hp=1000;u.maxHp=1000}
 danger.botClock=0;
 tick(danger,.05);
 assert.equal(danger.orders[2].mode,'defend','one captain must respond to a direct castle threat');
 assert.ok(danger.botPlans.some(p=>p.mode==='defend'));
 const choices=['casual','regular','veteran'].map(skill=>createGame(900,true,skill));
 for(const choice of choices)play(choice,45);
 assert.ok(choices[2].next>choices[0].next,'veteran must recruit more actively than casual');
 const snapshot=JSON.parse(save(s));snapshot.revision=2;delete snapshot.botSkill;delete snapshot.botPlans;
 const migrated=load(JSON.stringify(snapshot));
 assert.ok(migrated&&migrated.revision===4&&migrated.botSkill==='regular','older save must migrate');
 assert.equal(migrated.squads.length,s.squads.length,'migrating must preserve all units');
 tick(migrated,.05);
 return {initialPlans:s.botPlans.length,defendPlan:danger.botPlans.length,casualUnits:choices[0].next-9,veteranUnits:choices[2].next-9};
}
function testLongMarchAndMigration(){
 const s=createGame(778,false);
 const u=s.squads.find(v=>v.side===0&&v.type==='knight');
 s.squads=[u];s.orders[0].x=P(236);s.orders[0].y=P(146);
 const starting=Math.hypot(u.x-P(236),u.y-P(146));
 const oldDistance=starting/WORLD_SCALE;
 let spent=0;
 while(spent<80&&Math.hypot(u.x-P(236),u.y-P(146))>P(15)){tick(s,dt);spent+=dt}
 assert.ok(spent>oldDistance/31*1.30,'world expansion must lengthen actual travel, not only redraw the map');
 const snapshot=JSON.parse(save(createGame(725,false)));
 snapshot.revision=3;
 for(const o of snapshot.orders){o.x/=WORLD_SCALE;o.y/=WORLD_SCALE}
 for(const v of snapshot.squads){v.x/=WORLD_SCALE;v.y/=WORLD_SCALE;if(Number.isFinite(v.targetX))v.targetX/=WORLD_SCALE;if(Number.isFinite(v.targetY))v.targetY/=WORLD_SCALE}
 for(const z of snapshot.sites){z.x/=WORLD_SCALE;z.y/=WORLD_SCALE}
 const migrated=load(JSON.stringify(snapshot));assert.ok(migrated&&migrated.revision===4);
 assert.equal(migrated.sites[0].x,SITE_DEFS[0].x);
 assert.equal(load(save(migrated)).sites[0].x,SITE_DEFS[0].x,'do not scale a save twice');
 return{world:[W,H],distanceMultiplier:WORLD_SCALE,measuredTravelSeconds:+spent.toFixed(1)};
}
const longMarch=testLongMarchAndMigration();
const domination=testTerritorialVictory(),rival=testAutonomousRival(),distinctOrders=testDistinctOrders();
testCore();testRaidAndTowers();const siege=testSiege(),simulations={};
for(const strategy of ['passive','rush','control','frontier']){
 const outcomes=Array.from({length:16},(_,i)=>run(421+i,strategy));
 simulations[strategy]={count:outcomes.length,wins:outcomes.filter(o=>o.winner===0).length,losses:outcomes.filter(o=>o.winner===1).length,draws:outcomes.filter(o=>o.winner===-1).length,meanSeconds:Math.round(outcomes.reduce((a,b)=>a+b.t,0)/16)};
}
assert.equal(simulations.passive.wins,0);
assert.ok(simulations.rush.wins<16,'castle rush exploit still guaranteed');
assert.ok(simulations.frontier.wins>0,'frontier policy never wins');
console.log(JSON.stringify({tests:'PASS',longMarch,domination,rival,distinctOrders,siege,simulations},null,2));