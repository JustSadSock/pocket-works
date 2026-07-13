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

await writeFile('apps/shpilka/audit-result.txt', output, 'utf8');
process.stdout.write(output);
