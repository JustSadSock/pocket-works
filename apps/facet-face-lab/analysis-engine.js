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
const degrees = (radians) => radians * 180 / Math.PI;

const RATIO_REFERENCES = [
  { key: 'faceAspect', label: 'Высота лица', zone: 'Контур', center: 1.40, spread: 0.105 },
  { key: 'eyeGap', label: 'Межглазное расстояние', zone: 'Глаза', center: 0.22, spread: 0.030 },
  { key: 'eyeWidth', label: 'Размер глаз', zone: 'Глаза', center: 0.18, spread: 0.022 },
  { key: 'noseWidth', label: 'Ширина носа', zone: 'Нос', center: 0.23, spread: 0.030 },
  { key: 'mouthWidth', label: 'Ширина рта', zone: 'Губы', center: 0.37, spread: 0.045 },
  { key: 'noseLength', label: 'Средняя треть', zone: 'Нос', center: 0.30, spread: 0.035 },
  { key: 'lowerFace', label: 'Нижняя треть', zone: 'Челюсть', center: 0.40, spread: 0.040 },
  { key: 'eyeLine', label: 'Положение глаз', zone: 'Контур', center: 0.40, spread: 0.032 }
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
function normalCdf(value) { return 0.5 * (1 + erf(value / Math.SQRT2)); }
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
function featureStatus(z, direction) {
  if (z < 0.65) return { level: 'typical', title: 'Близко к среднему диапазону' };
  if (z < 1.35) return { level: 'moderate', title: direction > 0 ? 'Умеренно больше среднего' : 'Умеренно меньше среднего' };
  return { level: 'distinctive', title: direction > 0 ? 'Выраженно больше среднего' : 'Выраженно меньше среднего' };
}
function trait(key, zone, label, description, confidence, value, evidence) {
  return {
    key, zone, label, description,
    confidence: Math.round(clamp(confidence, 52, 96)),
    value,
    evidence
  };
}
function closenessToThreshold(value, thresholds) {
  const distances = thresholds.map((threshold) => Math.abs(value - threshold));
  return clamp(62 + Math.min(...distances) * 170, 58, 92);
}

export function normalizeLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) throw new TypeError('Expected at least 468 face landmarks');
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  let angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  else if (angle < -Math.PI / 2) angle += Math.PI;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const origin = {
    x: (landmarks[234].x + landmarks[454].x) / 2,
    y: (landmarks[10].y + landmarks[152].y) / 2
  };
  const rotated = landmarks.map((point) => {
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    return { x: x * cos - y * sin, y: x * sin + y * cos, z: point.z || 0 };
  });
  const width = Math.max(0.0001, Math.abs(rotated[454].x - rotated[234].x));
  const centerX = (rotated[234].x + rotated[454].x) / 2;
  const topY = rotated[10].y;
  return {
    points: rotated.map((point) => ({ x: (point.x - centerX) / width, y: (point.y - topY) / width, z: point.z / width })),
    rollDegrees: degrees(angle)
  };
}

function classifyFaceShape(details) {
  const { faceAspect, foreheadWidth, jawWidth, chinWidth } = details;
  let label = 'Овальная';
  let description = 'Длина заметно больше ширины, контур сужается к подбородку без резких углов.';
  let evidence = `длина/ширина ${faceAspect.toFixed(2)}, челюсть ${(jawWidth * 100).toFixed(0)}% ширины скул`;
  let confidence = 72;

  if (faceAspect > 1.55) {
    label = 'Удлинённая';
    description = 'Вертикаль лица выражена сильнее, чем ширина; боковые линии относительно прямые.';
    confidence = closenessToThreshold(faceAspect, [1.55]);
  } else if (faceAspect < 1.34 && jawWidth > 0.82) {
    label = 'Округлая';
    description = 'Высота и ширина близки, нижний контур широкий и без сильного сужения.';
    confidence = mean([closenessToThreshold(faceAspect, [1.34]), closenessToThreshold(jawWidth, [0.82])]);
  } else if (faceAspect < 1.48 && jawWidth > 0.86 && foreheadWidth > 0.88) {
    label = 'Квадратная';
    description = 'Лоб, скулы и челюсть близки по ширине, нижний контур выражен.';
    confidence = mean([closenessToThreshold(jawWidth, [0.86]), closenessToThreshold(foreheadWidth, [0.88])]);
  } else if (foreheadWidth > 0.94 && jawWidth < 0.78 && chinWidth < 0.46) {
    label = 'Сердцевидная';
    description = 'Верхняя часть шире, а линия челюсти заметно сужается к подбородку.';
    confidence = mean([closenessToThreshold(foreheadWidth, [0.94]), closenessToThreshold(jawWidth, [0.78])]);
  } else if (foreheadWidth < 0.88 && jawWidth < 0.78 && faceAspect < 1.53) {
    label = 'Ромбовидная';
    description = 'Скулы шире лба и челюсти, контур сужается в обе стороны.';
    confidence = mean([closenessToThreshold(foreheadWidth, [0.88]), closenessToThreshold(jawWidth, [0.78])]);
  } else {
    confidence = clamp(78 - Math.abs(faceAspect - 1.42) * 55 - Math.abs(jawWidth - 0.79) * 30, 60, 88);
  }
  return trait('faceShape', 'outline', label, description, confidence, faceAspect, evidence);
}

function classifyEyeShape(details) {
  const value = details.eyeAspect;
  if (value > 0.38) {
    return trait('eyeShape', 'eyes', 'Округлые', 'Вертикальное раскрытие глаз относительно большое.', closenessToThreshold(value, [0.38]), value, `раскрытие/ширина ${value.toFixed(2)}`);
  }
  if (value < 0.27) {
    return trait('eyeShape', 'eyes', 'Узкие миндалевидные', 'Глаза вытянуты по горизонтали, вертикальное раскрытие небольшое.', closenessToThreshold(value, [0.27]), value, `раскрытие/ширина ${value.toFixed(2)}`);
  }
  return trait('eyeShape', 'eyes', 'Миндалевидные', 'Горизонтальная длина преобладает, раскрытие умеренное.', clamp(82 - Math.abs(value - 0.325) * 120, 62, 90), value, `раскрытие/ширина ${value.toFixed(2)}`);
}

function classifyEyeTilt(details) {
  const value = details.eyeTiltDegrees;
  if (value > 3.2) return trait('eyeTilt', 'eyes', 'Восходящий наклон', 'Внешние уголки расположены немного выше внутренних.', closenessToThreshold(value, [3.2]), value, `${value.toFixed(1)}° вверх`);
  if (value < -3.2) return trait('eyeTilt', 'eyes', 'Нисходящий наклон', 'Внешние уголки расположены немного ниже внутренних.', closenessToThreshold(value, [-3.2]), value, `${Math.abs(value).toFixed(1)}° вниз`);
  return trait('eyeTilt', 'eyes', 'Нейтральный наклон', 'Внутренние и внешние уголки находятся почти на одной линии.', clamp(88 - Math.abs(value) * 6, 62, 90), value, `${value.toFixed(1)}°`);
}

function classifyBrows(details) {
  const value = details.browArch;
  if (value > 0.22) return trait('brows', 'brows', 'Выраженная дуга', 'Пик брови заметно выше линии её концов.', closenessToThreshold(value, [0.22]), value, `индекс дуги ${value.toFixed(2)}`);
  if (value > 0.10) return trait('brows', 'brows', 'Мягкая дуга', 'Изгиб заметен, но остаётся плавным.', clamp(84 - Math.abs(value - 0.16) * 170, 62, 90), value, `индекс дуги ${value.toFixed(2)}`);
  return trait('brows', 'brows', 'Прямые', 'Высота брови меняется мало по её длине.', closenessToThreshold(value, [0.10]), value, `индекс дуги ${value.toFixed(2)}`);
}

function classifyNose(details) {
  const width = details.noseWidth;
  const length = details.noseLength;
  const widthLabel = width < 0.205 ? 'узкий' : width > 0.255 ? 'широкий' : 'средней ширины';
  const lengthLabel = length < 0.27 ? 'короткий' : length > 0.335 ? 'удлинённый' : 'средней длины';
  const label = `${widthLabel[0].toUpperCase()}${widthLabel.slice(1)}, ${lengthLabel}`;
  return trait(
    'nose',
    'nose',
    label,
    `Ширина и длина носа описаны относительно ширины и высоты лица.`,
    mean([closenessToThreshold(width, [0.205, 0.255]), closenessToThreshold(length, [0.27, 0.335])]),
    width,
    `ширина ${(width * 100).toFixed(0)}%, длина ${(length * 100).toFixed(0)}%`
  );
}

function classifyLips(details) {
  const fullness = details.lipFullness;
  const width = details.mouthWidth;
  const fullnessLabel = fullness < 0.16 ? 'тонкие' : fullness > 0.27 ? 'полные' : 'средней полноты';
  const widthLabel = width < 0.33 ? 'компактные' : width > 0.42 ? 'широкие' : 'средней ширины';
  return trait(
    'lips',
    'lips',
    `${fullnessLabel[0].toUpperCase()}${fullnessLabel.slice(1)}, ${widthLabel}`,
    'Полнота оценивается по высоте губ относительно ширины рта.',
    mean([closenessToThreshold(fullness, [0.16, 0.27]), closenessToThreshold(width, [0.33, 0.42])]),
    fullness,
    `полнота ${fullness.toFixed(2)}, ширина ${(width * 100).toFixed(0)}%`
  );
}

function classifyJaw(details) {
  const jaw = details.jawWidth;
  const chin = details.chinWidth / Math.max(0.001, jaw);
  if (jaw > 0.86) return trait('jaw', 'jaw', 'Широкая, выраженная', 'Линия нижней челюсти сохраняет значительную ширину относительно скул.', closenessToThreshold(jaw, [0.86]), jaw, `челюсть ${(jaw * 100).toFixed(0)}% ширины скул`);
  if (jaw < 0.74 || chin < 0.48) return trait('jaw', 'jaw', 'Сужающаяся', 'Контур заметно сходит к более узкому подбородку.', mean([closenessToThreshold(jaw, [0.74]), closenessToThreshold(chin, [0.48])]), jaw, `челюсть ${(jaw * 100).toFixed(0)}%, подбородок ${(chin * 100).toFixed(0)}% челюсти`);
  return trait('jaw', 'jaw', 'Мягко очерченная', 'Челюсть умеренно сужается без резкого угла.', clamp(84 - Math.abs(jaw - 0.80) * 170, 62, 90), jaw, `челюсть ${(jaw * 100).toFixed(0)}% ширины скул`);
}

function buildVisualProfile(points) {
  const paths = {
    outline: [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10],
    leftEye: [33,160,158,133,153,144,33],
    rightEye: [263,387,385,362,380,373,263],
    leftBrow: [70,63,105,66,107],
    rightBrow: [300,293,334,296,336],
    nose: [168,6,197,195,5,4,1,2,98,97,2,326,327],
    lips: [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78,61],
    jaw: [234,93,132,58,172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323,454]
  };
  const outline = paths.outline.map((index) => points[index]);
  const minX = Math.min(...outline.map((point) => point.x));
  const maxX = Math.max(...outline.map((point) => point.x));
  const minY = Math.min(...outline.map((point) => point.y));
  const maxY = Math.max(...outline.map((point) => point.y));
  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(0.001, maxY - minY);
  const mapPoint = (point) => ({
    x: clamp((point.x - minX) / width, 0, 1),
    y: clamp((point.y - minY) / height, 0, 1)
  });
  return {
    paths: Object.fromEntries(Object.entries(paths).map(([key, indexes]) => [key, indexes.map((index) => mapPoint(points[index]))])),
    guides: {
      eyeY: mean([points[33].y, points[133].y, points[362].y, points[263].y]),
      noseY: points[2].y,
      mouthY: mean([points[13].y, points[14].y]),
      minY,
      height
    }
  };
}

function regionScores(features, details) {
  const byKey = Object.fromEntries(features.map((feature) => [feature.key, feature.closeness]));
  return {
    outline: Math.round(mean([byKey.faceAspect, byKey.eyeLine, byKey.lowerFace])),
    eyes: Math.round(mean([byKey.eyeGap, byKey.eyeWidth, gaussianScore(details.eyeAspect, 0.325, 0.09, 18)])),
    nose: Math.round(mean([byKey.noseWidth, byKey.noseLength])),
    lips: Math.round(mean([byKey.mouthWidth, gaussianScore(details.lipFullness, 0.215, 0.10, 18)])),
    jaw: Math.round(mean([byKey.lowerFace, gaussianScore(details.jawWidth, 0.80, 0.13, 18)]))
  };
}

export function computeGeometryProfile(landmarks) {
  const normalized = normalizeLandmarks(landmarks);
  const p = normalized.points;
  const d = (a, b) => distance(p[a], p[b]);
  const faceHeight = d(10, 152);
  const cheekWidth = d(234, 454);
  const leftEyeWidth = d(33, 133);
  const rightEyeWidth = d(362, 263);
  const eyeWidth = (leftEyeWidth + rightEyeWidth) / 2;
  const leftEyeOpening = d(159, 145);
  const rightEyeOpening = d(386, 374);
  const leftTilt = degrees(Math.atan2(p[133].y - p[33].y, Math.abs(p[133].x - p[33].x)));
  const rightTilt = degrees(Math.atan2(p[362].y - p[263].y, Math.abs(p[362].x - p[263].x)));
  const leftArch = (mean([p[70].y, p[107].y]) - p[105].y) / Math.max(0.001, leftEyeWidth);
  const rightArch = (mean([p[300].y, p[336].y]) - p[334].y) / Math.max(0.001, rightEyeWidth);
  const details = {
    faceAspect: faceHeight / Math.max(0.001, cheekWidth),
    eyeGap: d(133, 362),
    eyeWidth,
    noseWidth: d(98, 327),
    mouthWidth: d(61, 291),
    noseLength: d(168, 2) / Math.max(0.001, faceHeight),
    lowerFace: d(2, 152) / Math.max(0.001, faceHeight),
    eyeLine: mean([p[33].y, p[133].y, p[362].y, p[263].y]) / Math.max(0.001, faceHeight),
    foreheadWidth: d(103, 332) / Math.max(0.001, cheekWidth),
    cheekWidth: 1,
    jawWidth: d(172, 397) / Math.max(0.001, cheekWidth),
    chinWidth: d(149, 378) / Math.max(0.001, cheekWidth),
    eyeAspect: mean([leftEyeOpening / Math.max(0.001, leftEyeWidth), rightEyeOpening / Math.max(0.001, rightEyeWidth)]),
    eyeTiltDegrees: mean([leftTilt, rightTilt]),
    browArch: mean([leftArch, rightArch]),
    lipFullness: d(13, 14) / Math.max(0.001, d(61, 291)),
    mouthAspect: d(13, 14) / Math.max(0.001, d(61, 291))
  };
  const leftNoseSpan = Math.abs(landmarks[1].x - landmarks[234].x);
  const rightNoseSpan = Math.abs(landmarks[454].x - landmarks[1].x);
  details.yawProxy = Math.abs(leftNoseSpan - rightNoseSpan) / Math.max(0.0001, leftNoseSpan + rightNoseSpan);
  details.rollDegrees = normalized.rollDegrees;

  const features = RATIO_REFERENCES.map((reference) => {
    const value = details[reference.key];
    const signedZ = (value - reference.center) / reference.spread;
    const z = Math.abs(signedZ);
    const status = featureStatus(z, Math.sign(signedZ));
    return { ...reference, value, signedZ, z, closeness: gaussianScore(value, reference.center, reference.spread, 5), ...status };
  });
  const retained = [...features].sort((a, b) => a.z - b.z).slice(0, features.length - 1);
  const distanceSquared = retained.reduce((sum, feature) => sum + Math.min(9, feature.z * feature.z), 0);
  const typicalityPercentile = chiSquareSurvival(distanceSquared, retained.length) * 100;

  const symmetryPairs = [
    [33,263],[133,362],[70,300],[105,334],[159,386],[145,374],
    [98,327],[61,291],[78,308],[234,454],[93,323],[132,361],
    [172,397],[136,365],[58,288],[127,356]
  ];
  const symmetryErrors = symmetryPairs.map(([left, right]) => {
    const xError = Math.abs(p[left].x + p[right].x);
    const yError = Math.abs(p[left].y - p[right].y);
    return Math.hypot(xError, yError * 0.8);
  });
  const symmetryScore = inverseErrorScore(median(symmetryErrors), 0.008, 0.070, 12);
  const coordinationErrors = [
    Math.abs(leftEyeWidth - rightEyeWidth) / Math.max(0.001, eyeWidth),
    Math.abs(d(70,159) - d(300,386)) / Math.max(0.001, mean([d(70,159), d(300,386)])),
    Math.abs((p[98].x + p[327].x) / 2),
    Math.abs((p[61].x + p[291].x) / 2),
    Math.abs(p[152].x)
  ];
  const coordinationScore = inverseErrorScore(median(coordinationErrors), 0.012, 0.14, 12);
  const rawQuantileRating = ratingQuantile(typicalityPercentile / 100);
  const rating = clamp(DATASET_MEAN + (rawQuantileRating - DATASET_MEAN) * 0.72, 1.35, 4.55);
  const traits = [
    classifyFaceShape(details),
    classifyEyeShape(details),
    classifyEyeTilt(details),
    classifyBrows(details),
    classifyNose(details),
    classifyLips(details),
    classifyJaw(details)
  ];
  return {
    rating,
    typicalityPercentile,
    symmetryScore,
    coordinationScore,
    distanceSquared,
    details,
    features: [...features].sort((a, b) => a.z - b.z),
    traits,
    regionScores: regionScores(features, details),
    visualProfile: buildVisualProfile(p),
    model: { name: 'geometry-typicality-v4', datasetMean: DATASET_MEAN, dimensions: retained.length }
  };
}

function samplePatch(imageData, point, radiusPx) {
  const { data, width, height } = imageData;
  const cx = clamp(Math.round(point.x * width), 0, width - 1);
  const cy = clamp(Math.round(point.y * height), 0, height - 1);
  const radius = Math.max(2, Math.round(radiusPx));
  let count = 0;
  let sum = 0;
  let squares = 0;
  let edgeSum = 0;
  const gray = (x, y) => {
    const i = (clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)) * 4;
    return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  };
  for (let y = cy - radius; y <= cy + radius; y += 2) {
    for (let x = cx - radius; x <= cx + radius; x += 2) {
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
      const g = gray(x, y);
      count += 1;
      sum += g;
      squares += g * g;
      edgeSum += Math.abs(gray(x + 1, y) - gray(x - 1, y)) + Math.abs(gray(x, y + 1) - gray(x, y - 1));
    }
  }
  const luminance = sum / Math.max(1, count);
  const variance = Math.max(0, squares / Math.max(1, count) - luminance * luminance);
  return { luminance, texture: Math.sqrt(variance), edge: edgeSum / Math.max(1, count) };
}
function midpoint(a, b, t = 0.5) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
export function estimateOcclusion(imageData, landmarks = []) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) return { risk: 0, score: 100, signals: [] };
  const faceWidthPx = Math.abs(landmarks[454].x - landmarks[234].x) * imageData.width;
  const radius = clamp(faceWidthPx * 0.035, 4, 18);
  const pairs = [[103,332,'лоб'],[127,356,'виски'],[117,346,'щёки']];
  const patchPairs = pairs.map(([left, right, label]) => ({
    label, left: samplePatch(imageData, landmarks[left], radius), right: samplePatch(imageData, landmarks[right], radius)
  }));
  const upper = patchPairs.slice(0, 2);
  const lower = patchPairs[2];
  const asymmetry = (pair) => (
    Math.abs(pair.left.luminance - pair.right.luminance) / 62 +
    Math.abs(pair.left.texture - pair.right.texture) / 30 +
    Math.abs(pair.left.edge - pair.right.edge) / 28
  ) / 3;
  const upperAsymmetry = mean(upper.map(asymmetry));
  const lowerAsymmetry = asymmetry(lower);
  const foreheadPoint = midpoint(landmarks[10], landmarks[168], 0.58);
  const forehead = samplePatch(imageData, foreheadPoint, radius * 1.15);
  const cheekTexture = mean([lower.left.texture, lower.right.texture]);
  const cheekEdge = mean([lower.left.edge, lower.right.edge]);
  const centerTextureExcess = Math.max(0, (forehead.texture - cheekTexture * 1.55) / 32);
  const centerEdgeExcess = Math.max(0, (forehead.edge - cheekEdge * 1.5) / 28);
  const risk = clamp((upperAsymmetry - lowerAsymmetry * 0.42) * 115 + centerTextureExcess * 36 + centerEdgeExcess * 28, 0, 100);
  const signals = [];
  if (upperAsymmetry > 0.55) signals.push('асимметрия верхней части лица');
  if (centerTextureExcess + centerEdgeExcess > 0.65) signals.push('неоднородность области лба');
  return { risk, score: 100 - risk, signals, patches: { upperAsymmetry, lowerAsymmetry, centerTextureExcess, centerEdgeExcess } };
}

export function computeImageQuality(imageData, faceBox, geometry, blendshapes = {}, mirrorDelta = 0, landmarks = []) {
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
  const occlusion = estimateOcclusion(imageData, landmarks);
  const metrics = {
    exposure: gaussianScore(brightness, 132, 52, 8),
    contrast: gaussianScore(contrast, 52, 30, 10),
    sharpness: gaussianScore(sharpness, 38, 21, 8),
    clipping: inverseErrorScore(clipping, 0.012, 0.18, 5),
    faceScale: gaussianScore(faceArea, 0.22, 0.15, 5),
    centering: inverseErrorScore(centerDistance, 0.03, 0.28, 5),
    roll: inverseErrorScore(roll, 2.0, 12, 5),
    frontal: inverseErrorScore(yawProxy, 0.025, 0.16, 5),
    expressionNeutrality: inverseErrorScore(expressionLoad, 0.06, 0.58, 8),
    mirrorStability: inverseErrorScore(mirrorDelta, 0.05, 0.38, 5),
    occlusion: occlusion.score
  };
  const reliability = weightedAverage([
    { score: metrics.exposure, weight: 0.08 }, { score: metrics.contrast, weight: 0.05 },
    { score: metrics.sharpness, weight: 0.16 }, { score: metrics.clipping, weight: 0.06 },
    { score: metrics.faceScale, weight: 0.10 }, { score: metrics.centering, weight: 0.07 },
    { score: metrics.roll, weight: 0.10 }, { score: metrics.frontal, weight: 0.14 },
    { score: metrics.expressionNeutrality, weight: 0.05 }, { score: metrics.mirrorStability, weight: 0.08 },
    { score: metrics.occlusion, weight: 0.11 }
  ]);
  const presentationScore = weightedAverage([
    { score: metrics.exposure, weight: 0.18 }, { score: metrics.contrast, weight: 0.10 },
    { score: metrics.sharpness, weight: 0.22 }, { score: metrics.clipping, weight: 0.10 },
    { score: metrics.centering, weight: 0.12 }, { score: metrics.roll, weight: 0.08 },
    { score: metrics.frontal, weight: 0.10 }, { score: metrics.occlusion, weight: 0.10 }
  ]);
  const issues = [];
  const checks = [
    ['sharpness',55,'Смазанный кадр','Зафиксируй телефон и дождись фокуса.'],
    ['exposure',52,'Плохой свет','Встань напротив мягкого света.'],
    ['clipping',55,'Потеря деталей','Убери яркий источник света из кадра.'],
    ['faceScale',48,'Неверная дистанция','Отодвинь телефон так, чтобы в кадре были волосы, подбородок и немного плеч.'],
    ['centering',48,'Лицо смещено','Совмести лицо с контуром.'],
    ['roll',58,'Голова наклонена','Выровняй линию глаз.'],
    ['frontal',58,'Лицо повёрнуто','Смотри прямо в объектив.'],
    ['expressionNeutrality',45,'Сильное выражение','Расслабь рот и не щурься.'],
    ['mirrorStability',48,'Нестабильные ориентиры','Сделай более резкий фронтальный снимок.'],
    ['occlusion',52,'Часть лица перекрыта','Убери волосы или предметы с лба, глаз и контуров лица.']
  ];
  for (const [key, threshold, title, fix] of checks) {
    if (metrics[key] < threshold) issues.push({ key, title, fix, severity: metrics[key] < threshold - 18 ? 'high' : 'medium' });
  }
  return {
    reliability,
    presentationScore,
    metrics,
    raw: { brightness, contrast, sharpness, clipping, faceArea, centerDistance, roll, yawProxy, expressionLoad, mirrorDelta, occlusionRisk: occlusion.risk },
    occlusion,
    issues
  };
}
export function qualityGate(quality) {
  const hardFailure = quality.raw.roll > 14 || quality.raw.yawProxy > 0.19 || quality.raw.faceArea < 0.045 || quality.raw.mirrorDelta > 0.5 || quality.raw.occlusionRisk > 78;
  if (!hardFailure && quality.reliability >= 65) return { pass: true, level: quality.reliability >= 82 ? 'good' : 'caution' };
  return { pass: false, level: 'blocked', reason: quality.issues[0]?.title || 'Кадр недостаточно надёжен' };
}
export function createScanAssessment(geometry, quality) {
  const occlusionFactor = clamp(1 - quality.raw.occlusionRisk / 220, 0.65, 1);
  const rating = clamp(DATASET_MEAN + (geometry.rating - DATASET_MEAN) * occlusionFactor, 1, 5);
  const modelHalfWidth = 0.62;
  const qualityPenalty = clamp((82 - quality.reliability) * 0.008, 0, 0.30);
  const occlusionPenalty = clamp(quality.raw.occlusionRisk * 0.0035, 0, 0.28);
  const halfWidth = clamp(modelHalfWidth + qualityPenalty + occlusionPenalty, 0.62, 1.15);
  return {
    rating,
    interval: [clamp(rating - halfWidth, 1, 5), clamp(rating + halfWidth, 1, 5)],
    halfWidth,
    reliability: Math.round(quality.reliability),
    presentationScore: Math.round(quality.presentationScore),
    typicalityPercentile: Math.round(geometry.typicalityPercentile),
    symmetryScore: Math.round(geometry.symmetryScore),
    coordinationScore: Math.round(geometry.coordinationScore),
    occlusionScore: Math.round(quality.metrics.occlusion),
    strongest: geometry.features.slice(0, 2).map((feature) => feature.label),
    distinctive: [...geometry.features].sort((a, b) => b.z - a.z).slice(0, 2).map((feature) => feature.label),
    featureDetails: geometry.features.map((feature) => ({
      key: feature.key, label: feature.label, zone: feature.zone, value: feature.value, center: feature.center,
      spread: feature.spread, z: feature.z, signedZ: feature.signedZ, level: feature.level, title: feature.title,
      confidence: feature.key === 'faceAspect' || feature.key === 'eyeLine' ? Math.round(quality.metrics.occlusion) : 100
    })),
    traits: geometry.traits.map((item) => ({
      ...item,
      confidence: Math.round(item.confidence * (item.zone === 'outline' ? quality.metrics.occlusion / 100 : 1))
    })),
    regionScores: geometry.regionScores,
    visualProfile: geometry.visualProfile,
    issues: quality.issues,
    model: geometry.model
  };
}
function aggregateFeatureDetails(scans) {
  const keys = scans[0]?.featureDetails?.map((item) => item.key) || [];
  return keys.map((key) => {
    const values = scans.map((scan) => scan.featureDetails.find((item) => item.key === key)).filter(Boolean);
    const base = values[0];
    const signedZ = median(values.map((item) => item.signedZ));
    const z = Math.abs(signedZ);
    const status = featureStatus(z, Math.sign(signedZ));
    return {
      ...base,
      value: median(values.map((item) => item.value)),
      signedZ, z, ...status,
      confidence: Math.round(mean(values.map((item) => item.confidence || 100)))
    };
  }).sort((a, b) => a.zone.localeCompare(b.zone) || a.z - b.z);
}
function aggregateTraits(scans) {
  const keys = scans[0]?.traits?.map((item) => item.key) || [];
  return keys.map((key) => {
    const candidates = scans.map((scan) => scan.traits.find((item) => item.key === key)).filter(Boolean);
    const counts = new Map();
    for (const item of candidates) counts.set(item.label, (counts.get(item.label) || 0) + 1);
    const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const chosen = candidates.filter((item) => item.label === winner);
    const base = chosen[0] || candidates[0];
    return {
      ...base,
      confidence: Math.round(mean(chosen.map((item) => item.confidence))),
      stability: Math.round((chosen.length / Math.max(1, candidates.length)) * 100)
    };
  });
}
export function combineAssessments(scans) {
  if (!Array.isArray(scans) || scans.length === 0) throw new TypeError('At least one scan is required');
  const ratings = scans.map((scan) => scan.rating);
  const rating = median(ratings);
  const dispersion = mad(ratings) * 1.4826;
  const averageReliability = mean(scans.map((scan) => scan.reliability));
  const countBonus = scans.length >= 3 ? 0.16 : scans.length === 2 ? 0.08 : 0;
  const halfWidth = clamp(0.72 - countBonus + dispersion * 1.4 + Math.max(0, 78 - averageReliability) * 0.006, 0.46, 1.12);
  const consistency = clamp(100 - dispersion * 115, 0, 100);
  const bestVisual = [...scans].sort((a, b) => b.reliability - a.reliability)[0];
  const scoreKeys = ['outline','eyes','nose','lips','jaw'];
  const combinedRegions = Object.fromEntries(scoreKeys.map((key) => [key, Math.round(median(scans.map((scan) => scan.regionScores[key])))]));
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
    occlusionScore: Math.round(median(scans.map((scan) => scan.occlusionScore))),
    strongest: scans.at(-1).strongest,
    distinctive: scans.at(-1).distinctive,
    featureDetails: aggregateFeatureDetails(scans),
    traits: aggregateTraits(scans),
    regionScores: combinedRegions,
    visualProfile: bestVisual.visualProfile,
    issues: scans.flatMap((scan) => scan.issues).slice(0, 6)
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
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
export function blendshapeMap(categories = []) { return Object.fromEntries(categories.map((category) => [category.categoryName, category.score])); }
export const __test = {
  clamp, mean, median, mad, distance, erf, normalCdf, chiSquareSurvival, ratingQuantile,
  gaussianScore, inverseErrorScore, featureStatus, classifyFaceShape, classifyEyeShape,
  classifyEyeTilt, classifyBrows, classifyNose, classifyLips, classifyJaw
};
