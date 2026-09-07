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

  const state = {
    settings: loadSettings(),
    media: null,
    objectUrl: null,
    compare: false,
    dragging: false,
    dragKind: 'focus',
    guideTimer: 0,
    loopToken: 0,
    renderQueued: false,
    lastVideoRender: 0,
    exporting: false,
    exportCancelled: false,
    exportResolve: null,
    recorder: null,
    toastTimer: 0,
    audioContext: null,
    audioSource: null,
    audioDestination: null,
    monitorGain: null,
    imageCacheKey: '',
    imageLayers: null,
    analysis: null,
    autoAppliedForCurrentAsset: false
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    emptyState: $('emptyState'), workspace: $('workspace'), fileInput: $('fileInput'), replaceInput: $('replaceInput'), replaceButton: $('replaceButton'),
    sourceImage: $('sourceImage'), sourceVideo: $('sourceVideo'), previewCanvas: $('previewCanvas'), guideCanvas: $('guideCanvas'), exportCanvas: $('exportCanvas'),
    loadingState: $('loadingState'), loadingTitle: $('loadingTitle'), loadingText: $('loadingText'), stageHint: $('stageHint'), mediaMeta: $('mediaMeta'),
    compareButton: $('compareButton'), videoControls: $('videoControls'), playButton: $('playButton'), seekInput: $('seekInput'), timeOutput: $('timeOutput'),
    resolutionSelect: $('resolutionSelect'), formatSelect: $('formatSelect'), exportButton: $('exportButton'), exportInfo: $('exportInfo'), exportProgress: $('exportProgress'),
    progressBar: $('progressBar'), progressText: $('progressText'), cancelExport: $('cancelExport'), resetButton: $('resetButton'), presetButton: $('presetButton'), autoButton: $('autoButton'), toast: $('toast'),
    blurInput: $('blurInput'), focusInput: $('focusInput'), featherInput: $('featherInput'), angleInput: $('angleInput'), saturationInput: $('saturationInput'),
    contrastInput: $('contrastInput'), brightnessInput: $('brightnessInput'), vignetteInput: $('vignetteInput'), popInput: $('popInput'),
    blurValue: $('blurValue'), focusValue: $('focusValue'), featherValue: $('featherValue'), angleValue: $('angleValue'), saturationValue: $('saturationValue'),
    contrastValue: $('contrastValue'), brightnessValue: $('brightnessValue'), vignetteValue: $('vignetteValue'), popValue: $('popValue')
  };

  const scratch = {
    small: document.createElement('canvas'),
    layer: document.createElement('canvas'),
    mask: document.createElement('canvas'),
    pop: document.createElement('canvas'),
    radial: document.createElement('canvas'),
    analysis: document.createElement('canvas')
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
    installModeControls();
    applySettingsToControls();
    bindEvents();
    updateModeUi();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
    }
  }

  function installModeControls() {
    const rail = document.querySelector('.control-rail');
    const heading = document.querySelector('.rail-heading');
    if (!rail || !heading) return;
    const wrap = document.createElement('div');
    wrap.className = 'focus-mode-switch';
    wrap.innerHTML = '<button type="button" data-focus-mode="auto"><b>Авто</b><small>сам ищет главный объект</small></button><button type="button" data-focus-mode="scene"><b>Сцена</b><small>улицы, комнаты, пейзажи</small></button><button type="button" data-focus-mode="object"><b>Объект</b><small>еда, вещи, люди сверху</small></button>';
    heading.insertAdjacentElement('afterend', wrap);
    const style = document.createElement('style');
    style.textContent = `.focus-mode-switch{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0 4px}.focus-mode-switch button{min-height:58px;border:1px solid var(--line);background:#fff;text-align:left;padding:8px 9px;cursor:pointer}.focus-mode-switch button.is-active{border-color:var(--ink);background:var(--ink);color:#fff}.focus-mode-switch b{display:block;font-size:11px}.focus-mode-switch small{display:block;font-size:9px;line-height:1.25;margin-top:3px;opacity:.72}.focus-mode-switch button:active{transform:translateY(1px)}@media (max-width:620px){.focus-mode-switch{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
    wrap.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-focus-mode]');
      if (!button || state.exporting) return;
      state.settings.mode = button.dataset.focusMode;
      saveSettings();
      updateModeUi();
      if (state.settings.mode === 'auto') runAutoFocus(false);
      requestRender();
      showGuide(1800);
      const title = state.settings.mode === 'object' ? 'Режим «Объект» активен' : state.settings.mode === 'scene' ? 'Режим «Сцена» активен' : 'Авто‑режим активен';
      showToast(title);
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
        if (['blur', 'saturation', 'contrast', 'brightness'].includes(key)) invalidateImageCache();
        requestRender();
        showGuide();
      });
      input.addEventListener('change', saveSettings);
    });

    el.resetButton.addEventListener('click', () => setSettings(DEFAULTS, 'Настройки сброшены'));
    el.presetButton.addEventListener('click', () => setSettings({
      ...state.settings,
      blur: 36,
      focus: 16,
      feather: 18,
      saturation: 154,
      contrast: 128,
      brightness: 105,
      vignette: 18,
      pop: 80
    }, 'Применён сильный miniature-профиль'));
    el.autoButton.addEventListener('click', () => runAutoFocus(true));

    bindCompareEvents();
    bindGuideDrag();

    el.playButton.addEventListener('click', togglePlayback);
    el.seekInput.addEventListener('input', () => {
      if (!state.media || state.media.kind !== 'video' || state.exporting) return;
      const d = finiteDuration();
      if (d) el.sourceVideo.currentTime = d * Number(el.seekInput.value) / 1000;
    });

    el.sourceVideo.addEventListener('play', () => {
      updatePlayButton();
      startVideoLoop();
    });
    el.sourceVideo.addEventListener('pause', updatePlayButton);
    el.sourceVideo.addEventListener('ended', updatePlayButton);
    el.sourceVideo.addEventListener('timeupdate', updateVideoUi);
    el.sourceVideo.addEventListener('seeked', () => {
      if (state.settings.mode === 'auto' && !state.exporting) analyzeCurrentFrame(false);
      requestRender();
    });

    el.exportButton.addEventListener('click', () => {
      if (!state.media || state.exporting) return;
      if (state.media.kind === 'image') exportImage(); else exportVideo();
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
    if (!kind) return showToast('Не смог определить фото или видео.');

    stopExistingMedia();
    state.media = { kind, file, width: 0, height: 0, duration: 0 };
    state.objectUrl = URL.createObjectURL(file);
    state.analysis = null;
    state.autoAppliedForCurrentAsset = false;
    invalidateImageCache();

    el.emptyState.hidden = true;
    el.workspace.hidden = false;
    el.replaceButton.hidden = false;
    setLoading(true, 'Открываю медиа', 'Подготавливаю кадр…');

    try {
      if (kind === 'image') await loadImageSource(state.objectUrl);
      else await loadVideoSource(state.objectUrl);
      setPreviewDimensions();
      updateMediaUi();
      setLoading(false);
      analyzeCurrentFrame(true);
      requestRender();
      showGuide(1800);
    } catch (error) {
      console.error(error);
      setLoading(false);
      stopExistingMedia();
      state.media = null;
      el.workspace.hidden = true;
      el.emptyState.hidden = false;
      el.replaceButton.hidden = true;
      showToast('Этот файл браузер не смог декодировать.');
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
      el.sourceImage.onload = () => {
        if (!el.sourceImage.naturalWidth) return reject(new Error('bad image'));
        state.media.width = el.sourceImage.naturalWidth;
        state.media.height = el.sourceImage.naturalHeight;
        resolve();
      };
      el.sourceImage.onerror = reject;
      el.sourceImage.src = url;
    });
  }

  function loadVideoSource(url) {
    return new Promise((resolve, reject) => {
      const video = el.sourceVideo;
      const ready = () => {
        cleanup();
        if (!video.videoWidth) return reject(new Error('bad video'));
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
    state.loopToken += 1;
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
    const edge = mobile ? (state.media.kind === 'video' ? 720 : 980) : (state.media.kind === 'video' ? 960 : 1360);
    const scale = Math.min(1, edge / longest);
    const w = Math.max(2, Math.round(state.media.width * scale));
    const h = Math.max(2, Math.round(state.media.height * scale));
    el.previewCanvas.width = w;
    el.previewCanvas.height = h;
    el.guideCanvas.width = w;
    el.guideCanvas.height = h;
    syncGuideCanvasCss();
  }

  function syncGuideCanvasCss() {
    requestAnimationFrame(() => {
      const rect = el.previewCanvas.getBoundingClientRect();
      if (!rect.width) return;
      el.guideCanvas.style.width = `${rect.width}px`;
      el.guideCanvas.style.height = `${rect.height}px`;
    });
  }

  function updateMediaUi() {
    const m = state.media;
    const mp = ((m.width * m.height) / 1e6).toFixed(1).replace('.0', '');
    el.mediaMeta.textContent = m.kind === 'image'
      ? `${m.width}×${m.height} · ${mp} МП · ${prettyBytes(m.file.size)}`
      : `${m.width}×${m.height} · ${formatTime(m.duration)} · ${prettyBytes(m.file.size)}`;
    el.videoControls.hidden = m.kind !== 'video';
    el.formatSelect.hidden = m.kind === 'video';
    el.exportInfo.textContent = m.kind === 'image'
      ? 'Авто: до 4096 px по длинной стороне.'
      : 'Авто: до 1080p; видео рендерится покадрово.';
    updateVideoUi();
  }

  function analyzeCurrentFrame(applyAfter = false) {
    if (!state.media) return;
    const source = state.media.kind === 'image' ? el.sourceImage : el.sourceVideo;
    if (state.media.kind === 'video' && el.sourceVideo.readyState < 2) return;
    state.analysis = analyzeFrame(source, state.media.width, state.media.height);
    if ((state.settings.mode === 'auto' || applyAfter) && !state.autoAppliedForCurrentAsset) {
      runAutoFocus(false);
      state.autoAppliedForCurrentAsset = true;
    }
  }

  function analyzeFrame(source, sourceW, sourceH) {
    const longest = Math.max(sourceW, sourceH);
    const scale = Math.min(1, 320 / longest);
    const w = Math.max(24, Math.round(sourceW * scale));
    const h = Math.max(24, Math.round(sourceH * scale));
    ensureCanvasSize(scratch.analysis, w, h);
    const ctx = scratch.analysis.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    let total = 0, sumX = 0, sumY = 0;
    const cell = 4;
    const map = [];
    for (let y = 1; y < h - 1; y += cell) {
      for (let x = 1; x < w - 1; x += cell) {
        const i = ((y * w) + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const idxR = ((y * w) + Math.min(w - 1, x + 1)) * 4;
        const idxD = (((Math.min(h - 1, y + 1) * w) + x) * 4);
        const lumR = 0.2126 * data[idxR] + 0.7152 * data[idxR + 1] + 0.0722 * data[idxR + 2];
        const lumD = 0.2126 * data[idxD] + 0.7152 * data[idxD + 1] + 0.0722 * data[idxD + 2];
        const edge = Math.abs(lum - lumR) + Math.abs(lum - lumD);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max ? ((max - min) / max) : 0;
        const cx = (x / (w - 1)) - 0.5;
        const cy = (y / (h - 1)) - 0.5;
        const centerBias = 1.18 - Math.min(1, Math.hypot(cx * 1.05, cy) * 1.25) * 0.45;
        const score = (edge * 0.8 + sat * 90 + Math.abs(lum - 128) * 0.18 + 12) * centerBias;
        map.push({ x: x / w, y: y / h, score });
        total += score;
        sumX += (x / w) * score;
        sumY += (y / h) * score;
      }
    }
    const cx = total ? sumX / total : 0.5;
    const cy = total ? sumY / total : 0.5;
    let spreadX = 0, spreadY = 0;
    for (const point of map) {
      spreadX += Math.abs(point.x - cx) * point.score;
      spreadY += Math.abs(point.y - cy) * point.score;
    }
    spreadX = total ? spreadX / total : 0.16;
    spreadY = total ? spreadY / total : 0.16;

    const upper = bandEnergy(map, 0, 0.18);
    const lower = bandEnergy(map, 0.82, 1);
    const middle = bandEnergy(map, 0.36, 0.64);
    const horizontalPreference = middle > (upper + lower) * 0.66;
    const concentrated = Math.max(spreadX, spreadY) < 0.19;

    return { cx, cy, spreadX, spreadY, horizontalPreference, concentrated };
  }

  function bandEnergy(map, minY, maxY) {
    let total = 0;
    for (const p of map) if (p.y >= minY && p.y <= maxY) total += p.score;
    return total;
  }

  function runAutoFocus(showFeedback) {
    if (!state.media) return;
    if (!state.analysis) analyzeCurrentFrame(false);
    if (!state.analysis) return;
    const a = state.analysis;
    const useObject = a.concentrated || (Math.abs(a.cy - 0.5) > 0.1 && Math.max(a.spreadX, a.spreadY) < 0.24);
    if (useObject) {
      state.settings.mode = 'object';
      state.settings.objectX = clamp(a.cx, 0.16, 0.84);
      state.settings.objectY = clamp(a.cy, 0.12, 0.88);
      const spread = clamp(Math.max(a.spreadX, a.spreadY), 0.08, 0.25);
      state.settings.focus = Math.round(clamp(spread * 135, 10, 26));
      state.settings.feather = Math.round(clamp(state.settings.focus * 1.05, 12, 28));
      state.settings.objectScale = clamp(0.8 + spread * 1.7, 0.85, 1.25);
      state.settings.blur = Math.round(clamp(34 + (0.22 - spread) * 55, 24, 40));
      state.settings.pop = 80;
      state.settings.angle = 0;
    } else {
      state.settings.mode = 'scene';
      state.settings.objectScale = 1;
      state.settings.position = clamp((a.cy - 0.5) * 1.3, -0.72, 0.72);
      state.settings.angle = a.horizontalPreference ? 0 : (a.cx < 0.5 ? -8 : 8);
      state.settings.focus = 16;
      state.settings.feather = 18;
      state.settings.blur = 36;
      state.settings.pop = 76;
    }
    state.settings.saturation = Math.max(state.settings.saturation, 146);
    state.settings.contrast = Math.max(state.settings.contrast, 124);
    state.settings.vignette = Math.max(state.settings.vignette, 16);
    saveSettings();
    invalidateImageCache();
    applySettingsToControls();
    updateModeUi();
    requestRender();
    showGuide(1800);
    if (showFeedback) showToast(useObject ? 'Авто нашёл объект и выставил эллипс' : 'Авто выставил полоску по сцене');
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
    drawProcessed(el.previewCanvas, source, state.compare, false);
    drawGuide();
  }

  function drawProcessed(canvas, source, originalOnly = false, isExport = false) {
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: !isExport });
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (originalOnly) {
      ctx.filter = 'none';
      ctx.drawImage(source, 0, 0, w, h);
      ctx.restore();
      return;
    }

    const grade = gradeFilter();
    ctx.filter = grade;
    ctx.drawImage(source, 0, 0, w, h);
    ctx.filter = 'none';

    if (state.settings.blur > 0) drawProgressiveBlur(ctx, source, w, h, grade, isExport);
    drawFocusPop(ctx, source, w, h, isExport);
    if (state.settings.vignette > 0) drawVignette(ctx, w, h, state.settings.vignette);
    ctx.restore();
  }

  function gradeFilter(extraContrast = 0, extraSat = 0, extraBright = 0) {
    return `saturate(${state.settings.saturation + extraSat}%) contrast(${state.settings.contrast + extraContrast}%) brightness(${state.settings.brightness + extraBright}%)`;
  }

  function drawProgressiveBlur(targetCtx, source, w, h, colorFilter, isExport) {
    const levels = state.media?.kind === 'video' && !isExport ? [0.42, 0.82] : [0.28, 0.54, 0.86, 1.16];
    const starts = levels.length === 2 ? [0.06, 0.76] : [0, 0.34, 0.72, 1.1];
    const spans = levels.length === 2 ? [0.78, 1.1] : [0.6, 0.75, 0.84, 1.1];
    const cached = state.media?.kind === 'image' && !isExport ? getImageBlurLayers(source, w, h, colorFilter, levels) : null;
    levels.forEach((factor, index) => {
      const layer = cached ? cached[index] : renderBlurLayer(source, w, h, colorFilter, factor, isExport);
      maskAndComposite(targetCtx, layer, w, h, starts[index], spans[index]);
    });
  }

  function getImageBlurLayers(source, w, h, colorFilter, levels) {
    const key = [w,h,state.settings.blur,state.settings.saturation,state.settings.contrast,state.settings.brightness,levels.join(',')].join('|');
    if (state.imageCacheKey === key && state.imageLayers) return state.imageLayers;
    state.imageLayers = levels.map((factor) => cloneCanvas(renderBlurLayer(source, w, h, colorFilter, factor, false)));
    state.imageCacheKey = key;
    return state.imageLayers;
  }

  function renderBlurLayer(source, w, h, colorFilter, factor, isExport) {
    ensureCanvasSize(scratch.layer, w, h);
    const longest = Math.max(w, h);
    const sampleEdge = isExport ? 1400 : (state.media?.kind === 'video' ? 560 : 760);
    const scale = Math.min(1, sampleEdge / longest);
    const sw = Math.max(2, Math.round(w * scale));
    const sh = Math.max(2, Math.round(h * scale));
    ensureCanvasSize(scratch.small, sw, sh);
    const sctx = scratch.small.getContext('2d');
    sctx.clearRect(0, 0, sw, sh);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    const px = Math.max(0.8, state.settings.blur * factor * Math.min(w, h) / 690 * scale);
    sctx.filter = `${colorFilter} blur(${px.toFixed(2)}px)`;
    sctx.drawImage(source, -2, -2, sw + 4, sh + 4);
    sctx.filter = 'none';
    const lctx = scratch.layer.getContext('2d');
    lctx.clearRect(0, 0, w, h);
    lctx.imageSmoothingEnabled = true;
    lctx.imageSmoothingQuality = 'high';
    lctx.drawImage(scratch.small, 0, 0, w, h);
    return scratch.layer;
  }

  function maskAndComposite(targetCtx, layer, w, h, start, span) {
    ensureCanvasSize(scratch.mask, w, h);
    const mctx = scratch.mask.getContext('2d');
    mctx.clearRect(0, 0, w, h);
    if (effectiveMode() === 'object') paintObjectOutsideMask(mctx, w, h, start, span);
    else paintSceneOutsideMask(mctx, w, h, start, span);
    ensureCanvasSize(scratch.pop, w, h);
    const pctx = scratch.pop.getContext('2d');
    pctx.clearRect(0, 0, w, h);
    pctx.drawImage(layer, 0, 0);
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(scratch.mask, 0, 0);
    pctx.globalCompositeOperation = 'source-over';
    targetCtx.drawImage(scratch.pop, 0, 0);
  }

  function paintSceneOutsideMask(ctx, w, h, start, span) {
    const g = sceneGeometry(w, h);
    const inner = g.halfSharp + g.feather * start;
    const outer = inner + g.feather * span;
    const grad = ctx.createLinearGradient(g.centerX - g.normalX * g.extent, g.centerY - g.normalY * g.extent, g.centerX + g.normalX * g.extent, g.centerY + g.normalY * g.extent);
    const stop = (d) => clamp(0.5 + d / (2 * g.extent), 0, 1);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(stop(-outer), 'rgba(0,0,0,1)');
    grad.addColorStop(stop(-inner), 'rgba(0,0,0,0)');
    grad.addColorStop(stop(inner), 'rgba(0,0,0,0)');
    grad.addColorStop(stop(outer), 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  function paintObjectOutsideMask(ctx, w, h, start, span) {
    const g = objectGeometry(w, h);
    const innerX = g.rx + g.feather * start;
    const innerY = g.ry + g.feather * start * 0.76;
    const outerX = innerX + g.feather * span;
    const outerY = innerY + g.feather * span * 0.76;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const size = 256;
    ensureCanvasSize(scratch.radial, size, size);
    const rctx = scratch.radial.getContext('2d');
    rctx.clearRect(0, 0, size, size);
    const ratio = clamp(Math.max(innerX / outerX, innerY / outerY), 0, 0.95);
    const grad = rctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(ratio, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    rctx.fillStyle = grad;
    rctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(scratch.radial, g.cx - outerX, g.cy - outerY, outerX * 2, outerY * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFocusPop(targetCtx, source, w, h, isExport) {
    ensureCanvasSize(scratch.pop, w, h);
    const pctx = scratch.pop.getContext('2d');
    pctx.clearRect(0, 0, w, h);
    const punchContrast = Math.round(state.settings.pop * 0.14);
    const punchSat = Math.round(state.settings.pop * 0.1);
    pctx.filter = gradeFilter(punchContrast, punchSat, 1);
    pctx.drawImage(source, 0, 0, w, h);
    pctx.filter = 'none';

    ensureCanvasSize(scratch.mask, w, h);
    const mctx = scratch.mask.getContext('2d');
    mctx.clearRect(0, 0, w, h);
    paintSharpMask(mctx, w, h);
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(scratch.mask, 0, 0);
    pctx.globalCompositeOperation = 'source-over';
    targetCtx.globalAlpha = isExport ? clamp(0.48 + state.settings.pop / 200, 0.55, 0.92) : clamp(0.42 + state.settings.pop / 210, 0.48, 0.82);
    targetCtx.drawImage(scratch.pop, 0, 0);
    targetCtx.globalAlpha = 1;
  }

  function paintSharpMask(ctx, w, h) {
    if (effectiveMode() === 'object') {
      const g = objectGeometry(w, h);
      ctx.fillStyle = 'rgba(0,0,0,.94)';
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const g = sceneGeometry(w, h);
    const tangentX = g.normalY, tangentY = -g.normalX, lineHalf = Math.hypot(w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.94)';
    ctx.lineWidth = g.halfSharp * 2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(g.centerX - tangentX * lineHalf, g.centerY - tangentY * lineHalf);
    ctx.lineTo(g.centerX + tangentX * lineHalf, g.centerY + tangentY * lineHalf);
    ctx.stroke();
  }

  function effectiveMode() {
    return state.settings.mode === 'auto' ? ((state.analysis?.concentrated || false) ? 'object' : 'scene') : state.settings.mode;
  }

  function sceneGeometry(w, h) {
    const a = state.settings.angle * Math.PI / 180;
    const normalX = -Math.sin(a), normalY = Math.cos(a);
    const maxProjection = (Math.abs(normalX) * w + Math.abs(normalY) * h) / 2;
    const offset = state.settings.position * maxProjection;
    return {
      normalX, normalY,
      centerX: w/2 + normalX * offset,
      centerY: h/2 + normalY * offset,
      maxProjection,
      halfSharp: maxProjection * (state.settings.focus / 100),
      feather: Math.max(3, maxProjection * (state.settings.feather / 100)),
      extent: Math.hypot(w, h) * 0.86
    };
  }

  function objectGeometry(w, h) {
    const min = Math.min(w, h);
    const radius = min * clamp(state.settings.focus / 100 * 1.7, 0.11, 0.62) * state.settings.objectScale;
    return {
      cx: state.settings.objectX * w,
      cy: state.settings.objectY * h,
      rx: radius * 1.22,
      ry: radius * 0.84,
      feather: Math.max(4, min * (state.settings.feather / 100) * 0.9)
    };
  }

  function drawGuide() {
    const c = el.guideCanvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!state.media || state.compare) return;
    ctx.save();
    ctx.lineWidth = Math.max(1.5, Math.min(c.width, c.height) / 520);
    ctx.strokeStyle = 'rgba(214,255,103,.92)';
    ctx.fillStyle = '#d6ff67';
    ctx.setLineDash([10, 8]);
    if (effectiveMode() === 'object') {
      const g = objectGeometry(c.width, c.height);
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(g.cx, g.cy, Math.max(7, c.width / 110), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#171817'; ctx.stroke();
    } else {
      const g = sceneGeometry(c.width, c.height), tx = g.normalY, ty = -g.normalX, half = Math.hypot(c.width, c.height);
      [-g.halfSharp, g.halfSharp].forEach((off) => {
        const x = g.centerX + g.normalX * off, y = g.centerY + g.normalY * off;
        ctx.beginPath(); ctx.moveTo(x - tx * half, y - ty * half); ctx.lineTo(x + tx * half, y + ty * half); ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(g.centerX, g.centerY, Math.max(7, c.width / 110), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#171817'; ctx.stroke();
    }
    ctx.restore();
  }

  function bindGuideDrag() {
    const c = el.guideCanvas;
    c.addEventListener('pointerdown', (event) => {
      if (!state.media || state.exporting) return;
      state.dragging = true;
      state.dragKind = chooseDragKind(event);
      c.setPointerCapture?.(event.pointerId);
      moveFocus(event);
      el.stageHint.classList.add('is-hidden');
    });
    c.addEventListener('pointermove', (event) => { if (state.dragging) moveFocus(event); });
    const finish = () => { if (!state.dragging) return; state.dragging = false; saveSettings(); showGuide(); };
    c.addEventListener('pointerup', finish);
    c.addEventListener('pointercancel', finish);
  }

  function chooseDragKind(event) {
    if (effectiveMode() !== 'object') return 'focus';
    const rect = el.guideCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * el.guideCanvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * el.guideCanvas.height;
    const g = objectGeometry(el.guideCanvas.width, el.guideCanvas.height);
    const dx = (x - g.cx) / g.rx;
    const dy = (y - g.cy) / g.ry;
    const distance = Math.hypot(dx, dy);
    return Math.abs(distance - 1) < 0.22 ? 'resize' : 'focus';
  }

  function moveFocus(event) {
    const rect = el.guideCanvas.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    if (effectiveMode() === 'object') {
      if (state.dragKind === 'resize') {
        const g = objectGeometry(el.guideCanvas.width, el.guideCanvas.height);
        const px = x * el.guideCanvas.width, py = y * el.guideCanvas.height;
        const dist = Math.hypot((px - g.cx) / Math.max(1, g.rx), (py - g.cy) / Math.max(1, g.ry));
        state.settings.objectScale = clamp(dist, 0.6, 1.7);
      } else {
        state.settings.objectX = x; state.settings.objectY = y;
      }
    } else {
      const px = x * el.guideCanvas.width, py = y * el.guideCanvas.height;
      const g = sceneGeometry(el.guideCanvas.width, el.guideCanvas.height);
      const dx = px - el.guideCanvas.width / 2, dy = py - el.guideCanvas.height / 2;
      state.settings.position = clamp((dx * g.normalX + dy * g.normalY) / Math.max(1, g.maxProjection), -0.98, 0.98);
    }
    requestRender();
  }

  function bindCompareEvents() {
    const b = el.compareButton;
    const start = (event) => {
      if (!state.media || state.exporting) return;
      event.preventDefault();
      state.compare = true;
      b.classList.add('is-active');
      b.textContent = 'Оригинал';
      requestRender();
    };
    const end = () => {
      if (!state.compare) return;
      state.compare = false;
      b.classList.remove('is-active');
      b.textContent = 'Зажми: оригинал';
      requestRender();
      showGuide();
    };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('pointerleave', end);
    window.addEventListener('pointerup', end);
  }

  function showGuide(delay = 1200) {
    clearTimeout(state.guideTimer);
    drawGuide();
    state.guideTimer = setTimeout(() => {
      if (state.dragging) return;
      el.guideCanvas.getContext('2d').clearRect(0, 0, el.guideCanvas.width, el.guideCanvas.height);
    }, delay);
  }

  function startVideoLoop() {
    if (!state.media || state.media.kind !== 'video') return;
    const token = ++state.loopToken;
    const frame = (now = performance.now()) => {
      if (token !== state.loopToken || !state.media || state.media.kind !== 'video') return;
      if (state.exporting) renderExportVideoFrame();
      else if (now - state.lastVideoRender > 44) { state.lastVideoRender = now; renderCurrentFrame(); }
      updateVideoUi();
      if (!el.sourceVideo.paused && !el.sourceVideo.ended) schedule(frame);
    };
    schedule(frame);
  }

  function schedule(cb) {
    if ('requestVideoFrameCallback' in el.sourceVideo) el.sourceVideo.requestVideoFrameCallback(() => cb(performance.now()));
    else requestAnimationFrame(cb);
  }

  function renderExportVideoFrame() {
    if (!state.exporting) return;
    drawProcessed(el.exportCanvas, el.sourceVideo, false, true);
    const ctx = el.previewCanvas.getContext('2d', { alpha: false });
    ctx.clearRect(0, 0, el.previewCanvas.width, el.previewCanvas.height);
    ctx.drawImage(el.exportCanvas, 0, 0, el.previewCanvas.width, el.previewCanvas.height);
    const d = finiteDuration();
    setExportProgress(d ? clamp(el.sourceVideo.currentTime / d, 0, 1) : 0);
  }

  function togglePlayback() {
    if (!state.media || state.media.kind !== 'video' || state.exporting) return;
    if (el.sourceVideo.paused || el.sourceVideo.ended) {
      if (el.sourceVideo.ended) el.sourceVideo.currentTime = 0;
      el.sourceVideo.play().catch(() => showToast('Браузер не разрешил воспроизведение.'));
    } else el.sourceVideo.pause();
  }

  function updatePlayButton() {
    const p = !el.sourceVideo.paused && !el.sourceVideo.ended;
    el.playButton.textContent = p ? 'Ⅱ' : '▶';
    el.playButton.setAttribute('aria-label', p ? 'Пауза' : 'Воспроизвести');
  }

  function updateVideoUi() {
    if (!state.media || state.media.kind !== 'video') return;
    const d = finiteDuration(), t = Number.isFinite(el.sourceVideo.currentTime) ? el.sourceVideo.currentTime : 0;
    if (d && !state.exporting) el.seekInput.value = String(Math.round(t / d * 1000));
    el.timeOutput.value = `${formatTime(t)} / ${formatTime(d)}`;
    updatePlayButton();
  }

  async function exportImage() {
    if (!state.media || state.media.kind !== 'image') return;
    setLoading(true, 'Готовлю файл', 'Рендерю miniature-эффект…');
    setUiLocked(true);
    try {
      const d = resolveExportDimensions('image');
      el.exportCanvas.width = d.width; el.exportCanvas.height = d.height;
      await nextFrame();
      drawProcessed(el.exportCanvas, el.sourceImage, false, true);
      const type = el.formatSelect.value === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(el.exportCanvas, type, type === 'image/jpeg' ? 0.94 : undefined);
      if (!blob) throw new Error('export');
      downloadBlob(blob, `${fileBaseName(state.media.file.name)}-miniature.${type === 'image/png' ? 'png' : 'jpg'}`);
      showToast(`Готово · ${d.width}×${d.height}`);
    } catch (e) {
      console.error(e); showToast('Не удалось сохранить изображение.');
    } finally {
      setLoading(false); setUiLocked(false); requestRender();
    }
  }

  async function exportVideo() {
    if (!state.media || state.media.kind !== 'video' || state.exporting) return;
    if (!el.exportCanvas.captureStream || typeof MediaRecorder === 'undefined') return showToast('Этот браузер не умеет записывать обработанный canvas.');
    const mime = pickRecorderMime();
    if (!mime) return showToast('Нет доступного видеокодека для экспорта.');
    const video = el.sourceVideo, saved = video.currentTime, wasPlaying = !video.paused;
    state.exporting = true; state.exportCancelled = false; setUiLocked(true); el.exportProgress.hidden = false; setExportProgress(0);
    try {
      video.pause(); await seekVideo(0);
      const d = resolveExportDimensions('video');
      el.exportCanvas.width = d.width; el.exportCanvas.height = d.height;
      drawProcessed(el.exportCanvas, video, false, true);
      const stream = el.exportCanvas.captureStream(30), audio = await getAudioTrack(); if (audio) stream.addTrack(audio);
      const bitrate = Math.round(clamp((d.width * d.height / (1280 * 720)) * 5_000_000, 4_000_000, 24_000_000));
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
      state.recorder = rec;
      const chunks = [];
      rec.addEventListener('dataavailable', (e) => { if (e.data?.size) chunks.push(e.data); });
      const stopped = new Promise((r) => rec.addEventListener('stop', r, { once: true }));
      rec.start(1000);
      if (state.monitorGain) state.monitorGain.gain.value = 0;
      const finish = new Promise((r) => { state.exportResolve = r; });
      const ended = () => state.exportResolve?.('ended');
      video.addEventListener('ended', ended, { once: true });
      await video.play(); startVideoLoop(); await finish; video.removeEventListener('ended', ended); video.pause();
      if (rec.state !== 'inactive') rec.stop(); await stopped;
      if (!state.exportCancelled) {
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        if (!blob.size) throw new Error('empty');
        const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
        downloadBlob(blob, `${fileBaseName(state.media.file.name)}-miniature.${ext}`);
        showToast(`Видео готово · ${d.width}×${d.height}`);
      } else showToast('Экспорт отменён');
    } catch (e) {
      console.error(e); showToast('Экспорт видео не завершился.');
    } finally {
      state.exportResolve = null; state.recorder = null; state.exporting = false; state.exportCancelled = false;
      if (state.monitorGain) state.monitorGain.gain.value = 1;
      el.exportProgress.hidden = true; setUiLocked(false);
      try { await seekVideo(Math.min(saved, finiteDuration() || saved)); } catch (_) {}
      if (wasPlaying) el.sourceVideo.play().catch(() => {}); else requestRender();
    }
  }

  function cancelVideoExport() {
    if (!state.exporting) return;
    state.exportCancelled = true;
    el.sourceVideo.pause();
    state.exportResolve?.('cancel');
  }

  async function getAudioTrack() {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      if (!state.audioContext) {
        state.audioContext = new C();
        state.audioSource = state.audioContext.createMediaElementSource(el.sourceVideo);
        state.audioDestination = state.audioContext.createMediaStreamDestination();
        state.monitorGain = state.audioContext.createGain();
        state.audioSource.connect(state.audioDestination);
        state.audioSource.connect(state.monitorGain);
        state.monitorGain.connect(state.audioContext.destination);
      }
      if (state.audioContext.state === 'suspended') await state.audioContext.resume();
      return state.audioDestination.stream.getAudioTracks()[0] || null;
    } catch (e) { console.warn(e); return null; }
  }

  function pickRecorderMime() {
    const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    return typeof MediaRecorder?.isTypeSupported === 'function' ? (list.find((t) => MediaRecorder.isTypeSupported(t)) || '') : '';
  }

  function resolveExportDimensions(kind) {
    const w = state.media.width, h = state.media.height, longest = Math.max(w, h), choice = el.resolutionSelect.value;
    let maxEdge;
    if (choice === '1080') maxEdge = 1920;
    else if (choice === '2160') maxEdge = 3840;
    else if (choice === 'original') maxEdge = 8192;
    else maxEdge = kind === 'image' ? 4096 : 1920;
    const s = Math.min(1, maxEdge / longest);
    return { width: Math.max(2, Math.round(w * s)), height: Math.max(2, Math.round(h * s)) };
  }

  function setUiLocked(v) {
    controls.forEach(([, input]) => input.disabled = v);
    [el.resetButton, el.presetButton, el.autoButton, el.resolutionSelect, el.formatSelect, el.exportButton, el.replaceInput, el.playButton, el.seekInput, el.compareButton].forEach((x) => { if (x) x.disabled = v; });
    if (el.modeSwitch) el.modeSwitch.querySelectorAll('button').forEach((b) => b.disabled = v);
    el.angleInput.disabled = (effectiveMode() === 'object' && !v) || v;
  }

  function setExportProgress(p) {
    const pct = Math.round(clamp(p, 0, 1) * 100);
    el.progressBar.style.width = `${pct}%`;
    el.progressText.textContent = `Экспорт ${pct}%`;
  }

  function setLoading(v, title = '', text = '') {
    el.loadingState.hidden = !v;
    if (title) el.loadingTitle.textContent = title;
    if (text) el.loadingText.textContent = text;
  }

  function updateModeUi() {
    if (el.modeSwitch) {
      el.modeSwitch.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.focusMode === state.settings.mode));
    }
    el.angleInput.disabled = effectiveMode() === 'object' || state.exporting;
    el.stageHint.textContent = effectiveMode() === 'object' ? 'Тяни эллипс по объекту. По краю можно менять размер' : 'Тяни кадр поперёк — двигается зона резкости';
  }

  function setSettings(next, message) {
    state.settings = { ...state.settings, ...next };
    invalidateImageCache(); applySettingsToControls(); saveSettings(); updateModeUi(); requestRender(); showGuide();
    if (message) showToast(message);
  }

  function applySettingsToControls() {
    controls.forEach(([key, input, output, format]) => {
      input.value = String(state.settings[key]);
      output.value = format(state.settings[key]);
    });
  }

  function invalidateImageCache() { state.imageCacheKey = ''; state.imageLayers = null; }

  function loadSettings() {
    try {
      const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const n = { ...DEFAULTS };
      if (p && typeof p === 'object') {
        Object.keys(DEFAULTS).forEach((k) => {
          if (k === 'mode') { if (['auto', 'scene', 'object'].includes(p.mode)) n.mode = p.mode; }
          else if (Number.isFinite(Number(p[k]))) n[k] = Number(p[k]);
        });
      }
      n.position = clamp(n.position, -0.98, 0.98);
      n.objectX = clamp(n.objectX, 0, 1);
      n.objectY = clamp(n.objectY, 0, 1);
      n.objectScale = clamp(n.objectScale, 0.6, 1.7);
      return n;
    } catch (_) { return { ...DEFAULTS }; }
  }

  function saveSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch (_) {} }

  function cloneCanvas(source) {
    const c = document.createElement('canvas'); c.width = source.width; c.height = source.height; c.getContext('2d').drawImage(source, 0, 0); return c;
  }
  function ensureCanvasSize(c, w, h) { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; }
  function drawVignette(ctx, w, h, amount) {
    const g = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.2, w/2, h/2, Math.hypot(w,h)*0.62), a = clamp(amount / 100 * 0.95, 0, 0.42);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.58, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function canvasToBlob(c, t, q) { return new Promise((r) => c.toBlob(r, t, q)); }
  function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  function seekVideo(time) {
    const v = el.sourceVideo; if (!Number.isFinite(time) || Math.abs(v.currentTime - time) < 0.02) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer;
      const done = () => { clearTimeout(timer); v.removeEventListener('seeked', done); v.removeEventListener('error', fail); resolve(); };
      const fail = () => { clearTimeout(timer); reject(new Error('seek')); };
      v.addEventListener('seeked', done, { once: true }); v.addEventListener('error', fail, { once: true }); timer = setTimeout(done, 2500); v.currentTime = clamp(time, 0, finiteDuration() || time);
    });
  }
  function finiteDuration() { const d = el.sourceVideo.duration; return Number.isFinite(d) && d > 0 ? d : (state.media?.duration || 0); }
  function showToast(message) { clearTimeout(state.toastTimer); el.toast.textContent = message; el.toast.classList.add('is-visible'); state.toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 3300); }
  function prettyBytes(bytes) { if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б'; const u=['Б','КБ','МБ','ГБ'], i=Math.min(u.length-1, Math.floor(Math.log(bytes)/Math.log(1024))), v=bytes/Math.pow(1024,i); return `${v>=10||i===0?Math.round(v):v.toFixed(1)} ${u[i]}`; }
  function formatTime(seconds) { const v=Number.isFinite(seconds)?Math.max(0,seconds):0, h=Math.floor(v/3600), m=Math.floor((v%3600)/60), s=Math.floor(v%60); return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`; }
  function fileBaseName(name) { return (name || 'media').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9а-яА-ЯёЁіІїЇєЄ_-]+/g, '-').replace(/^-+|-+$/g, '') || 'media'; }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function nextFrame() { return new Promise((r) => requestAnimationFrame(r)); }
})();
