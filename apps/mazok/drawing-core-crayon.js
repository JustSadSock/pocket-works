import * as base from './drawing-core.js?base=1';

export * from './drawing-core.js?base=1';

export const TOOL_DEFS = Object.freeze({
  ...base.TOOL_DEFS,
  crayon: Object.freeze({
    label: 'Восковой мелок',
    icon: 'i-crayon',
    min: 6,
    max: 72,
    defaultSize: 24,
    opacity: 1
  })
});

function pressureOf(point) {
  const pressure = Number(point?.p);
  return pressure > 0 && Number.isFinite(pressure) ? base.clamp(pressure, 0.08, 1) : 0.5;
}

export function widthForPoint(stroke, point) {
  if (stroke?.tool !== 'crayon') return base.widthForPoint(stroke, point);
  const pressure = pressureOf(point);
  return stroke.size * (0.8 + pressure * 0.28);
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

function segmentRandom(stroke, index) {
  const seed = ((Number(stroke.seed) || 1) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  return seededRandom(seed);
}

function drawCrayonDot(context, stroke, point, opacity) {
  const random = segmentRandom(stroke, 0);
  const width = widthForPoint(stroke, point);
  const radius = width * 0.5;
  const strandCount = base.clamp(Math.round(width / 8), 5, 10);
  const originalAlpha = Number.isFinite(context.globalAlpha) ? context.globalAlpha : 1;

  for (let index = 0; index < strandCount * 3; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius * 0.82;
    const grainRadius = Math.max(0.45, width * (0.025 + random() * 0.035));
    context.globalAlpha = originalAlpha * opacity * (0.18 + random() * 0.28);
    context.beginPath();
    context.arc(
      point.x + Math.cos(angle) * distance,
      point.y + Math.sin(angle) * distance,
      grainRadius,
      0,
      Math.PI * 2
    );
    context.fill();
  }
  context.globalAlpha = originalAlpha;
}

function drawCrayonSegments(context, stroke, startIndex, opacity) {
  const points = stroke.points;
  const first = Math.max(1, startIndex);
  const originalAlpha = Number.isFinite(context.globalAlpha) ? context.globalAlpha : 1;

  for (let index = first; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) continue;

    const normalX = -dy / length;
    const normalY = dx / length;
    const width = (widthForPoint(stroke, previous) + widthForPoint(stroke, current)) * 0.5;
    const strandCount = base.clamp(Math.round(width / 8), 4, 9);
    const random = segmentRandom(stroke, index);

    // A faint wax bed binds the grain into one readable stroke without
    // flattening the paper-coloured gaps between the ridges.
    context.globalAlpha = originalAlpha * opacity * 0.11;
    context.lineWidth = Math.max(0.8, width * 0.82);
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(current.x, current.y);
    context.stroke();

    for (let strand = 0; strand < strandCount; strand += 1) {
      const across = strandCount === 1 ? 0 : strand / (strandCount - 1) - 0.5;
      const jitter = (random() - 0.5) * width * 0.13;
      const offset = across * width * 0.82 + jitter;
      const drift = (random() - 0.5) * width * 0.08;
      context.globalAlpha = originalAlpha * opacity * (0.2 + random() * 0.24);
      context.lineWidth = Math.max(0.55, width / strandCount * (0.45 + random() * 0.62));
      context.beginPath();
      context.moveTo(previous.x + normalX * offset, previous.y + normalY * offset);
      context.lineTo(current.x + normalX * (offset + drift), current.y + normalY * (offset + drift));
      context.stroke();
    }

    const crumbCount = width >= 18 ? 2 : 1;
    for (let crumb = 0; crumb < crumbCount; crumb += 1) {
      const along = random();
      const edge = (random() < 0.5 ? -1 : 1) * width * (0.36 + random() * 0.1);
      const radius = Math.max(0.35, width * (0.018 + random() * 0.018));
      context.globalAlpha = originalAlpha * opacity * (0.18 + random() * 0.2);
      context.beginPath();
      context.arc(
        previous.x + dx * along + normalX * edge,
        previous.y + dy * along + normalY * edge,
        radius,
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }

  context.globalAlpha = originalAlpha;
}

export function drawStrokeRange(context, stroke, fromIndex = 0, options = {}) {
  if (stroke?.tool !== 'crayon') return base.drawStrokeRange(context, stroke, fromIndex, options);
  if (!context || !stroke.points?.length) return;

  const start = base.clamp(Math.floor(fromIndex), 0, stroke.points.length - 1);
  const opacity = Number.isFinite(options.opacity) ? options.opacity : TOOL_DEFS.crayon.opacity;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = base.normalizeHexColor(stroke.color);
  context.fillStyle = context.strokeStyle;
  context.globalCompositeOperation = 'source-over';

  if (stroke.points.length === 1 && start === 0) {
    drawCrayonDot(context, stroke, stroke.points[0], opacity);
  } else {
    drawCrayonSegments(context, stroke, start, opacity);
  }

  context.restore();
}

function drawingWithCrayonsAsPencil(value) {
  if (!value || typeof value !== 'object') return value;
  const convertStroke = (stroke) => stroke?.tool === 'crayon' ? { ...stroke, tool: 'pencil' } : stroke;
  if (value.schema === 1 && Array.isArray(value.strokes)) {
    return { ...value, strokes: value.strokes.map(convertStroke) };
  }
  if (value.schema === 2 && Array.isArray(value.layers)) {
    return {
      ...value,
      layers: value.layers.map((layer) => ({
        ...layer,
        strokes: Array.isArray(layer?.strokes) ? layer.strokes.map(convertStroke) : layer?.strokes
      }))
    };
  }
  return value;
}

function crayonStrokeIds(value) {
  const ids = new Set();
  const collect = (stroke) => {
    if (stroke?.tool === 'crayon' && typeof stroke.id === 'string') ids.add(stroke.id);
  };
  if (value?.schema === 1) (value.strokes || []).forEach(collect);
  if (value?.schema === 2) (value.layers || []).forEach((layer) => (layer.strokes || []).forEach(collect));
  return ids;
}

export function isValidDrawing(value) {
  return base.isValidDrawing(drawingWithCrayonsAsPencil(value));
}

export function normalizeDrawingDocument(value) {
  if (!isValidDrawing(value)) return null;
  const crayonIds = crayonStrokeIds(value);
  const normalized = base.normalizeDrawingDocument(drawingWithCrayonsAsPencil(value));
  if (!normalized || crayonIds.size === 0) return normalized;
  for (const layer of normalized.layers || []) {
    for (const stroke of layer.strokes || []) {
      if (crayonIds.has(stroke.id)) stroke.tool = 'crayon';
    }
  }
  return normalized;
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

export function replayStrokes(context, strokes, width, height, backgroundColor = base.PAPER_COLORS[0]) {
  return replayStrokesScaled(context, strokes, width, height, width, height, backgroundColor);
}

export function replayStrokesScaled(
  context,
  strokes,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  backgroundColor = base.PAPER_COLORS[0]
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
      base.floodFillContext(context, {
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

export function replayDrawingScaled(context, drawing, targetWidth, targetHeight, options = {}) {
  const layers = base.drawingLayers(drawing);
  const maximumSequence = Number.isFinite(options.maxSequence) ? options.maxSequence : Number.POSITIVE_INFINITY;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.restore();

  let replayLayer = null;
  for (const layer of layers) {
    if (!layer.visible && !options.includeHidden) continue;
    replayLayer ||= createReplayLayer(targetWidth, targetHeight);
    const strokes = layer.strokes.filter((stroke) => (Number(stroke.seq) || 0) <= maximumSequence);
    if (!replayLayer) {
      replayStrokesScaled(
        context,
        strokes,
        drawing.width,
        drawing.height,
        targetWidth,
        targetHeight,
        drawing.background
      );
      continue;
    }
    replayStrokesScaled(
      replayLayer.context,
      strokes,
      drawing.width,
      drawing.height,
      targetWidth,
      targetHeight,
      drawing.background
    );
    context.save();
    context.globalAlpha = base.clamp(Number(layer.opacity), 0, 1);
    context.drawImage(replayLayer.canvas, 0, 0);
    context.restore();
  }
}

export function replayDrawingRegion(context, drawing, bounds, targetWidth, targetHeight, options = {}) {
  const safeBounds = bounds || base.drawingContentBounds(drawing, options);
  const padding = Math.max(0, Number(options.padding) || 0);
  const sourceWidth = Math.max(1, safeBounds.width + padding * 2);
  const sourceHeight = Math.max(1, safeBounds.height + padding * 2);
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const offsetX = (targetWidth - safeBounds.width * scale) * 0.5 - safeBounds.minX * scale;
  const offsetY = (targetHeight - safeBounds.height * scale) * 0.5 - safeBounds.minY * scale;
  const maximumSequence = Number.isFinite(options.maxSequence) ? options.maxSequence : Number.POSITIVE_INFINITY;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.restore();

  let replayLayer = null;
  for (const layer of base.drawingLayers(drawing)) {
    if (!layer.visible && !options.includeHidden) continue;
    replayLayer ||= createReplayLayer(targetWidth, targetHeight);
    if (!replayLayer) continue;
    const layerContext = replayLayer.context;
    layerContext.setTransform(1, 0, 0, 1, 0, 0);
    layerContext.clearRect(0, 0, targetWidth, targetHeight);
    layerContext.save();
    layerContext.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    for (const stroke of layer.strokes) {
      if ((Number(stroke.seq) || 0) > maximumSequence || stroke.tool === 'fill') continue;
      drawStrokeRange(layerContext, stroke, 0);
    }
    layerContext.restore();
    context.save();
    context.globalAlpha = base.clamp(Number(layer.opacity), 0, 1);
    context.drawImage(replayLayer.canvas, 0, 0);
    context.restore();
  }
}

export function recognizeShape(stroke) {
  if (stroke?.tool !== 'crayon') return base.recognizeShape(stroke);
  const recognized = base.recognizeShape({ ...stroke, tool: 'pencil' });
  return recognized ? { ...recognized } : null;
}
