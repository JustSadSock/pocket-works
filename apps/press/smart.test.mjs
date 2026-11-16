import test from 'node:test';
import assert from 'node:assert/strict';
import { compressAny, classifyFile, uniqueBundlePaths } from './smart.mjs';
import { readZip, extractEntry } from './zip.mjs';

function file(data, name, type = 'application/octet-stream') {
  return Object.assign(new Blob([data], { type }), { name });
}

test('auto classification covers images, browsers video names, and arbitrary files', () => {
  assert.equal(classifyFile(file('', 'picture.heic')), 'photo');
  assert.equal(classifyFile(file('', 'movie.MOV')), 'video');
  assert.equal(classifyFile(file('', 'movie.mkv')), 'video');
  assert.equal(classifyFile(file('', 'voice.ogg', 'audio/ogg')), 'other');
  assert.equal(classifyFile(file('', 'animation.gif', 'image/gif')), 'other');
  assert.equal(classifyFile(file('', 'report.pdf', 'application/pdf')), 'other');
  assert.equal(classifyFile(file('', 'letter.txt', 'text/plain')), 'other');
});

test('text files compress into a lossless ZIP that extracts byte-perfectly', async () => {
  const original = file('Привет из Пресса!\n'.repeat(800), 'notes.txt', 'text/plain');
  const output = await compressAny(original);
  assert.equal(output.name, 'notes.txt.zip');
  assert.equal(output.kind, 'ZIP');
  assert.ok(output.blob.size < original.size);
  const entries = await readZip(output.blob);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'notes.txt');
  assert.deepEqual(
    new Uint8Array(await (await extractEntry(output.blob, entries[0])).arrayBuffer()),
    new Uint8Array(await original.arrayBuffer())
  );
});

test('already compressed and incompressible inputs remain unchanged', async () => {
  const archive = file(new Uint8Array([0,1,2,3]), 'data.7z');
  const saved = await compressAny(archive);
  assert.strictEqual(saved.blob, archive);
  assert.equal(saved.unchanged, true);
  const short = file('x', 'tiny.txt');
  const small = await compressAny(short);
  assert.strictEqual(small.blob, short);
  assert.equal(small.unchanged, true);
});

test('unsupported video is returned unchanged, not falsely reported as compressed', async () => {
  const source = file(new Uint8Array([1,2,3]), 'clip.mov', 'video/quicktime');
  const result = await compressAny(source);
  assert.strictEqual(result.blob, source);
  assert.match(result.note, /без перекодировки/i);
});

test('mixed-result ZIP resolves duplicate names and preserves relative folders', () => {
  const blob = new Blob(['a']);
  const files = [
    { path:'folder/file.txt', file: { name:'file.txt' }, resultName:'file.txt.zip', result:blob },
    { path:'folder/file.txt.zip', file: { name:'file.txt.zip' }, resultName:'file.txt.zip', result:blob },
    { path:'other/file.txt', file: { name:'file.txt' }, resultName:'file.txt.zip', result:blob }
  ];
  assert.deepEqual(uniqueBundlePaths(files).map(x=>x.path), [
    'folder/file.txt.zip', 'folder/file.txt (2).zip', 'other/file.txt.zip'
  ]);
});

test('cancelled processing stops before reading any file', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => compressAny(file('text', 'notes.txt'), { signal: controller.signal }), /отменена/i);
});

test('unsupported image decoding retains the original in all-files mode', async () => {
  const original = file('not a real HEIC', 'photo.heic', 'image/heic');
  const result = await compressAny(original);
  assert.strictEqual(result.blob, original);
  assert.equal(result.unchanged, true);
  assert.match(result.note, /без изменений/i);
});
