import assert from 'node:assert/strict';
import { createCampaign, missionsForDay, createFlight, stepFlight, applyFlightResult, campaignEnding, planeStats, terrainHeight } from './game-core.js';

const campaign = createCampaign(7741);
assert.equal(missionsForDay(campaign).length, 3);
assert.deepEqual(missionsForDay(campaign).map(m => m.id), missionsForDay(campaign).map(m => m.id));
for (const config of [
  { wing: .25, ballast: .15, crease: -.45, finish: 'dry' },
  { wing: .9, ballast: .85, crease: .45, finish: 'wax' },
  { wing: .58, ballast: .42, crease: 0, finish: 'dry' }
]) {
  const stats = planeStats(config);
  for (const value of Object.values(stats)) assert.ok(value >= 0 && value <= 1);
}
let totalSuccess = 0;
for (let seed = 1; seed <= 160; seed += 1) {
  const state = createCampaign(seed);
  const mission = missionsForDay(state)[seed % 3];
  const flight = createFlight(mission, state.plane, { power: .82, angle: -.12 });
  for (let i = 0; i < 60 * 80 && !flight.complete; i += 1) {
    const ground = terrainHeight(flight.x, 1000, 600, mission);
    flight.inputPitch = ground - flight.y < 145 ? .72 : flight.y < 170 ? -.18 : .05;
    stepFlight(flight, 1 / 60, { width: 1000, height: 600 });
  }
  assert.ok(flight.complete, `flight ${seed} must terminate`);
  assert.ok(Number.isFinite(flight.x) && Number.isFinite(flight.score));
  if (flight.success) totalSuccess += 1;
}
assert.ok(totalSuccess > 45, `baseline success rate too low: ${totalSuccess}/160`);
let endCampaign = createCampaign(9);
for (let day = 1; day <= 7; day += 1) {
  const mission = missionsForDay(endCampaign)[0];
  const fakeFlight = { mission, success: true, integrity: .8, water: .1, score: 2600 };
  endCampaign = applyFlightResult(endCampaign, fakeFlight);
}
assert.equal(endCampaign.day, 8);
assert.equal(endCampaign.history.length, 7);
assert.ok(campaignEnding(endCampaign).title.length > 0);
console.log(`ЛИНИИ ВЕТРА audit passed · baseline success ${totalSuccess}/160`);
