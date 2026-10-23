import test from 'node:test';
import assert from 'node:assert/strict';
import module, { reset, message, ROBOT, LEVEL, createGame, generateCourse } from './server/module.ts';
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
test('host starts a procedural level with seed persisted across sync',()=>{
 const s=setup();send(s,host,{type:'start'});
 assert.equal(s.phase,'play');
 assert.equal(s.robot.level.sections.length,5);
 assert.ok(s.robot.level.platforms.length>=6);
 const copy=JSON.parse(JSON.stringify(s.robot.level));
 const events=send(s,guest,{type:'sync'});assert.deepEqual(events[0].payload.robot.level,copy);
 send(s,host,{type:'restart'});assert.notDeepEqual(s.robot.level.sections,copy.sections);
});
test('known benchmark course remains completable over PocketNet',()=>{
 const s=setup(),base=Date.now();reset(s,base);
 s.robot=createGame(LEVEL);
 let a=false,b=false,win=false;
 for(let i=1;i<900;i++){
   const now=base+i*16;
   if(!a&&s.robot.x>4.1){message(s,host,{type:'input',round:s.round,seq:1,action:'jump'},now);a=true;}
   if(!b&&s.robot.x>11.9&&s.robot.ground){message(s,host,{type:'input',round:s.round,seq:2,action:'jump'},now);b=true;}
   message(s,host,{type:'pulse'},now);
   message(s,guest,{type:'pulse'},now);
   if(s.phase==='won'){win=true;break;}
 }
 assert.equal(win,true);assert.equal(s.robot.respawns,0);
});

test('terminal victory bypasses throttled position updates and reaches both peers',()=>{
 const s=setup(),base=Date.now();reset(s,base);
 s.robot.x=s.robot.level.goal+.02;s.robot.y=6.5-ROBOT.halfHeight;s.robot.ground=true;
 s.lastBroadcast=base+129;s.lastClock=base+119;
 s.signals={H:base+129,G:base+129};
 const events=message(s,host,{type:'pulse'},base+130);
 assert.equal(s.phase,'won');
 assert.equal(events.length,1);
 assert.equal(events[0].type,'state');
 assert.equal(events[0].payload.phase,'won');
 assert.equal(events[0].to,undefined);
});

test('generated geometry, not the legacy arena, supports physical landings',()=>{
 const s=setup(),now=Date.now();reset(s,now);
 const next=s.robot.level.platforms[s.robot.level.platforms.length-1];
 const l=s.robot.level;s.robot.x=l.goal+.01;s.robot.y=next.y-ROBOT.halfHeight;
 s.robot.ground=true;s.lastClock=now+110;s.signals={H:now+110,G:now+110};
 const e=message(s,host,{type:'pulse'},now+120);
 assert.equal(s.phase,'won');assert.equal(e[0].payload.phase,'won');
});
