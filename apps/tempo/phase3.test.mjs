import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptBackup,
  encryptBackup,
  hashPin,
  nextAction,
  scoreMedian,
  summarizeHome,
  verifyPin,
  weeklySeries
} from './phase3-core.js';

test('weekly series returns chronological medians', () => {
  const result = weeklySeries([
    { occurredAt: '2026-07-28T10:00:00Z', control: 2 },
    { occurredAt: '2026-07-29T10:00:00Z', control: 4 },
    { occurredAt: '2026-08-04T10:00:00Z', control: 5 }
  ]);
  assert.deepEqual(result.map((item) => item.value), [3, 5]);
  assert.equal(scoreMedian([1, 5, 3, 4]), 3.5);
});

test('next action guides onboarding and experiments', () => {
  assert.equal(nextAction(summarizeHome({}, {})).action, 'episode');
  const withBaseline = summarizeHome({ episodes: Array.from({ length: 3 }, (_, index) => ({ control: index + 2, pleasure: 3, occurredAt: `2026-08-0${index + 1}T10:00:00Z` })) }, {});
  assert.equal(nextAction(withBaseline).action, 'experiments');
});

test('PIN hashes and verifies without storing plaintext', async () => {
  const record = await hashPin('1234');
  assert.equal(await verifyPin('1234', record), true);
  assert.equal(await verifyPin('4321', record), false);
  assert.ok(!JSON.stringify(record).includes('1234'));
});

test('encrypted backup round-trips and rejects wrong passphrase', async () => {
  const payload = await encryptBackup({ 'pocket-works:tempo:state': '{"data":{"episodes":[]}}' }, 'strong-pass');
  const decoded = await decryptBackup(payload, 'strong-pass');
  assert.ok(decoded.storage['pocket-works:tempo:state']);
  await assert.rejects(() => decryptBackup(payload, 'wrong-pass'), /Incorrect passphrase/);
});
