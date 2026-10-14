import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRun, taskIdentity, formatLocal, agentMessage } from './eta.mjs';

const base = Date.parse('2026-10-14T22:40:00Z');
const iso = t => new Date(t).toISOString();
const task = (seed, start, end, status = 'completed') => ({
  name: 'cpu (living-history-century-' + seed + ', living-history, century, node, ' + seed + ', false)',
  status, conclusion: status === 'completed' ? 'success' : null,
  started_at: start === null ? null : iso(start),
  completed_at: end === null ? null : iso(end)
});
const run = (id, created = base, status = 'in_progress') =>
  ({ id, name: 'Universal Pocket Works QA', created_at: iso(created), status,
    html_url: 'https://github.com/JustSadSock/pocket-works/actions/runs/' + id });
const historic = () => ({
  run: { ...run(1, base - 3600000, 'completed'), conclusion: 'success', updated_at: iso(base - 3450000) },
  jobs: [
    task(413, base - 3595000, base - 3545000),
    task(7777, base - 3595000, base - 3540000),
    { name: 'summary', status: 'completed', completed_at: iso(base - 3525000) }
  ]
});

test('parses real GitHub task labels and does not mistake plan as a shard', () => {
  assert.deepEqual(taskIdentity('cpu (living-history-century-413, living-history, century, node, 413, false)'), {
    pool: 'cpu', app: 'living-history', suite: 'century', kind: 'node', install: false,
    key: 'living-history/century/node/no-install'
  });
  assert.equal(taskIdentity('plan'), null);
  assert.equal(taskIdentity('browser (zamazka-real-flow, zamazka, real-flow, browser-node, false)').pool, 'browser');
});

test('parallel tasks are predicted by slowest shard rather than duration sum', () => {
  const jobs = Array.from({length: 16}, (_, n) => task(n + 100, base + 2000, null, 'in_progress'));
  const past = historic();
  past.jobs = Array.from({length: 16}, (_, n) => task(n + 100, base - 3595000, base - 3545000));
  past.jobs.push({ name: 'summary', completed_at: iso(base - 3530000), status: 'completed' });
  const result = estimateRun(run(2), jobs, [past], base + 15000);
  assert.equal(result.totalTasks, 16);
  assert.equal(result.comparableRuns, 1);
  assert.equal(result.completedTasks, 0);
  assert(result.estimatedFinishAt);
  assert(Date.parse(result.estimatedFinishAt) - base < 180_000, 'must not add 16x 50s');
  assert.match(agentMessage(result), /Ориентировочное окончание/);
});

test('future queued tasks account for setup time, and are not reported as started', () => {
  const job = task(413, null, null, 'queued');
  const result = estimateRun(run(3), [job], [], base + 1000);
  assert.equal(result.firstJobStartedAt, null);
  assert.equal(result.method, 'task-kind-fallback');
  assert(Date.parse(result.estimatedFinishAt) > base + 50_000);
  assert.match(agentMessage(result), /не начались/);
});

test('completed workflow returns factual finish time', () => {
  const done = estimateRun(run(4, base, 'completed'), [
    task(413, base + 3000, base + 37000),
    { name: 'summary', status: 'completed', completed_at: iso(base + 43000) }
  ], [], base + 70000);
  assert.equal(done.method, 'actual');
  assert.equal(done.estimatedFinishAt, iso(base + 43000));
  assert.match(agentMessage(done), /Завершено/);
});

test('no matrix yet must not invent a clock ETA', () => {
  const result = estimateRun(run(5), [{ name: 'plan', status: 'in_progress', started_at: iso(base) }], [], base + 2500);
  assert.equal(result.method, 'awaiting-job-matrix');
  assert.equal(result.estimatedFinishAt, null);
});

test('clock time is localized with daylight saving and midnight rollover', () => {
  const text = formatLocal('2026-10-14T22:45:00Z', 'Europe/Kyiv');
  assert.match(text, /15\.10/);
  assert.match(text, /01:45/);
  assert.throws(() => formatLocal(iso(base), 'Wrong/Zone'), RangeError);
});

test('fallback estimates never point into the past for a long-running job', () => {
  const result = estimateRun(run(6, base - 3600000), [
    task(111, base - 3500000, null, 'in_progress')
  ], [], base);
  assert(Date.parse(result.estimatedFinishAt) > base);
  assert(Date.parse(result.windowEndAt) >= Date.parse(result.estimatedFinishAt));
});
