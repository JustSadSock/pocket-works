function nearestTrackIndex(x, y, hint = null, radius = 94) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  const count = track.length;
  if (hint == null || !Number.isFinite(hint)) {
    for (let i = 0; i < count; i += 1) {
      const dx = x - track[i].x;
      const dy = y - track[i].y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return { index: bestIndex, distance: Math.sqrt(bestDistance) };
  }

  for (let offset = -radius; offset <= radius; offset += 1) {
    const i = (hint + offset + count * 3) % count;
    const dx = x - track[i].x;
    const dy = y - track[i].y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distance: Math.sqrt(bestDistance) };
}

function distanceToTrack(x, y) {
  return nearestTrackIndex(x, y).distance;
}

function buildProps(random) {
  const items = [];
  const bounds = track.bounds;
  const padding = 280;
  const count = Math.round(clamp(track.totalLength / 18, 210, 360));
  for (let i = 0; i < count; i += 1) {
    const x = lerp(bounds.minX - padding, bounds.maxX + padding, random());
    const y = lerp(bounds.minY - padding, bounds.maxY + padding, random());
    if (distanceToTrack(x, y) < roadHalf + 72) continue;
    const roll = random();
    items.push({
      x,
      y,
      size: lerp(8, 27, random()),
      rotation: random() * TAU,
      type: roll < 0.50 ? 'scrub' : roll < 0.72 ? 'rock' : roll < 0.90 ? 'marker' : 'stand',
      variant: random()
    });
  }
  return items;
}

function currentRouteRecord() {
  return saved.routeRecords?.[String(trackSeed)] || null;
}

function updateRouteUi() {
  const km = (track.totalLength / 1100).toFixed(1);
  routeNameNode.textContent = trackName;
  routeMeta.textContent = `${km} КМ · ${lapsToWin} ${lapsToWin === 1 ? 'КРУГ' : lapsToWin < 5 ? 'КРУГА' : 'КРУГОВ'} · КОД ${String(trackSeed >>> 0).slice(-5)}`;
  startButton.textContent = `НА СТАРТ · ${lapsToWin}`;
}

function prepareRoute(forceSeed = null) {
  saved.routeCounter += 1;
  const entropy = forceSeed ?? hashSeed(Date.now() ^ Math.floor(performance.now() * 1000) ^ saved.routeCounter * 0x9e3779b9);
  trackSeed = entropy >>> 0;
  const random = mulberry32(trackSeed);
  theme = THEMES[Math.floor(random() * THEMES.length)];
  track = generateTrack(trackSeed);
  const length = track.totalLength;
  if (length > 6100) lapsToWin = 1;
  else if (length > 5050) lapsToWin = random() < 0.42 ? 1 : 2;
  else if (length > 4050) lapsToWin = random() < 0.22 ? 3 : 2;
  else lapsToWin = 3;
  rampIndex = chooseRampIndex(random);
  props = buildProps(random);
  if (typeof rebuildTrackPaths === 'function') rebuildTrackPaths();
  trackName = `${theme.label} ${String.fromCharCode(65 + Math.floor(random() * 18))}-${10 + Math.floor(random() * 89)}`;
  document.documentElement.style.setProperty('--terrain', theme.terrain);
  document.documentElement.style.setProperty('--terrain-dark', theme.terrainDark);
  updateRouteUi();
  saveState();
}
