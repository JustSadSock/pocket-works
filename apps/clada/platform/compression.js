const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function transform(bytes, StreamType, format) {
  const readable = new Blob([bytes]).stream().pipeThrough(new StreamType(format));
  return new Uint8Array(await new Response(readable).arrayBuffer());
}

export async function compressJson(payload) {
  const json = JSON.stringify(payload);
  const bytes = encoder.encode(json);
  if (typeof CompressionStream === 'function') {
    try {
      const compressed = await transform(bytes, CompressionStream, 'gzip');
      return { bytes: compressed, compressed: true, mime: 'application/gzip', extension: '.json.gz' };
    } catch { /* Safari versions with partial CompressionStream support */ }
  }
  return { bytes, compressed: false, mime: 'application/json', extension: '.json' };
}

export async function decompressJson(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  let decoded = bytes;
  if (gzip) {
    if (typeof DecompressionStream !== 'function') throw new Error('Этот браузер не умеет распаковывать gzip-архивы');
    decoded = await transform(bytes, DecompressionStream, 'gzip');
  }
  return JSON.parse(decoder.decode(decoded));
}
