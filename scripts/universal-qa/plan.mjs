// Universal Pocket Works QA plan. App agents configure apps/<slug>/qa.plan.json.
// Plan is bounded and never constructs shell commands from issue or manifest text.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const OWNER = 'JustSadSock';
export const ISSUE_TITLE = '[qa] pocket-works';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TASKS = 20;
const MAX_PLATFORM_PR_TASKS = 32;
const MAX_PLATFORM_PR_CASES = 160;

export function safeApp(root, app) {
  if (typeof app !== 'string' || !SLUG.test(app)) throw Error('Invalid application slug');
  const dir = join(root, 'apps', app);
  if (!existsSync(join(dir, 'app.config.json'))) throw Error('Unknown application: ' + app);
  return dir;
}

function scopedFile(dir, pathname, endings) {
  if (typeof pathname !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(pathname) ||
      pathname.split('/').some(part => part === '..' || part === '.') || pathname.includes('\\')) {
    throw Error('Unsafe QA file path: ' + pathname);
  }
  const file = resolve(dir, pathname);
  if (!file.startsWith(dir + sep) || !endings.some(ext => file.endsWith(ext)) || !existsSync(file)) {
    throw Error('QA file must exist inside its application: ' + pathname);
  }
  return file;
}

function localTests(dir) {
  const found = [];
  function walk(folder, depth) {
    if (depth > 2) return;
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      if (item.isDirectory() && !['node_modules', 'dist', 'assets', 'build', 'server'].includes(item.name))
        walk(join(folder, item.name), depth + 1);
      else if (item.isFile() && item.name.endsWith('.test.mjs'))
        found.push(join(folder, item.name).slice(dir.length + 1).split(sep).join('/'));
    }
  }
  walk(dir, 0);
  return found.sort().slice(0, 40);
}

function validateSuite(dir, suite) {
  if (!suite || typeof suite !== 'object' || Array.isArray(suite) || !IDENT.test(suite.id)) throw Error('QA suite needs a kebab-case id');
  if (!['node-test', 'node', 'browser-node', 'visual', 'playwright'].includes(suite.kind)) throw Error('Unknown QA kind in ' + suite.id);
  if (!['smoke', 'deep'].includes(suite.tier ?? 'smoke')) throw Error('QA tier must be smoke or deep');
  if (suite.install !== undefined && typeof suite.install !== 'boolean') throw Error('install must be boolean');
  const normalized = { ...suite, tier: suite.tier ?? 'smoke' };
  if (suite.kind === 'node-test') {
    if (!Array.isArray(suite.files) || !suite.files.length || suite.files.length > 40)
      throw Error('node-test requires 1-40 files');
    suite.files.forEach(file => scopedFile(dir, file, ['.test.mjs']));
  } else if (suite.kind === 'node' || suite.kind === 'browser-node') {
    scopedFile(dir, suite.entry, ['.mjs']);
    if (suite.args !== undefined && (!Array.isArray(suite.args) || suite.args.length > 20 ||
      suite.args.some(a => typeof a !== 'string' || a.length > 300))) throw Error('Invalid node arguments');
    if (suite.seeds !== undefined && (!Array.isArray(suite.seeds) || !suite.seeds.length ||
      suite.seeds.length > MAX_TASKS || new Set(suite.seeds).size !== suite.seeds.length ||
      suite.seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295)))
      throw Error('seeds must be unique unsigned integers (max 20)');
  } else if (suite.kind === 'playwright') {
    if (!Array.isArray(suite.files) || suite.files.length < 1 || suite.files.length > 12)
      throw Error('playwright requires 1-12 spec files');
    suite.files.forEach(file => scopedFile(dir, file, ['.spec.ts', '.spec.js']));
  } else {
    const supported = ['mobile', 'desktop', 'tablet'];
    if (suite.viewports !== undefined && (!Array.isArray(suite.viewports) || !suite.viewports.length ||
      suite.viewports.length > 3 || suite.viewports.some(x => !supported.includes(x))))
      throw Error('Invalid visual viewports');
    if (suite.ready !== undefined && (typeof suite.ready !== 'string' || suite.ready.length > 180))
      throw Error('Invalid ready selector');
    if (suite.steps !== undefined && (!Array.isArray(suite.steps) || suite.steps.length > 15))
      throw Error('Visual steps must be an array of at most 15');
    for (const step of suite.steps ?? []) {
      if (!step || !['click', 'fill', 'visible', 'screenshot'].includes(step.action)) throw Error('Invalid visual step');
      if (step.action !== 'screenshot' && (typeof step.selector !== 'string' || step.selector.length > 180))
        throw Error('Visual step requires a selector');
      if (step.action === 'fill' && (typeof step.value !== 'string' || step.value.length > 250))
        throw Error('Fill step requires a short value');
    }
  }
  return normalized;
}

export function loadSuites(root, slug) {
  const dir = safeApp(root, slug);
  const manifest = join(dir, 'qa.plan.json');
  let suites;
  if (existsSync(manifest)) {
    const data = JSON.parse(readFileSync(manifest, 'utf8'));
    if (data.schema !== 1 || !Array.isArray(data.suites) || !data.suites.length || data.suites.length > 16)
      throw Error('Invalid qa.plan.json schema/suites for ' + slug);
    suites = data.suites;
  } else {
    suites = [];
    const files = localTests(dir);
    if (files.length) suites.push({ id: 'regression', kind: 'node-test', files });
    if (existsSync(join(dir, 'index.html'))) suites.push({ id: 'visual', kind: 'visual', viewports: ['mobile', 'desktop'] });
  }
  const checked = suites.map(suite => validateSuite(dir, suite));
  if (new Set(checked.map(x => x.id)).size !== checked.length) throw Error('Duplicate QA suite id');
  return checked;
}

export function maxTasksForRequest(eventName, event) {
  // Cross-application CI repair PRs explicitly labeled by the repository
  // maintainer need a bounded larger matrix. All ordinary PRs, dispatches
  // and issue-triggered runs retain the strict 20-task budget.
  return eventName === 'pull_request' && event.pull_request?.labels?.some(label=>label?.name === 'platform-change')
    ? MAX_PLATFORM_PR_TASKS : MAX_TASKS;
}

export function resolveTasks(root, { apps, suite = 'all', profile = 'smoke', maxTasks = MAX_TASKS, batchForPlatform = false }) {
  if (!Number.isInteger(maxTasks) || maxTasks < 1 || maxTasks > MAX_PLATFORM_PR_TASKS)
    throw Error('Invalid QA task budget');
  if (!['smoke', 'deep'].includes(profile)) throw Error('Invalid QA profile');
  if (suite !== 'all' && !IDENT.test(suite)) throw Error('Invalid QA suite selector');
  const tasks = [];
  for (const app of apps) {
    const suites = loadSuites(root, app);
    const chosen = suites.filter(s => (suite === 'all' || s.id === suite) &&
      (profile === 'deep' || s.tier === 'smoke'));
    if (suite !== 'all' && !chosen.length) throw Error('Suite not available for ' + app + ': ' + suite);
    for (const selected of chosen) {
      const seeds = ['node', 'browser-node'].includes(selected.kind) && selected.seeds?.length ? selected.seeds : [null];
      for (const seed of seeds) {
        const key = [app, selected.id, ...(seed === null ? [] : [String(seed)])].join('-');
        tasks.push({ key, app, suite: selected.id, kind: selected.kind, seed, install: selected.install === true });
      }
    }
  }
  if (tasks.length > (batchForPlatform ? MAX_PLATFORM_PR_CASES : maxTasks))
    throw Error('Too many QA cases (' + tasks.length + ' > ' + (batchForPlatform ? MAX_PLATFORM_PR_CASES : maxTasks) + '); request one suite/app');
  if (new Set(tasks.map(t => t.key)).size !== tasks.length) throw Error('Duplicate task keys');
  return tasks;
}

// A platform repair can touch dozens of apps. Preserve EVERY planned case,
// but run them in bounded sequential shards instead of exceeding GitHub's
// matrix limit. Each case still emits its own evidence and summary verdict.
export function boundedPartition(tasks, maxJobs = MAX_PLATFORM_PR_TASKS) {
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > MAX_PLATFORM_PR_TASKS) throw Error('Invalid QA job budget');
  const original = partition(tasks);
  if (tasks.length <= maxJobs) return original;
  const groupSize = Math.ceil(tasks.length / maxJobs);
  const group = (list, kind) => {
    const include=[];
    for(let offset=0;offset<list.length;offset+=groupSize){
      const members=list.slice(offset,offset+groupSize);
      include.push({key:`batch-${kind}-${String(include.length).padStart(3,'0')}`,tasks:members,
        install:members.some(task=>task.install)});
    }
    return {include};
  };
  const result={cpu:group(original.cpu.include,'cpu'),browser:group(original.browser.include,'browser')};
  if (result.cpu.include.length+result.browser.include.length>maxJobs) throw Error('Unable to batch QA without losing cases');
  return result;
}

export function requestFromEvent(event, eventName, actor) {
  if (eventName === 'issues') {
    if (event.action !== 'opened' || event.issue?.title !== ISSUE_TITLE ||
        event.issue?.user?.login !== OWNER || actor !== OWNER) throw Error('Untrusted QA issue');
    if ((event.issue.body ?? '').length > 2048) throw Error('Issue body too long');
    const data = JSON.parse(event.issue.body || '{}');
    return requestFromInputs(data);
  }
  if (eventName === 'workflow_dispatch') return requestFromInputs(event.inputs ?? {});
  if (eventName === 'pull_request') return { app: null, suite: 'all', profile: 'smoke' };
  throw Error('Unsupported QA event');
}

export function requestFromInputs(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('QA request must be an object');
  if (Object.keys(data).some(k => !['app', 'suite', 'profile'].includes(k))) throw Error('Unknown QA request field');
  const req = { app: data.app ?? null, suite: data.suite || 'all', profile: data.profile || 'smoke' };
  if (!req.app || (req.app !== 'all' && !SLUG.test(req.app))) throw Error('Provide valid app slug or all');
  if (req.suite !== 'all' && !IDENT.test(req.suite)) throw Error('Invalid suite');
  if (!['smoke', 'deep'].includes(req.profile)) throw Error('Invalid profile');
  return req;
}

export function changedApps(root, base, head) {
  if (!/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head)) throw Error('Invalid PR SHA');
  // Compare the PR's work from its fork point, excluding later target-branch work.
  const paths = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd: root, encoding: 'utf8' }).split(/\r?\n/);
  return [...new Set(paths.flatMap(p => {
    const match = /^apps\/([a-z0-9-]+)\//.exec(p);
    return match ? [match[1]] : [];
  }))].sort();
}

export function partition(tasks) {
  return {
    cpu: { include: tasks.filter(t => ['node', 'node-test'].includes(t.kind)) },
    browser: { include: tasks.filter(t => ['visual', 'playwright', 'browser-node'].includes(t.kind)) }
  };
}

async function main() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const request = requestFromEvent(event, eventName, process.env.GITHUB_ACTOR);
  let apps;
  if (eventName === 'pull_request') {
    apps = changedApps(ROOT, process.env.QA_BASE_SHA, process.env.QA_HEAD_SHA);
  } else if (request.app === 'all') {
    apps = readdirSync(join(ROOT, 'apps')).filter(slug => SLUG.test(slug) && existsSync(join(ROOT, 'apps', slug, 'app.config.json')));
  } else apps = [request.app];
  const platformRepair = eventName === 'pull_request' &&
    event.pull_request?.labels?.some(label=>label?.name === 'platform-change');
  const taskBudget = maxTasksForRequest(eventName, event);
  const tasks = resolveTasks(ROOT, { apps, suite: request.suite, profile: request.profile,
    maxTasks: taskBudget, batchForPlatform: platformRepair });
  const matrices = platformRepair ? boundedPartition(tasks, taskBudget) : partition(tasks);
  const output = [
    'cpu_matrix=' + JSON.stringify(matrices.cpu),
    'browser_matrix=' + JSON.stringify(matrices.browser),
    'has_cpu=' + String(matrices.cpu.include.length > 0),
    'has_browser=' + String(matrices.browser.include.length > 0),
    'expected=' + JSON.stringify(tasks.map(t => t.key))
  ].join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  } else console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## Universal QA plan\n' + (tasks.length ? tasks.map(t => '- ' + t.key + ' (' + t.kind + ')').join('\n') : 'No applicable app suites') + '\n');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
