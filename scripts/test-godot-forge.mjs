import assert from 'node:assert/strict';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from './new-app.mjs';

const root = process.cwd();
const slug = 'godot-smoke-runtime';
const directory = path.join(root, 'apps', slug);

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

await rm(directory, { recursive: true, force: true });

try {
  const config = await createApp([
    slug,
    '--runtime=godot',
    '--preset=godot-web',
    '--name=Godot Smoke Runtime',
    '--orientation=landscape',
    '--skip-health',
    '--skip-build'
  ], root);

  assert.equal(config.runtime, 'godot');
  assert.equal(config.preset, 'godot-web');
  assert.equal(config.storageNamespace, 'pocket-works:' + slug);

  for (const relative of [
    'app.config.json',
    'project.godot',
    'export_presets.cfg',
    'source/main.tscn',
    'source/main.gd',
    'source/pocket_works.gd',
    'icons/icon.svg',
    'README.md'
  ]) {
    assert.equal(await exists(path.join(directory, relative)), true, 'missing ' + relative);
  }

  const project = await readFile(path.join(directory, 'project.godot'), 'utf8');
  const bridge = await readFile(path.join(directory, 'source/pocket_works.gd'), 'utf8');
  const main = await readFile(path.join(directory, 'source/main.gd'), 'utf8');
  assert(project.includes('config/name="Godot Smoke Runtime"'));
  assert(project.includes('renderer/rendering_method="gl_compatibility"'));
  assert(bridge.includes('pocket-works:' + slug));
  assert(main.includes('"app": "' + slug + '"'));
  assert(!project.includes('__APP_'));
  assert(!bridge.includes('__APP_'));
  assert(!main.includes('__APP_'));
  assert.equal(await exists(path.join(directory, 'web')), false);

  console.log('Godot Forge source scaffold smoke test passed.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
