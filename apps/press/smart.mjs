import { createZip } from './zip.mjs';
import { compressImage, compressVideo, videoSupport } from './media.mjs';

const IMAGE = /\.(?:jpe?g|png|webp|heic|heif|avif)$/i;
const VIDEO = /\.(?:mp4|mov|webm|m4v|ogv|mpeg|mpg|3gp|mkv|avi)$/i;
const PRECOMPRESSED = /\.(?:zip|7z|rar|gz|bz2|xz|zst|br|jpg|jpeg|png|webp|heic|heif|avif|gif|mp3|aac|m4a|ogg|flac|opus|mp4|mov|mkv|avi|webm|pdf|docx|xlsx|pptx|epub|apk|ipa|jar)$/i;
const ZIP_MAX_FILE = 256 * 1024 * 1024;

export function classifyFile(file) {
  const name = file?.name || '';
  const type = file?.type || '';
  if (IMAGE.test(name) || /^image\/(?:jpeg|png|webp|heic|heif|avif)$/.test(type)) return 'photo';
  // Animated GIF, APNG and SVG must not be flattened into a still image.
  if (VIDEO.test(name) || /^video\//.test(type)) return 'video';
  return 'other';
}

export function uniqueBundlePaths(items) {
  const used = new Set();
  return items.map((item, index) => {
    const name = item.resultName || item.file.name;
    let path = name;
    let suffix = 2;
    while (used.has(path)) {
      const dot = name.lastIndexOf('.');
      path = dot > 0 ? name.slice(0, dot) + ' (' + suffix++ + ')' + name.slice(dot) : name + ' (' + suffix++ + ')';
    }
    used.add(path);
    return { blob: item.result, path };
  });
}

export async function compressAny(file, options = {}) {
  if (options.signal?.aborted) throw new Error('Операция отменена.');
  const kind = classifyFile(file);
  if (kind === 'photo') {
    const result = await compressImage(file, options);
    return { ...result, kind: 'Фото', note: result.unchanged ? 'Уже оптимально: оставлен оригинал' : 'Изображение перекодировано' };
  }
  if (kind === 'video') {
    const support = videoSupport({ keepAudio: options.keepAudio !== false });
    if (!support.supported) {
      return { blob: file, name: file.name, unchanged: true, kind: 'Видео',
        note: 'Без перекодировки: ' + support.message };
    }
    try {
      const result = await compressVideo(file, options);
      return { ...result, kind: 'Видео',
        note: result.unchanged ? 'Перекодировка не уменьшила файл: оставлен оригинал' : 'Видео перекодировано' };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return { blob: file, name: file.name, unchanged: true, kind: 'Видео',
        note: 'Видео оставлено без изменений: ' + (error?.message || String(error)) };
    }
  }
  if (PRECOMPRESSED.test(file.name)) {
    return { blob: file, name: file.name, unchanged: true, kind: 'Файл',
      note: 'Формат уже сжат: оставлен оригинал' };
  }
  if (file.size > ZIP_MAX_FILE) {
    return { blob: file, name: file.name, unchanged: true, kind: 'Файл',
      note: 'Больше 256 МБ: оставлен оригинал' };
  }
  const zip = await createZip([{ blob: file, path: file.name }], {
    signal: options.signal,
    onProgress: fraction => options.onProgress?.(fraction)
  });
  if (options.signal?.aborted) throw new Error('Операция отменена.');
  if (zip.size >= file.size) {
    return { blob: file, name: file.name, unchanged: true, kind: 'Файл',
      note: 'ZIP не уменьшил размер: оставлен оригинал' };
  }
  return { blob: zip, name: file.name + '.zip', unchanged: false, kind: 'ZIP',
    note: 'ZIP без потерь: исходный файл внутри архива' };
}
