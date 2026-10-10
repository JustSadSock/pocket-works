import test from 'node:test';
import assert from 'node:assert/strict';
import {HOUSES,REGIONS,CASES,TINCTURES} from '../data.js';
import {isValidArms,shieldSvg,signature} from '../heraldry.js';
test('all initial houses own valid, distinct arms',()=>{
 assert.equal(HOUSES.length,10);
 const signatures=new Set();
 for(const house of HOUSES){assert.equal(isValidArms(house.arms).ok,true);signatures.add(signature(house.arms));assert.match(shieldSvg(house.arms),/<svg/)}
 assert.equal(signatures.size,HOUSES.length);
});
test('tincture rules forbid two colors or two metals',()=>{
 assert.equal(isValidArms({field:'azure',chargeTone:'gules',charge:'rose',division:'plain'}).ok,false);
 assert.equal(isValidArms({field:'argent',chargeTone:'or',charge:'rose',division:'plain'}).ok,false);
 assert.equal(isValidArms({field:'azure',chargeTone:'or',charge:'rose',division:'plain'}).ok,true);
 assert.equal(isValidArms({field:'or',chargeTone:'azure',charge:'key',division:'bend'}).ok,true);
});
test('full campaign has coherent cases and bounded references',()=>{
 assert.equal(CASES.length,12);assert.equal(REGIONS.length,10);
 const ids=new Set(HOUSES.map(x=>x.id));
 for(const [i,c] of CASES.entries()){
  assert.equal(c.options.length,3,'case '+i);
  assert.equal(c.clues.length,2,'case '+i);
  assert.ok(c.region>=0&&c.region<REGIONS.length);
  assert.equal(c.year,1287+i*2);
  c.options.forEach(o=>{assert.ok(ids.has(o.house));assert.ok(o.law>=-2&&o.law<=2);assert.ok(o.label&&o.result)});
  c.claimants.forEach(id=>assert.ok(ids.has(id)));
  assert.ok(c.options.some(o=>o.law>0),'case '+i+' must allow a legal judgment');
 }
 REGIONS.forEach(r=>{assert.ok(ids.has(r.owner));assert.ok(r.path&&r.name)});
 assert.equal(Object.keys(TINCTURES).length,7);
});
