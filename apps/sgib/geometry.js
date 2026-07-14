export const EPSILON = 1e-6;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length < EPSILON) return { x: 0, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

export function lineFromGesture(start, end) {
  const drag = { x: end.x - start.x, y: end.y - start.y };
  const length = Math.hypot(drag.x, drag.y);
  if (length < EPSILON) return null;
  const normal = { x: drag.x / length, y: drag.y / length };
  const tangent = { x: -normal.y, y: normal.x };
  return {
    point: { x: (start.x + end.x) * 0.5, y: (start.y + end.y) * 0.5 },
    normal,
    tangent,
    length
  };
}

export function signedDistance(point, line) {
  return (point.x - line.point.x) * line.normal.x + (point.y - line.point.y) * line.normal.y;
}

export function reflectPoint(point, line) {
  const d = signedDistance(point, line);
  return {
    x: point.x - 2 * d * line.normal.x,
    y: point.y - 2 * d * line.normal.y
  };
}

export function transformFoldPoint(point, line, angle, lift = 0.105) {
  const d = signedDistance(point, line);
  const projected = {
    x: point.x - d * line.normal.x,
    y: point.y - d * line.normal.y
  };
  const depth = Math.abs(d) * Math.sin(angle);
  return {
    x: projected.x + line.normal.x * d * Math.cos(angle),
    y: projected.y + line.normal.y * d * Math.cos(angle) - depth * lift,
    depth
  };
}

export function polygonArea(polygon) {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) * 0.5;
}

export function polygonCentroid(polygon) {
  if (!polygon.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of polygon) {
    x += point.x;
    y += point.y;
  }
  return { x: x / polygon.length, y: y / polygon.length };
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function clipPolygon(polygon, line, keepPositive) {
  if (polygon.length < 3) return [];
  const result = [];
  const isInside = (value) => keepPositive ? value >= -EPSILON : value <= EPSILON;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentDistance = signedDistance(current, line);
    const nextDistance = signedDistance(next, line);
    const currentInside = isInside(currentDistance);
    const nextInside = isInside(nextDistance);

    if (currentInside) result.push({ x: current.x, y: current.y });
    if (currentInside !== nextInside) {
      const denominator = currentDistance - nextDistance;
      const t = Math.abs(denominator) < EPSILON ? 0 : currentDistance / denominator;
      result.push({
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t
      });
    }
  }

  return dedupePolygon(result);
}

export function dedupePolygon(polygon) {
  const output = [];
  for (const point of polygon) {
    const previous = output[output.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.01) {
      output.push(point);
    }
  }
  if (output.length > 2) {
    const first = output[0];
    const last = output[output.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.01) output.pop();
  }
  return output.length >= 3 ? output : [];
}

export function reflectPolygon(polygon, line) {
  return polygon.map((point) => reflectPoint(point, line)).reverse();
}

export function transformPolygon(polygon, line, angle) {
  return polygon.map((point) => transformFoldPoint(point, line, angle));
}

export function lineCrossesPolygon(line, polygon) {
  let hasPositive = false;
  let hasNegative = false;
  for (const point of polygon) {
    const value = signedDistance(point, line);
    if (value > 0.5) hasPositive = true;
    if (value < -0.5) hasNegative = true;
  }
  return hasPositive && hasNegative;
}

export function lineSegmentForBounds(line, extent = 1800) {
  return {
    a: {
      x: line.point.x - line.tangent.x * extent,
      y: line.point.y - line.tangent.y * extent
    },
    b: {
      x: line.point.x + line.tangent.x * extent,
      y: line.point.y + line.tangent.y * extent
    }
  };
}
