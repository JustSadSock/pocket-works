import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const bankLine=source.split('\n').find(line=>line.startsWith('const BANK = '));
assert.ok(bankLine,'Authoritative scenario bank must be present');
const bank=JSON.parse(bankLine.slice('const BANK = '.length).replace(/;\s*$/,''));

test('all ten story scenarios have ten distinct, fully guided steps',()=>{
 assert.equal(Object.keys(bank).length,10);
 for(const [id,scenario] of Object.entries(bank)){
  assert.equal(scenario.questions.length,10,id);
  assert.ok(scenario.label?.trim(),id);
  const prompts=new Set(),stages=new Set();
  for(const [i,q] of scenario.questions.entries()){
   for(const field of ['prompt','guidance','creativeFreedom','stage']){
    assert.ok(typeof q[field]==='string'&&q[field].trim().length>0,`${id} step ${i+1}: missing ${field}`);
   }
   assert.ok(!prompts.has(q.prompt),`${id}: duplicate question ${i+1}`);
   prompts.add(q.prompt);
   assert.ok(!stages.has(q.stage),`${id}: repeated narrative function ${q.stage}`);
   stages.add(q.stage);
  }
  assert.match(scenario.questions.at(-1).stage,/фінал/i,`${id}: final question must conclude story`);
 }
});

test('collapsing plan reserves the setting for step three',()=>{
 const q=bank.collapsingPlan.questions;
 assert.match(q[0].creativeFreedom,/місце/i);
 assert.match(q[1].creativeFreedom,/локац/i);
 assert.match(q[2].stage,/місце/i);
 assert.match(q[2].prompt,/де/i);
 assert.match(q[3].stage,/перший крок/i);
 assert.match(q[9].stage,/фінал/i);
});

test('questions progress from setup to consequences and ending',()=>{
 for(const [id,{questions}] of Object.entries(bank)){
  const final=questions.at(-1);
  assert.match(final.creativeFreedom,/не запускай нову сюжетну лінію/i,id);
  for(let i=0;i<questions.length-1;i++){
   assert.doesNotMatch(questions[i].stage,/^фінал$/i,`${id}: premature final stage ${i+1}`);
  }
 }
});
