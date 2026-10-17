import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,audit,serialize,deserialize,SIZE} from './model.js';

const sum=arr=>Math.round(arr.reduce((n,v)=>n+v,0)*100)/100;
const woodland=s=>({standing:sum(s.forest),harvested:s.stats.woodlandFelled||0,
 regrown:s.stats.woodlandRegrown||0,waste:s.stats.woodlandWaste||0});
const occupied=s=>s.usage.reduce((n,v)=>n+(v>0?1:0),0);

test('founding farmland, homes and crofts are historically open, not secretly standing forest',()=>{
 for(const seed of [413,9001,43821]){
  const s=createWorld(seed);
  assert.ok(occupied(s)>250, 'actual cadastral landscape present');
  assert.ok(s.stats.foundingForestCleared>0,'initial landscape includes historical clearing');
  assert.equal(s.stats.woodlandFelled,0,'pre-foundation clearing is not a new wood harvest');
  assert.equal(s.stats.woodlandWaste,0);
  assert.equal(woodland(s).standing,s.economy.woodlandInitial);
  for(let i=0;i<s.usage.length;i++)if(s.usage[i]>0)assert.equal(s.forest[i],0,'field, home or croft may not retain forest');
  assert.ok(audit(s).ok,audit(s).issues.slice(0,5).join('; '));
 }
});

test('a real household forest supply reduces trees and credits a conserved household inventory',()=>{
 const s=createWorld(413),start=woodland(s);
 advanceDays(s,165);
 const after=woodland(s),reported=audit(s);
 assert.ok(after.harvested>start.harvested,'some households actually harvest nearby trees for wood');
 assert.ok(after.standing<start.standing+after.regrown);
 assert.equal(after.waste,0,'normal logging stock is not logged as new field clearing waste');
 assert.ok(reported.ok,reported.issues.join('; '));
});

test('standing woodland has a full physical balance independent of household logs and crop inventory',()=>{
 const s=createWorld(9001);
 for(let y=0;y<5;y++){advanceDays(s,365);const a=audit(s);assert.ok(a.ok,a.issues.slice(0,5).join('; '));}
 const w=woodland(s);
 assert.ok(w.regrown>0,'wildland regrows');
 assert.ok(w.harvested>0,'actual lumberjacks harvest');
 assert.ok(Math.abs(w.standing-(s.economy.woodlandInitial+w.regrown-w.harvested))<.56);
 const tampered=deserialize(serialize(s)),cell=tampered.usage.findIndex((u,i)=>u===0&&tampered.forest[i]>15);
 assert.ok(cell>=0);
 tampered.forest[cell]+=28;
 assert.ok(audit(tampered).issues.some(x=>x.includes('Баланс стоящего леса')),'hidden tree creation is rejected');
});

test('old saved worlds upgrade existing wooded plots without granting anyone free timber',()=>{
 const base=createWorld(413);advanceDays(base,48);
 const old=JSON.parse(serialize(base)),sample=old.households[0];
 const field=sample.fields[0],croft=sample.croft[0],house=sample.y*SIZE+sample.x;
 const before=old.households.map(h=>h.wood),economicWood=old.economy.woodInitial;
 for(const cell of [field,croft,house])old.forest[cell]=275;
 delete old.economy.woodlandInitial;
 for(const key of ['woodlandFelled','woodlandRegrown','woodlandWaste'])delete old.stats[key];
 const normalized=deserialize(JSON.stringify(old));
 assert.equal(normalized.stats.legacyCanopyCorrected,825);
 for(const i of [field,croft,house])assert.equal(normalized.forest[i],0);
 assert.deepEqual(normalized.households.map(h=>h.wood),before);
 assert.equal(normalized.economy.woodInitial,economicWood);
 assert.ok(audit(normalized).ok,audit(normalized).issues.slice(0,5).join('; '));
 const copy=deserialize(serialize(normalized));
 assert.equal(serialize(copy),serialize(normalized));
 advanceDays(normalized,30);advanceDays(copy,30);
 assert.equal(serialize(normalized),serialize(copy),'upgraded saves continue deterministically');
});

test('woodland clearance requires genuine wood workers before land can become farmland',()=>{
 const s=createWorld(413);advanceDays(s,310);
 let pick=null;
 for(const h of s.households){
  if(h.members.filter(id=>s.people.find(p=>p.id===id&&p.alive&&p.age>=18&&p.health>40)).length===0||h.wood<24)continue;
  for(let dy=-14;dy<=14&&!pick;dy++)for(let dx=-14;dx<=14;dx++){
   const x=h.x+dx,y=h.y+dy;if(x<2||y<2||x>=SIZE-2||y>=SIZE-2)continue;
   const i=y*SIZE+x;
   if(s.terrain[i]===0&&s.usage[i]===0&&s.forest[i]>=90&&s.commons[i]===h.communityId){
    pick={h,cell:i};break;
   }
  }
  if(pick)break;
 }
 assert.ok(pick,'found an actual woodland commons near a household');
 const {h,cell}=pick,old=s.forest[cell],start=s.stats.woodlandFelled;
 // Inject an approved, paid claim into the real progress engine rather than
 // creating an imaginary resource or directly flipping the usage to farmland.
 h.wood=Math.round((h.wood-24)*100)/100;
 s.stats.landWood=(s.stats.landWood||0)+24;
 h.landProject={cell,days:0,costWood:24};
 let sawWork=false,finished=false;
 for(let d=0;d<130;d++){
  advanceDays(s,1);
  if(s.forest[cell]<old)sawWork=true;
  if(s.usage[cell]===2){finished=true;break;}
 }
 assert.ok(sawWork,'workers must physically remove trees');
 assert.ok(s.stats.woodlandFelled>start);
 assert.equal(s.forest[cell],0,'farmland must not conceal standing timber');
 assert.ok(finished,'the assigned household can complete the cleared tract');
 assert.ok(h.fields.includes(cell));
 assert.ok(s.stats.woodlandWaste>0,'nonmerchantable branches and roots are measured');
 const a=audit(s);assert.ok(a.ok,a.issues.slice(0,5).join('; '));
});

test('five-year forest management preserves material accounts across save/load cycles',()=>{
 const s=createWorld(43821);
 for(let y=0;y<5;y++)advanceDays(s,365);
 const snapshot=serialize(s),r=deserialize(snapshot);
 assert.equal(snapshot,serialize(r));
 advanceDays(s,120);advanceDays(r,120);
 assert.equal(serialize(s),serialize(r));
 const a=audit(s);
 assert.ok(a.ok,a.issues.slice(0,5).join('; '));
});
