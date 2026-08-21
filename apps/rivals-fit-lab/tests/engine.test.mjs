import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_QUESTIONS, HEROES, SNAPSHOT, buildPlayerProfile, choosePrecisionQuestion, rankHeroes, resultAnalysis, validateSnapshot } from '../engine.js';

test('snapshot contains 53 unique heroes',()=>{
  assert.equal(HEROES.length,53);
  assert.equal(SNAPSHOT.heroCount,53);
  assert.equal(validateSnapshot(),true);
});

test('core questionnaire has broad coverage',()=>{
  assert.equal(CORE_QUESTIONS.length,20);
  const covered=new Set(CORE_QUESTIONS.flatMap(q=>Object.keys(q.targets)));
  for(const axis of ['aim','range','mobility','aggression','frontline','support','utility','setup','mechanics','tempo','autonomy','burst','brawl']) assert.ok(covered.has(axis),axis);
});

test('player profile remains bounded',()=>{
  const answers=Object.fromEntries(CORE_QUESTIONS.map((q,i)=>[q.id,i%5]));
  const {vector}=buildPlayerProfile(answers);
  for(const value of Object.values(vector)) assert.ok(value>=0&&value<=100);
});

test('precision selector does not repeat asked question',()=>{
  const answers=Object.fromEntries(CORE_QUESTIONS.map(q=>[q.id,2]));
  const first=choosePrecisionQuestion(answers,[]);
  assert.ok(first);
  const second=choosePrecisionQuestion(answers,[first.id]);
  assert.ok(second);
  assert.notEqual(first.id,second.id);
});

test('ranking and analysis return stable complete results',()=>{
  const answers=Object.fromEntries(CORE_QUESTIONS.map((q,i)=>[q.id,(i*3)%5]));
  const ranking=rankHeroes(answers);
  assert.equal(ranking.length,53);
  assert.ok(ranking[0].score>=ranking.at(-1).score);
  const result=resultAnalysis(answers);
  assert.equal(result.roleBest.length,3);
  assert.equal(result.strengths.length,4);
  assert.equal(result.conflicts.length,3);
});
