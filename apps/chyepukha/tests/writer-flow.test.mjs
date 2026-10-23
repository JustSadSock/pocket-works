import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffCount,handoffWords,splitWords,wordParts,hasMinimumDraft} from '../writer-flow.js';
test('words in the readable manuscript match server whitespace tokenization',()=>{
 const text='Кіт  сидів\nна даху,\tбо   заблукав.';
 assert.deepEqual(splitWords(text),['Кіт','сидів','на','даху,','бо','заблукав.']);
 assert.deepEqual(wordParts(text),['Кіт','  ','сидів','\n','на',' ','даху,','\t','бо','   ','заблукав.']);
 assert.deepEqual(handoffWords(text,[0,2,5]),['Кіт','на','заблукав.']);
});
test('v4 finale submits with no selected words while pinned v1–v3 rooms preserve legacy selection',()=>{
 const config={round:9,total:10,visibleTailWords:3,answer:'Великі дракони зникли за небокраєм'};
 assert.equal(handoffCount({...config,roomVersion:'v4'}),0);
 assert.equal(handoffCount({...config,roomVersion:'v3'}),3);
 assert.equal(handoffCount({...config,roomVersion:'v1'}),3);
 assert.equal(handoffCount({...config,round:8,roomVersion:'v4'}),3);
 assert.equal(handoffCount({...config,round:8,visibleTailWords:0}),0);
});
test('minimum four words and correct word cap are enforced before moving to review',()=>{
 assert.equal(hasMinimumDraft('дуже мало слів'),false);
 assert.equal(hasMinimumDraft('дуже мало слів тут'),true);
 assert.equal(handoffCount({visibleTailWords:12,answer:'Раз два три чотири'}),4);
 assert.equal(handoffCount({visibleTailWords:3,answer:''}),0);
});
