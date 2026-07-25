async function updateArAvailability() {
  const supported = Boolean(navigator.xr?.isSessionSupported)
    && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  $('#startArButton').disabled = !supported;
  $('#scanDepthBadge').hidden = false;
  $('#scanDepthBadge').textContent = supported
    ? 'AR доступен · глубина проверится при запуске'
    : 'В этом браузере нет WebXR AR — используй камеру или редактор';
}

async function startArScan() {
  if (!navigator.xr) return toast('WebXR AR недоступен в этом браузере');
  stopCamera();
  try {
    const xrCanvas = $('#xrCanvas');
    xrCanvas.hidden = false;
    const gl = xrCanvas.getContext('webgl2', { alpha: true, antialias: true, xrCompatible: true })
      || xrCanvas.getContext('webgl', { alpha: true, antialias: true, xrCompatible: true });
    if (!gl) throw new Error('WebGL unavailable');
    await gl.makeXRCompatible?.();
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay', 'depth-sensing'],
      domOverlay: { root: $('#scanSheet') },
      depthSensing: {
        usagePreference: ['cpu-optimized', 'gpu-optimized'],
        formatPreference: ['float32', 'luminance-alpha']
      }
    });
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
    const referenceSpace = await session.requestReferenceSpace('local-floor');
    const viewerSpace = await session.requestReferenceSpace('viewer');
    const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    editPoints = [];
    xrRuntime = {
      session,
      gl,
      referenceSpace,
      hitTestSource,
      currentHit: null,
      worldPoints: [],
      depthSeen: false
    };
    session.addEventListener('end', () => {
      if (xrRuntime?.session === session) xrRuntime = null;
      $('#captureArCornerButton').disabled = true;
      $('#finishArButton').disabled = true;
      $('#startArButton').disabled = false;
      $('#xrCanvas').hidden = true;
      drawScanStage();
    });
    $('#startArButton').disabled = true;
    $('#captureArCornerButton').disabled = false;
    session.requestAnimationFrame(onXrFrame);
  } catch (error) {
    console.warn('AR room scan failed', error);
    toast('AR-обход не запустился. Камерная обводка останется рабочей.');
  }
}

function onXrFrame(_time, frame) {
  const runtime = xrRuntime;
  if (!runtime || frame.session !== runtime.session) return;
  runtime.session.requestAnimationFrame(onXrFrame);
  const pose = frame.getViewerPose(runtime.referenceSpace);
  if (!pose) return;
  const layer = runtime.session.renderState.baseLayer;
  const gl = runtime.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const results = frame.getHitTestResults(runtime.hitTestSource);
  runtime.currentHit = results[0]?.getPose(runtime.referenceSpace)?.transform?.position || null;
  if (runtime.session.depthUsage === 'cpu-optimized' && typeof frame.getDepthInformation === 'function') {
    for (const view of pose.views) {
      try {
        const info = frame.getDepthInformation(view);
        if (info) runtime.depthSeen = true;
      } catch {
      }
    }
  }
  $('#scanDepthBadge').textContent = runtime.depthSeen
    ? 'LiDAR / depth активен'
    : 'AR-плоскость активна · отдельная depth-карта не выдана';
}

function captureArCorner() {
  const hit = xrRuntime?.currentHit;
  if (!hit) return toast('Наведи центр экрана на пол у угла');
  xrRuntime.worldPoints.push({ x: hit.x, y: hit.z });
  editPoints = normalizeWorldPolygon(xrRuntime.worldPoints);
  $('#finishArButton').disabled = editPoints.length < 3;
  toast(`Угол ${editPoints.length} добавлен`);
  drawScanStage();
}

function finishArScan() {
  if (!xrRuntime || xrRuntime.worldPoints.length < 3) return;
  const dimensions = worldBounds(xrRuntime.worldPoints);
  const mainState = loadMainState();
  if (mainState?.room) {
    mainState.room.width = clamp(dimensions.width, 1.5, 30);
    mainState.room.length = clamp(dimensions.length, 1.5, 30);
    saveMainState(mainState);
  }
  $('#referenceWallInput').value = '';
  stopArSession();
  drawScanStage();
}

function stopArSession() {
  if (xrRuntime?.session) xrRuntime.session.end().catch(() => {});
  xrRuntime = null;
}

function normalizeWorldPolygon(points) {
  if (!points.length) return [];
  const bounds = worldBounds(points);
  return points.map((point) => ({
    x: clamp(0.08 + ((point.x - bounds.minX) / Math.max(bounds.width, 0.01)) * 0.84, 0.02, 0.98),
    y: clamp(0.08 + ((point.y - bounds.minY) / Math.max(bounds.length, 0.01)) * 0.84, 0.02, 0.98)
  }));
}

function worldBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, length: maxY - minY };
}

function stopCamera() {
  cameraStream?.getTracks?.().forEach((track) => track.stop());
  cameraStream = null;
  const video = $('#scanVideo');
  if (video) {
    video.srcObject = null;
    video.hidden = true;
  }
}

function applyEditedShape() {
  if (!validPolygon(editPoints)) return toast('Нужно хотя бы три угла');
  if (polygonSelfIntersects(editPoints)) return toast('Стены пересекаются. Контур должен идти по периметру по порядку.');
  const referenceMeters = Number($('#referenceWallInput').value);
  const source = scanMode === 'photo' ? 'photo' : scanMode === 'ar' ? 'ar' : 'manual';
  const nextGeometry = {
    schema: 2,
    points: normalizePolygon(editPoints),
    source,
    capturedAt: new Date().toISOString(),
    referenceWallMeters: Number.isFinite(referenceMeters) && referenceMeters > 0 ? referenceMeters : null,
    referenceEdge
  };
  const room = inferRoomDimensions(nextGeometry.points, nextGeometry.referenceWallMeters, referenceEdge);
  const mainState = loadMainState();
  if (mainState?.room) {
    mainState.room.width = room.width;
    mainState.room.length = room.length;
    constrainStatePointsToPolygon(mainState, nextGeometry.points);
    saveMainState(mainState);
  }
  saveGeometry(nextGeometry);
  closeScanSheet();
  toast('Форма комнаты применена');
  window.setTimeout(() => location.reload(), 220);
}

function normalizePolygon(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(0.01, maxX - minX);
  const height = Math.max(0.01, maxY - minY);
  return points.map((point) => ({
    x: clamp(0.04 + ((point.x - minX) / width) * 0.92, 0.02, 0.98),
    y: clamp(0.04 + ((point.y - minY) / height) * 0.92, 0.02, 0.98)
  }));
}

function inferRoomDimensions(points, referenceMeters, edgeIndex) {
  const state = loadMainState();
  const fallback = {
    width: clamp(Number(state?.room?.width) || 4.2, 1.5, 30),
    length: clamp(Number(state?.room?.length) || 5.5, 1.5, 30)
  };
  if (!referenceMeters || points.length < 2) return fallback;
  const edge = distance(points[edgeIndex % points.length], points[(edgeIndex + 1) % points.length]);
  if (edge < 0.01) return fallback;
  const scale = referenceMeters / edge;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = (Math.max(...xs) - Math.min(...xs)) * scale;
  const length = (Math.max(...ys) - Math.min(...ys)) * scale;
  return {
    width: clamp(width, 1.5, 30),
    length: clamp(length, 1.5, 30)
  };
}

function polygonSelfIntersects(points) {
  for (let i = 0; i < points.length; i += 1) {
    const a1 = points[i];
    const a2 = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === points.length - 1)) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % points.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}
