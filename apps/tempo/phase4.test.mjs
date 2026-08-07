import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateLegacy,
  appendDetailedMarkdown,
  createSegment,
  durationBandFromSeconds,
  filterSegmentState,
  normalizeSegmentState,
  segmentExperimentSummary,
  summarizeSegments
} from './phase4-core.js';

test('mixed episode aggregates legacy type and penetration duration', () => {
  const segments = [
    createSegment('oral-received', { durationSeconds: 180 }),
    createSegment('penetration', { durationSeconds: 70, techniques: ['stop-start'], stopStartCycles: 2 }),
    createSegment('manual-given', { durationSeconds: 120 })
  ];
  const legacy = aggregateLegacy(segments);
  assert.equal(legacy.type, 'mixed');
  assert.equal(legacy.durationBand, '1-2');
  assert.equal(legacy.penetrationSeconds, 70);
  assert.equal(legacy.techniqueId, 'stop-start-partner');
});

test('duration band boundaries are deterministic', () => {
  assert.equal(durationBandFromSeconds(0), 'none');
  assert.equal(durationBandFromSeconds(20), 'under-30');
  assert.equal(durationBandFromSeconds(45), '30-60');
  assert.equal(durationBandFromSeconds(90), '1-2');
  assert.equal(durationBandFromSeconds(200), '2-5');
  assert.equal(durationBandFromSeconds(400), 'over-5');
});

test('summary counts orgasms, ejaculations and stop-start cycles separately', () => {
  const summary = summarizeSegments([
    createSegment('penetration', { durationSeconds: 80, techniques: ['stop-start'], stopStartCycles: 3, orgasmCount: 1, ejaculationCount: 1 }),
    createSegment('oral-received', { durationSeconds: 100, orgasmCount: 1, ejaculationCount: 0 })
  ]);
  assert.equal(summary.totalSeconds, 180);
  assert.equal(summary.orgasmCount, 2);
  assert.equal(summary.ejaculationCount, 1);
  assert.equal(summary.stopStartCycles, 3);
});

test('segment experiments can mix baseline and intervention inside one episode', () => {
  const state = normalizeSegmentState({
    episodeDetails: {
      e1: { segments: [
        createSegment('penetration', { experimentId: 'x', experimentPhase: 'baseline', control: 2 }),
        createSegment('penetration', { experimentId: 'x', experimentPhase: 'intervention', control: 4 })
      ] },
      e2: { segments: [
        createSegment('penetration', { experimentId: 'x', experimentPhase: 'baseline', control: 3 }),
        createSegment('penetration', { experimentId: 'x', experimentPhase: 'intervention', control: 5 })
      ] }
    }
  });
  const result = segmentExperimentSummary(state, 'x', 'control');
  assert.equal(result.baselineCount, 2);
  assert.equal(result.interventionCount, 2);
  assert.equal(result.adjustedDelta, 2);
});

test('mixed segment phases do not collapse into an episode-level experiment group', () => {
  const legacy = aggregateLegacy([
    createSegment('penetration', { experimentId: 'x', experimentPhase: 'baseline' }),
    createSegment('penetration', { experimentId: 'x', experimentPhase: 'intervention' })
  ]);
  assert.equal(legacy.uniformExperimentId, 'x');
  assert.equal(legacy.uniformExperimentPhase, null);
});

test('detailed markdown preserves chronological segment information', () => {
  const state = normalizeSegmentState({ episodeDetails: { e1: { segments: [createSegment('penetration', { durationSeconds: 90, orgasmCount: 1 })] } } });
  const text = appendDetailedMarkdown('# Base', { episodes: [{ id: 'e1', occurredAt: '2026-08-07T10:00:00Z' }] }, state);
  assert.match(text, /Детальная структура эпизодов/);
  assert.match(text, /Проникновение \/ фрикции/);
  assert.match(text, /оргазмов: 1/);
});

test('segment export can be restricted to the same episode range as the report', () => {
  const state = normalizeSegmentState({ episodeDetails: {
    recent: { segments: [createSegment('penetration', { durationSeconds: 60 })] },
    old: { segments: [createSegment('oral-received', { durationSeconds: 60 })] }
  } });
  const filtered = filterSegmentState(state, ['recent']);
  assert.deepEqual(Object.keys(filtered.episodeDetails), ['recent']);
});
