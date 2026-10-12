import assert from 'node:assert/strict';
import game,{MIN_PLAYERS,MAX_PLAYERS,validateLayouts} from './server/module.ts';
import {verifyLocalLayouts,newLocal,tickLocal,stageAt} from './local.js';
import {advancePosition} from './engine.js';
assert.equal(MIN_PLAYERS,2);assert.equal(MAX_PLAYERS,5);
assert.deepEqual(validateLayouts(),[],'server: 2–5-player level layouts must be supported');
assert.deepEqual(verifyLocalLayouts(),[],'local: 2–5-player level layouts must be supported');
let now=Date.now();const realNow=Date.now;Date.now=()=>now;
const members=Array.from({length:5},(_,i)=>({id:'player'+i,name:'Игрок '+(i+1)}));
try{
 for(let n=2;n<=5;n++){
  let state=game.createRoom({player:members[0]}).state;
  if(n>1)state=game.onJoin({state,players:members.slice(0,n)}).state;
  const start=game.onMessage({state,player:members[0],payload:{type:'start'}});
  state=start.state;assert.equal(state.phase,'play');
  assert.equal(state.world.players.length,n);
  assert.equal(state.world.stage.pads.length,n);
  assert.equal(state.world.gateOpen,false,'gate starts locked');
  const before=state.world.level;
  for(let i=0;i<120;i++){now+=70;
   const actor=members[i%n];
   state=game.onMessage({state,player:actor,payload:{type:'input',dir:i%3===0?1:-1,jump:i%11===0}}).state;
   assert.equal(state.world.players.length,n);
   for(const p of state.world.players)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
   if(state.world.level!==before)break;
  }
  assert.equal(state.world.level,before,'running and random jumping without the puzzle must not skip the chapter');
  // Complete the canonical six chapters with solved goals and all members in the exit.
  for(let level=0;level<6;level++){
   assert.equal(state.world.level,level);
   state.world.gateOpen=true;
   for(const p of state.world.players){p.x=1138;p.y=522;p.vx=0;p.vy=0;p.ground=true;}
   now+=100;state=game.onMessage({state,player:members[0],payload:{type:'input',dir:0,jump:false}}).state;
  }
  assert.equal(state.phase,'done','the sixth chapter must lead to a result screen');
  const restarted=game.onMessage({state,player:members[0],payload:{type:'start'}}).state;
  assert.equal(restarted.phase,'play','host can replay the completed campaign');
  console.log('PocketNet campaign: '+n+' players OK');
 }
 const alone=game.createRoom({player:members[0]}).state;
 assert.equal(game.onMessage({state:alone,player:members[0],payload:{type:'start'}}).state.phase,'lobby');
 const local=newLocal();assert.equal(local.players.length,2);
 for(let i=0;i<160;i++)tickLocal(local,[{dir:1,jump:i%12<3},{dir:1,jump:i%14<3}],1/60);
 assert.equal(local.level,0,'local gate also requires the full objective');
 for(let n=2;n<=5;n++)for(let i=0;i<6;i++){
  const s=stageAt(i,n);assert.equal(s.pads.length,n);
  if(s.stretch)assert.ok(s.stretch>0);
 }
 const prediction=advancePosition({id:'p',x:110,y:522,vx:0,vy:0,ground:true,face:1,jumpHeld:false}, {dir:1,jump:false},1/60,stageAt(0,2));
 assert.ok(prediction.x>110,'first input frame predicts actual movement');
 console.log('Client prediction and offline co-op: OK');
}finally{Date.now=realNow;}
