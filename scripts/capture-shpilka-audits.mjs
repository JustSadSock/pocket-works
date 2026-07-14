import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const audits = [
  'scripts/audit-shpilka-2-6.mjs',
  'scripts/audit-shpilka-2-7.mjs',
  'scripts/audit-shpilka-2-7-1.mjs'
];

const sections = [];
for (const audit of audits) {
  const run = spawnSync(process.execPath, [audit], { encoding: 'utf8', env: process.env });
  sections.push([
    `=== ${audit} ===`,
    `exit: ${run.status}`,
    run.stdout || '',
    run.stderr || ''
  ].join('\n'));
}

await writeFile('enhanced-smoke-report.txt', sections.join('\n\n'));
console.log('Captured ШПИЛЬКА audit output.');
