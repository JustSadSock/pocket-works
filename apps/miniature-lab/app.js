(() => {
  'use strict';

  const STORAGE_KEY = 'pocket-works:miniature-lab:settings:v1';
  const DEFAULTS = Object.freeze({
    blur: 34,
    focus: 18,
    feather: 18,
    angle: 0,
    saturation: 148,
    contrast: 124,
    brightness: 104,
    vignette: 16,
    pop: 72,
    position: 0,
    mode: 'auto',
    objectX: 0.5,
    objectY: 0.5,
    objectScale: 1
  });

  const M = window.MiniatureMedia;
  const A = window.MiniatureAnalysis;
  const R = window.MiniatureRenderer;

  const state = {
    settings: loadSettings(),
    media: null,
    objectUrl: null,
    analysis: null,
    compare: false,
    dragging: false,
    dragKind: 'move',
    guideVisible: false,
    guideTimer: 0,
    renderQueued: false,
    videoToken: 0,
    lastVideoRender: 0,
    exporting: false,
    exportCancelled: false,
    exportResolve: null,
    recorder: null,
    audioContext: null,
    audioSource: null,
    audioDestination: null,
    monitorGain: null,
    toastTimer: 0
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    emptyState: $('emptyState'), workspace: $('workspace'), fileInput: $('fileInput'), replaceInput: $('replaceInput'), replaceButton: $('replaceButton'),
    sourceImage: $('sourceImage'), sourceVideo: $('sourceVideo'), previewCanvas: $('previewCanvas'), guideCanvas: $('guideCanvas'), exportCanvas: $('exportCanvas'),
    loadingState: $('loadingState'), loadingTitle: $('loadingTitle'), loadingText: $('loadingText'), stageHint: $('stageHint'), mediaMeta: $('mediaMeta'),
    compareButton: $('compareButton'), autoButton: $('autoButton'), videoControls: $('videoControls'), playButton: $('playButton'), seekInput: $('seekInput'), timeOutput: $('timeOutput'),
    resolutionSelect: $('resolutionSelect'), formatSelect: $('formatSelect'), exportButton: $('exportButton'), exportInfo: $('exportInfo'), exportProgress: $('exportProgress'),
    progressBar: $('progressBar'), progressText: $('progressText'), cancelExport: $('cancelExport'), resetButton: $('resetButton'), presetButton: $('presetButton'), toast: $('toast'),
    blurInput: $('blurInput'), focusInput: $('focusInput'), featherInput: $('featherInput'), angleInput: $('angleInput'), saturationInput: $('saturationInput'),
    contrastInput: $('contrastInput'), brightnessInput: $('brightnessInput'), vignetteInput: $('vignetteInput'), popInput: $('popInput'),
    blurValue: $('blurValue'), focusValue: $('focusValue'), featherValue: $('featherValue'), angleValue: $('angleValue'), saturationValue: $('saturationValue'),
    contrastValue: $('contrastValue'), brightnessValue: $('brightnessValue'), vignetteValue: $('vignetteValue'), popValue: $('popValue')
  };

  const fallback = {
    small: document.createElement('canvas'),
    blur: document.createElement('canvas'),
    mask: document.createElement('canvas')
  };

  const controls = [
    ['blur', el.blurInput, el.blurValue, (v) => `${v}`],
    ['focus', el.focusInput, el.focusValue, (v) => `${v}%`],
    ['feather', el.featherInput, el.featherValue, (v) => `${v}%`],
    ['angle', el.angleInput, el.angleValue, (v) => `${v}°`],
    ['saturation', el.saturationInput, el.saturationValue, (v) => `${v}%`],
    ['contrast', el.contrastInput, el.contrastValue, (v) => `${v}%`],
    ['brightness', el.brightnessInput, el.brightnessValue, (v) => `${v}%`],
    ['vignette', el.vignetteInput, el.vignetteValue, (v) => `${v}%`],
    ['pop', el.popInput, el.popValue, (v) => `${v}%`]
  ];

  init();

  function init() {
    installModeSwitch();
    applySettingsToControls();
    bindEvents();
    updateModeUi();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
    }
  }

  function installModeSwitch() {
    const heading = document.querySelector('.rail-heading');
    if (!heading) return;
    const wrap = document.createElement('div');
    wrap.className = 'focus-mode-switch';
    wrap.innerHTML = [
      '<button type="button" data-focus-mode="auto"><b>Авто</b><small>анализирует кадр</small></button>',
      '<button type="button" data-focus-mode="scene"><b>Сцена</b><small>улицы · комнаты</small></button>',
      '<button type="button" data-focus-mode="object"><b>Объект</b><small>вещи · люди · еда</small></button>'
    ].join('');
    heading.insertAdjacentElement('afterend', wrap);
    wrap.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-focus-mode]');
      if (!button || state.exporting) return;
      state.settings.mode = button.dataset.focusMode;
      if (state.settings.mode === 'auto') applyAutoAnalysis(true);
      saveSettings();
      updateModeUi();
      requestRender();
      showGuide(1700);
    });
    el.modeSwitch = wrap;
  }

  function bindEvents() {
    el.fileInput.addEventListener('change', onFilePicked);
    el.replaceInput.addEventListener('change', onFilePicked);

    controls.forEach(([key, input, output, format]) => {
      input.addEventListener('input', () => {
        state.settings[key] = Number(input.value);
        output.value = format(input.value);
        requestRender();
        showGuide();
      });
      input.addEventListener('change', saveSettings);
    });

    el.resetButton.addEventListener('click', () => setSettings({ ...DEFAULTS }, 'Настройки сброшены'));
    el.presetButton.addEventListener('click', () => setSettings({
      ...state.settings,
      blur: 38,
      focus: 15,
      feather: 18,
      saturation: 156,
      contrast: 130,
      brightness: 105,
      vignette: 19,
      pop: 84
    }, 'Сильный miniature-профиль применён'));
    el.autoButton.addEventListener('click', () => {
      state.settings.mode = 'auto';
      applyAutoAnalysis(true);
      saveSettings();
      updateModeUi();
      requestRender();
      showGuide(1700);
    });

    bindCompare();
    bindGuide();

    el.playButton.addEventListener('click', togglePlayback);
    el.seekInput.addEventListener('input', () => {
      if (!state.media || state.media.kind !== 'video' || state.exporting) return;
      const duration = finiteDuration();
      if (duration) el.sourceVideo.currentTime = duration * Number(el.seekInput.value) / 1000;
    });
    el.sourceVideo.addEventListener('play', () => { updatePlayButton(); startVideoLoop(); });
    el.sourceVideo.addEventListener('pause', updatePlayButton);
    el.sourceVideo.addEventListener('ended', updatePlayButton);
    el.sourceVideo.addEventListener('timeupdate', updateVideoUi);
    el.sourceVideo.addEventListener('seeked', () => {
      if (!state.exporting && state.settings.mode === 'auto') {
        analyzeCurrentFrame();
        applyAutoAnalysis(false);
      }
      requestRender();
    });

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
    const kind = M.classify(file);
    if (!kind) return showToast('Не смог определить фото или видео.');

    stopExistingMedia();
    state.media = { kind, file, width: 0, height: 0, duration: 0 };
    state.objectUrl = URL.createObjectURL(file);
    state.analysis = null;

    el.emptyState.hidden = true;
    el.workspace.hidden = false;
    el.replaceButton.hidden = false;
    setLoading(true, 'Открываю медиа', 'Проверяю декодер и размеры…');

    try {
      if (kind === 'image') await loadImage(state.objectUrl);
      else await loadVideo(state.objectUrl);
      setPreviewDimensions();
      updateMediaUi();
      analyzeCurrentFrame();
      if (state.settings.mode === 'auto') applyAutoAnalysis(false);
      setLoading(false);
      requestRender();
      showGuide(1900);
    } catch (error) {
      console.error(error);
      setLoading(false);
      stopExistingMedia();
      state.media = null;
      el.workspace.hidden = true;
      el.emptyState.hidden = false;
      el.replaceButton.hidden = true;
      showToast('Файл распознан, но его кодек не декодируется на этом устройстве.');
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      el.sourceImage.onload = () => {
        if (!el.sourceImage.naturalWidth || !el.sourceImage.naturalHeight) return reject(new Error('invalid image'));
        state.media.width = el.sourceImage.naturalWidth;
        state.media.height = el.sourceImage.naturalHeight;
        resolve();
      };
      el.sourceImage.onerror = reject;
      el.sourceImage.src = url;
    });
  }

  function loadVideo(url) {
    return new Promise((resolve, reject) => {
      const video = el.sourceVideo;
      const ready = () => {
        cleanup();
        if (!video.videoWidth || !video.videoHeight) return reject(new Error('invalid video'));
        state.media.width = video.videoWidth;
        state.media.height = video.videoHeight;
        state.media.duration = Number.isFinite(video.duration) ? video.duration : 0;
        resolve();
      };
      const fail = () => { cleanup(); reject(new Error('decode failed')); };
      const cleanup = () => {
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', fail);
      };
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('error', fail, { once: true });
      video.src = url;
      video.load();
    });
  }

  function stopExistingMedia() {
    state.videoToken += 1;
    el.sourceVideo.pause();
    el.sourceVideo.removeAttribute('src');
    el.sourceVideo.load();
    el.sourceImage.removeAttribute('src');
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }

  function setPreviewDimensions() {
    const longest = Math.max(state.media.width, state.media.height);
    const mobile = matchMedia('(max-width:700px)').matches;
    const maxEdge = mobile
      ? (state.media.kind === 'video' ? 640 : 980)
      : (state.media.kind === 'video' ? 860 : 1360);
    const scale = Math.min(1, maxEdge / longest);
    const width = Math.max(2, Math.round(state.media.width * scale));
    const height = Math.max(2, Math.round(state.media.height * scale));
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
    const media = state.media;
    const mp = ((media.width * media.height) / 1e6).toFixed(1).replace('.0', '');
    el.mediaMeta.textContent = media.kind === 'image'
      ? `${media.width}×${media.height} · ${mp} МП · ${M.prettyBytes(media.file.size)}`
      : `${media.width}×${media.height} · ${M.formatTime(media.duration)} · ${M.prettyBytes(media.file.size)}`;
    el.videoControls.hidden = media.kind !== 'video';
    el.formatSelect.hidden = media.kind === 'video';
    el.exportInfo.textContent = media.kind === 'image'
      ? 'Авто: до 4096 px по длинной стороне.'
      : 'Авто: до 1080p; видео рендерится покадрово.';
    updateVideoUi();
  }

  function analyzeCurrentFrame() {
    if (!state.media) return;
    const source = state.media.kind === 'image' ? el.sourceImage : el.sourceVideo;
    if (state.media.kind === 'video' && el.sourceVideo.readyState < 2) return;
    try {
      state.analysis = A.analyze(source, state.media.width, state.media.height);
    } catch (error) {
      console.warn('[Miniature Lab] auto analysis failed:', error);
      state.analysis = null;
    }
  }

  function applyAutoAnalysis(showFeedback) {
    if (!state.media) return;
    if (!state.analysis) analyzeCurrentFrame();
    const a = state.analysis;
    if (!a) {
      if (showFeedback) showToast('Авто-анализ не сработал — оставил ручное управление.');
      return;
    }

    if (a.suggestedMode === 'object') {
      const spread = M.clamp(Math.max(a.spreadX, a.spreadY), 0.08, 0.25);
      state.settings.objectX = M.clamp(a.cx, 0.14, 0.86);
      state.settings.objectY = M.clamp(a.cy, 0.12, 0.88);
      state.settings.objectScale = M.clamp(0.82 + spread * 1.65, 0.82, 1.28);
      state.settings.focus = Math.round(M.clamp(spread * 135, 10, 26));
      state.settings.feather = Math.round(M.clamp(state.settings.focus * 1.04, 12, 28));
      state.settings.blur = Math.round(M.clamp(35 + (0.22 - spread) * 55, 26, 41));
      state.settings.angle = 0;
      state.settings.pop = 82;
    } else {
      state.settings.position = M.clamp((a.cy - 0.5) * 1.25, -0.72, 0.72);
      state.settings.angle = a.horizontalPreference ? 0 : M.clamp(a.principalAngle, -16, 16);
      state.settings.focus = 16;
      state.settings.feather = 18;
      state.settings.blur = 37;
      state.settings.pop = 78;
      state.settings.objectScale = 1;
    }

    state.settings.saturation = Math.max(state.settings.saturation, 148);
    state.settings.contrast = Math.max(state.settings.contrast, 125);
    state.settings.vignette = Math.max(state.settings.vignette, 16);
    applySettingsToControls();
    updateModeUi();
    saveSettings();
    if (showFeedback) {
      showToast(a.suggestedMode === 'object'
        ? 'Авто выбрал объектную глубину — эллипс можно подправить пальцем.'
        : 'Авто выбрал сценическую глубину — полосу можно подправить пальцем.');
    }
  }

  function effectiveMode() {
    return state.settings.mode === 'auto'
      ? (state.analysis?.suggestedMode || 'scene')
      : state.settings.mode;
  }

  function requestRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      renderCurrentFrame();
    });
  }

  function renderCurrentFrame() {
    if (!state.media || state.exporting) return;
    const source = state.media.kind === 'image' ? el.sourceImage : el.sourceVideo;
    if (state.media.kind === 'video' && el.sourceVideo.readyState < 2) return;
    renderTo(el.previewCanvas, source, state.compare);
    drawGuide();
  }

  function renderTo(canvas, source, originalOnly = false) {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (originalOnly) {
      ctx.filter = 'none';
      ctx.drawImage(source, 0, 0, width, height);
      return;
    }

    if (R?.available) {
      const rendered = R.render(source, width, height, state.settings, effectiveMode());
      if (rendered) {
        ctx.filter = 'none';
        ctx.drawImage(rendered, 0, 0, width, height);
        return;
      }
    }

    renderFallback(ctx, source, width, height);
  }

  function renderFallback(ctx, source, width, height) {
    const grade = `saturate(${state.settings.saturation}%) contrast(${state.settings.contrast}%) brightness(${state.settings.brightness}%)`;
    ctx.filter = grade;
    ctx.drawImage(source, 0, 0, width, height);
    ctx.filter = 'none';
    if (state.settings.blur <= 0) return;

    const longest = Math.max(width, height);
    const scale = Math.min(1, 640 / longest);
    const sw = Math.max(2, Math.round(width * scale));
    const sh = Math.max(2, Math.round(height * scale));
    sizeCanvas(fallback.small, sw, sh);
    sizeCanvas(fallback.blur, width, height);
    sizeCanvas(fallback.mask, width, height);

    const smallCtx = fallback.small.getContext('2d');
    smallCtx.clearRect(0, 0, sw, sh);
    smallCtx.filter = `${grade} blur(${Math.max(1, state.settings.blur * scale * Math.min(width, height) / 900)}px)`;
    smallCtx.drawImage(source, -2, -2, sw + 4, sh + 4);
    smallCtx.filter = 'none';

    const blurCtx = fallback.blur.getContext('2d');
    blurCtx.clearRect(0, 0, width, height);
    blurCtx.drawImage(fallback.small, 0, 0, width, height);

    const maskCtx = fallback.mask.getContext('2d');
    maskCtx.clearRect(0, 0, width, height);
    paintOutsideMask(maskCtx, width, height);
    blurCtx.globalCompositeOperation = 'destination-in';
    blurCtx.drawImage(fallback.mask, 0, 0);
    blurCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fallback.blur, 0, 0);
  }

  function paintOutsideMask(ctx, width, height) {
    if (effectiveMode() === 'object') {
      const g = objectGeometry(width, height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'destination-out';
      const gradient = ctx.createRadialGradient(g.cx, g.cy, Math.min(g.rx, g.ry) * 0.7, g.cx, g.cy, Math.max(g.rx, g.ry) + g.feather);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy, g.rx + g.feather, g.ry + g.feather, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    const g = sceneGeometry(width, height);
    const gradient = ctx.createLinearGradient(
      g.centerX - g.normalX * g.extent,
      g.centerY - g.normalY * g.extent,
      g.centerX + g.normalX * g.extent,
      g.centerY + g.normalY * g.extent
    );
    const stop = (distance) => M.clamp(0.5 + distance / (2 * g.extent), 0, 1);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(stop(-(g.halfSharp + g.feather)), 'rgba(0,0,0,1)');
    gradient.addColorStop(stop(-g.halfSharp), 'rgba(0,0,0,0)');
    gradient.addColorStop(stop(g.halfSharp), 'rgba(0,0,0,0)');
    gradient.addColorStop(stop(g.halfSharp + g.feather), 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function sceneGeometry(width, height) {
    const angle = state.settings.angle * Math.PI / 180;
    const normalX = -Math.sin(angle);
    const normalY = Math.cos(angle);
    const maxProjection = (Math.abs(normalX) * width + Math.abs(normalY) * height) / 2;
    const offset = state.settings.position * maxProjection;
    return {
      normalX,
      normalY,
      centerX: width / 2 + normalX * offset,
      centerY: height / 2 + normalY * offset,
      halfSharp: maxProjection * state.settings.focus / 100,
      feather: Math.max(3, maxProjection * state.settings.feather / 100),
      extent: Math.hypot(width, height) * 0.86
    };
  }

  function objectGeometry(width, height) {
    const min = Math.min(width, height);
    const radius = min * M.clamp(state.settings.focus / 100 * 1.7, 0.11, 0.62) * state.settings.objectScale;
    return {
      cx: state.settings.objectX * width,
      cy: state.settings.objectY * height,
      rx: radius * 1.22,
      ry: radius * 0.84,
      feather: Math.max(4, min * state.settings.feather / 100 * 0.9)
    };
  }

  function bindGuide() {
    const canvas = el.guideCanvas;
    canvas.addEventListener('pointerdown', (event) => {
      if (!state.media || state.exporting) return;
      state.dragging = true;
      state.dragKind = chooseDragKind(event);
      canvas.setPointerCapture?.(event.pointerId);
      moveGuide(event);
      el.stageHint.classList.add('is-hidden');
    });
    canvas.addEventListener('pointermove', (event) => { if (state.dragging) moveGuide(event); });
    const finish = () => {
      if (!state.dragging) return;
      state.dragging = false;
      saveSettings();
      showGuide();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
  }

  function chooseDragKind(event) {
    if (effectiveMode() !== 'object') return 'move';
    const rect = el.guideCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * el.guideCanvas.width;
    const y = (event.clientY - rect.top) / rect.height * el.guideCanvas.height;
    const g = objectGeometry(el.guideCanvas.width, el.guideCanvas.height);
    const distance = Math.hypot((x - g.cx) / g.rx, (y - g.cy) / g.ry);
    return Math.abs(distance - 1) < 0.24 ? 'resize' : 'move';
  }

  function moveGuide(event) {
    const rect = el.guideCanvas.getBoundingClientRect();
    const nx = M.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const ny = M.clamp((event.clientY - rect.top) / rect.height, 0, 1);
    if (effectiveMode() === 'object') {
      if (state.dragKind === 'resize') {
        const g = objectGeometry(el.guideCanvas.width, el.guideCanvas.height);
        const px = nx * el.guideCanvas.width;
        const py = ny * el.guideCanvas.height;
        const distance = Math.hypot((px - g.cx) / Math.max(1, g.rx), (py - g.cy) / Math.max(1, g.ry));
        state.settings.objectScale = M.clamp(distance, 0.58, 1.75);
      } else {
        state.settings.objectX = nx;
        state.settings.objectY = ny;
      }
    } else {
      const px = nx * el.guideCanvas.width;
      const py = ny * el.guideCanvas.height;
      const g = sceneGeometry(el.guideCanvas.width, el.guideCanvas.height);
      const dx = px - el.guideCanvas.width / 2;
      const dy = py - el.guideCanvas.height / 2;
      const maxProjection = (Math.abs(g.normalX) * el.guideCanvas.width + Math.abs(g.normalY) * el.guideCanvas.height) / 2;
      state.settings.position = M.clamp((dx * g.normalX + dy * g.normalY) / Math.max(1, maxProjection), -0.98, 0.98);
    }
    requestRender();
  }

  function drawGuide() {
    const canvas = el.guideCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.media || state.compare || (!state.guideVisible && !state.dragging)) return;

    ctx.save();
    ctx.lineWidth = Math.max(1.5, Math.min(canvas.width, canvas.height) / 520);
    ctx.strokeStyle = 'rgba(214,255,103,.94)';
    ctx.fillStyle = '#d6ff67';
    ctx.setLineDash([10, 8]);

    if (effectiveMode() === 'object') {
      const g = objectGeometry(canvas.width, canvas.height);
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, Math.max(7, canvas.width / 110), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#161816';
      ctx.stroke();
    } else {
      const g = sceneGeometry(canvas.width, canvas.height);
      const tx = g.normalY;
      const ty = -g.normalX;
      const half = Math.hypot(canvas.width, canvas.height);
      [-g.halfSharp, g.halfSharp].forEach((offset) => {
        const x = g.centerX + g.normalX * offset;
        const y = g.centerY + g.normalY * offset;
        ctx.beginPath();
        ctx.moveTo(x - tx * half, y - ty * half);
        ctx.lineTo(x + tx * half, y + ty * half);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(g.centerX, g.centerY, Math.max(7, canvas.width / 110), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#161816';
      ctx.stroke();
    }
    ctx.restore();
  }

  function showGuide(delay = 1200) {
    clearTimeout(state.guideTimer);
    state.guideVisible = true;
    drawGuide();
    state.guideTimer = setTimeout(() => {
      if (state.dragging) return;
      state.guideVisible = false;
      const ctx = el.guideCanvas.getContext('2d');
      ctx.clearRect(0, 0, el.guideCanvas.width, el.guideCanvas.height);
    }, delay);
  }

  function bindCompare() {
    const button = el.compareButton;
    const start = (event) => {
      if (!state.media || state.exporting) return;
      event.preventDefault();
      state.compare = true;
      button.classList.add('is-active');
      button.textContent = 'Оригинал';
      requestRender();
    };
    const end = () => {
      if (!state.compare) return;
      state.compare = false;
      button.classList.remove('is-active');
      button.textContent = 'Зажми: оригинал';
      requestRender();
      showGuide();
    };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', end);
    window.addEventListener('pointerup', end);
  }

  function startVideoLoop() {
    if (!state.media || state.media.kind !== 'video') return;
    const token = ++state.videoToken;
    const frame = (now = performance.now()) => {
      if (token !== state.videoToken || !state.media || state.media.kind !== 'video') return;
      if (state.exporting) renderExportVideoFrame();
      else if (now - state.lastVideoRender >= 52) {
        state.lastVideoRender = now;
        renderCurrentFrame();
      }
      updateVideoUi();
      if (!el.sourceVideo.paused && !el.sourceVideo.ended) scheduleVideoFrame(frame);
    };
    scheduleVideoFrame(frame);
  }

  function scheduleVideoFrame(callback) {
    if ('requestVideoFrameCallback' in el.sourceVideo) {
      el.sourceVideo.requestVideoFrameCallback(() => callback(performance.now()));
    } else requestAnimationFrame(callback);
  }

  function togglePlayback() {
    if (!state.media || state.media.kind !== 'video' || state.exporting) return;
    if (el.sourceVideo.paused || el.sourceVideo.ended) {
      if (el.sourceVideo.ended) el.sourceVideo.currentTime = 0;
      el.sourceVideo.play().catch(() => showToast('Браузер не разрешил воспроизведение.'));
    } else el.sourceVideo.pause();
  }

  function updatePlayButton() {
    const playing = !el.sourceVideo.paused && !el.sourceVideo.ended;
    el.playButton.textContent = playing ? 'Ⅱ' : '▶';
    el.playButton.setAttribute('aria-label', playing ? 'Пауза' : 'Воспроизвести');
  }

  function updateVideoUi() {
    if (!state.media || state.media.kind !== 'video') return;
    const duration = finiteDuration();
    const time = Number.isFinite(el.sourceVideo.currentTime) ? el.sourceVideo.currentTime : 0;
    if (duration && !state.exporting) el.seekInput.value = String(Math.round(time / duration * 1000));
    el.timeOutput.value = `${M.formatTime(time)} / ${M.formatTime(duration)}`;
    updatePlayButton();
  }

  async function exportImage() {
    setUiLocked(true);
    setLoading(true, 'Готовлю фото', 'Рендерю эффект в экспортном разрешении…');
    try {
      const dimensions = M.resolveDimensions(state.media, el.resolutionSelect.value, 'image');
      el.exportCanvas.width = dimensions.width;
      el.exportCanvas.height = dimensions.height;
      await nextFrame();
      renderTo(el.exportCanvas, el.sourceImage, false);
      const type = el.formatSelect.value === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await M.canvasToBlob(el.exportCanvas, type, type === 'image/jpeg' ? 0.94 : undefined);
      if (!blob) throw new Error('empty export');
      const ext = type === 'image/png' ? 'png' : 'jpg';
      M.download(blob, `${M.baseName(state.media.file.name)}-miniature.${ext}`);
      showToast(`Готово · ${dimensions.width}×${dimensions.height}`);
    } catch (error) {
      console.error(error);
      showToast('Не удалось сохранить изображение.');
    } finally {
      setLoading(false);
      setUiLocked(false);
      requestRender();
    }
  }

  async function exportVideo() {
    if (!el.exportCanvas.captureStream || typeof MediaRecorder === 'undefined') {
      return showToast('Этот браузер не умеет записывать обработанный canvas.');
    }
    const mime = M.pickRecorderMime();
    if (!mime) return showToast('На этом устройстве нет доступного видеокодека для экспорта.');

    const video = el.sourceVideo;
    const savedTime = video.currentTime;
    const wasPlaying = !video.paused;
    const audioPromise = getAudioTrack();
    state.exporting = true;
    state.exportCancelled = false;
    setUiLocked(true);
    el.exportProgress.hidden = false;
    setExportProgress(0);

    try {
      video.pause();
      await seekVideo(0);
      const dimensions = M.resolveDimensions(state.media, el.resolutionSelect.value, 'video');
      el.exportCanvas.width = dimensions.width;
      el.exportCanvas.height = dimensions.height;
      renderTo(el.exportCanvas, video, false);

      const stream = el.exportCanvas.captureStream(30);
      const audio = await audioPromise;
      if (audio) stream.addTrack(audio);

      const bitrate = Math.round(M.clamp(
        dimensions.width * dimensions.height / (1280 * 720) * 5_000_000,
        4_000_000,
        24_000_000
      ));
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
      state.recorder = recorder;
      const chunks = [];
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) chunks.push(event.data); });
      const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.start(1000);
      if (state.monitorGain) state.monitorGain.gain.value = 0;

      const finished = new Promise((resolve) => { state.exportResolve = resolve; });
      const ended = () => state.exportResolve?.('ended');
      video.addEventListener('ended', ended, { once: true });
      await video.play();
      startVideoLoop();
      await finished;
      video.removeEventListener('ended', ended);
      video.pause();
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;

      if (!state.exportCancelled) {
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        if (!blob.size) throw new Error('empty video');
        const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
        M.download(blob, `${M.baseName(state.media.file.name)}-miniature.${ext}`);
        showToast(`Видео готово · ${dimensions.width}×${dimensions.height}`);
      } else showToast('Экспорт отменён');
    } catch (error) {
      console.error(error);
      showToast('Экспорт видео не завершился.');
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
      else requestRender();
    }
  }

  function renderExportVideoFrame() {
    if (!state.exporting) return;
    renderTo(el.exportCanvas, el.sourceVideo, false);
    const ctx = el.previewCanvas.getContext('2d', { alpha: false });
    ctx.clearRect(0, 0, el.previewCanvas.width, el.previewCanvas.height);
    ctx.drawImage(el.exportCanvas, 0, 0, el.previewCanvas.width, el.previewCanvas.height);
    const duration = finiteDuration();
    setExportProgress(duration ? M.clamp(el.sourceVideo.currentTime / duration, 0, 1) : 0);
  }

  function cancelVideoExport() {
    if (!state.exporting) return;
    state.exportCancelled = true;
    el.sourceVideo.pause();
    state.exportResolve?.('cancel');
  }

  async function getAudioTrack() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      if (!state.audioContext) {
        state.audioContext = new AudioContextClass();
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
      console.warn('[Miniature Lab] audio export unavailable:', error);
      return null;
    }
  }

  function seekVideo(time) {
    const video = el.sourceVideo;
    if (!Number.isFinite(time) || Math.abs(video.currentTime - time) < 0.02) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', fail);
        resolve();
      };
      const fail = () => {
        clearTimeout(timer);
        reject(new Error('seek failed'));
      };
      video.addEventListener('seeked', done, { once: true });
      video.addEventListener('error', fail, { once: true });
      timer = setTimeout(done, 2500);
      video.currentTime = M.clamp(time, 0, finiteDuration() || time);
    });
  }

  function finiteDuration() {
    const duration = el.sourceVideo.duration;
    return Number.isFinite(duration) && duration > 0 ? duration : (state.media?.duration || 0);
  }

  function setUiLocked(locked) {
    controls.forEach(([, input]) => { input.disabled = locked; });
    [
      el.resetButton, el.presetButton, el.autoButton, el.resolutionSelect, el.formatSelect,
      el.exportButton, el.replaceInput, el.playButton, el.seekInput, el.compareButton
    ].forEach((node) => { if (node) node.disabled = locked; });
    if (el.modeSwitch) el.modeSwitch.querySelectorAll('button').forEach((button) => { button.disabled = locked; });
    updateModeUi();
  }

  function setExportProgress(progress) {
    const pct = Math.round(M.clamp(progress, 0, 1) * 100);
    el.progressBar.style.width = `${pct}%`;
    el.progressText.textContent = `Экспорт ${pct}%`;
  }

  function setLoading(visible, title = '', text = '') {
    el.loadingState.hidden = !visible;
    if (title) el.loadingTitle.textContent = title;
    if (text) el.loadingText.textContent = text;
  }

  function updateModeUi() {
    if (el.modeSwitch) {
      el.modeSwitch.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.focusMode === state.settings.mode);
      });
    }
    el.angleInput.disabled = state.exporting || effectiveMode() === 'object';
    el.stageHint.textContent = effectiveMode() === 'object'
      ? 'Тяни эллипс по объекту · тяни за край, чтобы менять размер'
      : 'Тяни кадр поперёк — двигается зона резкости';
  }

  function setSettings(next, message) {
    state.settings = sanitizeSettings(next);
    applySettingsToControls();
    saveSettings();
    updateModeUi();
    requestRender();
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
      return sanitizeSettings({ ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) });
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function sanitizeSettings(settings) {
    const next = { ...DEFAULTS, ...settings };
    next.mode = ['auto','scene','object'].includes(next.mode) ? next.mode : DEFAULTS.mode;
    for (const key of ['blur','focus','feather','angle','saturation','contrast','brightness','vignette','pop','position','objectX','objectY','objectScale']) {
      const value = Number(next[key]);
      next[key] = Number.isFinite(value) ? value : DEFAULTS[key];
    }
    next.position = M.clamp(next.position, -0.98, 0.98);
    next.objectX = M.clamp(next.objectX, 0, 1);
    next.objectY = M.clamp(next.objectY, 0, 1);
    next.objectScale = M.clamp(next.objectScale, 0.58, 1.75);
    return next;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch (_) {}
  }

  function sizeCanvas(canvas, width, height) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    state.toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 3300);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }
})();
