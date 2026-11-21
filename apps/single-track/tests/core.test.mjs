import test from 'node:test';import assert from 'node:assert/strict';import {levels,conflicts,evaluate,optimum,valid} from '../core.mjs';
test('all levels have finite solutions',()=>{for(const l of levels)assert.ok(Number.isFinite(optimum(l)))});
test('overlap and adjacent intervals',()=>{const l=levels[0];assert.equal(conflicts(l,{A:0,B:2}).size,2);assert.equal(conflicts(l,{A:0,B:3,C:7}).size,0);assert.equal(evaluate(l,{A:0,B:3,C:7}).complete,true)});
test('partial and out-of-window schedules cannot finish',()=>{assert.equal(evaluate(levels[0],{A:0}).complete,false);assert.equal(valid(levels[0],{A:9}),false)});
