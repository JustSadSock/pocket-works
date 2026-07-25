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
const gaussian = (error, sigma = 1) => Math.exp(-0.5 * (error / Math.max(0.0001, sigma)) ** 2);
const scoreFromError = (error, sigma = 1, floor = 8) => clamp(floor + (100 - floor) * gaussian(error, sigma));

const EYE_LEFT = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_RIGHT = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const LIP_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const LOWER_FACE = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];
const LEFT_BROW_UPPER = [70, 63, 105, 66, 107];
const LEFT_BROW_LOWER = [46, 53, 52, 65, 55];
const RIGHT_BROW_UPPER = [300, 293, 334, 296, 336];
const RIGHT_BROW_LOWER = [276, 283, 282, 295, 285];

const FEATURE_DEFINITIONS = [
  { key: 'faceAspect', label: 'Длина лица', zone: 'Контур', center: 1.43, spread: 0.13 },
  { key: 'cheekProminence', label: 'Выраженность скул', zone: 'Скулы', center: 1.08, spread: 0.10 },
  { key: 'jawTaper', label: 'Ширина челюсти', zone: 'Челюсть', center: 0.79, spread: 0.09 },
  { key: 'chinDefinition', label: 'Форма подбородка', zone: 'Челюсть', center: 0.49, spread: 0.09 },
  { key: 'eyeSize', label: 'Размер глаз', zone: 'Глаза', center: 0.030, spread: 0.0075 },
  { key: 'eyeAspect', label: 'Раскрытие глаз', zone: 'Глаза', center: 0.315, spread: 0.065 },
  { key: 'eyeTilt', label: 'Наклон глаз', zone: 'Глаза', center: 1.8, spread: 4.5 },
  { key: 'eyeSpacing', label: 'Посадка глаз', zone: 'Глаза', center: 1.03, spread: 0.18 },
  { key: 'browThickness', label: 'Толщина бровей', zone: 'Брови', center: 0.115, spread: 0.036 },
  { key: 'browArch', label: 'Изгиб бровей', zone: 'Брови', center: 0.145, spread: 0.065 },
  { key: 'noseWidth', label: 'Ширина носа', zone: 'Нос', center: 0.225, spread: 0.034 },
  { key: 'noseLength', label: 'Длина носа', zone: 'Нос', center: 0.305, spread: 0.044 },
  { key: 'noseBalance', label: 'Баланс кончика носа', zone: 'Нос', center: 0.0, spread: 0.025 },
  { key: 'lipFullness', label: 'Полнота губ', zone: 'Губы', center: 0.215, spread: 0.075 },
  { key: 'mouthWidth', label: 'Ширина рта', zone: 'Губы', center: 0.375, spread: 0.055 }
];

const CONFIGURATION_FAMILIES = [
  { key: 'balanced', label: 'Сбалансированная', description: 'Мягкий общий ритм без одной доминирующей зоны.', vector: { faceAspect: 0, cheekProminence: 0, jawTaper: 0, chinDefinition: 0, eyeSize: 0, eyeAspect: 0, eyeTilt: 0, eyeSpacing: 0, browThickness: 0, browArch: 0, noseWidth: 0, noseLength: 0, lipFullness: 0, mouthWidth: 0 } },
  { key: 'angular', label: 'Угловатая выразительная', description: 'Скулы, челюсть и брови образуют более графичный каркас.', vector: { faceAspect: 0.25, cheekProminence: 0.65, jawTaper: 0.65, chinDefinition: 0.45, eyeSize: -0.18, eyeAspect: -0.20, eyeTilt: 0.15, eyeSpacing: -0.05, browThickness: 0.70, browArch: -0.25, noseWidth: 0.15, noseLength: 0.25, lipFullness: -0.10, mouthWidth: 0.15 } },
  { key: 'soft', label: 'Мягкая открытая', description: 'Более открытые глаза и плавное сужение нижней части лица.', vector: { faceAspect: -0.45, cheekProminence: 0.05, jawTaper: -0.55, chinDefinition: -0.25, eyeSize: 0.55, eyeAspect: 0.55, eyeTilt: 0.0, eyeSpacing: 0.20, browThickness: -0.30, browArch: 0.20, noseWidth: -0.20, noseLength: -0.30, lipFullness: 0.40, mouthWidth: 0.0 } },
  { key: 'elongated', label: 'Удлинённая собранная', description: 'Вертикальные линии лица поддержаны более длинной средней третью.', vector: { faceAspect: 0.85, cheekProminence: 0.20, jawTaper: -0.15, chinDefinition: 0.20, eyeSize: -0.10, eyeAspect: -0.10, eyeTilt: 0.15, eyeSpacing: -0.10, browThickness: 0.0, browArch: 0.35, noseWidth: -0.15, noseLength: 0.65, lipFullness: 0.0, mouthWidth: -0.10 } },
  { key: 'cheekLed', label: 'Скуловая', description: 'Скулы ведут композицию, а челюсть и подбородок заметно сужаются.', vector: { faceAspect: 0.10, cheekProminence: 0.85, jawTaper: -0.70, chinDefinition: -0.40, eyeSize: 0.35, eyeAspect: 0.15, eyeTilt: 0.40, eyeSpacing: 0.10, browThickness: -0.05, browArch: 0.35, noseWidth: -0.15, noseLength: 0.05, lipFullness: 0.25, mouthWidth: 0.05 } },
  { key: 'compactContrast', label: 'Компактная контрастная', description: 'Более компактная вертикаль сочетается с сильнее очерченными бровями и ртом.', vector: { faceAspect: -0.40, cheekProminence: 0.35, jawTaper: 0.20, chinDefinition: 0.10, eyeSize: 0.20, eyeAspect: -0.10, eyeTilt: 0.25, eyeSpacing: -0.20, browThickness: 0.55, browArch: -0.20, noseWidth: 0.10, noseLength: -0.40, lipFullness: 0.20, mouthWidth: 0.45 } }
];

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function angleAt(a, vertex, b) {
  const first = { x: a.x - vertex.x, y: a.y - vertex.y };
  const second = { x: b.x - vertex.x, y: b.y - vertex.y };
  const dot = first.x * second.x + first.y * second.y;
  const length = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  return degrees(Math.acos(clamp(dot / Math.max(0.0001, length), -1, 1)));
}

function normalizeLandmarks(landmarks, imageAspect = 1) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) throw new TypeError('Expected at least 468 face landmarks');
  const scaled = landmarks.map((point) => ({ x: point.x * imageAspect, y: point.y, z: (point.z || 0) * imageAspect }));
  const leftEye = scaled[33];
  const rightEye = scaled[263];
  let angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  else if (angle < -Math.PI / 2) angle += Math.PI;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const origin = { x: (scaled[234].x + scaled[454].x) / 2, y: (scaled[10].y + scaled[152].y) / 2 };
  const rotated = scaled.map((point) => {
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    return { x: x * cos - y * sin, y: x * sin + y * cos, z: point.z };
  });
  const width = Math.max(0.0001, Math.abs(rotated[454].x - rotated[234].x));
  const centerX = (rotated[234].x + rotated[454].x) / 2;
  const topY = rotated[10].y;
  return { points: rotated.map((point) => ({ x: (point.x - centerX) / width, y: (point.y - topY) / width, z: point.z / width })), rollDegrees: degrees(angle) };
}

function featureStatus(z, signedZ) {
  if (z < 0.55) return { level: 'typical', title: 'В центральной части распределения' };
  if (z < 1.25) return { level: 'moderate', title: signedZ > 0 ? 'Умеренно выражено' : 'Умеренно компактно' };
  return { level: 'distinctive', title: signedZ > 0 ? 'Выраженная особенность' : 'Выраженная компактность' };
}

function featureFromDefinition(definition, value, confidence = 92) {
  const signedZ = (value - definition.center) / Math.max(0.0001, definition.spread);
  const z = Math.abs(signedZ);
  return { ...definition, value, signedZ, z, closeness: scoreFromError(z, 1.25, 18), confidence: Math.round(clamp(confidence, 35, 98)), ...featureStatus(z, signedZ) };
}

function trait(key, zone, label, description, confidence, value, evidence) {
  return { key, zone, label, description, confidence: Math.round(clamp(confidence, 42, 97)), value, evidence };
}

function classifyBand(value, thresholds, labels) {
  if (value < thresholds[0]) return labels[0];
  if (value > thresholds[1]) return labels[2];
  return labels[1];
}

function confidenceFromBoundary(value, boundaries, base = 82) {
  const nearest = Math.min(...boundaries.map((boundary) => Math.abs(value - boundary)));
  return clamp(base - Math.max(0, 0.08 - nearest) * 180, 50, 94);
}

function buildTraits(details, featureMap) {
  const faceShape = (() => {
    const aspect = details.faceAspect;
    const cheek = details.cheekProminence;
    const jaw = details.jawTaper;
    if (aspect > 1.57) return ['Удлинённая', 'Вертикаль лица заметно сильнее ширины.', [1.57]];
    if (jaw > 0.86 && aspect < 1.49) return ['Квадратно-овальная', 'Широкая нижняя часть сочетается с умеренной длиной.', [0.86, 1.49]];
    if (cheek > 1.17 && jaw < 0.75) return ['Скуловая / ромбовидная', 'Наибольшая ширина приходится на скулы, ниже контур сужается.', [1.17, 0.75]];
    if (aspect < 1.34 && jaw > 0.78) return ['Округлая', 'Высота и ширина ближе друг к другу, нижний контур остаётся широким.', [1.34, 0.78]];
    if (jaw < 0.72) return ['Овально-сердцевидная', 'Контур плавно сужается от скул к подбородку.', [0.72]];
    return ['Овальная', 'Длина умеренно преобладает над шириной, контур сужается плавно.', [1.43, 0.79]];
  })();
  const eyeShape = details.eyeAspect > 0.38 ? 'Округлые' : details.eyeAspect < 0.25 ? 'Узкие миндалевидные' : 'Миндалевидные';
  const tiltLabel = details.eyeTilt > 4 ? 'Восходящий наклон' : details.eyeTilt < -3 ? 'Нисходящий наклон' : 'Почти нейтральный наклон';
  const browThicknessLabel = classifyBand(details.browThickness, [0.085, 0.145], ['Тонкие', 'Средней толщины', 'Густые']);
  const browArchLabel = classifyBand(details.browArch, [0.08, 0.21], ['Прямые', 'Мягкая дуга', 'Выраженная дуга']);
  const noseWidthLabel = classifyBand(details.noseWidth, [0.20, 0.255], ['Узкий', 'Средней ширины', 'Широкий']);
  const noseLengthLabel = classifyBand(details.noseLength, [0.27, 0.345], ['Короткий', 'Средней длины', 'Удлинённый']);
  const lipLabel = classifyBand(details.lipFullness, [0.15, 0.285], ['Тонкие', 'Средней полноты', 'Полные']);
  const mouthLabel = classifyBand(details.mouthWidth, [0.33, 0.425], ['Компактный рот', 'Средняя ширина', 'Широкий рот']);
  return [
    trait('faceShape', 'outline', faceShape[0], faceShape[1], confidenceFromBoundary(details.faceAspect, faceShape[2]), details.faceAspect, `длина/ширина ${details.faceAspect.toFixed(2)}`),
    trait('cheekbones', 'cheeks', classifyBand(details.cheekProminence, [1.01, 1.16], ['Мягкие', 'Умеренные', 'Выраженные']), 'Оценивается сочетание ширины скул, висков, челюсти и глубины точек.', featureMap.cheekProminence.confidence, details.cheekProminence, `индекс ${details.cheekProminence.toFixed(2)}`),
    trait('jaw', 'jaw', classifyBand(details.jawTaper, [0.73, 0.86], ['Сужающаяся', 'Умеренная', 'Широкая']), 'Ширина нижней челюсти относительно скул.', featureMap.jawTaper.confidence, details.jawTaper, `${Math.round(details.jawTaper * 100)}% ширины скул`),
    trait('chin', 'jaw', classifyBand(details.chinDefinition, [0.40, 0.57], ['Узкий / острый', 'Умеренный', 'Широкий / мягкий']), 'Форма подбородка определяется шириной и углом нижнего контура.', featureMap.chinDefinition.confidence, details.chinDefinition, `индекс ${details.chinDefinition.toFixed(2)}`),
    trait('eyeSize', 'eyes', classifyBand(details.eyeSize, [0.024, 0.037], ['Небольшие', 'Средние', 'Крупные']), 'Площадь раскрытого глаза относительно площади лица.', featureMap.eyeSize.confidence, details.eyeSize, `нормированная площадь ${details.eyeSize.toFixed(3)}`),
    trait('eyeShape', 'eyes', eyeShape, 'Форма определяется площадью и отношением высоты века к длине глаза.', featureMap.eyeAspect.confidence, details.eyeAspect, `раскрытие/ширина ${details.eyeAspect.toFixed(2)}`),
    trait('eyeTilt', 'eyes', tiltLabel, 'Сравнивается положение внутренних и внешних уголков после компенсации наклона головы.', featureMap.eyeTilt.confidence, details.eyeTilt, `${details.eyeTilt.toFixed(1)}°`),
    trait('eyeSpacing', 'eyes', classifyBand(details.eyeSpacing, [0.88, 1.18], ['Близкая', 'Средняя', 'Широкая']), 'Расстояние между внутренними уголками относительно средней ширины глаза.', featureMap.eyeSpacing.confidence, details.eyeSpacing, `${details.eyeSpacing.toFixed(2)} ширины глаза`),
    trait('browThickness', 'brows', browThicknessLabel, 'Толщина уточняется по локальному контрасту волосков относительно кожи.', featureMap.browThickness.confidence, details.browThickness, `индекс ${details.browThickness.toFixed(3)}`),
    trait('browArch', 'brows', browArchLabel, 'Изгиб оценивается по средней оси брови, а не по одной точке.', featureMap.browArch.confidence, details.browArch, `индекс ${details.browArch.toFixed(2)}`),
    trait('noseWidth', 'nose', noseWidthLabel, 'Ширина крыльев носа относительно ширины скул.', featureMap.noseWidth.confidence, details.noseWidth, `${Math.round(details.noseWidth * 100)}% ширины лица`),
    trait('noseLength', 'nose', noseLengthLabel, 'Длина средней линии носа относительно высоты лица.', featureMap.noseLength.confidence, details.noseLength, `${Math.round(details.noseLength * 100)}% высоты лица`),
    trait('noseBalance', 'nose', details.noseBalance < 0.45 ? 'Стабильный центр' : details.noseBalance < 1.05 ? 'Небольшая асимметрия' : 'Выраженная асимметрия основания', 'Сравниваются крылья, ноздри и положение кончика; это не оценка качества.', featureMap.noseBalance.confidence, details.noseBalance, `индекс ${details.noseBalance.toFixed(2)}`),
    trait('lipFullness', 'lips', lipLabel, 'Учитываются общая высота губ и баланс верхней и нижней губы.', featureMap.lipFullness.confidence, details.lipFullness, `полнота ${details.lipFullness.toFixed(2)}, верх/низ ${details.lipBalance.toFixed(2)}`),
    trait('mouthWidth', 'lips', mouthLabel, 'Ширина рта рассматривается вместе с носом, глазами и шириной нижней части лица.', featureMap.mouthWidth.confidence, details.mouthWidth, `${Math.round(details.mouthWidth * 100)}% ширины лица`)
  ];
}

function archetypeFits(zMap) {
  const weights = { faceAspect: 1.1, cheekProminence: 1.0, jawTaper: 1.0, chinDefinition: 0.65, eyeSize: 0.9, eyeAspect: 0.75, eyeTilt: 0.55, eyeSpacing: 0.8, browThickness: 0.8, browArch: 0.65, noseWidth: 0.85, noseLength: 0.8, lipFullness: 0.7, mouthWidth: 0.75 };
  return CONFIGURATION_FAMILIES.map((family) => {
    let weightedDistance = 0;
    let totalWeight = 0;
    for (const [key, target] of Object.entries(family.vector)) {
      const weight = weights[key] || 1;
      const delta = clamp((zMap[key] || 0) - target, -3.2, 3.2);
      weightedDistance += delta * delta * weight;
      totalWeight += weight;
    }
    const rms = Math.sqrt(weightedDistance / Math.max(0.0001, totalWeight));
    return { ...family, score: Math.round(scoreFromError(rms, 1.25, 12)), distance: rms };
  }).sort((a, b) => b.score - a.score);
}

function multimodeScore(values, modes, sigma = 0.75) {
  const best = Math.min(...modes.map((mode) => {
    const distanceSquared = values.reduce((sum, value, index) => sum + (value - mode[index]) ** 2, 0);
    return Math.sqrt(distanceSquared / Math.max(1, values.length));
  }));
  return scoreFromError(best, sigma, 10);
}

function configurationInteractions(details, zMap) {
  return [
    { key: 'eyeBrow', label: 'Глаза ↔ брови', zone: 'Глаза', score: Math.round(multimodeScore([zMap.eyeSize, zMap.eyeAspect, zMap.browThickness, zMap.browArch], [[0.55, 0.45, -0.35, 0.25], [-0.25, -0.20, 0.60, -0.20], [0, 0, 0, 0]], 0.95)), note: 'Открытость глаз оценивается вместе с толщиной и изгибом бровей.' },
    { key: 'noseEye', label: 'Нос ↔ посадка глаз', zone: 'Нос', score: Math.round(scoreFromError(Math.abs(zMap.noseWidth - zMap.eyeSpacing * 0.72), 1.05, 12)), note: 'Ширина носа рассматривается относительно расстояния между глазами.' },
    { key: 'noseMouth', label: 'Нос ↔ рот', zone: 'Центр', score: Math.round(multimodeScore([zMap.noseWidth, zMap.mouthWidth], [[-0.45, -0.25], [0, 0], [0.45, 0.55]], 0.85)), note: 'Компактные и более широкие сочетания могут быть согласованными по-разному.' },
    { key: 'cheekJaw', label: 'Скулы ↔ челюсть', zone: 'Контур', score: Math.round(multimodeScore([zMap.cheekProminence, zMap.jawTaper, zMap.chinDefinition], [[0.75, -0.65, -0.30], [0.35, 0.55, 0.35], [0, 0, 0]], 0.92)), note: 'Скуловая и челюстная доминанты считаются разными, но равно допустимыми конфигурациями.' },
    { key: 'verticalFlow', label: 'Вертикальный ритм', zone: 'Пропорции', score: Math.round(multimodeScore([zMap.faceAspect, zMap.noseLength, details.lowerThirdZ], [[0.75, 0.55, 0.35], [-0.35, -0.30, -0.20], [0, 0, 0]], 0.98)), note: 'Длина лица, носа и нижней трети оцениваются как связанная система.' },
    { key: 'featureScale', label: 'Масштаб черт', zone: 'Композиция', score: Math.round(multimodeScore([zMap.eyeSize, zMap.noseWidth, zMap.mouthWidth], [[0.45, -0.20, 0.20], [-0.25, 0.30, 0.40], [0, 0, 0]], 1.00)), note: 'Крупность глаз, носа и рта не сводится к одной предпочтительной величине.' }
  ];
}

function buildVisualProfile(points) {
  const paths = { outline: LOWER_FACE, leftEye: EYE_LEFT, rightEye: EYE_RIGHT, leftBrow: LEFT_BROW_UPPER, rightBrow: RIGHT_BROW_UPPER, nose: [6, 197, 195, 5, 4, 98, 97, 2, 326, 327], lips: LIP_OUTER, jaw: LOWER_FACE };
  const outline = LOWER_FACE.map((index) => points[index]);
  const minX = Math.min(...outline.map((point) => point.x));
  const maxX = Math.max(...outline.map((point) => point.x));
  const minY = Math.min(...outline.map((point) => point.y));
  const maxY = Math.max(...outline.map((point) => point.y));
  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(0.001, maxY - minY);
  const mapPoint = (point) => ({ x: clamp((point.x - minX) / width, 0, 1), y: clamp((point.y - minY) / height, 0, 1) });
  return { paths: Object.fromEntries(Object.entries(paths).map(([key, indexes]) => [key, indexes.map((index) => mapPoint(points[index]))])) };
}

function computeDetails(landmarks, imageAspect = 1) {
  const normalized = normalizeLandmarks(landmarks, imageAspect);
  const p = normalized.points;
  const d = (a, b) => distance(p[a], p[b]);
  const faceHeight = d(10, 152);
  const cheekWidth = d(234, 454);
  const templeWidth = d(127, 356);
  const jawWidth = d(172, 397);
  const chinWidth = d(149, 378);
  const leftEyeWidth = d(33, 133);
  const rightEyeWidth = d(362, 263);
  const eyeWidth = mean([leftEyeWidth, rightEyeWidth]);
  const leftEyeArea = polygonArea(EYE_LEFT.map((index) => p[index]));
  const rightEyeArea = polygonArea(EYE_RIGHT.map((index) => p[index]));
  const leftEyeOpening = mean([d(159, 145), d(158, 153), d(160, 144)]);
  const rightEyeOpening = mean([d(386, 374), d(385, 380), d(387, 373)]);
  const leftTilt = degrees(Math.atan2(p[133].y - p[33].y, Math.abs(p[133].x - p[33].x)));
  const rightTilt = degrees(Math.atan2(p[362].y - p[263].y, Math.abs(p[362].x - p[263].x)));
  const leftArch = (mean([p[70].y, p[107].y]) - p[105].y) / Math.max(0.001, leftEyeWidth);
  const rightArch = (mean([p[300].y, p[336].y]) - p[334].y) / Math.max(0.001, rightEyeWidth);
  const upperLip = d(0, 13);
  const lowerLip = d(14, 17);
  const lipHeight = upperLip + lowerLip;
  const leftNose = d(98, 1);
  const rightNose = d(1, 327);
  const tipCenterOffset = Math.abs(p[1].x - mean([p[98].x, p[327].x]));
  const noseBalanceRaw = (Math.abs(leftNose - rightNose) + tipCenterOffset * 1.4) / Math.max(0.001, d(98, 327));
  const cheekWidthBalance = cheekWidth / Math.max(0.001, mean([templeWidth, jawWidth]));
  const depthCue = clamp((mean([p[50].z, p[280].z]) - mean([p[172].z, p[397].z])) * 2.5, -0.12, 0.12);
  const chinAngle = angleAt(p[172], p[152], p[397]);
  const chinDefinition = clamp((chinWidth / Math.max(0.001, jawWidth)) * 0.75 + ((chinAngle - 45) / 80) * 0.25, 0.20, 0.85);
  const details = {
    faceAspect: faceHeight / Math.max(0.001, cheekWidth), cheekProminence: cheekWidthBalance + depthCue,
    jawTaper: jawWidth / Math.max(0.001, cheekWidth), chinDefinition,
    eyeSize: mean([leftEyeArea, rightEyeArea]) / Math.max(0.001, cheekWidth * cheekWidth),
    eyeAspect: mean([leftEyeOpening / Math.max(0.001, leftEyeWidth), rightEyeOpening / Math.max(0.001, rightEyeWidth)]),
    eyeTilt: mean([leftTilt, rightTilt]), eyeSpacing: d(133, 362) / Math.max(0.001, eyeWidth),
    browThickness: 0.115, browArch: mean([leftArch, rightArch]),
    noseWidth: d(98, 327) / Math.max(0.001, cheekWidth), noseLength: d(168, 2) / Math.max(0.001, faceHeight),
    noseBalance: noseBalanceRaw / 0.05, lipFullness: lipHeight / Math.max(0.001, d(61, 291)),
    lipBalance: upperLip / Math.max(0.001, lowerLip), mouthWidth: d(61, 291) / Math.max(0.001, cheekWidth),
    lowerThird: d(2, 152) / Math.max(0.001, faceHeight), lowerThirdZ: (d(2, 152) / Math.max(0.001, faceHeight) - 0.40) / 0.045,
    rollDegrees: normalized.rollDegrees,
    yawProxy: Math.abs(Math.abs(landmarks[1].x - landmarks[234].x) - Math.abs(landmarks[454].x - landmarks[1].x)) / Math.max(0.0001, Math.abs(landmarks[1].x - landmarks[234].x) + Math.abs(landmarks[454].x - landmarks[1].x))
  };
  return { normalized, details };
}

function buildGeometryResult(landmarks, imageAspect, pixelRefinement = null) {
  const { normalized, details } = computeDetails(landmarks, imageAspect);
  if (pixelRefinement) {
    if (Number.isFinite(pixelRefinement.browThickness)) details.browThickness = pixelRefinement.browThickness;
    details.skinUniformity = pixelRefinement.skinUniformity;
  }
  const confidenceMap = { browThickness: pixelRefinement?.browConfidence ?? 55, cheekProminence: 78, noseBalance: 82, faceAspect: 92, eyeSize: 93, eyeAspect: 92, eyeTilt: 92, eyeSpacing: 94, browArch: 83, noseWidth: 90, noseLength: 88, lipFullness: 88, mouthWidth: 92, jawTaper: 88, chinDefinition: 80 };
  const features = FEATURE_DEFINITIONS.map((definition) => featureFromDefinition(definition, details[definition.key], confidenceMap[definition.key]));
  const featureMap = Object.fromEntries(features.map((feature) => [feature.key, feature]));
  const zMap = Object.fromEntries(features.map((feature) => [feature.key, clamp(feature.signedZ, -3, 3)]));
  const families = archetypeFits(zMap);
  const interactions = configurationInteractions(details, zMap);
  const interactionScore = mean(interactions.map((item) => item.score));
  const familyScore = families[0].score * 0.72 + families[1].score * 0.28;
  const distinctiveness = median(features.map((feature) => feature.z));
  const distinctivenessCoherence = distinctiveness > 0.55 ? clamp(52 + (interactionScore - 50) * 0.65, 25, 92) : clamp(68 + (interactionScore - 50) * 0.35, 35, 92);
  const symmetryPairs = [[33,263],[133,362],[70,300],[105,334],[98,327],[61,291],[234,454],[172,397],[149,378]];
  const symmetryError = median(symmetryPairs.map(([left, right]) => Math.hypot(Math.abs(normalized.points[left].x + normalized.points[right].x), Math.abs(normalized.points[left].y - normalized.points[right].y) * 0.7)));
  const symmetryScore = scoreFromError(symmetryError, 0.038, 18);
  const configurationScore = clamp(familyScore * 0.44 + interactionScore * 0.44 + distinctivenessCoherence * 0.12, 0, 100);
  const surfaceScore = pixelRefinement?.skinUniformity ?? 72;
  const rating = clamp(2.95 + (configurationScore - 58) * 0.020 + (surfaceScore - 70) * 0.004, 1.35, 4.55);
  const centrality = clamp(100 - mean(features.map((feature) => Math.min(2.8, feature.z))) * 28, 0, 100);
  const regionKeys = { outline: ['faceAspect', 'cheekProminence'], eyes: ['eyeSize', 'eyeAspect', 'eyeTilt', 'eyeSpacing'], brows: ['browThickness', 'browArch'], nose: ['noseWidth', 'noseLength', 'noseBalance'], lips: ['lipFullness', 'mouthWidth'], jaw: ['jawTaper', 'chinDefinition'] };
  const regionScores = Object.fromEntries(Object.entries(regionKeys).map(([zone, keys]) => {
    const featureConfidence = mean(keys.map((key) => featureMap[key]?.confidence || 60));
    const relevantInteractions = interactions.filter((item) => zone === 'eyes' || zone === 'brows' ? item.key === 'eyeBrow' : zone === 'nose' ? ['noseEye', 'noseMouth'].includes(item.key) : zone === 'lips' ? item.key === 'noseMouth' : zone === 'outline' || zone === 'jaw' ? ['cheekJaw', 'verticalFlow'].includes(item.key) : false);
    return Math.round(clamp(featureConfidence * 0.42 + mean(relevantInteractions.map((item) => item.score)) * 0.58, 0, 100));
  }));
  return { rating, typicalityPercentile: centrality, symmetryScore, coordinationScore: interactionScore, configurationScore, distanceSquared: mean(features.map((feature) => feature.z ** 2)), details, features: [...features].sort((a, b) => a.zone.localeCompare(b.zone) || a.z - b.z), traits: buildTraits(details, featureMap), regionScores, visualProfile: buildVisualProfile(normalized.points), configurations: families.slice(0, 3), interactions, refinedContours: pixelRefinement?.contours || null, surfaceScore, model: { name: 'multi-configuration-v1', dimensions: 15, families: CONFIGURATION_FAMILIES.length } };
}

function grayAt(imageData, x, y) {
  const px = clamp(Math.round(x), 0, imageData.width - 1);
  const py = clamp(Math.round(y), 0, imageData.height - 1);
  const index = (py * imageData.width + px) * 4;
  return imageData.data[index] * 0.2126 + imageData.data[index + 1] * 0.7152 + imageData.data[index + 2] * 0.0722;
}

function sampleRegion(imageData, center, radiusX, radiusY) {
  const values = [];
  for (let y = center.y - radiusY; y <= center.y + radiusY; y += 2) for (let x = center.x - radiusX; x <= center.x + radiusX; x += 2) values.push(grayAt(imageData, x, y));
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return { mean: average, deviation: Math.sqrt(variance) };
}

function refineBrow(imageData, landmarks, upper, lower) {
  const points = upper.map((upperIndex, index) => {
    const top = landmarks[upperIndex];
    const bottom = landmarks[lower[index]];
    return { x: mean([top.x, bottom.x]) * imageData.width, y: mean([top.y, bottom.y]) * imageData.height };
  });
  const eyeWidthPx = Math.abs(points.at(-1).x - points[0].x);
  const searchRadius = clamp(eyeWidthPx * 0.16, 5, 18);
  const refined = [];
  const thicknesses = [];
  const contrasts = [];
  for (const base of points) {
    const skin = sampleRegion(imageData, { x: base.x, y: base.y + searchRadius * 1.5 }, searchRadius * 0.55, searchRadius * 0.35);
    let bestY = base.y;
    let bestContrast = 0;
    const rowScores = [];
    for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
      const y = base.y + offset;
      let total = 0;
      let count = 0;
      for (let x = base.x - searchRadius * 0.65; x <= base.x + searchRadius * 0.65; x += 2) { total += grayAt(imageData, x, y); count += 1; }
      const rowMean = total / Math.max(1, count);
      const contrast = skin.mean - rowMean;
      rowScores.push({ y, contrast });
      if (contrast > bestContrast) { bestContrast = contrast; bestY = y; }
    }
    const threshold = Math.max(5, bestContrast * 0.48);
    const darkRows = rowScores.filter((row) => row.contrast >= threshold && Math.abs(row.y - bestY) <= searchRadius * 0.75);
    const thickness = darkRows.length ? Math.max(...darkRows.map((row) => row.y)) - Math.min(...darkRows.map((row) => row.y)) + 1 : 0;
    refined.push({ x: base.x / imageData.width, y: bestY / imageData.height });
    thicknesses.push(thickness / Math.max(1, eyeWidthPx));
    contrasts.push(bestContrast / Math.max(8, skin.deviation + 8));
  }
  return { points: refined, thickness: median(thicknesses), confidence: clamp(mean(contrasts) * 32, 35, 96) };
}

function skinUniformity(imageData, landmarks) {
  const regions = [[10,168,.52],[117,50,.45],[346,280,.45],[205,187,.45],[425,411,.45]];
  const samples = regions.map(([a, b, t]) => {
    const center = { x: (landmarks[a].x + (landmarks[b].x - landmarks[a].x) * t) * imageData.width, y: (landmarks[a].y + (landmarks[b].y - landmarks[a].y) * t) * imageData.height };
    const faceWidth = Math.abs(landmarks[454].x - landmarks[234].x) * imageData.width;
    return sampleRegion(imageData, center, faceWidth * 0.035, faceWidth * 0.035);
  });
  const texture = mean(samples.map((sample) => sample.deviation));
  const sampleMean = mean(samples.map((item) => item.mean));
  const toneSpread = Math.sqrt(mean(samples.map((sample) => (sample.mean - sampleMean) ** 2)));
  return clamp(100 - texture * 1.55 - toneSpread * 1.2, 18, 96);
}

export function computeConfigurationProfile(landmarks, imageAspect = 1) { return buildGeometryResult(landmarks, imageAspect, null); }

export function refineConfigurationProfile(profile, imageData, landmarks, imageAspect = imageData.width / imageData.height) {
  const leftBrow = refineBrow(imageData, landmarks, LEFT_BROW_UPPER, LEFT_BROW_LOWER);
  const rightBrow = refineBrow(imageData, landmarks, RIGHT_BROW_UPPER, RIGHT_BROW_LOWER);
  return buildGeometryResult(landmarks, imageAspect, { browThickness: mean([leftBrow.thickness, rightBrow.thickness]), browConfidence: mean([leftBrow.confidence, rightBrow.confidence]), skinUniformity: skinUniformity(imageData, landmarks), contours: { leftBrow: leftBrow.points, rightBrow: rightBrow.points } });
}

export function createConfigurationAssessment(geometry, quality) {
  const occlusionFactor = clamp(1 - quality.raw.occlusionRisk / 260, 0.72, 1);
  const rating = clamp(2.95 + (geometry.rating - 2.95) * occlusionFactor, 1, 5);
  const qualityPenalty = clamp((84 - quality.reliability) * 0.008, 0, 0.30);
  const confidencePenalty = clamp((90 - mean(geometry.features.map((feature) => feature.confidence))) * 0.007, 0, 0.20);
  const halfWidth = clamp(0.56 + qualityPenalty + confidencePenalty + quality.raw.occlusionRisk * 0.0025, 0.56, 1.12);
  return { rating, interval: [clamp(rating - halfWidth, 1, 5), clamp(rating + halfWidth, 1, 5)], halfWidth, reliability: Math.round(quality.reliability), presentationScore: Math.round(quality.presentationScore), typicalityPercentile: Math.round(geometry.typicalityPercentile), symmetryScore: Math.round(geometry.symmetryScore), coordinationScore: Math.round(geometry.coordinationScore), configurationScore: Math.round(geometry.configurationScore), occlusionScore: Math.round(quality.metrics.occlusion), surfaceScore: Math.round(geometry.surfaceScore), strongest: geometry.configurations.slice(0, 2).map((item) => item.label), distinctive: [...geometry.features].sort((a, b) => b.z - a.z).slice(0, 3).map((feature) => feature.label), featureDetails: geometry.features.map((feature) => ({ ...feature })), traits: geometry.traits.map((item) => ({ ...item, confidence: Math.round(item.confidence * (['outline', 'cheeks', 'jaw'].includes(item.zone) ? quality.metrics.occlusion / 100 : 1)) })), regionScores: geometry.regionScores, visualProfile: geometry.visualProfile, configurations: geometry.configurations, interactions: geometry.interactions, refinedContours: geometry.refinedContours, issues: quality.issues, model: geometry.model };
}

function aggregateFeatures(scans) {
  const keys = scans[0]?.featureDetails?.map((item) => item.key) || [];
  return keys.map((key) => {
    const items = scans.map((scan) => scan.featureDetails.find((item) => item.key === key)).filter(Boolean);
    const base = items[0];
    const value = median(items.map((item) => item.value));
    const signedZ = median(items.map((item) => item.signedZ));
    const z = Math.abs(signedZ);
    const stability = clamp(100 - mad(items.map((item) => item.value)) / Math.max(0.0001, base.spread) * 65, 0, 100);
    return { ...base, value, signedZ, z, stability: Math.round(stability), confidence: Math.round(mean(items.map((item) => item.confidence || 70)) * (0.75 + stability / 400)), ...featureStatus(z, signedZ) };
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
    return { ...base, confidence: Math.round(mean(chosen.map((item) => item.confidence))), stability: Math.round(chosen.length / Math.max(1, candidates.length) * 100) };
  });
}

function aggregateNamedScores(scans, key) {
  const names = scans[0]?.[key]?.map((item) => item.key) || [];
  return names.map((name) => {
    const items = scans.map((scan) => scan[key].find((item) => item.key === name)).filter(Boolean);
    return { ...items[0], score: Math.round(median(items.map((item) => item.score))) };
  }).sort((a, b) => b.score - a.score);
}

export function combineConfigurationAssessments(scans) {
  if (!Array.isArray(scans) || !scans.length) throw new TypeError('At least one scan is required');
  const ratings = scans.map((scan) => scan.rating);
  const rating = median(ratings);
  const dispersion = mad(ratings) * 1.4826;
  const reliability = mean(scans.map((scan) => scan.reliability));
  const featureDetails = aggregateFeatures(scans);
  const featureStability = mean(featureDetails.map((feature) => feature.stability || 100));
  const consistency = clamp(100 - dispersion * 115, 0, 100);
  const countBonus = scans.length >= 3 ? 0.15 : scans.length === 2 ? 0.07 : 0;
  const halfWidth = clamp(0.69 - countBonus + dispersion * 1.35 + Math.max(0, 80 - reliability) * 0.006 + Math.max(0, 78 - featureStability) * 0.004, 0.48, 1.15);
  const bestVisual = [...scans].sort((a, b) => b.reliability - a.reliability)[0];
  const regionKeys = Object.keys(scans[0].regionScores || {});
  return { rating, interval: [clamp(rating - halfWidth, 1, 5), clamp(rating + halfWidth, 1, 5)], halfWidth, scanCount: scans.length, reliability: Math.round(reliability), consistency: Math.round(Math.min(consistency, featureStability)), featureStability: Math.round(featureStability), presentationScore: Math.round(mean(scans.map((scan) => scan.presentationScore))), typicalityPercentile: Math.round(median(scans.map((scan) => scan.typicalityPercentile))), symmetryScore: Math.round(median(scans.map((scan) => scan.symmetryScore))), coordinationScore: Math.round(median(scans.map((scan) => scan.coordinationScore))), configurationScore: Math.round(median(scans.map((scan) => scan.configurationScore))), occlusionScore: Math.round(median(scans.map((scan) => scan.occlusionScore))), surfaceScore: Math.round(median(scans.map((scan) => scan.surfaceScore))), strongest: aggregateNamedScores(scans, 'configurations').slice(0, 2).map((item) => item.label), distinctive: [...featureDetails].sort((a, b) => b.z - a.z).slice(0, 3).map((feature) => feature.label), featureDetails, traits: aggregateTraits(scans), regionScores: Object.fromEntries(regionKeys.map((key) => [key, Math.round(median(scans.map((scan) => scan.regionScores[key])))])), visualProfile: bestVisual.visualProfile, configurations: aggregateNamedScores(scans, 'configurations'), interactions: aggregateNamedScores(scans, 'interactions'), refinedContours: bestVisual.refinedContours, issues: scans.flatMap((scan) => scan.issues).slice(0, 6), model: scans[0].model };
}

export const RESEARCH_TRAITS = FEATURE_DEFINITIONS.map(({ key, label, zone }) => ({ key, label, zone }));
