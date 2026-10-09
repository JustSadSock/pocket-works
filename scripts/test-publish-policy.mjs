import assert from 'node:assert/strict';
import { shouldPublishAppPath, shouldPublishSharedPath, shouldPublishGodotWebPath } from './publish-policy.mjs';

for (const file of [
  'index.html', 'app.js', 'styles.css', 'app.config.json', 'release.json',
  'engine/part-1.txt', 'assets/world.glb', 'audio/theme.ogg', 'models/crow.glb',
  'game-data/chapters.json'
]) {
  assert.equal(shouldPublishAppPath(file), true, `runtime asset ${file} must be retained`);
}
for (const file of [
  'qa/gameplay.mjs', 'asset-forge/model.py', 'audio-forge/generator.mjs',
  'tests/e2e/smoke.spec.js', 'source/main.ts', 'public/source-model.blend',
  'README.md', 'AGENTS.md', 'progress.md', 'vite.config.ts',
  'assets/.DS_Store', 'screenshots/intro.png', 'source/index.html',
  'notes/visual-feedback.md', 'src/main.ts', 'assets/model.blend1'
]) {
  assert.equal(shouldPublishAppPath(file), false, `development file ${file} must be excluded`);
}
assert.equal(shouldPublishAppPath('asset-forge', true), false);
assert.equal(shouldPublishAppPath('assets', true), true);
assert.equal(shouldPublishSharedPath('mobile-runtime.js'), true);
assert.equal(shouldPublishSharedPath('enhanced-update-manager.ts'), false);
assert.equal(shouldPublishGodotWebPath('index.wasm.part-001'), true);
assert.equal(shouldPublishGodotWebPath('index.pck'), true);
assert.equal(shouldPublishGodotWebPath('index.js.map'), false);
console.log('Production publication policy retains runtime assets and excludes source/QA files.');
