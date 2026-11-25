import test from 'node:test';
import assert from 'node:assert/strict';
import {recordCase} from './slice-evidence.js';
test('laboratory visual cases contain actual requested physical states and standard parameters',()=>{
 const c=Object.fromEntries(['infantry','charge','missiles','disorder','withdraw','reserve','ford'].map(id=>[id,recordCase(id)]));
 assert.ok(c.infantry.measure.contacts>=4);assert.ok(c.charge.measure.contacts>=2);assert.ok(c.missiles.measure.shots>0);assert.ok(c.disorder.measure.minCohesion<35&&c.disorder.measure.routed>0);assert.ok(c.withdraw.measure.withdrawn>=3);assert.equal(c.reserve.measure.reserveArrived,true);assert.ok(c.ford.measure.contacts>=2);
 for(const v of Object.values(c)){assert.ok(v.frames.length>2);assert.ok(v.history.length>0);assert.ok(v.project.armies.every(a=>a.units.every(u=>u.customSpec===null)));}
});
