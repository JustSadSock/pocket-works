import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const directory = 'shpilka-271-build-pages';
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
await mkdir('dist-site', { recursive: true });

const checks = [
  ['tests', 'npm', ['run', 'test:shpilka']],
  ['enhanced', 'npm', ['run', 'build:enhanced']],
  ['site', 'npm', ['run', 'deploy:site']]
];

const slugify = (value) => value.normalize('NFKD').replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'no-output';

for (const [name, command, args] of checks) {
  const run = spawnSync(command, args, { encoding: 'utf8', env: process.env });
  const output = `${run.stdout || ''}\n${run.stderr || ''}`.trim();
  const status = run.status === 0 ? 'PASSED' : `FAILED-${run.status}`;
  const failures = output.split(/\r?\n/).filter((line) => line.startsWith('- '));
  const markers = failures.length ? failures : [output.split(/\r?\n/).filter(Boolean).slice(-5).join(' ').slice(0, 420)];

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index].replace(/^-\s*/, '');
    await writeFile(
      `${directory}/diag-build-${name}-${status}-${String(index + 1).padStart(2, '0')}-${slugify(marker)}.html`,
      `<!doctype html><meta charset="utf-8"><pre>${output.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`
    );
  }
}

console.log('Published full build diagnostics.');
