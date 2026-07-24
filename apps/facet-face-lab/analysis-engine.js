const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function normalizeLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) {
    throw new TypeError('Expected a MediaPipe face mesh with at least 468 landmarks');
  }

  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const origin = {
    x: (landmarks[234].x + landmarks[454].x) / 2,
    y: (landmarks[10].y + landmarks[152].y) / 2
  };

  const rotated = landmarks.map((point) => {
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos,
      z: point.z || 0
    };
  });

  const width = Math.max(0.0001, Math.abs(rotated[454].x - rotated[234].x));
  const height = Math.max(0.0001, Math.abs(rotated[152].y - rotated[10].y));
  const centerX = (rotated[234].x + rotated[454].x) / 2;
  const topY = rotated[10].y;

  return {
    points: rotated.map((point) => ({
      x: (point.x - centerX) / width,
      y: (point.y - topY) / width,
      z: point.z / width
    })),
    rollDegrees: angle * 180 / Math.PI,
    rawWidth: width,
    rawHeight: height
  };
}

function gaussianScore(value, center, sigma, floor = 25) {
  const z = (value - center) / Math.max(0.0001, sigma);
  return clamp(floor + (100 - floor) * Math.exp(-0.5 * z * z));
}

function inverseErrorScore(error, excellent, poor, floor = 20) {
  if (error <= excellent) return 100;
  if (error >= poor) return floor;
  const progress = (error - excellent) / (poor - excellent);
  return clamp(100 - progress * (100 - floor));
}

function weightedAverage(entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  return entries.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / totalWeight;
}

export function computeGeometryProfile(landmarks) {
  const normalized = normalizeLandmarks(landmarks);
  const p = normalized.points;
  const d = (a, b) => distance(p[a], p[b]);
  const midX = 0;

  const symmetryPairs = [
    [33, 263], [133, 362], [70, 300], [105, 334], [159, 386], [145, 374],
    [98, 327], [61, 291], [78, 308], [234, 454], [93, 323], [132, 361],
    [172, 397], [136, 365], [58, 288], [127, 356]
  ];

  const symmetryErrors = symmetryPairs.map(([left, right]) => {
    const xError = Math.abs((p[left].x + p[right].x) - 2 * midX);
    const yError = Math.abs(p[left].y - p[right].y);
    return Math.hypot(xError, yError * 0.8);
  });

  const bilateralBalance = inverseErrorScore(median(symmetryErrors), 0.008, 0.065, 24);

  const faceHeight = d(10, 152);
  const faceAspect = faceHeight / Math.max(0.001, d(234, 454));
  const eyeGap = d(133, 362);
  const leftEyeWidth = d(33, 133);
  const rightEyeWidth = d(362, 263);
  const eyeWidth = (leftEyeWidth + rightEyeWidth) / 2;
  const noseWidth = d(98, 327);
  const mouthWidth = d(61, 291);
  const noseLength = d(168, 2) / Math.max(0.001, faceHeight);
  const lowerFace = d(2, 152) / Math.max(0.001, faceHeight);
  const eyeLine = mean([p[33].y, p[133].y, p[362].y, p[263].y]) / Math.max(0.001, faceHeight);
  const leftNoseSpan = Math.abs(landmarks[1].x - landmarks[234].x);
  const rightNoseSpan = Math.abs(landmarks[454].x - landmarks[1].x);
  const yawProxy = Math.abs(leftNoseSpan - rightNoseSpan) / Math.max(0.0001, leftNoseSpan + rightNoseSpan);

  const proportionEntries = [
    { key: 'faceAspect', label: 'отношение высоты к ширине', value: faceAspect, score: gaussianScore(faceAspect, 1.40, 0.24), weight: 0.8 },
    { key: 'eyeGap', label: 'межглазное расстояние', value: eyeGap, score: gaussianScore(eyeGap, 0.22, 0.075), weight: 1.0 },
    { key: 'eyeWidth', label: 'масштаб глаз', value: eyeWidth, score: gaussianScore(eyeWidth, 0.18, 0.055), weight: 0.9 },
    { key: 'noseWidth', label: 'масштаб носа', value: noseWidth, score: gaussianScore(noseWidth, 0.23, 0.07), weight: 0.8 },
    { key: 'mouthWidth', label: 'масштаб рта', value: mouthWidth, score: gaussianScore(mouthWidth, 0.37, 0.10), weight: 0.8 },
    { key: 'noseLength', label: 'средняя треть лица', value: noseLength, score: gaussianScore(noseLength, 0.30, 0.095), weight: 0.8 },
    { key: 'lowerFace', label: 'нижняя треть лица', value: lowerFace, score: gaussianScore(lowerFace, 0.40, 0.11), weight: 0.9 },
    { key: 'eyeLine', label: 'вертикальное положение глаз', value: eyeLine, score: gaussianScore(eyeLine, 0.40, 0.105), weight: 0.7 }
  ];

  const proportionalRegularity = weightedAverage(proportionEntries);

  const coordinationErrors = [
    Math.abs(leftEyeWidth - rightEyeWidth) / Math.max(0.001, eyeWidth),
    Math.abs(d(70, 159) - d(300, 386)) / Math.max(0.001, mean([d(70, 159), d(300, 386)])),
    Math.abs((p[98].x + p[327].x) / 2),
    Math.abs((p[61].x + p[291].x) / 2),
    Math.abs(p[152].x),
    Math.abs((d(234, 1) - d(454, 1)) / Math.max(0.001, mean([d(234, 1), d(454, 1)])))
  ];
  const featureCoordination = inverseErrorScore(median(coordinationErrors), 0.012, 0.16, 24);

  const structureScore = clamp(
    bilateralBalance * 0.20 +
    proportionalRegularity * 0.45 +
    featureCoordination * 0.35,
    22,
    94
  );

  const ranked = [...proportionEntries]
    .map((entry) => ({ label: entry.label, score: Math.round(entry.score), value: entry.value }))
    .sort((a, b) => b.score - a.score);

  return {
    structureScore,
    components: {
      bilateralBalance,
      proportionalRegularity,
      featureCoordination
    },
    details: {
      rollDegrees: normalized.rollDegrees,
      symmetryError: median(symmetryErrors),
      faceAspect,
      eyeGap,
      eyeWidth,
      noseWidth,
      mouthWidth,
      noseLength,
      lowerFace,
      eyeLine,
      yawProxy
    },
    strongest: ranked.slice(0, 3),
    mostDistinctive: ranked.slice(-3).reverse()
  };
}

export function computeImageQuality(imageData, faceBox, geometry, blendshapes = {}) {
  const { data, width, height } = imageData;
  const sampleStep = Math.max(1, Math.floor(Math.sqrt((width * height) / 65000)));
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  let clippedDark = 0;
  let clippedLight = 0;
  let laplacianSum = 0;
  let laplacianSquares = 0;
  let laplacianCount = 0;

  const grayAt = (x, y) => {
    const index = (y * width + x) * 4;
    return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
  };

  for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
    for (let x = sampleStep; x < width - sampleStep; x += sampleStep) {
      const gray = grayAt(x, y);
      count += 1;
      sum += gray;
      sumSquares += gray * gray;
      if (gray < 12) clippedDark += 1;
      if (gray > 243) clippedLight += 1;

      const lap = 4 * gray - grayAt(x - sampleStep, y) - grayAt(x + sampleStep, y) - grayAt(x, y - sampleStep) - grayAt(x, y + sampleStep);
      laplacianSum += lap;
      laplacianSquares += lap * lap;
      laplacianCount += 1;
    }
  }

  const brightness = sum / Math.max(1, count);
  const contrast = Math.sqrt(Math.max(0, sumSquares / Math.max(1, count) - brightness * brightness));
  const lapMean = laplacianSum / Math.max(1, laplacianCount);
  const sharpness = Math.sqrt(Math.max(0, laplacianSquares / Math.max(1, laplacianCount) - lapMean * lapMean));
  const clipping = (clippedDark + clippedLight) / Math.max(1, count);

  const faceArea = faceBox.width * faceBox.height;
  const centerDistance = Math.hypot(faceBox.cx - 0.5, faceBox.cy - 0.48);
  const yawProxy = Math.abs(geometry.details.yawProxy || 0);
  const roll = Math.abs(geometry.details.rollDegrees || 0);

  const blink = mean([blendshapes.eyeBlinkLeft || 0, blendshapes.eyeBlinkRight || 0]);
  const jawOpen = blendshapes.jawOpen || 0;
  const smile = mean([blendshapes.mouthSmileLeft || 0, blendshapes.mouthSmileRight || 0]);
  const expressionLoad = clamp(blink * 0.55 + jawOpen * 0.25 + Math.max(0, smile - 0.55) * 0.35, 0, 1);

  const metrics = {
    exposure: gaussianScore(brightness, 132, 58, 15),
    contrast: gaussianScore(contrast, 52, 34, 20),
    sharpness: gaussianScore(sharpness, 36, 24, 15),
    clipping: inverseErrorScore(clipping, 0.015, 0.24, 10),
    faceScale: gaussianScore(faceArea, 0.26, 0.18, 15),
    centering: inverseErrorScore(centerDistance, 0.035, 0.30, 15),
    roll: inverseErrorScore(roll, 2.5, 16, 15),
    frontal: inverseErrorScore(yawProxy, 0.035, 0.23, 10),
    expressionNeutrality: inverseErrorScore(expressionLoad, 0.08, 0.72, 20)
  };

  const reliability = weightedAverage([
    { score: metrics.exposure, weight: 0.11 },
    { score: metrics.contrast, weight: 0.08 },
    { score: metrics.sharpness, weight: 0.16 },
    { score: metrics.clipping, weight: 0.08 },
    { score: metrics.faceScale, weight: 0.14 },
    { score: metrics.centering, weight: 0.09 },
    { score: metrics.roll, weight: 0.12 },
    { score: metrics.frontal, weight: 0.15 },
    { score: metrics.expressionNeutrality, weight: 0.07 }
  ]);

  const presentationScore = weightedAverage([
    { score: metrics.exposure, weight: 0.2 },
    { score: metrics.contrast, weight: 0.12 },
    { score: metrics.sharpness, weight: 0.2 },
    { score: metrics.clipping, weight: 0.12 },
    { score: metrics.centering, weight: 0.14 },
    { score: metrics.roll, weight: 0.1 },
    { score: metrics.frontal, weight: 0.12 }
  ]);

  const issues = [];
  const checks = [
    ['sharpness', 50, 'Кадр смазан или камера не сфокусировалась', 'Зафиксируй телефон и коснись лица для фокусировки.'],
    ['exposure', 48, 'Освещение слишком тёмное или пересвеченное', 'Встань напротив мягкого света без яркого окна за спиной.'],
    ['clipping', 52, 'В кадре потеряны детали в тенях или светах', 'Убери прямой свет и выровняй экспозицию.'],
    ['faceScale', 48, 'Лицо занимает неподходящую часть кадра', 'Держи камеру примерно в 50–80 см от лица.'],
    ['centering', 48, 'Лицо заметно смещено от центра', 'Совмести глаза с горизонтальной направляющей.'],
    ['roll', 52, 'Голова наклонена', 'Выровняй линию глаз.'],
    ['frontal', 52, 'Ракурс недостаточно фронтальный', 'Смотри прямо в объектив, не поворачивая подбородок.'],
    ['expressionNeutrality', 42, 'Выражение сильно меняет геометрию лица', 'Для структурной оценки расслабь рот и не щурься.']
  ];
  for (const [key, threshold, title, fix] of checks) {
    if (metrics[key] < threshold) issues.push({ key, title, fix, severity: metrics[key] < 30 ? 'high' : 'medium' });
  }

  return {
    reliability,
    presentationScore,
    metrics,
    raw: { brightness, contrast, sharpness, clipping, faceArea, centerDistance, roll, yawProxy, expressionLoad },
    issues
  };
}

export function createAssessment(geometry, quality) {
  const pointEstimate = Math.round(clamp(geometry.structureScore, 22, 94));
  const uncertainty = Math.round(clamp(10 + (100 - quality.reliability) * 0.12, 10, 22));
  const low = Math.max(0, pointEstimate - uncertainty);
  const high = Math.min(100, pointEstimate + uncertainty);

  let reliabilityLabel = 'низкая';
  if (quality.reliability >= 82) reliabilityLabel = 'высокая';
  else if (quality.reliability >= 66) reliabilityLabel = 'средняя';

  return {
    pointEstimate,
    interval: [low, high],
    uncertainty,
    reliability: Math.round(quality.reliability),
    reliabilityLabel,
    presentationScore: Math.round(quality.presentationScore),
    components: {
      bilateralBalance: Math.round(geometry.components.bilateralBalance),
      proportionalRegularity: Math.round(geometry.components.proportionalRegularity),
      featureCoordination: Math.round(geometry.components.featureCoordination)
    },
    strongest: geometry.strongest,
    mostDistinctive: geometry.mostDistinctive,
    issues: quality.issues,
    details: geometry.details
  };
}

export function boundingBoxFromLandmarks(landmarks) {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2
  };
}

export function blendshapeMap(categories = []) {
  return Object.fromEntries(categories.map((category) => [category.categoryName, category.score]));
}

export function qualityGate(quality) {
  if (quality.reliability >= 58) return { pass: true, level: quality.reliability >= 76 ? 'good' : 'caution' };
  return {
    pass: false,
    level: 'blocked',
    reason: quality.issues[0]?.title || 'Кадр недостаточно надёжен для оценки'
  };
}

export const __test = { clamp, mean, median, distance, gaussianScore, inverseErrorScore };
