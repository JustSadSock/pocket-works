import { spawnSync } from 'node:child_process';
import { collectAppConfigs, runtimeForConfig } from './app-config.mjs';

const root = process.cwd();
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const configs = (await collectAppConfigs(root)).filter((config) => runtimeForConfig(config) === 'enhanced');

for (const config of configs) {
  for (const script of ['typecheck', 'test']) {
    console.log(`${script} enhanced app ${config.slug}…`);
    const result = spawnSync(command, ['run', script, '--workspace', `@pocket-works/${config.slug}`], {
      cwd: root,
      stdio: 'inherit',
      shell: false
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

console.log(`Enhanced tests complete: ${configs.length} application${configs.length === 1 ? '' : 's'}.`);
