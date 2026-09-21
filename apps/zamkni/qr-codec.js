const QR_SIGNAL_PREFIX = 'PWQ1.';

export async function encodePairingQrPayload(signal) {
  if (typeof signal !== 'string' || !signal.startsWith('PWL1.')) {
    throw new TypeError('Not a PocketLAN signal');
  }
  if (typeof CompressionStream !== 'function') return signal;
  try {
    const compressed = await transformBytes(
      new TextEncoder().encode(signal),
      new CompressionStream('gzip')
    );
    const packed = `${QR_SIGNAL_PREFIX}${bytesToBase64Url(compressed)}`;
    return packed.length < signal.length ? packed : signal;
  } catch {
    return signal;
  }
}

export async function decodePairingQrPayload(payload) {
  const value = String(payload || '').trim();
  if (value.startsWith('PWL1.')) return value;
  if (!value.startsWith(QR_SIGNAL_PREFIX)) {
    throw new TypeError('Это не QR-код PocketLAN.');
  }
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Браузер не умеет распаковать этот QR. Используй ручной код.');
  }
  const bytes = base64UrlToBytes(value.slice(QR_SIGNAL_PREFIX.length));
  const decoded = await transformBytes(bytes, new DecompressionStream('gzip'));
  const signal = new TextDecoder().decode(decoded);
  if (!signal.startsWith('PWL1.')) throw new TypeError('QR-код повреждён.');
  return signal;
}

async function transformBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export const ZAMKNI_QR = Object.freeze({
  signalPrefix: QR_SIGNAL_PREFIX
});
