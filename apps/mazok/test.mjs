import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  clamp,
  createDrawingDocument,
  drawingCountLabel,
  isValidDrawing,
  normalizeHexColor,
  safeFileStem,
  simplifyPoints,
  widthForPoint
} from './drawing-core.js';

assert.equal(clamp(12, 0, 10), 10);
assert.equal(clamp(-2, 0, 10), 0);
assert.equal(normalizeHexColor('#ABCDEF'), '#abcdef');
assert.equal(normalizeHexColor('nope'), '#20211f');

const drawing = createDrawingDocument(390, 844, { background: '#ffffff' });
assert.equal(drawing.schema, 1);
assert.equal(drawing.width, 1200);
assert.ok(drawing.height > drawing.width * 2);
assert.equal(drawing.background, '#ffffff');
assert.ok(isValidDrawing(drawing));

drawing.strokes.push({
  id: 'stroke-test',
  tool: 'ink',
  color: '#2455d6',
  size: 20,
  seed: 4,
  points: [
    { x: 20, y: 30, p: 0.2, t: 0 },
    { x: 80, y: 90, p: 0.7, t: 16 }
  ]
});
assert.ok(isValidDrawing(drawing));
assert.ok(widthForPoint(drawing.strokes[0], drawing.strokes[0].points[1]) > 20);

const line = Array.from({ length: 101 }, (_, index) => ({ x: index, y: index * 0.5, p: 0.5, t: index }));
const simplified = simplifyPoints(line, 0.2);
assert.equal(simplified.length, 2);
assert.deepEqual(simplified[0], line[0]);
assert.deepEqual(simplified.at(-1), line.at(-1));

const damaged = structuredClone(drawing);
damaged.strokes[0].points[0].x = Number.NaN;
assert.equal(isValidDrawing(damaged), false);

assert.equal(drawingCountLabel(1), '1 рисунок');
assert.equal(drawingCountLabel(3), '3 рисунка');
assert.equal(drawingCountLabel(12), '12 рисунков');
assert.equal(drawingCountLabel(25), '25 рисунков');
assert.equal(safeFileStem(' Мой / первый: мазок! '), 'мой-первый-мазок');

const appRoot = new URL('./', import.meta.url);
const config = JSON.parse(await readFile(new URL('app.config.json', appRoot), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', appRoot), 'utf8'));
const serviceWorker = await readFile(new URL('sw.js', appRoot), 'utf8');
const html = await readFile(new URL('index.html', appRoot), 'utf8');
const application = await readFile(new URL('app.js', appRoot), 'utf8');

assert.equal(config.version, '1.0.0');
assert.equal(config.cacheName, 'mazok-v1.0.0');
assert.equal(manifest.description, config.description);
assert.equal(manifest.orientation, config.orientation);
assert.match(html, /data-app-version="1\.0\.0"/);
assert.match(serviceWorker, /const CACHE_NAME = 'mazok-v1\.0\.0'/);
assert.match(serviceWorker, /'\.\/drawing-core\.js'/);
assert.match(serviceWorker, /'\.\/drawing-db\.js'/);
assert.doesNotMatch(application, /\b(?:alert|confirm|prompt)\s*\(/);

const shellBlock = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] || '';
const shellEntries = [...shellBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.ok(shellEntries.length >= 12);
for (const entry of shellEntries) {
  if (entry === './') continue;
  await access(fileURLToPath(new URL(entry, appRoot)));
}

console.log('МАЗОК core tests passed');
