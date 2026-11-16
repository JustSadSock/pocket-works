import test from 'node:test';
import assert from 'node:assert/strict';
import { createZip, readZip, extractEntry, cleanPath } from './zip.mjs';
test('ZIP: roundtrip deflated Unicode paths and binary content', async () => {
  const phrase = new TextEncoder().encode('Привет! '.repeat(1000));
  const bin = new Uint8Array([0,1,255,0,127,99]);
  const blob = await createZip([{ blob: new Blob([phrase]), path: 'папка/текст.txt' }, { blob: new Blob([bin]), path: 'bin.dat' }]);
  const entries = await readZip(blob);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'папка/текст.txt');
  assert.equal(entries[0].method, 8);
  assert.deepEqual(new Uint8Array(await (await extractEntry(blob, entries[0])).arrayBuffer()), phrase);
  assert.deepEqual(new Uint8Array(await (await extractEntry(blob, entries[1])).arrayBuffer()), bin);
});
test('ZIP: rejects unsafe and duplicate names', async () => {
  assert.throws(() => cleanPath('../escape'), /небезопас/iu);
  await assert.rejects(createZip([{blob:new Blob(['a']),path:'a'},{blob:new Blob(['b']),path:'a'}]), /Повторяется/);
});
test('ZIP: detects payload corruption', async () => {
  const original = await createZip([{ blob: new Blob(['hello world']), path: 'hello.txt' }]);
  const raw = new Uint8Array(await original.arrayBuffer());
  raw[40] ^= 0xff;
  const altered = new Blob([raw]), entries = await readZip(altered);
  await assert.rejects(() => extractEntry(altered, entries[0]));
});
test('ZIP: rejects non ZIP inputs', async () => {
  await assert.rejects(readZip(new Blob(['garbage'])));
});
