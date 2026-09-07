(() => {
  'use strict';

  function classify(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg','jpeg','png','webp','gif','bmp','avif','heic','heif'].includes(ext)) return 'image';
    if (['mp4','mov','m4v','webm','mkv','avi','mpeg','mpg'].includes(ext)) return 'video';
    return null;
  }

  function resolveDimensions(media, choice, kind) {
    const longest = Math.max(media.width, media.height);
    let maxEdge;
    if (choice === '1080') maxEdge = 1920;
    else if (choice === '2160') maxEdge = 3840;
    else if (choice === 'original') maxEdge = 8192;
    else maxEdge = kind === 'image' ? 4096 : 1920;
    const scale = Math.min(1, maxEdge / longest);
    return {
      width: Math.max(2, Math.round(media.width * scale)),
      height: Math.max(2, Math.round(media.height * scale))
    };
  }

  function pickRecorderMime() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    return [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function baseName(name) {
    return (name || 'media')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁіІїЇєЄ_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'media';
  }

  function prettyBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
    const units = ['Б','КБ','МБ','ГБ'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
  }

  function formatTime(seconds) {
    const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = Math.floor(value % 60);
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.MiniatureMedia = {
    classify,
    resolveDimensions,
    pickRecorderMime,
    canvasToBlob,
    download,
    baseName,
    prettyBytes,
    formatTime,
    clamp
  };
})();
