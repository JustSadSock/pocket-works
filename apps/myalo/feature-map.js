const FEATURES = [
  { id: 'forehead', label: 'лоб', indices: [10], radius: 0.125, gain: 0.92 },
  { id: 'brow-l-outer', label: 'бровь', indices: [70, 63], radius: 0.105, gain: 1.05 },
  { id: 'brow-l-inner', label: 'бровь', indices: [105, 107], radius: 0.1, gain: 1.0 },
  { id: 'brow-r-inner', label: 'бровь', indices: [334, 336], radius: 0.1, gain: 1.0 },
  { id: 'brow-r-outer', label: 'бровь', indices: [300, 293], radius: 0.105, gain: 1.05 },
  { id: 'eye-l-outer', label: 'глаз', indices: [33], radius: 0.09, gain: 0.92 },
  { id: 'eye-l-center', label: 'глаз', indices: [468, 469, 470, 471, 472], radius: 0.09, gain: 0.9 },
  { id: 'eye-l-inner', label: 'глаз', indices: [133], radius: 0.085, gain: 0.88 },
  { id: 'eye-r-inner', label: 'глаз', indices: [362], radius: 0.085, gain: 0.88 },
  { id: 'eye-r-center', label: 'глаз', indices: [473, 474, 475, 476, 477], radius: 0.09, gain: 0.9 },
  { id: 'eye-r-outer', label: 'глаз', indices: [263], radius: 0.09, gain: 0.92 },
  { id: 'nose-bridge', label: 'переносица', indices: [168, 6], radius: 0.11, gain: 1.0 },
  { id: 'nose-tip', label: 'нос', indices: [1, 4], radius: 0.13, gain: 1.16 },
  { id: 'nose-l', label: 'крыло носа', indices: [98], radius: 0.095, gain: 1.02 },
  { id: 'nose-r', label: 'крыло носа', indices: [327], radius: 0.095, gain: 1.02 },
  { id: 'cheek-l', label: 'скула', indices: [205, 187], radius: 0.145, gain: 1.0 },
  { id: 'cheek-r', label: 'скула', indices: [425, 411], radius: 0.145, gain: 1.0 },
  { id: 'mouth-l', label: 'угол рта', indices: [61], radius: 0.1, gain: 1.0 },
  { id: 'lip-top', label: 'верхняя губа', indices: [13], radius: 0.085, gain: 0.9 },
  { id: 'lip-bottom', label: 'нижняя губа', indices: [14], radius: 0.085, gain: 0.9 },
  { id: 'mouth-r', label: 'угол рта', indices: [291], radius: 0.1, gain: 1.0 },
  { id: 'jaw-l', label: 'челюсть', indices: [172, 136], radius: 0.135, gain: 1.08 },
  { id: 'chin', label: 'подбородок', indices: [152], radius: 0.145, gain: 1.12 },
  { id: 'jaw-r', label: 'челюсть', indices: [397, 365], radius: 0.135, gain: 1.08 },
  { id: 'temple-l', label: 'висок', indices: [127, 234], radius: 0.13, gain: 1.0 },
  { id: 'temple-r', label: 'висок', indices: [356, 454], radius: 0.13, gain: 1.0 },
  { id: 'ear-l', label: 'ухо', indices: [127, 234], rawOffset: { x: -0.052, y: 0.01 }, radius: 0.12, gain: 1.12, synthetic: true },
  { id: 'ear-r', label: 'ухо', indices: [356, 454], rawOffset: { x: 0.052, y: 0.01 }, radius: 0.12, gain: 1.12, synthetic: true }
];

export function createFeatureNodes() {
  return FEATURES.map((feature) => ({
    ...feature,
    base: { x: 0.5, y: 0.5 },
    targetBase: { x: 0.5, y: 0.5 },
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

    let x = 0;
    let y = 0;
    let count = 0;
    for (const index of node.indices) {
      const point = landmarks[index];
      if (!point) continue;
      x += point.x;
      y += point.y;
      count += 1;
    }
    if (!count) {
      node.visible = false;
      continue;
    }

    x /= count;
    y /= count;
    if (node.rawOffset) {
      x += node.rawOffset.x;
      y += node.rawOffset.y;
    }

    const mapped = mapLandmarkToScreen({ x, y });
    node.targetBase.x = mapped.x;
    node.targetBase.y = mapped.y;
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
  const tracking = 1 - Math.exp(-safeDt * 19);
  const spring = reducedMotion ? 95 : 54;
  const damping = reducedMotion ? 22 : 10.5;

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
  const max = 0.25;
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
  return Math.min(1, Math.hypot(node.offset.x, node.offset.y) / 0.18);
}

export const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];
