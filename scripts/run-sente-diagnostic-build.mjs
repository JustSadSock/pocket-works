import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sente = path.join(root, 'apps', 'sente');
const diagnostics = [];

async function run(name, command, args) {
  diagnostics.push(`\n===== ${name} =====\n$ ${command} ${args.join(' ')}\n`);
  const child = spawn(command, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => { const text = chunk.toString(); diagnostics.push(text); process.stdout.write(text); });
  child.stderr.on('data', (chunk) => { const text = chunk.toString(); diagnostics.push(text); process.stderr.write(text); });
  const code = await new Promise((resolve) => child.on('close', resolve));
  diagnostics.push(`\n[exit ${code}]\n`);
  await mkdir(sente, { recursive: true });
  await writeFile(path.join(sente, 'BUILD_DIAGNOSTICS.log'), diagnostics.join(''), 'utf8');
  return code;
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const steps = [
  ['prepare engine', npm, ['run', 'prepare:sente-engine']],
  ['AI audit', npm, ['run', 'test:sente-ai']],
  ['registry build', npm, ['run', 'registry:build']],
  ['health', npm, ['run', 'health']]
];

for (const step of steps) await run(...step);
await run('prepare site', npm, ['run', 'prepare:site']);
await run('validate site', npm, ['run', 'validate:site']);

// Re-copy diagnostics after prepare:site so the preview always exposes the complete log.
await mkdir(path.join(root, 'dist-site', 'apps', 'sente'), { recursive: true });
await writeFile(path.join(root, 'dist-site', 'apps', 'sente', 'BUILD_DIAGNOSTICS.log'), diagnostics.join(''), 'utf8');
console.warn('Diagnostic build mode completed. Inspect /apps/sente/BUILD_DIAGNOSTICS.log before restoring strict failures.');
