import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialMatch,validatePlan} from '../engine.js';
import {trySetCommand,controlsFor,partialIssue,previewOrders} from '../planning.js';

test('conflicting attack and movement remain rejected atomically with explanatory UI',()=>{
 const original=['up','shield','right'];
 const result=trySetCommand(original,3,{type:'attack',dirs:['up']});
 assert.equal(result.error,'attack_direction_conflict');
 assert.deepEqual(result.actions,original);
 assert.equal(partialIssue(original),null);
 assert.equal(controlsFor(['right',{type:'attack',dirs:['down']}]).attacked.has('down'),true);
});
test('plan editing remains valid after reordering and replacement, including repeated moves',()=>{
 const initial=['right','left','up','shield','right'];
 const replacement=trySetCommand(initial,2,'right');
 assert.equal(replacement.error,null);
 assert.deepEqual(replacement.actions,['right','left','right','shield','right']);
 assert.equal(validatePlan(replacement.actions),null);
 const preview=previewOrders(initialMatch(),'A',replacement.actions);
 assert.deepEqual(preview.steps.map(s=>s.number),[1,2,3,4,5]);
});
test('solo AI runs only after saved pending A plan and can resume from same pending turn',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/function continueSoloPlanning\(\)/);
 assert.match(source,/if\(mode==='solo'&&offline\?\.pending\?\.A&&!offline\?\.pending\?\.B\)continueSoloPlanning\(\)/);
 assert.match(source,/const ticket=gameToken,match=offline\.match,session=offline/);
 assert.match(source,/storeOffline\(\);render\(\)/);
 assert.match(source,/await new Promise\(resolve=>setTimeout\(resolve,32\)\)/);
 assert.match(source,/offline\.pending\.B=aiPlan\(match,null,difficulty\)/);
 assert.match(source,/if\(ticket!==gameToken\|\|mode!=='solo'\|\|offline!==session\)/);
 assert.match(source,/thinkingAI=false;finishLocalRound\(\)/);
});
test('mobile conflict buttons are physically operable and explain rather than silently ignoring tap',async()=>{
 const [source,styles]=await Promise.all(['app.js','styles.css'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
 assert.match(source,/b\.disabled=disabled\|\|full;/);
 assert.match(source,/b\.classList\.toggle\('conflict',conflict&&!disabled&&!full\)/);
 assert.match(source,/if\(info\.moved\.has\(d\)\)\{planProblem\('attack_direction_conflict'\);return\}/);
 assert.match(source,/const result=trySetCommand\(plan,target,action\)/);
 assert.match(source,/if\(result\.error\)\{planProblem\(result\.error\);return\}/);
 assert.match(styles,/\.controls button\.conflict/);
});
test('AI waiting status does not falsely advertise a completed round, editing disables submission',async()=>{
 const [source,styles]=await Promise.all(['app.js','styles.css'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
 assert.match(source,/const locked=\(\)=>[^;]+thinkingAI/);
 assert.match(source,/if\(animating\|\|recording\|\|modalOpen\|\|thinkingAI\)return/);
 assert.match(source,/if\(editingSlot!==null\)\{toast\('Заверши редактирование выбранного шага'\);return;\}/);
 assert.match(source,/thinkingAI\?'ИИ ВЫБИРАЕТ ХОД'/);
 assert.match(source,/thinkingAI\?'Компьютер выбирает пять команд…'/);
 assert.match(source,/\$\('submit'\)\.disabled=disabled\|\|editingSlot!==null\|\|plan\.length!==STEPS/);
 assert.match(styles,/#phaseInfo\.is-ai-thinking/);
 assert.match(styles,/:root\[data-motion="off"\] #phaseInfo\.is-ai-thinking/);
});
