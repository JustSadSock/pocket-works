import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, SNAPSHOT } from '../hero-data.js';
import { CORE, ADAPTIVE, sequenceFor, byId } from '../questions.js';
import { verifyDataset, buildPlayer, chooseAdaptive, isValidAnswer, rankHeroes, resultsSummary, pairRecommendations } from '../engine.js';

test('all 54 heroes with unique IDs and finite vectors',()=>{
 assert.equal(verifyDataset(),true);
 assert.equal(HEROES.length,54);
 assert.equal(SNAPSHOT.heroCount,54);
 assert(HEROES.some(h=>h.name==='Gorr the God Butcher'));
});
test('20 full questions, 12 quick questions, 4 scenarios',()=>{
 assert.equal(CORE.length,18);
 assert.equal(sequenceFor('quick').length,10);
 assert.equal(CORE.filter(q=>q.scenario).length,4);
 assert.equal(ADAPTIVE.length,6);
});
test('every question has valid four-choice or five-level input and scored metadata',()=>{
 for(const q of [...CORE,...ADAPTIVE]){
   assert(q.title.length>10);
   if(q.kind==='choice'){assert.equal(q.options.length,4);for(const o of q.options) assert(Object.keys(o.prefs).length+Object.keys(o.skills).length>0);}
   else assert.equal(q.kind,'scale');
   assert.equal(isValidAnswer(q,-1),false);
   assert.equal(isValidAnswer(q,2),true);
 }
});
test('rankings deterministic, complete and change by response',()=>{
 const a={pleasure:0,distance:0,initiative:0,team:3,tools:3,aim:0,complexity:0,mobility:0};
 const b={pleasure:2,distance:3,initiative:3,team:1,tools:1,aim:4,complexity:4,mobility:4};
 const ra=rankHeroes(a),rb=rankHeroes(b);
 assert.equal(ra.length,54);assert.equal(rb.length,54);
 assert.deepEqual(ra.map(x=>x.hero.id),rankHeroes(a).map(x=>x.hero.id));
 assert.notDeepEqual(ra.slice(0,10).map(x=>x.hero.id),rb.slice(0,10).map(x=>x.hero.id));
 assert(ra.every(r=>r.score>=1&&r.score<=99));
});
test('skill comfort and ranking modes respond to harder heroes',()=>{
 const answers={aim:0,complexity:0,speed:0,responsibility:0,pleasure:0};
 const easy=rankHeroes(answers,{},'easy'),joy=rankHeroes(answers,{},'joy');
 const hard=easy.find(r=>r.hero.id==='hawkeye');
 assert(hard.ease<90); assert.equal(easy.length,joy.length);
});
test('rating and feedback updates alter the selected hero score',()=>{
 const answers={pleasure:1,tools:1};
 const before=rankHeroes(answers).find(x=>x.hero.id==='loki').score;
 const after=rankHeroes(answers,{loki:{rating:2}}).find(x=>x.hero.id==='loki').score;
 assert(after>before);
});
test('adaptive picks two different questions',()=>{
 const answers=Object.fromEntries(CORE.map(q=>[q.id,q.kind==='scale'?2:1]));
 const q1=chooseAdaptive(answers,[]);assert(q1);
 const q2=chooseAdaptive(answers,[q1.id]);assert(q2&&q2.id!==q1.id);
});
test('profile scoring and duo generate grounded distinct-hero pairs',()=>{
 const a={answers:{pleasure:0,tools:0,team:0},feedback:{}};
 const b={answers:{pleasure:2,tools:1,team:1},feedback:{}};
 assert.equal(resultsSummary(a.answers).ranking.length,54);
 const pairs=pairRecommendations(a,b);
 assert.equal(pairs.length,5);
 assert(pairs.every(x=>x.left.hero.id!==x.right.hero.id));
});
