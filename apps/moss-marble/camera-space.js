import { gardenSites } from './garden-identity.js';
import { fitAreaInsets } from './field-guide.js';
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

export function courseViewport(width, height, topHUDHeight = 0, bottomControlsHeight = 0) {
  return fitAreaInsets(width, height, topHUDHeight, bottomControlsHeight);
}

export function courseFit(level, width, height, rotation = 0, topHUDHeight = 0, bottomControlsHeight = 0) {
  // Overview must show the four physical 3D rim mounts as well as the course.
  // These visual-only bounds never participate in collision/pointer physics.
  const scenicPoints = [...(level?.outline || [])];
  for (const site of gardenSites(level)) {
    for (const offset of [[-30,-30],[30,-30],[30,30],[-30,30]]) {
      scenicPoints.push({x:site.x+offset[0],y:site.y+offset[1]});
    }
  }
  const outlineBounds = projectedOutlineBounds(scenicPoints, rotation);
  // Ground bounds alone cut off flags, masonry portals and the nine
  // raised miniatures. An asymmetric top margin reserves their actual
  // vertical silhouettes in the overview, without distorting the level.
  const verticalRoom = level?.course18 ? 145 / VERTICAL_COMPRESSION : 112 / VERTICAL_COMPRESSION;
  const bounds = {
    ...outlineBounds,
    minY: outlineBounds.minY - verticalRoom,
    height: outlineBounds.height + verticalRoom,
    centerY: outlineBounds.centerY - verticalRoom * .5
  };
  const view = courseViewport(width, height, topHUDHeight, bottomControlsHeight);
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

/**
 * Preserve touch affordance near the ball at the extreme ends of a course.
 * Fit the *ball*, not just the board outline, between HUD and bottom instruments.
 * This is a view-only translation; it never changes world coordinates.
 */
export function keepFocusInSafeArea(cameraX, cameraY, focusX, focusY, focusZ, scale, rotation, view, margin = 46) {
  const safeScale = Math.max(.00001, Number(scale) || 1);
  const center = rotateXY(cameraX, cameraY, rotation);
  const offset = anchoredCameraOffset(cameraX, cameraY, safeScale, rotation, view);
  const point = worldToScreenPoint(focusX, focusY, focusZ, safeScale, offset.x, offset.y, rotation);
  const left = view.centerX - view.width * .5 + margin;
  const right = view.centerX + view.width * .5 - margin;
  const top = view.top + margin;
  const bottom = view.top + view.height - margin;
  const boundedX = clamp(point.x, Math.min(left,right), Math.max(left,right));
  const boundedY = clamp(point.y, Math.min(top,bottom), Math.max(top,bottom));
  return inverseRotateXY(
    center.x + (point.x - boundedX) / safeScale,
    center.y + (point.y - boundedY) / (safeScale * VERTICAL_COMPRESSION),
    rotation
  );
}
