const PAGE_W = 2480;
const PAGE_H = 3508;
const PAGE_ASPECT = PAGE_W / PAGE_H;
const EPSILON = 1e-9;

function widthRangeForCount(count) {
  if (count <= 3) return [0.27, 0.48];
  if (count <= 6) return [0.21, 0.38];
  if (count <= 10) return [0.16, 0.31];
  if (count <= 16) return [0.125, 0.255];
  if (count <= 26) return [0.095, 0.205];
  if (count <= 40) return [0.073, 0.165];
  return [0.058, 0.13];
}

function scaleCeilingForCount(count) {
  if (count <= 3) return 1.55;
  if (count <= 6) return 1.50;
  if (count <= 16) return 1.45;
  if (count <= 40) return 1.42;
  return 1.38;
}

function pageMarginForCount(count) {
  if (count <= 6) return 0.022;
  if (count <= 20) return 0.018;
  if (count <= 40) return 0.014;
  return 0.011;
}

function gutterForCount(count) {
  if (count <= 6) return 0.010;
  if (count <= 16) return 0.007;
  if (count <= 32) return 0.005;
  return 0.0035;
}

function makeRng(seed) {
  let value = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(rng, min, max) {
  return min + rng() * (max - min);
}

function intersects(a, b) {
  return !(
    a.x + a.w <= b.x + EPSILON ||
    b.x + b.w <= a.x + EPSILON ||
    a.y + a.h <= b.y + EPSILON ||
    b.y + b.h <= a.y + EPSILON
  );
}

function contains(outer, inner) {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.w <= outer.x + outer.w + EPSILON &&
    inner.y + inner.h <= outer.y + outer.h + EPSILON
  );
}

function splitFreeRect(free, used) {
  if (!intersects(free, used)) return [free];

  const out = [];
  const freeRight = free.x + free.w;
  const freeBottom = free.y + free.h;
  const usedRight = used.x + used.w;
  const usedBottom = used.y + used.h;

  if (used.x > free.x + EPSILON && used.x < freeRight - EPSILON) {
    out.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
  }
  if (usedRight < freeRight - EPSILON && usedRight > free.x + EPSILON) {
    out.push({ x: usedRight, y: free.y, w: freeRight - usedRight, h: free.h });
  }
  if (used.y > free.y + EPSILON && used.y < freeBottom - EPSILON) {
    out.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
  }
  if (usedBottom < freeBottom - EPSILON && usedBottom > free.y + EPSILON) {
    out.push({ x: free.x, y: usedBottom, w: free.w, h: freeBottom - usedBottom });
  }

  return out.filter((rect) => rect.w > EPSILON && rect.h > EPSILON);
}

function pruneFreeRects(rects) {
  const filtered = rects.filter((rect) => rect.w > EPSILON && rect.h > EPSILON);
  const keep = [];

  for (let i = 0; i < filtered.length; i += 1) {
    let contained = false;
    for (let j = 0; j < filtered.length; j += 1) {
      if (i === j) continue;
      if (contains(filtered[j], filtered[i])) {
        contained = true;
        break;
      }
    }
    if (!contained) keep.push(filtered[i]);
  }

  return keep;
}

function createSpecs(images, rng) {
  const range = widthRangeForCount(images.length);
  const margin = pageMarginForCount(images.length);
  const maxPageW = 1 - margin * 2;
  const maxPageH = 1 - margin * 2;

  return images.map((item, index) => {
    const ratio = item.width / item.height;
    let baseW = randomBetween(rng, range[0], range[1]);
    let baseH = baseW * PAGE_ASPECT / ratio;

    const pageCap = Math.min(
      1,
      maxPageW / Math.max(baseW, EPSILON),
      maxPageH / Math.max(baseH, EPSILON)
    );
    baseW *= pageCap;
    baseH *= pageCap;

    const sourceScaleCap = Math.min(
      item.width / Math.max(baseW * PAGE_W, 1),
      item.height / Math.max(baseH * PAGE_H, 1)
    );

    return {
      id: item.id,
      baseW,
      baseH,
      sourceScaleCap: Math.max(EPSILON, sourceScaleCap),
      randomOrder: rng(),
      originalIndex: index
    };
  });
}

function scaledSpec(spec, scale) {
  const actualScale = Math.min(scale, spec.sourceScaleCap);
  return {
    ...spec,
    w: spec.baseW * actualScale,
    h: spec.baseH * actualScale
  };
}

function placementCandidates(free, paddedW, paddedH, rng) {
  const slackX = free.w - paddedW;
  const slackY = free.h - paddedH;
  if (slackX < -EPSILON || slackY < -EPSILON) return [];

  const raw = [
    { x: free.x, y: free.y },
    { x: free.x + Math.max(0, slackX), y: free.y },
    { x: free.x, y: free.y + Math.max(0, slackY) },
    { x: free.x + Math.max(0, slackX), y: free.y + Math.max(0, slackY) }
  ];

  if (slackX > EPSILON || slackY > EPSILON) {
    raw.push({
      x: free.x + Math.max(0, slackX) * rng(),
      y: free.y + Math.max(0, slackY) * rng()
    });
    raw.push({
      x: free.x + Math.max(0, slackX) * rng(),
      y: free.y + Math.max(0, slackY) * rng()
    });
  }

  const seen = new Set();
  return raw.filter((point) => {
    const key = point.x.toFixed(8) + ':' + point.y.toFixed(8);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function choosePlacement(freeRects, item, gutter, rng) {
  const paddedW = item.w + gutter;
  const paddedH = item.h + gutter;
  const candidates = [];

  for (const free of freeRects) {
    const slackX = free.w - paddedW;
    const slackY = free.h - paddedH;
    if (slackX < -EPSILON || slackY < -EPSILON) continue;

    for (const point of placementCandidates(free, paddedW, paddedH, rng)) {
      const shortSide = Math.min(Math.max(0, slackX), Math.max(0, slackY));
      const longSide = Math.max(Math.max(0, slackX), Math.max(0, slackY));
      const edgeDistance = Math.min(point.x, point.y, 1 - (point.x + paddedW), 1 - (point.y + paddedH));
      const noise = (shortSide + longSide + 0.001) * rng() * 0.12;
      const score = shortSide + longSide * 0.18 + edgeDistance * 0.025 + noise;
      candidates.push({
        x: point.x,
        y: point.y,
        w: paddedW,
        h: paddedH,
        score
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.score - b.score);
  const poolSize = Math.min(4, candidates.length);
  const pick = Math.min(poolSize - 1, Math.floor(Math.pow(rng(), 1.9) * poolSize));
  return candidates[pick];
}

function packOnce(specs, scale, margin, gutter, seed) {
  const rng = makeRng(seed);
  const scaled = specs.map((spec) => scaledSpec(spec, scale));
  const ordered = scaled
    .map((item) => ({
      ...item,
      priority: item.w * item.h * randomBetween(rng, 0.84, 1.16)
    }))
    .sort((a, b) => b.priority - a.priority);

  let freeRects = [{
    x: margin,
    y: margin,
    w: 1 - margin * 2,
    h: 1 - margin * 2
  }];

  const placed = [];

  for (const item of ordered) {
    const used = choosePlacement(freeRects, item, gutter, rng);
    if (!used) return null;

    const nextFree = [];
    for (const free of freeRects) nextFree.push(...splitFreeRect(free, used));
    freeRects = pruneFreeRects(nextFree);

    placed.push({
      id: item.id,
      x: used.x + gutter / 2,
      y: used.y + gutter / 2,
      w: item.w,
      h: item.h,
      order: placed.length,
      originalIndex: item.originalIndex
    });
  }

  if (hasOverlap(placed)) return null;

  const coverage = placed.reduce((sum, item) => sum + item.w * item.h, 0);
  const bounds = placed.reduce((acc, item) => ({
    minX: Math.min(acc.minX, item.x),
    minY: Math.min(acc.minY, item.y),
    maxX: Math.max(acc.maxX, item.x + item.w),
    maxY: Math.max(acc.maxY, item.y + item.h)
  }), { minX: 1, minY: 1, maxX: 0, maxY: 0 });
  const boundingArea = Math.max(EPSILON, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY));

  return {
    items: placed,
    coverage,
    compactness: coverage / boundingArea
  };
}

function bestPackAtScale(specs, scale, margin, gutter, seed, attempts = 8) {
  let best = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const attemptSeed = (seed ^ Math.imul(attempt + 1, 0x9e3779b1) ^ Math.round(scale * 1000000)) >>> 0;
    const result = packOnce(specs, scale, margin, gutter, attemptSeed);
    if (!result) continue;

    if (!best || result.compactness > best.compactness) best = result;
  }

  return best;
}

export function hasOverlap(items) {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (intersects(items[i], items[j])) return true;
    }
  }
  return false;
}

export function buildPackedLayout(images, seed = Date.now()) {
  if (!images.length) return { items: [], coverage: 0, scale: 1 };

  const normalizedSeed = Number(seed) >>> 0;
  const specRng = makeRng(normalizedSeed ^ 0xa511e9b3);
  const specs = createSpecs(images, specRng);
  const margin = pageMarginForCount(images.length);
  const gutter = gutterForCount(images.length);
  const maxScale = scaleCeilingForCount(images.length);

  let low = 0.30;
  let high = maxScale;
  let best = bestPackAtScale(specs, low, margin, gutter, normalizedSeed, 10);

  if (!best) {
    low = 0.20;
    best = bestPackAtScale(specs, low, margin, gutter, normalizedSeed, 12);
  }

  if (!best) {
    throw new Error('Could not produce a non-overlapping A4 layout.');
  }

  const maxResult = bestPackAtScale(specs, high, margin, gutter, normalizedSeed, 10);
  if (maxResult) {
    best = maxResult;
    low = high;
  } else {
    for (let step = 0; step < 11; step += 1) {
      const mid = (low + high) / 2;
      const result = bestPackAtScale(specs, mid, margin, gutter, normalizedSeed, 8);
      if (result) {
        low = mid;
        best = result;
      } else {
        high = mid;
      }
    }
  }

  return {
    items: best.items,
    coverage: best.coverage,
    scale: low,
    margin,
    gutter
  };
}
