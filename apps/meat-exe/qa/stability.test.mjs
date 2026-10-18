import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRun,sweepCircle,deadzone} from '../stability.js';
import {setSeed,generateOrgan,CELLS_PER_CHUNK} from '../organGen.js';
const valid={v:1,seed:413,x:3,z:3,hp:82,maxHp:82,wave:4,score:100,kills:7,toSpawn:3,level:2,weapon:1,
  enemies:[{x:5,z:5,hp:30,type:'crawler'}],pickups:[{x:6,z:6,type:'heal'}]};
test('v1 run upgrades to safe v2 with preserved progression',()=>{
 const s=validateRun(valid);assert.equal(s.v,2);assert.equal(s.wave,4);assert.equal(s.maxHp,82);
 assert.equal(s.weapon,1);assert.equal(s.enemies.length,1);assert.equal(s.pickups[0].type,'heal');
 assert.deepEqual(validateRun(s),s);
});
test('damaged or malicious save values cannot poison the active simulation',()=>{
 assert.equal(validateRun({...valid,hp:NaN}),null);assert.equal(validateRun({...valid,seed:-1}),null);
 assert.equal(validateRun({...valid,x:Infinity}),null);assert.equal(validateRun({...valid,v:400}),null);
 const s=validateRun({...valid,pitch:9,level:Infinity,toSpawn:999,hp:999,
 enemies:[{type:'crawler',x:Infinity,z:1,hp:2},{type:'brute',x:2,z:2,hp:1e10}],
 pickups:[{x:NaN,z:0}]});
 assert.equal(s.hp,82);assert.equal(s.pitch,1.24);assert.equal(s.level,0);
 assert.equal(s.toSpawn,40);assert.equal(s.enemies.length,1);assert.equal(s.enemies[0].hp,500);
 assert.equal(s.pickups.length,0);
});
test('swept dash never tunnels through a thin wall',()=>{
 const floor=(x,z)=>x<.5;
 const p=sweepCircle(0,0,5,0,.2,floor);assert.ok(p.x<.3);assert.ok(p.x>=0);
});
test('collision sweep slides freely along a wall',()=>{
 const floor=(x,z)=>x<.5;
 const p=sweepCircle(0,0,5,2,.2,floor);assert.ok(p.x<.3);assert.ok(p.z>1.8);
});
test('controller deadzone is smooth and finite',()=>{
 assert.equal(deadzone(.1),0);assert.equal(deadzone(NaN),0);
 assert.ok(deadzone(.5)>.3);assert.equal(deadzone(-1),-1);
});
test('movement stays inside generated cells on 60 seeds',()=>{
 for(let seed=0;seed<60;seed++){
   setSeed(seed*321+7);const cache=new Map();
   const floor=(x,z)=>{const a=Math.round(x),b=Math.round(z),cx=Math.floor(a/CELLS_PER_CHUNK),cz=Math.floor(b/CELLS_PER_CHUNK),k=cx+','+cz;
     if(!cache.has(k))cache.set(k,new Set(generateOrgan(cx,cz).map(c=>c.x+','+c.y)));
     return cache.get(k).has(a+','+b);};
   const cells=generateOrgan(0,0),start=cells.find(c=>floor(c.x-.2,c.y-.2)&&floor(c.x+.2,c.y+.2))||cells[0];
   let p={x:start.x,z:start.y};for(let j=0;j<80;j++){
     p=sweepCircle(p.x,p.z,Math.sin(j*13.1)*.71,Math.cos(j*7.3)*.71,.2,floor);
     assert.ok(floor(p.x,p.z),'seed '+seed+' step '+j);
   }
 }
});
