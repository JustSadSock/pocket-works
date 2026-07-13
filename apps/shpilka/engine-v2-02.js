function sampleClosedSpline(anchors, tension) {
  const points = [];
  const count = anchors.length;
  for (let i = 0; i < count; i += 1) {
    const p0 = anchors[(i - 1 + count) % count];
    const p1 = anchors[i];
    const p2 = anchors[(i + 1) % count];
    const p3 = anchors[(i + 2) % count];
    for (let step = 0; step < SAMPLE_STEPS; step += 1) {
      const t = step / SAMPLE_STEPS;
      const point = catmullRom(p0, p1, p2, p3, t, tension);
      point.section = i + t;
      points.push(point);
    }
  }
  return points;
}

function finalizeTrack(points) {
  let length = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    points[i].tx = dx / magnitude;
    points[i].ty = dy / magnitude;
    points[i].nx = -points[i].ty;
    points[i].ny = points[i].tx;
    points[i].heading = Math.atan2(points[i].ty, points[i].tx);
    if (i > 0) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    points[i].distance = length;
    minX = Math.min(minX, points[i].x);
    maxX = Math.max(maxX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxY = Math.max(maxY, points[i].y);
  }
  length += Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y);
  points.totalLength = length;
  points.bounds = { minX, maxX, minY, maxY };

  for (let i = 0; i < points.length; i += 1) {
    const before = points[(i - 6 + points.length) % points.length];
    const after = points[(i + 6) % points.length];
    const span = Math.max(1, Math.hypot(after.x - before.x, after.y - before.y));
    const signed = wrapAngle(after.heading - before.heading) / span;
    points[i].curvature = signed;
  }

  const rawOffsets = points.map((point) => clamp(-point.curvature * 14500, -roadHalf * 0.28, roadHalf * 0.28));
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 0; i < rawOffsets.length; i += 1) {
      rawOffsets[i] = (rawOffsets[(i - 1 + rawOffsets.length) % rawOffsets.length] + rawOffsets[i] * 2 + rawOffsets[(i + 1) % rawOffsets.length]) * 0.25;
    }
  }

  for (let i = 0; i < points.length; i += 1) {
    points[i].raceOffset = rawOffsets[i];
    let maxCurve = 0;
    for (let j = 0; j < 42; j += 3) {
      const index = (i + j) % points.length;
      maxCurve = Math.max(maxCurve, Math.abs(points[index].curvature));
    }
    points[i].speedLimit = clamp(735 / (1 + maxCurve * 4200), 205, 730);
  }

  return points;
}

function trackIsValid(points) {
  if (!points.length || points.totalLength < 3000 || points.totalLength > 6800) return false;
  let sharpSections = 0;
  let maxCurvature = 0;
  for (const point of points) {
    const curvature = Math.abs(point.curvature);
    maxCurvature = Math.max(maxCurvature, curvature);
    if (curvature > 0.0038) sharpSections += 1;
  }
  if (sharpSections < points.length * 0.035 || maxCurvature > 0.031) return false;

  const skip = 9;
  for (let i = 0; i < points.length; i += skip) {
    for (let j = i + 34; j < points.length; j += skip) {
      const cyclic = Math.min(j - i, points.length - (j - i));
      if (cyclic < 34) continue;
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (dx * dx + dy * dy < (roadWidth * 1.22) ** 2) return false;
    }
  }
  return true;
}

function buildFallbackTrack() {
  const anchors = [
    [-760, -130], [-560, -520], [-160, -650], [260, -590], [650, -350], [790, 60],
    [600, 430], [220, 620], [-180, 590], [-360, 300], [-690, 280], [-840, 70]
  ].map(([x, y]) => ({ x, y }));
  return finalizeTrack(sampleClosedSpline(anchors, 0.78));
}

function generateTrack(seed) {
  const seeded = mulberry32(seed);
  roadWidth = Math.round(lerp(150, 176, seeded()));
  roadHalf = roadWidth * 0.5;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const random = mulberry32(hashSeed(seed + attempt * 977));
    const anchorCount = 12 + Math.floor(random() * 6);
    const rx = lerp(580, 900, random());
    const ry = lerp(430, 700, random());
    const rotation = random() * TAU;
    const anchors = [];
    const hairpinA = 1 + Math.floor(random() * (anchorCount - 2));
    const hairpinB = (hairpinA + Math.floor(anchorCount * lerp(0.35, 0.58, random()))) % anchorCount;

    for (let i = 0; i < anchorCount; i += 1) {
      const angle = rotation + i / anchorCount * TAU + (random() - 0.5) * (TAU / anchorCount) * 0.42;
      let radius = lerp(0.76, 1.22, random());
      if (i === hairpinA || i === hairpinB) radius *= lerp(0.48, 0.64, random());
      if (i === (hairpinA - 1 + anchorCount) % anchorCount || i === (hairpinA + 1) % anchorCount) radius *= lerp(1.12, 1.30, random());
      if (i === (hairpinB - 1 + anchorCount) % anchorCount || i === (hairpinB + 1) % anchorCount) radius *= lerp(1.08, 1.24, random());
      anchors.push({
        x: Math.cos(angle) * rx * radius + Math.sin(angle * 3.1) * lerp(0, 90, random()),
        y: Math.sin(angle) * ry * radius + Math.cos(angle * 2.3) * lerp(0, 80, random())
      });
    }

    const points = finalizeTrack(sampleClosedSpline(anchors, lerp(0.62, 0.92, random())));
    if (trackIsValid(points)) return points;
  }

  return buildFallbackTrack();
}

function chooseRampIndex(random) {
  if (random() < 0.24) return -1;
  const candidates = [];
  for (let i = 40; i < track.length - 40; i += 4) {
    let maxCurve = 0;
    for (let j = -10; j <= 20; j += 2) maxCurve = Math.max(maxCurve, Math.abs(track[(i + j + track.length) % track.length].curvature));
    if (maxCurve < 0.0032) candidates.push(i);
  }
  if (!candidates.length) return -1;
  return candidates[Math.floor(random() * candidates.length)];
}
