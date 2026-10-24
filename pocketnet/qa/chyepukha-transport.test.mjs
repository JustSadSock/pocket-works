import test from 'node:test';
import assert from 'node:assert/strict';
import {isChyepukhaSync,canServeChyepukhaSync,checkChyepukhaStateBudget,
  CHYEPUKHA_SYNC_COOLDOWN_MS,CHYEPUKHA_STATE_HEADROOM_BYTES,checkChyepukhaViewBudget} from '../chyepukha-transport.mjs';
const LIMIT=256*1024;

test('private read-only sync is scoped to Chyepukha',()=>{
 assert.equal(isChyepukhaSync('chyepukha',{type:'sync'}),true);
 assert.equal(isChyepukhaSync('zamazka',{type:'sync'}),false);
 assert.equal(isChyepukhaSync('chyepukha',{type:'submit'}),false);
 assert.equal(isChyepukhaSync('chyepukha',null),false);
});
test('burst of sync requests is throttled per socket',()=>{
 assert.equal(canServeChyepukhaSync(undefined,10000),true);
 assert.equal(canServeChyepukhaSync(10000,10001),false);
 assert.equal(canServeChyepukhaSync(10000,10000+CHYEPUKHA_SYNC_COOLDOWN_MS-1),false);
 assert.equal(canServeChyepukhaSync(10000,10000+CHYEPUKHA_SYNC_COOLDOWN_MS),true);
});
test('capacity checks UTF-8 bytes and reserves room metadata',()=>{
 const small={phase:'writing',sheets:[{fragments:[{answer:'Кіт знайшов ключ'}]}]};
 const fit=checkChyepukhaStateBudget(small,LIMIT);
 assert.equal(fit.ok,true);
 assert.equal(fit.limit,LIMIT-CHYEPUKHA_STATE_HEADROOM_BYTES);
 assert.ok(fit.bytes>JSON.stringify(small).length);
 // Eight 16-chapter manuscripts with 800 CJK characters per fragment
 // legitimately exceed the database limit and must be rejected BEFORE commit.
 const worst={phase:'writing',sheets:Array.from({length:8},()=>({
   fragments:Array.from({length:16},()=>({answer:'界'.repeat(800),tail:'',by:'author'}))
 }))};
 const exceeded=checkChyepukhaStateBudget(worst,LIMIT);
 assert.equal(exceeded.ok,false);
 assert.ok(exceeded.bytes>LIMIT);
});
test('preflight does not mutate previously committed manuscript snapshots',()=>{
 const accepted={round:8,sheets:[{fragments:[{answer:'тест'}]}]};
 const before=structuredClone(accepted);
 const candidate={...accepted,sheets:[{fragments:[{answer:'界'.repeat(86000)}]}]};
 assert.equal(checkChyepukhaStateBudget(candidate,LIMIT).ok,false);
 assert.deepEqual(accepted,before);
});

test('final reader packet is measured independently of the stored manuscripts',()=>{
 const room={id:'room',gameId:'chyepukha',version:'v7',players:[{id:'a',name:'Ірина'}]};
 const ordinary={phase:'finished',stories:[{fragments:[{answer:'Кіт знайшов ключ',question:'Що сталося?'}]}]};
 assert.equal(checkChyepukhaViewBudget(room,ordinary,LIMIT).ok,true);
 const oversized={phase:'finished',stories:[{fragments:[{answer:'界'.repeat(88000),question:'Що сталося?'}]}]};
 assert.equal(checkChyepukhaViewBudget(room,oversized,LIMIT).ok,false);
});
