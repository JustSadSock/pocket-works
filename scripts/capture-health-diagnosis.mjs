import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

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
    if (script === 'registry:check') {
      const before = JSON.parse(await readFile('apps.json', 'utf8'));
      spawnSync('npm', ['run', 'registry:build'], { cwd: process.cwd(), encoding: 'utf8' });
      const after = JSON.parse(await readFile('apps.json', 'utf8'));
      const beforeBySlug = new Map(before.map((entry) => [entry.slug, entry]));
      const changes = [];
      for (const entry of after) {
        const old = beforeBySlug.get(entry.slug);
        if (JSON.stringify(old) === JSON.stringify(entry)) continue;
        const fields = [...new Set([...Object.keys(old || {}), ...Object.keys(entry)])]
          .filter((field) => JSON.stringify(old?.[field]) !== JSON.stringify(entry[field]));
        changes.push(`${entry.slug}:${fields.map((field) => `${field}=${JSON.stringify(old?.[field])}->${JSON.stringify(entry[field])}`).join(',')}`);
      }
      report = `registry-diff:${changes.join(';')}`;
    } else {
      report = [`step=${script}`, `exit=${result.status ?? -1}`, result.stdout || '', result.stderr || ''].join('\n').trim();
    }
    break;
  }
}

const encoded = Buffer.from(report, 'utf8').toString('base64url').slice(0, 220) || 'empty';
await writeFile(`apps/shpilka/health-${encoded}.html`, `<pre>${report.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`, 'utf8');
process.stdout.write(`${report}\n`);
