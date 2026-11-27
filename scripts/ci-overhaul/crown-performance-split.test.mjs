import test from 'node:test';
import assert from 'node:assert/strict';
import {splitReport,rejoinReport} from './crown-performance-split.mjs';
const data=['coercive-subjugation','independence'].map(name=>({name,seed:'balance-20-2',days:1800,ms:12,samples:[{day:0},{day:450},{day:900},{day:1350},{day:1800}],wars:[]}));
test('all report values survive exact split and rejoin, metrics do not appear in gameplay',()=>{
 const s=splitReport('balance-targeted-3.json',data);
 assert.equal(s.measurements.length,2);assert.equal(s.scenarios,2);assert.equal(s.semantic[0].ms,undefined);
 assert.deepEqual(rejoinReport(s),data);
 for(const x of [{...s,measurements:s.measurements.slice(1)},{...s,measurements:[...s.measurements,s.measurements[0]]},{...s,semantic:[{...s.semantic[0],ms:100},s.semantic[1]]}])assert.throws(()=>rejoinReport(x));
});
test('unrecognized report or incomplete original scenarios fails',()=>{
 assert.throws(()=>splitReport('other.json',data));assert.throws(()=>splitReport('balance-targeted-3.json',data.slice(1)));
});
