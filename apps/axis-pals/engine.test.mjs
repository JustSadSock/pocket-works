import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {campaign,endless,solve,step,solved,limits,CAMPAIGN_NAMES,DIRECTIONS} from './engine.js';
const source=await readFile(new URL('./server/module.ts',import.meta.url),'utf8');
const {default:module}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('axis move displaces each cargo independently at walls',()=>{
 const l={width:5,height:5,map:['#####','#   #','# # #','#   #','#####'],starts:[{x:1,y:1},{x:3,y:1}],goals:[{x:2,y:1},{x:3,y:1}]};
 const change=step(l,l.starts,'right');
 assert.equal(change.moved,true);assert.deepEqual(change.blocked,[false,true]);assert.deepEqual(change.positions,[{x:2,y:1},{x:3,y:1}]);
 assert.equal(solved(l,change.positions),true);
});
test('every authored campaign and sampled endless shipment is BFS-solvable',()=>{
 const levels=[...CAMPAIGN_NAMES.map((_,i)=>campaign(i)),...Array.from({length:24},(_,i)=>endless(i+1))];
 for(const level of levels){
  assert.equal(level.map.length,level.height);
  assert.ok(level.map.every(row=>row.length===level.width));
  for(const p of [...level.starts,...level.goals])assert.notEqual(level.map[p.y][p.x],'#');
  const solution=solve(level);assert.ok(solution,'unsolvable '+level.name);
  assert.equal(solution.steps,level.optimal);
  let pos=level.starts.map(p=>({...p}));for(const d of solution.path)pos=step(level,pos,d).positions;
  assert.ok(solved(level,pos),'bad solver path '+level.name);
  const c=limits(level.optimal);assert.ok(c.easy>c.medium&&c.medium>c.hard&&c.hard>=level.optimal);
 }
});
test('same seed always generates same warehouse and same solution',()=>{
 for(let i=0;i<8;i++)assert.deepEqual(endless(i+1),endless(i+1));
});
const one={id:'one',name:'Оператор Y'},two={id:'two',name:'Оператор X'},outsider={id:'third',name:'Чужой'};
test('PocketNet host needs two players, rejects a third, and keeps role ownership',()=>{
 const s=module.createRoom({player:one}).state;
 const declined=module.onMessage({state:s,player:one,payload:{type:'start'}});assert.equal(declined.state.phase,'lobby');
 module.onJoin({state:s,players:[one,two]});
 assert.throws(()=>module.onJoin({state:s,players:[one,two,outsider]}),/room_full/);
 module.onMessage({state:s,player:one,payload:{type:'start'}});
 assert.equal(s.phase,'play');assert.deepEqual(s.roles,[one.id,two.id]);
 const used=s.steps;
 module.onMessage({state:s,player:two,payload:{type:'move',direction:'up'}});
 module.onMessage({state:s,player:one,payload:{type:'move',direction:'left'}});
 module.onMessage({state:s,player:outsider,payload:{type:'move',direction:'up'}});
 assert.equal(s.steps,used);
});
test('two authenticated roles can complete a server-authoritative stage',()=>{
 const s=module.createRoom({player:one}).state;module.onJoin({state:s,players:[one,two]});
 module.onMessage({state:s,player:one,payload:{type:'start'}});
 const solution=solve(s.level);
 for(const direction of solution.path){s.lastMove=0;const player=['up','down'].includes(direction)?one:two;module.onMessage({state:s,player,payload:{type:'move',direction}})}
 assert.equal(s.phase,'won');assert.equal(s.steps,solution.steps);
 const winner=module.onMessage({state:s,player:one,payload:{type:'next'}}).state;
 assert.equal(winner.index,1);assert.equal(winner.phase,'play');
});
