// Local image and real-time video compression; never sends media over a network.
const PHOTO_OPTIONS = {
  high: { side: 3000, quality: .87 },
  balanced: { side: 1920, quality: .74 },
  small: { side: 1280, quality: .57 }
};
const VIDEO_OPTIONS = {
  high: { side: 1920, bitrate: 3_000_000, fps: 30 },
  balanced: { side: 1280, bitrate: 1_250_000, fps: 24 },
  small: { side: 854, bitrate: 650_000, fps: 24 }
};
function ensureActive(signal) {
  if (signal?.aborted) throw new Error('Операция отменена.');
}
function outputName(name, extension) {
  return name.replace(/\.[^.]+$/, '') + '.' + extension;
}
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch { /* Some Safari image formats require a regular img. */ }
  }
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url;
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Не удалось открыть изображение в этом браузере.');
  }
}
export async function compressImage(file, { quality = 'balanced', format = 'webp', signal } = {}) {
  ensureActive(signal);
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|heic|heif|avif)$/i.test(file.name)) throw new Error('Неподдерживаемый формат фотографии.');
  if (file.size > 256 * 1024 * 1024) throw new Error('Фотография больше 256 МБ.');
  const preset = PHOTO_OPTIONS[quality] || PHOTO_OPTIONS.balanced;
  const image = await decodeImage(file);
  try {
    ensureActive(signal);
    if (!image.width || !image.height) throw new Error('Повреждено изображение.');
    const scale = Math.min(1, preset.side / Math.max(image.width, image.height), Math.sqrt(22_000_000 / (image.width * image.height)));
    const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: format === 'webp' });
    if (!ctx) throw new Error('Нет доступа к обработке Canvas.');
    if (format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, 0, 0, width, height);
    ensureActive(signal);
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, preset.quality));
    canvas.width = canvas.height = 0;
    if (!blob || blob.type !== mime) throw new Error(format === 'webp' ? 'WebP недоступен в браузере. Выбери JPEG.' : 'Браузер не может создать JPEG.');
    ensureActive(signal);
    if (blob.size >= file.size) return { blob: file, name: file.name, unchanged: true };
    return { blob, name: outputName(file.name, format === 'jpeg' ? 'jpg' : 'webp'), unchanged: false };
  } finally { image.cleanup(); }
}
export function videoSupport({ keepAudio = true } = {}) {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' ||
      typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    return { supported: false, message: 'На этом устройстве нет необходимых API для сжатия видео. Оригинал можно сохранить или добавить в ZIP.' };
  }
  // A silent stream must not require an audio codec; Safari generally prefers MP4, Chromium WebM.
  const types = keepAudio
    ? ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4', 'video/webm;codecs="vp9,opus"', 'video/webm;codecs="vp8,opus"', 'video/webm']
    : ['video/mp4;codecs="avc1.42E01E"', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = types.find(type => {
    try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
  });
  return mime ? { supported: true, mime, extension: mime.startsWith('video/mp4') ? 'mp4' : 'webm' } :
    { supported: false, message: 'Для этого браузера не найден подходящий видеокодировщик. Попробуй другой браузер.' };
}
export async function compressVideo(file, { quality = 'balanced', keepAudio = true, signal, onProgress = () => {}, monitor } = {}) {
  const support = videoSupport({ keepAudio });
  if (!support.supported) throw new Error(support.message);
  if (file.size > 512 * 1024 * 1024) throw new Error('Видео больше 512 МБ. Выбери файл меньшего размера.');
  ensureActive(signal);
  const preset = VIDEO_OPTIONS[quality] || VIDEO_OPTIONS.balanced;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.muted = true;
  video.controls = false;
  video.src = url;
  video.setAttribute('aria-label', 'Предпросмотр сжимаемого видео');
  const canvas = document.createElement('canvas');
  let context, source, destination, recorder, raf = 0, stream, cancelled = false;
  let audioContext = null;
  // AudioContext must be resumed in the user-gesture call path on Safari.
  if (keepAudio) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { URL.revokeObjectURL(url); throw new Error('Сохранение звука недоступно. Отключи «Сохранить звук» и повтори.'); }
    audioContext = new Audio();
    try { await audioContext.resume(); }
    catch { /* The status is checked below. */ }
  }
  if (monitor) {
    monitor.replaceChildren(video);
    monitor.classList.remove('hidden');
  } else {
    video.style.cssText = 'position:fixed;left:-2px;top:-2px;width:1px;height:1px;opacity:0';
    document.body.append(video);
  }
  try {
    await new Promise((resolve, reject) => {
      let timeout = setTimeout(() => reject(new Error('Не удалось прочитать параметры видео.')), 20000);
      function done() { clearTimeout(timeout); resolve(); }
      if (video.readyState >= 1) done();
      else {
        video.addEventListener('loadedmetadata', done, { once: true });
        video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Браузер не смог декодировать это видео.')); }, { once: true });
        video.load();
      }
    });
    ensureActive(signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Не удалось определить длительность видео.');
    if (video.duration > 15 * 60) throw new Error('Ограничение на обработку — 15 минут видео за раз.');
    const scale = Math.min(1, preset.side / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Не удалось создать видеокадр Canvas.');
    stream = canvas.captureStream(preset.fps);
    if (keepAudio) {
      if (audioContext.state !== 'running') throw new Error('Safari заблокировал захват звука. Коснись «Сжать» ещё раз или отключи звук.');
      source = audioContext.createMediaElementSource(video);
      destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    }
    recorder = new MediaRecorder(stream, { mimeType: support.mime, videoBitsPerSecond: preset.bitrate });
    const chunks = [];
    const blob = await new Promise((resolve, reject) => {
      let finished = false, lastUpdate = 0;
      function stopWithError(err) {
        if (finished) return;
        finished = true;
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
        reject(err);
      }
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = event => stopWithError(event.error || new Error('Ошибка кодировщика видео.'));
      recorder.onstop = () => {
        if (finished) return;
        finished = true;
        const output = new Blob(chunks, { type: recorder.mimeType || support.mime });
        if (!output.size) reject(new Error('Кодировщик не создал видеофайл.'));
        else resolve(output);
      };
      const abort = () => stopWithError(new Error('Операция отменена.'));
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      video.addEventListener('error', () => stopWithError(new Error('Воспроизведение видео прервалось.')), { once: true });
      video.addEventListener('ended', () => { if (recorder.state === 'recording') recorder.stop(); }, { once: true });
      const draw = timestamp => {
        if (finished || signal?.aborted) return;
        try { if (video.readyState >= 2) context.drawImage(video, 0, 0, canvas.width, canvas.height); }
        catch { /* Frame may be temporarily unavailable. */ }
        if (timestamp - lastUpdate > 180) { lastUpdate = timestamp; onProgress(Math.min(0.99, video.currentTime / video.duration)); }
        raf = requestAnimationFrame(draw);
      };
      try {
        recorder.start(300);
        raf = requestAnimationFrame(draw);
        Promise.resolve(video.play()).catch(() => stopWithError(new Error('Видео не запускается. Попробуй открыть его в приложении «Фото» и сохранить как MP4.')));
      } catch (error) { stopWithError(error); }
    });
    ensureActive(signal);
    onProgress(1);
    if (blob.size >= file.size) return { blob: file, name: file.name, unchanged: true };
    return { blob, name: outputName(file.name, support.extension), unchanged: false };
  } finally {
    cancelled = true;
    cancelAnimationFrame(raf);
    video.pause();
    video.removeAttribute('src'); video.load();
    video.remove();
    stream?.getTracks().forEach(track => track.stop());
    source?.disconnect();
    destination?.disconnect();
    audioContext?.close().catch(() => {});
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
    if (monitor) monitor.classList.add('hidden');
  }
}
