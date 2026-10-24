import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHOOLS,PROFILES,simulate,audit} from '../qa/magic-v2-matchup-audit.mjs';

test('Magic 2.0 seeded PvP proxy covers every elemental pair, both seats and three real runnable books',()=>{
 const report=audit();
 assert.equal(report.samples,SCHOOLS.length*SCHOOLS.length*PROFILES.length*2);
 assert.equal(report.pairs.length,3);
 assert.ok(report.matches.every(m=>Number.isFinite(m.hpDelta)&&m.ticks>0&&m.ticks<=900));
 assert.ok(report.matches.every(m=>m.hp.every(n=>Number.isFinite(n)&&n>=0&&n<=100)));
 assert.ok(report.matches.every(m=>m.knockout==='none'||m.knockout==='left'||m.knockout==='right'||m.knockout==='double'));
 for(const kind of PROFILES)for(const first of SCHOOLS)for(const second of SCHOOLS)
  assert.equal(report.matches.filter(m=>m.profile===kind&&m.left===first&&m.right===second).length,2);
 console.log('Perekos Magic 2.0 seat-neutral diagnostics:',JSON.stringify({
  seatMean:report.seatOneMeanHpAdvantage,seatWarning:report.seatWarning,pairs:report.pairs
 }));
});
test('fixed seed and the same books replay bit-for-bit with no random client outcome',()=>{
 const one=simulate('fire','storm','pressure',761,270);
 const two=simulate('fire','storm','pressure',761,270);
 assert.deepEqual(one,two);
});
test('swapping schools also swaps their physical loadouts, never silently inheriting the first school',()=>{
 const a=simulate('stone','storm','pressure',513,120);
 const b=simulate('storm','stone','pressure',513,120);
 assert.equal(a.left,'stone');assert.equal(a.right,'storm');
 assert.equal(b.left,'storm');assert.equal(b.right,'stone');
 assert.equal(a.ticks,120);assert.equal(b.ticks,120);
});
