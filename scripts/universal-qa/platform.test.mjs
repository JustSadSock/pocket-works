import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestFromEvent, requestFromInputs, loadSuites, resolveTasks, partition, metadataOnlyWorkerChange, ISSUE_TITLE } from './plan.mjs';
import { summarize, reportMarkdown } from './aggregate.mjs';

const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'pw-qa-'));
  const dir = join(root, 'apps', 'test-app');
  mkdirSync(join(dir, 'qa'), { recursive: true });
  writeFileSync(join(dir, 'app.config.json'), '{}');
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Test</title>');
  writeFileSync(join(dir, 'model.test.mjs'), '');
  writeFileSync(join(dir, 'qa', 'trial.mjs'), '');
  writeFileSync(join(dir, 'qa', 'flow.spec.ts'), '');
  return { root, dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
};
const manifest = fixture => {
  writeFileSync(join(fixture.dir, 'qa.plan.json'), JSON.stringify({
    schema: 1, suites: [
      { id: 'regression', kind: 'node-test', files: ['model.test.mjs'] },
      { id: 'parameter-sweep', kind: 'node', tier: 'deep',
        entry: 'qa/trial.mjs', args: ['--seed={seed}', '--out={output}/data.json'], seeds: [413, 7777, 9001] },
      { id: 'visual', kind: 'visual', viewports: ['mobile', 'desktop'],
        ready: 'body', steps: [{ action: 'visible', selector: 'body' }] },
      { id: 'interaction', kind: 'playwright', files: ['qa/flow.spec.ts'], tier: 'deep' }
    ]
  }));
};

test('fallback discovers tests and browser capture for any standalone app', () => {
  const f = createFixture();
  try {
    assert.deepEqual(loadSuites(f.root, 'test-app').map(x => x.id), ['regression', 'visual']);
    assert.equal(resolveTasks(f.root, { apps: ['test-app'] }).length, 2);
  } finally { f.cleanup(); }
});

test('agent-owned deep profiles fan out multiple seeds with no shell command', () => {
  const f = createFixture();
  try {
    manifest(f);
    const smoke = resolveTasks(f.root, { apps: ['test-app'], profile: 'smoke' });
    assert.equal(smoke[0].install, false);
    assert.deepEqual(smoke.map(t => t.suite), ['regression', 'visual']);
    const full = resolveTasks(f.root, { apps: ['test-app'], profile: 'deep' });
    assert.equal(full.length, 6);
    assert.equal(partition(full).cpu.include.length, 4);
    assert.equal(partition(full).browser.include.length, 2);
    assert(full.some(t => t.key === 'test-app-parameter-sweep-7777'));
  } finally { f.cleanup(); }
});

test('rejects path escapes and runaway matrix size', () => {
  const f = createFixture();
  try {
    manifest(f);
    const cfg = join(f.dir, 'qa.plan.json');
    const suites = JSON.parse(readFileSync(cfg, 'utf8'));
    suites.suites[0].files = ['../../secrets.test.mjs'];
    writeFileSync(cfg, JSON.stringify(suites));
    assert.throws(() => loadSuites(f.root, 'test-app'), /Unsafe QA file path/);
    suites.suites[0].files = ['model.test.mjs'];
    suites.suites[1].seeds = Array.from({ length: 21 }, (_, i) => i + 1);
    writeFileSync(cfg, JSON.stringify(suites));
    assert.throws(() => loadSuites(f.root, 'test-app'), /max 20/);
    assert.throws(() => resolveTasks(f.root, { apps: ['../test-app'] }), /Invalid/);
  } finally { f.cleanup(); }
});

test('only owner-issued requests may start agent dispatch', () => {
  const body = '{"app":"test-app","profile":"deep","suite":"parameter-sweep"}';
  const event = { action: 'opened', issue: { title: ISSUE_TITLE,
    user: { login: 'JustSadSock' }, body } };
  assert.deepEqual(requestFromEvent(event, 'issues', 'JustSadSock'),
    { app: 'test-app', profile: 'deep', suite: 'parameter-sweep' });
  assert.throws(() => requestFromEvent(event, 'issues', 'stranger'), /Untrusted/);
  assert.throws(() => requestFromEvent({ ...event, issue: { ...event.issue, user: { login: 'stranger' } } }, 'issues', 'JustSadSock'), /Untrusted/);
  assert.throws(() => requestFromInputs({ app: 'a', shell: 'rm -rf /' }), /Unknown/);
  assert.throws(() => requestFromInputs({ app: '../evil' }), /valid app slug/);
});

test('aggregate fails closed when reports are missing or failed', () => {
  const f = createFixture();
  try {
    const good = join(f.root, 'qa-x');
    mkdirSync(good, { recursive: true });
    writeFileSync(join(good, 'result.json'), '{"app":"test-app","suite":"visual","success":true,"durationMs":25}');
    const complete = summarize(f.root, ['x']);
    assert.equal(complete.success, true);
    assert.match(reportMarkdown(complete), /1\/1 passed/);
    assert.deepEqual(summarize(f.root, ['x', 'y']).missing, ['y']);
    writeFileSync(join(good, 'result.json'), '{"app":"test-app","suite":"visual","success":false}');
    assert.equal(summarize(f.root, ['x']).success, false);
  } finally { f.cleanup(); }
});

test('service worker release metadata alone does not fan out into game QA',()=>{
 const old="const VERSION='1.0.0';const RELEASE_DATE='2026-10-24';const RELEASE_NOTES=['Old notes'];self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});});";
 const changed="const VERSION='1.0.0';const RELEASE_DATE='2026-10-25';const RELEASE_NOTES=['New notes','More notes'];self.addEventListener('message',e=>{if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:VERSION,releaseDate:RELEASE_DATE,releaseNotes:RELEASE_NOTES});});";
 assert.equal(metadataOnlyWorkerChange(old,changed),true);
 assert.equal(metadataOnlyWorkerChange(old,changed.replace("VERSION='1.0.0'","VERSION='1.0.1'")),false,'version change must run QA');
 assert.equal(metadataOnlyWorkerChange(old,changed.replace("e.ports?.[0]","self.clients")),false,'reply transport change must run QA');
 assert.equal(metadataOnlyWorkerChange(old,changed.replace("RELEASE_DATE='2026-10-25'","RELEASE_DATE=getDate()")),false,'computed date is not metadata-only');
 assert.equal(metadataOnlyWorkerChange(old,changed+"const ASSETS=['new-runtime-file'];"),false,'precache change must run QA');
 const before="const VERSION='1.0.0';self.addEventListener('message',event=>event.ports?.[0]?.postMessage({releaseNotes:['Original']}));";
 const after="const RELEASE_NOTES=['Latest'];\nconst VERSION='1.0.0';self.addEventListener('message',event=>event.ports?.[0]?.postMessage({releaseNotes:RELEASE_NOTES}));";
 assert.equal(metadataOnlyWorkerChange(before,after),true,'an inline array moved into RELEASE_NOTES remains metadata-only');
 assert.equal(metadataOnlyWorkerChange(before,after.replace('releaseNotes:RELEASE_NOTES','releaseNotes:missingVar')),false);
});
