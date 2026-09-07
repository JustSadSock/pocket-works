(() => {
  'use strict';

  const canvas = document.createElement('canvas');

  function analyze(source, sourceW, sourceH) {
    const longest = Math.max(sourceW, sourceH);
    const scale = Math.min(1, 320 / Math.max(1, longest));
    const width = Math.max(24, Math.round(sourceW * scale));
    const height = Math.max(24, Math.round(sourceH * scale));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;

    let total = 0;
    let sumX = 0;
    let sumY = 0;
    let xx = 0;
    let yy = 0;
    let xy = 0;
    const points = [];

    for (let y = 1; y < height - 1; y += 4) {
      for (let x = 1; x < width - 1; x += 4) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const ir = (y * width + Math.min(width - 1, x + 1)) * 4;
        const id = (Math.min(height - 1, y + 1) * width + x) * 4;
        const lumR = 0.2126 * data[ir] + 0.7152 * data[ir + 1] + 0.0722 * data[ir + 2];
        const lumD = 0.2126 * data[id] + 0.7152 * data[id + 1] + 0.0722 * data[id + 2];
        const edge = Math.abs(lum - lumR) + Math.abs(lum - lumD);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max ? (max - min) / max : 0;
        const nx = x / width;
        const ny = y / height;
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const centerBias = 1.18 - Math.min(1, Math.hypot(dx * 1.05, dy) * 1.25) * 0.45;
        const score = (edge * 0.82 + sat * 90 + Math.abs(lum - 128) * 0.18 + 12) * centerBias;
        points.push({ x: nx, y: ny, score });
        total += score;
        sumX += nx * score;
        sumY += ny * score;
      }
    }

    const cx = total ? sumX / total : 0.5;
    const cy = total ? sumY / total : 0.5;
    let spreadX = 0;
    let spreadY = 0;
    for (const point of points) {
      const dx = point.x - cx;
      const dy = point.y - cy;
      spreadX += Math.abs(dx) * point.score;
      spreadY += Math.abs(dy) * point.score;
      xx += dx * dx * point.score;
      yy += dy * dy * point.score;
      xy += dx * dy * point.score;
    }
    spreadX = total ? spreadX / total : 0.16;
    spreadY = total ? spreadY / total : 0.16;
    xx = total ? xx / total : 0;
    yy = total ? yy / total : 0;
    xy = total ? xy / total : 0;

    const principal = 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
    const upper = band(points, 0, 0.18);
    const lower = band(points, 0.82, 1);
    const middle = band(points, 0.34, 0.66);
    const concentrated = Math.max(spreadX, spreadY) < 0.19;
    const suggestedMode = concentrated || (Math.abs(cy - 0.5) > 0.1 && Math.max(spreadX, spreadY) < 0.24)
      ? 'object'
      : 'scene';

    return {
      cx,
      cy,
      spreadX,
      spreadY,
      concentrated,
      suggestedMode,
      principalAngle: clamp(principal, -18, 18),
      horizontalPreference: middle > (upper + lower) * 0.66
    };
  }

  function band(points, minY, maxY) {
    let total = 0;
    for (const point of points) if (point.y >= minY && point.y <= maxY) total += point.score;
    return total;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.MiniatureAnalysis = { analyze };
})();
