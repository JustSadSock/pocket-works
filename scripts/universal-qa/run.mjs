// Execute exactly one task emitted by plan.mjs. Shell expansion is never used.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadSuites, resolveTasks, safeApp } from './plan.mjs';

const outputRoot = resolve(ROOT, 'qa-artifacts');
const isInside = (base, file) => file.startsWith(base + '/') || file === base;

function jobArgs(task, suite, output) {
  const dir = safeApp(ROOT, task.app);
  const absolute = path => resolve(dir, path);
  if (suite.kind === 'node-test') {
    return [process.execPath, ['--test', ...suite.files.map(absolute)]];
  }
  if (suite.kind === 'node' || suite.kind === 'browser-node') {
    const args = (suite.args ?? []).map(value => value.replaceAll('{seed}', String(task.seed ?? ''))
      .replaceAll('{output}', output));
    return [process.execPath, [absolute(suite.entry), ...args]];
  }
  if (suite.kind === 'visual') return [process.execPath, [join(ROOT, 'scripts/universal-qa/visual.mjs')]];
  const cli = join(ROOT, 'node_modules/@playwright/test/cli.js');
  return [process.execPath, [cli, 'test',
    '--config=' + join(ROOT, 'scripts/universal-qa/playwright.config.mjs'),
    ...suite.files.map(absolute)]];
}

function execute(command, args, { output, task, timeoutMs }) {
  return new Promise((done) => {
    const stream = [];
    const child = spawn(command, args, {
      cwd: ROOT, shell: false, windowsHide: true,
      env: { ...process.env, PW_QA_OUTPUT_DIR: output, ZAMAZKA_QA_ARTIFACT_DIR: output, PW_QA_TASK: JSON.stringify(task),
        PLAYWRIGHT_HTML_OPEN: 'never' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const started = Date.now();
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    const record = chunk => {
      process.stdout.write(chunk);
      if (stream.reduce((n, s) => n + s.length, 0) < 2_000_000) stream.push(chunk.toString());
    };
    child.stdout.on('data', record);
    child.stderr.on('data', record);
    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      writeFileSync(join(output, 'console.log'), stream.join('').slice(0, 2_000_000));
      done({ success: code === 0 && !signal && !timedOut && !error,
        exitCode: code, signal: signal ?? null, timedOut, error: error?.message,
        durationMs: Date.now() - started });
    };
    child.on('error', error => finish(-1, null, error));
    child.on('close', (code, signal) => finish(code, signal));
  });
}

async function runBatch(batch) {
  if (!/^batch-(?:cpu|browser)-[0-9]{3}$/.test(batch.key) ||
      !Array.isArray(batch.tasks) || batch.tasks.length<1 || batch.tasks.length>8) {
    throw Error('Invalid bounded QA batch');
  }
  const expectedKind=batch.key.startsWith('batch-cpu-')?'cpu':'browser';
  const groupDir=join(outputRoot,batch.key);
  mkdirSync(groupDir,{recursive:true});
  const keys=new Set();let failed=false;
  for(const task of batch.tasks){
    if(!task || typeof task.key!=='string' || keys.has(task.key))throw Error('Duplicate/invalid QA case');
    keys.add(task.key);
    const expected=resolveTasks(ROOT,{apps:[task.app],suite:task.suite,profile:'deep',maxTasks:32})
      .find(item=>item.key===task.key&&item.kind===task.kind&&item.seed===task.seed);
    if(!expected || JSON.stringify(expected)!==JSON.stringify(task))throw Error('QA case not in allowed manifest: '+task.key);
    if((['node','node-test'].includes(task.kind)?'cpu':'browser')!==expectedKind)throw Error('Mixed QA batch kinds');
    const exit=await new Promise(resolve=>{
      const child=spawn(process.execPath,[fileURLToPath(import.meta.url)],{
        cwd:ROOT,shell:false,windowsHide:true,stdio:'inherit',
        env:{...process.env,PW_QA_TASK:JSON.stringify(task)}
      });
      child.once('error',()=>resolve(-1));
      child.once('close',(code,signal)=>resolve(signal?-1:code));
    });
    const src=join(outputRoot,task.key);
    if(!existsSync(join(src,'result.json')))throw Error('QA case produced no evidence: '+task.key);
    cpSync(src,join(groupDir,task.key),{recursive:true});
    if(exit!==0)failed=true;
  }
  if(failed)process.exitCode=1;
}

async function main() {
  const task = JSON.parse(process.env.PW_QA_TASK || '');
  if (Array.isArray(task.tasks)) return runBatch(task);
  // Reconstruct the plan from checked-in, app-owned files; no arbitrary command payloads.
  const expected = resolveTasks(ROOT, { apps: [task.app], suite: task.suite, profile: 'deep' })
    .find(s => s.key === task.key && s.kind === task.kind && s.seed === task.seed);
  if (!expected) throw Error('Task not in allowed QA manifest');
  const suite = loadSuites(ROOT, task.app).find(s => s.id === task.suite);
  const output = join(outputRoot, task.key);
  if (!isInside(outputRoot, output)) throw Error('Unsafe artifact path');
  mkdirSync(output, { recursive: true });
  const result = { schema: 1, ...expected, startedAt: new Date().toISOString(), success: false };
  const finish = () => {
    result.finishedAt = new Date().toISOString();
    writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2));
  };
  try {
    if (suite.kind === 'visual' || suite.kind === 'playwright' || suite.kind === 'browser-node') {
      const config = JSON.parse(readFileSync(join(ROOT, 'apps', task.app, 'app.config.json'), 'utf8'));
      // Quick PWAs are self-contained. Preview source directly so another app's
      // broken packaging cannot prevent this app from receiving browser QA.
      process.env.PW_QA_SITE_ROOT = ROOT;
      if (config.runtime !== 'quick') {
        const before = await execute('npm', ['run', 'deploy:site'], { output, task, timeoutMs: 420_000 });
        if (!before.success) throw Error('Enhanced site build failed: ' + JSON.stringify(before));
        process.env.PW_QA_SITE_ROOT = join(ROOT, 'dist-site');
      }
    }
    const [binary, args] = jobArgs(task, suite, output);
    const run = await execute(binary, args, { output, task, timeoutMs: suite.kind === 'node' ? 2_100_000 : 1_200_000 });
    Object.assign(result, run);
  } catch (error) {
    result.error = error?.stack || String(error);
    console.error(result.error);
  } finally {
    finish();
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      (result.success ? '✅ ' : '❌ ') + task.key + ' — ' + Math.round((result.durationMs || 0) / 1000) + 's\n');
  }
  if (!result.success) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
