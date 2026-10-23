import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCourse,validateCourse} from './course.js';
import {ABILITIES} from './abilities.js';
import {createGame,commandGame,stepGame,FIXED_DT,ROBOT} from './engine.js';
import module,{message,reset,createGame as serverGame,
 commandGame as serverCommand,stepGame as serverStep,
 generateCourse as serverCourse} from './server/module.ts';
import {hydrateOnlineSnapshot,acceptOnlineSnapshot} from './online-flow.js';

const crew=n=>Array.from({length:n},(_,i)=>({id:i?'U'+i:'H',name:'Operator '+i}));
const room=n=>{const people=crew(n),s=module.createRoom({player:people[0]}).state;module.onJoin({state:s,players:people});return {s,people}};
const finiteGame=s=>['x','y','vx','vy','rotation','t','checkpoint','cooldown','pushCooldown'].every(k=>Number.isFinite(s[k]));

test('cargo collision does not teleport Boltik to opposite side when approaching from right',()=>{
 const level={start:2,goal:20,width:22,checkpoint:12,
  platforms:[{x:0,y:6.5,w:22,h:1.5}],devices:[{type:'cargo',x:6,w:.48,padX:12}]};
 const right=createGame(level);right.x=6.4;right.vx=-3.4;right.dir=-1;
 stepGame(right,FIXED_DT);
 assert.ok(right.x>=6.4,'cargo collision from right must not teleport left');
 assert.equal(right.vx,0);
 const left=createGame(level);left.x=5.6;left.vx=3.4;
 stepGame(left,FIXED_DT);
 assert.ok(left.x<=5.6,'cargo collision from left must not teleport right');
 assert.equal(left.vx,0);
});
test('piston allows short safe recovery on a checkpoint respawn',()=>{
 const level={start:1.15,goal:14,checkpoint:6.5,width:18,
  checkpointSpawn:{x:6.5,y:6.04},
  platforms:[{x:0,y:6.5,w:18,h:1.5}],
  devices:[{type:'press',x:6.15,w:.8,phase:Math.PI/2}]};
 const s=createGame(level);
 s.x=6.4;s.checkpoint=6.5;s.y=6.04;s.vx=0;
 assert.ok(stepGame(s,FIXED_DT).includes('hazard'));
 assert.equal(s.respawns,1);
 assert.ok(s.hazardCooldown>=.6);
 for(let i=0;i<25;i++)stepGame(s,FIXED_DT);
 assert.equal(s.respawns,1,'active piston must not kill freshly respawned robot');
});
test('recovering an incomplete lobby role table seats all six people',()=>{
 const {s,people}=room(6);s.roles=['H','U1'];
 message(s,people[0],{type:'start'});
 assert.equal(s.phase,'play');
 assert.deepEqual(s.roles,people.map(p=>p.id));
 const start=s.robot.t,now=s.lastClock+150;
 for(const p of people)message(s,p,{type:'pulse'},now);
 assert.ok(s.robot.t>start);assert.equal(s.hold,false);
});
test('2400 generated courses remain finite and never require unavailable roles',()=>{
 const roles=['jump','reverse','magnet','brake','push','float'];
 const special={'mag-rail':'magnet','timing-press':'brake','cargo-switch':'push','float-gap':'float'};
 for(let count=2;count<=6;count++)for(let seed=1;seed<=480;seed++){
  const level=generateCourse(seed,5,count);
  assert.ok(validateCourse(level),'invalid geometry crew '+count+' seed '+seed);
  assert.deepEqual(generateCourse(seed,5,count),level);
  assert.ok(level.sections.every(s=>!special[s.kind]||roles.slice(0,count).includes(special[s.kind])));
  const game=createGame(level);
  for(let i=0;i<150;i++){
   if(i===18)commandGame(game,'jump');
   if(i===63&&count>=3)commandGame(game,'magnet',true);
   if(i===86&&count>=3)commandGame(game,'magnet',false);
   if(i===110&&count>=6)commandGame(game,'float',true);
   stepGame(game,FIXED_DT);
   assert.ok(finiteGame(game),'invalid physics crew '+count+' seed '+seed+' tick '+i);
   assert.ok(game.x>=ROBOT.halfWidth&&game.x<=level.width-ROBOT.halfWidth);
  }
 }
});
test('local and pinned PocketNet simulators remain bit-exact under mixed six-button inputs',()=>{
 for(let count=2;count<=6;count++)for(let seed=1;seed<=60;seed++){
  const a=createGame(generateCourse(seed*19,5,count));
  const b=serverGame(serverCourse(seed*19,5,count));
  for(let t=0;t<550;t++){
   const mode=t%173;
   const action=mode===4?'jump':mode===35?'reverse':mode===55?'push':
    mode===65?'magnet':mode===80?'brake':mode===100?'float':null;
   if(action&&ABILITIES.findIndex(v=>v.id===action)<count){
    commandGame(a,action,true);serverCommand(b,action,true);
   }
   for(const [offset,key] of [[78,'magnet'],[94,'brake'],[124,'float']]){
    if(mode===offset&&ABILITIES.findIndex(v=>v.id===key)<count){
     commandGame(a,key,false);serverCommand(b,key,false);
    }
   }
   const ea=stepGame(a,FIXED_DT),eb=serverStep(b,FIXED_DT);
   assert.deepEqual(eb,ea,'events diverge at '+seed+'/'+count+'/'+t);
   assert.deepEqual(b,a,'physics diverges at '+seed+'/'+count+'/'+t);
  }
 }
});
test('compact snapshots omit immutable level and keep full resync possible',()=>{
 const {s,people}=room(6);
 message(s,people[0],{type:'start'});
 const first=message(s,people[4],{type:'sync'})[0].payload;
 assert.ok(first.robot.level);
 const now=s.lastClock+200;s.lastBroadcast=0;
 const movement=message(s,people[0],{type:'pulse'},now).find(e=>e.type==='state')?.payload;
 assert.ok(movement);assert.equal(movement.robot.level,undefined);
 const hydrated=hydrateOnlineSnapshot(first,movement);
 assert.deepEqual(hydrated.robot.level,first.robot.level);
 assert.equal(acceptOnlineSnapshot(first,hydrated),true);
 const full=Buffer.byteLength(JSON.stringify(first));
 const compact=Buffer.byteLength(JSON.stringify(movement));
 assert.ok(compact<full*.75,'compact size '+compact+'/'+full);
 assert.ok(message(s,people[4],{type:'sync'},now+10)[0].payload.robot.level);
});
test('new rounds and terminal results include complete level; old data cannot hydrate',()=>{
 const {s,people}=room(2);
 message(s,people[0],{type:'start'});
 const old=message(s,people[0],{type:'sync'})[0].payload;
 const next=message(s,people[0],{type:'restart'})[0].payload;
 assert.ok(next.robot.level);assert.equal(next.round,old.round+1);
 assert.equal(hydrateOnlineSnapshot(old,{...next,robot:{x:2,t:0}}),null);
 assert.equal(acceptOnlineSnapshot(next,old),false);
});
test('invalid client messages and stale sequences cannot spoof movement',()=>{
 const {s,people}=room(6);
 message(s,people[0],{type:'start'});
 const round=s.round,jumps=s.robot.jumps,reverses=s.robot.reverses;
 for(let i=1;i<6;i++)message(s,people[i],{type:'input',action:'jump',round,seq:1,robot:{x:999}});
 assert.equal(s.robot.jumps,jumps);
 message(s,people[0],{type:'input',action:'jump',round,seq:1});
 const buffer=s.robot.buffer;
 message(s,people[0],{type:'input',action:'jump',round,seq:1});
 assert.equal(s.robot.buffer,buffer);
 message(s,people[1],{type:'input',action:'reverse',round:round-1,seq:2});
 message(s,people[1],{type:'input',action:'reverse',round,seq:-2});
 assert.equal(s.robot.reverses,reverses);
});
test('server withstands 25-minute six-player session with stalled and resumed peers',()=>{
 const {s,people}=room(6),clock=Date.now();reset(s,clock);
 const level={start:1.15,goal:5500,width:6000,checkpoint:2500,
  platforms:[{x:0,y:6.5,w:6000,h:1.5}],devices:[]};
 s.robot=serverGame(level);
 let now=clock,stalls=0,holds=0;
 for(let i=0;i<12000;i++){
  const gap=i>0&&i%293===0?1750:120;now+=gap;
  if(gap>1000)stalls++;
  const role=i%people.length;
  if(i%43===0){
   const action=ABILITIES[role]?.id;
   message(s,people[role],{type:'input',round:s.round,seq:i+1,action,pressed:true},now);
   if(['magnet','brake','float'].includes(action))holds++;
  }
  for(const p of people)message(s,p,{type:'pulse'},now);
  if(i%177===0)message(s,people[0],{type:'sync'},now);
  assert.ok(finiteGame(s.robot));
  assert.ok(s.robot.respawns>=0);
  assert.ok(s.remainder>=0&&s.remainder<FIXED_DT+.001);
 }
 assert.ok(stalls>0&&holds>0);
 assert.equal(s.phase,'play');
 assert.ok(s.revision>1);
});
