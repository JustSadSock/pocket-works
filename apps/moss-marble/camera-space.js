// A single projection contract shared by WebGL, Canvas, pointer input and the camera.
// Rotating the *view* never changes a level, its seed or its physical colliders.
export const VERTICAL_COMPRESSION = .82;
const TAU = Math.PI * 2;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function rotateXY(x, y, angle = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function inverseRotateXY(x, y, angle = 0) {
  return rotateXY(x, y, -angle);
}

export function screenDeltaToWorld(dx, dy, scale, rotation = 0) {
  const safeScale = Math.max(.00001, scale || 1);
  return inverseRotateXY(dx / safeScale, dy / (safeScale * VERTICAL_COMPRESSION), rotation);
}

export function worldToScreenPoint(x, y, z, scale, offsetX, offsetY, rotation = 0, parallaxX = 0, parallaxY = 0) {
  const point = rotateXY(x, y, rotation);
  return {
    x: offsetX + point.x * scale + parallaxX * z * scale * .14,
    y: offsetY + point.y * scale * VERTICAL_COMPRESSION - z * scale + parallaxY * z * scale * .09
  };
}

export function screenToWorldPoint(x, y, scale, offsetX, offsetY, rotation = 0) {
  return screenDeltaToWorld(x - offsetX, y - offsetY, scale, rotation);
}

export function portraitCourseRotation(level, width, height) {
  if (width >= 860 || height < width * 1.20 || !level?.start || !level?.hole) return 0;
  const dx = level.hole.x - level.start.x;
  const dy = level.hole.y - level.start.y;
  if (Math.hypot(dx, dy) < 80) return 0;
  const angle = Math.atan2(dx, dy) - Math.PI;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function projectedOutlineBounds(outline, rotation = 0) {
  const points = (outline || []).map(p => rotateXY(p.x, p.y, rotation));
  if (!points.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1, centerX: 0, centerY: 0, width: 1, height: 1 };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, centerX: (minX + maxX) * .5, centerY: (minY + maxY) * .5, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function courseViewport(width, height) {
  const portrait = height >= width * 1.2;
  const top = portrait ? 86 : 64;
  const bottom = portrait ? 106 : 82;
  return {
    width: Math.max(1, width - (portrait ? 28 : 44)),
    height: Math.max(1, height - top - bottom),
    centerX: width * .5,
    centerY: top + (height - top - bottom) * .5,
    top, bottom
  };
}

export function courseFit(level, width, height, rotation = 0) {
  const bounds = projectedOutlineBounds(level?.outline, rotation);
  const view = courseViewport(width, height);
  const scale = clamp(Math.min(view.width / bounds.width, view.height / (bounds.height * VERTICAL_COMPRESSION)), .025, 3);
  return { scale, bounds, view };
}

export function anchoredCameraOffset(cameraX, cameraY, scale, rotation, view) {
  const center = rotateXY(cameraX, cameraY, rotation);
  return {
    x: view.centerX - center.x * scale,
    y: view.centerY - center.y * scale * VERTICAL_COMPRESSION
  };
}

export function clampFollowCenter(x, y, level, scale, rotation, view) {
  const bounds = projectedOutlineBounds(level?.outline, rotation);
  const wanted = rotateXY(x, y, rotation);
  const halfWidth = view.width / Math.max(scale, .0001) * .5;
  const halfHeight = view.height / Math.max(scale, .0001) / VERTICAL_COMPRESSION * .5;
  const clampAxis = (value, min, max, half) => max - min <= half * 2 ? (min + max) * .5 : clamp(value, min + half, max - half);
  const center = {
    x: clampAxis(wanted.x, bounds.minX, bounds.maxX, halfWidth),
    y: clampAxis(wanted.y, bounds.minY, bounds.maxY, halfHeight)
  };
  return inverseRotateXY(center.x, center.y, rotation);
}
