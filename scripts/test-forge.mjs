import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { QUICK_APP_PRESETS } from './app-config.mjs';

const root = process.cwd();
const registryPath = path.join(root, 'apps.json');
const originalRegistry = await readFile(registryPath, 'utf8');
const generatedSlugs = [];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
}

try {
  for (const [index, preset] of QUICK_APP_PRESETS.entries()) {
    const slug = `forge-smoke-${preset}`;
    generatedSlugs.push(slug);
    run(process.execPath, [
      'scripts/new-app.mjs',
      slug,
      '--runtime=quick',
      `--preset=${preset}`,
      `--name=Forge ${preset}`,
      `--description=Temporary ${preset} preset validation application.`,
      `--order=${900 + index}`,
      '--skip-health'
    ]);
    run(process.execPath, ['--check', `apps/${slug}/app.js`]);
    run(process.execPath, ['--check', `apps/${slug}/sw.js`]);
  }

  run(process.execPath, ['scripts/build-registry.mjs', '--check']);
  run(process.execPath, ['scripts/validate.mjs']);
  run(process.execPath, ['scripts/validate-mobile-runtime.mjs']);
  run(process.execPath, ['scripts/validate-capabilities.mjs']);
  console.log(`Pocket Forge Quick smoke test passed for ${QUICK_APP_PRESETS.length} presets.`);
} finally {
  for (const slug of generatedSlugs) await rm(path.join(root, 'apps', slug), { recursive: true, force: true });
  await writeFile(registryPath, originalRegistry, 'utf8');
}
