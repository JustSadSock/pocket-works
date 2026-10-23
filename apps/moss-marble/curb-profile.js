// Shared outline geometry for one continuous limestone rim.
// Spatial profile only: it never changes the physics polygon or saved levels.
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function ringArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * .5;
}

function unitOutward(a, b, winding) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dy / d * winding, y: -dx / d * winding };
}

export function makeStoneRimProfile(outline, heightAt = () => 0, settings = {}) {
  const points = outline?.length > 2 ? [...outline] : [];
  if (points.length > 3 && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < .01) points.pop();
  if (points.length < 3) return [];
  const winding = ringArea(points) >= 0 ? 1 : -1;
  const width = clamp(Number(settings.width || 21), 10, 38);
  const height = clamp(Number(settings.height || 16), 10, 28);

  return points.map((p, i) => {
    const before = points[(i + points.length - 1) % points.length];
    const after = points[(i + 1) % points.length];
    const prevN = unitOutward(before, p, winding);
    const nextN = unitOutward(p, after, winding);
    const sumX = prevN.x + nextN.x, sumY = prevN.y + nextN.y;
    const sumLength = Math.hypot(sumX, sumY) || 1;
    const normal = { x: sumX / sumLength, y: sumY / sumLength };
    // Restrict the miter at sharp reflex corners to prevent giant stone spikes.
    const factor = clamp(1 / Math.max(.25, normal.x * nextN.x + normal.y * nextN.y), 1, 1.65);
    const offsetX = normal.x * factor;
    const offsetY = normal.y * factor;
    const ground = Number(heightAt(p.x - normal.x * 13, p.y - normal.y * 13)) || 0;
    const pos = (spread, z) => [p.x + offsetX * spread, p.y + offsetY * spread, z];

    return {
      center: [p.x, p.y],
      ground,
      inner: pos(0, ground + height - 4),
      crown: pos(width * .20, ground + height),
      cap: pos(width * .79, ground + height),
      bevel: pos(width, ground + height - 4),
      heel: pos(width, ground - 13)
    };
  });
}
