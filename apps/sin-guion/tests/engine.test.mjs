import test from 'node:test';
import assert from 'node:assert/strict';
import {
 allExercises,allPhrases,freshState,normalizeState,currentDay,seededChoices,
 dueExercises,recordExercise,recordPhrase,duePhrases,recordOral,totalStats,groupStats,
 oralPercent,STORAGE_KEY,loadState
} from '../engine.js';
import {GRAMMAR,TOPICS,DAY_PLAN} from '../content.js';

test('all syllabus sections and human-authored oral topics are present',()=>{
 assert.equal(GRAMMAR.length,6);assert.equal(TOPICS.length,7);
 assert.equal(DAY_PLAN.length,7);assert.equal(allExercises.length,60);
 assert.equal(new Set(allExercises.map(q=>q.id)).size,60);
 assert.equal(new Set(TOPICS.map(t=>t.id)).size,7);
 assert.equal(allPhrases.length,25);
 for(const item of allExercises){
  assert.equal(new Set(item.choices).size,3, 'duplicate answer choice: '+item.id);
  assert.ok(item.choices.includes(item.answer));
  assert.ok(item.why.length>=8);
 }
 for(const t of TOPICS){assert.ok(t.questions.length>=4);assert.ok(t.starters.length>=3);}
});

test('shuffled choices are deterministic and contain a single correct option',()=>{
 const ex=allExercises[8],choices=seededChoices(ex);
 assert.deepEqual(choices,seededChoices(ex));
 assert.deepEqual([...choices].sort(),[...ex.choices].sort());
 assert.equal(choices.filter(c=>c===ex.answer).length,1);
});

test('mistakes are revisited immediately during cram interval',()=>{
 const now=Date.UTC(2026,10,8,15);
 let s=freshState(now);const q=allExercises[0];
 s=recordExercise(s,q.id,false,now);
 assert.equal(s.exercise[q.id].reps,0);
 assert.equal(s.exercise[q.id].correct,0);
 assert.ok(s.exercise[q.id].due>now);
 assert.ok(s.exercise[q.id].due<now+600000);
 assert.ok(dueExercises(s,now+600000,q.group,8).some(x=>x.id===q.id));
 s=recordExercise(s,q.id,true,now+600000);
 assert.equal(s.exercise[q.id].reps,1);
 assert.equal(s.exercise[q.id].correct,1);
 assert.equal(groupStats(s,q.group).seen,1);
 assert.equal(totalStats(s).answered,2);
});

test('repeat cards schedule and count progress independently of exercises',()=>{
 const now=Date.UTC(2026,10,8,15);
 let s=freshState(now);assert.equal(duePhrases(s).length,25);
 const id=allPhrases[0].id;s=recordPhrase(s,id,true,now);
 assert.equal(duePhrases(s,now).length,24);
 assert.equal(duePhrases(s,now+2*86400000).length,25);
});

test('oral history records real checklist and topic independently from audio',()=>{
 const now=Date.UTC(2026,10,8,15);
 const s=recordOral(freshState(now),{id:'test',topic:'cities',
 question:'¿Cómo serán las ciudades del futuro?',grammar:'future',seconds:62,
 checklist:[true,true,true,false,false],note:'Perdí una palabra.',at:now,audio:false});
 assert.equal(s.oral.length,1);assert.equal(s.oral[0].topic,'cities');
 assert.equal(oralPercent(s.oral[0]),60);assert.equal(totalStats(s).topics,1);
 assert.equal(totalStats(s).oral,1);
});

test('state storage recovers from malformed content, day plan stays bounded',()=>{
 const now=Date.UTC(2026,10,8);
 assert.equal(currentDay(freshState(now),now),1);
 assert.equal(currentDay(freshState(now),now+20*86400000),7);
 assert.equal(normalizeState({version:1,exercise:null,attempts:[null]},now).attempts.length,0);
 const badStorage={getItem(key){assert.equal(key,STORAGE_KEY);return '{invalid';}};
 assert.equal(loadState(badStorage,now).version,1);
});
