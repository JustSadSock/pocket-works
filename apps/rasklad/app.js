import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { buildPackedLayout } from './layout-core.js';

installMobileRuntime();

const PAGE_W = 2480;
const PAGE_H = 3508;
const PAGE_ASPECT = PAGE_W / PAGE_H;
const MAX_IMAGES = 60;
const THUMB_MAX = 560;
const DEFAULT_DENSITY = 85;
const DENSITY_STORAGE_KEY = 'pocket-works:rasklad:density';

function readStoredDensity() {
  try {
    const value = Number(localStorage.getItem(DENSITY_STORAGE_KEY));
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

function persistDensity(value) {
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, String(value));
  } catch {
    // Storage is optional; density still works for the current session.
  }
}

const state = {
  images: [],
  layout: [],
  busy: false,
  density: readStoredDensity(),
  layoutSeed: null
};

const els = {
  fileInput: document.querySelector('#fileInput'),
  imageLayer: document.querySelector('#imageLayer'),
  emptyState: document.querySelector('#emptyState'),
  loadingState: document.querySelector('#loadingState'),
  loadingTitle: document.querySelector('#loadingTitle'),
  loadingDetail: document.querySelector('#loadingDetail'),
  shuffleButton: document.querySelector('#shuffleButton'),
  exportButton: document.querySelector('#exportButton'),
  clearButton: document.querySelector('#clearButton'),
  countLabel: document.querySelector('#countLabel'),
  densitySlider: document.querySelector('#densitySlider'),
  densityValue: document.querySelector('#densityValue'),
  dropZone: document.querySelector('#dropZone'),
  toast: document.querySelector('#toast')
};

let toastTimer = 0;
let densityTimer = 0;

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2600);
}

function pluralImages(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return count + ' изображение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return count + ' изображения';
  return count + ' изображений';
}

function setBusy(busy, title, detail) {
  state.busy = busy;
  els.loadingState.hidden = !busy;
  if (title) els.loadingTitle.textContent = title;
  if (detail) els.loadingDetail.textContent = detail;
  syncControls();
}

function syncDensityControl() {
  const value = Math.round(state.density);
  els.densitySlider.value = String(value);
  els.densitySlider.style.setProperty('--density-fill', value + '%');
  els.densityValue.value = value + '%';
  els.densityValue.textContent = value + '%';
}

function syncControls() {
  const hasImages = state.images.length > 0;
  els.shuffleButton.disabled = !hasImages || state.busy;
  els.exportButton.disabled = !hasImages || state.busy;
  els.clearButton.disabled = !hasImages || state.busy;
  els.fileInput.disabled = state.busy;
  els.densitySlider.disabled = state.busy;
  els.emptyState.hidden = hasImages || state.busy;
  els.countLabel.textContent = pluralImages(state.images.length);
  syncDensityControl();
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('encode'));
    }, type, quality);
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function tagPngDpi(blob, dpi = 300) {
  const head = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (head.length < 33 || !signature.every((value, index) => head[index] === value)) return blob;

  const firstLength = new DataView(head.buffer, head.byteOffset + 8, 4).getUint32(0);
  const firstType = String.fromCharCode(...head.slice(12, 16));
  if (firstType !== 'IHDR') return blob;

  const insertAt = 8 + 12 + firstLength;
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, pixelsPerMeter);
  view.setUint32(12, pixelsPerMeter);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.slice(4, 17)));

  return new Blob([blob.slice(0, insertAt), chunk, blob.slice(insertAt)], { type: 'image/png' });
}

async function makeThumb(file, id) {
  const loaded = await loadImageFromFile(file);
  const image = loaded.image;
  try {
    const sourceW = image.naturalWidth;
    const sourceH = image.naturalHeight;
    if (!sourceW || !sourceH) throw new Error('dimensions');

    const scale = Math.min(1, THUMB_MAX / Math.max(sourceW, sourceH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceW * scale));
    canvas.height = Math.max(1, Math.round(sourceH * scale));
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    let thumbBlob;
    try {
      thumbBlob = await canvasToBlob(canvas, 'image/webp', .86);
    } catch {
      thumbBlob = await canvasToBlob(canvas, 'image/png');
    }
    const thumbUrl = URL.createObjectURL(thumbBlob);
    canvas.width = 1;
    canvas.height = 1;

    return {
      id,
      file,
      name: file.name || 'image',
      width: sourceW,
      height: sourceH,
      thumbUrl
    };
  } finally {
    loaded.image.src = '';
    URL.revokeObjectURL(loaded.url);
  }
}

function layoutSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const seed = new Uint32Array(1);
    globalThis.crypto.getRandomValues(seed);
    return seed[0];
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function makeLayout({ newSeed = true } = {}) {
  if (!state.images.length) {
    state.layout = [];
    state.layoutSeed = null;
    renderLayout();
    return;
  }

  if (newSeed || state.layoutSeed === null) state.layoutSeed = layoutSeed();

  try {
    const packed = buildPackedLayout(
      state.images,
      state.layoutSeed,
      { density: state.density }
    );
    state.layout = packed.items;
    renderLayout();
  } catch (error) {
    console.error(error);
    showToast('Не удалось собрать плотную раскладку. Попробуй перерандомить.');
  }
}

function renderLayout() {
  els.imageLayer.replaceChildren();
  for (const item of state.layout) {
    const source = state.images.find((image) => image.id === item.id);
    if (!source) continue;

    const frame = document.createElement('figure');
    frame.className = 'print-image';
    frame.style.left = (item.x * 100) + '%';
    frame.style.top = (item.y * 100) + '%';
    frame.style.width = (item.w * 100) + '%';
    frame.style.height = (item.h * 100) + '%';
    frame.style.animationDelay = Math.min(item.order * 18, 260) + 'ms';

    const image = document.createElement('img');
    image.src = source.thumbUrl;
    image.alt = '';
    image.draggable = false;
    frame.append(image);
    els.imageLayer.append(frame);
  }
  syncControls();
}

async function addFiles(fileList) {
  const candidates = [...fileList].filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif|avif)$/i.test(file.name || ''));
  if (!candidates.length) {
    showToast('В этих файлах не нашлось изображений.');
    return;
  }

  const capacity = MAX_IMAGES - state.images.length;
  if (capacity <= 0) {
    showToast('На один лист можно добавить до ' + MAX_IMAGES + ' изображений.');
    return;
  }

  const selected = candidates.slice(0, capacity);
  const skippedByLimit = candidates.length - selected.length;
  setBusy(true, 'Готовлю отпечатки', '0 / ' + selected.length);

  let loaded = 0;
  let failed = 0;
  for (const file of selected) {
    try {
      const baseId = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random();
      const item = await makeThumb(file, baseId + '-' + loaded);
      state.images.push(item);
      loaded += 1;
      els.loadingDetail.textContent = (loaded + failed) + ' / ' + selected.length;
    } catch {
      failed += 1;
      els.loadingDetail.textContent = (loaded + failed) + ' / ' + selected.length;
    }
  }

  setBusy(false);
  makeLayout();

  if (failed) showToast('Не удалось открыть ' + failed + ' файл(а). Остальные добавлены.');
  else if (skippedByLimit) showToast('Добавлено ' + loaded + '. Лимит одного листа — ' + MAX_IMAGES + '.');
  else showToast('Добавлено: ' + loaded + '.');
}

function clearAll() {
  for (const item of state.images) URL.revokeObjectURL(item.thumbUrl);
  state.images = [];
  state.layout = [];
  state.layoutSeed = null;
  els.imageLayer.replaceChildren();
  els.fileInput.value = '';
  syncControls();
  showToast('Лист очищен.');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function exportFilename() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return 'rasklad-a4-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + '.png';
}

async function exportPng() {
  if (!state.layout.length || state.busy) return;
  setBusy(true, 'Собираю PNG из оригиналов', '0 / ' + state.layout.length);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (let index = 0; index < state.layout.length; index += 1) {
      const layout = state.layout[index];
      const source = state.images.find((image) => image.id === layout.id);
      if (!source) continue;

      const loaded = await loadImageFromFile(source.file);
      try {
        ctx.drawImage(
          loaded.image,
          Math.round(layout.x * PAGE_W),
          Math.round(layout.y * PAGE_H),
          Math.max(1, Math.round(layout.w * PAGE_W)),
          Math.max(1, Math.round(layout.h * PAGE_H))
        );
      } finally {
        loaded.image.src = '';
        URL.revokeObjectURL(loaded.url);
      }

      els.loadingDetail.textContent = (index + 1) + ' / ' + state.layout.length;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    els.loadingTitle.textContent = 'Упаковываю lossless PNG';
    els.loadingDetail.textContent = PAGE_W + ' × ' + PAGE_H;
    const rawBlob = await canvasToBlob(canvas, 'image/png');
    const blob = await tagPngDpi(rawBlob, 300);
    downloadBlob(blob, exportFilename());
    canvas.width = 1;
    canvas.height = 1;
    showToast('PNG готов: 2480×3508 px.');
  } catch (error) {
    console.error(error);
    showToast('Экспорт не удался. Попробуй уменьшить количество очень больших файлов.');
  } finally {
    setBusy(false);
  }
}

els.fileInput.addEventListener('change', async (event) => {
  await addFiles(event.target.files || []);
  els.fileInput.value = '';
});

els.shuffleButton.addEventListener('click', () => {
  makeLayout({ newSeed: true });
  showToast('Новая раскладка.');
});

function applyDensityFromSlider() {
  state.density = Number(els.densitySlider.value);
  persistDensity(state.density);
  syncDensityControl();

  window.clearTimeout(densityTimer);
  densityTimer = window.setTimeout(() => {
    if (state.images.length && !state.busy) makeLayout({ newSeed: false });
  }, 90);
}

els.densitySlider.addEventListener('input', applyDensityFromSlider);
els.densitySlider.addEventListener('change', () => {
  window.clearTimeout(densityTimer);
  state.density = Number(els.densitySlider.value);
  persistDensity(state.density);
  syncDensityControl();
  if (state.images.length && !state.busy) makeLayout({ newSeed: false });
});

els.exportButton.addEventListener('click', exportPng);
els.clearButton.addEventListener('click', clearAll);

for (const eventName of ['dragenter', 'dragover']) {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!state.busy) els.dropZone.classList.add('is-dragover');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove('is-dragover');
  });
}

els.dropZone.addEventListener('drop', async (event) => {
  if (state.busy) return;
  const files = event.dataTransfer?.files;
  if (files?.length) await addFiles(files);
});

syncControls();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
