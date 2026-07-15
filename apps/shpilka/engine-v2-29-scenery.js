function shp29WeightedType(random, choices) {
  const index = Math.floor(random() * choices.length);
  return choices[Math.max(0, Math.min(choices.length - 1, index))];
}

function shp29BuildScenery() {
  shp29Scenery = [];
  if (!track.length) return;
  const random = mulberry32(hashSeed(trackSeed ^ 0x290cafe));
  const type = shpActiveArchetype?.id || 'speed';
  const themeId = theme?.id || 'salt';
  const themeChoices = {
    salt: ['salt-crust', 'salt-crust', 'marker', 'scrub', 'rock'],
    pine: ['pine', 'pine', 'pine', 'rock', 'watchtower'],
    port: ['container', 'container', 'silo', 'crane', 'lamp'],
    clay: ['mesa', 'rock', 'rock', 'scrub', 'watchtower']
  };
  const archetypeChoices = {
    speed: ['billboard', 'lamp', 'marker'],
    technical: ['barrier', 'tire-stack', 'billboard'],
    mountain: ['pine', 'rock', 'watchtower'],
    cascade: ['reed', 'lamp', 'silo']
  };
  const stride = Math.max(14, Math.floor(track.length / 42));
  for (let index = 0; index < track.length; index += stride) {
    const point = track[index];
    if (!point) continue;
    for (const side of [-1, 1]) {
      if (random() < 0.14) continue;
      const localSection = shp28SectionAtPoint(point);
      const offset = shp28BaseRoadHalf * (localSection?.width || 1) + 92 + random() * 250;
      const tangentShift = (random() - 0.5) * 100;
      const typePool = random() < 0.72 ? themeChoices[themeId] : archetypeChoices[type];
      const itemType = shp29WeightedType(random, typePool || themeChoices.salt);
      shp29Scenery.push({
        type: itemType,
        x: point.x + point.nx * side * offset + point.tx * tangentShift,
        y: point.y + point.ny * side * offset + point.ty * tangentShift,
        rotation: point.heading + (side < 0 ? Math.PI : 0) + (random() - 0.5) * 0.24,
        size: lerp(24, itemType === 'crane' || itemType === 'mesa' ? 74 : 54, random()),
        variant: random(),
        side
      });
    }
  }
  const specialStride = Math.max(70, Math.floor(track.length / 8));
  for (let index = specialStride / 2; index < track.length; index += specialStride) {
    const point = track[Math.floor(index) % track.length];
    if (!point) continue;
    const side = random() > 0.5 ? 1 : -1;
    const typePool = themeId === 'port'
      ? ['crane', 'silo', 'container']
      : themeId === 'pine'
        ? ['watchtower', 'pine', 'pine']
        : themeId === 'clay'
          ? ['mesa', 'watchtower', 'rock']
          : ['billboard', 'salt-crust', 'marker'];
    shp29Scenery.push({
      type: shp29WeightedType(random, typePool),
      x: point.x + point.nx * side * (shp28BaseRoadHalf + 360 + random() * 240),
      y: point.y + point.ny * side * (shp28BaseRoadHalf + 360 + random() * 240),
      rotation: point.heading + (side < 0 ? Math.PI : 0),
      size: lerp(68, 118, random()),
      variant: random(),
      side
    });
  }
}

function shp29IsNearCamera(item, margin = 650) {
  const zoom = Math.max(0.42, cameraZoom || 0.7);
  const radius = Math.max(viewportWidth, viewportHeight) / zoom * 0.88 + margin;
  return Math.abs(item.x - cameraX) < radius && Math.abs(item.y - cameraY) < radius;
}

function shp29DrawShadow(size, alpha = 0.18) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#171a18';
  ctx.beginPath();
  ctx.ellipse(size * 0.15, size * 0.28, size * 0.85, size * 0.34, 0.18, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function shp29DrawSceneryItem(item, foreground = false) {
  if (!shp29IsNearCamera(item)) return;
  const s = item.size;
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rotation);
  if (!foreground) shp29DrawShadow(s);

  if (item.type === 'pine') {
    ctx.fillStyle = '#3d4d39';
    ctx.strokeStyle = '#222a22';
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.fillRect(-s * 0.08, -s * 0.10, s * 0.16, s * 0.70);
    for (const [y, scale] of [[-0.48, 1], [-0.18, 0.82], [0.10, 0.62]]) {
      ctx.beginPath();
      ctx.moveTo(0, s * y - s * 0.46 * scale);
      ctx.lineTo(-s * 0.48 * scale, s * y + s * 0.28 * scale);
      ctx.lineTo(s * 0.48 * scale, s * y + s * 0.28 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (item.type === 'rock' || item.type === 'mesa') {
    ctx.fillStyle = item.type === 'mesa' ? '#735a48' : theme.terrainDark;
    ctx.strokeStyle = 'rgba(28,31,29,0.46)';
    ctx.lineWidth = Math.max(3, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(-s * 0.66, s * 0.38);
    ctx.lineTo(-s * 0.40, -s * 0.46);
    ctx.lineTo(-s * 0.05, -s * (item.type === 'mesa' ? 0.62 : 0.72));
    ctx.lineTo(s * 0.55, -s * 0.40);
    ctx.lineTo(s * 0.70, s * 0.32);
    ctx.lineTo(s * 0.16, s * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (item.type === 'mesa') {
      ctx.strokeStyle = 'rgba(238,218,184,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, -s * 0.24);
      ctx.lineTo(s * 0.46, -s * 0.12);
      ctx.stroke();
    }
  } else if (item.type === 'container') {
    ctx.fillStyle = item.variant > 0.66 ? '#c85d36' : item.variant > 0.33 ? '#53696d' : '#b28b3d';
    ctx.strokeStyle = '#282c29';
    ctx.lineWidth = 4;
    ctx.fillRect(-s * 0.82, -s * 0.34, s * 1.64, s * 0.68);
    ctx.strokeRect(-s * 0.82, -s * 0.34, s * 1.64, s * 0.68);
    ctx.strokeStyle = 'rgba(245,240,224,0.30)';
    ctx.lineWidth = 2;
    for (let x = -s * 0.58; x < s * 0.7; x += s * 0.28) {
      ctx.beginPath();
      ctx.moveTo(x, -s * 0.29);
      ctx.lineTo(x, s * 0.29);
      ctx.stroke();
    }
  } else if (item.type === 'crane') {
    ctx.strokeStyle = '#4e5f61';
    ctx.lineWidth = Math.max(5, s * 0.10);
    ctx.beginPath();
    ctx.moveTo(-s * 0.36, s * 0.56);
    ctx.lineTo(-s * 0.36, -s * 0.58);
    ctx.lineTo(s * 0.70, -s * 0.58);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, -s * 0.48);
    ctx.lineTo(s * 0.52, s * 0.22);
    ctx.moveTo(s * 0.28, -s * 0.58);
    ctx.lineTo(s * 0.28, s * 0.10);
    ctx.stroke();
    ctx.fillStyle = '#d6a33b';
    ctx.fillRect(s * 0.20, s * 0.06, s * 0.18, s * 0.16);
  } else if (item.type === 'silo') {
    ctx.fillStyle = '#9c9b91';
    ctx.strokeStyle = '#353936';
    ctx.lineWidth = 4;
    ctx.fillRect(-s * 0.36, -s * 0.45, s * 0.72, s * 0.90);
    ctx.strokeRect(-s * 0.36, -s * 0.45, s * 0.72, s * 0.90);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.45, s * 0.36, s * 0.16, 0, Math.PI, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(241,236,220,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.35);
    ctx.lineTo(-s * 0.18, s * 0.38);
    ctx.stroke();
  } else if (item.type === 'watchtower') {
    ctx.strokeStyle = '#343a35';
    ctx.lineWidth = Math.max(3, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(-s * 0.26, s * 0.56);
    ctx.lineTo(-s * 0.14, -s * 0.28);
    ctx.moveTo(s * 0.26, s * 0.56);
    ctx.lineTo(s * 0.14, -s * 0.28);
    ctx.moveTo(-s * 0.20, s * 0.22);
    ctx.lineTo(s * 0.20, -s * 0.08);
    ctx.moveTo(s * 0.20, s * 0.22);
    ctx.lineTo(-s * 0.20, -s * 0.08);
    ctx.stroke();
    ctx.fillStyle = '#59635a';
    ctx.fillRect(-s * 0.34, -s * 0.42, s * 0.68, s * 0.24);
    ctx.strokeRect(-s * 0.34, -s * 0.42, s * 0.68, s * 0.24);
  } else if (item.type === 'billboard') {
    ctx.strokeStyle = '#242825';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.28, s * 0.52);
    ctx.lineTo(-s * 0.28, s * 0.14);
    ctx.moveTo(s * 0.28, s * 0.52);
    ctx.lineTo(s * 0.28, s * 0.14);
    ctx.stroke();
    ctx.fillStyle = item.variant > 0.5 ? '#e05d34' : '#d9d2bf';
    ctx.fillRect(-s * 0.72, -s * 0.28, s * 1.44, s * 0.50);
    ctx.strokeRect(-s * 0.72, -s * 0.28, s * 1.44, s * 0.50);
    ctx.fillStyle = '#262a27';
    ctx.font = `900 ${Math.max(8, s * 0.18)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.variant > 0.5 ? 'ШПИЛЬКА' : 'RACING', 0, -s * 0.03);
  } else if (item.type === 'lamp') {
    ctx.strokeStyle = '#343a36';
    ctx.lineWidth = Math.max(3, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.54);
    ctx.lineTo(0, -s * 0.50);
    ctx.lineTo(s * 0.28, -s * 0.50);
    ctx.stroke();
    ctx.fillStyle = '#e7c969';
    ctx.fillRect(s * 0.20, -s * 0.57, s * 0.22, s * 0.14);
  } else if (item.type === 'tire-stack' || item.type === 'barrier') {
    const count = item.type === 'tire-stack' ? 4 : 3;
    for (let i = 0; i < count; i += 1) {
      ctx.fillStyle = i % 2 ? '#ece5d3' : '#262a27';
      ctx.strokeStyle = '#1d201e';
      ctx.lineWidth = 2;
      if (item.type === 'tire-stack') {
        ctx.beginPath();
        ctx.arc((i - 1.5) * s * 0.24, 0, s * 0.18, 0, TAU);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect((i - 1) * s * 0.34 - s * 0.18, -s * 0.18, s * 0.34, s * 0.36);
        ctx.strokeRect((i - 1) * s * 0.34 - s * 0.18, -s * 0.18, s * 0.34, s * 0.36);
      }
    }
  } else if (item.type === 'salt-crust') {
    ctx.strokeStyle = 'rgba(244,239,220,0.52)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = i / 6 * TAU;
      const radius = s * (0.36 + (i % 2) * 0.16);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, 0);
    ctx.lineTo(s * 0.38, 0);
    ctx.moveTo(0, -s * 0.38);
    ctx.lineTo(0, s * 0.38);
    ctx.stroke();
  } else if (item.type === 'reed') {
    ctx.strokeStyle = '#65734d';
    ctx.lineWidth = 3;
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.14, s * 0.34);
      ctx.quadraticCurveTo(i * s * 0.18 + s * 0.10, 0, i * s * 0.10, -s * 0.42);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = item.variant > 0.5 ? theme.propA : theme.propB;
    ctx.strokeStyle = 'rgba(30,33,31,0.40)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-s * 0.56, s * 0.42);
    ctx.lineTo(-s * 0.34, -s * 0.34);
    ctx.lineTo(0, -s * 0.58);
    ctx.lineTo(s * 0.48, -s * 0.14);
    ctx.lineTo(s * 0.52, s * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function shp29DrawSectionUnderlay(section) {
  const point = shp28PointAtDistance(section.center);
  if (!point || !shp29IsNearCamera(point, 1000)) return;
  const width = shp28BaseRoadWidth * section.width;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.heading);
  if (shp29WaterKinds.has(section.kind)) {
    const water = ctx.createLinearGradient(0, -width * 2.8, 0, width * 2.8);
    water.addColorStop(0, '#6d9294');
    water.addColorStop(0.5, '#486d71');
    water.addColorStop(1, '#7b9d9d');
    ctx.fillStyle = water;
    ctx.fillRect(-section.length * 0.58, -width * 3.1, section.length * 1.16, width * 6.2);
    ctx.strokeStyle = 'rgba(238,240,225,0.18)';
    ctx.lineWidth = 3;
    for (let y = -width * 2.7; y <= width * 2.7; y += 42) {
      ctx.beginPath();
      ctx.moveTo(-section.length * 0.54, y);
      ctx.lineTo(section.length * 0.54, y + Math.sin(raceElapsed * 0.7 + y * 0.03) * 16);
      ctx.stroke();
    }
  } else if (section.kind === 'tunnel' || section.kind === 'ridge' || section.kind === 'narrow') {
    ctx.fillStyle = section.kind === 'tunnel' ? '#4b4b43' : '#675d50';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-section.length * 0.58, side * (width * 0.5 + 34));
      ctx.lineTo(section.length * 0.58, side * (width * 0.5 + 34));
      ctx.lineTo(section.length * 0.72, side * (width * 2.5));
      ctx.lineTo(-section.length * 0.72, side * (width * 2.2));
      ctx.closePath();
      ctx.fill();
    }
  } else if (shp29HardSurfaceKinds.has(section.kind)) {
    ctx.fillStyle = 'rgba(92,94,87,0.55)';
    ctx.fillRect(-section.length * 0.62, -width * 1.45, section.length * 1.24, width * 2.9);
    ctx.strokeStyle = 'rgba(238,233,216,0.18)';
    ctx.lineWidth = 3;
    ctx.setLineDash([24, 18]);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-section.length * 0.56, side * width * 1.1);
      ctx.lineTo(section.length * 0.56, side * width * 1.1);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  } else if (shp29EarthKinds.has(section.kind)) {
    ctx.fillStyle = 'rgba(104,78,58,0.34)';
    ctx.beginPath();
    ctx.ellipse(0, 0, section.length * 0.64, width * 1.65, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function shp29DrawSceneryUnderlays() {
  for (const section of shp28Sections || []) shp29DrawSectionUnderlay(section);
  if (typeof shp26DrawLandmarkUnderlays === 'function') shp26DrawLandmarkUnderlays();
  for (const item of shp29Scenery) shp29DrawSceneryItem(item, false);
}

function shp29DrawGuardrails(section) {
  if (!shp29DangerKinds.has(section.kind) && !shp29WaterKinds.has(section.kind)) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    shp29TraceSectionEdge(section, side, 22);
    ctx.strokeStyle = '#d7d2c3';
    ctx.lineWidth = 8;
    ctx.stroke();
    shp29TraceSectionEdge(section, side, 22);
    ctx.strokeStyle = 'rgba(35,39,36,0.62)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 34]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function shp29DrawBrakingBoards(section) {
  if (!['hairpin', 'switchback', 'chicane', 'braking', 'compression'].includes(section.kind)) return;
  const start = section.center - section.length * 0.5;
  const side = section.kind === 'switchback' ? -1 : 1;
  const distances = [300, 200, 100];
  for (const distance of distances) {
    const point = shp28PointAtDistance(start - distance);
    if (!point) continue;
    const offset = shp28BaseRoadHalf + 52;
    ctx.save();
    ctx.translate(point.x + point.nx * side * offset, point.y + point.ny * side * offset);
    ctx.rotate(point.heading);
    ctx.fillStyle = '#f0ebdc';
    ctx.strokeStyle = '#202421';
    ctx.lineWidth = 3;
    ctx.fillRect(-18, -24, 36, 48);
    ctx.strokeRect(-18, -24, 36, 48);
    ctx.fillStyle = '#242825';
    ctx.font = '900 15px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(distance), 0, 0);
    ctx.restore();
  }
}

function shp29DrawArrowGate(section) {
  if (!['hairpin', 'switchback', 'chicane', 'esses', 'narrow'].includes(section.kind)) return;
  const point = shp28PointAtDistance(section.center);
  if (!point) return;
  const curve = shp28CurveAt(section.center, 90);
  const side = Math.sign(curve || 1);
  ctx.save();
  ctx.translate(point.x + point.nx * side * (shp28BaseRoadHalf * section.width + 54), point.y + point.ny * side * (shp28BaseRoadHalf * section.width + 54));
  ctx.rotate(point.heading);
  ctx.fillStyle = '#202421';
  ctx.strokeStyle = '#ece6d5';
  ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i += 1) {
    ctx.save();
    ctx.translate(i * 34, 0);
    ctx.beginPath();
    ctx.moveTo(-13, -18 * side);
    ctx.lineTo(12, 0);
    ctx.lineTo(-13, 18 * side);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function shp29DrawStartGantry() {
  if (!track.length) return;
  const point = track[0];
  const half = shp28BaseRoadHalf + 32;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.heading);
  ctx.strokeStyle = '#222622';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, -half);
  ctx.lineTo(0, half);
  ctx.stroke();
  ctx.fillStyle = '#d9d3c2';
  ctx.strokeStyle = '#222622';
  ctx.lineWidth = 4;
  ctx.fillRect(-18, -half - 22, 36, 44);
  ctx.strokeRect(-18, -half - 22, 36, 44);
  ctx.fillRect(-18, half - 22, 36, 44);
  ctx.strokeRect(-18, half - 22, 36, 44);
  ctx.fillStyle = '#202421';
  ctx.fillRect(-15, -half + 8, 30, half * 2 - 16);
  ctx.fillStyle = '#f0ead9';
  ctx.font = '900 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.rotate(Math.PI / 2);
  ctx.fillText('ШПИЛЬКА', 0, 0);
  ctx.restore();
}

