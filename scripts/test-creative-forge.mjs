import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from './new-app.mjs';
import { validateVisualDirection } from './visual-direction.mjs';

const root = process.cwd();
const sample = ['quick', 'enhanced', 'godot'];
const created = [];

try {
  for (const runtime of sample) {
    const slug = `creative-smoke-${runtime}`;
    created.push(slug);
    await createApp([slug, `--runtime=${runtime}`, '--skip-build', '--skip-health'], root);
    const folder = path.join(root, 'apps', slug);
    const direction = JSON.parse(await readFile(path.join(folder,'visual-direction.json'),'utf8'));
    assert.equal(direction.product, slug);
    assert.ok(validateVisualDirection(direction,slug).length > 10, 'generated visual document must require real creative work');
    if (runtime !== 'godot') {
      const html = await readFile(path.join(folder,runtime==='enhanced'?'source/index.html':'index.html'),'utf8');
      assert.ok(html.includes('class="app-tools"'), 'scaffold retains usable navigation');
      assert.ok(!html.includes('class="app-header"'), 'Forge no longer preselects oversized header composition');
      assert.ok(!html.includes('class="app-kicker"'), 'Forge no longer implants decorative label typography');
    }
  }
  console.log('Creative Forge Quick, Enhanced and Godot technical scaffolds passed.');
} finally {
  for (const slug of created) await rm(path.join(root,'apps',slug), { recursive:true, force:true });
}
