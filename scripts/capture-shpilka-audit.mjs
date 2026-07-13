import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const result = spawnSync(process.execPath, ['scripts/audit-shpilka-2-3.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});

const output = [
  `exit=${result.status ?? -1}`,
  result.stdout || '',
  result.stderr || ''
].join('\n').trim() + '\n';

const encoded = Buffer.from(output, 'utf8').toString('base64url').slice(0, 180) || 'empty';
await writeFile('apps/shpilka/audit-result.txt', output, 'utf8');
await writeFile(`apps/shpilka/audit-${encoded}.html`, `<pre>${output.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`, 'utf8');
process.stdout.write(output);
