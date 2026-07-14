import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outputDirectory = 'shpilka-271-audit-pages';
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const run = spawnSync(process.execPath, ['scripts/audit-shpilka-2-7-1.mjs'], { encoding: 'utf8', env: process.env });
const output = `${run.stdout || ''}\n${run.stderr || ''}`.trim();
const failures = output.split(/\r?\n/)
  .filter((line) => line.startsWith('- '))
  .map((line) => line.slice(2).trim());
if (!failures.length && run.status !== 0) failures.push(output.slice(0, 180) || `audit-exit-${run.status}`);
if (!failures.length) failures.push('AUDIT-PASSED');

for (let index = 0; index < failures.length; index += 1) {
  const failure = failures[index];
  const slug = failure.normalize('NFKD').replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'unknown';
  await writeFile(`${outputDirectory}/diag-271-${String(index + 1).padStart(2, '0')}-${slug}.html`, `<!doctype html><meta charset="utf-8"><pre>${failure.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`);
}
await writeFile(`${outputDirectory}/diag-271-full.html`, `<!doctype html><meta charset="utf-8"><pre>${output.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`);
console.log(`Published ${failures.length} diagnostic marker(s).`);
