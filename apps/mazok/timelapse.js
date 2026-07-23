import { GIFEncoder, applyPalette, quantize } from './vendor/gifenc.esm.js';
import {
  clamp,
  drawingActionCount,
  drawingContentBounds,
  drawingLayers,
  replayDrawingRegion,
  replayDrawingScaled
} from './drawing-core.js';

function nextFrame() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function actionSequences(drawing) {
  return drawingLayers(drawing)
    .flatMap((layer) => layer.strokes)
    .map((stroke, index) => Number(stroke.seq) || index + 1)
    .sort((a, b) => a - b);
}

export function makeTimelapsePlan(drawing, maximumFrames = 34) {
  const sequences = actionSequences(drawing);
  const actionCount = sequences.length;
  if (!actionCount) return { actionCount: 0, cutoffs: [], durationSeconds: 0 };
  const frameCount = clamp(Math.ceil(Math.sqrt(actionCount) * 5), 8, maximumFrames);
  const cutoffs = [0];
  for (let index = 1; index <= frameCount; index += 1) {
    const actionIndex = Math.min(actionCount - 1, Math.ceil(actionCount * index / frameCount) - 1);
    const sequence = sequences[actionIndex];
    if (cutoffs.at(-1) !== sequence) cutoffs.push(sequence);
  }
  return {
    actionCount,
    cutoffs,
    durationSeconds: Math.round(((cutoffs.length - 1) * 0.11 + 0.9) * 10) / 10
  };
}

function outputGeometry(drawing) {
  const maximumWidth = 420;
  const maximumHeight = 620;
  if (drawing.canvasMode !== 'infinite') {
    const scale = Math.min(maximumWidth / drawing.width, maximumHeight / drawing.height, 1);
    return {
      width: Math.max(96, Math.round(drawing.width * scale / 2) * 2),
      height: Math.max(96, Math.round(drawing.height * scale / 2) * 2),
      bounds: null,
      padding: 0
    };
  }
  const content = drawingContentBounds(drawing);
  const padding = Math.max(54, Math.max(content.width, content.height) * 0.08);
  const scale = Math.min(
    maximumWidth / Math.max(1, content.width + padding * 2),
    maximumHeight / Math.max(1, content.height + padding * 2)
  );
  return {
    width: Math.max(160, Math.round((content.width + padding * 2) * scale / 2) * 2),
    height: Math.max(160, Math.round((content.height + padding * 2) * scale / 2) * 2),
    bounds: content,
    padding
  };
}

function renderFrame(drawing, geometry, maximumSequence, output, paint) {
  const context = output.getContext('2d', { alpha: false, willReadFrequently: true });
  const paintContext = paint.getContext('2d', { alpha: true });
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = drawing.canvasMode === 'infinite' ? '#f1ece2' : drawing.background;
  context.fillRect(0, 0, output.width, output.height);
  if (drawing.canvasMode === 'infinite') {
    replayDrawingRegion(paintContext, drawing, geometry.bounds, paint.width, paint.height, {
      maxSequence: maximumSequence,
      padding: geometry.padding
    });
  } else {
    replayDrawingScaled(paintContext, drawing, paint.width, paint.height, { maxSequence: maximumSequence });
  }
  context.drawImage(paint, 0, 0);
  return context.getImageData(0, 0, output.width, output.height);
}

export async function encodeTimelapseGif(drawing, options = {}) {
  const plan = makeTimelapsePlan(drawing, options.maximumFrames);
  if (!plan.actionCount) throw new Error('EMPTY_TIMELAPSE');
  const geometry = outputGeometry(drawing);
  const output = document.createElement('canvas');
  const paint = document.createElement('canvas');
  output.width = paint.width = geometry.width;
  output.height = paint.height = geometry.height;
  const gif = GIFEncoder();

  for (let index = 0; index < plan.cutoffs.length; index += 1) {
    const image = renderFrame(drawing, geometry, plan.cutoffs[index], output, paint);
    const palette = quantize(image.data, 128, { format: 'rgb444' });
    const pixels = applyPalette(image.data, palette, 'rgb444');
    gif.writeFrame(pixels, output.width, output.height, {
      palette,
      delay: index === plan.cutoffs.length - 1 ? 900 : 110,
      repeat: 0
    });
    options.onProgress?.((index + 1) / plan.cutoffs.length);
    await nextFrame();
  }
  gif.finish();
  return {
    blob: new Blob([gif.bytes()], { type: 'image/gif' }),
    width: output.width,
    height: output.height,
    ...plan
  };
}
