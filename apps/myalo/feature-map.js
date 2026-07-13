const FEATURES = [
  { id: 'forehead', label: 'лоб', indices: [10], anchorIndices: [168], radiusX: 0.105, radiusY: 0.085, core: 0.30, gain: 0.90, bulge: 0.06, anchorHold: 0.34, maxStretch: 0.115 },
  { id: 'brow-l-outer', label: 'бровь', indices: [70, 63], anchorIndices: [105], radiusX: 0.075, radiusY: 0.052, core: 0.38, gain: 1.00, bulge: 0.08, anchorHold: 0.30, maxStretch: 0.105 },
  { id: 'brow-l-inner', label: 'бровь', indices: [105, 107], anchorIndices: [168], radiusX: 0.068, radiusY: 0.050, core: 0.38, gain: 1.00, bulge: 0.08, anchorHold: 0.36, maxStretch: 0.100 },
  { id: 'brow-r-inner', label: 'бровь', indices: [334, 336], anchorIndices: [168], radiusX: 0.068, radiusY: 0.050, core: 0.38, gain: 1.00, bulge: 0.08, anchorHold: 0.36, maxStretch: 0.100 },
  { id: 'brow-r-outer', label: 'бровь', indices: [300, 293], anchorIndices: [334], radiusX: 0.075, radiusY: 0.052, core: 0.38, gain: 1.00, bulge: 0.08, anchorHold: 0.30, maxStretch: 0.105 },
  { id: 'eye-l-outer', label: 'глаз', indices: [33], anchorIndices: [133], radiusX: 0.064, radiusY: 0.052, core: 0.42, gain: 0.94, bulge: 0.10, anchorHold: 0.22, maxStretch: 0.095 },
  { id: 'eye-l-center', label: 'глаз', indices: [468, 469, 470, 471, 472], anchorIndices: [168], radiusX: 0.066, radiusY: 0.055, core: 0.46, gain: 0.94, bulge: 0.12, anchorHold: 0.20, maxStretch: 0.090 },
  { id: 'eye-l-inner', label: 'глаз', indices: [133], anchorIndices: [33], radiusX: 0.060, radiusY: 0.050, core: 0.42, gain: 0.92, bulge: 0.10, anchorHold: 0.22, maxStretch: 0.090 },
  { id: 'eye-r-inner', label: 'глаз', indices: [362], anchorIndices: [263], radiusX: 0.060, radiusY: 0.050, core: 0.42, gain: 0.92, bulge: 0.10, anchorHold: 0.22, maxStretch: 0.090 },
  { id: 'eye-r-center', label: 'глаз', indices: [473, 474, 475, 476, 477], anchorIndices: [168], radiusX: 0.066, radiusY: 0.055, core: 0.46, gain: 0.94, bulge: 0.12, anchorHold: 0.20, maxStretch: 0.090 },
  { id: 'eye-r-outer', label: 'глаз', indices: [263], anchorIndices: [362], radiusX: 0.064, radiusY: 0.052, core: 0.42, gain: 0.94, bulge: 0.10, anchorHold: 0.22, maxStretch: 0.095 },
  { id: 'nose-bridge', label: 'переносица', indices: [168, 6], anchorIndices: [168], radiusX: 0.060, radiusY: 0.085, core: 0.34, gain: 0.98, bulge: 0.08, anchorHold: 0.46, maxStretch: 0.100 },
  { id: 'nose-tip', label: 'нос', indices: [1, 4], anchorIndices: [168, 6], radiusX: 0.072, radiusY: 0.082, core: 0.48, gain: 1.08, bulge: 0.16, anchorHold: 0.52, maxStretch: 0.125 },
  { id: 'nose-l', label: 'крыло носа', indices: [98], anchorIndices: [6], radiusX: 0.058, radiusY: 0.058, core: 0.44, gain: 1.02, bulge: 0.13, anchorHold: 0.42, maxStretch: 0.100 },
  { id: 'nose-r', label: 'крыло носа', indices: [327], anchorIndices: [6], radiusX: 0.058, radiusY: 0.058, core: 0.44, gain: 1.02, bulge: 0.13, anchorHold: 0.42, maxStretch: 0.100 },
  { id: 'cheek-l', label: 'скула', indices: [205, 187], anchorIndices: [1], radiusX: 0.092, radiusY: 0.080, core: 0.36, gain: 0.98, bulge: 0.10, anchorHold: 0.22, maxStretch: 0.125 },
  { id: 'cheek-r', label: 'скула', indices: [425, 411], anchorIndices: [1], radiusX: 0.092, radiusY: 0.080, core: 0.36, gain: 0.98, bulge: 0.10, anchorHold: 0.22, maxStretch: 0.125 },
  { id: 'mouth-l', label: 'угол рта', indices: [61], anchorIndices: [13, 14], radiusX: 0.064, radiusY: 0.055, core: 0.46, gain: 1.03, bulge: 0.12, anchorHold: 0.28, maxStretch: 0.110 },
  { id: 'lip-top', label: 'верхняя губа', indices: [13], anchorIndices: [0], radiusX: 0.080, radiusY: 0.048, core: 0.52, gain: 0.98, bulge: 0.14, anchorHold: 0.30, maxStretch: 0.100 },
  { id: 'lip-bottom', label: 'нижняя губа', indices: [14], anchorIndices: [17], radiusX: 0.080, radiusY: 0.048, core: 0.52, gain: 0.98, bulge: 0.14, anchorHold: 0.30, maxStretch: 0.100 },
  { id: 'mouth-r', label: 'угол рта', indices: [291], anchorIndices: [13, 14], radiusX: 0.064, radiusY: 0.055, core: 0.46, gain: 1.03, bulge: 0.12, anchorHold: 0.28, maxStretch: 0.110 },
  { id: 'jaw-l', label: 'челюсть', indices: [172, 136], anchorIndices: [152], radiusX: 0.088, radiusY: 0.085, core: 0.34, gain: 1.02, bulge: 0.08, anchorHold: 0.34, maxStretch: 0.125 },
  { id: 'chin', label: 'подбородок', indices: [152], anchorIndices: [17], radiusX: 0.094, radiusY: 0.080, core: 0.42, gain: 1.04, bulge: 0.10, anchorHold: 0.42, maxStretch: 0.130 },
  { id: 'jaw-r', label: 'челюсть', indices: [397, 365], anchorIndices: [152], radiusX: 0.088, radiusY: 0.085, core: 0.34, gain: 1.02, bulge: 0.08, anchorHold: 0.34, maxStretch: 0.125 },
  { id: 'temple-l', label: 'висок', indices: [127, 234], anchorIndices: [168], radiusX: 0.088, radiusY: 0.082, core: 0.34, gain: 0.96, bulge: 0.07, anchorHold: 0.24, maxStretch: 0.115 },
  { id: 'temple-r', label: 'висок', indices: [356, 454], anchorIndices: [168], radiusX: 0.088, radiusY: 0.082, core: 0.34, gain: 0.96, bulge: 0.07, anchorHold: 0.24, maxStretch: 0.115 },
  { id: 'ear-l', label: 'ухо', indices: [127, 234], anchorIndices: [234], rawOffset: { x: -0.052, y: 0.01 }, radiusX: 0.078, radiusY: 0.094, core: 0.45, gain: 1.02, bulge: 0.12, anchorHold: 0.44, maxStretch: 0.135, synthetic: true },
  { id: 'ear-r', label: 'ухо', indices: [356, 454], anchorIndices: [454], rawOffset: { x: 0.052, y: 0.01 }, radiusX: 0.078, radiusY: 0.094, core: 0.45, gain: 1.02, bulge: 0.12, anchorHold: 0.44, maxStretch: 0.135, synthetic: true }
];

function averageLandmarks(landmarks, indices) {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const index of indices || []) {
    const point = landmarks[index];
    if (!point) continue;
    x += point.x;
    y += point.y;
    count += 1;
  }
  return count ? { x: x / count, y: y / count } : null;
}

export function createFeatureNodes() {
  return FEATURES.map((feature) => ({
    ...feature,
    base: { x: 0.5, y: 0.5 },
    targetBase: { x: 0.5, y: 0.5 },
    anchor: { x: 0.5, y: 0.5 },
    targetAnchor: { x: 0.5, y: 0.5 },
    offset: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    visible: false,
    confidence: 0,
    grabbedBy: null,
    lastGrabPoint: null,
    lastGrabTime: 0
  }));
}

export function updateFeatureTargets(nodes, landmarks, mapLandmarkToScreen) {
  const valid = Array.isArray(landmarks) && landmarks.length >= 468;
  for (const node of nodes) {
    if (!valid) {
      node.visible = false;
      node.confidence *= 0.84;
      continue;
    }

    const center = averageLandmarks(landmarks, node.indices);
    if (!center) {
      node.visible = false;
      continue;
    }
    if (node.rawOffset) {
      center.x += node.rawOffset.x;
      center.y += node.rawOffset.y;
    }

    const anchorRaw = averageLandmarks(landmarks, node.anchorIndices) || center;
    const mapped = mapLandmarkToScreen(center);
    const anchorMapped = mapLandmarkToScreen(anchorRaw);
    node.targetBase.x = mapped.x;
    node.targetBase.y = mapped.y;
    node.targetAnchor.x = anchorMapped.x;
    node.targetAnchor.y = anchorMapped.y;
    node.visible = mapped.x > -0.10 && mapped.x < 1.10 && mapped.y > -0.10 && mapped.y < 1.10;
    node.confidence = Math.min(1, node.confidence + 0.30);
  }
}

export function nearestFeature(nodes, point, maxDistance = 0.096) {
  let best = null;
  let bestDistance = maxDistance;
  for (const node of nodes) {
    if (!node.visible || node.grabbedBy !== null || node.confidence < 0.08) continue;
    const dx = node.base.x + node.offset.x - point.x;
    const dy = node.base.y + node.offset.y - point.y;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

export function stepFeaturePhysics(nodes, dt, reducedMotion = false) {
  const safeDt = Math.min(0.034, Math.max(0.001, dt));
  const tracking = 1 - Math.exp(-safeDt * 24);
  const spring = reducedMotion ? 110 : 72;
  const damping = reducedMotion ? 24 : 13.2;

  for (const node of nodes) {
    if (node.grabbedBy === null) {
      const ax = -spring * node.offset.x - damping * node.velocity.x;
      const ay = -spring * node.offset.y - damping * node.velocity.y;
      node.velocity.x += ax * safeDt;
      node.velocity.y += ay * safeDt;
      node.offset.x += node.velocity.x * safeDt;
      node.offset.y += node.velocity.y * safeDt;

      if (Math.hypot(node.offset.x, node.offset.y) < 0.00028 && Math.hypot(node.velocity.x, node.velocity.y) < 0.002) {
        node.offset.x = 0;
        node.offset.y = 0;
        node.velocity.x = 0;
        node.velocity.y = 0;
      }
    }

    node.base.x += (node.targetBase.x - node.base.x) * tracking;
    node.base.y += (node.targetBase.y - node.base.y) * tracking;
    node.anchor.x += (node.targetAnchor.x - node.anchor.x) * tracking;
    node.anchor.y += (node.targetAnchor.y - node.anchor.y) * tracking;
  }
}

export function grabFeature(node, owner, point, timestamp) {
  node.grabbedBy = owner;
  node.lastGrabPoint = { x: point.x, y: point.y };
  node.lastGrabTime = timestamp;
  node.velocity.x = 0;
  node.velocity.y = 0;
}

export function moveGrabbedFeature(node, point, timestamp) {
  const dt = Math.max(0.008, Math.min(0.05, (timestamp - node.lastGrabTime) / 1000 || 0.016));
  const desiredX = point.x - node.base.x;
  const desiredY = point.y - node.base.y;
  const length = Math.hypot(desiredX, desiredY);
  const max = node.maxStretch || 0.12;
  const scale = length > max ? max / length : 1;
  const nextX = desiredX * scale;
  const nextY = desiredY * scale;
  const velocityX = (nextX - node.offset.x) / dt;
  const velocityY = (nextY - node.offset.y) / dt;
  const velocityLength = Math.hypot(velocityX, velocityY);
  const velocityScale = velocityLength > 3.2 ? 3.2 / velocityLength : 1;
  node.velocity.x = velocityX * velocityScale;
  node.velocity.y = velocityY * velocityScale;
  node.offset.x = nextX;
  node.offset.y = nextY;
  node.lastGrabPoint = { x: point.x, y: point.y };
  node.lastGrabTime = timestamp;
}

export function releaseFeature(node) {
  node.grabbedBy = null;
  node.lastGrabPoint = null;
  return Math.min(1, Math.hypot(node.offset.x, node.offset.y) / Math.max(0.08, node.maxStretch || 0.12));
}

export const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];
