import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE2_DEFAULT_STATE,
  activeExperiment,
  buildCombinedExport,
  buildFactorInsights,
  createCustomProtocol,
  createExperiment,
  evaluateExperiment,
  linkEntry,
  normalizePhase2State,
  setExperimentStatus
} from './phase2.js';

const experiment = createExperiment({
  title: 'Stop-start',
  factorKind: 'technique',
  factorValue: 'stop-start-solo',
  factorLabel: 'Stop-start самостоятельно',
  targetMetric: 'control',
  sampleTarget: 3,
  status: 'active'
}, '2026-08-04T08:00:00Z');

function linkedState() {
  let state = normalizePhase2State({ ...PHASE2_DEFAULT_STATE, experiments: [experiment] });
  for (let index = 0; index < 3; index += 1) {
    state = linkEntry(state, { entryType: 'episode', entryId: `b${index}`, experimentId: experiment.id, phase: 'baseline' });
    state = linkEntry(state, { entryType: 'episode', entryId: `i${index}`, experimentId: experiment.id, phase: 'intervention' });
  }
  return state;
}

test('normalizer removes orphan links and clamps experiment targets', () => {
  const state = normalizePhase2State({
    experiments: [{ ...experiment, sampleTarget: 99 }],
    links: [{ entryType: 'episode', entryId: 'e1', experimentId: 'missing', phase: 'baseline' }]
  });
  assert.equal(state.experiments[0].sampleTarget, 12);
  assert.equal(state.links.length, 0);
});

test('only one experiment remains active', () => {
  const second = createExperiment({ title: 'Second', status: 'planned' }, '2026-08-04T09:00:00Z');
  const state = setExperimentStatus({ experiments: [experiment, second] }, second.id, 'active', '2026-08-04T10:00:00Z');
  assert.equal(activeExperiment(state).id, second.id);
  assert.equal(state.experiments.find((item) => item.id === experiment.id).status, 'paused');
});

test('experiment evaluation requires planned samples and adjusts direction', () => {
  const phase2 = linkedState();
  const core = {
    episodes: [
      ...Array.from({ length: 3 }, (_, index) => ({ id: `b${index}`, control: 2, anxiety: 4, type: 'penetration', context: [] })),
      ...Array.from({ length: 3 }, (_, index) => ({ id: `i${index}`, control: 4, anxiety: 2, type: 'penetration', techniqueId: 'stop-start-solo', context: [] }))
    ],
    techniqueSessions: []
  };
  const result = evaluateExperiment(core, phase2, experiment.id);
  assert.equal(result.enoughData, true);
  assert.equal(result.direction, 'positive');
  assert.equal(result.rawDelta, 2);
});

test('factor insights ignore tiny samples', () => {
  const weak = buildFactorInsights({ episodes: [
    { id: '1', control: 5, context: ['good-sleep'] },
    { id: '2', control: 1, context: [] }
  ] });
  assert.equal(weak.length, 0);

  const strong = buildFactorInsights({ episodes: [
    ...Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, control: 5, context: ['good-sleep'] })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, control: 2, context: [] }))
  ] });
  assert.equal(strong[0].kind, 'context');
  assert.equal(strong[0].adjustedDelta, 3);
});

test('custom protocol and combined export remain serializable', () => {
  const protocol = createCustomProtocol({
    title: 'Мой ритм',
    summary: 'Тест',
    cycles: 4,
    pause: 45,
    steps: 'Первый шаг\nВторой шаг'
  }, '2026-08-04T10:00:00Z');
  assert.equal(protocol.steps.length, 2);
  const payload = buildCombinedExport({ schema: 'tempo-report', data: {} }, { episodes: [], techniqueSessions: [] }, {
    experiments: [experiment],
    customProtocols: [protocol]
  });
  assert.equal(payload.phase2.experiments.length, 1);
  assert.equal(payload.phase2.customProtocols[0].title, 'Мой ритм');
  assert.doesNotThrow(() => JSON.stringify(payload));
});
