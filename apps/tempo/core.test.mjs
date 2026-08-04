import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STATE,
  buildExportPayload,
  buildMarkdownReport,
  compareEpisodeGroups,
  median,
  normalizeState,
  summarizeEpisodes
} from './core.js';

test('median handles even and odd samples', () => {
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('normalizeState clamps scores and strips invalid shapes', () => {
  const state = normalizeState({
    episodes: [{
      id: 'e1',
      createdAt: '2026-08-01T10:00:00Z',
      occurredAt: '2026-08-01T10:00:00Z',
      type: 'penetration',
      durationBand: '30-60',
      control: 99,
      pleasure: -4,
      notes: 'ok'
    }],
    checkIns: 'bad'
  });
  assert.equal(state.episodes[0].control, 5);
  assert.equal(state.episodes[0].pleasure, 0);
  assert.deepEqual(state.checkIns, []);
});

test('summarizeEpisodes reports medians and duration category', () => {
  const summary = summarizeEpisodes([
    { durationBand: 'under-30', control: 1, pleasure: 2, anxiety: 5, satisfaction: 2, repeatDesire: 1 },
    { durationBand: '30-60', control: 3, pleasure: 4, anxiety: 3, satisfaction: 4, repeatDesire: 4 },
    { durationBand: '1-2', control: 4, pleasure: 5, anxiety: 2, satisfaction: 5, repeatDesire: 5 }
  ]);
  assert.equal(summary.medianControl, 3);
  assert.equal(summary.medianDurationBand.id, '30-60');
});

test('comparison requires three observations in both groups', () => {
  const episodes = [
    ...Array.from({ length: 3 }, (_, index) => ({ techniqueId: 'stop-start-solo', control: 4 + (index % 2), pleasure: 4, anxiety: 2, satisfaction: 4, repeatDesire: 4, durationBand: '1-2' })),
    ...Array.from({ length: 3 }, () => ({ techniqueId: null, control: 2, pleasure: 3, anxiety: 4, satisfaction: 2, repeatDesire: 2, durationBand: '30-60' }))
  ];
  const comparison = compareEpisodeGroups(episodes, (item) => Boolean(item.techniqueId));
  assert.equal(comparison.enoughData, true);
  assert.ok(comparison.controlDelta > 0);
});

test('export excludes notes unless explicitly included', () => {
  const state = normalizeState({
    ...DEFAULT_STATE,
    episodes: [{
      id: 'e1',
      createdAt: '2026-08-01T10:00:00Z',
      occurredAt: '2026-08-01T10:00:00Z',
      type: 'penetration',
      durationBand: '30-60',
      control: 3,
      pleasure: 3,
      anxiety: 3,
      erection: 3,
      satisfaction: 3,
      repeatDesire: 3,
      notes: 'private note'
    }]
  });
  const withoutNotes = buildExportPayload(state, { range: 'all', includeNotes: false, now: '2026-08-04T10:00:00Z' });
  const withNotes = buildExportPayload(state, { range: 'all', includeNotes: true, now: '2026-08-04T10:00:00Z' });
  assert.equal(withoutNotes.data.episodes[0].notes, '');
  assert.equal(withNotes.data.episodes[0].notes, 'private note');
  assert.ok(!buildMarkdownReport(state, { range: 'all', includeNotes: false, now: '2026-08-04T10:00:00Z' }).includes('private note'));
});
