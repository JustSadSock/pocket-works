(() => {
  'use strict';

  const STORAGE_KEY = 'pocket-works:toy-lens:settings';
  const DEFAULTS = Object.freeze({
    blur: 18,
    focus: 24,
    feather: 16,
    angle: 0,
    saturation: 128,
    contrast: 112,
    brightness: 104,
    vignette: 10,
    position: 0
  });

  const state = {
    settings: loadSettings(),
    media: null,
    objectUrl: null,
    compare: false,
    dragging: false,
    guideTimer: 0,
    loopToken: 0,
    exporting: false,
    exportCancelled: false,
    exportResolve: null,
    recorder: null,
    toastTimer: 0,
    audioContext: null,
    audioSource: null,
    audioDestination: null,
    monitorGain: null
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    emptyState: $('emptyState'), workspace: $('workspace'), fileInput: $('fileInput'), replaceInput: $('replaceInput'), replaceButton: $('replaceButton'),
    sourceImage: $('sourceImage'), sourceVideo: $('sourceVideo'), previewCanvas: $('previewCanvas'), guideCanvas: $('guideCanvas'), exportCanvas: $('exportCanvas'),
    loadingState: $('loadingState'), loadingTitle: $('loadingTitle'), loadingText: $('loadingText'), stageHint: $('stageHint'), mediaMeta: $('mediaMeta'),
    compareButton: $('compareButton'), videoControls: $('videoControls'), playButton: $('playButton'), seekInput: $('seekInput'), timeOutput: $('timeOutput'),
    resolutionSelect: $('resolutionSelect'), formatSelect: $('formatSelect'), exportButton: $('exportButton'), exportInfo: $('exportInfo'), exportProgress: $('exportProgress'),
    progressBar: $('progressBar'), progressText: $('progressText'), cancelExport: $('cancelExport'), resetButton: $('resetButton'), presetButton: $('presetButton'), toast: $('toast'),
    blurInput: $('blurInput'), focusInput: $('focusInput'), featherInput: $('featherInput'), angleInput: $('angleInput'), saturationInput: $('saturationInput'),
    contrastInput: $('contrastInput'), brightnessInput: $('brightnessInput'), vignetteInput: $('vignetteInput'),
    blurValue: $('blurValue'), focusValue: $('focusValue'), featherValue: $('featherValue'), angleValue: $('angleValue'), saturationValue: $('saturationValue'),
    contrastValue: $('contrastValue'), brightnessValue: $('brightnessValue'), vignetteValue: $('vignetteValue')
  };

  const scratch = {
    small: document.createElement('canvas'),
    blur: document.createElement('canvas')
  };

  const controls = [
    ['blur', el.blurInput, el.blurValue, (v) => `${v}`],
    ['focus', el.focusInput, el.focusValue, (v) => `${v}%`],
    ['feather', el.featherInput, el.featherValue, (v) => `${v}%`],
    ['angle', el.angleInput, el.angleValue, (v) => `${v}°`],
    ['saturation', el.saturationInput, el.saturationValue, (v) => `${v}%`],
    ['contrast', el.contrastInput, el.contrastValue, (v) => `${v}%`],
    ['brightness', el.brightnessInput, el.brightnessValue, (v) => `${v}%`],
    ['vignette', el.vignetteInput, el.vignetteValue, (v) => `${v}%`]
  ];

  init();

  function init() {
    applySettingsToControls();
    bindEvents();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
    }
  }

  function bindEvents() {
    el.fileInput.addEventListener('change', onFilePicked);
    el.replaceInput.addEventListener('change', onFilePicked);

    controls.forEach(([key, input, output, format]) => {
      input.addEventListener('input', () => {
        state.settings[key] = Number(input.value);
        output.value = format(input.value);
        showGuide();
        renderCurrentFrame();
      });
      input.addEventListener('change', saveSettings);
    });

    el.resetButton.addEventListener('click', () => setSettings(DEFAULTS, 'Настройки сброшены'));
    el.presetButton.addEventListener('click', () => setSettings({ ...DEFAULTS, blur: 22, focus: 22, feather: 18, saturation: 136, contrast: 116, brightness: 105, vignette: 12 }, 'Профиль миниатюры применён'));

    bindCompareEvents();
    bindGuideDrag();

    el.playButton.addEventListener('click', togglePlayback);
    el.seekInput.addEventListener('input', () => {
      if (!state.media || state.media.kind !== 'video' || state.exporting) return;
      const duration = finiteDuration();
      if (duration) el.sourceVideo.currentTime = duration * Number(el.seekInput.value) / 1000;
    });

    el.sourceVideo.addEventListener('play', () => {
      updatePlayButton();
      startVideoLoop();
    });
    el.sourceVideo.addEventListener('pause', updatePlayButton);
    el.sourceVideo.addEventListener('ended', updatePlayButton);
    el.sourceVideo.addEventListener('timeupdate', updateVideoUi);
    el.sourceVideo.addEventListener('seeked', renderCurrentFrame);

    el.exportButton.addEventListener('click', () => {
      if (!state.media || state.exporting) return;
      if (state.media.kind === 'image') exportImage();
      else exportVideo();
    });
    el.cancelExport.addEventListener('click', cancelVideoExport);
    window.addEventListener('resize', syncGuideCanvasCss);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.media?.kind === 'video' && !state.exporting) el.sourceVideo.pause();
    });
  }

  async function onFilePicked(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || state.exporting) return;
    await loadFile(file);
  }

  async function loadFile(file) {
    const kind = classifyFile(file);
    if (!kind) {
      showToast('Не смог определить фото или видео. Выбери обычный медиафайл.');
      return;
    }

    stopExistingMedia();
    state.media = { kind, file, width: 0, height: 0, duration: 0 };
    state.objectUrl = URL.createObjectURL(file);
    el.emptyState.hidden = true;
    el.workspace.hidden = false;
    el.replaceButton.hidden = false;
    setLoading(true, 'Открываю медиа', 'Проверяю размер и декодер…');

    try {
      if (kind === 'image') await loadImageSource(state.objectUrl);
      else await loadVideoSource(state.objectUrl);

      setPreviewDimensions();
      updateMediaUi();
      setLoading(false);
      renderCurrentFrame();
      showGuide(1800);
    } catch (error) {
      console.error(error);
      setLoading(false);
      stopExistingMedia();
      state.media = null;
      el.workspace.hidden = true;
      el.emptyState.hidden = false;
      el.replaceButton.hidden = true;
      showToast('Этот файл браузер не декодировал. Сам формат допустим, но кодек внутри не поддерживается на этом устройстве.');
    }
  }

  function classifyFile(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg','jpeg','png','webp','gif','bmp','avif','heic','heif'].includes(ext)) return 'image';
    if (['mp4','mov','m4v','webm','mkv','avi','mpeg','mpg'].includes(ext)) return 'video';
    return null;
  }

  function loadImageSource(url) {
    return new Promise((resolve, reject) => {
      const img = el.sourceImage;
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) return reject(new Error('Invalid image dimensions'));
        state.media.width = img.naturalWidth;
        state.media.height = img.naturalHeight;
        resolve();
      };
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = url;
    });
  }

  function loadVideoSource(url) {
    return new Promise((resolve, reject) => {
      const video = el.sourceVideo;
      const cleanup = () => {
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', fail);
      };
      const ready = () => {
        cleanup();
        if (!video.videoWidth || !video.videoHeight) return reject(new Error('Invalid video dimensions'));
        state.media.width = video.videoWidth;
        state.media.height = video.videoHeight;
        state.media.duration = Number.isFinite(video.duration) ? video.duration : 0;
        resolve();
      };
      const fail = () => { cleanup(); reject(new Error('Video decode failed')); };
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('error', fail, { once: true });
      video.src = url;
      video.load();
    });
  }

  function stopExistingMedia() {
    state.loopToken += 1;
    el.sourceVideo.pause();
    el.sourceVideo.removeAttribute('src');
    el.sourceVideo.load();
    el.sourceImage.removeAttribute('src');
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }

  function setPreviewDimensions() {
    if (!state.media) return;
    const longest = Math.max(state.media.width, state.media.height);
    const maxPreviewEdge = window.matchMedia('(max-width: 700px)').matches ? 1100 : 1500;
    const scale = Math.min(1, maxPreviewEdge / longest);
    const width = Math.max(1, Math.round(state.media.width * scale));
    const height = Math.max(1, Math.round(state.media.height * scale));
    el.previewCanvas.width = width;
    el.previewCanvas.height = height;
    el.guideCanvas.width = width;
    el.guideCanvas.height = height;
    syncGuideCanvasCss();
  }

  function syncGuideCanvasCss() {
    requestAnimationFrame(() => {
      const rect = el.previewCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      el.guideCanvas.style.width = `${rect.width}px`;
      el.guideCanvas.style.height = `${rect.height}px`;
    });
  }

  function updateMediaUi() {
    const m = state.media;
    if (!m) return;
    const megaPixels = ((m.width * m.height) / 1e6).toFixed(1).replace('.0','');
    el.mediaMeta.textContent = m.kind === 'image'
      ? `${m.width}×${m.height} · ${megaPixels} МП · ${prettyBytes(m.file.size)}`
      : `${m.width}×${m.height} · ${formatTime(m.duration)} · ${prettyBytes(m.file.size)}`;
    el.videoControls.hidden = m.kind !== 'video';
    el.formatSelect.hidden = m.kind === 'video';
    el.exportInfo.textContent = m.kind === 'image'
      ? 'Авто: до 4096 px по длинной стороне.'
      : 'Авто: до 1080p; экспорт идёт по ходу видео.';
    updateVideoUi();
  }

  function renderCurrentFrame() {
    if (!state.media || state.exporting) return;
    const source = state.media.kind === 'image' ? el.sourceImage : el.sourceVideo;
    if (state.media.kind === 'video' && el.sourceVideo.readyState < 2) return;
    drawProcessed(el.previewCanvas, source, state.compare, false);
    drawGuide();
  }

  function drawProcessed(canvas, source, originalOnly = false, isExport = false) {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: !isExport });
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (originalOnly) {
      ctx.filter = 'none';
      ctx.drawImage(source, 0, 0, width, height);
      ctx.restore();
      return;
    }

    const filter = `saturate(${state.settings.saturation}%) contrast(${state.settings.contrast}%) brightness(${state.settings.brightness}%)`;
    ctx.filter = filter;
    ctx.drawImage(source, 0, 0, width, height);
    ctx.filter = 'none';

    if (state.settings.blur > 0) {
      drawBlurLayer(ctx, source, width, height, filter, isExport);
    }
    if (state.settings.vignette > 0) {
      drawVignette(ctx, width, height, state.settings.vignette);
    }
    ctx.restore();
  }

  function drawBlurLayer(targetCtx, source, width, height, colorFilter, isExport) {
    const longest = Math.max(width, height);
    const sampleEdge = isExport ? 1400 : 900;
    const scale = Math.min(1, sampleEdge / longest);
    const smallW = Math.max(2, Math.round(width * scale));
    const smallH = Math.max(2, Math.round(height * scale));
    ensureCanvasSize(scratch.small, smallW, smallH);
    ensureCanvasSize(scratch.blur, width, height);

    const sctx = scratch.small.getContext('2d');
    const blurCtx = scratch.blur.getContext('2d');
    sctx.clearRect(0, 0, smallW, smallH);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    const blurPixels = Math.max(0.8, state.settings.blur * Math.min(width, height) / 900 * scale);
    sctx.filter = `${colorFilter} blur(${blurPixels.toFixed(2)}px)`;
    sctx.drawImage(source, -2, -2, smallW + 4, smallH + 4);
    sctx.filter = 'none';

    blurCtx.clearRect(0, 0, width, height);
    blurCtx.imageSmoothingEnabled = true;
    blurCtx.imageSmoothingQuality = 'high';
    blurCtx.drawImage(scratch.small, 0, 0, width, height);
    blurCtx.globalCompositeOperation = 'destination-in';
    blurCtx.fillStyle = createFocusMask(blurCtx, width, height);
    blurCtx.fillRect(0, 0, width, height);
    blurCtx.globalCompositeOperation = 'source-over';
    targetCtx.drawImage(scratch.blur, 0, 0);
  }

  function createFocusMask(ctx, width, height) {
    const g = focusGeometry(width, height);
    const gradient = ctx.createLinearGradient(
      g.centerX - g.normalX * g.extent,
      g.centerY - g.normalY * g.extent,
      g.centerX + g.normalX * g.extent,
      g.centerY + g.normalY * g.extent
    );
    const stop = (distance) => clamp(0.5 + distance / (2 * g.extent), 0, 1);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(stop(-(g.halfSharp + g.feather)), 'rgba(0,0,0,1)');
    gradient.addColorStop(stop(-g.halfSharp), 'rgba(0,0,0,0)');
    gradient.addColorStop(stop(g.halfSharp), 'rgba(0,0,0,0)');
    gradient.addColorStop(stop(g.halfSharp + g.feather), 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
    return gradient;
  }

  function focusGeometry(width, height) {
    const angle = state.settings.angle * Math.PI / 180;
    const normalX = -Math.sin(angle);
    const normalY = Math.cos(angle);
    const maxProjection = (Math.abs(normalX) * width + Math.abs(normalY) * height) / 2;
    const offset = state.settings.position * maxProjection;
    const centerX = width / 2 + normalX * offset;
    const centerY = height / 2 + normalY * offset;
    return {
      normalX,
      normalY,
      centerX,
      centerY,
      maxProjection,
      halfSharp: maxProjection * (state.settings.focus / 100),
      feather: Math.max(2, maxProjection * (state.settings.feather / 100)),
      extent: Math.hypot(width, height) * 0.85
    };
  }

  function drawVignette(ctx, width, height, amount) {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.22, width / 2, height / 2, Math.hypot(width, height) * 0.62);
    const alpha = clamp(amount / 100 * 0.9, 0, 0.38);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.62, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawGuide() {
    const canvas = el.guideCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.media || state.compare) return;
    const g = focusGeometry(canvas.width, canvas.height);
    const tangentX = g.normalY;
    const tangentY = -g.normalX;
    const lineHalf = Math.hypot(canvas.width, canvas.height);

    ctx.save();
    ctx.lineWidth = Math.max(1.5, Math.min(canvas.width, canvas.height) / 520);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(216,255,87,.82)';
    [-g.halfSharp, g.halfSharp].forEach((offset) => {
      const x = g.centerX + g.normalX * offset;
      const y = g.centerY + g.normalY * offset;
      ctx.beginPath();
      ctx.moveTo(x - tangentX * lineHalf, y - tangentY * lineHalf);
      ctx.lineTo(x + tangentX * lineHalf, y + tangentY * lineHalf);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.fillStyle = '#d8ff57';
    ctx.strokeStyle = '#171817';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.centerX, g.centerY, Math.max(7, canvas.width / 110), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function bindGuideDrag() {
    const canvas = el.guideCanvas;
    canvas.addEventListener('pointerdown', (event) => {
      if (!state.media || state.exporting) return;
      state.dragging = true;
      canvas.setPointerCapture?.(event.pointerId);
      updateFocusFromPointer(event);
      el.stageHint.classList.add('is-hidden');
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!state.dragging) return;
      updateFocusFromPointer(event);
    });
    const finish = () => {
      if (!state.dragging) return;
      state.dragging = false;
      saveSettings();
      showGuide();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
  }

  function updateFocusFromPointer(event) {
    const rect = el.guideCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * el.guideCanvas.width;
    const y = (event.clientY - rect.top) / rect.height * el.guideCanvas.height;
    const g = focusGeometry(el.guideCanvas.width, el.guideCanvas.height);
    const dx = x - el.guideCanvas.width / 2;
    const dy = y - el.guideCanvas.height / 2;
    const projected = dx * g.normalX + dy * g.normalY;
    state.settings.position = clamp(projected / Math.max(1, g.maxProjection), -0.98, 0.98);
    renderCurrentFrame();
  }

  function bindCompareEvents() {
    const button = el.compareButton;
    const start = (event) => {
      if (!state.media || state.exporting) return;
      event.preventDefault();
      state.compare = true;
      button.classList.add('is-active');
      button.textContent = 'Оригинал';
      renderCurrentFrame();
    };
    const end = () => {
      if (!state.compare) return;
      state.compare = false;
      button.classList.remove('is-active');
      button.textContent = 'Зажми: оригинал';
      renderCurrentFrame();
      showGuide();
    };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', end);
    window.addEventListener('pointerup', end);
  }

  function showGuide(delay = 1100) {
    clearTimeout(state.guideTimer);
    drawGuide();
    state.guideTimer = window.setTimeout(() => {
      if (state.dragging) return;
      const ctx = el.guideCanvas.getContext('2d');
      ctx.clearRect(0, 0, el.guideCanvas.width, el.guideCanvas.height);
    }, delay);
  }

  function startVideoLoop() {
    if (!state.media || state.media.kind !== 'video') return;
    const token = ++state.loopToken;
    const video = el.sourceVideo;
    const frame = () => {
      if (token !== state.loopToken || !state.media || state.media.kind !== 'video') return;
      if (state.exporting) renderExportVideoFrame();
      else renderCurrentFrame();
      updateVideoUi();
      if (!video.paused && !video.ended) schedule(frame);
    };
    schedule(frame);
  }

  function schedule(callback) {
    if ('requestVideoFrameCallback' in el.sourceVideo) el.sourceVideo.requestVideoFrameCallback(() => callback());
    else requestAnimationFrame(callback);
  }

  function renderExportVideoFrame() {
    if (!state.exporting) return;
    drawProcessed(el.exportCanvas, el.sourceVideo, false, true);
    const ctx = el.previewCanvas.getContext('2d', { alpha: false });
    ctx.clearRect(0, 0, el.previewCanvas.width, el.previewCanvas.height);
    ctx.drawImage(el.exportCanvas, 0, 0, el.previewCanvas.width, el.previewCanvas.height);
    const duration = finiteDuration();
    const progress = duration ? clamp(el.sourceVideo.currentTime / duration, 0, 1) : 0;
    setExportProgress(progress);
  }

  function togglePlayback() {
    if (!state.media || state.media.kind !== 'video' || state.exporting) return;
    if (el.sourceVideo.paused || el.sourceVideo.ended) {
      if (el.sourceVideo.ended) el.sourceVideo.currentTime = 0;
      el.sourceVideo.play().catch(() => showToast('Браузер не разрешил воспроизведение. Нажми ещё раз.'));
    } else {
      el.sourceVideo.pause();
    }
  }

  function updatePlayButton() {
    const playing = !el.sourceVideo.paused && !el.sourceVideo.ended;
    el.playButton.textContent = playing ? 'Ⅱ' : '▶';
    el.playButton.setAttribute('aria-label', playing ? 'Пауза' : 'Воспроизвести');
  }

  function updateVideoUi() {
    if (!state.media || state.media.kind !== 'video') return;
    const duration = finiteDuration();
    const current = Number.isFinite(el.sourceVideo.currentTime) ? el.sourceVideo.currentTime : 0;
    if (duration && !state.exporting) el.seekInput.value = String(Math.round(current / duration * 1000));
    el.timeOutput.value = `${formatTime(current)} / ${formatTime(duration)}`;
    updatePlayButton();
  }

  async function exportImage() {
    if (!state.media || state.media.kind !== 'image') return;
    setLoading(true, 'Готовлю файл', 'Рендерю tilt‑shift в экспортном разрешении…');
    setUiLocked(true);
    try {
      const dims = resolveExportDimensions('image');
      el.exportCanvas.width = dims.width;
      el.exportCanvas.height = dims.height;
      await nextFrame();
      drawProcessed(el.exportCanvas, el.sourceImage, false, true);
      const type = el.formatSelect.value === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(el.exportCanvas, type, type === 'image/jpeg' ? 0.94 : undefined);
      if (!blob) throw new Error('Canvas export failed');
      const ext = type === 'image/png' ? 'png' : 'jpg';
      downloadBlob(blob, `${fileBaseName(state.media.file.name)}-toy-lens.${ext}`);
      showToast(`Готово · ${dims.width}×${dims.height}`);
    } catch (error) {
      console.error(error);
      showToast('Не удалось сохранить изображение. Попробуй «Авто» — оно использует безопасный размер canvas.');
    } finally {
      setLoading(false);
      setUiLocked(false);
      renderCurrentFrame();
    }
  }

  async function exportVideo() {
    if (!state.media || state.media.kind !== 'video' || state.exporting) return;
    if (!el.exportCanvas.captureStream || typeof MediaRecorder === 'undefined') {
      showToast('Этот браузер умеет предпросмотр, но не умеет записывать обработанный canvas. Нужен актуальный Safari, Chrome, Edge или Firefox.');
      return;
    }
    const mimeType = pickRecorderMime();
    if (!mimeType) {
      showToast('Браузер не дал ни одного доступного формата MediaRecorder.');
      return;
    }

    const video = el.sourceVideo;
    const savedTime = video.currentTime;
    const wasPlaying = !video.paused;
    state.exporting = true;
    state.exportCancelled = false;
    setUiLocked(true);
    el.exportProgress.hidden = false;
    setExportProgress(0);

    try {
      video.pause();
      await seekVideo(0);
      const dims = resolveExportDimensions('video');
      el.exportCanvas.width = dims.width;
      el.exportCanvas.height = dims.height;
      drawProcessed(el.exportCanvas, video, false, true);

      const stream = el.exportCanvas.captureStream(30);
      const audioTrack = await getAudioTrack();
      if (audioTrack) stream.addTrack(audioTrack);

      const bitsPerSecond = Math.round(clamp((dims.width * dims.height / (1280 * 720)) * 5_000_000, 4_000_000, 24_000_000));
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
      state.recorder = recorder;
      const chunks = [];
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) chunks.push(event.data); });
      const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.start(1000);

      if (state.monitorGain) state.monitorGain.gain.value = 0;
      const finishSignal = new Promise((resolve) => { state.exportResolve = resolve; });
      const endedHandler = () => state.exportResolve?.('ended');
      video.addEventListener('ended', endedHandler, { once: true });

      await video.play();
      startVideoLoop();
      await finishSignal;
      video.removeEventListener('ended', endedHandler);
      video.pause();

      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => {
        if (track !== audioTrack) track.stop();
      });

      if (!state.exportCancelled) {
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        if (!blob.size) throw new Error('Empty video export');
        const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        downloadBlob(blob, `${fileBaseName(state.media.file.name)}-toy-lens.${ext}`);
        setExportProgress(1);
        showToast(`Видео готово · ${dims.width}×${dims.height} · ${ext.toUpperCase()}`);
      } else {
        showToast('Экспорт отменён');
      }
    } catch (error) {
      console.error(error);
      if (state.recorder?.state && state.recorder.state !== 'inactive') {
        try { state.recorder.stop(); } catch (_) {}
      }
      showToast('Экспорт видео не завершился. Для максимальной совместимости выбери «Авто» и попробуй ещё раз.');
    } finally {
      state.exportResolve = null;
      state.recorder = null;
      state.exporting = false;
      state.exportCancelled = false;
      if (state.monitorGain) state.monitorGain.gain.value = 1;
      el.exportProgress.hidden = true;
      setUiLocked(false);
      try { await seekVideo(Math.min(savedTime, finiteDuration() || savedTime)); } catch (_) {}
      if (wasPlaying) el.sourceVideo.play().catch(() => {});
      else renderCurrentFrame();
    }
  }

  function cancelVideoExport() {
    if (!state.exporting) return;
    state.exportCancelled = true;
    el.sourceVideo.pause();
    state.exportResolve?.('cancel');
  }

  async function getAudioTrack() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    try {
      if (!state.audioContext) {
        state.audioContext = new Context();
        state.audioSource = state.audioContext.createMediaElementSource(el.sourceVideo);
        state.audioDestination = state.audioContext.createMediaStreamDestination();
        state.monitorGain = state.audioContext.createGain();
        state.audioSource.connect(state.audioDestination);
        state.audioSource.connect(state.monitorGain);
        state.monitorGain.connect(state.audioContext.destination);
      }
      if (state.audioContext.state === 'suspended') await state.audioContext.resume();
      return state.audioDestination.stream.getAudioTracks()[0] || null;
    } catch (error) {
      console.warn('Audio capture unavailable', error);
      return null;
    }
  }

  function pickRecorderMime() {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    if (typeof MediaRecorder?.isTypeSupported !== 'function') return '';
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  function resolveExportDimensions(kind) {
    const sourceW = state.media.width;
    const sourceH = state.media.height;
    const longest = Math.max(sourceW, sourceH);
    const choice = el.resolutionSelect.value;
    let maxEdge;
    if (choice === '1080') maxEdge = 1920;
    else if (choice === '2160') maxEdge = 3840;
    else if (choice === 'original') maxEdge = 8192;
    else maxEdge = kind === 'image' ? 4096 : 1920;

    if (choice === 'original' && longest > maxEdge) {
      showToast('Оригинал больше безопасного лимита canvas; длинная сторона ограничена 8192 px.');
    }
    const scale = Math.min(1, maxEdge / longest);
    return {
      width: Math.max(2, Math.round(sourceW * scale)),
      height: Math.max(2, Math.round(sourceH * scale))
    };
  }

  function setUiLocked(locked) {
    controls.forEach(([, input]) => { input.disabled = locked; });
    el.resetButton.disabled = locked;
    el.presetButton.disabled = locked;
    el.resolutionSelect.disabled = locked;
    el.formatSelect.disabled = locked;
    el.exportButton.disabled = locked;
    el.replaceInput.disabled = locked;
    el.playButton.disabled = locked;
    el.seekInput.disabled = locked;
    el.compareButton.disabled = locked;
  }

  function setExportProgress(progress) {
    const pct = Math.round(clamp(progress, 0, 1) * 100);
    el.progressBar.style.width = `${pct}%`;
    el.progressText.textContent = `Экспорт ${pct}%`;
  }

  function setLoading(visible, title = '', text = '') {
    el.loadingState.hidden = !visible;
    if (title) el.loadingTitle.textContent = title;
    if (text) el.loadingText.textContent = text;
  }

  function setSettings(next, message) {
    state.settings = { ...state.settings, ...next };
    applySettingsToControls();
    saveSettings();
    renderCurrentFrame();
    showGuide();
    if (message) showToast(message);
  }

  function applySettingsToControls() {
    controls.forEach(([key, input, output, format]) => {
      input.value = String(state.settings[key]);
      output.value = format(state.settings[key]);
    });
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
      const next = { ...DEFAULTS };
      Object.keys(DEFAULTS).forEach((key) => {
        if (Number.isFinite(Number(parsed[key]))) next[key] = Number(parsed[key]);
      });
      next.position = clamp(next.position, -0.98, 0.98);
      return next;
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch (_) {}
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function seekVideo(time) {
    const video = el.sourceVideo;
    if (!Number.isFinite(time) || Math.abs(video.currentTime - time) < 0.02) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timeout;
      const done = () => {
        clearTimeout(timeout);
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', fail);
        resolve();
      };
      const fail = () => {
        clearTimeout(timeout);
        video.removeEventListener('seeked', done);
        reject(new Error('Seek failed'));
      };
      video.addEventListener('seeked', done, { once: true });
      video.addEventListener('error', fail, { once: true });
      timeout = setTimeout(done, 2500);
      video.currentTime = clamp(time, 0, finiteDuration() || time);
    });
  }

  function finiteDuration() {
    const d = el.sourceVideo.duration;
    return Number.isFinite(d) && d > 0 ? d : (state.media?.duration || 0);
  }

  function ensureCanvasSize(canvas, width, height) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    state.toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 3300);
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
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = Math.floor(value % 60);
    return hours ? `${hours}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}` : `${minutes}:${String(secs).padStart(2,'0')}`;
  }

  function fileBaseName(name) {
    return (name || 'media').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9а-яА-ЯёЁіІїЇєЄ_-]+/g, '-').replace(/^-+|-+$/g, '') || 'media';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
})();
