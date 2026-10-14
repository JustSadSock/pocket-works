// Local Compute controller. All remotely requested work is selected from a fixed allowlist.
// Never evaluate issue text or pass user-controlled strings to a shell.
import { spawn, availableParallelism } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

export const ISSUE_TITLE = '[compute] living-history';
export const OWNER = 'JustSadSock';
export const AUDIT_SEEDS = Object.freeze([413, 43821, 7777, 9001, 11, 29, 12345, 21773]);

function integer(value, field, fallback, min, max) {
  const v = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(v) || v < min || v > max) {
    throw new Error(field + ' must be an integer from ' + min + ' to ' + max);
  }
  return v;
}

export function validateRequest(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Request must be a JSON object');
  }
  const allowed = new Set(['profile', 'worlds', 'years', 'period', 'scenario']);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new Error('Unknown request field: ' + key);
  }
  const profile = raw.profile ?? 'regression';
  if (!['regression', 'audit', 'calibration'].includes(profile)) {
    throw new Error('Profile must be regression, audit or calibration');
  }
  const worlds = integer(raw.worlds, 'worlds', 4, 1, AUDIT_SEEDS.length);
  const years = integer(raw.years, 'years', 50, 10, 100);
  const period = integer(raw.period, 'period', 10, 1, 20);
  if (years % period !== 0) throw new Error('years must be divisible by period');
  const scenario = raw.scenario ?? 'normal';
  if (!['normal', 'drought', 'isolated', 'uplands', 'all', 'century'].includes(scenario)) {
    throw new Error('Unknown calibration scenario');
  }
  return { profile, worlds, years, period, scenario };
}

export function parseComputeRequest(event, eventName) {
  if (eventName === 'issues') {
    const issue = event?.issue;
    if (event?.action !== 'opened' ||
        issue?.user?.login?.toLowerCase() !== OWNER.toLowerCase() ||
        issue?.title !== ISSUE_TITLE) {
      throw new Error('Untrusted issue request');
    }
    let body = issue.body?.trim() || '{}';
    if (body.length > 2048) throw new Error('Request body too long');
    return validateRequest(JSON.parse(body));
  }
  if (eventName === 'workflow_dispatch') return validateRequest(event?.inputs || {});
  throw new Error('Unsupported GitHub event');
}

function execute(args, workdir) {
  return new Promise((done) => {
    const started = performance.now();
    const child = spawn(process.execPath, args, { cwd: workdir, stdio: 'inherit', shell: false });
    child.once('error', error => done({ ok: false, code: -1, elapsedMs: Math.round(performance.now() - started), error: error.message }));
    child.once('exit', (code, signal) => done({
      ok: code === 0 && !signal, code, signal, elapsedMs: Math.round(performance.now() - started)
    }));
  });
}

export async function runCompute(request, { root = resolve(fileURLToPath(new URL('..', import.meta.url))), output = join(root, 'local-compute-output') } = {}) {
  mkdirSync(output, { recursive: true });
  const start = new Date().toISOString();
  const summary = { createdAt: start, event: process.env.GITHUB_EVENT_NAME || 'local',
    commit: process.env.GITHUB_SHA || null, request, results: [], status: 'running' };
  const persist = () => writeFileSync(join(output, 'run.json'), JSON.stringify(summary, null, 2));
  persist();
  try {
    if (request.profile === 'regression') {
      const files = ['model.test.mjs', 'model.integration.test.mjs', 'model.v02.test.mjs', 'model.calibration.test.mjs'];
      const args = ['--test', ...files.map(file => join('apps', 'living-history', file))];
      summary.results.push({ kind: 'regression', ...await execute(args, root) });
    } else if (request.profile === 'calibration') {
      const args = ['apps/living-history/qa/calibration-runner.mjs',
        '--group=' + request.scenario, '--output=' + join(output, 'calibration.json')];
      summary.results.push({ kind: 'calibration', scenario: request.scenario, ...await execute(args, root) });
    } else {
      // Independent processes use separate CPU cores and produce isolated files.
      const seeds = AUDIT_SEEDS.slice(0, request.worlds);
      const workers = Math.min(4, seeds.length, Math.max(1, availableParallelism() - 1));
      let next = 0;
      await Promise.all(Array.from({ length: workers }, async () => {
        while (next < seeds.length) {
          const seed = seeds[next++];
          const dir = join(output, 'world-' + seed);
          const args = ['apps/living-history/simulation-audit.mjs',
            '--seeds=' + seed, '--years=' + request.years, '--period=' + request.period, '--output=' + dir];
          console.log('Starting audit seed ' + seed + ' for ' + request.years + ' years');
          const result = await execute(args, root);
          summary.results.push({ kind: 'audit', seed, years: request.years, ...result });
          persist();
        }
      }));
    }
    summary.status = summary.results.length > 0 && summary.results.every(result => result.ok) ? 'passed' : 'failed';
  } catch (error) {
    summary.status = 'failed';
    summary.error = String(error?.stack || error);
  } finally {
    summary.finishedAt = new Date().toISOString();
    persist();
    console.log('Local Compute ' + summary.status + '; summary: ' + join(output, 'run.json'));
  }
  return summary;
}

async function main() {
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new Error('GITHUB_EVENT_PATH missing: use GitHub Actions to execute requests');
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    const request = parseComputeRequest(event, process.env.GITHUB_EVENT_NAME);
    console.log('Accepted local compute request:', JSON.stringify(request));
    const report = await runCompute(request);
    process.exitCode = report.status === 'passed' ? 0 : 1;
  } catch (error) {
    console.error('Local Compute rejected:', error.message);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
