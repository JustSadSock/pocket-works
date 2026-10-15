// Local, real-time video export. Source footage never leaves the browser during editing.
export const MAX_ROOM_VIDEO_BYTES = 96 * 1024 * 1024;
export const MAX_SOURCE_VIDEO_BYTES = 512 * 1024 * 1024;
const BITRATES = [650000, 1100000, 1800000, 3000000, 4700000];
export const videoBitrate = level => BITRATES[Math.max(0, Math.min(4, Number(level) - 1 || 0))];
export const formatVideoBytes = size => size >= 1024 * 1024
  ? (size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' МиБ'
  : Math.max(1, Math.round(size / 1024)) + ' КиБ';
export const estimateVideoBytes = (seconds, level) => Math.ceil(Math.max(0, seconds) * (videoBitrate(level) + 96000) / 8);
export const supportsVideoExport = () => typeof MediaRecorder !== 'undefined'
  && typeof document.createElement('canvas').captureStream === 'function'
  && typeof MediaRecorder.isTypeSupported === 'function';

function outputMime() {
  if (!supportsVideoExport()) return '';
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus',
    'video/mp4', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || '';
}
function abortError() { return new DOMException('Обработка отменена', 'AbortError'); }

/**
 * Export a precise segment with canvas-driven resolution and bitrate.
 * Encoding follows actual video playback; it must remain in the foreground.
 */
export async function exportVideo({ blob, start, duration, width, level, signal, onProgress = () => {} }) {
  if (!supportsVideoExport()) throw Error('Этот браузер не поддерживает локальное кодирование видео.');
  const mimeType = outputMime();
  if (!mimeType) throw Error('В браузере нет подходящего видеокодека для экспорта.');
  if (!(blob instanceof Blob) || blob.size < 1 || !Number.isFinite(start)
    || !Number.isFinite(duration) || duration < 1 || duration > 90 || start < 0) throw Error('Неверный отрывок.');
  if (signal?.aborted) throw abortError();

  const video = document.createElement('video');
  const src = URL.createObjectURL(blob);
  video.preload = 'auto';
  video.playsInline = true;
  video.src = src;
  let recorder, frame = 0, audioContext, stream, cancelled = false;
  let timer, started = false;
  const abort = () => { cancelled = true; video.pause(); if (recorder?.state === 'recording') recorder.stop(); };
  const hidden = () => { if (document.hidden) abort(); };
  signal?.addEventListener('abort', abort, {once: true});
  document.addEventListener('visibilitychange', hidden);
  try {
    await new Promise((resolve, reject) => {
      const clear = () => { clearTimeout(timer); video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); };
      const loaded = () => { clear(); resolve(); };
      const failed = () => { clear(); reject(Error('Видео не декодируется этим браузером.')); };
      video.addEventListener('loadedmetadata', loaded);
      video.addEventListener('error', failed);
      timer = setTimeout(() => { clear(); reject(Error('Не удалось открыть видео.')); }, 15000);
      video.load();
    });
    if (cancelled) throw abortError();
    if (!Number.isFinite(video.duration) || start + duration > video.duration + 0.15)
      throw Error('Отрывок выходит за пределы файла.');
    if (start > 0.01) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { video.removeEventListener('seeked', done); reject(Error('Не удалось перейти к началу отрывка.')); }, 12000);
        const done = () => { clearTimeout(timeout); resolve(); };
        video.addEventListener('seeked', done, {once: true});
        video.currentTime = start;
      });
    }
    if (cancelled) throw abortError();
    const widthWanted = Math.max(240, Math.min(1920, Number(width) || 960));
    const scale = Math.min(1, widthWanted / Math.max(1, video.videoWidth));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.floor(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.floor(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext('2d', {alpha: false});
    if (!ctx) throw Error('Не удалось открыть видеохолст.');
    stream = canvas.captureStream(24);
    // Try to retain the original soundtrack without sending it to speakers.
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        audioContext = new Audio();
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
        await audioContext.resume();
      } else video.muted = true;
    } catch {
      video.muted = true;
      await audioContext?.close().catch(() => {});
      audioContext = null;
    }

    recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: videoBitrate(level), audioBitsPerSecond: 96000});
    const chunks = [];
    const completed = new Promise((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      recorder.onerror = () => reject(Error('Кодирование видео прервалось.'));
      recorder.onstop = () => {
        if (cancelled) reject(abortError());
        else if (!chunks.length) reject(Error('Кодек не создал видеоданные.'));
        else resolve(new Blob(chunks, {type: recorder.mimeType || mimeType}));
      };
    });
    const end = start + duration;
    const paint = () => {
      if (cancelled || recorder.state !== 'recording') return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const elapsed = Math.max(0, video.currentTime - start);
      onProgress(Math.min(1, elapsed / duration));
      if (video.ended || video.currentTime >= end - 0.035) {
        video.pause();
        recorder.stop();
      } else frame = requestAnimationFrame(paint);
    };
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (cancelled) throw abortError();
    recorder.start(1000);
    started = true;
    // A failed play must stop the MediaRecorder, otherwise the promise would hang.
    try { await video.play(); } catch {
      cancelled = true;
      if (recorder.state === 'recording') recorder.stop();
      throw Error('Браузер запретил воспроизведение для обработки. Нажми обработать ещё раз.');
    }
    frame = requestAnimationFrame(paint);
    const output = await completed;
    onProgress(1);
    return output;
  } finally {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (started && recorder?.state === 'recording') { cancelled = true; recorder.stop(); }
    stream?.getTracks().forEach(track => track.stop());
    await audioContext?.close().catch(() => {});
    URL.revokeObjectURL(src);
    signal?.removeEventListener('abort', abort);
    document.removeEventListener('visibilitychange', hidden);
  }
}
