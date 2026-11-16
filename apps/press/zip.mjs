// Self-contained ZIP32 reader/writer. No network dependencies, no eval.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_ITEMS = 1024;
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function u16(v, p) { return v.getUint16(p, true); }
function u32(v, p) { return v.getUint32(p, true); }
function w16(v, p, n) { v.setUint16(p, n, true); }
function w32(v, p, n) { v.setUint32(p, n >>> 0, true); }
function fail(message) { throw new Error(message); }

export function cleanPath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.startsWith('/') ||
      path.includes('\0') || /^[a-zA-Z]:/.test(path)) fail('Небезопасное имя файла в архиве.');
  const pieces = path.split('/');
  if (pieces.some(part => !part || part === '.' || part === '..' || part.includes(':'))) {
    fail('Архив содержит небезопасный путь.');
  }
  return pieces.join('/');
}
export function prettyBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ'];
  const n = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** n).toLocaleString('ru-RU', { maximumFractionDigits: n === 1 ? 0 : 1 })} ${units[Math.min(n - 1, 2)]}`;
}
async function transform(blob, kind) {
  const stream = kind === 'compress' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(blob.stream().pipeThrough(stream)).arrayBuffer());
}
function zipDate(date) {
  const d = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  return {
    time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31),
    date: ((Math.max(0, d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
  };
}
export async function createZip(items, { onProgress = () => {}, signal } = {}) {
  if (!Array.isArray(items) || !items.length) fail('Добавь файлы в архив.');
  if (items.length > MAX_ITEMS) fail('Максимум 1024 файла в одном архиве.');
  const used = new Set(), parts = [], records = [];
  let offset = 0, total = 0;
  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) fail('Операция отменена.');
    const item = items[i], blob = item.blob || item.file;
    if (!(blob instanceof Blob)) fail('Отсутствует файл для упаковки.');
    const name = cleanPath(item.path || blob.name || `file-${i + 1}`);
    if (used.has(name)) fail(`Повторяется путь: ${name}`);
    used.add(name);
    total += blob.size;
    if (blob.size > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) fail('Превышен безопасный лимит 256 МБ на файл / 512 МБ суммарно.');
    const raw = new Uint8Array(await blob.arrayBuffer());
    if (signal?.aborted) fail('Операция отменена.');
    let compressed = raw, method = 0;
    if (raw.length && typeof CompressionStream !== 'undefined') {
      try {
        const output = await transform(blob, 'compress');
        if (output.length < raw.length) { compressed = output; method = 8; }
      } catch { /* Store files if raw deflate is unavailable. */ }
    }
    const nameBytes = encoder.encode(name);
    if (nameBytes.length > 65535) fail('Слишком длинный путь файла.');
    const crc = crc32(raw);
    const { date, time } = zipDate(item.date || new Date(blob.lastModified || Date.now()));
    const local = new Uint8Array(30 + nameBytes.length), lv = view(local);
    w32(lv, 0, SIG_LOCAL); w16(lv, 4, 20); w16(lv, 6, 0x800); w16(lv, 8, method);
    w16(lv, 10, time); w16(lv, 12, date); w32(lv, 14, crc);
    w32(lv, 18, compressed.length); w32(lv, 22, raw.length); w16(lv, 26, nameBytes.length);
    local.set(nameBytes, 30);
    parts.push(local, compressed);
    records.push({ nameBytes, crc, method, date, time, compressedSize: compressed.length, size: raw.length, offset });
    offset += local.byteLength + compressed.length;
    onProgress((i + 1) / items.length, name);
  }
  const centralStart = offset;
  for (const r of records) {
    const header = new Uint8Array(46 + r.nameBytes.length), v = view(header);
    w32(v, 0, SIG_CENTRAL); w16(v, 4, 20); w16(v, 6, 20); w16(v, 8, 0x800);
    w16(v, 10, r.method); w16(v, 12, r.time); w16(v, 14, r.date);
    w32(v, 16, r.crc); w32(v, 20, r.compressedSize); w32(v, 24, r.size);
    w16(v, 28, r.nameBytes.length); w32(v, 42, r.offset);
    header.set(r.nameBytes, 46); parts.push(header); offset += header.length;
  }
  const end = new Uint8Array(22), v = view(end);
  w32(v, 0, SIG_END); w16(v, 8, records.length); w16(v, 10, records.length);
  w32(v, 12, offset - centralStart); w32(v, 16, centralStart);
  parts.push(end);
  return new Blob(parts, { type: 'application/zip' });
}

export async function readZip(blob) {
  if (!(blob instanceof Blob) || blob.size < 22) fail('Файл не является ZIP-архивом.');
  if (blob.size > 1024 * 1024 * 1024) fail('Архив больше 1 ГБ: обработка на этом устройстве ограничена.');
  const tailOffset = Math.max(0, blob.size - 65557);
  const tail = new Uint8Array(await blob.slice(tailOffset).arrayBuffer()), tv = view(tail);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tv, i) === SIG_END && i + 22 + u16(tv, i + 20) === tail.length) { end = i; break; }
  }
  if (end < 0) fail('Не удалось найти каталог ZIP.');
  if (u16(tv, end + 4) || u16(tv, end + 6)) fail('Многотомные ZIP не поддерживаются.');
  const count = u16(tv, end + 10), centralSize = u32(tv, end + 12), centralOffset = u32(tv, end + 16);
  if (count === 65535 || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail('ZIP64 пока не поддерживается.');
  if (count > MAX_ITEMS || centralSize > 16 * 1024 * 1024) fail('Слишком много файлов в архиве.');
  if (centralOffset + centralSize > blob.size || centralOffset + centralSize > tailOffset + end) fail('Повреждён каталог архива.');
  const data = new Uint8Array(await blob.slice(centralOffset, centralOffset + centralSize).arrayBuffer()), cv = view(data);
  const entries = [], seen = new Set();
  let cursor = 0, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > data.length || u32(cv, cursor) !== SIG_CENTRAL) fail('Повреждена запись в каталоге ZIP.');
    const flags = u16(cv, cursor + 8), method = u16(cv, cursor + 10), crc = u32(cv, cursor + 16);
    const compressedSize = u32(cv, cursor + 20), size = u32(cv, cursor + 24);
    const nameLen = u16(cv, cursor + 28), extraLen = u16(cv, cursor + 30), commentLen = u16(cv, cursor + 32);
    const external = u32(cv, cursor + 38), localOffset = u32(cv, cursor + 42);
    if (cursor + 46 + nameLen + extraLen + commentLen > data.length) fail('Повреждено имя файла ZIP.');
    const filename = decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLen));
    cursor += 46 + nameLen + extraLen + commentLen;
    if (filename.endsWith('/')) continue;
    const name = cleanPath(filename);
    if (seen.has(name)) fail('Архив содержит повторяющиеся пути.');
    seen.add(name);
    if ((flags & 1) !== 0) fail('ZIP защищён паролем. Распаковка зашифрованных файлов недоступна.');
    if (method !== 0 && method !== 8) fail(`Метод сжатия ZIP не поддерживается: ${method}.`);
    if (size === 0xffffffff || compressedSize === 0xffffffff) fail('ZIP64 не поддерживается.');
    if (((external >>> 16) & 0xf000) === 0xa000) fail('Символические ссылки в архивах запрещены.');
    total += size;
    if (size > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) fail('Архив слишком большой после распаковки (лимит 512 МБ).');
    if (localOffset + 30 > centralOffset) fail('Неверное смещение файла в ZIP.');
    entries.push({ name, size, compressedSize, crc, method, flags, localOffset });
  }
  return entries;
}
export async function extractEntry(blob, entry) {
  const local = view(new Uint8Array(await blob.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer()));
  if (u32(local, 0) !== SIG_LOCAL) fail('Локальный заголовок файла повреждён.');
  const flags = u16(local, 6), method = u16(local, 8);
  if (flags & 1 || method !== entry.method) fail('Заголовок ZIP не совпадает с каталогом.');
  const start = entry.localOffset + 30 + u16(local, 26) + u16(local, 28);
  const end = start + entry.compressedSize;
  if (end > blob.size) fail('Файл в архиве обрезан.');
  const compressed = blob.slice(start, end);
  let bytes;
  if (entry.method === 0) bytes = new Uint8Array(await compressed.arrayBuffer());
  else {
    if (typeof DecompressionStream === 'undefined') fail('Браузер не поддерживает распаковку DEFLATE.');
    try { bytes = await transform(compressed, 'decompress'); }
    catch { fail('Ошибка распаковки. Архив может быть повреждён.'); }
  }
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) fail('Проверка целостности CRC32 не пройдена.');
  return new Blob([bytes], { type: 'application/octet-stream' });
}
