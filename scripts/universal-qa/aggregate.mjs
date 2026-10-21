// Aggregate per-shard evidence and surface one actionable Markdown summary.
// Missing jobs remain failures, even when their workflow step failed before upload.
import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export function summarize(dir, expected) {
  const results = [];
  const missing = [];
  // A platform PR may run multiple real test cases per bounded GitHub job.
  // Keep every expected case mandatory, including cases from failed shards.
  const batches=existsSync(dir)?readdirSync(dir,{withFileTypes:true})
    .filter(item=>item.isDirectory()&&/^qa-batch-(?:cpu|browser)-[0-9]{3}$/.test(item.name))
    .map(item=>item.name):[];
  for (const key of expected) {
    const direct=join(dir,'qa-'+key,'result.json');
    const candidates=[direct,...batches.map(name=>join(dir,name,key,'result.json'))]
      .filter(file=>existsSync(file));
    if(candidates.length>1){missing.push(key+' (duplicate evidence)');continue;}
    const file=candidates[0]||direct;
    // In upload-artifact v4, an artifact contains its own root qa-artifacts/<key>.
    if (!existsSync(file)) {
      missing.push(key);
      continue;
    }
    try {
      results.push(JSON.parse(readFileSync(file, 'utf8')));
    } catch (error) {
      missing.push(key + ' (invalid JSON: ' + error.message + ')');
    }
  }
  return { schema: 1, expected: expected.length, passed: results.filter(x => x.success).length,
    failed: results.filter(x => !x.success).length, missing, results,
    success: !missing.length && results.length === expected.length && results.every(x => x.success) };
}

export function reportMarkdown(report) {
  const lines = [
    '## Pocket Works Universal QA',
    '',
    '**' + report.passed + '/' + report.expected + ' passed**' +
       (report.success ? ' — all planned tasks completed.' : ' — requires attention.'),
    '',
    '| Application | Suite | Seed | Result | Duration |',
    '|---|---|---:|---|---:|'
  ];
  for (const result of report.results) {
    lines.push('| ' + result.app + ' | ' + result.suite + ' | ' + (result.seed ?? '—') +
      ' | ' + (result.success ? 'PASS' : 'FAIL') +
      ' | ' + ((result.durationMs || 0) / 1000).toFixed(1) + 's |');
  }
  for (const key of report.missing) lines.push('| ' + key + ' | — | — | MISSING ARTIFACT | — |');
  lines.push('', 'Screenshots, browser diagnostics, raw metrics and console logs are available in the workflow artifacts.',
    'Visual screenshots are evidence for manual/agent review, not an automatic artistic quality judgment.');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('/aggregate.mjs')) {
  try {
    const expected = JSON.parse(process.env.QA_EXPECTED || '[]');
    if (!Array.isArray(expected) || expected.some(x => typeof x !== 'string')) throw Error('Invalid expected task list');
    const dir = resolve(process.env.QA_COLLECTED_DIR || 'qa-collected');
    mkdirSync(dir, { recursive: true });
    const summary = summarize(dir, expected);
    writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
    const markdown = reportMarkdown(summary);
    writeFileSync(join(dir, 'SUMMARY.md'), markdown);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    console.log(markdown);
    if (!summary.success) process.exitCode = 1;
  } catch (error) { console.error(error); process.exitCode = 1; }
}
