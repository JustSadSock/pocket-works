import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectBinaryBytes, selectResolver, validateResolverPack } from '../binary-inspector.js';

test('recognizes EU5 binary header and creates stable diagnostics', () => {
  const bytes = new TextEncoder().encode('EU5bin\nversion=1.3.2\ndate=1450.5.2\n\u0001\u0002\u0001\u0002');
  const report = inspectBinaryBytes(bytes, { fileName: 'ironman.eu5' });
  assert.equal(report.recognized, true);
  assert.equal(report.versionHint, '1.3.2');
  assert.equal(report.fingerprint.length, 8);
  assert.equal(report.resolver.status, 'missing');
});

test('validates and selects resolver metadata without pretending to decode', () => {
  const pack = { id: 'eu5-1.3-test', game: 'eu5', versions: ['1.3.2'], tokens: { '0x0001': 'date' } };
  assert.equal(validateResolverPack(pack).valid, true);
  assert.equal(selectResolver([pack], '1.3.2').id, 'eu5-1.3-test');
  assert.equal(validateResolverPack({ id: 'bad', game: 'eu5', tokens: { nope: '' } }).valid, false);
});
