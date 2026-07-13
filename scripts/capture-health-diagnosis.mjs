import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const commands = [
  ['build:enhanced'],
  ['registry:check'],
  ['validate:scripts'],
  ['validate:configs'],
  ['validate'],
  ['validate:mobile'],
  ['validate:updates'],
  ['validate:launcher'],
  ['validate:capabilities'],
  ['validate:enhanced'],
  ['validate:quality'],
  ['test:enhanced'],
  ['test:forge:quick'],
  ['prepare:site'],
  ['validate:site']
];

let report = 'all-health-steps-passed';
for (const [script] of commands) {
  const result = spawnSync('npm', ['run', script], { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) {
    report = [`step=${script}`, `exit=${result.status ?? -1}`, result.stdout || '', result.stderr || ''].join('\n').trim();
    break;
  }
}

const encoded = Buffer.from(report, 'utf8').toString('base64url').slice(0, 180) || 'empty';
await writeFile(`apps/shpilka/health-${encoded}.html`, `<pre>${report.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`, 'utf8');
process.stdout.write(`${report}\n`);
