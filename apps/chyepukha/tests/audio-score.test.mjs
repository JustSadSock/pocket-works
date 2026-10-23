import test from 'node:test';
import assert from 'node:assert/strict';
import {SCORE,getScore,midiToHz} from '../audio-score.js';
test('every editorial music theme has intentional silence and a consistent phrase length',()=>{
 for(const [stage,score] of Object.entries(SCORE)){
  assert.equal(score.notes.length,score.bass.length,stage);
  assert.ok(score.notes.filter(x=>x===null).length>=6,stage+' should have rests');
  assert.ok(score.tempo>=600&&score.tempo<=1000,stage);
  assert.ok(score.notes.some(x=>Number.isInteger(x)),stage);
 }
 assert.notDeepEqual(SCORE.menu.notes,SCORE.writing.notes);
 assert.deepEqual(getScore('unknown'),SCORE.menu);
});
test('audio pitch formula is deterministic and bounded for editorial score',()=>{
 assert.equal(midiToHz(69),440);
 assert.ok(Math.abs(midiToHz(60)-261.6256)<.01);
 for(const song of Object.values(SCORE))for(const midi of song.bass)assert.ok(midiToHz(midi)>50&&midiToHz(midi)<550);
});
