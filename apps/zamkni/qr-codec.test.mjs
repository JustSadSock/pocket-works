import assert from 'node:assert/strict';
import { decodePairingQrPayload, encodePairingQrPayload } from './qr-codec.js';

const payload = {
  schema: 'pocket-lan-signal',
  wireVersion: 1,
  kind: 'offer',
  applicationId: 'zamkni',
  protocolVersion: 1,
  inviteId: 'invite-test',
  room: { id: 'room-test', name: 'Local match', maxPlayers: 4 },
  description: {
    type: 'offer',
    sdp: Array.from({ length: 24 }, (_, i) =>
      `a=candidate:${1234567890 + i} 1 UDP 2122260223 host-${i}.local ${5000 + i} typ host generation 0\r\n`
    ).join('')
  }
};

const raw = 'PWL1.' + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
const packed = await encodePairingQrPayload(raw);

assert.ok(packed.startsWith('PWQ1.') || packed === raw);
assert.equal(await decodePairingQrPayload(packed), raw);
assert.equal(await decodePairingQrPayload(raw), raw);

if (typeof CompressionStream === 'function') {
  assert.ok(packed.length < raw.length * 0.75, `expected useful compression: ${packed.length}/${raw.length}`);
}

await assert.rejects(() => decodePairingQrPayload('hello'), /QR-код PocketLAN/);
console.log(`ZAMKNI QR codec tests pass: ${raw.length} -> ${packed.length} chars.`);
