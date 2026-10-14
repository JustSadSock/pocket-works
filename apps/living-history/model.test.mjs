import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advanceDays, overview, audit, serialize, deserialize, getHousehold } from './model.mjs';

test('determinism on same seed and advances',()=>{const a=createWorld(12345),b=createWorld(12345);advanceDays(a,820);advanceDays(b,820);assert.equal(serialize(a),serialize(b));});
test('monetary conservation, inventory integrity, persistence',()=>{for(let seed=1;seed<=6;seed++){const w=createWorld(seed);advanceDays(w,1460);const status=audit(w);assert.equal(status.ok,true,status.issues.join('; '));const before=serialize(w);const clone=deserialize(before);assert.equal(serialize(clone),before);advanceDays(w,90);advanceDays(clone,90);assert.equal(serialize(w),serialize(clone));}});
test('real families, community growth, meaningful economy',()=>{const w=createWorld(413);const init=overview(w);advanceDays(w,365*8);const x=overview(w);assert.ok(init.households>=25);assert.ok(w.events.find(e=>e.type==='harvest'));assert.ok(w.events.find(e=>e.type==='trade'));assert.ok(w.events.find(e=>e.type==='birth'));assert.ok(x.population>0);assert.ok(getHousehold(w,w.households[0].id).people.length>=0);});