#!/usr/bin/env node
/**
 * Estimate when a Universal QA workflow will finish from GitHub timestamps.
 * Pure helpers are exported for tests. Only public, read-only Actions APIs used.
 * Usage: node scripts/universal-qa/eta.mjs --run=38641936470 --tz=Europe/Kyiv
 *        node scripts/universal-qa/eta.mjs --run=38641936470 --json
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const API = 'https://api.github.com/repos/JustSadSock/pocket-works';
const FALLBACK_MS = { cpu: 100_000, browser: 200_000 };
const SUMMARY_MS = 40_000;
const MAX_HISTORY = 8;
const validTime = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;

export function taskIdentity(name) {
  const match = /^(cpu|browser) \((.+)\)$/.exec(name || '');
  if (!match) return null;
  const columns = match[2].split(',').map(s => s.trim());
  if (columns.length < 4) return null;
  const [, app, suite, kind, , install = 'false'] = columns;
  if (!app || !suite || !kind) return null;
  return { pool: match[1], app, suite, kind, install: install === 'true',
    key: [app, suite, kind, install === 'true' ? 'install' : 'no-install'].join('/') };
}

function quantile(numbers, p) {
  if (!numbers.length) return null;
  const list = numbers.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!list.length) return null;
  const rank = Math.ceil(p * list.length) - 1;
  return list[Math.max(0, Math.min(list.length - 1, rank))];
}

function timestampOfFinish(run, jobs) {
  const finish = jobs.filter(j => j.name === 'summary').map(j => validTime(j.completed_at)).filter(Boolean);
  return finish.length ? Math.max(...finish) : (run.status === 'completed' ? validTime(run.updated_at) : null);
}

function makeSignature(jobs) {
  const counts = new Map();
  for (const job of jobs) {
    const t = taskIdentity(job.name);
    if (t) counts.set(t.key, (counts.get(t.key) || 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, n]) => key + ':' + n).join('|');
}

export function estimateRun(run, jobs, historical = [], now = Date.now()) {
  if (!run || !Array.isArray(jobs) || !Array.isArray(historical) || !Number.isFinite(now))
    throw Error('Invalid estimator input');
  const requestedAtMs = validTime(run.created_at);
  if (requestedAtMs === null) throw Error('Run has no valid created_at timestamp');
  const tasks = jobs.map(j => ({ ...j, identity: taskIdentity(j.name) })).filter(j => j.identity);
  const completed = tasks.filter(j => j.status === 'completed').length;
  const firstStartedMs = Math.min(Infinity, ...jobs.map(j => validTime(j.started_at)).filter(v => v !== null));
  const startMs = Number.isFinite(firstStartedMs) ? firstStartedMs : null;
  const finishMs = timestampOfFinish(run, jobs);
  const complete = run.status === 'completed' || (jobs.find(j => j.name === 'summary')?.status === 'completed');
  const result = {
    runId: run.id,
    runUrl: run.html_url || 'https://github.com/JustSadSock/pocket-works/actions/runs/' + run.id,
    status: run.status,
    requestedAt: new Date(requestedAtMs).toISOString(),
    firstJobStartedAt: startMs === null ? null : new Date(startMs).toISOString(),
    totalTasks: tasks.length,
    completedTasks: completed,
    method: 'unknown',
    comparableRuns: 0,
    estimatedFinishAt: null,
    windowStartAt: null,
    windowEndAt: null
  };
  if (complete) {
    const at = finishMs ?? now;
    result.method = 'actual';
    result.estimatedFinishAt = new Date(at).toISOString();
    result.windowStartAt = result.estimatedFinishAt;
    result.windowEndAt = result.estimatedFinishAt;
    return result;
  }

  const signature = makeSignature(tasks);
  const comparable = [];
  const observations = new Map();
  for (const h of historical) {
    if (!h || !Array.isArray(h.jobs) || h.run?.id === run.id || h.run?.conclusion !== 'success') continue;
    const base = validTime(h.run.created_at);
    const finish = timestampOfFinish(h.run, h.jobs);
    if (signature && makeSignature(h.jobs) === signature && base !== null && finish !== null && finish > base)
      comparable.push(finish - base);
    for (const j of h.jobs) {
      const identity = taskIdentity(j.name);
      const started = validTime(j.started_at);
      const stopped = validTime(j.completed_at);
      if (!identity || j.conclusion !== 'success' || started === null || stopped === null || stopped <= started) continue;
      const arr = observations.get(identity.key) || [];
      arr.push(stopped - started);
      observations.set(identity.key, arr);
    }
  }
  result.comparableRuns = comparable.length;

  let predicted;
  if (tasks.length) {
    const future = [];
    let matchedTasks = 0;
    for (const job of tasks) {
      if (job.status === 'completed') continue;
      const samples = observations.get(job.identity.key) || [];
      if (samples.length) matchedTasks++;
      const fallback = FALLBACK_MS[job.identity.pool] + (job.identity.install ? 65_000 : 0);
      const duration = quantile(samples, .8) ?? fallback;
      const start = validTime(job.started_at);
      // Jobs not yet assigned to a runner include a setup/queue allowance.
      // Overdue running jobs cannot have a forecast earlier than the present.
      future.push(start === null
        ? now + 50_000 + duration
        : Math.max(start + duration, now + 20_000));
    }
    const summary = jobs.find(j => j.name === 'summary');
    const summaryDone = summary?.status === 'completed';
    predicted = (future.length ? Math.max(...future) : now) + (summaryDone ? 0 : SUMMARY_MS);
    result.method = matchedTasks ? 'observed-task-durations' : 'task-kind-fallback';
    // Whole-run samples include queue and final aggregation. Use them as a
    // conservative cross-check; never promise earlier than now.
    if (comparable.length) {
      const historyFinish = requestedAtMs + quantile(comparable, .8);
      predicted = Math.max(predicted, historyFinish);
      result.method = 'historical-workflow-and-task-durations';
    }
  } else if (comparable.length) {
    predicted = Math.max(now + 20_000, requestedAtMs + quantile(comparable, .8));
    result.method = 'historical-workflow-duration';
  } else {
    // Before planning, count and type of jobs are unknown. Do not invent an ETA.
    result.method = 'awaiting-job-matrix';
    return result;
  }

  const remaining = Math.max(20_000, predicted - now);
  const highConfidence = comparable.length >= 3;
  const lowScale = highConfidence ? .8 : .6;
  const highScale = highConfidence ? 1.35 : 1.9;
  const windowStart = now + Math.max(10_000, remaining * lowScale);
  const windowEnd = now + remaining * highScale;
  result.estimatedFinishAt = new Date(Math.ceil(predicted / 1000) * 1000).toISOString();
  result.windowStartAt = new Date(Math.ceil(windowStart / 1000) * 1000).toISOString();
  result.windowEndAt = new Date(Math.ceil(windowEnd / 1000) * 1000).toISOString();
  return result;
}

export function formatLocal(value, zone = 'Europe/Kyiv') {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

export function agentMessage(estimate, zone = 'Europe/Kyiv') {
  const when = value => value ? formatLocal(value, zone) : 'ещё не начались';
  const lines = [
    'QA #' + estimate.runId + ': ' + estimate.completedTasks + '/' + estimate.totalTasks + ' заданий завершено.',
    'Заявка: ' + when(estimate.requestedAt) + '. Фактический старт: ' + when(estimate.firstJobStartedAt) + '.'
  ];
  if (estimate.method === 'actual') lines.push('Завершено: ' + when(estimate.estimatedFinishAt) + '.');
  else if (estimate.estimatedFinishAt) {
    lines.push('Ориентировочное окончание: около ' + when(estimate.estimatedFinishAt) +
      ' (возможный интервал: ' + when(estimate.windowStartAt) + ' — ' +
      when(estimate.windowEndAt) + ', ' + zone + ').');
    lines.push('Это прогноз, а не обещание: очередь GitHub и новые тесты могут сдвинуть время.');
  } else lines.push('Время завершения пока не оценить: ожидаю появления плана заданий в GitHub.');
  lines.push(estimate.runUrl);
  return lines.join('\n');
}

async function api(path) {
  const response = await fetch(API + path, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'pocket-works-qa-eta',
      ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {})
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Error('GitHub API HTTP ' + response.status +
    ': ' + (response.status === 403 ? 'rate limit or access restriction' : path));
  return response.json();
}

async function main() {
  const runArg = process.argv.find(v => v.startsWith('--run='))?.slice(6);
  const zone = process.argv.find(v => v.startsWith('--tz='))?.slice(5) || 'Europe/Kyiv';
  const json = process.argv.includes('--json');
  if (!runArg || !/^[1-9][0-9]{0,18}$/.test(runArg)) throw Error('Usage: node scripts/universal-qa/eta.mjs --run=<GitHub run id> [--tz=Europe/Kyiv] [--json]');
  // Validate timezone before making requests.
  formatLocal(new Date().toISOString(), zone);
  const runId = Number(runArg);
  if (!Number.isSafeInteger(runId)) throw Error('Invalid run ID');
  const [run, jobsResponse, historyResponse] = await Promise.all([
    api('/actions/runs/' + runId),
    api('/actions/runs/' + runId + '/jobs?per_page=100'),
    api('/actions/workflows/universal-qa.yml/runs?status=completed&per_page=20')
  ]);
  if (run.name !== 'Universal Pocket Works QA') throw Error('Selected run is not Universal Pocket Works QA');
  const recent = (historyResponse.workflow_runs || [])
    .filter(r => r.id !== runId && r.conclusion === 'success')
    .slice(0, MAX_HISTORY);
  const history = await Promise.all(recent.map(async item => {
    try {
      const data = await api('/actions/runs/' + item.id + '/jobs?per_page=100');
      return { run: item, jobs: data.jobs || [] };
    } catch { return null; }
  }));
  const result = estimateRun(run, jobsResponse.jobs || [], history.filter(Boolean));
  console.log(json ? JSON.stringify({ ...result, zone }, null, 2) : agentMessage(result, zone));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('QA ETA: ' + e.message); process.exitCode = 1; });
}
