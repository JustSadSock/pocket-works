import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadRuntimeGroup } from '../apps/clada/platform/runtime-loader.js';

// Exercise the real loader with browser-like Blob loading. Fragment boundaries
// are deliberately inside an identifier and a string literal.
const nativeFetch = globalThis.fetch;
const previousDocument = globalThis.document;
let loadedSource;
let fragments = new Map([
  ['one', 'const habitatFit'],
  ['two', 'ness = "par'],
  ['three', 'chment";']
]);
globalThis.fetch = async source => new Response(fragments.get(source));
globalThis.document = {
  createElement: () => ({ remove() {} }),
  head: {
    append(script) {
      queueMicrotask(async () => {
        try {
          loadedSource = await (await nativeFetch(script.src)).text();
          new vm.Script(loadedSource);
          script.onload();
        } catch {
          script.onerror();
        }
      });
    }
  }
};
try {
  await loadRuntimeGroup(['one', 'two', 'three']);
  assert.ok(loadedSource.startsWith('const habitatFitness = "parchment";'));
  const boot = await readFile(new URL('../apps/clada/app.js', import.meta.url), 'utf8');
  const groupLiteral = boot.match(/const livingRuntimeGroups = (\[[\s\S]*?\n\]);/)[1];
  const groups = vm.runInNewContext(groupLiteral);
  for (const parts of groups) {
    fragments = new Map(await Promise.all(parts.map(async part => [
      part, await readFile(new URL(`../apps/clada/${part}`, import.meta.url), 'utf8')
    ])));
    await loadRuntimeGroup(parts);
  }
} finally {
  globalThis.fetch = nativeFetch;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

// The shipped integrity checks must agree with the shipped source fragments.
for (const name of ['campaign-v7', 'plan-v8']) {
  const loader = await readFile(new URL(`../apps/rat/${name}.js`, import.meta.url), 'utf8');
  const expected = Number(loader.match(/const EXPECTED_LENGTH = (\d+)/)[1]);
  const count = Number(loader.match(/length: (\d+)/)[1]);
  const chunks = await Promise.all(Array.from({ length: count }, (_, index) =>
    readFile(new URL(`../apps/rat/${name}-source-${index + 1}.part`, import.meta.url), 'utf8')));
  const source = chunks.join('');
  assert.equal(source.length, expected, `${name} must pass its browser integrity check`);
  new vm.Script(source);
}

console.log('Runtime compatibility: byte-sliced CLADA groups compile, and RAT source packets match their integrity checks.');
