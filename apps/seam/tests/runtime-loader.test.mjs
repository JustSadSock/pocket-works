import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (name) => readFile(path.join(root, name), 'utf8');

function elementStub() {
  return {
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return elementStub(); },
    querySelectorAll() { return []; },
    addEventListener() {},
    append() {},
    textContent: '',
    disabled: false,
    dataset: {}
  };
}

test('bootstrap defers callbacks implemented by later runtime fragments', async () => {
  const source = await read('app-part-1.js');
  const boardInstances = [];
  class BoardView {
    constructor(canvas, frame, callbacks) {
      boardInstances.push({ canvas, frame, callbacks });
    }
  }

  const context = {
    console,
    Uint32Array,
    Date,
    JSON,
    localStorage: { getItem() { return null; }, setItem() {} },
    document: {
      head: { append() {} },
      createElement() { return elementStub(); },
      querySelector() { return elementStub(); }
    },
    __AXIS_DEPS: {
      installMobileRuntime() {},
      createWorkshopMode() {},
      watchConnectivity() {},
      AxisGame: class {},
      PLAYER: { AZURE: 1, OCHRE: 2 },
      coordKey() {},
      parseCoordKey() {},
      lineBetween() {},
      chooseAIMove() {},
      shouldSwapOpening() {},
      BoardView
    }
  };
  context.globalThis = context;

  assert.doesNotThrow(() => vm.runInNewContext(source, context, { filename: 'app-part-1.js' }));
  assert.equal(boardInstances.length, 1);
  assert.equal(typeof boardInstances[0].callbacks.onCell, 'function');
  assert.equal(typeof boardInstances[0].callbacks.onMove, 'function');
  assert.doesNotMatch(source, /onCell\s*:\s*handleCell\b/);
});

test('runtime loader preserves definition and binding order', async () => {
  const [loader, handlers, bindings] = await Promise.all([
    read('app.js'), read('app-part-2b.js'), read('app-part-5.js')
  ]);
  assert.match(loader, /const PARTS=\['1','2a','2b','3a1','3a2','3b','4','5'\]/);
  assert.match(loader, /for\(const part of PARTS\)await loadPart\(part\)/);
  assert.match(handlers, /function handleCell\(cell\)/);
  assert.match(bindings, /startButton\.addEventListener\('click'/);
  assert.match(bindings, /menuButton\.addEventListener\('click'/);
});
