export const TOOL_DEFS = Object.freeze({
  pencil: Object.freeze({ label: 'Карандаш', icon: 'i-pencil', min: 2, max: 34, defaultSize: 8, opacity: 0.82 }),
  ink: Object.freeze({ label: 'Чернила', icon: 'i-pen', min: 2, max: 52, defaultSize: 14, opacity: 1 }),
  marker: Object.freeze({ label: 'Маркер', icon: 'i-marker', min: 8, max: 96, defaultSize: 38, opacity: 0.28 }),
  fill: Object.freeze({ label: 'Заливка', icon: 'i-fill', min: 1, max: 1, defaultSize: 1, opacity: 1 }),
  eraser: Object.freeze({ label: 'Ластик', icon: 'i-eraser', min: 8, max: 120, defaultSize: 34, opacity: 1 })
});

export const PAPER_COLORS = Object.freeze(['#fffaf0', '#ffffff', '#f4eadf', '#e9f1ef']);

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

export function makeId(prefix = 'drawing') {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function normalizeHexColor(value, fallback = '#20211f') {
  const normalized = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

export function brushSizeInDocument(size, drawingWidth, referenceWidth = 390) {
  const safeSize = Math.max(0.1, Number(size) || 1);
  const safeDrawingWidth = Math.max(1, Number(drawingWidth) || 1200);
  const safeReferenceWidth = Math.max(1, Number(referenceWidth) || 390);
  return safeSize * safeDrawingWidth / safeReferenceWidth;
}

export function fitDrawingScale(containerWidth, containerHeight, drawingWidth, drawingHeight, coverThreshold = 1.045) {
  const safeContainerWidth = Math.max(1, Number(containerWidth) || 1);
  const safeContainerHeight = Math.max(1, Number(containerHeight) || 1);
  const safeDrawingWidth = Math.max(1, Number(drawingWidth) || 1);
  const safeDrawingHeight = Math.max(1, Number(drawingHeight) || 1);
  const contain = Math.min(
    safeContainerWidth / safeDrawingWidth,
    safeContainerHeight / safeDrawingHeight
  );
  const cover = Math.max(
    safeContainerWidth / safeDrawingWidth,
    safeContainerHeight / safeDrawingHeight
  );

  // Mobile browser chrome can change the visual viewport by a few pixels after
  // a sheet is created. Cover that tiny mismatch instead of leaving a dead
  // strip, but keep a normal contain fit after rotation or on another device.
  return cover / contain <= Math.max(1, Number(coverThreshold) || 1.045) ? cover : contain;
}

export function createDrawingDocument(viewportWidth, viewportHeight, options = {}) {
  const width = 1200;
  const safeWidth = Math.max(280, Number(viewportWidth) || 390);
  const safeHeight = Math.max(420, Number(viewportHeight) || 760);
  const aspect = clamp(safeHeight / safeWidth, 0.72, 2.35);
  const height = Math.round(width * aspect);
  const timestamp = new Date().toISOString();

  return {
    schema: 1,
    id: makeId(),
    title: options.title || 'Без названия',
    createdAt: timestamp,
    updatedAt: timestamp,
    width,
    height,
    background: PAPER_COLORS.includes(options.background) ? options.background : PAPER_COLORS[0],
    strokes: [],
    thumbnail: null
  };
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function simplifySection(points, first, last, tolerance, keep) {
  let farthest = tolerance;
  let index = -1;
  for (let cursor = first + 1; cursor < last; cursor += 1) {
    const candidate = pointSegmentDistance(points[cursor], points[first], points[last]);
    if (candidate > farthest) {
      farthest = candidate;
      index = cursor;
    }
  }
  if (index < 0) return;
  keep[index] = true;
  simplifySection(points, first, index, tolerance, keep);
  simplifySection(points, index, last, tolerance, keep);
}

export function simplifyPoints(points, tolerance = 0.75) {
  if (!Array.isArray(points) || points.length <= 2) return Array.isArray(points) ? points.slice() : [];
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  simplifySection(points, 0, points.length - 1, Math.max(0.05, tolerance), keep);
  return points.filter((_, index) => keep[index]);
}

function finitePoint(point, width, height) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= -width * 0.05 && point.x <= width * 1.05
    && point.y >= -height * 0.05 && point.y <= height * 1.05;
}

export function isValidDrawing(value) {
  if (!value || value.schema !== 1 || typeof value.id !== 'string' || value.id.length > 160) return false;
  if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) return false;
  if (value.width < 240 || value.width > 4096 || value.height < 240 || value.height > 8192) return false;
  if (!Array.isArray(value.strokes) || value.strokes.length > 5000) return false;
  if (typeof value.title !== 'string' || value.title.length > 80) return false;
  if (!/^#[0-9a-f]{6}$/i.test(value.background || '')) return false;

  return value.strokes.every((stroke) => {
    if (!stroke || !TOOL_DEFS[stroke.tool] || !Array.isArray(stroke.points)) return false;
    if (stroke.points.length < 1 || stroke.points.length > 12_000) return false;
    if (stroke.tool === 'fill' && stroke.points.length !== 1) return false;
    if (!Number.isFinite(stroke.size) || stroke.size < 0.1 || stroke.size > 1000) return false;
    if (stroke.tool !== 'eraser' && !/^#[0-9a-f]{6}$/i.test(stroke.color || '')) return false;
    return stroke.points.every((point) => finitePoint(point, value.width, value.height));
  });
}

function pressureOf(point) {
  const pressure = Number(point?.p);
  return pressure > 0 && Number.isFinite(pressure) ? clamp(pressure, 0.08, 1) : 0.5;
}

export function widthForPoint(stroke, point) {
  const pressure = pressureOf(point);
  if (stroke.tool === 'ink') return stroke.size * (0.62 + pressure * 0.76);
  if (stroke.tool === 'pencil') return stroke.size * (0.72 + pressure * 0.3);
  if (stroke.tool === 'eraser') return stroke.size * (0.9 + pressure * 0.22);
  return stroke.size;
}

function dot(context, point, radius) {
  context.beginPath();
  context.arc(point.x, point.y, Math.max(0.2, radius), 0, Math.PI * 2);
  context.fill();
}

function drawSegment(context, stroke, previous, current) {
  const width = (widthForPoint(stroke, previous) + widthForPoint(stroke, current)) * 0.5;
  context.lineWidth = Math.max(0.35, width);
  context.beginPath();
  context.moveTo(previous.x, previous.y);
  context.lineTo(current.x, current.y);
  context.stroke();
}

function drawConstantWidthPath(context, stroke, start) {
  const points = stroke.points;
  const firstIndex = Math.max(0, start - 1);
  context.lineWidth = Math.max(0.35, stroke.size);
  context.beginPath();
  context.moveTo(points[firstIndex].x, points[firstIndex].y);
  for (let index = firstIndex + 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.stroke();
}

function seededRandom(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function addPencilGrain(context, stroke, fromIndex, toIndex) {
  if (stroke.tool !== 'pencil') return;
  const random = seededRandom(stroke.seed);
  const points = stroke.points;
  const end = Math.min(points.length - 1, toIndex);
  context.save();
  context.globalAlpha *= 0.24;
  for (let index = 0; index <= end; index += 1) {
    const point = points[index];
    const spread = stroke.size * 0.44;
    const count = index >= fromIndex ? 2 : 0;
    for (let grain = 0; grain < count; grain += 1) {
      const angle = random() * Math.PI * 2;
      const radius = random() * spread;
      dot(context, {
        x: point.x + Math.cos(angle) * radius,
        y: point.y + Math.sin(angle) * radius
      }, Math.max(0.25, stroke.size * (0.025 + random() * 0.035)));
    }
  }
  context.restore();
}

export function drawStrokeRange(context, stroke, fromIndex = 0, options = {}) {
  if (!context || !stroke?.points?.length || !TOOL_DEFS[stroke.tool] || stroke.tool === 'fill') return;
  const points = stroke.points;
  const start = clamp(Math.floor(fromIndex), 0, points.length - 1);
  const opacity = Number.isFinite(options.opacity) ? options.opacity : TOOL_DEFS[stroke.tool].opacity;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = stroke.tool === 'eraser' ? '#000000' : normalizeHexColor(stroke.color);
  context.fillStyle = context.strokeStyle;
  context.globalAlpha = opacity;
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';

  if (points.length === 1 && start === 0) {
    dot(context, points[0], widthForPoint(stroke, points[0]) * 0.5);
  } else if (stroke.tool === 'marker' && start === 0) {
    // A marker has one constant width. Painting it as one path prevents the
    // semi-transparent round caps of every saved segment from becoming dots.
    drawConstantWidthPath(context, stroke, start);
  } else {
    for (let index = Math.max(1, start); index < points.length; index += 1) {
      drawSegment(context, stroke, points[index - 1], points[index]);
    }
  }
  addPencilGrain(context, stroke, start, points.length - 1);
  context.restore();
}

function rgbFromHex(value) {
  const color = normalizeHexColor(value);
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ];
}

function compositeChannel(source, alpha, background) {
  return Math.round((source * alpha + background * (255 - alpha)) / 255);
}

function pixelColor(pixels, index, background) {
  const offset = index * 4;
  const alpha = pixels[offset + 3];
  return [
    compositeChannel(pixels[offset], alpha, background[0]),
    compositeChannel(pixels[offset + 1], alpha, background[1]),
    compositeChannel(pixels[offset + 2], alpha, background[2])
  ];
}

function colorDistance(a, b) {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2])
  );
}

function pixelMatches(pixels, index, background, target, tolerance) {
  const offset = index * 4;
  const alpha = pixels[offset + 3];
  return Math.max(
    Math.abs(compositeChannel(pixels[offset], alpha, background[0]) - target[0]),
    Math.abs(compositeChannel(pixels[offset + 1], alpha, background[1]) - target[1]),
    Math.abs(compositeChannel(pixels[offset + 2], alpha, background[2]) - target[2])
  ) <= tolerance;
}

function replacePixel(pixels, index, color) {
  const offset = index * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = 255;
}

function targetComponentCoverage(visible, target) {
  let maximumScale = Number.POSITIVE_INFINITY;
  let hasDirection = false;
  for (let channel = 0; channel < 3; channel += 1) {
    const delta = visible[channel] - target[channel];
    if (Math.abs(delta) < 0.5) continue;
    hasDirection = true;
    const boundary = delta < 0 ? 0 : 255;
    maximumScale = Math.min(maximumScale, (boundary - target[channel]) / delta);
  }
  if (!hasDirection || !Number.isFinite(maximumScale) || maximumScale <= 1) return 0;
  return clamp(1 - 1 / maximumScale, 0, 1);
}

function paintUnderEdge(pixels, index, fill, target, targetLayerAlpha, background, edgeTolerance) {
  const offset = index * 4;
  const alpha = pixels[offset + 3];

  if (alpha < 255) {
    // Canvas keeps anti-aliased contour pixels translucent. Put the fill under
    // that coverage instead of stopping before it and exposing paper-coloured
    // fringe. The contour colour itself stays untouched.
    pixels[offset] = compositeChannel(pixels[offset], alpha, fill[0]);
    pixels[offset + 1] = compositeChannel(pixels[offset + 1], alpha, fill[1]);
    pixels[offset + 2] = compositeChannel(pixels[offset + 2], alpha, fill[2]);
    pixels[offset + 3] = 255;
    return;
  }

  // On the first fill an opaque neighbour is the contour itself. Only use soft
  // replacement when the selected region was already opaque (for example when
  // recolouring an earlier fill).
  if (targetLayerAlpha < 255) return;

  const visible = pixelColor(pixels, index, background);
  const distanceFromTarget = colorDistance(visible, target);
  if (distanceFromTarget >= edgeTolerance) return;
  const edgeGuard = clamp(
    (edgeTolerance - distanceFromTarget) / Math.max(1, edgeTolerance * 0.12),
    0,
    1
  );
  const coverage = targetComponentCoverage(visible, target) * edgeGuard;
  pixels[offset] = clamp(Math.round(visible[0] + (fill[0] - target[0]) * coverage), 0, 255);
  pixels[offset + 1] = clamp(Math.round(visible[1] + (fill[1] - target[1]) * coverage), 0, 255);
  pixels[offset + 2] = clamp(Math.round(visible[2] + (fill[2] - target[2]) * coverage), 0, 255);
}

export function floodFillPixels(
  pixels,
  width,
  height,
  startX,
  startY,
  fillColor,
  backgroundColor = PAPER_COLORS[0],
  tolerance = 18,
  edgeTolerance = 148
) {
  const safeWidth = Math.max(0, Math.floor(Number(width) || 0));
  const safeHeight = Math.max(0, Math.floor(Number(height) || 0));
  const total = safeWidth * safeHeight;
  if (!pixels || !total || pixels.length < total * 4) return 0;

  const x = clamp(Math.round(Number(startX) || 0), 0, safeWidth - 1);
  const y = clamp(Math.round(Number(startY) || 0), 0, safeHeight - 1);
  const start = y * safeWidth + x;
  const background = rgbFromHex(backgroundColor);
  const fill = rgbFromHex(fillColor);
  const targetLayerAlpha = pixels[start * 4 + 3];
  const target = pixelColor(pixels, start, background);
  const limit = clamp(Math.round(Number(tolerance) || 0), 0, 255);
  const softLimit = clamp(Math.max(limit + 1, Math.round(Number(edgeTolerance) || 148)), 1, 255);

  if (colorDistance(target, fill) <= 1) return 0;

  // 0 = unseen, 1 = rejected, 2 = connected fill region, 3 = one-pixel
  // antialias fringe. A typed queue keeps memory bounded on tall phone pages.
  const state = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 1;
  queue[0] = start;
  state[start] = 2;

  const matches = (index) => {
    return pixelMatches(pixels, index, background, target, limit);
  };

  const visit = (index) => {
    if (state[index]) return;
    if (matches(index)) {
      state[index] = 2;
      queue[tail++] = index;
    } else {
      state[index] = 1;
    }
  };

  while (head < tail) {
    const index = queue[head++];
    replacePixel(pixels, index, fill);
    const column = index % safeWidth;
    if (column > 0) visit(index - 1);
    if (column + 1 < safeWidth) visit(index + 1);
    if (index >= safeWidth) visit(index - safeWidth);
    if (index + safeWidth < total) visit(index + safeWidth);
  }

  const regionSize = tail;
  const addEdge = (index) => {
    if (state[index] === 2 || state[index] === 3) return;
    state[index] = 3;
    queue[tail++] = index;
  };

  // Expand exactly one pixel under the antialiased contour. It removes the
  // familiar white halo without allowing the fill to jump across the line.
  for (let cursor = 0; cursor < regionSize; cursor += 1) {
    const index = queue[cursor];
    const column = index % safeWidth;
    const row = Math.floor(index / safeWidth);
    if (column > 0) addEdge(index - 1);
    if (column + 1 < safeWidth) addEdge(index + 1);
    if (row > 0) {
      addEdge(index - safeWidth);
      if (column > 0) addEdge(index - safeWidth - 1);
      if (column + 1 < safeWidth) addEdge(index - safeWidth + 1);
    }
    if (row + 1 < safeHeight) {
      addEdge(index + safeWidth);
      if (column > 0) addEdge(index + safeWidth - 1);
      if (column + 1 < safeWidth) addEdge(index + safeWidth + 1);
    }
  }

  for (let cursor = regionSize; cursor < tail; cursor += 1) {
    paintUnderEdge(pixels, queue[cursor], fill, target, targetLayerAlpha, background, softLimit);
  }

  return regionSize;
}

export function floodFillContext(context, stroke, width, height, backgroundColor = PAPER_COLORS[0]) {
  if (!context || stroke?.tool !== 'fill' || !stroke.points?.length) return 0;
  const image = context.getImageData(0, 0, width, height);
  const point = stroke.points[0];
  const changed = floodFillPixels(
    image.data,
    width,
    height,
    point.x,
    point.y,
    stroke.color,
    backgroundColor,
    stroke.tolerance,
    stroke.edgeTolerance
  );
  if (changed > 0) context.putImageData(image, 0, 0);
  return changed;
}

function createReplayLayer(width, height) {
  let canvas = null;
  if (typeof globalThis.OffscreenCanvas === 'function') {
    canvas = new globalThis.OffscreenCanvas(width, height);
  } else if (globalThis.document?.createElement) {
    canvas = globalThis.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }
  if (!canvas) return null;
  const context = canvas.getContext('2d', { alpha: true });
  return context ? { canvas, context } : null;
}

export function replayStrokes(context, strokes, width, height, backgroundColor = PAPER_COLORS[0]) {
  return replayStrokesScaled(context, strokes, width, height, width, height, backgroundColor);
}

export function replayStrokesScaled(
  context,
  strokes,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  backgroundColor = PAPER_COLORS[0]
) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.restore();
  const scaleX = Math.max(0.0001, targetWidth / Math.max(1, sourceWidth));
  const scaleY = Math.max(0.0001, targetHeight / Math.max(1, sourceHeight));
  let replayLayer = null;
  for (const stroke of strokes || []) {
    if (stroke.tool === 'fill') {
      floodFillContext(context, {
        ...stroke,
        points: stroke.points.map((point) => ({
          ...point,
          x: point.x * scaleX,
          y: point.y * scaleY
        }))
      }, targetWidth, targetHeight, backgroundColor);
      continue;
    }

    const opacity = TOOL_DEFS[stroke.tool]?.opacity ?? 1;
    if (opacity < 1) {
      replayLayer ||= createReplayLayer(targetWidth, targetHeight);
      if (replayLayer) {
        replayLayer.context.setTransform(1, 0, 0, 1, 0, 0);
        replayLayer.context.clearRect(0, 0, targetWidth, targetHeight);
        replayLayer.context.save();
        replayLayer.context.scale(scaleX, scaleY);
        drawStrokeRange(replayLayer.context, stroke, 0, { opacity: 1 });
        replayLayer.context.restore();
        context.save();
        context.globalAlpha = opacity;
        context.drawImage(replayLayer.canvas, 0, 0);
        context.restore();
        continue;
      }
    }
    context.save();
    context.scale(scaleX, scaleY);
    drawStrokeRange(context, stroke, 0);
    context.restore();
  }
}

export function safeFileStem(title) {
  const normalized = String(title || 'mazok')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9_-]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'mazok';
}

export function drawingCountLabel(count) {
  const value = Math.max(0, Number(count) || 0);
  const tens = value % 100;
  const unit = value % 10;
  if (tens >= 11 && tens <= 14) return `${value} рисунков`;
  if (unit === 1) return `${value} рисунок`;
  if (unit >= 2 && unit <= 4) return `${value} рисунка`;
  return `${value} рисунков`;
}
