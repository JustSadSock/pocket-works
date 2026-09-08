import assert from 'node:assert/strict';
import { STORY, applyStoryEvent, createRun, nearestInteractable, normalizeRing, qualityProfile, ringSolved, stageFor } from './core.js';

let run = createRun();
assert.equal(stageFor(run).id, 'arrival');
for (const [stage,event] of [
  ['arrival','reach-market'], ['market','market-solved'], ['foundry','foundry-pressurized'], ['archive','archive-met'],
  ['chase','chase-escaped'], ['tower','tower-solved'], ['ascent','reach-bell']
]) {
  assert.equal(run.stage, stage);
  run = applyStoryEvent(run, event);
}
run.choice = 'ring';
run = applyStoryEvent(run, 'final-choice');
assert.equal(run.stage, 'complete');
assert.equal(run.completedRuns, 1);
assert.equal(STORY.length, 9);
assert.deepEqual(normalizeRing([10, -3, 'bad']), [2, 5, 0]);
assert.deepEqual(createRun({ marketAligned:[2], towerAligned:null }).marketAligned, [2,0,0]);
assert.equal(ringSolved([2,5,1]), true);
assert.equal(ringSolved([2,4,1]), false);
assert.equal(nearestInteractable(
  {x:0,y:0,z:0},
  [{id:'a',position:{x:2,y:0,z:0}},{id:'b',position:{x:5,y:0,z:0}}],
  3
).item.id, 'a');

// Phone-sized viewports intentionally stay conservative even when modern phones
// expose many logical CPU cores. Larger tablet/desktop viewports can step up.
assert.equal(qualityProfile(8,430).tier, 'low');
assert.equal(qualityProfile(8,720).tier, 'high');
assert.equal(qualityProfile(6,600).tier, 'medium');
assert.equal(qualityProfile(4,900).tier, 'low');
assert.equal(qualityProfile(2,320).tier, 'low');
console.log('BELLFORGE core tests passed');
