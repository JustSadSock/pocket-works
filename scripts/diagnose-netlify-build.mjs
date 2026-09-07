import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'deploy:site'], {
  cwd: root,
  encoding: 'utf8',
  shell: false
});

const output = [
  'POCKET WORKS NETLIFY DIAGNOSTIC',
  `status=${result.status}`,
  `signal=${result.signal ?? ''}`,
  '',
  '--- STDOUT ---',
  result.stdout ?? '',
  '',
  '--- STDERR ---',
  result.stderr ?? '',
  ''
].join('\n');

const dist = path.join(root, 'dist-site');
await mkdir(dist, { recursive: true });
await writeFile(path.join(dist, 'build-diagnostic.txt'), output, 'utf8');
try {
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Pocket Works diagnostic</title><pre>Build diagnostics captured.</pre>', { flag: 'wx' });
} catch {}
console.log(output);
process.exitCode = 0;
