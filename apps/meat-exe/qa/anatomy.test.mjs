import test from 'node:test';
import assert from 'node:assert/strict';
import {setSeed,generateOrgan,getTissueNodes,getOrganProfile,CELLS_PER_CHUNK,edgeCoord} from '../organGen.js';
import {hitRay,directionFromAim} from '../combat.js';
import {validateRun} from '../stability.js';
const key=(x,y)=>x+','+y,dirs=[[1,0],[-1,0],[0,1],[0,-1]];
function connected(cells,blocked=new Set()){
 const open=new Set(cells.map(c=>key(c.x,c.y)).filter(k=>!blocked.has(k)));
 const start=open.values().next().value;if(!start)return open.size===0;
 const seen=new Set([start]),todo=[start];
 for(let i=0;i<todo.length;i++){const [x,y]=todo[i].split(',').map(Number);
  for(const [dx,dy] of dirs){const k=key(x+dx,y+dy);
   if(open.has(k)&&!seen.has(k)){seen.add(k);todo.push(k);}}}
 return seen.size===open.size;
}
test('a thousand deterministic seed sections stay fully traversable',()=>{
 const kinds=new Set(),gated=new Set();
 for(let seed=0;seed<1000;seed++){
  setSeed(seed*65537+413);
  const cells=generateOrgan(0,0),again=generateOrgan(0,0);
  assert.deepEqual(cells,again,'seed '+seed+' repeat mismatch');
  kinds.add(getOrganProfile(0,0).archetype);
  assert.ok(cells.length>=20&&cells.length<=64);
  assert.ok(connected(cells),'disconnected open chamber seed '+seed);
  const gates=getTissueNodes(0,0);
  assert.deepEqual(gates,getTissueNodes(0,0));
  if(gates.length)gated.add(seed);
  for(const node of gates){
   assert.ok(cells.some(c=>c.x===node.x&&c.y===node.z));
   assert.ok(connected(cells,new Set([node.id])),'blocked membrane softlock '+seed);
  }
 }
 assert.equal(kinds.size,3);
 assert.ok(gated.size>750,'at least three quarters of sectors should have a tissue node');
});
test('portal pairs always align and remain reachable while glands are intact',()=>{
 for(let seed=0;seed<100;seed++){
  setSeed(seed*13471+2);
  const combined=[];
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
    const cells=generateOrgan(x,y),blocked=new Set(getTissueNodes(x,y).map(t=>t.id));
    assert.ok(connected(cells,blocked),'isolated chamber '+seed+' '+x+','+y);
    combined.push(...cells.filter(c=>!blocked.has(key(c.x,c.y))));
    const e=edgeCoord(x,y,1),s=edgeCoord(x,y,2);
    assert.ok(cells.some(c=>c.x===x*8+7&&c.y===y*8+e));
    assert.ok(cells.some(c=>c.x===x*8+s&&c.y===y*8+7));
  }
  assert.ok(connected(combined),'multi-sector softlock '+seed);
 }
});
test('tissue blocks gunfire until ruptured; enemies cannot be hit through it',()=>{
 const origin={x:0,y:1.41,z:0},dir=directionFromAim(0,0);
 const mob={x:0,z:-5,type:'crawler',hp:50},tissue={id:'0,-2',x:0,z:-2,hp:100};
 const gateAt=(x,z)=>z< -1.5&&z> -2.5?tissue:null;
 const open=(x,z)=>gateAt(x,z)===null;
 const hit=hitRay(origin,dir,[mob],open,15,gateAt);
 assert.equal(hit.kind,'tissue');assert.equal(hit.tissue.id,tissue.id);
 const post=hitRay(origin,dir,[mob],()=>true,15,()=>null);
 assert.equal(post.kind,'flesh');
});
test('v2 saves migrate with a closed organism, v3 ruptures survive and are sanitized',()=>{
 const old={v:2,seed:413,x:3,z:3,hp:80,maxHp:100,wave:2};
 const v2=validateRun(old);assert.equal(v2.v,3);assert.deepEqual(v2.ruptured,[]);
 const newer=validateRun({...v2,ruptured:['4,5','4,5','not-id','8,-3'],ruptureCount:2,immuneHeat:33,immuneDelay:1.2});
 assert.deepEqual(newer.ruptured,['4,5','8,-3']);assert.equal(newer.immuneHeat,33);
 assert.deepEqual(validateRun(newer),newer);
});
