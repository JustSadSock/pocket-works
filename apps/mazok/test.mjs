import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  brushSizeInDocument,
  clamp,
  createDrawingDocument,
  drawStrokeRange,
  drawingCountLabel,
  floodFillPixels,
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
assert.equal(brushSizeInDocument(14, 1200), brushSizeInDocument(14, 1200));
assert.ok(Math.abs(brushSizeInDocument(14, 1200) - 43.0769) < 0.001);

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

drawing.strokes.push({
  id: 'fill-test',
  tool: 'fill',
  color: '#ef5b49',
  size: 1,
  tolerance: 26,
  points: [{ x: 40, y: 50, p: 0.5, t: 20 }]
});
assert.ok(isValidDrawing(drawing));

const markerContext = {
  strokes: 0,
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() { this.strokes += 1; },
  arc() {},
  fill() {}
};
drawStrokeRange(markerContext, {
  tool: 'marker',
  color: '#20211f',
  size: 30,
  points: [
    { x: 1, y: 1, p: 0.5, t: 0 },
    { x: 2, y: 2, p: 0.5, t: 1 },
    { x: 3, y: 3, p: 0.5, t: 2 },
    { x: 4, y: 4, p: 0.5, t: 3 }
  ]
}, 0);
assert.equal(markerContext.strokes, 1, 'a restored marker must be painted as one continuous path');

const fillWidth = 7;
const fillHeight = 5;
const fillPixels = new Uint8ClampedArray(fillWidth * fillHeight * 4);
for (let y = 0; y < fillHeight; y += 1) {
  const offset = (y * fillWidth + 3) * 4;
  fillPixels[offset] = 32;
  fillPixels[offset + 1] = 33;
  fillPixels[offset + 2] = 31;
  fillPixels[offset + 3] = 255;
}
assert.equal(floodFillPixels(fillPixels, fillWidth, fillHeight, 1, 2, '#ef5b49', '#fffaf0', 26), 15);
assert.deepEqual([...fillPixels.slice((2 * fillWidth + 1) * 4, (2 * fillWidth + 1) * 4 + 4)], [239, 91, 73, 255]);
assert.deepEqual([...fillPixels.slice((2 * fillWidth + 5) * 4, (2 * fillWidth + 5) * 4 + 4)], [0, 0, 0, 0]);

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

assert.equal(config.version, '1.1.0');
assert.equal(config.cacheName, 'mazok-v1.1.0');
assert.equal(manifest.description, config.description);
assert.equal(manifest.orientation, config.orientation);
assert.match(html, /data-app-version="1\.1\.0"/);
assert.match(html, /data-tool="fill"/);
assert.match(serviceWorker, /const CACHE_NAME = 'mazok-v1\.1\.0'/);
assert.match(serviceWorker, /'\.\/drawing-core\.js'/);
assert.match(serviceWorker, /'\.\/drawing-db\.js'/);
assert.doesNotMatch(application, /\b(?:alert|confirm|prompt)\s*\(/);
assert.match(application, /brushSizeInDocument\(selectedSize\(tool\), currentDrawing\.width\)/);
assert.match(application, /await showGallery\(\)/);

const shellBlock = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] || '';
const shellEntries = [...shellBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.ok(shellEntries.length >= 12);
for (const entry of shellEntries) {
  if (entry === './') continue;
  await access(fileURLToPath(new URL(entry, appRoot)));
}

console.log('МАЗОК core tests passed');
