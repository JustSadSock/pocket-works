import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const PAGE_W = 2480;
const PAGE_H = 3508;
const PAGE_ASPECT = PAGE_W / PAGE_H;
const MAX_IMAGES = 60;
const THUMB_MAX = 560;

const state = { images: [], layout: [], busy: false };

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
  dropZone: document.querySelector('#dropZone'),
  toast: document.querySelector('#toast')
};

let toastTimer = 0;

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

function syncControls() {
  const hasImages = state.images.length > 0;
  els.shuffleButton.disabled = !hasImages || state.busy;
  els.exportButton.disabled = !hasImages || state.busy;
  els.clearButton.disabled = !hasImages || state.busy;
  els.fileInput.disabled = state.busy;
  els.emptyState.hidden = hasImages || state.busy;
  els.countLabel.textContent = pluralImages(state.images.length);
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

function widthRangeForCount(count) {
  if (count <= 3) return [0.27, 0.48];
  if (count <= 6) return [0.21, 0.38];
  if (count <= 10) return [0.16, 0.31];
  if (count <= 16) return [0.125, 0.255];
  if (count <= 26) return [0.095, 0.205];
  if (count <= 40) return [0.073, 0.165];
  return [0.058, 0.13];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function rectOverlap(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function candidateScore(candidate, placed) {
  const area = candidate.w * candidate.h;
  let overlap = 0;
  for (const item of placed) overlap += rectOverlap(candidate, item);
  const centerX = candidate.x + candidate.w / 2;
  const centerY = candidate.y + candidate.h / 2;
  const mildCenterBias = Math.abs(centerX - .5) * .001 + Math.abs(centerY - .5) * .0007;
  return overlap / Math.max(area, .00001) + mildCenterBias;
}

function makeLayout() {
  const count = state.images.length;
  if (!count) {
    state.layout = [];
    renderLayout();
    return;
  }

  const margin = count > 30 ? .014 : .021;
  const range = widthRangeForCount(count);
  const shuffled = [...state.images].sort(() => Math.random() - .5);
  const placed = [];

  shuffled.forEach((item, index) => {
    const ratio = item.width / item.height;
    let w = randomBetween(range[0], range[1]);
    let h = w * PAGE_ASPECT / ratio;

    const maxByHeight = (1 - margin * 2) * ratio / PAGE_ASPECT;
    if (w > maxByHeight) {
      w = maxByHeight;
      h = w * PAGE_ASPECT / ratio;
    }

    const targetPixelW = w * PAGE_W;
    const targetPixelH = h * PAGE_H;
    const noUpscale = Math.min(1, item.width / targetPixelW, item.height / targetPixelH);
    w *= noUpscale;
    h *= noUpscale;

    const maxX = Math.max(margin, 1 - margin - w);
    const maxY = Math.max(margin, 1 - margin - h);
    let best = null;
    let bestScore = Infinity;
    const tries = Math.min(260, 80 + count * 6);

    for (let attempt = 0; attempt < tries; attempt += 1) {
      const candidate = {
        id: item.id,
        x: randomBetween(margin, maxX),
        y: randomBetween(margin, maxY),
        w,
        h,
        order: index
      };
      const score = candidateScore(candidate, placed);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
      if (score < .004) break;
    }

    placed.push(best);
  });

  state.layout = placed;
  renderLayout();
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
  makeLayout();
  showToast('Новая раскладка.');
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
