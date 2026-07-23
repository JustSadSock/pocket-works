import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'https://pocket.test/apps/mazok/',
  pretendToBeVisual: true
});
const { window } = dom;
const logs = [];
window.addEventListener('error', (event) => logs.push(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => logs.push(event.reason));

Object.defineProperties(window, {
  innerWidth: { configurable: true, value: 390 },
  innerHeight: { configurable: true, value: 844 },
  devicePixelRatio: { configurable: true, value: 2 },
  visualViewport: {
    configurable: true,
    value: {
      width: 390,
      height: 844,
      offsetTop: 0,
      addEventListener() {},
      removeEventListener() {}
    }
  }
});

window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {}
});
window.scrollTo = () => {};
window.requestIdleCallback = (callback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 20 }), 0);
window.cancelIdleCallback = window.clearTimeout;
window.URL.createObjectURL = () => `blob:test-${Math.random()}`;
window.URL.revokeObjectURL = () => {};
Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
Object.defineProperty(window.navigator, 'storage', {
  configurable: true,
  value: { persist: async () => true, estimate: async () => ({ usage: 0, quota: 1_000_000 }) }
});
Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: () => true });

const noop = () => {};
function makeContext(canvas) {
  return {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    translate: noop,
    scale: noop,
    setTransform: noop,
    setLineDash: noop,
    drawImage: noop,
    putImageData: noop,
    getImageData(_x, _y, width = 1, height = 1) {
      const data = new Uint8ClampedArray(Math.max(1, width * height * 4));
      for (let index = 0; index < data.length; index += 4) {
        data[index] = 255;
        data[index + 1] = 250;
        data[index + 2] = 240;
        data[index + 3] = 255;
      }
      return { data, width, height };
    }
  };
}

window.HTMLCanvasElement.prototype.getContext = function getContext() {
  this.__context ||= makeContext(this);
  return this.__context;
};
window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type = 'image/png') {
  callback(new window.Blob(['mazok'], { type }));
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,bWF6b2s=';
window.HTMLCanvasElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 };
};
window.HTMLCanvasElement.prototype.setPointerCapture = noop;
window.HTMLCanvasElement.prototype.releasePointerCapture = noop;
window.HTMLCanvasElement.prototype.hasPointerCapture = () => true;

const globals = {
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  indexedDB,
  IDBKeyRange,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLCanvasElement: window.HTMLCanvasElement,
  MutationObserver: window.MutationObserver,
  CustomEvent: window.CustomEvent,
  Event: window.Event,
  Blob: window.Blob,
  File: window.File,
  URL: window.URL,
  AbortController: window.AbortController,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window)
};
for (const [name, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function tick(milliseconds = 30) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function pointer(type, x, y, pointerId = 1) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    pressure: { value: type === 'pointerup' ? 0 : 0.5 },
    button: { value: 0 },
    getCoalescedEvents: { value: () => [event] }
  });
  return event;
}

const application = await import(`./app.js?dom-test=${Date.now()}`);
await tick(80);

const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
assert.equal(new Set(ids).size, ids.length, 'the interface must not contain duplicate ids');
assert.equal(document.querySelector('#galleryScreen').hidden, false, 'cold launch must open the gallery');
assert.equal(document.querySelector('#editorScreen').hidden, true);

document.querySelector('#newDrawingButton').click();
await tick();
assert.equal(document.querySelector('#newSheet').hidden, false, 'new drawing opens the mode chooser');
document.querySelector('#createSheetMode').click();
await tick(100);

let drawing = application.testHooks.getCurrentDrawing();
assert.equal(drawing.schema, 2);
assert.equal(drawing.canvasMode, 'sheet');
assert.equal(drawing.layers.length, 1);
assert.equal(document.querySelector('#editorScreen').hidden, false);

const canvas = document.querySelector('#drawingCanvas');
canvas.dispatchEvent(pointer('pointerdown', 90, 190));
canvas.dispatchEvent(pointer('pointermove', 180, 270));
canvas.dispatchEvent(pointer('pointerup', 220, 300));
await tick(50);
drawing = application.testHooks.getCurrentDrawing();
assert.equal(drawing.layers[0].strokes.length, 1, 'pointer gesture commits one stroke');
const sheetDrawing = structuredClone(drawing);

canvas.dispatchEvent(pointer('pointerdown', 300, 360));
await tick(480);
canvas.dispatchEvent(pointer('pointerup', 300, 360));
await tick();
assert.equal(application.testHooks.getCurrentDrawing().layers[0].strokes.length, 1, 'pipette hold does not leave an accidental dot');
assert.equal(document.querySelector('#customColor').value, '#fffaf0', 'pipette samples the visible paper colour');

document.querySelector('#toolButton').click();
await tick();
document.querySelector('[data-tool="select"]').click();
document.querySelector('#toolSheet [data-close-sheet]').click();
await tick();
canvas.dispatchEvent(pointer('pointerdown', 24, 120));
canvas.dispatchEvent(pointer('pointermove', 366, 120));
canvas.dispatchEvent(pointer('pointermove', 366, 520));
canvas.dispatchEvent(pointer('pointermove', 24, 520));
canvas.dispatchEvent(pointer('pointermove', 24, 120));
canvas.dispatchEvent(pointer('pointerup', 24, 120));
await tick(60);
assert.equal(document.querySelector('#selectionToolbar').hidden, false, 'lasso selects a visible stroke');
document.querySelector('#selectionCopy').click();
await tick();
assert.equal(application.testHooks.getCurrentDrawing().layers[0].strokes.length, 2, 'selection copy creates a second stroke');
document.querySelector('#toolButton').click();
await tick();
document.querySelector('[data-tool="ink"]').click();
document.querySelector('#toolSheet [data-close-sheet]').click();
await tick();

document.querySelector('#colorButton').click();
await tick();
assert.equal(document.querySelector('#colorSheet').hidden, false);
assert.ok(document.querySelectorAll('#usedColors button').length >= 1, 'used colors appear in the smart palette');
assert.ok(document.querySelectorAll('#smartColors button').length >= 4, 'smart variants are generated');
document.querySelector('#colorSheet [data-close-sheet]').click();
await tick();

document.querySelector('#layersButton').click();
await tick();
assert.equal(document.querySelector('#layersSheet').hidden, false);
document.querySelector('#addLayerButton').click();
await tick();
assert.equal(application.testHooks.getCurrentDrawing().layers.length, 2);
assert.equal(document.querySelector('#layerCount').textContent, '2');

const opacity = document.querySelector('#layerOpacity');
opacity.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
opacity.value = '60';
opacity.dispatchEvent(new window.Event('input', { bubbles: true }));
opacity.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick();
assert.equal(application.testHooks.getCurrentDrawing().layers.at(-1).opacity, 0.6);
assert.equal(document.querySelector('#layerMerge').disabled, true, 'merge refuses to silently change translucent layers');

opacity.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
opacity.value = '100';
opacity.dispatchEvent(new window.Event('input', { bubbles: true }));
opacity.dispatchEvent(new window.Event('change', { bubbles: true }));
await tick();
assert.equal(document.querySelector('#layerMerge').disabled, false);
document.querySelector('#layerMerge').click();
await tick();
assert.equal(application.testHooks.getCurrentDrawing().layers.length, 1, 'safe layers merge into one');
document.querySelector('#addLayerButton').click();
await tick();
document.querySelector('.layer-visibility').click();
await tick();
assert.equal(application.testHooks.getCurrentDrawing().layers.at(-1).visible, false, 'layer visibility is persisted in the document');
document.querySelector('.layer-visibility').click();
await tick();

document.querySelector('#layersSheet [data-close-sheet]').click();
await tick();
document.querySelector('#libraryButton').click();
await tick(320);
assert.equal(document.querySelector('#galleryScreen').hidden, false);
assert.equal(document.querySelectorAll('.drawing-card').length, 1);
document.querySelector('.drawing-more').click();
await tick();
document.querySelector('#versionsAction').click();
await tick(120);
assert.equal(document.querySelector('#versionsSheet').hidden, false);
assert.ok(document.querySelectorAll('.version-row').length >= 1, 'leaving a changed drawing creates a restorable version');
document.querySelector('#versionsSheet [data-close-sheet]').click();
await tick();

document.querySelector('#newDrawingButton').click();
await tick();
document.querySelector('#createInfiniteMode').click();
await tick(100);
drawing = application.testHooks.getCurrentDrawing();
assert.equal(drawing.canvasMode, 'infinite');
assert.equal(document.querySelector('#editorScreen').dataset.canvasMode, 'infinite');

document.querySelector('#toolButton').click();
await tick();
const fillButton = document.querySelector('[data-tool="fill"]');
assert.equal(fillButton.disabled, true, 'fill is explicitly unavailable on an unbounded canvas');
const selectButton = document.querySelector('[data-tool="select"]');
assert.equal(selectButton.disabled, false);

const { encodeTimelapseGif } = await import('./timelapse.js');
const encoded = await encodeTimelapseGif(sheetDrawing, { maximumFrames: 8 });
assert.equal(encoded.blob.type, 'image/gif');
assert.ok(encoded.blob.size > 40, 'offline encoder returns a non-empty GIF');

assert.deepEqual(logs, []);

console.log('МАЗОК DOM interaction tests passed');
dom.window.close();
