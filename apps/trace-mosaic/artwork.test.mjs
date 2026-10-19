import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(root, 'assets/manifest.json'), 'utf8'));
const art = Array.from({ length: 24 }, (_, i) => {
  const filename = 'puzzle-' + String(i + 1).padStart(2, '0') + '.svg';
  return { filename, text: readFileSync(join(root, 'assets/puzzles', filename), 'utf8') };
});
function count(str, tag) {
  return (str.match(new RegExp('<' + tag + '(?=[\\s>])', 'g')) || []).length;
}
function checkBalanced(text) {
  const tags = text.match(/<\/?[A-Za-z][^>]*>/g) || [];
  const stack = [];
  for (const tag of tags) {
    const match = /^<\/?([A-Za-z][\w:-]*)/.exec(tag);
    if (!match) continue;
    if (tag.startsWith('</')) {
      assert.equal(stack.pop(), match[1], 'incorrect SVG nested closing tag ' + tag);
    } else if (!tag.endsWith('/>')) stack.push(match[1]);
  }
  assert.equal(stack.length, 0, 'unclosed XML elements: ' + stack.join(', '));
}
test('24 artworks have stable IDs, relevant titles and consistent server metadata', () => {
  assert.equal(art.length, 24);
  assert.equal(catalog.length, 24);
  const embedded = readFileSync(join(root, 'simulation.js'), 'utf8')
    .match(/const artManifest = (\[[^\n]*\]);/);
  assert.ok(embedded, 'game must embed catalog into immutable snapshot');
  assert.deepEqual(JSON.parse(embedded[1]), catalog);
  const titles = new Set();
  for (const [i, item] of catalog.entries()) {
    assert.equal(item.id, 'puzzle-' + String(i+1).padStart(2,'0'));
    assert.equal(item.path, './assets/puzzles/' + art[i].filename);
    assert.equal(item.width, 1600);
    assert.equal(item.height, 1200);
    assert.ok(item.title.length >= 7);
    assert.ok(!titles.has(item.title), 'duplicate artwork title');
    assert.ok(['easy', 'medium', 'spicy'].includes(item.difficulty));
    assert.equal(item.palette.length, 4);
    assert.ok(item.palette.every(color => /^#[0-9a-f]{6}$/i.test(color)));
    titles.add(item.title);
  }
});
for(const {filename, text} of art) {
  test(filename + ' has renderable, standalone SVG geometry', () => {
    assert.match(text, /<svg\s[^>]*width="1600"[^>]*height="1200"[^>]*viewBox="0 0 1600 1200"/);
    assert.ok(text.includes('</svg>'));
    assert.equal(count(text,'svg'),1);
    checkBalanced(text);
    assert.ok(count(text,'path')>=2, 'at least two meaningful shapes');
    assert.equal(count(text,'defs'),(text.match(/<\/defs>/g)||[]).length);
    assert.ok(!/<script|<foreignObject|<iframe/i.test(text), 'art must be inert');
    assert.ok(!/href\s*=\s*["']https?:/i.test(text), 'art must not load remote resources');
    assert.ok(!/url\(https?:/i.test(text), 'no external backgrounds');
  });
}
test('every mural has a distinctive geometry composition, not a recolored template', () => {
  const normalized = art.map(({text}) => text
    .replace(/#[0-9a-f]{3,8}/gi, '#COLOR')
    .replace(/\d+(?:\.\d+)?/g, 'N')
    .replace(/\s+/g, ' ')
  );
  assert.equal(new Set(normalized).size, 24);
  // The majority of every composition should be authored shapes, not a color-only variant.
  const geometric = art.map(({text}) => [...text.matchAll(/<path\s+[^>]*d="([^"]+)"/g)].map(m=>m[1]).join('|'));
  assert.equal(new Set(geometric).size, 24);
});
