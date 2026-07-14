// ШПИЛЬКА 2.6 — memorable procedural landmarks built from the route itself.

var shp26Landmarks = [];
var shp26LandmarkDefinitions = {
  bridge: { label: 'БОЛЬШОЙ МОСТ', straight: true, length: [250, 350] },
  tunnel: { label: 'ТОННЕЛЬ', straight: true, length: [220, 310] },
  yard: { label: 'КОНТЕЙНЕРНЫЙ КОРИДОР', straight: true, length: [260, 360] },
  dam: { label: 'ДАМБА', straight: true, length: [250, 340] },
  cliff: { label: 'СЕРПАНТИН У ОБРЫВА', curve: true, length: [230, 320] },
  plaza: { label: 'ПЛОЩАДЬ ТРАЕКТОРИЙ', curve: true, length: [240, 330] }
};

function shp26CircularIndexGap(a, b) {
  const direct = Math.abs(a - b);
  return Math.min(direct, track.length - direct);
}

function shp26LandmarkCurvature(index, radius = 42) {
  let maximum = 0;
  let average = 0;
  let count = 0;
  for (let offset = -radius; offset <= radius; offset += 6) {
    const point = track[(index + offset + track.length) % track.length];
    const value = Math.abs(point?.curvature || 0);
    maximum = Math.max(maximum, value);
    average += value;
    count += 1;
  }
  return { maximum, average: average / Math.max(1, count) };
}

function shp26FindLandmarkIndex(kind, used, random) {
  const definition = shp26LandmarkDefinitions[kind];
  let bestIndex = -1;
  let bestScore = -Infinity;
  const minimumGap = Math.max(110, Math.floor(track.length * 0.17));

  for (let index = 70; index < track.length - 70; index += 8) {
    if (used.some((other) => shp26CircularIndexGap(index, other) < minimumGap)) continue;
    if (shpRampIndices.some((ramp) => shp26CircularIndexGap(index, ramp) < 72)) continue;
    const curve = shp26LandmarkCurvature(index);
    if (definition.straight && curve.maximum > 0.00145) continue;
    if (definition.curve && curve.average < 0.00048) continue;
    const straightScore = 1 - clamp(curve.maximum / 0.00145, 0, 1);
    const curveScore = clamp(curve.average / 0.0018, 0, 1);
    const spacingScore = used.length
      ? Math.min(...used.map((other) => shp26CircularIndexGap(index, other))) / Math.max(1, track.length * 0.5)
      : 1;
    const score = (definition.curve ? curveScore : straightScore) * 2.4 + spacingScore + random() * 0.28;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestIndex >= 0) return bestIndex;
  const fallback = Math.floor(track.length * (0.20 + used.length * 0.27));
  return clamp(fallback, 40, track.length - 40);
}

function shp26LandmarkKinds(random) {
  const themeKind = theme?.id === 'port' ? 'yard' : theme?.id === 'pine' ? 'tunnel' : theme?.id === 'clay' ? 'cliff' : 'dam';
  const archetypeKind = shpActiveArchetype?.id === 'speed' ? 'bridge'
    : shpActiveArchetype?.id === 'technical' ? 'plaza'
      : shpActiveArchetype?.id === 'mountain' ? 'cliff'
        : 'bridge';
  const pool = shp26Shuffle(['bridge', 'tunnel', 'yard', 'dam', 'cliff', 'plaza'], hashSeed(trackSeed ^ 0x26a11));
  const kinds = [themeKind, archetypeKind];
  for (const kind of pool) {
    if (!kinds.includes(kind)) {
      kinds.push(kind);
      break;
    }
  }
  if (random() > 0.76 && !kinds.includes('plaza')) kinds[2] = 'plaza';
  return kinds;
}

function shp26BuildLandmarks() {
  shp26Landmarks = [];
  if (!track?.length) return;
  const random = mulberry32(hashSeed(trackSeed ^ 0x2606a5));
  const used = [];
  const kinds = shp26LandmarkKinds(random);

  for (const kind of kinds) {
    const definition = shp26LandmarkDefinitions[kind];
    const index = shp26FindLandmarkIndex(kind, used, random);
    const point = track[index];
    if (!point) continue;
    used.push(index);
    shp26Landmarks.push({
      kind,
      label: definition.label,
      index,
      x: point.x,
      y: point.y,
      angle: point.heading,
      side: random() > 0.5 ? 1 : -1,
      length: Math.round(lerp(definition.length[0], definition.length[1], random())),
      variant: random()
    });
  }
}

function shp26WithLandmarkTransform(landmark, draw) {
  ctx.save();
  ctx.translate(landmark.x, landmark.y);
  ctx.rotate(landmark.angle);
  draw();
  ctx.restore();
}

function shp26DrawBridgeUnderlay(landmark) {
  shp26WithLandmarkTransform(landmark, () => {
    ctx.fillStyle = theme?.id === 'salt' ? '#8da8a1' : '#6f8f91';
    ctx.fillRect(-landmark.length * 0.58, -430, landmark.length * 1.16, 860);
    ctx.strokeStyle = 'rgba(242,238,224,0.25)';
    ctx.lineWidth = 5;
    for (let y = -390; y <= 390; y += 48) {
      ctx.beginPath();
      ctx.moveTo(-landmark.length * 0.58, y);
      ctx.lineTo(landmark.length * 0.58, y + 24);
      ctx.stroke();
    }
  });
}

function shp26DrawTunnelUnderlay(landmark) {
  shp26WithLandmarkTransform(landmark, () => {
    ctx.fillStyle = '#252a27';
    ctx.fillRect(-landmark.length * 0.55, -roadHalf - 78, landmark.length * 1.1, roadWidth + 156);
    ctx.fillStyle = theme?.terrainDark || '#777064';
    ctx.fillRect(-landmark.length * 0.58, -roadHalf - 112, landmark.length * 1.16, 38);
    ctx.fillRect(-landmark.length * 0.58, roadHalf + 74, landmark.length * 1.16, 38);
  });
}

function shp26DrawYardUnderlay(landmark) {
  shp26WithLandmarkTransform(landmark, () => {
    ctx.fillStyle = '#8c8981';
    ctx.fillRect(-landmark.length * 0.62, -roadHalf - 190, landmark.length * 1.24, roadWidth + 380);
    ctx.strokeStyle = 'rgba(30,33,31,0.22)';
    ctx.lineWidth = 4;
    ctx.setLineDash([22, 18]);
    for (let y of [-roadHalf - 132, roadHalf + 132]) {
      ctx.beginPath();
      ctx.moveTo(-landmark.length * 0.58, y);
      ctx.lineTo(landmark.length * 0.58, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  });
}

function shp26DrawDamUnderlay(landmark) {
  shp26WithLandmarkTransform(landmark, () => {
    ctx.fillStyle = '#7b9997';
    ctx.fillRect(-landmark.length * 0.6, -520 * landmark.side, landmark.length * 1.2, 520 * landmark.side);
    ctx.fillStyle = '#aaa59a';
    ctx.fillRect(-landmark.length * 0.6, -roadHalf - 64, landmark.length * 1.2, roadWidth + 128);
    ctx.strokeStyle = 'rgba(242,238,224,0.3)';
    ctx.lineWidth = 3;
    for (let x = -landmark.length * 0.52; x < landmark.length * 0.52; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, -roadHalf - 64);
      ctx.lineTo(x + 18, roadHalf + 64);
      ctx.stroke();
    }
  });
}

function shp26DrawCliffUnderlay(landmark) {
  shp26WithLandmarkTransform(landmark, () => {
    const side = landmark.side;
    ctx.fillStyle = '#5f5247';
    ctx.beginPath();
    ctx.moveTo(-landmark.length * 0.62, side * (roadHalf + 54));
    ctx.lineTo(landmark.length * 0.62, side * (roadHalf + 54));
    ctx.lineTo(landmark.length * 0.72, side * 520);
    ctx.lineTo(-landmark.length * 0.72, side * 520);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,33,31,0.36)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(-landmark.length * 0.58, side * (roadHalf + 62));
    ctx.lineTo(landmark.length * 0.58, side * (roadHalf + 62));
    ctx.stroke();
  });
}

function shp26DrawPlazaUnderlay(landmark) {
  shp26WithLandmarkTransform(landmark, () => {
    ctx.fillStyle = '#555751';
    ctx.beginPath();
    ctx.moveTo(-landmark.length * 0.58, -roadHalf - 92);
    ctx.lineTo(landmark.length * 0.58, -roadHalf - 150);
    ctx.lineTo(landmark.length * 0.58, roadHalf + 150);
    ctx.lineTo(-landmark.length * 0.58, roadHalf + 92);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,238,224,0.15)';
    ctx.lineWidth = 3;
    for (const y of [-roadHalf * 0.52, 0, roadHalf * 0.52]) {
      ctx.beginPath();
      ctx.moveTo(-landmark.length * 0.48, y);
      ctx.bezierCurveTo(-40, y - 34, 40, y + 34, landmark.length * 0.48, y);
      ctx.stroke();
    }
  });
}

function shp26DrawLandmarkUnderlays() {
  for (const landmark of shp26Landmarks) {
    if (landmark.kind === 'bridge') shp26DrawBridgeUnderlay(landmark);
    else if (landmark.kind === 'tunnel') shp26DrawTunnelUnderlay(landmark);
    else if (landmark.kind === 'yard') shp26DrawYardUnderlay(landmark);
    else if (landmark.kind === 'dam') shp26DrawDamUnderlay(landmark);
    else if (landmark.kind === 'cliff') shp26DrawCliffUnderlay(landmark);
    else shp26DrawPlazaUnderlay(landmark);
  }
}

function shp26DrawLandmarkLabel(landmark) {
  shp26WithLandmarkTransform(landmark, () => {
    ctx.save();
    ctx.translate(0, -roadHalf + 18);
    ctx.fillStyle = 'rgba(242,238,224,0.74)';
    ctx.font = '900 16px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(landmark.label, 0, 0);
    ctx.restore();
  });
}

function shp26DrawLandmarkOverlays() {
  for (const landmark of shp26Landmarks) {
    shp26WithLandmarkTransform(landmark, () => {
      if (landmark.kind === 'bridge' || landmark.kind === 'dam') {
        ctx.strokeStyle = '#d6d0bf';
        ctx.lineWidth = 7;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(-landmark.length * 0.55, side * (roadHalf + 15));
          ctx.lineTo(landmark.length * 0.55, side * (roadHalf + 15));
          ctx.stroke();
        }
      }
      if (landmark.kind === 'yard') {
        const colors = ['#d65b35', '#52686d', '#c6a23d', '#785b48'];
        for (const side of [-1, 1]) {
          for (let x = -landmark.length * 0.5; x <= landmark.length * 0.38; x += 74) {
            ctx.fillStyle = colors[Math.abs(Math.floor(x / 74) + (side > 0 ? 2 : 0)) % colors.length];
            ctx.fillRect(x, side * (roadHalf + 62) - 23, 62, 46);
            ctx.strokeStyle = '#282b28';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, side * (roadHalf + 62) - 23, 62, 46);
          }
        }
      }
      if (landmark.kind === 'cliff') {
        ctx.strokeStyle = '#f0ead8';
        ctx.lineWidth = 4;
        ctx.setLineDash([16, 13]);
        ctx.beginPath();
        ctx.moveTo(-landmark.length * 0.52, landmark.side * (roadHalf + 24));
        ctx.lineTo(landmark.length * 0.52, landmark.side * (roadHalf + 24));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (landmark.kind === 'tunnel') {
        ctx.fillStyle = 'rgba(18,21,19,0.34)';
        for (let x = -landmark.length * 0.42; x <= landmark.length * 0.42; x += 46) ctx.fillRect(x - 4, -roadHalf, 8, roadWidth);
      }
    });
    shp26DrawLandmarkLabel(landmark);
  }
}

function shp26DrawLandmarkForeground() {
  for (const landmark of shp26Landmarks) {
    if (landmark.kind !== 'tunnel') continue;
    shp26WithLandmarkTransform(landmark, () => {
      ctx.fillStyle = '#202421';
      ctx.strokeStyle = '#bbb4a5';
      ctx.lineWidth = 5;
      for (const x of [-landmark.length * 0.5, landmark.length * 0.5]) {
        ctx.beginPath();
        ctx.rect(x - 12, -roadHalf - 80, 24, 52);
        ctx.rect(x - 12, roadHalf + 28, 24, 52);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 0.20;
      ctx.fillStyle = '#111412';
      ctx.fillRect(-landmark.length * 0.43, -roadHalf - 20, landmark.length * 0.86, 40);
      ctx.globalAlpha = 1;
    });
  }
}

function shp26LandmarkSummary() {
  return shp26Landmarks.map((landmark) => landmark.label.split(' ')[0]).join(' / ');
}

var shp26BasePrepareRoute = prepareRoute;
prepareRoute = function shp26PrepareRoute(seed = null) {
  shp26BasePrepareRoute(seed);
  shp26BuildLandmarks();
  updateRouteUi();
};

var shp26BaseUpdateRouteUi = updateRouteUi;
updateRouteUi = function shp26UpdateRouteUi() {
  shp26BaseUpdateRouteUi();
  if (shp26Landmarks.length) routeMeta.textContent += ` · ${shp26LandmarkSummary()}`;
};

var shp26BaseDrawWorldBackground = drawWorldBackground;
drawWorldBackground = function shp26DrawWorldBackground() {
  shp26BaseDrawWorldBackground();
  shp26DrawLandmarkUnderlays();
};

var shp26BaseDrawTrackSurface = drawTrackSurface;
drawTrackSurface = function shp26DrawTrackSurface() {
  shp26BaseDrawTrackSurface();
  shp26DrawLandmarkOverlays();
};

var shp26BaseDrawCars = drawCars;
drawCars = function shp26DrawCars() {
  shp26BaseDrawCars();
  shp26DrawLandmarkForeground();
};
