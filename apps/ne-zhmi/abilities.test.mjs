import test from 'node:test';
import assert from 'node:assert/strict';
import {ABILITIES,operatorAbilities,HOLD_ACTIONS} from './abilities.js';
import {generateCourse,validateCourse} from './course.js';
import {createGame,commandGame,stepGame,FIXED_DT,ROBOT} from './engine.js';
import module,{reset,message} from './server/module.ts';
const crew=n=>Array.from({length:n},(_,i)=>({id:'P'+i,name:'Operator '+i}));
const room=n=>{const players=crew(n),s=module.createRoom({player:players[0]}).state;module.onJoin({state:s,players});return {players,s}};
test('each possible crew size maps one role to exactly one command',()=>{
 for(let n=2;n<=6;n++){const roles=operatorAbilities(n);assert.equal(roles.length,n);assert.equal(new Set(roles.map(r=>r.id)).size,n)}
});
test('energy changes while holding and recharges after release',()=>{
 const s=createGame();commandGame(s,'float',true);for(let i=0;i<120;i++)stepGame(s,FIXED_DT);
 const low=s.energy.float;assert.ok(low<1);
 commandGame(s,'float',false);for(let i=0;i<140;i++)stepGame(s,FIXED_DT);
 assert.ok(s.energy.float>low);
});
test('float increases airtime and brake stops wheels',()=>{
 const a=createGame(),b=createGame();a.ground=false;b.ground=false;a.y=4.5;b.y=4.5;a.vy=0;b.vy=0;
 commandGame(a,'float',true);stepGame(a,FIXED_DT);stepGame(b,FIXED_DT);
 assert.ok(a.vy<b.vy);
 const c=createGame(),d=createGame();c.vx=3.4;d.vx=3.4;
 commandGame(c,'brake',true);for(let i=0;i<12;i++){stepGame(c,FIXED_DT);stepGame(d,FIXED_DT)}
 assert.ok(c.vx<d.vx*.5);
});
test('push has real impulse and cooldown',()=>{
 const s=createGame();s.vx=0;assert.equal(commandGame(s,'push'),'push');
 assert.ok(s.vx>4);assert.equal(s.pushes,1);assert.equal(commandGame(s,'push'),'cooldown');
});
test('magnet pulls cargo when nearby',()=>{
 const level=generateCourse(303,5,5);
 if(!level.devices.some(d=>d.type==='cargo')) {
   level.devices.push({type:'cargo',x:5.5,w:.48,padX:7.5});
 }
 const s=createGame(level);s.x=4.3;s.y=6.04;s.cargo[0].x=5.5;s.cargo[0].vx=0;
 commandGame(s,'magnet',true);
 stepGame(s,FIXED_DT);
 assert.ok(s.cargo[0].vx<0);
});
test('six roles are enforced by authoritative server',()=>{
 const {players,s}=room(6);message(s,players[0],{type:'start'});
 assert.deepEqual(s.roles,players.map(p=>p.id));
 for(let i=2;i<6;i++){
  const ability=ABILITIES[i];
  const invalid=message(s,players[(i+1)%6],{type:'input',round:s.round,seq:1,action:ability.id,pressed:true});
  assert.equal(invalid.length,0);
  const correct=message(s,players[i],{type:'input',round:s.round,seq:1,action:ability.id,pressed:true});
  assert.ok(correct.length>0,ability.id);
 }
 assert.equal(s.robot.held.magnet,true);
 assert.equal(s.robot.held.brake,true);
 assert.equal(s.robot.held.float,true);
 assert.equal(s.robot.pushes,1);
});
test('server releases all held keys on operator timeout and resumes with six pulses',()=>{
 const {players,s}=room(6),base=Date.now();reset(s,base);
 message(s,players[2],{type:'input',action:'magnet',pressed:true,round:s.round,seq:1},base+5);
 message(s,players[5],{type:'input',action:'float',pressed:true,round:s.round,seq:1},base+5);
 assert.equal(s.robot.held.float,true);
 message(s,players[0],{type:'pulse'},base+2000);
 assert.equal(s.hold,true);
 assert.equal(s.robot.held.magnet,false);
 assert.equal(s.robot.held.float,false);
 for(let i=1;i<6;i++)message(s,players[i],{type:'pulse'},base+2050);
 assert.equal(s.hold,false);
});
test('new procedural devices require corresponding crew size',()=>{
 const required={'mag-rail':3,'timing-press':4,'cargo-switch':5,'float-gap':6};
 for(let count=2;count<=6;count++)for(let seed=1;seed<=400;seed++){
  const c=generateCourse(seed,5,count);
  assert.equal(validateCourse(c),true,'seed '+seed);
  for(const section of c.sections)assert.ok(!required[section.kind]||required[section.kind]<=count);
 }
});
test('hold packets must explicitly carry a boolean and old replay does not toggle',()=>{
 const {players,s}=room(6);message(s,players[0],{type:'start'});
 message(s,players[2],{type:'input',action:'magnet',round:s.round,seq:1});
 assert.equal(s.robot.held.magnet,false);
 message(s,players[2],{type:'input',action:'magnet',round:s.round,seq:1,pressed:true});
 assert.equal(s.robot.held.magnet,true);
 message(s,players[2],{type:'input',action:'magnet',round:s.round,seq:1,pressed:false});
 assert.equal(s.robot.held.magnet,true);
 message(s,players[2],{type:'input',action:'magnet',round:s.round,seq:2,pressed:false});
 assert.equal(s.robot.held.magnet,false);
});

test('exhausted held ability releases and cannot stutter at the energy boundary',()=>{
 const s=createGame();
 assert.equal(commandGame(s,'float',true),'float-on');
 for(let i=0;i<800&&s.held.float;i++)stepGame(s,FIXED_DT);
 assert.equal(s.held.float,false);
 const energy=s.energy.float;
 assert.equal(energy,0);
 assert.equal(commandGame(s,'float',true),'empty');
 for(let i=0;i<120;i++)stepGame(s,FIXED_DT);
 assert.ok(s.energy.float>energy);
 assert.equal(commandGame(s,'float',true),'float-on');
});
