import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  brushSizeInDocument,
  clamp,
  createDrawingDocument,
  drawStrokeRange,
  drawingCountLabel,
  fitDrawingScale,
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
const nearFit = fitDrawingScale(390, 844, 1200, 2596);
assert.ok(nearFit >= 390 / 1200 && nearFit >= 844 / 2596);
assert.equal(fitDrawingScale(390, 844, 1200, 1500), 390 / 1200);

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

const antialiasWidth = 8;
const antialiasHeight = 3;
const antialiasPixels = new Uint8ClampedArray(antialiasWidth * antialiasHeight * 4);
for (let y = 0; y < antialiasHeight; y += 1) {
  const softEdge = (y * antialiasWidth + 3) * 4;
  const hardEdge = (y * antialiasWidth + 4) * 4;
  const outsideEdge = (y * antialiasWidth + 5) * 4;
  antialiasPixels[softEdge + 3] = 128;
  antialiasPixels[hardEdge + 3] = 255;
  antialiasPixels[outsideEdge + 3] = 128;
}
assert.equal(
  floodFillPixels(antialiasPixels, antialiasWidth, antialiasHeight, 1, 1, '#ef5b49', '#fffaf0', 18, 148),
  9,
  'fill must stop at the contour core'
);
assert.deepEqual(
  [...antialiasPixels.slice((antialiasWidth + 3) * 4, (antialiasWidth + 3) * 4 + 4)],
  [119, 45, 36, 255],
  'fill must extend under the inner antialiased contour pixel'
);
assert.deepEqual(
  [...antialiasPixels.slice((antialiasWidth + 4) * 4, (antialiasWidth + 4) * 4 + 4)],
  [0, 0, 0, 255],
  'the opaque contour must stay intact'
);
assert.deepEqual(
  [...antialiasPixels.slice((antialiasWidth + 5) * 4, (antialiasWidth + 5) * 4 + 4)],
  [0, 0, 0, 128],
  'fill must not leak through to the outer antialias pixel'
);

assert.equal(
  floodFillPixels(antialiasPixels, antialiasWidth, antialiasHeight, 1, 1, '#2455d6', '#fffaf0', 18, 148),
  9
);
const recoloredEdge = [...antialiasPixels.slice((antialiasWidth + 3) * 4, (antialiasWidth + 3) * 4 + 4)];
assert.ok(recoloredEdge[2] > recoloredEdge[0], 're-filling must transfer colour beneath the saved antialiased edge');
assert.deepEqual(
  [...antialiasPixels.slice((antialiasWidth + 4) * 4, (antialiasWidth + 4) * 4 + 4)],
  [0, 0, 0, 255],
  're-filling must still preserve the contour core'
);

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
const styles = await readFile(new URL('styles.css', appRoot), 'utf8');

assert.equal(config.version, '1.2.1');
assert.equal(config.cacheName, 'mazok-v1.2.1');
assert.equal(manifest.description, config.description);
assert.equal(manifest.orientation, config.orientation);
assert.match(html, /data-app-version="1\.2\.1"/);
assert.match(html, /data-tool="fill"/);
assert.match(serviceWorker, /const CACHE_NAME = 'mazok-v1\.2\.1'/);
assert.match(serviceWorker, /'\.\/drawing-core\.js'/);
assert.match(serviceWorker, /'\.\/drawing-db\.js'/);
assert.doesNotMatch(application, /\b(?:alert|confirm|prompt)\s*\(/);
assert.match(application, /brushSizeInDocument\(selectedSize\(tool\), currentDrawing\.width\)/);
assert.match(application, /await showGallery\(\)/);
assert.match(application, /replayStrokesScaled/);
assert.match(application, /requestIdleCallback/);
assert.match(styles, /--palette-bottom:\s*max\(2px,\s*calc\(var\(--device-safe-bottom\)\s*-\s*30px\)\)/);
assert.match(styles, /\.thumb-palette\s*\{[\s\S]*?bottom:\s*var\(--palette-bottom\)/);
assert.match(
  styles,
  /\.app-shell\s*\{[\s\S]*?inset:\s*0;[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*100%/,
  'the fixed app shell must fill the layout viewport instead of reusing a shortened visual viewport height'
);
assert.match(
  styles,
  /html\.is-app-keyboard-open\s+\.app-shell\s*\{[\s\S]*?bottom:\s*auto;[\s\S]*?height:\s*var\(--app-viewport-height/,
  'the keyboard state must still follow the visual viewport'
);

const shellBlock = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] || '';
const shellEntries = [...shellBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.ok(shellEntries.length >= 12);
for (const entry of shellEntries) {
  if (entry === './') continue;
  await access(fileURLToPath(new URL(entry, appRoot)));
}

console.log('МАЗОК core tests passed');
