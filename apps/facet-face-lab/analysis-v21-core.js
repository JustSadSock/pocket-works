// FACET v2.1 — adaptive evidence selection, perspective diagnostics and zone stability.
const __facetV21Version = '2.1.0';
const __facetV21Roles = ['front', 'left', 'right', 'front-return', 'front-control'];
const __facetV21RoleLabels = {
  front: 'Прямо',
  left: 'Левый поворот',
  right: 'Правый поворот',
  'front-return': 'Возврат прямо',
  'front-control': 'Контроль прямо'
};

function __facetV21Clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function __facetV21Number(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function __facetV21Mean(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : NaN;
}

function __facetV21Median(values) {
  const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!clean.length) return NaN;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function __facetV21Mad(values) {
  const median = __facetV21Median(values);
  if (!Number.isFinite(median)) return NaN;
  return __facetV21Median(values.filter(Number.isFinite).map((value) => Math.abs(value - median)));
}

function __facetV21Get(object, path) {
  return path.split('.').reduce((value, key) => value == null ? undefined : value[key], object);
}

function __facetV21FirstNumber(object, paths, fallback = NaN) {
  for (const path of paths) {
    const value = __facetV21Number(__facetV21Get(object, path));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function __facetV21FirstObject(object, paths) {
  for (const path of paths) {
    const value = __facetV21Get(object, path);
    if (value && typeof value === 'object') return value;
  }
  return null;
}

function __facetV21QualityValue(frame) {
  const raw = __facetV21FirstNumber(frame, [
    'quality.overall', 'quality.score', 'quality.reliability', 'imageQuality.overall',
    'imageQuality.score', 'metrics.quality', 'advanced.confidence', 'confidence',
    'reliability', 'protocolQuality', 'quality'
  ], 70);
  return __facetV21Clamp(raw <= 1 ? raw * 100 : raw);
}

function __facetV21NormalizeAngle(value) {
  if (!Number.isFinite(value)) return NaN;
  if (Math.abs(value) <= 1.2) return value * 57.2958;
  return value;
}

function __facetV21FrameMetrics(frame, index) {
  const yaw = __facetV21NormalizeAngle(__facetV21FirstNumber(frame, [
    'pose.yaw', 'headPose.yaw', 'geometry.pose.yaw', 'geometry.yaw', 'metrics.yaw', 'yaw'
  ]));
  const pitch = __facetV21NormalizeAngle(__facetV21FirstNumber(frame, [
    'pose.pitch', 'headPose.pitch', 'geometry.pose.pitch', 'geometry.pitch', 'metrics.pitch', 'pitch'
  ]));
  const roll = __facetV21NormalizeAngle(__facetV21FirstNumber(frame, [
    'pose.roll', 'headPose.roll', 'geometry.pose.roll', 'geometry.roll', 'metrics.roll', 'roll'
  ]));
  let scale = __facetV21FirstNumber(frame, [
    'quality.faceScale', 'imageQuality.faceScale', 'geometry.faceScale', 'metrics.faceScale',
    'faceScale', 'boundingBox.width', 'box.width', 'faceBox.width'
  ]);
  if (Number.isFinite(scale) && scale > 1.5) scale /= 100;
  let centerX = __facetV21FirstNumber(frame, [
    'quality.centerX', 'imageQuality.centerX', 'geometry.centerX', 'metrics.centerX',
    'center.x', 'boundingBox.centerX', 'box.centerX'
  ]);
  if (Number.isFinite(centerX) && centerX > 1.5) centerX /= 100;
  let centerY = __facetV21FirstNumber(frame, [
    'quality.centerY', 'imageQuality.centerY', 'geometry.centerY', 'metrics.centerY',
    'center.y', 'boundingBox.centerY', 'box.centerY'
  ]);
  if (Number.isFinite(centerY) && centerY > 1.5) centerY /= 100;
  return {
    index,
    role: __facetV21Roles[index] || `frame-${index + 1}`,
    quality: Math.round(__facetV21QualityValue(frame)),
    yaw,
    pitch,
    roll,
    scale,
    centerX,
    centerY,
    signature: __facetV21Signature(frame)
  };
}

function __facetV21DescriptorArray(object) {
  const value = __facetV21FirstObject(object, [
    'advanced.descriptors', 'descriptors', 'featureDetails', 'traits', 'geometry.descriptors'
  ]);
  return Array.isArray(value) ? value : value ? Object.values(value) : [];
}

function __facetV21Zone(text = '') {
  const key = String(text).toLowerCase();
  if (/eye|глаз/.test(key)) return 'eyes';
  if (/brow|бров/.test(key)) return 'brows';
  if (/nose|нос|center|центр|перенос/.test(key)) return 'center';
  if (/lip|mouth|губ|рот/.test(key)) return 'mouth';
  if (/jaw|chin|cheek|челю|подбор|скул/.test(key)) return 'lower';
  return 'frame';
}

function __facetV21DescriptorNumber(item) {
  return __facetV21Number(
    item?.normalizedValue, item?.ratio, item?.value, item?.signedZ, item?.z,
    item?.deviation, item?.score, item?.measurement
  );
}

function __facetV21CollectObjectNumbers(object, prefix, target, depth = 0) {
  if (!object || typeof object !== 'object' || depth > 3 || target.size >= 80) return;
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (!/(confidence|reliability|quality|timestamp|time|width|height|score)$/i.test(path)) target.set(path, value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      __facetV21CollectObjectNumbers(value, path, target, depth + 1);
    }
  }
}

function __facetV21Signature(frame) {
  const signature = new Map();
  for (const [index, item] of __facetV21DescriptorArray(frame).entries()) {
    const value = __facetV21DescriptorNumber(item);
    if (!Number.isFinite(value)) continue;
    const key = item?.key || item?.name || item?.label || `descriptor-${index}`;
    signature.set(String(key), value);
  }
  for (const [path, prefix] of [
    ['geometry.ratios', 'ratio'], ['geometry.metrics', 'metric'], ['ratios', 'ratio'],
    ['measurements', 'measurement'], ['profile.metrics', 'profile']
  ]) {
    const candidate = __facetV21Get(frame, path);
    if (candidate && typeof candidate === 'object') __facetV21CollectObjectNumbers(candidate, prefix, signature);
  }
  return signature;
}

function __facetV21SignatureDistance(left, right) {
  if (!(left instanceof Map) || !(right instanceof Map)) return NaN;
  const common = [...left.keys()].filter((key) => right.has(key));
  if (!common.length) return NaN;
  const deltas = common.map((key) => {
    const a = left.get(key);
    const b = right.get(key);
    const denominator = Math.max(Math.abs(a), Math.abs(b), 0.08);
    return Math.min(2, Math.abs(a - b) / denominator);
  });
  return __facetV21Median(deltas) * 100;
}

function __facetV21AdaptiveSelection(values) {
  const frames = (Array.isArray(values) ? values : []).map(__facetV21FrameMetrics);
  if (frames.length <= 3) {
    return {
      frames,
      selectedIndices: frames.map((frame) => frame.index),
      rejectedIndices: [],
      validationNeeded: 0,
      reason: 'Доступны только основные ракурсы.'
    };
  }

  const core = frames.slice(0, 3);
  const validations = frames.slice(3, 5);
  const coreQuality = Math.min(...core.map((frame) => frame.quality));
  const frontDistances = validations.map((frame) => __facetV21SignatureDistance(core[0]?.signature, frame.signature));
  const knownDistances = frontDistances.filter(Number.isFinite);
  const frontAgreement = knownDistances.length ? 100 - __facetV21Median(knownDistances) : 70;
  const sideYaw = core.slice(1, 3).map((frame) => Math.abs(frame.yaw)).filter(Number.isFinite);
  const yawCoverage = sideYaw.length === 2 ? __facetV21Clamp(__facetV21Mean(sideYaw) / 15 * 100) : 72;

  let validationNeeded = 2;
  if (coreQuality >= 80 && frontAgreement >= 82 && yawCoverage >= 72) validationNeeded = 0;
  else if (coreQuality >= 66 && frontAgreement >= 62) validationNeeded = 1;

  const ranked = validations.map((frame, offset) => {
    const distance = frontDistances[offset];
    const agreement = Number.isFinite(distance) ? __facetV21Clamp(100 - distance) : 68;
    const qualityGain = Math.max(0, frame.quality - core[0].quality);
    const contradictionBonus = Number.isFinite(distance) && distance > 20 ? 18 : 0;
    return {
      frame,
      value: frame.quality * 0.48 + agreement * 0.36 + qualityGain * 0.16 + contradictionBonus
    };
  }).sort((left, right) => right.value - left.value);

  if (ranked.some((item) => {
    const distance = __facetV21SignatureDistance(core[0]?.signature, item.frame.signature);
    return Number.isFinite(distance) && distance > 24;
  })) validationNeeded = Math.max(1, validationNeeded);

  const chosen = ranked.slice(0, validationNeeded).map((item) => item.frame.index);
  const selectedIndices = [...core.map((frame) => frame.index), ...chosen].sort((a, b) => a - b);
  const rejectedIndices = frames.map((frame) => frame.index).filter((index) => !selectedIndices.includes(index));
  const reason = validationNeeded === 0
    ? 'Три основных ракурса согласованы; контрольные кадры не меняют вывод.'
    : validationNeeded === 1
      ? 'Один контрольный фронтальный кадр уточняет повторяемость.'
      : 'Оба контрольных кадра нужны из-за качества или расхождения измерений.';
  return { frames, selectedIndices, rejectedIndices, validationNeeded, reason, frontAgreement: Math.round(frontAgreement), yawCoverage: Math.round(yawCoverage) };
}

function __facetV21Perspective(frames, selectedIndices) {
  const selected = frames.filter((frame) => selectedIndices.includes(frame.index));
  const scales = selected.map((frame) => frame.scale).filter(Number.isFinite);
  const rolls = selected.map((frame) => Math.abs(frame.roll)).filter(Number.isFinite);
  const pitches = selected.map((frame) => Math.abs(frame.pitch)).filter(Number.isFinite);
  const centersX = selected.map((frame) => frame.centerX).filter(Number.isFinite);
  const centersY = selected.map((frame) => frame.centerY).filter(Number.isFinite);
  const left = frames[1];
  const right = frames[2];
  const yawAsymmetry = Number.isFinite(left?.yaw) && Number.isFinite(right?.yaw)
    ? Math.abs(Math.abs(left.yaw) - Math.abs(right.yaw))
    : NaN;
  const scaleMedian = __facetV21Median(scales);
  const scaleDrift = scales.length > 1 && Number.isFinite(scaleMedian) && scaleMedian !== 0
    ? __facetV21Mad(scales) / Math.abs(scaleMedian) * 100
    : 0;
  const centerDrift = Math.max(
    Number.isFinite(__facetV21Mad(centersX)) ? __facetV21Mad(centersX) * 100 : 0,
    Number.isFinite(__facetV21Mad(centersY)) ? __facetV21Mad(centersY) * 100 : 0
  );
  const medianRoll = __facetV21Median(rolls) || 0;
  const medianPitch = __facetV21Median(pitches) || 0;
  const closeRisk = Number.isFinite(scaleMedian) ? __facetV21Clamp((scaleMedian - 0.42) / 0.23 * 100) : 18;
  const risk = __facetV21Clamp(
    closeRisk * 0.26 + __facetV21Clamp(scaleDrift * 7) * 0.30 + __facetV21Clamp(centerDrift * 7) * 0.12 +
    __facetV21Clamp(medianRoll / 6 * 100) * 0.10 + __facetV21Clamp(medianPitch / 9 * 100) * 0.08 +
    __facetV21Clamp((yawAsymmetry || 0) / 8 * 100) * 0.14
  );
  const notes = [];
  if (closeRisk >= 45) notes.push('Телефон слишком близко: центральная часть лица может выглядеть крупнее контура.');
  if (scaleDrift >= 5) notes.push('Дистанция менялась между кадрами.');
  if (centerDrift >= 4) notes.push('Лицо смещалось внутри кадра.');
  if (medianRoll >= 4) notes.push('Есть заметный наклон головы к плечу.');
  if (Number.isFinite(yawAsymmetry) && yawAsymmetry >= 6) notes.push('Левый и правый повороты отличаются по углу.');
  if (!notes.length) notes.push('Сильных перспективных искажений в выбранных ракурсах не обнаружено.');
  return {
    risk: Math.round(risk),
    scaleDrift: Math.round(scaleDrift),
    centerDrift: Math.round(centerDrift),
    yawAsymmetry: Number.isFinite(yawAsymmetry) ? Math.round(yawAsymmetry) : null,
    medianScale: Number.isFinite(scaleMedian) ? scaleMedian : null,
    notes,
    correctionStrength: Math.round(__facetV21Clamp(100 - risk * 0.72))
  };
}

function __facetV21ZoneStability(values, result) {
  const zones = new Map(['frame', 'eyes', 'brows', 'center', 'mouth', 'lower'].map((key) => [key, new Map()]));
  for (const frame of values) {
    for (const [index, item] of __facetV21DescriptorArray(frame).entries()) {
      const number = __facetV21DescriptorNumber(item);
      if (!Number.isFinite(number)) continue;
      const key = String(item?.key || item?.name || item?.label || `descriptor-${index}`);
      const zone = __facetV21Zone(`${item?.zone || ''} ${key} ${item?.label || ''}`);
      const bucket = zones.get(zone);
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key).push(number);
    }
  }

  const finalDescriptors = typeof __facetV20Descriptors === 'function' ? __facetV20Descriptors(result) : [];
  return [...zones.entries()].map(([key, features]) => {
    const featureScores = [...features.values()].filter((numbers) => numbers.length >= 2).map((numbers) => {
      const median = __facetV21Median(numbers);
      const mad = __facetV21Mad(numbers);
      const relative = Number.isFinite(median) && Math.abs(median) > 0.05 ? mad / Math.abs(median) : mad;
      return __facetV21Clamp(100 - relative * 260);
    });
    const fallback = finalDescriptors.filter((item) => item.zone === key).map((item) => item.stability);
    const score = __facetV21Mean(featureScores.length ? featureScores : fallback);
    return {
      key,
      label: ({ frame: 'Контур', eyes: 'Глаза', brows: 'Брови', center: 'Нос и центр', mouth: 'Губы и рот', lower: 'Скулы и челюсть' })[key],
      stability: Math.round(Number.isFinite(score) ? score : __facetV21Number(result?.consistency, 65)),
      measuredFeatures: featureScores.length || fallback.length
    };
  }).filter((zone) => zone.measuredFeatures > 0).sort((left, right) => left.stability - right.stability);
}

function __facetV21Recommendation(adaptive, perspective, zones) {
  const weakest = zones[0];
  if (perspective.risk >= 42) return {
    title: 'Повтори серию с большей дистанции',
    copy: 'Отодвинь телефон, используй 1.5–2× при наличии и держи лицо одного размера во всех кадрах.'
  };
  if (adaptive.yawCoverage != null && adaptive.yawCoverage < 65) return {
    title: 'Нужны точнее боковые ракурсы',
    copy: 'Поверни всю голову примерно на 15° в обе стороны, не двигая телефон и не наклоняя ухо к плечу.'
  };
  if (weakest && weakest.stability < 62) return {
    title: `Нестабильная зона: ${weakest.label.toLowerCase()}`,
    copy: 'Убери волосы или блики с этой области, сохрани нейтральное выражение и повтори серию при ровном свете.'
  };
  return {
    title: 'Дополнительная съёмка не обязательна',
    copy: 'Основные зоны достаточно устойчивы. Для сравнения образов сохраняй ту же дистанцию, объектив и свет.'
  };
}

function __facetV21AdjustDescriptors(result, perspective, zones) {
  const advanced = result?.advanced;
  if (!advanced || !Array.isArray(advanced.descriptors)) return result;
  const zoneMap = new Map(zones.map((zone) => [zone.key, zone.stability]));
  const descriptors = advanced.descriptors.map((item) => {
    const zone = __facetV21Zone(`${item?.zone || ''} ${item?.key || ''} ${item?.label || ''}`);
    const zoneStability = zoneMap.get(zone) ?? __facetV21Number(item?.stability, advanced.landmarkStability, 65);
    const perspectivePenalty = (zone === 'center' ? perspective.risk * 0.24 : perspective.risk * 0.10);
    const adjustedStability = __facetV21Clamp(__facetV21Number(item?.stability, zoneStability) * 0.62 + zoneStability * 0.38 - perspectivePenalty);
    const adjustedConfidence = __facetV21Clamp(__facetV21Number(item?.confidence, advanced.confidence, 65) - perspectivePenalty * 0.55);
    return { ...item, stability: Math.round(adjustedStability), confidence: Math.round(adjustedConfidence), perspectiveRisk: perspective.risk };
  });
  return { ...result, advanced: { ...advanced, descriptors } };
}

function __facetV21Enrich(result, originalValues, adaptive) {
  const perspective = __facetV21Perspective(adaptive.frames, adaptive.selectedIndices);
  const preliminaryZones = __facetV21ZoneStability(originalValues, result);
  const adjusted = __facetV21AdjustDescriptors(result, perspective, preliminaryZones);
  const profile = typeof __facetV20BuildProfile === 'function'
    ? __facetV20BuildProfile(adjusted)
    : adjusted.appearanceV2 || {};
  const zones = __facetV21ZoneStability(originalValues, adjusted);
  const recommendation = __facetV21Recommendation(adaptive, perspective, zones);
  const adaptiveSupport = __facetV21Clamp(
    __facetV21Number(profile.support, 65) * 0.72 + perspective.correctionStrength * 0.18 +
    __facetV21Mean(zones.map((zone) => zone.stability)) * 0.10
  );
  const rating = __facetV21Number(adjusted.rating, 3);
  const shrink = 0.72 + adaptiveSupport / 100 * 0.24;
  const calibratedRating = 3 + (rating - 3) * shrink;
  const previousHalfWidth = __facetV21Number(adjusted.halfWidth, 0.7);
  const halfWidth = Math.min(1.48, Math.max(previousHalfWidth, 0.58 + perspective.risk * 0.006 + (100 - adaptiveSupport) * 0.004));
  return {
    ...adjusted,
    rating: calibratedRating,
    halfWidth,
    interval: [Math.max(1, calibratedRating - halfWidth), Math.min(5, calibratedRating + halfWidth)],
    appearanceV2: {
      ...profile,
      support: Math.round(adaptiveSupport),
      adaptiveProtocol: adaptive,
      perspective,
      zones,
      recommendation,
      experimentalRating: calibratedRating,
      experimentalInterval: [Math.max(1, calibratedRating - halfWidth), Math.min(5, calibratedRating + halfWidth)]
    },
    model: {
      ...(adjusted.model || {}),
      interpretation: 'adaptive-perspective-v2.1',
      selectedFrames: adaptive.selectedIndices.length,
      capturedFrames: adaptive.frames.length
    }
  };
}

if (typeof combineProtocolAssessments === 'function') {
  const __facetV21BaseCombine = combineProtocolAssessments;
  combineProtocolAssessments = function combineProtocolAssessmentsV21(values) {
    const source = Array.isArray(values) ? values : [];
    const adaptive = __facetV21AdaptiveSelection(source);
    const selected = adaptive.selectedIndices.map((index) => source[index]).filter(Boolean);
    const result = __facetV21BaseCombine(selected.length >= 3 ? selected : source);
    return __facetV21Enrich(result, source, adaptive);
  };
}
