import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_SCARS,addScar,sanitizeScars,locateWallWound,scarSurfaceStats} from '../scars.js';
import {TISSUE_MAX,TISSUE_SEAL_DELAY,tissueHit,tissueTick,sanitizeTissueDamage,livingMembraneSignature} from '../tissueLifecycle.js';
import {validateRun} from '../stability.js';

test('real axial wall scars align to impact plane and face the shooter',()=>{
 const right=locateWallWound({x:3.44,y:1.18,z:2.1},{x:1,y:0,z:0});
 const left=locateWallWound({x:3.57,y:1.1,z:2.1},{x:-1,y:0,z:0});
 const back=locateWallWound({x:2.1,y:1.4,z:4.43},{x:0,y:0,z:1});
 assert.equal(right.x,3.5);assert.equal(right.nx,-1);assert.equal(right.nz,0);
 assert.equal(left.x,3.5);assert.equal(left.nx,1);
 assert.equal(back.z,4.5);assert.equal(back.nz,-1);
 assert.equal(locateWallWound({x:2,y:2.7,z:2},{x:1,z:0}),null);
 assert.equal(locateWallWound({x:2,y:1.1,z:2},{x:0,z:0}),null);
});
test('wall/ground scars keep their distinct surface through 9000 shots and legacy reloads',()=>{
 let scars=[{wave:1,x:3,z:4,kind:'blood'}];
 for(let i=0;i<9000;i++){
  const w=1+i%4;
  scars=addScar(scars,w,(i%120)*.4-12,3.5+i%19,'burn',{
    y:.7+(i%5)*.25,nx:i%2?1:0,nz:i%2?0:1
  });
  assert.ok(scars.length<=MAX_SCARS);
 }
 assert.equal(scars.length,MAX_SCARS);
 const again=sanitizeScars(scars);
 assert.deepEqual(again,scars);
 assert.ok(again.every(s=>s.surface==='wall'&&[0,1,-1].includes(s.nx)));
 assert.equal(scarSurfaceStats(again,1).wall+scarSurfaceStats(again,2).wall+
  scarSurfaceStats(again,3).wall+scarSurfaceStats(again,4).wall,MAX_SCARS);
 const old=sanitizeScars([{wave:3,x:3,z:4,kind:'burn'}]);
 assert.deepEqual(old,[{wave:3,x:3,z:4,kind:'burn'}]);
});
test('intact gate regrows only after quiet interval; uninterrupted pressure ruptures permanently',()=>{
 const t={hp:100,sealDelay:0};
 assert.equal(tissueHit(t,30),false);
 assert.equal(t.hp,70);assert.equal(t.sealDelay,TISSUE_SEAL_DELAY);
 for(let i=0;i<55;i++)tissueTick(t,.1);
 assert.equal(t.hp,70);
 tissueTick(t,.1);
 assert.ok(t.hp>70);
 tissueHit(t,25);assert.ok(t.hp<75);
 for(let i=0;i<60;i++)tissueTick(t,.1);
 assert.ok(t.hp>45);
 assert.equal(tissueHit(t,99),true);
 assert.equal(t.hp,0);
 for(let i=0;i<600;i++)tissueTick(t,.1);
 assert.equal(t.hp,0,'destroyed membrane never regenerates');
});
test('real 10-minute fixed step never overflows recovery, and wall marks stay capped',()=>{
 const t={hp:26,sealDelay:TISSUE_SEAL_DELAY};
 for(let i=0;i<60*600;i++)tissueTick(t,1/60);
 assert.equal(t.hp,100);
 const sig=livingMembraneSignature([t,{hp:0},{hp:60,sealDelay:0}]);
 assert.deepEqual(sig,{injured:1,sealing:1,opened:1});
});
test('save migration keeps damaged gates and refuses arbitrary IDs',()=>{
 const sample=[{id:'3:4,5',hp:40,sealDelay:3},
   {id:'3:7,8',hp:120,sealDelay:3},{id:'3:abc',hp:30},
   {id:'2:4,5',hp:40},{id:'3:5,6',hp:90,sealDelay:-100}];
 assert.deepEqual(sanitizeTissueDamage(sample,3),[
   {id:'3:4,5',hp:40,sealDelay:3},{id:'3:5,6',hp:90,sealDelay:0}
 ]);
 const old=validateRun({v:5,seed:413,x:3,z:3,wave:3,hp:100});
 assert.deepEqual(old.tissueIntegrity,[]);
 const v=validateRun({v:5,seed:413,x:3,z:3,wave:3,hp:100,
  scars:[{wave:3,x:4.5,z:5,kind:'burn',surface:'wall',y:1,nx:1,nz:0}],
  tissueIntegrity:sample});
 assert.equal(v.scars[0].surface,'wall');
 assert.equal(v.scars[0].nx,1);
 assert.deepEqual(v.tissueIntegrity,sanitizeTissueDamage(sample,3));
 assert.deepEqual(validateRun(v),v);
});
