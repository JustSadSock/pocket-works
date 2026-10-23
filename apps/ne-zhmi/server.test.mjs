import test from 'node:test';
import assert from 'node:assert/strict';
import module, { reset, message } from './server/module.ts';
const host={id:'H',name:'Host'},guest={id:'G',name:'Guest'},intruder={id:'X',name:'X'};
function setup(){const s=module.createRoom({player:host}).state;module.onJoin({state:s,players:[host,guest]});return s}
function send(s,p,cmd){return module.onMessage({state:s,player:p,payload:cmd}).events}
test('two seats, swap host only, start host only',()=>{
 const s=setup();assert.deepEqual(s.roles,['H','G']);
 send(s,guest,{type:'swap'});assert.deepEqual(s.roles,['H','G']);
 send(s,host,{type:'swap'});assert.deepEqual(s.roles,['G','H']);
 send(s,guest,{type:'start'});assert.equal(s.phase,'lobby');
 send(s,host,{type:'start'});assert.equal(s.phase,'play');assert.equal(s.round,1);
 assert.throws(()=>module.onJoin({state:s,players:[host,guest,intruder]}),/room_full/);
});
test('server owns position; unauthorized role and foreign messages are ignored',()=>{
 const s=setup();send(s,host,{type:'start'});const x=s.robot.x;
 send(s,intruder,{type:'input',action:'jump',seq:1,round:1,robot:{x:999}});
 send(s,guest,{type:'input',action:'jump',seq:1,round:1});
 assert.equal(s.robot.x,x);assert.equal(s.robot.buffer,0);assert.equal(s.robot.jumps,0);
 send(s,host,{type:'input',action:'jump',seq:1,round:1});
 assert.ok(s.robot.buffer>0);
});
test('sequence replay and previous-round messages cannot double apply',()=>{
 const s=setup();send(s,host,{type:'start'});
 send(s,guest,{type:'input',action:'reverse',seq:1,round:1});
 assert.equal(s.robot.reverses,1);
 send(s,guest,{type:'input',action:'reverse',seq:1,round:1});
 assert.equal(s.robot.reverses,1);
 send(s,host,{type:'restart'});assert.equal(s.round,2);
 send(s,guest,{type:'input',action:'reverse',seq:2,round:1});
 assert.equal(s.robot.reverses,0);
});
test('pulse advances authoritatively with elapsed server time and caps delayed frame',()=>{
 const s=setup(),base=Date.now();reset(s,base);
 const x=s.robot.x;
 message(s,host,{type:'pulse'},base+100);
 message(s,guest,{type:'pulse'},base+100);
 assert.ok(s.robot.x>x);
 const t=s.robot.t;message(s,host,{type:'pulse'},base+100000);
 assert.ok(s.robot.t-t<.3);
 assert.equal(s.hold,true);
});
test('stalled peer freezes physical world and fresh dual pulse resumes safely',()=>{
 const s=setup(),base=Date.now();reset(s,base);
 message(s,host,{type:'pulse'},base+1600);
 assert.equal(s.hold,true);const x=s.robot.x;
 message(s,guest,{type:'pulse'},base+1650);
 assert.equal(s.hold,false);assert.equal(s.robot.x,x);
 message(s,host,{type:'pulse'},base+1750);assert.ok(s.robot.x>x);
});
test('lost operator returns both to lobby, host succession valid',()=>{
 const s=setup();send(s,host,{type:'start'});
 module.onLeave({state:s,players:[guest]});assert.equal(s.host,'G');
 assert.equal(s.phase,'lobby');assert.deepEqual(s.roles,['G']);
 assert.equal(s.robot.finished,false);
});
test('sync is individually addressed and ignores malformed payload',()=>{
 const s=setup();const events=send(s,guest,{type:'sync'});
 assert.equal(events[0].to,'G');assert.equal(events[0].type,'state');
 assert.deepEqual(send(s,guest,null),[]);
});
test('legitimate 2 jumps win when server advances with stable pulses',()=>{
 const s=setup();const base=Date.now();reset(s,base);
 let one=false,two=false,win=false;
 for(let i=1;i<900;i++){
   const now=base+i*16;
   if(!one&&s.robot.x>4.1){message(s,host,{type:'input',round:s.round,seq:1,action:'jump'},now);one=true;}
   if(!two&&s.robot.x>11.9&&s.robot.ground){message(s,host,{type:'input',round:s.round,seq:2,action:'jump'},now);two=true;}
   message(s,host,{type:'pulse'},now);
   message(s,guest,{type:'pulse'},now);
   if(s.phase==='won'){win=true;break;}
 }
 assert.equal(win,true);assert.equal(s.robot.respawns,0);
});
