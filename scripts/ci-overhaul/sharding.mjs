// CI/CD Overhaul: non-authoritative shadow planner. Existing QA remains the source of truth.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertParity(tasks, shards) {
  const fingerprint = t => JSON.stringify(Object.keys(t).sort().map(k => [k,t[k]]));
  const expected = new Map();
  for (const t of tasks) {
    if (expected.has(t.key)) throw Error('Duplicate legacy key: ' + t.key);
    expected.set(t.key, fingerprint(t));
  }
  const seen = new Set();
  for (const shard of shards) {
    if (!Array.isArray(shard.tasks) || !shard.tasks.length) throw Error('Empty shard');
    for (const task of shard.tasks) {
      if (seen.has(task.key) || expected.get(task.key) !== fingerprint(task)) throw Error('Unexpected or altered task: ' + task.key);
      seen.add(task.key);
    }
  }
  if (seen.size !== expected.size) throw Error('Missing tasks: ' + [...expected.keys()].filter(k => !seen.has(k)).join(', '));
  return true;
}

export function planShards(tasks, { history = {}, targetMs = 900000, maxTasks = 8 } = {}) {
  if (!Array.isArray(tasks) || !Number.isSafeInteger(targetMs) || targetMs < 1 || !Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 32) throw Error('Invalid sharding configuration');
  const groups = new Map(), seen = new Set();
  for (const t of tasks) {
    if (!t || typeof t.key !== 'string' || !/^[a-z0-9-]+$/.test(t.key) || seen.has(t.key) || typeof t.install !== 'boolean') throw Error('Invalid/duplicate task');
    seen.add(t.key);
    const browser = ['visual','playwright','browser-node'].includes(t.kind);
    if (!browser && !['node','node-test'].includes(t.kind)) throw Error('Unknown task kind: ' + t.kind);
    const pool = browser ? 'browser' : t.install ? 'cpu-install' : 'cpu-plain';
    const sample = Object.hasOwn(history,t.key) ? history[t.key] : undefined;
    const fallback = { 'node-test':60000, node:180000, visual:120000, playwright:240000, 'browser-node':300000 }[t.kind];
    const ms = Number.isSafeInteger(sample) && sample > 0 && sample <= 2700000 ? sample : fallback;
    if (!groups.has(pool)) groups.set(pool,[]);
    groups.get(pool).push({task:t,ms});
  }
  const shards = [];
  for (const [pool,entries] of [...groups].sort(([a],[b])=>a.localeCompare(b))) {
    const bins = [];
    entries.sort((a,b)=>b.ms-a.ms || a.task.key.localeCompare(b.task.key));
    for (const {task,ms} of entries) {
      const eligible = bins.filter(b=>b.tasks.length < maxTasks && b.estimatedMs+ms <= targetMs);
      eligible.sort((a,b)=>a.estimatedMs-b.estimatedMs || a.index-b.index);
      let bin = eligible[0];
      if (!bin) {bin={index:bins.length,tasks:[],estimatedMs:0};bins.push(bin);}
      bin.tasks.push(task);bin.estimatedMs+=ms;
    }
    for (const b of bins) shards.push({id:pool+'-'+String(b.index+1).padStart(3,'0'),pool,estimatedMs:b.estimatedMs,tasks:b.tasks});
  }
  assertParity(tasks,shards);
  return shards;
}

export function shadowFromLegacy(output, options) {
  const fields = new Map();
  for (const line of output.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i<0) continue;
    const key=line.slice(0,i);
    if (!['cpu_matrix','browser_matrix','expected'].includes(key)) continue;
    if(fields.has(key)) throw Error('Duplicate legacy field: '+key);
    fields.set(key,JSON.parse(line.slice(i+1)));
  }
  const cpu=fields.get('cpu_matrix')?.include,browser=fields.get('browser_matrix')?.include,expected=fields.get('expected');
  if(!Array.isArray(cpu)||!Array.isArray(browser)||!Array.isArray(expected)) throw Error('Incomplete legacy plan');
  if(cpu.some(t=>!['node','node-test'].includes(t.kind))||browser.some(t=>!['visual','playwright','browser-node'].includes(t.kind))) throw Error('Invalid legacy partition');
  const tasks=[...cpu,...browser];
  const keys=new Set(tasks.map(t=>t.key));
  if(keys.size!==tasks.length||expected.length!==tasks.length||new Set(expected).size!==expected.length||expected.some(k=>!keys.has(k))) throw Error('Legacy matrix/expected mismatch');
  const shards=planShards(tasks,options);
  return {schema:1,mode:'shadow',legacyJobs:tasks.length,shardJobs:shards.length,expected,shards};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(shadowFromLegacy(readFileSync(0,'utf8')),null,2)); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
