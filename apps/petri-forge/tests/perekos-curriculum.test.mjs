import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerekosPolicy} from '../perekos-policy.mjs';
import {runPerekosEpisode,trainingSettings,trainingCases,holdoutCases,evaluatePerekosPolicy} from '../perekos-training.mjs';

test('actual native spell damage can secure a round against stationary training rival',()=>{
 const result=runPerekosEpisode(createPerekosPolicy(43,'aggressive'),{seed:41,mage:'kindle',opponent:'pebble',rival:'dummy',mode:'round'});
 assert.equal(result.roundWin,1);assert.equal(result.roundLoss,0);assert.ok(result.dealt>90,'Native spell damage below round-win threshold: '+JSON.stringify({dealt:result.dealt,received:result.received,shots:result.shots,hp:result.hp,steps:result.steps,remaining:result.remaining,roundWin:result.roundWin,roundLoss:result.roundLoss}));
});
test('draws do not masquerade as full-match victories',()=>{
 const result=runPerekosEpisode(createPerekosPolicy(43,'aggressive'),{seed:41,rival:'native',mode:'round'});
 assert.equal(result.won,false);assert.equal(result.finished,false);
 assert.equal(result.roundWin+result.roundLoss+result.roundDraw,1);
});
test('second-round lesson uses legal original rune drafting',()=>{
 const result=runPerekosEpisode(createPerekosPolicy(43,'aggressive'),{seed:41,rival:'dummy',mode:'skirmish',record:true});
 assert.equal(result.records.length,2);assert.ok(result.draft.length>=1);assert.ok(result.frames.some(f=>f.round>=2));
});
test('learning seeds do not leak into holdout and all evaluation metrics are deterministic',()=>{
 const config=trainingSettings({seed:41,curriculum:'competitive'});
 const episodes=Array.from({length:8},(_,i)=>trainingCases(config,i,8)).flat();
 const holdout=holdoutCases(config);
 assert.ok(episodes.some(x=>x.mode==='skirmish'));
 assert.ok(holdout.every(x=>!episodes.some(y=>x.seed===y.seed)));
 const brain=createPerekosPolicy(9),a=evaluatePerekosPolicy(brain,episodes.slice(0,2),config);
 assert.deepEqual(a,evaluatePerekosPolicy(brain,episodes.slice(0,2),config));
});
test('past agent policies can take part in real archive self-play',()=>{
 const config=trainingSettings({seed:7,curriculum:'competitive'});
 const brain=createPerekosPolicy(5),cases=trainingCases(config,6,8,[brain]);
 assert.ok(cases.some(x=>x.rival==='league'));
 assert.ok(Number.isFinite(evaluatePerekosPolicy(brain,cases,config,[brain]).fitness));
});