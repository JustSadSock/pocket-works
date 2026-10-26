import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROUTES,routeById,planRoute,makeRunKey,calculateSpeed} from '../pipeline-config.js';

test('exactly two verified independent local models, no MRX or chains',()=>{
 assert.deepEqual(ROUTES.map(x=>x.id),['umxhq-direct','scnet-direct']);
 assert.deepEqual(ROUTES.map(x=>x.steps[0].model),['umxhq','scnet']);
 for(const route of ROUTES){
  assert.equal(route.steps.length,1);
  assert.equal(route.steps[0].input,'original');
  assert.deepEqual(planRoute(route.id),route.steps);
 }
 assert.equal(routeById('mrx'),null);
 assert.equal(routeById('mrx-scnet'),null);
 assert.equal(routeById('unknown'),null);
 assert.throws(()=>planRoute('mrx'));
});
test('cache identity cannot accept obsolete models or chained inputs',()=>{
 assert.equal(makeRunKey('umxhq'),'umxhq|original');
 assert.equal(makeRunKey('scnet'),'scnet|original');
 assert.throws(()=>makeRunKey('mrx'));
 assert.throws(()=>makeRunKey('scnet','umxhq-direct'));
 assert.throws(()=>makeRunKey('scnet','original',.25));
});
test('runtime extrapolation uses measured time, not a fabricated benchmark',()=>{
 assert.deepEqual(calculateSpeed(90,5000),{rtf:5000/90000,at90Seconds:5});
 assert.equal(calculateSpeed(0,5000),null);
 assert.equal(calculateSpeed(90,-100),null);
});
test('simple UI has no MRX, chain builder or external upload form',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../mrx-worker.js',import.meta.url),'utf8');
 assert.match(html,/value="umxhq-direct"/);
 assert.match(html,/value="scnet-direct"/);
 assert.doesNotMatch(html,/value="mrx|id="pipeline-|id="stems-btn"/);
 assert.match(app,/renderEnhancedPCM\(run\.base,run\.vocals,run\.layers,effects\)/);
 assert.match(app,/pipelineRuns\.get\(key\)/);
 assert.match(worker,/device:'wasm'/);
 assert.doesNotMatch(worker,/kind==='mrx'/);
});
