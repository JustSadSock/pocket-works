const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const mad = (values) => {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const RATIO_REFERENCES = [
  { key: 'faceAspect', label: 'высота к ширине', center: 1.40, spread: 0.105 },
  { key: 'eyeGap', label: 'расстояние между глазами', center: 0.22, spread: 0.030 },
  { key: 'eyeWidth', label: 'размер глаз', center: 0.18, spread: 0.022 },
  { key: 'noseWidth', label: 'ширина носа', center: 0.23, spread: 0.030 },
  { key: 'mouthWidth', label: 'ширина рта', center: 0.37, spread: 0.045 },
  { key: 'noseLength', label: 'средняя треть лица', center: 0.30, spread: 0.035 },
  { key: 'lowerFace', label: 'нижняя треть лица', center: 0.40, spread: 0.040 },
  { key: 'eyeLine', label: 'положение линии глаз', center: 0.40, spread: 0.032 }
];

const RATING_CDF = [0, 265 / 5500, (265 + 3011) / 5500, (265 + 3011 + 1582) / 5500, 1];
const DATASET_MEAN = 2.973;

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function chiSquareSurvival(value, degreesOfFreedom) {
  if (value <= 0) return 1;
  const k = Math.max(1, degreesOfFreedom);
  const transformed = (Math.cbrt(value / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return clamp(1 - normalCdf(transformed), 0, 1);
}

function ratingQuantile(percentile) {
  const p = clamp(percentile, 0, 1);
  for (let interval = 0; interval < 4; interval += 1) {
    const low = RATING_CDF[interval];
    const high = RATING_CDF[interval + 1];
    if (p <= high || interval === 3) {
      const local = (p - low) / Math.max(0.0001, high - low);
      return interval + 1 + clamp(local, 0, 1);
    }
  }
  return 5;
}

function inverseErrorScore(error, excellent, poor, floor = 10) {
  if (error <= excellent) return 100;
  if (error >= poor) return floor;
  const progress = (error - excellent) / (poor - excellent);
  return clamp(100 - progress * (100 - floor));
}

function gaussianScore(value, center, sigma, floor = 10) {
  const z = (value - center) / Math.max(0.0001, sigma);
  return clamp(floor + (100 - floor) * Math.exp(-0.5 * z * z));
}

function weightedAverage(entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  return entries.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / Math.max(0.0001, totalWeight);
}

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
  const centerX = (rotated[234].x + rotated[454].x) / 2;
  const topY = rotated[10].y;

  return {
    points: rotated.map((point) => ({
      x: (point.x - centerX) / width,
      y: (point.y - topY) / width,
      z: point.z / width
    })),
    rollDegrees: angle * 180 / Math.PI
  };
}

export function computeGeometryProfile(landmarks) {
  const normalized = normalizeLandmarks(landmarks);
  const p = normalized.points;
  const d = (a, b) => distance(p[a], p[b]);

  const faceHeight = d(10, 152);
  const leftEyeWidth = d(33, 133);
  const rightEyeWidth = d(362, 263);
  const eyeWidth = (leftEyeWidth + rightEyeWidth) / 2;
  const details = {
    faceAspect: faceHeight / Math.max(0.001, d(234, 454)),
    eyeGap: d(133, 362),
    eyeWidth,
    noseWidth: d(98, 327),
    mouthWidth: d(61, 291),
    noseLength: d(168, 2) / Math.max(0.001, faceHeight),
    lowerFace: d(2, 152) / Math.max(0.001, faceHeight),
    eyeLine: mean([p[33].y, p[133].y, p[362].y, p[263].y]) / Math.max(0.001, faceHeight)
  };

  const leftNoseSpan = Math.abs(landmarks[1].x - landmarks[234].x);
  const rightNoseSpan = Math.abs(landmarks[454].x - landmarks[1].x);
  details.yawProxy = Math.abs(leftNoseSpan - rightNoseSpan) / Math.max(0.0001, leftNoseSpan + rightNoseSpan);
  details.rollDegrees = normalized.rollDegrees;

  const features = RATIO_REFERENCES.map((reference) => {
    const value = details[reference.key];
    const z = Math.abs(value - reference.center) / reference.spread;
    return {
      ...reference,
      value,
      z,
      closeness: gaussianScore(value, reference.center, reference.spread, 5)
    };
  });

  const retained = [...features].sort((a, b) => a.z - b.z).slice(0, features.length - 1);
  const distanceSquared = retained.reduce((sum, feature) => sum + Math.min(9, feature.z * feature.z), 0);
  const typicalityPercentile = chiSquareSurvival(distanceSquared, retained.length) * 100;

  const symmetryPairs = [
    [33, 263], [133, 362], [70, 300], [105, 334], [159, 386], [145, 374],
    [98, 327], [61, 291], [78, 308], [234, 454], [93, 323], [132, 361],
    [172, 397], [136, 365], [58, 288], [127, 356]
  ];
  const symmetryErrors = symmetryPairs.map(([left, right]) => {
    const xError = Math.abs(p[left].x + p[right].x);
    const yError = Math.abs(p[left].y - p[right].y);
    return Math.hypot(xError, yError * 0.8);
  });
  const symmetryScore = inverseErrorScore(median(symmetryErrors), 0.008, 0.070, 12);

  const coordinationErrors = [
    Math.abs(leftEyeWidth - rightEyeWidth) / Math.max(0.001, eyeWidth),
    Math.abs(d(70, 159) - d(300, 386)) / Math.max(0.001, mean([d(70, 159), d(300, 386)])),
    Math.abs((p[98].x + p[327].x) / 2),
    Math.abs((p[61].x + p[291].x) / 2),
    Math.abs(p[152].x)
  ];
  const coordinationScore = inverseErrorScore(median(coordinationErrors), 0.012, 0.14, 12);

  const rawQuantileRating = ratingQuantile(typicalityPercentile / 100);
  const rating = clamp(DATASET_MEAN + (rawQuantileRating - DATASET_MEAN) * 0.72, 1.35, 4.55);

  return {
    rating,
    typicalityPercentile,
    symmetryScore,
    coordinationScore,
    distanceSquared,
    details,
    features: [...features].sort((a, b) => a.z - b.z),
    model: {
      name: 'geometry-typicality-v2',
      datasetMean: DATASET_MEAN,
      dimensions: retained.length
    }
  };
}

export function computeImageQuality(imageData, faceBox, geometry, blendshapes = {}, mirrorDelta = 0) {
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
    exposure: gaussianScore(brightness, 132, 52, 8),
    contrast: gaussianScore(contrast, 52, 30, 10),
    sharpness: gaussianScore(sharpness, 38, 21, 8),
    clipping: inverseErrorScore(clipping, 0.012, 0.18, 5),
    faceScale: gaussianScore(faceArea, 0.26, 0.13, 5),
    centering: inverseErrorScore(centerDistance, 0.03, 0.24, 5),
    roll: inverseErrorScore(roll, 2.0, 12, 5),
    frontal: inverseErrorScore(yawProxy, 0.025, 0.16, 5),
    expressionNeutrality: inverseErrorScore(expressionLoad, 0.06, 0.58, 8),
    mirrorStability: inverseErrorScore(mirrorDelta, 0.05, 0.38, 5)
  };

  const reliability = weightedAverage([
    { score: metrics.exposure, weight: 0.09 },
    { score: metrics.contrast, weight: 0.06 },
    { score: metrics.sharpness, weight: 0.17 },
    { score: metrics.clipping, weight: 0.07 },
    { score: metrics.faceScale, weight: 0.12 },
    { score: metrics.centering, weight: 0.08 },
    { score: metrics.roll, weight: 0.11 },
    { score: metrics.frontal, weight: 0.15 },
    { score: metrics.expressionNeutrality, weight: 0.05 },
    { score: metrics.mirrorStability, weight: 0.10 }
  ]);

  const presentationScore = weightedAverage([
    { score: metrics.exposure, weight: 0.20 },
    { score: metrics.contrast, weight: 0.12 },
    { score: metrics.sharpness, weight: 0.23 },
    { score: metrics.clipping, weight: 0.12 },
    { score: metrics.centering, weight: 0.14 },
    { score: metrics.roll, weight: 0.09 },
    { score: metrics.frontal, weight: 0.10 }
  ]);

  const issues = [];
  const checks = [
    ['sharpness', 55, 'Смазанный кадр', 'Зафиксируй телефон и дождись фокуса.'],
    ['exposure', 52, 'Плохой свет', 'Встань напротив мягкого света.'],
    ['clipping', 55, 'Потеря деталей', 'Убери яркий источник света из кадра.'],
    ['faceScale', 52, 'Неверная дистанция', 'Держи камеру примерно в 50–80 см от лица.'],
    ['centering', 52, 'Лицо смещено', 'Совмести лицо с контуром.'],
    ['roll', 58, 'Голова наклонена', 'Выровняй линию глаз.'],
    ['frontal', 58, 'Лицо повёрнуто', 'Смотри прямо в объектив.'],
    ['expressionNeutrality', 45, 'Сильное выражение', 'Расслабь рот и не щурься.'],
    ['mirrorStability', 48, 'Нестабильные ориентиры', 'Сделай более резкий фронтальный снимок.']
  ];

  for (const [key, threshold, title, fix] of checks) {
    if (metrics[key] < threshold) {
      issues.push({ key, title, fix, severity: metrics[key] < threshold - 18 ? 'high' : 'medium' });
    }
  }

  return {
    reliability,
    presentationScore,
    metrics,
    raw: { brightness, contrast, sharpness, clipping, faceArea, centerDistance, roll, yawProxy, expressionLoad, mirrorDelta },
    issues
  };
}

export function qualityGate(quality) {
  const hardFailure = quality.raw.roll > 14 || quality.raw.yawProxy > 0.19 || quality.raw.faceArea < 0.055 || quality.raw.mirrorDelta > 0.5;
  if (!hardFailure && quality.reliability >= 68) {
    return { pass: true, level: quality.reliability >= 82 ? 'good' : 'caution' };
  }
  return {
    pass: false,
    level: 'blocked',
    reason: quality.issues[0]?.title || 'Кадр недостаточно надёжен'
  };
}

export function createScanAssessment(geometry, quality) {
  const modelHalfWidth = 0.62;
  const qualityPenalty = clamp((82 - quality.reliability) * 0.008, 0, 0.30);
  const halfWidth = clamp(modelHalfWidth + qualityPenalty, 0.62, 0.95);
  const rating = clamp(geometry.rating, 1, 5);

  return {
    rating,
    interval: [clamp(rating - halfWidth, 1, 5), clamp(rating + halfWidth, 1, 5)],
    halfWidth,
    reliability: Math.round(quality.reliability),
    presentationScore: Math.round(quality.presentationScore),
    typicalityPercentile: Math.round(geometry.typicalityPercentile),
    symmetryScore: Math.round(geometry.symmetryScore),
    coordinationScore: Math.round(geometry.coordinationScore),
    strongest: geometry.features.slice(0, 2).map((feature) => feature.label),
    distinctive: [...geometry.features].sort((a, b) => b.z - a.z).slice(0, 2).map((feature) => feature.label),
    issues: quality.issues,
    model: geometry.model
  };
}

export function combineAssessments(scans) {
  if (!Array.isArray(scans) || scans.length === 0) throw new TypeError('At least one scan is required');
  const ratings = scans.map((scan) => scan.rating);
  const rating = median(ratings);
  const dispersion = mad(ratings) * 1.4826;
  const averageReliability = mean(scans.map((scan) => scan.reliability));
  const countBonus = scans.length >= 3 ? 0.14 : scans.length === 2 ? 0.07 : 0;
  const halfWidth = clamp(0.68 - countBonus + dispersion * 1.4 + Math.max(0, 78 - averageReliability) * 0.006, 0.46, 1.05);
  const consistency = clamp(100 - dispersion * 115, 0, 100);

  return {
    rating,
    interval: [clamp(rating - halfWidth, 1, 5), clamp(rating + halfWidth, 1, 5)],
    halfWidth,
    scanCount: scans.length,
    reliability: Math.round(averageReliability),
    consistency: Math.round(consistency),
    presentationScore: Math.round(mean(scans.map((scan) => scan.presentationScore))),
    typicalityPercentile: Math.round(median(scans.map((scan) => scan.typicalityPercentile))),
    symmetryScore: Math.round(median(scans.map((scan) => scan.symmetryScore))),
    coordinationScore: Math.round(median(scans.map((scan) => scan.coordinationScore))),
    strongest: scans.at(-1).strongest,
    distinctive: scans.at(-1).distinctive,
    issues: scans.flatMap((scan) => scan.issues).slice(0, 4)
  };
}

export function ratingLabel(rating) {
  if (rating < 2.3) return 'ниже средней';
  if (rating < 3.3) return 'около средней';
  if (rating < 3.9) return 'выше средней';
  return 'высокая';
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

export const __test = {
  clamp,
  mean,
  median,
  mad,
  distance,
  erf,
  normalCdf,
  chiSquareSurvival,
  ratingQuantile,
  gaussianScore,
  inverseErrorScore
};
