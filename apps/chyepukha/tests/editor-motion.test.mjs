import test from 'node:test';
import assert from 'node:assert/strict';
import {screenSignature,transitionFor} from '../editor-motion.js';
const sheet={id:'sheet-01'};
const screen=(phase,round=0,waiting=false,step='draft',room='abc')=>screenSignature({
 view:{phase,round,sheet,waiting},room,writerStep:step
});
test('an editor stage has a stable identity across unrelated room state updates',()=>{
 assert.equal(screen('writing',1,false,'draft'),screen('writing',1,false,'draft'));
 assert.equal(transitionFor(screen('writing',1,false,'draft'),screen('writing',1,false,'draft')),'');
 assert.equal(transitionFor(screen('writing',1,false,'draft'),screen('writing',1,false,'select')),'proof');
 assert.equal(transitionFor(screen('writing',1,false,'select'),screen('writing',1,false,'draft')),'rewrite');
});
test('real room phases map to physical paper transitions',()=>{
 assert.equal(transitionFor(screen('lobby'),screen('writing')),'open');
 assert.equal(transitionFor(screen('writing',0,false,'select'),screen('writing',0,true)),'seal');
 assert.equal(transitionFor(screen('writing',0,true),screen('writing',1,false)),'receive');
 assert.equal(transitionFor(screen('writing',1,true),screen('finished')),'reveal');
});
test('changing overlays or reconnecting without a phase change cannot replay effects',()=>{
 const state=screen('writing',2,false,'select');
 assert.equal(transitionFor(state,state),'');
 assert.equal(transitionFor('',state),'');
 assert.equal(transitionFor(screen('finished'),screen('finished')),'');
});
