// ШПИЛЬКА 2.6 — integration fixes after all feature layers are installed.

shp26LandmarkKinds = function shp26DistinctLandmarkKinds(random) {
  const themeKind = theme?.id === 'port' ? 'yard' : theme?.id === 'pine' ? 'tunnel' : theme?.id === 'clay' ? 'cliff' : 'dam';
  const archetypeKind = shpActiveArchetype?.id === 'speed' ? 'bridge'
    : shpActiveArchetype?.id === 'technical' ? 'plaza'
      : shpActiveArchetype?.id === 'mountain' ? 'cliff'
        : 'bridge';
  const pool = shp26Shuffle(['bridge', 'tunnel', 'yard', 'dam', 'cliff', 'plaza'], hashSeed(trackSeed ^ 0x26a11));
  const kinds = [];
  const pushUnique = (kind) => { if (!kinds.includes(kind)) kinds.push(kind); };
  pushUnique(themeKind);
  pushUnique(archetypeKind);
  for (const kind of pool) {
    pushUnique(kind);
    if (kinds.length === 3) break;
  }
  if (random() > 0.76 && !kinds.includes('plaza')) kinds[2] = 'plaza';
  return kinds.slice(0, 3);
};

shp26FindLandmarkIndex = function shp26SpacedLandmarkIndex(kind, used, random) {
  const definition = shp26LandmarkDefinitions[kind];
  const minimumGap = Math.max(110, Math.floor(track.length * 0.17));
  let bestIndex = -1;
  let bestScore = -Infinity;

  const consider = (index, enforceShape) => {
    const spacing = used.length
      ? Math.min(...used.map((other) => shp26CircularIndexGap(index, other)))
      : track.length * 0.5;
    if (spacing < minimumGap) return;
    if (shpRampIndices.some((ramp) => shp26CircularIndexGap(index, ramp) < 64)) return;
    const curve = shp26LandmarkCurvature(index);
    if (enforceShape && definition.straight && curve.maximum > 0.00155) return;
    if (enforceShape && definition.curve && curve.average < 0.00042) return;
    const straightScore = 1 - clamp(curve.maximum / 0.00165, 0, 1);
    const curveScore = clamp(curve.average / 0.0018, 0, 1);
    const shapeScore = definition.curve ? curveScore : straightScore;
    const spacingScore = spacing / Math.max(1, track.length * 0.5);
    const score = shapeScore * (enforceShape ? 2.4 : 0.65) + spacingScore * 1.7 + random() * 0.16;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  };

  for (let index = 56; index < track.length - 56; index += 7) consider(index, true);
  if (bestIndex < 0) {
    for (let index = 44; index < track.length - 44; index += 5) consider(index, false);
  }
  if (bestIndex >= 0) return bestIndex;

  let widestIndex = 44;
  let widestGap = -1;
  for (let index = 44; index < track.length - 44; index += 4) {
    const spacing = used.length
      ? Math.min(...used.map((other) => shp26CircularIndexGap(index, other)))
      : track.length * 0.5;
    if (spacing > widestGap) {
      widestGap = spacing;
      widestIndex = index;
    }
  }
  return widestIndex;
};

var shp26IntegratedBeginRace = beginRace;
beginRace = function shp26IntegratedRaceStart(options = {}) {
  if (mode === 'paused' && shp26ChampionshipRaceActive) {
    shp26RaceDifficulty = shp26Career.championship?.difficulty || shpPrefs.difficulty;
    shp26CareerUi.finishPanel.hidden = true;
    shp26BaseBeginRace({ newRoute: false });
    return;
  }
  shp26IntegratedBeginRace(options);
};
