import assert from 'node:assert/strict';
import { decodePairingQrPayload, encodePairingQrPayload } from './qr-codec.js';

const raw = 'PWL1.' + JSON.stringify({
  schema: 'pocket-lan-signal',
  wireVersion: 1,
  kind: 'offer',
  applicationId: 'zamkni',
  protocolVersion: 1,
  description: {
    type: 'offer',
    sdp: Array.from({ length: 48 }, (_, i) =>
      `a=candidate:${i} 1 UDP 2122260223 host-${i}.local 5000 typ host\r\n`
    ).join('')
  }
});

const packed = await encodePairingQrPayload(raw);
assert.ok(packed.startsWith('PWQ1.') || packed === raw);
assert.equal(await decodePairingQrPayload(packed), raw);
assert.equal(await decodePairingQrPayload(raw), raw);

if (typeof CompressionStream === 'function') {
  assert.ok(packed.length < raw.length * 0.6, `expected useful compression: ${packed.length}/${raw.length}`);
}

await assert.rejects(() => decodePairingQrPayload('hello'), /QR-код PocketLAN/);
console.log('ZAMKNI QR codec tests pass.');
