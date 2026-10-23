import assert from 'node:assert/strict';
import {
  portraitCourseRotation, rotateXY, inverseRotateXY, screenDeltaToWorld,
  screenToWorldPoint, worldToScreenPoint, courseFit, anchoredCameraOffset, clampFollowCenter
} from './camera-space.js';

const horizontal = {
  start: { x: 0, y: 0 }, hole: { x: 1400, y: 180 },
  outline: [{ x: -100, y: -110 }, { x: 1540, y: -110 }, { x: 1540, y: 360 }, { x: -100, y: 360 }]
};
const vertical = {
  start: { x: 70, y: 1430 }, hole: { x: 70, y: 0 },
  outline: [{ x: -100, y: -110 }, { x: 240, y: -110 }, { x: 240, y: 1530 }, { x: -100, y: 1530 }]
};

let checks = 0;
for (const level of [horizontal, vertical]) {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]]) {
    const rotation = portraitCourseRotation(level, width, height);
    if (width >= height) assert.equal(rotation, 0, 'landscape remains unrotated');
    const { scale, bounds, view } = courseFit(level, width, height, rotation);
    assert.ok(Number.isFinite(scale) && scale > 0);
    const center = inverseRotateXY(bounds.centerX, bounds.centerY, rotation);
    const offset = anchoredCameraOffset(center.x, center.y, scale, rotation, view);
    const mapped = level.outline.map(p => worldToScreenPoint(p.x, p.y, 0, scale, offset.x, offset.y, rotation));
    for (const point of mapped) {
      assert.ok(point.x >= -1 && point.x <= width + 1, 'course fits horizontal viewport');
      assert.ok(point.y >= -1 && point.y <= height + 1, 'course fits vertical viewport');
      const world = screenToWorldPoint(point.x, point.y, scale, offset.x, offset.y, rotation);
      assert.ok(Math.hypot(world.x - level.outline[mapped.indexOf(point)].x, world.y - level.outline[mapped.indexOf(point)].y) < .00001);
    }
    for (const [dx, dy] of [[0, 120], [120, -60], [-300, 47]]) {
      const world = screenDeltaToWorld(dx, dy, scale, rotation);
      const screen = rotateXY(world.x, world.y, rotation);
      assert.ok(Math.abs(screen.x * scale - dx) < .000001, 'drag x faithfully maps through camera rotation');
      assert.ok(Math.abs(screen.y * scale * .82 - dy) < .000001, 'drag y faithfully maps through camera rotation');
    }
    const follow = clampFollowCenter(level.start.x, level.start.y, level, scale, rotation, view);
    assert.ok(Number.isFinite(follow.x) && Number.isFinite(follow.y));
    checks++;
  }
}
console.log('Moss & Marble spatial camera checks passed:', checks, 'level × viewport combinations');
