import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,advanceDays,audit,deserialize,serialize,storageCapacity} from './model.js';
import {CRAFT_GOODS,craftOpportunities,craftDemand,craftMaterialStocks,craftAudit} from './crafts.js';

test('workshops evaluate real household demand without mutation or arbitrary output',()=>{
 const world=createWorld(413),before=serialize(world);
 assert.ok(!Object.keys(CRAFT_GOODS).includes('iron'),'no iron is mined or minted by this version');
 for(const h of world.households){
  const options=craftOpportunities(world,h);
  assert.ok(options.every(x=>x.score>0&&['boards','chests','cloth'].includes(x.good)));
  for(const good of ['boards','chests','cloth','wool'])assert.ok(craftDemand(world,h,good)>=0);
 }
 assert.equal(serialize(world),before);
 assert.ok(audit(world).ok);
});

test('physical boards become chests, increase storage and are not free timber',()=>{
 const s=createWorld(413),base=storageCapacity(s.households[0],s);
 advanceDays(s,55);
 assert.ok((s.stats.craftItems||0)>0,'work occurs, it is not displayed without production');
 assert.ok((s.stats.craftWoodWaste||0)>0,'wood processing physically sheds material');
 assert.ok(craftMaterialStocks(s).boards+craftMaterialStocks(s).chests>0);
 assert.ok(s.households.some(h=>(h.chests||0)>0&&storageCapacity(h,s)>storageCapacity({...h,chests:0},s)));
 assert.ok(s.people.some(p=>p.workDays?.craft>0),'the producing household consumes a real person's time');
 const check=audit(s);assert.ok(check.ok,check.issues.join('; '));
});

test('separate shepherds, carriers, weavers and customers work through the existing world economy',()=>{
 const s=createWorld(413);
 advanceDays(s,215);
 const woolTrades=s.events.filter(e=>e.type==='craft-trade'&&e.facts?.good==='wool');
 assert.ok(woolTrades.length>0,'raw wool must reach other household workshops');
 assert.ok((s.stats.craftWoolWaste||0)>0,'weaving consumes real unspun wool');
 assert.ok(craftMaterialStocks(s).cloth>0,'cloth must appear in households or transit');
 assert.ok(s.stats.craftSales>0,'buyers really pay sellers');
 assert.ok(s.households.some(h=>h.craftSpecialty&&h.lastCommercialSaleDay!==undefined));
 assert.ok(s.people.some(p=>p.skill?.craft>0&&p.workDays?.craft>0));
 for(const t of s.shipments.filter(t=>t.kind==='craft')){
  assert.ok(t.carrierId&&t.day>s.day&&t.route?.length>=2);
  assert.ok(['boards','chests','cloth','wool'].includes(t.good));
 }
 const check=audit(s);assert.ok(check.ok,check.issues.join('; '));
 const snapshot=serialize(s),a=deserialize(snapshot),b=deserialize(snapshot);
 advanceDays(a,18);for(let i=0;i<18;i++)advanceDays(b,1);
 assert.equal(serialize(a),serialize(b),'fixed-day and single-day replay must give identical shipments and output');
 assert.ok(audit(a).ok,audit(a).issues.join('; '));
});

test('legacy village saves migrate without inventing stocks, skills or trade',()=>{
 const old=JSON.parse(serialize(createWorld(7777)));
 for(const h of old.households){delete h.boards;delete h.chests;delete h.cloth;delete h.craftSpecialty;}
 const restored=deserialize(JSON.stringify(old));
 assert.ok(restored.households.every(h=>h.boards===0&&h.chests===0&&h.cloth===0));
 assert.equal(craftMaterialStocks(restored).wood,0);
 assert.equal(craftMaterialStocks(restored).wool,0);
 assert.ok(audit(restored).ok);
 advanceDays(restored,22);
 assert.ok(audit(restored).ok,audit(restored).issues.join('; '));
});

test('craft audits reject fabricated cargo and negative inventory',()=>{
 const s=createWorld(413),h=s.households[0];h.boards=-3;
 assert.ok(craftAudit(s).some(x=>x.includes('boards')));
 h.boards=0;
 s.shipments.push({id:999999,kind:'phantom',good:'cloth',amount:10,cost:0,day:s.day+1});
 assert.ok(craftAudit(s).some(x=>x.includes('груз')));
 assert.ok(!audit(s).ok);
});

test('map workshop marks and household record exist for actual supply chains',()=>{
 const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 assert.match(app,/h\.craftSpecialty&&residents\.has/);
 assert.match(app,/В пути/);
 assert.match(app,/p\.job==='craft'/);
 assert.match(css,/\.craft-household/);
});
