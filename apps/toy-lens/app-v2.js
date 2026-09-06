(() => {
  'use strict';

  const STORAGE_KEY = 'pocket-works:toy-lens:settings:v2';
  const DEFAULTS = Object.freeze({
    blur: 30,
    focus: 22,
    feather: 18,
    angle: 0,
    saturation: 142,
    contrast: 120,
    brightness: 104,
    vignette: 14,
    position: 0,
    mode: 'scene',
    objectX: 0.5,
    objectY: 0.5
  });

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

  const state = {
    settings: loadSettings(), media: null, objectUrl: null, compare: false, dragging: false,
    guideTimer: 0, loopToken: 0, renderQueued: false, lastVideoRender: 0,
    exporting: false, exportCancelled: false, exportResolve: null, recorder: null,
    toastTimer: 0, audioContext: null, audioSource: null, audioDestination: null, monitorGain: null,
    imageCacheKey: '', imageLayers: null
  };

  const scratch = {
    small: document.createElement('canvas'), layer: document.createElement('canvas'), mask: document.createElement('canvas'),
    pop: document.createElement('canvas'), radial: document.createElement('canvas')
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
    installModeControls();
    applySettingsToControls();
    bindEvents();
    updateModeUi();
    if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
  }

  function installModeControls() {
    const rail = document.querySelector('.control-rail');
    const heading = document.querySelector('.rail-heading');
    if (!rail || !heading) return;
    const wrap = document.createElement('div');
    wrap.className = 'focus-mode-switch';
    wrap.innerHTML = '<button type="button" data-focus-mode="scene"><b>Сцена</b><small>улицы, комнаты, пейзажи</small></button><button type="button" data-focus-mode="object"><b>Объект</b><small>люди, еда, предметы сверху</small></button>';
    heading.insertAdjacentElement('afterend', wrap);
    const style = document.createElement('style');
    style.textContent = `.focus-mode-switch{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0 2px}.focus-mode-switch button{min-height:56px;border:1px solid var(--line);background:#fff;text-align:left;padding:8px 9px;cursor:pointer}.focus-mode-switch button.is-active{border-color:var(--ink);background:var(--ink);color:#fff}.focus-mode-switch b{display:block;font-size:11px}.focus-mode-switch small{display:block;font-size:9px;line-height:1.25;margin-top:3px;opacity:.72}.focus-mode-switch button:active{transform:translateY(1px)}`;
    document.head.appendChild(style);
    wrap.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-focus-mode]');
      if (!button) return;
      state.settings.mode = button.dataset.focusMode;
      saveSettings();
      updateModeUi();
      requestRender();
      showGuide(1800);
      showToast(state.settings.mode === 'object' ? 'Режим «Объект»: перетащи круг на главный предмет' : 'Режим «Сцена»: двигай полосу резкости поперёк кадра');
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
        if (['blur','saturation','contrast','brightness'].includes(key)) invalidateImageCache();
        requestRender(); showGuide();
      });
      input.addEventListener('change', saveSettings);
    });
    el.resetButton.addEventListener('click', () => setSettings(DEFAULTS, 'Настройки сброшены'));
    el.presetButton.addEventListener('click', () => setSettings({
      ...DEFAULTS, mode: state.settings.mode, objectX: state.settings.objectX, objectY: state.settings.objectY,
      blur: 34, focus: 20, feather: 18, saturation: 148, contrast: 124, brightness: 104, vignette: 16
    }, 'Сильный профиль миниатюры применён'));
    bindCompareEvents();
    bindGuideDrag();
    el.playButton.addEventListener('click', togglePlayback);
    el.seekInput.addEventListener('input', () => {
      if (!state.media || state.media.kind !== 'video' || state.exporting) return;
      const d = finiteDuration(); if (d) el.sourceVideo.currentTime = d * Number(el.seekInput.value) / 1000;
    });
    el.sourceVideo.addEventListener('play', () => { updatePlayButton(); startVideoLoop(); });
    el.sourceVideo.addEventListener('pause', updatePlayButton);
    el.sourceVideo.addEventListener('ended', updatePlayButton);
    el.sourceVideo.addEventListener('timeupdate', updateVideoUi);
    el.sourceVideo.addEventListener('seeked', requestRender);
    el.exportButton.addEventListener('click', () => {
      if (!state.media || state.exporting) return;
      if (state.media.kind === 'image') exportImage(); else exportVideo();
    });
    el.cancelExport.addEventListener('click', cancelVideoExport);
    window.addEventListener('resize', syncGuideCanvasCss);
    document.addEventListener('visibilitychange', () => { if (document.hidden && state.media?.kind === 'video' && !state.exporting) el.sourceVideo.pause(); });
  }

  async function onFilePicked(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || state.exporting) return;
    await loadFile(file);
  }

  async function loadFile(file) {
    const kind = classifyFile(file);
    if (!kind) return showToast('Не смог определить фото или видео.');
    stopExistingMedia();
    state.media = { kind, file, width: 0, height: 0, duration: 0 };
    state.objectUrl = URL.createObjectURL(file);
    invalidateImageCache();
    el.emptyState.hidden = true; el.workspace.hidden = false; el.replaceButton.hidden = false;
    setLoading(true, 'Открываю медиа', 'Подготавливаю miniature-рендер…');
    try {
      if (kind === 'image') await loadImageSource(state.objectUrl); else await loadVideoSource(state.objectUrl);
      setPreviewDimensions(); updateMediaUi(); setLoading(false); requestRender(); showGuide(1800);
    } catch (error) {
      console.error(error); setLoading(false); stopExistingMedia(); state.media = null;
      el.workspace.hidden = true; el.emptyState.hidden = false; el.replaceButton.hidden = true;
      showToast('Этот файл браузер не смог декодировать.');
    }
  }

  function classifyFile(file) {
    if (file.type.startsWith('image/')) return 'image'; if (file.type.startsWith('video/')) return 'video';
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg','jpeg','png','webp','gif','bmp','avif','heic','heif'].includes(ext)) return 'image';
    if (['mp4','mov','m4v','webm','mkv','avi','mpeg','mpg'].includes(ext)) return 'video';
    return null;
  }

  function loadImageSource(url) {
    return new Promise((resolve, reject) => {
      el.sourceImage.onload = () => { if (!el.sourceImage.naturalWidth) return reject(new Error('bad image')); state.media.width = el.sourceImage.naturalWidth; state.media.height = el.sourceImage.naturalHeight; resolve(); };
      el.sourceImage.onerror = reject; el.sourceImage.src = url;
    });
  }

  function loadVideoSource(url) {
    return new Promise((resolve, reject) => {
      const video = el.sourceVideo;
      const ready = () => { cleanup(); if (!video.videoWidth) return reject(new Error('bad video')); state.media.width = video.videoWidth; state.media.height = video.videoHeight; state.media.duration = Number.isFinite(video.duration) ? video.duration : 0; resolve(); };
      const fail = () => { cleanup(); reject(new Error('decode failed')); };
      const cleanup = () => { video.removeEventListener('loadeddata', ready); video.removeEventListener('error', fail); };
      video.addEventListener('loadeddata', ready, { once: true }); video.addEventListener('error', fail, { once: true }); video.src = url; video.load();
    });
  }

  function stopExistingMedia() {
    state.loopToken += 1; el.sourceVideo.pause(); el.sourceVideo.removeAttribute('src'); el.sourceVideo.load(); el.sourceImage.removeAttribute('src');
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); state.objectUrl = null;
  }

  function setPreviewDimensions() {
    const longest = Math.max(state.media.width, state.media.height);
    const mobile = matchMedia('(max-width:700px)').matches;
    const edge = mobile ? (state.media.kind === 'video' ? 700 : 900) : (state.media.kind === 'video' ? 960 : 1250);
    const scale = Math.min(1, edge / longest);
    const w = Math.max(2, Math.round(state.media.width * scale)), h = Math.max(2, Math.round(state.media.height * scale));
    el.previewCanvas.width = w; el.previewCanvas.height = h; el.guideCanvas.width = w; el.guideCanvas.height = h; syncGuideCanvasCss();
  }

  function syncGuideCanvasCss() {
    requestAnimationFrame(() => {
      const rect = el.previewCanvas.getBoundingClientRect(); if (!rect.width) return;
      el.guideCanvas.style.width = `${rect.width}px`; el.guideCanvas.style.height = `${rect.height}px`;
    });
  }

  function updateMediaUi() {
    const m = state.media; const mp = ((m.width * m.height) / 1e6).toFixed(1).replace('.0','');
    el.mediaMeta.textContent = m.kind === 'image' ? `${m.width}×${m.height} · ${mp} МП · ${prettyBytes(m.file.size)}` : `${m.width}×${m.height} · ${formatTime(m.duration)} · ${prettyBytes(m.file.size)}`;
    el.videoControls.hidden = m.kind !== 'video'; el.formatSelect.hidden = m.kind === 'video';
    el.exportInfo.textContent = m.kind === 'image' ? 'Авто: до 4096 px.' : 'Авто: до 1080p; видео рендерится покадрово.';
    updateVideoUi();
  }

  function requestRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => { state.renderQueued = false; renderCurrentFrame(); });
  }

  function renderCurrentFrame() {
    if (!state.media || state.exporting) return;
    const source = state.media.kind === 'image' ? el.sourceImage : el.sourceVideo;
    if (state.media.kind === 'video' && el.sourceVideo.readyState < 2) return;
    drawProcessed(el.previewCanvas, source, state.compare, false); drawGuide();
  }

  function drawProcessed(canvas, source, originalOnly = false, isExport = false) {
    const w = canvas.width, h = canvas.height; if (!w || !h) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: !isExport });
    ctx.save(); ctx.clearRect(0,0,w,h); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (originalOnly) { ctx.filter = 'none'; ctx.drawImage(source,0,0,w,h); ctx.restore(); return; }

    const grade = gradeFilter();
    ctx.filter = grade; ctx.drawImage(source,0,0,w,h); ctx.filter = 'none';

    if (state.settings.blur > 0) drawProgressiveBlur(ctx, source, w, h, grade, isExport);
    drawFocusPop(ctx, source, w, h, isExport);
    if (state.settings.vignette > 0) drawVignette(ctx,w,h,state.settings.vignette);
    ctx.restore();
  }

  function gradeFilter(extraContrast = 0, extraSat = 0) {
    return `saturate(${state.settings.saturation + extraSat}%) contrast(${state.settings.contrast + extraContrast}%) brightness(${state.settings.brightness}%)`;
  }

  function drawProgressiveBlur(targetCtx, source, w, h, colorFilter, isExport) {
    const levels = state.media?.kind === 'video' && !isExport ? [0.46, 1] : [0.32, 0.66, 1];
    const starts = levels.length === 2 ? [0, .7] : [0, .55, 1.15];
    const cached = state.media?.kind === 'image' && !isExport ? getImageBlurLayers(source,w,h,colorFilter,levels) : null;
    levels.forEach((factor, index) => {
      const layer = cached ? cached[index] : renderBlurLayer(source,w,h,colorFilter,factor,isExport);
      maskAndComposite(targetCtx, layer, w,h, starts[index], index === levels.length - 1 ? 1.3 : 1.0);
    });
  }

  function getImageBlurLayers(source,w,h,colorFilter,levels) {
    const key = [w,h,state.settings.blur,state.settings.saturation,state.settings.contrast,state.settings.brightness,levels.join(',')].join('|');
    if (state.imageCacheKey === key && state.imageLayers) return state.imageLayers;
    state.imageLayers = levels.map((factor) => cloneCanvas(renderBlurLayer(source,w,h,colorFilter,factor,false)));
    state.imageCacheKey = key; return state.imageLayers;
  }

  function renderBlurLayer(source,w,h,colorFilter,factor,isExport) {
    ensureCanvasSize(scratch.layer,w,h);
    const longest = Math.max(w,h), sampleEdge = isExport ? 1250 : 620, scale = Math.min(1, sampleEdge / longest);
    const sw = Math.max(2,Math.round(w*scale)), sh = Math.max(2,Math.round(h*scale)); ensureCanvasSize(scratch.small,sw,sh);
    const sctx = scratch.small.getContext('2d'); sctx.clearRect(0,0,sw,sh); sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    const px = Math.max(.8, state.settings.blur * factor * Math.min(w,h) / 720 * scale);
    sctx.filter = `${colorFilter} blur(${px.toFixed(2)}px)`; sctx.drawImage(source,-2,-2,sw+4,sh+4); sctx.filter = 'none';
    const lctx = scratch.layer.getContext('2d'); lctx.clearRect(0,0,w,h); lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high'; lctx.drawImage(scratch.small,0,0,w,h);
    return scratch.layer;
  }

  function maskAndComposite(targetCtx, layer,w,h,start,span) {
    ensureCanvasSize(scratch.mask,w,h); const mctx = scratch.mask.getContext('2d'); mctx.clearRect(0,0,w,h);
    if (state.settings.mode === 'object') paintObjectOutsideMask(mctx,w,h,start,span); else paintSceneOutsideMask(mctx,w,h,start,span);
    ensureCanvasSize(scratch.pop,w,h); const pctx = scratch.pop.getContext('2d'); pctx.clearRect(0,0,w,h); pctx.drawImage(layer,0,0); pctx.globalCompositeOperation = 'destination-in'; pctx.drawImage(scratch.mask,0,0); pctx.globalCompositeOperation = 'source-over'; targetCtx.drawImage(scratch.pop,0,0);
  }

  function paintSceneOutsideMask(ctx,w,h,start,span) {
    const g = sceneGeometry(w,h), inner = g.halfSharp + g.feather * start, outer = inner + g.feather * span;
    const grad = ctx.createLinearGradient(g.centerX-g.normalX*g.extent,g.centerY-g.normalY*g.extent,g.centerX+g.normalX*g.extent,g.centerY+g.normalY*g.extent);
    const stop = (d) => clamp(.5 + d/(2*g.extent),0,1);
    grad.addColorStop(0,'rgba(0,0,0,1)'); grad.addColorStop(stop(-outer),'rgba(0,0,0,1)'); grad.addColorStop(stop(-inner),'rgba(0,0,0,0)'); grad.addColorStop(stop(inner),'rgba(0,0,0,0)'); grad.addColorStop(stop(outer),'rgba(0,0,0,1)'); grad.addColorStop(1,'rgba(0,0,0,1)');
    ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
  }

  function paintObjectOutsideMask(ctx,w,h,start,span) {
    const g = objectGeometry(w,h), innerX = g.rx + g.feather * start, innerY = g.ry + g.feather * start * .72, outerX = innerX + g.feather * span, outerY = innerY + g.feather * span * .72;
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
    const size = 256; ensureCanvasSize(scratch.radial,size,size); const rctx = scratch.radial.getContext('2d'); rctx.clearRect(0,0,size,size);
    const ratio = clamp(Math.max(innerX/outerX, innerY/outerY),0,.95); const grad = rctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
    grad.addColorStop(0,'rgba(0,0,0,1)'); grad.addColorStop(ratio,'rgba(0,0,0,1)'); grad.addColorStop(1,'rgba(0,0,0,0)'); rctx.fillStyle = grad; rctx.fillRect(0,0,size,size);
    ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(scratch.radial,g.cx-outerX,g.cy-outerY,outerX*2,outerY*2); ctx.globalCompositeOperation = 'source-over';
  }

  function drawFocusPop(targetCtx,source,w,h,isExport) {
    ensureCanvasSize(scratch.pop,w,h); const pctx = scratch.pop.getContext('2d'); pctx.clearRect(0,0,w,h); pctx.filter = gradeFilter(8,8); pctx.drawImage(source,0,0,w,h); pctx.filter = 'none';
    ensureCanvasSize(scratch.mask,w,h); const mctx = scratch.mask.getContext('2d'); mctx.clearRect(0,0,w,h); paintSharpMask(mctx,w,h);
    pctx.globalCompositeOperation = 'destination-in'; pctx.drawImage(scratch.mask,0,0); pctx.globalCompositeOperation = 'source-over'; targetCtx.globalAlpha = isExport ? .72 : .62; targetCtx.drawImage(scratch.pop,0,0); targetCtx.globalAlpha = 1;
  }

  function paintSharpMask(ctx,w,h) {
    if (state.settings.mode === 'object') {
      const g = objectGeometry(w,h); ctx.fillStyle = 'rgba(0,0,0,.92)'; ctx.beginPath(); ctx.ellipse(g.cx,g.cy,g.rx,g.ry,0,0,Math.PI*2); ctx.fill();
      return;
    }
    const g = sceneGeometry(w,h), tangentX = g.normalY, tangentY = -g.normalX, lineHalf = Math.hypot(w,h);
    ctx.strokeStyle = 'rgba(0,0,0,.92)'; ctx.lineWidth = g.halfSharp*2; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(g.centerX-tangentX*lineHalf,g.centerY-tangentY*lineHalf); ctx.lineTo(g.centerX+tangentX*lineHalf,g.centerY+tangentY*lineHalf); ctx.stroke();
  }

  function sceneGeometry(w,h) {
    const a = state.settings.angle*Math.PI/180, normalX = -Math.sin(a), normalY = Math.cos(a), maxProjection = (Math.abs(normalX)*w + Math.abs(normalY)*h)/2;
    const offset = state.settings.position*maxProjection;
    return { normalX, normalY, centerX:w/2+normalX*offset, centerY:h/2+normalY*offset, maxProjection, halfSharp:maxProjection*(state.settings.focus/100), feather:Math.max(3,maxProjection*(state.settings.feather/100)), extent:Math.hypot(w,h)*.86 };
  }

  function objectGeometry(w,h) {
    const min = Math.min(w,h), radius = min * clamp(state.settings.focus/100*1.75,.12,.62);
    return { cx:state.settings.objectX*w, cy:state.settings.objectY*h, rx:radius*1.18, ry:radius*.82, feather:Math.max(4,min*(state.settings.feather/100)*.9) };
  }

  function drawGuide() {
    const c = el.guideCanvas, ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); if (!state.media || state.compare) return;
    ctx.save(); ctx.lineWidth = Math.max(1.5,Math.min(c.width,c.height)/520); ctx.strokeStyle = 'rgba(216,255,87,.9)'; ctx.fillStyle = '#d8ff57'; ctx.setLineDash([10,8]);
    if (state.settings.mode === 'object') {
      const g = objectGeometry(c.width,c.height); ctx.beginPath(); ctx.ellipse(g.cx,g.cy,g.rx,g.ry,0,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(g.cx,g.cy,Math.max(7,c.width/110),0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#171817'; ctx.stroke();
    } else {
      const g = sceneGeometry(c.width,c.height), tx=g.normalY, ty=-g.normalX, half=Math.hypot(c.width,c.height);
      [-g.halfSharp,g.halfSharp].forEach((off)=>{ const x=g.centerX+g.normalX*off,y=g.centerY+g.normalY*off; ctx.beginPath(); ctx.moveTo(x-tx*half,y-ty*half); ctx.lineTo(x+tx*half,y+ty*half); ctx.stroke(); });
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(g.centerX,g.centerY,Math.max(7,c.width/110),0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#171817'; ctx.stroke();
    }
    ctx.restore();
  }

  function bindGuideDrag() {
    const c = el.guideCanvas;
    c.addEventListener('pointerdown',(event)=>{ if(!state.media||state.exporting)return; state.dragging=true;c.setPointerCapture?.(event.pointerId);moveFocus(event);el.stageHint.classList.add('is-hidden'); });
    c.addEventListener('pointermove',(event)=>{ if(state.dragging)moveFocus(event); });
    const finish=()=>{ if(!state.dragging)return;state.dragging=false;saveSettings();showGuide(); };
    c.addEventListener('pointerup',finish); c.addEventListener('pointercancel',finish);
  }

  function moveFocus(event) {
    const rect=el.guideCanvas.getBoundingClientRect(),x=clamp((event.clientX-rect.left)/rect.width,0,1),y=clamp((event.clientY-rect.top)/rect.height,0,1);
    if(state.settings.mode==='object'){ state.settings.objectX=x;state.settings.objectY=y; }
    else { const px=x*el.guideCanvas.width,py=y*el.guideCanvas.height,g=sceneGeometry(el.guideCanvas.width,el.guideCanvas.height),dx=px-el.guideCanvas.width/2,dy=py-el.guideCanvas.height/2; state.settings.position=clamp((dx*g.normalX+dy*g.normalY)/Math.max(1,g.maxProjection),-.98,.98); }
    requestRender();
  }

  function bindCompareEvents() {
    const b=el.compareButton;
    const start=(event)=>{if(!state.media||state.exporting)return;event.preventDefault();state.compare=true;b.classList.add('is-active');b.textContent='Оригинал';requestRender();};
    const end=()=>{if(!state.compare)return;state.compare=false;b.classList.remove('is-active');b.textContent='Зажми: оригинал';requestRender();showGuide();};
    b.addEventListener('pointerdown',start);b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('pointerleave',end);window.addEventListener('pointerup',end);
  }

  function showGuide(delay=1200){clearTimeout(state.guideTimer);drawGuide();state.guideTimer=setTimeout(()=>{if(state.dragging)return;el.guideCanvas.getContext('2d').clearRect(0,0,el.guideCanvas.width,el.guideCanvas.height);},delay);}

  function startVideoLoop(){if(!state.media||state.media.kind!=='video')return;const token=++state.loopToken;const frame=(now=performance.now())=>{if(token!==state.loopToken||!state.media||state.media.kind!=='video')return;if(state.exporting)renderExportVideoFrame();else if(now-state.lastVideoRender>44){state.lastVideoRender=now;renderCurrentFrame();}updateVideoUi();if(!el.sourceVideo.paused&&!el.sourceVideo.ended)schedule(frame);};schedule(frame);}
  function schedule(cb){if('requestVideoFrameCallback'in el.sourceVideo)el.sourceVideo.requestVideoFrameCallback(()=>cb(performance.now()));else requestAnimationFrame(cb);}

  function renderExportVideoFrame(){if(!state.exporting)return;drawProcessed(el.exportCanvas,el.sourceVideo,false,true);const ctx=el.previewCanvas.getContext('2d',{alpha:false});ctx.clearRect(0,0,el.previewCanvas.width,el.previewCanvas.height);ctx.drawImage(el.exportCanvas,0,0,el.previewCanvas.width,el.previewCanvas.height);const d=finiteDuration();setExportProgress(d?clamp(el.sourceVideo.currentTime/d,0,1):0);}

  function togglePlayback(){if(!state.media||state.media.kind!=='video'||state.exporting)return;if(el.sourceVideo.paused||el.sourceVideo.ended){if(el.sourceVideo.ended)el.sourceVideo.currentTime=0;el.sourceVideo.play().catch(()=>showToast('Браузер не разрешил воспроизведение.'));}else el.sourceVideo.pause();}
  function updatePlayButton(){const p=!el.sourceVideo.paused&&!el.sourceVideo.ended;el.playButton.textContent=p?'Ⅱ':'▶';el.playButton.setAttribute('aria-label',p?'Пауза':'Воспроизвести');}
  function updateVideoUi(){if(!state.media||state.media.kind!=='video')return;const d=finiteDuration(),t=Number.isFinite(el.sourceVideo.currentTime)?el.sourceVideo.currentTime:0;if(d&&!state.exporting)el.seekInput.value=String(Math.round(t/d*1000));el.timeOutput.value=`${formatTime(t)} / ${formatTime(d)}`;updatePlayButton();}

  async function exportImage(){if(!state.media||state.media.kind!=='image')return;setLoading(true,'Готовлю файл','Рендерю многоступенчатую глубину…');setUiLocked(true);try{const d=resolveExportDimensions('image');el.exportCanvas.width=d.width;el.exportCanvas.height=d.height;await nextFrame();drawProcessed(el.exportCanvas,el.sourceImage,false,true);const type=el.formatSelect.value==='png'?'image/png':'image/jpeg';const blob=await canvasToBlob(el.exportCanvas,type,type==='image/jpeg'?.94:undefined);if(!blob)throw new Error('export');downloadBlob(blob,`${fileBaseName(state.media.file.name)}-toy-lens.${type==='image/png'?'png':'jpg'}`);showToast(`Готово · ${d.width}×${d.height}`);}catch(e){console.error(e);showToast('Не удалось сохранить изображение.');}finally{setLoading(false);setUiLocked(false);requestRender();}}

  async function exportVideo(){if(!state.media||state.media.kind!=='video'||state.exporting)return;if(!el.exportCanvas.captureStream||typeof MediaRecorder==='undefined')return showToast('Этот браузер не умеет записывать обработанный canvas.');const mime=pickRecorderMime();if(!mime)return showToast('Нет доступного видеокодека для экспорта.');const video=el.sourceVideo,saved=video.currentTime,wasPlaying=!video.paused;state.exporting=true;state.exportCancelled=false;setUiLocked(true);el.exportProgress.hidden=false;setExportProgress(0);try{video.pause();await seekVideo(0);const d=resolveExportDimensions('video');el.exportCanvas.width=d.width;el.exportCanvas.height=d.height;drawProcessed(el.exportCanvas,video,false,true);const stream=el.exportCanvas.captureStream(30),audio=await getAudioTrack();if(audio)stream.addTrack(audio);const bitrate=Math.round(clamp((d.width*d.height/(1280*720))*5_000_000,4_000_000,24_000_000));const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});state.recorder=rec;const chunks=[];rec.addEventListener('dataavailable',(e)=>{if(e.data?.size)chunks.push(e.data);});const stopped=new Promise((r)=>rec.addEventListener('stop',r,{once:true}));rec.start(1000);if(state.monitorGain)state.monitorGain.gain.value=0;const finish=new Promise((r)=>{state.exportResolve=r;});const ended=()=>state.exportResolve?.('ended');video.addEventListener('ended',ended,{once:true});await video.play();startVideoLoop();await finish;video.removeEventListener('ended',ended);video.pause();if(rec.state!=='inactive')rec.stop();await stopped;if(!state.exportCancelled){const blob=new Blob(chunks,{type:mime.split(';')[0]});if(!blob.size)throw new Error('empty');const ext=mime.startsWith('video/mp4')?'mp4':'webm';downloadBlob(blob,`${fileBaseName(state.media.file.name)}-toy-lens.${ext}`);showToast(`Видео готово · ${d.width}×${d.height}`);}else showToast('Экспорт отменён');}catch(e){console.error(e);showToast('Экспорт видео не завершился.');}finally{state.exportResolve=null;state.recorder=null;state.exporting=false;state.exportCancelled=false;if(state.monitorGain)state.monitorGain.gain.value=1;el.exportProgress.hidden=true;setUiLocked(false);try{await seekVideo(Math.min(saved,finiteDuration()||saved));}catch(_){}if(wasPlaying)el.sourceVideo.play().catch(()=>{});else requestRender();}}
  function cancelVideoExport(){if(!state.exporting)return;state.exportCancelled=true;el.sourceVideo.pause();state.exportResolve?.('cancel');}

  async function getAudioTrack(){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;try{if(!state.audioContext){state.audioContext=new C();state.audioSource=state.audioContext.createMediaElementSource(el.sourceVideo);state.audioDestination=state.audioContext.createMediaStreamDestination();state.monitorGain=state.audioContext.createGain();state.audioSource.connect(state.audioDestination);state.audioSource.connect(state.monitorGain);state.monitorGain.connect(state.audioContext.destination);}if(state.audioContext.state==='suspended')await state.audioContext.resume();return state.audioDestination.stream.getAudioTracks()[0]||null;}catch(e){console.warn(e);return null;}}
  function pickRecorderMime(){const list=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];return typeof MediaRecorder?.isTypeSupported==='function'?(list.find((t)=>MediaRecorder.isTypeSupported(t))||''):'';}
  function resolveExportDimensions(kind){const w=state.media.width,h=state.media.height,longest=Math.max(w,h),choice=el.resolutionSelect.value;let maxEdge;if(choice==='1080')maxEdge=1920;else if(choice==='2160')maxEdge=3840;else if(choice==='original')maxEdge=8192;else maxEdge=kind==='image'?4096:1920;const s=Math.min(1,maxEdge/longest);return{width:Math.max(2,Math.round(w*s)),height:Math.max(2,Math.round(h*s))};}
  function setUiLocked(v){controls.forEach(([,input])=>input.disabled=v);[el.resetButton,el.presetButton,el.resolutionSelect,el.formatSelect,el.exportButton,el.replaceInput,el.playButton,el.seekInput,el.compareButton].forEach((x)=>{if(x)x.disabled=v;});if(el.modeSwitch)el.modeSwitch.querySelectorAll('button').forEach((b)=>b.disabled=v);}
  function setExportProgress(p){const pct=Math.round(clamp(p,0,1)*100);el.progressBar.style.width=`${pct}%`;el.progressText.textContent=`Экспорт ${pct}%`;}
  function setLoading(v,title='',text=''){el.loadingState.hidden=!v;if(title)el.loadingTitle.textContent=title;if(text)el.loadingText.textContent=text;}

  function updateModeUi(){if(el.modeSwitch)el.modeSwitch.querySelectorAll('button').forEach((b)=>b.classList.toggle('is-active',b.dataset.focusMode===state.settings.mode));el.angleInput.disabled=state.settings.mode==='object'||state.exporting;el.stageHint.textContent=state.settings.mode==='object'?'Тяни круг на главный объект':'Тяни кадр поперёк — двигается зона резкости';}
  function setSettings(next,message){state.settings={...state.settings,...next};invalidateImageCache();applySettingsToControls();saveSettings();updateModeUi();requestRender();showGuide();if(message)showToast(message);}
  function applySettingsToControls(){controls.forEach(([key,input,output,format])=>{input.value=String(state.settings[key]);output.value=format(state.settings[key]);});}
  function invalidateImageCache(){state.imageCacheKey='';state.imageLayers=null;}

  function loadSettings(){try{const p=JSON.parse(localStorage.getItem(STORAGE_KEY));const n={...DEFAULTS};if(p&&typeof p==='object'){Object.keys(DEFAULTS).forEach((k)=>{if(k==='mode'){if(p.mode==='scene'||p.mode==='object')n.mode=p.mode;}else if(Number.isFinite(Number(p[k])))n[k]=Number(p[k]);});}n.position=clamp(n.position,-.98,.98);n.objectX=clamp(n.objectX,0,1);n.objectY=clamp(n.objectY,0,1);return n;}catch(_){return{...DEFAULTS};}}
  function saveSettings(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state.settings));}catch(_){}}

  function cloneCanvas(source){const c=document.createElement('canvas');c.width=source.width;c.height=source.height;c.getContext('2d').drawImage(source,0,0);return c;}
  function ensureCanvasSize(c,w,h){if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;}
  function drawVignette(ctx,w,h,amount){const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.hypot(w,h)*.62),a=clamp(amount/100*.95,0,.42);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.58,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${a})`);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
  function canvasToBlob(c,t,q){return new Promise((r)=>c.toBlob(r,t,q));}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function seekVideo(time){const v=el.sourceVideo;if(!Number.isFinite(time)||Math.abs(v.currentTime-time)<.02)return Promise.resolve();return new Promise((resolve,reject)=>{let timer;const done=()=>{clearTimeout(timer);v.removeEventListener('seeked',done);v.removeEventListener('error',fail);resolve();};const fail=()=>{clearTimeout(timer);reject(new Error('seek'));};v.addEventListener('seeked',done,{once:true});v.addEventListener('error',fail,{once:true});timer=setTimeout(done,2500);v.currentTime=clamp(time,0,finiteDuration()||time);});}
  function finiteDuration(){const d=el.sourceVideo.duration;return Number.isFinite(d)&&d>0?d:(state.media?.duration||0);}
  function showToast(message){clearTimeout(state.toastTimer);el.toast.textContent=message;el.toast.classList.add('is-visible');state.toastTimer=setTimeout(()=>el.toast.classList.remove('is-visible'),3300);}
  function prettyBytes(bytes){if(!Number.isFinite(bytes)||bytes<=0)return'0 Б';const u=['Б','КБ','МБ','ГБ'],i=Math.min(u.length-1,Math.floor(Math.log(bytes)/Math.log(1024))),v=bytes/Math.pow(1024,i);return`${v>=10||i===0?Math.round(v):v.toFixed(1)} ${u[i]}`;}
  function formatTime(seconds){const v=Number.isFinite(seconds)?Math.max(0,seconds):0,h=Math.floor(v/3600),m=Math.floor((v%3600)/60),s=Math.floor(v%60);return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;}
  function fileBaseName(name){return(name||'media').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9а-яА-ЯёЁіІїЇєЄ_-]+/g,'-').replace(/^-+|-+$/g,'')||'media';}
  function clamp(v,min,max){return Math.min(max,Math.max(min,v));}
  function nextFrame(){return new Promise((r)=>requestAnimationFrame(r));}
})();
