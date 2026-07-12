import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENHANCED_APP_PRESETS } from './app-config.mjs';

const root = process.cwd();
const registryPath = path.join(root, 'apps.json');
const originalRegistry = await readFile(registryPath, 'utf8');
const generatedSlugs = [];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
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
    ]);
    run(npm, ['run', 'typecheck', '--workspace', `@pocket-works/${slug}`]);
    run(npm, ['run', 'test', '--workspace', `@pocket-works/${slug}`]);
  }

  run(process.execPath, ['scripts/build-registry.mjs', '--check']);
  run(process.execPath, ['scripts/validate.mjs']);
  run(process.execPath, ['scripts/validate-enhanced.mjs']);
  console.log(`Pocket Forge Enhanced smoke test passed for ${ENHANCED_APP_PRESETS.length} presets.`);
} finally {
  for (const slug of generatedSlugs) await rm(path.join(root, 'apps', slug), { recursive: true, force: true });
  await writeFile(registryPath, originalRegistry, 'utf8');
}
