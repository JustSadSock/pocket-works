import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { createZip, readZip, extractEntry, prettyBytes } from './zip.mjs';
import { compressImage, compressVideo, videoSupport } from './media.mjs';
import { compressAny, uniqueBundlePaths } from './smart.mjs';

installMobileRuntime();
const $ = id => document.getElementById(id);
const COPY = {
  photo: { title: 'Уменьшить фото', desc: 'Меньше мегабайтов, та же фотография. Без загрузки на сервер.', index: '01', drop: 'Добавить фотографии', subtitle: 'JPEG, PNG, HEIC, WebP и AVIF', action: 'Сжать фото' },
  video: { title: 'Уменьшить видео', desc: 'Перекодировка с выбранным качеством. Время обработки зависит от длительности ролика.', index: '02', drop: 'Добавить видео', subtitle: 'MP4, MOV, WebM — если браузер умеет их открыть', action: 'Сжать видео' },
  smart: { title: 'Сжать любые файлы', desc: 'Добавь фото, видео и документы вместе. Способ обработки выбирается для каждого файла.', index: '03', drop: 'Добавить любые файлы', subtitle: 'Фото · видео · PDF · документы · аудио · другое', action: 'Обработать файлы' },
  pack: { title: 'Создать ZIP', desc: 'Несколько файлов или папка в одном архиве. Исходники не меняются.', index: '04', drop: 'Собрать файлы в ZIP', subtitle: 'Любые файлы — вместе с именами и папками', action: 'Создать архив' },
  unpack: { title: 'Распаковать ZIP', desc: 'Открой архив, проверь содержимое и сохрани нужные файлы.', index: '05', drop: 'Открыть ZIP-архив', subtitle: 'Обычные ZIP без пароля и ZIP64', action: 'Распаковать' }
};
const queues = { photo: [], video: [], smart: [], pack: [], unpack: [] };
const messages = { photo: 'Добавь фотографии, чтобы начать.', video: 'Добавь видео, чтобы начать.', smart: 'Выбери файлы любых типов.', pack: 'Выбери файлы для архива.', unpack: 'Выбери один ZIP-архив.' };
let mode = 'photo', busy = false, controller = null, serial = 0;
let packed = null, unpacked = [], bundle = null;
const cached = (() => { try { return JSON.parse(localStorage.getItem('pocket-works:press:prefs') || '{}'); } catch { return {}; } })();
$('quality').value = ['high', 'balanced', 'small'].includes(cached.quality) ? cached.quality : 'balanced';
$('format').value = ['jpeg', 'webp'].includes(cached.format) ? cached.format : 'webp';
$('keepAudio').checked = cached.keepAudio !== false;
function persist() {
  try { localStorage.setItem('pocket-works:press:prefs', JSON.stringify({ quality: $('quality').value, format: $('format').value, keepAudio: $('keepAudio').checked })); } catch {}
}
['quality', 'format', 'keepAudio'].forEach(id => $(id).addEventListener('change', persist));
$('keepAudio').addEventListener('change', () => { if (mode === 'video') render(); });
const current = () => queues[mode];
function message(text) { messages[mode] = text; $('stateMsg').textContent = text; }
function indicate(value, detail) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  $('progressBar').style.width = percent + '%';
  $('progress').setAttribute('aria-valuenow', String(percent));
  if (detail) message(detail + ' · ' + percent + '%');
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('[data-mode]').forEach(button => button.disabled = busy);
  $('actionBtn').disabled = busy || !current().length;
  $('chooseBtn').disabled = busy;
  $('folderBtn').disabled = busy;
  $('stopBtn').classList.toggle('hidden', !busy);
  $('progress').classList.toggle('hidden', !busy);
  if (!busy) $('progressBar').style.width = '0%';
}
function element(tag, classname, value) {
  const el = document.createElement(tag);
  if (classname) el.className = classname;
  if (value != null) el.textContent = value;
  return el;
}
function addButton(parent, title, classname, handler, disabled = false) {
  const button = element('button', classname, title);
  button.type = 'button'; button.setAttribute('aria-label', title);
  button.disabled = disabled; button.addEventListener('click', handler); parent.append(button);
  return button;
}
function canShareFiles() {
  try { return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['x'], 'probe.txt', { type: 'text/plain' })] }); } catch { return false; }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.style.display = 'none';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function extension(name) {
  return (name.split('.').pop() || 'FILE').toUpperCase().slice(0,4);
}
function fileRow({ title, sub, detail, label, error = false, onDownload, onRemove }) {
  const row = element('li', 'file-row' + (onDownload ? ' is-done' : error ? ' is-error' : ''));
  row.append(element('span', 'file-glyph', label || extension(title)));
  const middle = element('div', 'file-detail'), nameEl = element('div', 'file-name', title);
  nameEl.title = title;
  const subEl = element('div', 'file-sub' + (error ? ' error' : onDownload ? ' saved' : ''), sub);
  middle.append(nameEl, subEl);
  if (detail) middle.append(element('div', 'file-sub', detail));
  row.append(middle);
  const actions = element('div', 'file-actions');
  if (onDownload) addButton(actions, '↓', 'download', onDownload).setAttribute('aria-label', 'Скачать ' + title);
  if (onRemove) addButton(actions, '×', '', onRemove, busy).setAttribute('aria-label', 'Убрать ' + title);
  row.append(actions);
  return row;
}
function renderQueue() {
  const items = current();
  $('queue').replaceChildren();
  $('queueCount').textContent = items.length + (items.length === 1 ? ' ФАЙЛ' : ' ФАЙЛОВ');
  $('empty').classList.toggle('hidden', items.length > 0);
  for (const item of items) {
    const isResult = Boolean(item.result);
    const difference = isResult ? item.file.size - item.result.size : 0;
    const sub = item.error ? item.error :
      isResult ? (difference > 0 ? prettyBytes(item.file.size) + ' → ' + prettyBytes(item.result.size) + ' · −' + Math.round(difference / item.file.size * 100) + '%' : 'Уже оптимально · ' + prettyBytes(item.file.size)) :
      prettyBytes(item.file.size) + (mode === 'pack' && item.path !== item.file.name ? ' · ' + item.path : '');
    $('queue').append(fileRow({
      title: item.file.name, sub, detail: mode === 'smart' && isResult ? item.note : null,
      label: extension(item.file.name), error: Boolean(item.error),
      onDownload: isResult && (mode === 'photo' || mode === 'video' || mode === 'smart') ? () => download(item.result, item.resultName) : null,
      onRemove: !busy ? () => {
        queues[mode] = current().filter(entry => entry.id !== item.id);
        if (mode === 'pack') packed = null;
        if (mode === 'unpack') unpacked = [];
        bundle = null; render();
      } : null
    }));
  }
  $('archiveBox').classList.toggle('hidden', mode !== 'unpack' || unpacked.length === 0);
  if (mode === 'unpack' && unpacked.length) {
    $('archiveCount').textContent = unpacked.length + ' ФАЙЛОВ';
    $('archiveEntries').replaceChildren();
    for (const item of unpacked) {
      $('archiveEntries').append(fileRow({
        title: item.name, sub: prettyBytes(item.blob.size) + ' · CRC32 ✓', label: extension(item.name),
        onDownload: () => download(item.blob, item.name.split('/').pop())
      }));
    }
  }
}
function renderResult() {
  const items = current();
  const finished = items.filter(item => item.result);
  const before = finished.reduce((n, item) => n + item.file.size, 0);
  const after = finished.reduce((n, item) => n + item.result.size, 0);
  const report = mode === 'photo' || mode === 'video' || mode === 'smart';
  $('sizeReport').classList.toggle('hidden', !report || !finished.length);
  if (report && finished.length) {
    $('beforeSize').textContent = prettyBytes(before);
    $('afterSize').textContent = prettyBytes(after);
    const pct = before ? (before - after) / before : 0;
    $('saving').textContent = pct > 0 ? '−' + Math.round(pct * 100) + '%' : '0%';
    $('resultBar').style.width = (before ? Math.max(3, 100 * after / before) : 100) + '%';
  }
  const all = $('allBtn');
  if (mode === 'pack' && packed) { all.classList.remove('hidden'); all.textContent = 'Скачать ' + packed.name; }
  else if (mode === 'unpack' && unpacked.length) { all.classList.remove('hidden'); all.textContent = canShareFiles() ? 'Поделиться распакованными' : typeof window.showDirectoryPicker === 'function' ? 'Сохранить всё в папку' : 'Сохранить всё ZIP'; }
  else if (bundle && (mode === 'photo' || mode === 'video' || mode === 'smart')) { all.classList.remove('hidden'); all.textContent = 'Скачать всё одним ZIP'; }
  else all.classList.add('hidden');
}
function render() {
  const copy = COPY[mode], packMode = mode === 'pack', unpackMode = mode === 'unpack', videoMode = mode === 'video', smartMode = mode === 'smart';
  document.querySelectorAll('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('modeTitle').textContent = copy.title;
  $('modeTitle').append(element('span', 'period', '.'));
  $('modeDesc').textContent = copy.desc;
  $('modeIndex').textContent = 'ОПЕРАЦИЯ ' + copy.index + ' / 05';
  $('dropTitle').textContent = copy.drop;
  $('dropSubtitle').textContent = copy.subtitle;
  $('queueTitle').textContent = unpackMode ? 'Выбранный архив' : 'Файлы';
  $('mediaSettings').classList.toggle('hidden', packMode || unpackMode);
  $('packSettings').classList.toggle('hidden', !packMode);
  $('unpackSettings').classList.toggle('hidden', !unpackMode);
  $('format').classList.toggle('hidden', videoMode);
  $('formatCaption').textContent = videoMode ? (videoSupport({ keepAudio: $('keepAudio').checked }).supported ? videoSupport({ keepAudio: $('keepAudio').checked }).extension.toUpperCase() + ' · выбран браузером' : 'НЕ ПОДДЕРЖИВАЕТСЯ') : smartMode ? 'ФОТО → WEBP / JPEG' : 'WEBP / JPEG';
  $('audioWrap').classList.toggle('hidden', !(videoMode || smartMode));
  $('folderBtn').classList.toggle('hidden', !(packMode || smartMode) || !('webkitdirectory' in $('folderPicker')));
  $('techHint').textContent = smartMode ? 'Фото уменьшаются, видео перекодируются при поддержке браузера, документы и другие файлы сжимаются в ZIP без потерь. Если размер не уменьшился, останется оригинал.' : videoMode ? 'Видео перекодируется в реальном времени. MP4 / MOV / WebM работают, если браузер их декодирует. Не закрывай экран.' : 'Если сжатый файл выходит больше исходного, сохраняется оригинал. Прозрачность сохраняется в WebP.';
  $('picker').multiple = !unpackMode;
  $('picker').accept = mode === 'photo' ? 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif' : mode === 'video' ? 'video/*,.mov,.mp4,.webm,.m4v,.mkv,.avi,.mpeg,.3gp' : unpackMode ? '.zip,application/zip' : '';
  $('stateMsg').textContent = messages[mode];
  $('actionBtn').disabled = busy || !current().length;
  $('actionBtn').firstChild.textContent = copy.action + ' ';
  renderQueue(); renderResult();
}
function validForMode(file) {
  if (mode === 'photo') return /\.(png|jpe?g|webp|heic|heif|avif)$/i.test(file.name) || /^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.type);
  if (mode === 'video') return /^video\//.test(file.type) || /\.(mp4|mov|webm|m4v|ogv|mkv|avi|mpeg|mpg|3gp)$/i.test(file.name);
  if (mode === 'unpack') return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  return true;
}
function addFiles(files) {
  if (busy) return;
  let accepted = 0, rejected = 0;
  const existing = new Set(current().map(item => item.path + ':' + item.file.size + ':' + item.file.lastModified));
  if (mode === 'unpack') { queues.unpack = []; unpacked = []; }
  for (const file of Array.from(files || [])) {
    if (!validForMode(file)) { rejected++; continue; }
    if (current().length >= ((mode === 'pack' || mode === 'smart') ? 1024 : 128)) { rejected++; continue; }
    const path = (mode === 'pack' || mode === 'smart') ? (file.webkitRelativePath || file.name) : file.name;
    const key = path + ':' + file.size + ':' + file.lastModified;
    if (existing.has(key)) continue;
    existing.add(key);
    current().push({ id: ++serial, file, path, result: null, resultName: '', error: null });
    accepted++;
    if (mode === 'unpack') break;
  }
  if (mode === 'pack') packed = null;
  if (mode === 'unpack') unpacked = [];
  bundle = null;
  message(accepted ? 'Добавлено: ' + accepted + (rejected ? '. Пропущено неподходящих: ' + rejected : '') : rejected ? 'Неподходящий формат файла.' : 'Эти файлы уже в списке.');
  render();
}
async function handleAction() {
  if (busy || !current().length) return;
  controller = new AbortController();
  const activeMode = mode, items = current();
  setBusy(true);
  $('actionBtn').disabled = true;
  message('Подготовка к обработке…');
  indicate(0);
  let failed = 0, cancelled = false;
  try {
    if (activeMode === 'pack') {
      packed = null;
      const blob = await createZip(items.map(item => ({ blob:item.file, path:item.path })), {
        signal: controller.signal,
        onProgress: (value, name) => indicate(value, 'Упаковка: ' + name)
      });
      const name = ($('archiveName').value.trim().replace(/[\\/:*?"<>|]/g, '-') || 'Архив').replace(/\.zip$/i, '') + '.zip';
      packed = { blob, name };
      message('ZIP готов: ' + prettyBytes(blob.size) + ' · ' + items.length + ' файлов.');
    } else if (activeMode === 'unpack') {
      unpacked = [];
      const zip = items[0].file;
      const entries = await readZip(zip);
      if (!entries.length) throw new Error('В архиве нет файлов.');
      const results = [];
      for (let i = 0; i < entries.length; i++) {
        if (controller.signal.aborted) throw new Error('Операция отменена.');
        const entry = entries[i], blob = await extractEntry(zip, entry);
        results.push({ name: entry.name, blob });
        indicate((i + 1) / entries.length, 'Распаковка: ' + entry.name);
      }
      unpacked = results;
      message('Распаковано ' + results.length + ' файлов. Проверка CRC32 пройдена.');
    } else {
      bundle = null;
      const media = activeMode === 'photo' ? compressImage : activeMode === 'video' ? compressVideo : compressAny;
      for (let i = 0; i < items.length; i++) {
        if (controller.signal.aborted) { cancelled = true; break; }
        const item = items[i];
        item.error = null; item.result = null; item.note = null;
        try {
          const result = await media(item.file, {
            quality: $('quality').value, format: $('format').value, keepAudio: $('keepAudio').checked,
            signal: controller.signal, monitor: $('videoMonitor'),
            onProgress: fraction => indicate((i + fraction) / items.length, 'Обработка: ' + item.file.name)
          });
          item.result = result.blob; item.resultName = result.name; item.note = result.note || null;
        } catch (error) {
          item.error = error?.message || String(error); failed++;
        }
        indicate((i + 1) / items.length, 'Обработано: ' + (i + 1) + ' / ' + items.length);
        renderQueue(); renderResult();
      }
      const done = items.filter(item => item.result);
      if (done.length > 1 && !controller.signal.aborted) {
        message('Собираем ZIP с готовыми файлами…');
        try {
          const blob = await createZip(uniqueBundlePaths(done), { signal: controller.signal });
          bundle = { blob, name: 'Пресс — готовые файлы.zip' };
        } catch { bundle = null; }
      }
      if (controller.signal.aborted) cancelled = true;
      const untouched = activeMode === 'smart' ? done.filter(item => item.result === item.file).length : 0;
      message(cancelled ? 'Обработка отменена. Готовые файлы сохранены в списке.' :
        'Готово: ' + done.length + ' из ' + items.length + (untouched ? '. Без уменьшения: ' + untouched : '') + (failed ? '. Ошибок: ' + failed + '. Проверь строки файлов.' : '.') );
    }
  } catch (error) {
    message(controller.signal.aborted ? 'Операция отменена.' : 'Ошибка: ' + (error?.message || error));
  } finally {
    controller = null;
    setBusy(false);
    render();
  }
}
$('chooseBtn').addEventListener('click', () => $('picker').click());
$('folderBtn').addEventListener('click', () => $('folderPicker').click());
$('picker').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
$('folderPicker').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
$('drop').addEventListener('keydown', event => {
  if (event.target !== $('drop') || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault(); if (!busy) $('picker').click();
});
$('drop').addEventListener('dragover', event => { if (busy) return; event.preventDefault(); $('drop').classList.add('dragover'); });
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('dragover'));
$('drop').addEventListener('drop', event => {
  event.preventDefault(); $('drop').classList.remove('dragover');
  if (!busy) addFiles(event.dataTransfer?.files);
});
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  mode = button.dataset.mode;
  render();
}));
$('actionBtn').addEventListener('click', handleAction);
$('stopBtn').addEventListener('click', () => controller?.abort());
$('allBtn').addEventListener('click', () => {
  if (mode === 'pack' && packed) download(packed.blob, packed.name);
  else if (mode === 'unpack' && unpacked.length) {
    if (canShareFiles() && typeof navigator.share === 'function') {
      const files = unpacked.map(item => new File([item.blob], item.name.split('/').pop(), { type:'application/octet-stream' }));
      navigator.share({ files, title:'Распакованные файлы' }).catch(error => { if (error?.name !== 'AbortError') message('Не получилось поделиться: ' + error.message); });
    } else if (typeof window.showDirectoryPicker === 'function') {
      (async () => {
        const root = await window.showDirectoryPicker();
        let folder = await root.getDirectoryHandle('Пресс - ' + Date.now(), { create: true });
        for (const item of unpacked) {
          const parts = item.name.split('/'); let dir = folder;
          for (const name of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(name, { create: true });
          const handle = await dir.getFileHandle(parts.at(-1), { create: true });
          const writer = await handle.createWritable(); await writer.write(item.blob); await writer.close();
        }
        message('Файлы сохранены в выбранную папку.');
      })().catch(error => { if (error?.name !== 'AbortError') message('Ошибка сохранения: ' + error.message); });
    } else download(current()[0].file, current()[0].file.name);
  }
  else if (bundle) download(bundle.blob, bundle.name);
});
createWorkshopMode({
  appName: 'Пресс', version: '1.1.0', cachePrefix: 'press-', storageNamespace: 'pocket-works:press',
  onReset() { try { localStorage.removeItem('pocket-works:press:prefs'); } catch {} location.reload(); }
});
render();
