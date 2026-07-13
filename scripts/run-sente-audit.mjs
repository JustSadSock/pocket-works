import { spawn } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportDirectory = path.join(root, 'apps', 'sente');
const child = spawn(process.execPath, [path.join(root, 'scripts', 'audit-sente-ai.mjs')], {
  cwd: root,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); process.stdout.write(chunk); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); process.stderr.write(chunk); });
const code = await new Promise((resolve) => child.on('close', resolve));
await writeFile(path.join(reportDirectory, 'AI_AUDIT.log'), output || `Audit exited with code ${code}\n`, 'utf8');

if (code !== 0) {
  const failure = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: { total: 0, passed: 0, failed: 1, fatal: true },
    fatalError: output.slice(-12000)
  };
  try {
    await access(path.join(reportDirectory, 'AI_AUDIT.json'));
  } catch {
    await writeFile(path.join(reportDirectory, 'AI_AUDIT.json'), `${JSON.stringify(failure, null, 2)}\n`, 'utf8');
  }
  try {
    await access(path.join(reportDirectory, 'AI_AUDIT.md'));
  } catch {
    await writeFile(path.join(reportDirectory, 'AI_AUDIT.md'), `# SENTE AI audit\n\nAudit process failed with exit code ${code}.\n\n\`\`\`text\n${output.slice(-12000)}\n\`\`\`\n`, 'utf8');
  }
  console.warn('SENTE audit failed in diagnostic preview mode; inspect apps/sente/AI_AUDIT.log.');
}
