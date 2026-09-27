import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateVisualScenes, writeContactSheet } from './visual-qa-core.mjs';

test('scene spec validates step actions and names', () => {
  assert.equal(validateVisualScenes({ version: 1, scenes: [{ name: 'initial' }, { name: 'combat', steps: [{ action: 'click', selector: '#start' }, { action: 'pause', ms: 200 }] }] }).length, 2);
  assert.throws(() => validateVisualScenes({ version: 1, scenes: [{ name: '../bad' }] }), /Invalid/);
  assert.throws(() => validateVisualScenes({ version: 1, scenes: [{ name: 'bad', steps: [{ action: 'pause', ms: 99999 }] }] }), /Pause/);
});

test('contact sheet embeds screenshots and escapes labels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pw-visual-'));
  try {
    const png = join(dir, 'image.png');
    await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64'));
    const svg = join(dir, 'sheet.svg');
    await writeContactSheet([{ screenshot: png, label: 'test <mobile>' }], svg);
    const data = await readFile(svg, 'utf8');
    assert.match(data, /test &lt;mobile&gt;/);
    assert.match(data, /data:image\/png;base64,/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
