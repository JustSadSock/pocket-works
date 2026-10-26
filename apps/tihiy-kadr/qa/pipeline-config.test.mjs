import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROUTES,routeById,planRoute,planCustom,makeRunKey,makeInputKey,calculateSpeed} from '../pipeline-config.js';

test('all seven pipelines use three real ONNX architectures, not placebo labels',()=>{
 assert.equal(ROUTES.length,7);
 assert.equal(new Set(ROUTES.map(x=>x.id)).size,7);
 for(const route of ROUTES){
  assert(route.steps.length>=1);
  assert.deepEqual(planRoute(route.id),route.steps);
  assert(route.steps.every(s=>['mrx','scnet','umxhq'].includes(s.model)));
  assert(route.steps.every(s=>s.model!=='scnet'||[1,.5,.25].includes(s.step)));
 }
 assert.deepEqual(ROUTES.map(x=>x.id),[
  'mrx','scnet-direct','mrx-scnet-fast','mrx-scnet-balanced','mrx-scnet','umxhq-direct','mrx-umxhq'
 ]);
 assert.equal(routeById('nonexistent'),null);
 assert.throws(()=>planRoute('nonexistent'));
});
test('window stride and input identity control cache keys safely',()=>{
 assert.equal(makeRunKey('mrx','original'),'mrx|original');
 assert.equal(makeRunKey('umxhq','original'),'umxhq|original');
 assert.equal(makeRunKey('scnet','mrx',1),'scnet|mrx|1');
 assert.equal(makeRunKey('scnet','mrx',.25),'scnet|mrx|0.25');
 assert.notEqual(makeRunKey('scnet','original',1),makeRunKey('scnet','mrx',1));
 assert.deepEqual(planCustom('scnet','custom-12',.5),{model:'scnet',input:'custom-12',step:.5});
 assert.equal(planCustom('scnet','original',.3),null);
 assert.equal(planCustom('unknown','original',1),null);
 assert.equal(planCustom('umxhq','original',1).model,'umxhq');
 assert.throws(()=>makeRunKey('scnet','original',.3));
});
test('tuning vocal subtraction changes downstream cache identity without rerunning its source',()=>{
 const source='scnet|mrx|original|1';
 const first=makeInputKey(source,.8),adjusted=makeInputKey(source,.4);
 assert.notEqual(first,adjusted);
 assert.equal(first,makeInputKey(source,.8));
 assert.equal(makeInputKey(source),source);
 assert.notEqual(makeRunKey('mrx',first),makeRunKey('mrx',adjusted));
 assert.throws(()=>makeInputKey(source,1.01));
 assert.throws(()=>makeInputKey(source,-.1));
});
test('cancelled Worker rejects its pending promise so route intervals can finish',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/pendingWorkerReject\?\.\(new DOMException/);
 assert.match(app,/pendingWorkerReject=rejectPending/);
 assert.match(app,/inputKey=run\.key/);
 assert.match(app,/studyResults\.get\(inputId\)\?\.inputKey/);
 assert.match(app,/subtractResidualVocals\(cached\.base,cached\.vocals,strength\)/);
 assert.match(app,/strength:preview\.strength/);
});
test('runtime projections remain estimates, not fabricated elapsed timings',()=>{
 const estimate=calculateSpeed(20,198000);
 assert.equal(estimate.rtf,9.9);
 assert.equal(estimate.at90Seconds,891);
 assert.equal(calculateSpeed(0,198000),null);
 assert.equal(calculateSpeed(20,-10),null);
});
test('user can process and compare without external WAV, API keys or native CUDA',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../mrx-worker.js',import.meta.url),'utf8');
 assert.match(html,/id="pipeline-input"/);
 assert.match(html,/id="pipeline-model"/);
 assert.match(html,/id="pipeline-step"/);
 assert.doesNotMatch(html,/id="study-import"/);
 assert.doesNotMatch(html,/id="study-advanced"/);
 assert.match(app,/pipelineRuns\.has\(key\)/);
 assert.match(app,/await modelStage\(/);
 assert.match(worker,/step:scnetStep/);
 assert.match(worker,/device:'wasm'/);
});
