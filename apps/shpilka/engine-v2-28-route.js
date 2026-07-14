// ШПИЛЬКА 2.8 — practical route modules, proper racing line and meaningful jumps.
var shp28BaseRoadWidth = roadWidth;
var shp28BaseRoadHalf = roadHalf;
var shp28Sections = [];
var shp28Jump = null;

function shp28CircularDistance(a, b, length = track.totalLength || 1) {
  const direct = Math.abs(a - b);
  return Math.min(direct, Math.max(0, length - direct));
}

function shp28ForwardDistance(a, b, length = track.totalLength || 1) {
  let value = b - a;
  while (value < 0) value += length;
  while (value >= length) value -= length;
  return value;
}

function shp28IndexAtDistance(distance) {
  if (!track.length) return 0;
  const length = Math.max(1, track.totalLength || 1);
  const target = ((distance % length) + length) % length;
  let low = 0;
  let high = track.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((track[middle].distance || 0) < target) low = middle + 1;
    else high = middle;
  }
  return low % track.length;
}

function shp28PointAtDistance(distance) {
  return track[shp28IndexAtDistance(distance)];
}

function shp28CurveAt(distance, radius = 110) {
  let signed = 0;
  let weightTotal = 0;
  for (let offset = -radius; offset <= radius; offset += 32) {
    const weight = 1 - Math.abs(offset) / (radius + 32);
    signed += (shp28PointAtDistance(distance + offset)?.curvature || 0) * weight;
    weightTotal += weight;
  }
  return signed / Math.max(0.001, weightTotal);
}

function shp28RebuildRacingLine() {
  if (!track.length) return;
  const offsets = track.map((point) => {
    const current = shp28CurveAt(point.distance, 92);
    const ahead = shp28CurveAt(point.distance + 190, 125);
    const farAhead = shp28CurveAt(point.distance + 330, 125);
    const behind = shp28CurveAt(point.distance - 145, 105);
    const currentLoad = smoothstep(0.00028, 0.00175, Math.abs(current));
    const aheadLoad = smoothstep(0.00030, 0.00162, Math.max(Math.abs(ahead), Math.abs(farAhead)));
    const exitLoad = smoothstep(0.00032, 0.00155, Math.abs(behind));
    const corner = Math.abs(current) > 0.00022 ? current : Math.abs(ahead) > Math.abs(farAhead) ? ahead : farAhead;
    const inside = -Math.sign(corner || 1);
    let offset = 0;
    if (currentLoad > 0.08) offset = inside * shp28BaseRoadHalf * lerp(0.24, 0.62, currentLoad);
    else if (aheadLoad > 0.08) offset = -inside * shp28BaseRoadHalf * lerp(0.16, 0.48, aheadLoad);
    else if (exitLoad > 0.12) offset = -inside * shp28BaseRoadHalf * lerp(0.12, 0.40, exitLoad);
    return clamp(offset, -shp28BaseRoadHalf * 0.70, shp28BaseRoadHalf * 0.70);
  });

  for (let pass = 0; pass < 7; pass += 1) {
    const source = [...offsets];
    for (let index = 0; index < offsets.length; index += 1) {
      offsets[index] = source[index] * 0.46
        + source[(index - 1 + source.length) % source.length] * 0.22
        + source[(index + 1) % source.length] * 0.22
        + source[(index - 2 + source.length) % source.length] * 0.05
        + source[(index + 2) % source.length] * 0.05;
    }
  }
  track.forEach((point, index) => { point.raceOffset = offsets[index]; });
}

function shp28CandidateDistances(kind) {
  const values = [];
  for (let distance = 420; distance < track.totalLength - 420; distance += 120) {
    const current = Math.abs(shp28CurveAt(distance, 105));
    const ahead = Math.abs(shp28CurveAt(distance + 160, 105));
    if (kind === 'straight' && Math.max(current, ahead) < 0.00046) values.push(distance);
    if (kind === 'medium' && current >= 0.00042 && current < 0.00125) values.push(distance);
    if (kind === 'tight' && current >= 0.00105) values.push(distance);
  }
  return values;
}

function shp28PickSpaced(candidates, random, used, minimumGap) {
  const values = [...candidates];
  while (values.length) {
    const value = values.splice(Math.floor(random() * values.length), 1)[0];
    if (used.every((other) => shp28CircularDistance(value, other) >= minimumGap)) return value;
  }
  return null;
}

function shp28BuildPath(center, length) {
  const path = new Path2D();
  const steps = Math.max(8, Math.ceil(length / 26));
  for (let step = 0; step <= steps; step += 1) {
    const point = shp28PointAtDistance(center - length * 0.5 + length * step / steps);
    if (!point) continue;
    if (step === 0) path.moveTo(point.x, point.y);
    else path.lineTo(point.x, point.y);
  }
  return path;
}

function shp28ModulePlan() {
  const type = shpActiveArchetype?.id || 'speed';
  if (type === 'technical') return [
    ['hairpin', 'tight', 'ШПИЛЬКА', 620, 0.82, 0.96, 0],
    ['plaza', 'medium', 'ПЛОЩАДЬ', 760, 1.30, 1, 0],
    ['gravel', 'medium', 'ГРАВИЙНЫЙ СРЕЗ', 540, 0.94, 0.72, 0.34],
    ['chicane', 'straight', 'ШИКАНА', 620, 0.78, 0.92, 0]
  ];
  if (type === 'mountain') return [
    ['narrow', 'medium', 'УЩЕЛЬЕ', 820, 0.76, 0.93, 0],
    ['switchback', 'tight', 'СЕРПАНТИН', 860, 0.88, 0.95, 0],
    ['descent', 'medium', 'СПУСК', 930, 1.08, 0.90, 0],
    ['plaza', 'straight', 'ПЕРЕВАЛ', 620, 1.22, 1, 0]
  ];
  if (type === 'cascade') return [
    ['dam', 'straight', 'ДАМБА', 920, 0.84, 0.87, 0],
    ['compression', 'medium', 'КОМПРЕССИЯ', 620, 0.92, 0.82, 0],
    ['plaza', 'medium', 'РАЗВЯЗКА', 760, 1.28, 1, 0],
    ['chicane', 'straight', 'ВОРОТА', 600, 0.80, 0.94, 0]
  ];
  return [
    ['sweeper', 'medium', 'ДУГА', 980, 1.12, 0.98, 0],
    ['braking', 'tight', 'ТОЧКА ТОРМОЖЕНИЯ', 650, 0.92, 1, 0],
    ['straight', 'straight', 'РАЗГОН', 1100, 1.04, 1, 0],
    ['service', 'medium', 'СЕРВИСНЫЙ СЕКТОР', 620, 0.86, 0.88, 0.12]
  ];
}

function shp28DistanceInSection(distance, section) {
  return shp28CircularDistance(distance, section.center) <= section.length * 0.5;
}

function shp28SectionAtPoint(point) {
  if (!point) return null;
  return shp28Sections.find((section) => shp28DistanceInSection(point.distance || 0, section)) || null;
}

function shp28SectionAtCar(car) {
  return shp28SectionAtPoint(track[car?.trackIndex || 0]);
}

function shp28BuildSections() {
  const random = mulberry32(hashSeed(trackSeed ^ 0x28a11ce));
  const candidates = {
    straight: shp28CandidateDistances('straight'),
    medium: shp28CandidateDistances('medium'),
    tight: shp28CandidateDistances('tight')
  };
  const used = [0];
  shp28Sections = [];
  for (const [kind, source, label, baseLength, width, grip, drag] of shp28ModulePlan()) {
    const center = shp28PickSpaced(candidates[source], random, used, 1180)
      ?? shp28PickSpaced([...candidates.straight, ...candidates.medium, ...candidates.tight], random, used, 920);
    if (center == null) continue;
    used.push(center);
    const section = { kind, label, center, length: baseLength * lerp(0.88, 1.12, random()), width, grip, drag };
    section.path = shp28BuildPath(section.center, section.length);
    shp28Sections.push(section);
  }
  for (const point of track) {
    const section = shp28SectionAtPoint(point);
    point.shp28WidthFactor = section?.width || 1;
    point.shp28Grip = section?.grip || 1;
    point.shp28Drag = section?.drag || 0;
    point.shp28SectionKind = section?.kind || 'standard';
  }
}

function shp28ConfigureJump() {
  const type = shpActiveArchetype?.id || 'speed';
  const random = mulberry32(hashSeed(trackSeed ^ 0x28b71d9));
  const chance = type === 'cascade' ? 1 : type === 'mountain' ? 0.82 : type === 'speed' ? 0.28 : 0;
  const center = random() <= chance
    ? shp28PickSpaced(shp28CandidateDistances('straight'), random, shp28Sections.map((item) => item.center), 860)
    : null;
  if (center == null) {
    shp28Jump = null;
    shpRampIndices = [];
    rampIndex = -1;
    return;
  }
  const takeoffIndex = shp28IndexAtDistance(center);
  const gapLength = type === 'cascade' ? lerp(255, 330, random()) : lerp(220, 290, random());
  const landingIndex = shp28IndexAtDistance(center + gapLength);
  shp28Jump = {
    takeoffIndex,
    landingIndex,
    startDistance: track[takeoffIndex].distance,
    gapLength,
    label: type === 'cascade' ? 'РАЗРЫВ ДАМБЫ' : 'МОСТ НАД ПРОПАСТЬЮ'
  };
  shpRampIndices = [takeoffIndex];
  rampIndex = takeoffIndex;
}

function shp28LocalHalf(car) {
  return shp28BaseRoadHalf * clamp(track[car?.trackIndex || 0]?.shp28WidthFactor || 1, 0.72, 1.34);
}

function shp28InJumpGap(car) {
  if (!shp28Jump || !car || !track.length) return false;
  const distance = track[car.trackIndex]?.distance || 0;
  const fromStart = shp28ForwardDistance(shp28Jump.startDistance, distance);
  return fromStart > 42 && fromStart < shp28Jump.gapLength - 34;
}

var shp28BasePrepareRoute = prepareRoute;
prepareRoute = function shp28PrepareRoute(forceSeed = null) {
  shp28BasePrepareRoute(forceSeed);
  shp28BaseRoadWidth = roadWidth;
  shp28BaseRoadHalf = roadHalf;
  shp28RebuildRacingLine();
  shp28BuildSections();
  shp28ConfigureJump();
  rebuildTrackPaths();
  updateRouteUi();
};

var shp28BaseAverageRaceOffset = shp271AverageRaceOffset;
shp271AverageRaceOffset = function shp28AverageRaceOffset(car, preview) {
  return shp28BaseAverageRaceOffset(car, preview) * 1.62;
};
