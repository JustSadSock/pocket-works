import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENHANCED_APP_PRESETS } from './app-config.mjs';

const root = process.cwd();
const registryPath = path.join(root, 'apps.json');
const reportPath = path.join(root, 'enhanced-smoke-report.txt');
const originalRegistry = await readFile(registryPath, 'utf8');
const generatedSlugs = [];
const report = [];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let failure = null;

function tail(value, lines = 36) {
  return String(value || '').trim().split(/\r?\n/).slice(-lines).join('\n');
}

function run(command, args, label) {
  report.push(`\n## ${label}\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  report.push(tail(output));
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} exited with status ${result.status}`);
}

try {
  for (const [index, preset] of ENHANCED_APP_PRESETS.entries()) {
    const slug = `enhanced-smoke-${preset}`;
    generatedSlugs.push(slug);
    run(process.execPath, [
      'scripts/new-app.mjs',
      slug,
      '--runtime=enhanced',
      `--preset=${preset}`,
      `--name=Enhanced ${preset}`,
      `--description=Temporary enhanced ${preset} validation application.`,
      `--order=${950 + index}`,
      '--skip-health'
    ], `${preset}: generate and build`);
    run(npm, ['run', 'typecheck', '--workspace', `@pocket-works/${slug}`], `${preset}: typecheck`);
    run(npm, ['run', 'test', '--workspace', `@pocket-works/${slug}`], `${preset}: vitest`);
  }

  run(process.execPath, ['scripts/build-registry.mjs', '--check'], 'registry check');
  run(process.execPath, ['scripts/validate.mjs'], 'PWA validation');
  run(process.execPath, ['scripts/validate-enhanced.mjs'], 'Enhanced validation');
  report.push(`\nPASS: ${ENHANCED_APP_PRESETS.length} Enhanced presets generated, built, typechecked and tested.`);
} catch (error) {
  failure = error;
  report.push(`\nFAIL: ${error.message}`);
} finally {
  for (const slug of generatedSlugs) await rm(path.join(root, 'apps', slug), { recursive: true, force: true });
  await writeFile(registryPath, originalRegistry, 'utf8');
  await writeFile(reportPath, `${report.join('\n')}\n`, 'utf8');
}

console.log(report.slice(-4).join('\n'));
if (failure) throw failure;
console.log(`Pocket Forge Enhanced smoke test passed for ${ENHANCED_APP_PRESETS.length} presets.`);
