import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperiment, normalizePhase2State } from './phase2.js';
import {
  episodeFormWithExperiment,
  experimentForm,
  experimentsScreen,
  replaceCustomProtocolNames
} from './phase2-screens.js';

const experiment = createExperiment({
  title: 'Тест',
  factorKind: 'context',
  factorValue: 'good-sleep',
  factorLabel: 'Хороший сон',
  targetMetric: 'control',
  sampleTarget: 3,
  status: 'active'
}, '2026-08-04T08:00:00Z');
const phase2 = normalizePhase2State({
  experiments: [experiment],
  customProtocols: [{
    id: 'protocol-x',
    title: 'Мой ритм',
    steps: ['Шаг'],
    cycles: 2,
    pause: 20,
    createdAt: '2026-08-04T08:00:00Z'
  }]
});
const core = { episodes: [], techniqueSessions: [], products: [] };

test('experiment form contains built-in and custom factors', () => {
  const html = experimentForm(core, phase2);
  assert.match(html, /Stop–start самостоятельно/);
  assert.match(html, /Мой ритм/);
  assert.match(html, /Хороший сон/);
});

test('episode form gets custom protocols and baseline link', () => {
  const base = '<form><select name="techniqueId"><option value="">Нет</option></select><div class="form-actions"></div></form>';
  const html = episodeFormWithExperiment(base, core, phase2);
  assert.match(html, /protocol-x/);
  assert.match(html, /Активный эксперимент: Тест/);
  assert.match(html, /value="baseline" checked/);
});

test('experiment screen remains explicit about sample threshold', () => {
  const html = experimentsScreen(core, phase2);
  assert.match(html, /База 0\/3/);
  assert.match(html, /минимальный порог/);
});

test('custom protocol IDs are replaced in foundation history HTML', () => {
  assert.equal(replaceCustomProtocolNames('<b>protocol-x</b>', phase2), '<b>Мой ритм</b>');
});
