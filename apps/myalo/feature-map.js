const FEATURES = [
  { id: 'forehead', label: 'лоб', indices: [10], anchorIndices: [168], radiusX: 0.105, radiusY: 0.088, core: 0.30, gain: 0.94, anchorHold: 0.30, maxStretch: 0.155, renderKind: 0, rootWidth: 0.70, capScale: 1.05, depth: 0.50, softness: 0.92 },
  { id: 'brow-l-outer', label: 'бровь', indices: [70, 63], anchorIndices: [105], radiusX: 0.074, radiusY: 0.046, core: 0.42, gain: 1.02, anchorHold: 0.36, maxStretch: 0.142, renderKind: 5, rootWidth: 0.38, capScale: 1.00, depth: 0.36, softness: 0.78 },
  { id: 'brow-l-inner', label: 'бровь', indices: [105, 107], anchorIndices: [168], radiusX: 0.068, radiusY: 0.044, core: 0.42, gain: 1.02, anchorHold: 0.42, maxStretch: 0.138, renderKind: 5, rootWidth: 0.36, capScale: 1.00, depth: 0.36, softness: 0.78 },
  { id: 'brow-r-inner', label: 'бровь', indices: [334, 336], anchorIndices: [168], radiusX: 0.068, radiusY: 0.044, core: 0.42, gain: 1.02, anchorHold: 0.42, maxStretch: 0.138, renderKind: 5, rootWidth: 0.36, capScale: 1.00, depth: 0.36, softness: 0.78 },
  { id: 'brow-r-outer', label: 'бровь', indices: [300, 293], anchorIndices: [334], radiusX: 0.074, radiusY: 0.046, core: 0.42, gain: 1.02, anchorHold: 0.36, maxStretch: 0.142, renderKind: 5, rootWidth: 0.38, capScale: 1.00, depth: 0.36, softness: 0.78 },

  { id: 'eye-l-outer', label: 'глаз', indices: [33], anchorIndices: [133], radiusX: 0.064, radiusY: 0.050, core: 0.50, gain: 0.98, anchorHold: 0.28, maxStretch: 0.125, renderKind: 3, rootWidth: 0.38, capScale: 0.98, depth: 0.56, softness: 0.72 },
  { id: 'eye-l-center', label: 'глаз', indices: [468, 469, 470, 471, 472], anchorIndices: [168], radiusX: 0.068, radiusY: 0.054, core: 0.56, gain: 0.98, anchorHold: 0.28, maxStretch: 0.122, renderKind: 3, rootWidth: 0.40, capScale: 0.98, depth: 0.62, softness: 0.70 },
  { id: 'eye-l-inner', label: 'глаз', indices: [133], anchorIndices: [33], radiusX: 0.060, radiusY: 0.048, core: 0.50, gain: 0.96, anchorHold: 0.28, maxStretch: 0.122, renderKind: 3, rootWidth: 0.38, capScale: 0.98, depth: 0.54, softness: 0.72 },
  { id: 'eye-r-inner', label: 'глаз', indices: [362], anchorIndices: [263], radiusX: 0.060, radiusY: 0.048, core: 0.50, gain: 0.96, anchorHold: 0.28, maxStretch: 0.122, renderKind: 3, rootWidth: 0.38, capScale: 0.98, depth: 0.54, softness: 0.72 },
  { id: 'eye-r-center', label: 'глаз', indices: [473, 474, 475, 476, 477], anchorIndices: [168], radiusX: 0.068, radiusY: 0.054, core: 0.56, gain: 0.98, anchorHold: 0.28, maxStretch: 0.122, renderKind: 3, rootWidth: 0.40, capScale: 0.98, depth: 0.62, softness: 0.70 },
  { id: 'eye-r-outer', label: 'глаз', indices: [263], anchorIndices: [362], radiusX: 0.064, radiusY: 0.050, core: 0.50, gain: 0.98, anchorHold: 0.28, maxStretch: 0.125, renderKind: 3, rootWidth: 0.38, capScale: 0.98, depth: 0.56, softness: 0.72 },

  { id: 'nose-bridge', label: 'переносица', indices: [168, 6], anchorIndices: [168], radiusX: 0.060, radiusY: 0.086, core: 0.42, gain: 1.02, anchorHold: 0.56, maxStretch: 0.155, renderKind: 1, rootWidth: 0.48, capScale: 0.98, depth: 0.72, softness: 0.70 },
  { id: 'nose-tip', label: 'нос', indices: [1, 4], anchorIndices: [168, 6], radiusX: 0.074, radiusY: 0.084, core: 0.58, gain: 1.12, anchorHold: 0.82, maxStretch: 0.215, renderKind: 1, rootWidth: 0.52, capScale: 1.00, depth: 0.88, softness: 0.66 },
  { id: 'nose-l', label: 'крыло носа', indices: [98], anchorIndices: [6], radiusX: 0.058, radiusY: 0.058, core: 0.52, gain: 1.06, anchorHold: 0.58, maxStretch: 0.150, renderKind: 1, rootWidth: 0.46, capScale: 0.98, depth: 0.72, softness: 0.70 },
  { id: 'nose-r', label: 'крыло носа', indices: [327], anchorIndices: [6], radiusX: 0.058, radiusY: 0.058, core: 0.52, gain: 1.06, anchorHold: 0.58, maxStretch: 0.150, renderKind: 1, rootWidth: 0.46, capScale: 0.98, depth: 0.72, softness: 0.70 },

  { id: 'cheek-l', label: 'скула', indices: [205, 187], anchorIndices: [1], radiusX: 0.098, radiusY: 0.084, core: 0.38, gain: 1.04, anchorHold: 0.25, maxStretch: 0.185, renderKind: 0, rootWidth: 0.78, capScale: 1.08, depth: 0.62, softness: 0.94 },
  { id: 'cheek-r', label: 'скула', indices: [425, 411], anchorIndices: [1], radiusX: 0.098, radiusY: 0.084, core: 0.38, gain: 1.04, anchorHold: 0.25, maxStretch: 0.185, renderKind: 0, rootWidth: 0.78, capScale: 1.08, depth: 0.62, softness: 0.94 },

  { id: 'mouth-l', label: 'угол рта', indices: [61], anchorIndices: [13, 14], radiusX: 0.064, radiusY: 0.052, core: 0.54, gain: 1.06, anchorHold: 0.42, maxStretch: 0.165, renderKind: 2, rootWidth: 0.36, capScale: 1.00, depth: 0.62, softness: 0.70 },
  { id: 'lip-top', label: 'верхняя губа', indices: [13], anchorIndices: [0], radiusX: 0.082, radiusY: 0.046, core: 0.60, gain: 1.04, anchorHold: 0.46, maxStretch: 0.155, renderKind: 2, rootWidth: 0.38, capScale: 1.00, depth: 0.66, softness: 0.68 },
  { id: 'lip-bottom', label: 'нижняя губа', indices: [14], anchorIndices: [17], radiusX: 0.082, radiusY: 0.046, core: 0.60, gain: 1.04, anchorHold: 0.46, maxStretch: 0.155, renderKind: 2, rootWidth: 0.38, capScale: 1.00, depth: 0.66, softness: 0.68 },
  { id: 'mouth-r', label: 'угол рта', indices: [291], anchorIndices: [13, 14], radiusX: 0.064, radiusY: 0.052, core: 0.54, gain: 1.06, anchorHold: 0.42, maxStretch: 0.165, renderKind: 2, rootWidth: 0.36, capScale: 1.00, depth: 0.62, softness: 0.70 },

  { id: 'jaw-l', label: 'челюсть', indices: [172, 136], anchorIndices: [152], radiusX: 0.092, radiusY: 0.088, core: 0.38, gain: 1.06, anchorHold: 0.38, maxStretch: 0.180, renderKind: 0, rootWidth: 0.76, capScale: 1.08, depth: 0.58, softness: 0.92 },
  { id: 'chin', label: 'подбородок', indices: [152], anchorIndices: [17], radiusX: 0.098, radiusY: 0.084, core: 0.42, gain: 1.08, anchorHold: 0.46, maxStretch: 0.190, renderKind: 0, rootWidth: 0.76, capScale: 1.08, depth: 0.62, softness: 0.92 },
  { id: 'jaw-r', label: 'челюсть', indices: [397, 365], anchorIndices: [152], radiusX: 0.092, radiusY: 0.088, core: 0.38, gain: 1.06, anchorHold: 0.38, maxStretch: 0.180, renderKind: 0, rootWidth: 0.76, capScale: 1.08, depth: 0.58, softness: 0.92 },

  { id: 'temple-l', label: 'висок', indices: [127, 234], anchorIndices: [168], radiusX: 0.090, radiusY: 0.084, core: 0.36, gain: 1.00, anchorHold: 0.28, maxStretch: 0.165, renderKind: 0, rootWidth: 0.74, capScale: 1.06, depth: 0.52, softness: 0.94 },
  { id: 'temple-r', label: 'висок', indices: [356, 454], anchorIndices: [168], radiusX: 0.090, radiusY: 0.084, core: 0.36, gain: 1.00, anchorHold: 0.28, maxStretch: 0.165, renderKind: 0, rootWidth: 0.74, capScale: 1.06, depth: 0.52, softness: 0.94 },

  { id: 'ear-l', label: 'ухо', indices: [127, 234], anchorIndices: [234], rawOffset: { x: -0.052, y: 0.01 }, radiusX: 0.080, radiusY: 0.096, core: 0.54, gain: 1.06, anchorHold: 0.72, maxStretch: 0.220, renderKind: 4, rootWidth: 0.54, capScale: 1.02, depth: 0.76, softness: 0.72, synthetic: true },
  { id: 'ear-r', label: 'ухо', indices: [356, 454], anchorIndices: [454], rawOffset: { x: 0.052, y: 0.01 }, radiusX: 0.080, radiusY: 0.096, core: 0.54, gain: 1.06, anchorHold: 0.72, maxStretch: 0.220, renderKind: 4, rootWidth: 0.54, capScale: 1.02, depth: 0.76, softness: 0.72, synthetic: true }
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
      node.confidence *= 0.86;
      continue;
    }

    const center = averageLandmarks(landmarks, node.indices);
    const anchorPoint = averageLandmarks(landmarks, node.anchorIndices) || center;
    if (!center || !anchorPoint) {
      node.visible = false;
      continue;
    }

    if (node.rawOffset) {
      center.x += node.rawOffset.x;
      center.y += node.rawOffset.y;
    }

    const mapped = mapLandmarkToScreen(center);
    const mappedAnchor = mapLandmarkToScreen(anchorPoint);
    node.targetBase.x = mapped.x;
    node.targetBase.y = mapped.y;
    node.targetAnchor.x = mappedAnchor.x;
    node.targetAnchor.y = mappedAnchor.y;
    node.visible = mapped.x > -0.12 && mapped.x < 1.12 && mapped.y > -0.12 && mapped.y < 1.12;
    node.confidence = Math.min(1, node.confidence + 0.24);
  }
}

export function seedFallbackNodes(nodes) {
  const fallback = [
    [0.5, 0.23], [0.34, 0.32], [0.43, 0.31], [0.57, 0.31], [0.66, 0.32],
    [0.31, 0.39], [0.40, 0.39], [0.46, 0.39], [0.54, 0.39], [0.60, 0.39], [0.69, 0.39],
    [0.5, 0.42], [0.5, 0.49], [0.44, 0.51], [0.56, 0.51], [0.35, 0.54], [0.65, 0.54],
    [0.39, 0.63], [0.5, 0.61], [0.5, 0.66], [0.61, 0.63], [0.34, 0.69], [0.5, 0.77], [0.66, 0.69],
    [0.27, 0.48], [0.73, 0.48], [0.21, 0.5], [0.79, 0.5]
  ];
  nodes.forEach((node, index) => {
    const point = fallback[index] || [0.5, 0.5];
    node.targetBase.x = point[0];
    node.targetBase.y = point[1];
    node.base.x = point[0];
    node.base.y = point[1];
    node.targetAnchor.x = point[0];
    node.targetAnchor.y = point[1] - 0.035;
    node.anchor.x = node.targetAnchor.x;
    node.anchor.y = node.targetAnchor.y;
    node.visible = true;
    node.confidence = 0.42;
  });
}

export function nearestFeature(nodes, point, maxDistance = 0.105) {
  let best = null;
  let bestDistance = maxDistance;
  for (const node of nodes) {
    if (!node.visible || node.grabbedBy !== null) continue;
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
  const safeDt = Math.min(0.032, Math.max(0.001, dt));
  const tracking = 1 - Math.exp(-safeDt * 20);
  const spring = reducedMotion ? 96 : 52;
  const damping = reducedMotion ? 23 : 10.2;

  for (const node of nodes) {
    if (node.grabbedBy === null) {
      const ax = -spring * node.offset.x - damping * node.velocity.x;
      const ay = -spring * node.offset.y - damping * node.velocity.y;
      node.velocity.x += ax * safeDt;
      node.velocity.y += ay * safeDt;
      node.offset.x += node.velocity.x * safeDt;
      node.offset.y += node.velocity.y * safeDt;

      if (Math.hypot(node.offset.x, node.offset.y) < 0.00035 && Math.hypot(node.velocity.x, node.velocity.y) < 0.0025) {
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
  const max = node.maxStretch || 0.14;
  const scale = length > max ? max / length : 1;
  const nextX = desiredX * scale;
  const nextY = desiredY * scale;
  node.velocity.x = (nextX - node.offset.x) / dt;
  node.velocity.y = (nextY - node.offset.y) / dt;
  node.offset.x = nextX;
  node.offset.y = nextY;
  node.lastGrabPoint = { x: point.x, y: point.y };
  node.lastGrabTime = timestamp;
}

export function releaseFeature(node) {
  node.grabbedBy = null;
  node.lastGrabPoint = null;
  return Math.min(1, Math.hypot(node.offset.x, node.offset.y) / Math.max(0.1, node.maxStretch || 0.14));
}

export const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];
