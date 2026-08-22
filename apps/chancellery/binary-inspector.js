const textDecoder = new TextDecoder('latin1');
const MAX_SCAN = 2 * 1024 * 1024;

function fnv1a(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}

export function isEu5BinaryBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const head = textDecoder.decode(bytes.slice(0, 32));
  return /^EU5(?:bin|binary)/i.test(head) || /^SAV0[12]/.test(head);
}

function printableStrings(bytes, minimum = 4) {
  const out = [];
  let current = '';
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) current += String.fromCharCode(byte);
    else {
      if (current.length >= minimum) out.push(current);
      current = '';
    }
    if (out.length >= 96) break;
  }
  if (current.length >= minimum && out.length < 96) out.push(current);
  return out;
}

export function validateResolverPack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return { valid: false, errors: ['Resolver должен быть JSON-объектом.'] };
  if (typeof pack.id !== 'string' || !pack.id.trim()) errors.push('Нужен непустой id.');
  if (typeof pack.game !== 'string' || pack.game.toLowerCase() !== 'eu5') errors.push('game должен быть eu5.');
  if (!pack.tokens || typeof pack.tokens !== 'object' || Array.isArray(pack.tokens)) errors.push('tokens должен быть объектом token→name.');
  else {
    for (const [token, name] of Object.entries(pack.tokens)) {
      if (!/^(?:0x)?[0-9a-f]+$/i.test(token) && !/^\d+$/.test(token)) { errors.push(`Некорректный token: ${token}`); break; }
      if (typeof name !== 'string' || !name.trim()) { errors.push(`Пустое имя token: ${token}`); break; }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function selectResolver(packs = [], versionHint = null) {
  const valid = packs.filter((pack) => validateResolverPack(pack).valid);
  if (!valid.length) return null;
  if (!versionHint) return valid.find((pack) => pack.default === true) || null;
  return valid.find((pack) => Array.isArray(pack.versions) && pack.versions.includes(versionHint))
    || valid.find((pack) => typeof pack.versionPrefix === 'string' && versionHint.startsWith(pack.versionPrefix))
    || valid.find((pack) => pack.default === true)
    || null;
}

export function inspectBinaryBytes(input, options = {}) {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bytes = source.slice(0, Math.min(source.length, MAX_SCAN));
  const strings = printableStrings(bytes);
  const joined = strings.join(' ');
  const versionHint = joined.match(/(?:version|game_version)[^0-9]{0,8}(\d+\.\d+(?:\.\d+)?)/i)?.[1]
    || joined.match(/\b(1\.\d+(?:\.\d+)?)\b/)?.[1]
    || null;
  const dateHint = joined.match(/\b(1[0-9]{3}\.[0-9]{1,2}\.[0-9]{1,2})\b/)?.[1] || null;
  const words = new Map();
  const start = Math.min(bytes.length, 16);
  for (let offset = start; offset + 1 < bytes.length && offset < 131072; offset += 2) {
    const value = bytes[offset] | (bytes[offset + 1] << 8);
    words.set(value, (words.get(value) || 0) + 1);
  }
  const commonWords = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([token, count]) => ({ token: `0x${token.toString(16).padStart(4, '0')}`, count }));
  const resolver = selectResolver(options.resolverPacks || [], versionHint);
  return {
    recognized: isEu5BinaryBytes(bytes),
    fileName: options.fileName || null,
    size: options.size ?? source.length,
    scannedBytes: bytes.length,
    fingerprint: fnv1a(bytes),
    header: textDecoder.decode(bytes.slice(0, 12)).replace(/[^\x20-\x7e]/g, '·'),
    versionHint,
    dateHint,
    printableSamples: strings.slice(0, 20),
    commonWords,
    resolver: resolver ? { status: 'matched', id: resolver.id } : { status: 'missing', id: null },
    limitations: [
      '16-битные слова ниже — диагностическая выборка, а не декодированные поля EU5.',
      'Без проверенного token resolver приложение не превращает бинарный gamestate в CampaignSnapshot.',
      'Отчёт предназначен для совместимости и отладки, а не для игровых выводов.'
    ]
  };
}

export async function inspectBinaryFile(file, options = {}) {
  const buffer = await file.slice(0, MAX_SCAN).arrayBuffer();
  return inspectBinaryBytes(new Uint8Array(buffer), { ...options, fileName: file.name, size: file.size });
}
