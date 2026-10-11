import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES,ROLES,resolveRound,initial,validate} from './data.js';
test('all offices have three complete decisions',()=>{assert.equal(ROLES.length,8);assert.equal(CASES.length,6);for(const r of ROLES){assert.equal(r.actions.length,3);for(const a of r.actions){assert.equal(a[2].length,3);assert.ok(a[2].every(Number.isFinite))}}});
test('three to eight people can resolve a complete incident',()=>{for(let n=3;n<=8;n++){const players=Array.from({length:n},(_,i)=>'P'+i),choices=Object.fromEntries(players.map((_,i)=>[i,i%3]));const votes=Object.fromEntries(players.map((_,i)=>[i,(i+1)%n]));for(let round=0;round<3;round++){const r=resolveRound(players,round,CASES[round].id,choices,votes);assert.equal(r.scores.length,n);assert.ok(r.culprit>=0&&r.culprit<n);assert.ok(Object.values(r.stats).every(v=>v>=0&&v<=100));assert.ok(r.scores.every(x=>Number.isInteger(x.total)))}}});
test('first state has a valid party and blank cases',()=>{const x=initial();assert.equal(validate(x),x);assert.equal(x.phase,'home');assert.equal(x.players.length,3)});
test('rejects malformed or implausible stored sessions',()=>{assert.equal(validate(null),null);assert.equal(validate({...initial(),players:['a']}),null)});
