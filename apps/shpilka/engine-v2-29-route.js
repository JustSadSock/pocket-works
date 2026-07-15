// ШПИЛЬКА 2.9 — richer route language, biome scenery and live navigation.
var shp29Scenery = [];
var shp29MapCache = null;
var shp29MapLastPaint = 0;
var shp29RouteSignature = '';
var shp29DangerKinds = new Set(['hairpin', 'switchback', 'chicane', 'esses', 'narrow', 'ridge', 'braking', 'compression']);
var shp29WaterKinds = new Set(['dam', 'causeway', 'spillway', 'bridge']);
var shp29HardSurfaceKinds = new Set(['plaza', 'market', 'airfield', 'service', 'yard']);
var shp29EarthKinds = new Set(['gravel', 'quarry', 'cliff', 'descent']);

Object.assign(shpArchetypes.speed, { anchorMin: 30, anchorMax: 37, rx: [2420, 3180], ry: [1780, 2360] });
Object.assign(shpArchetypes.technical, { anchorMin: 36, anchorMax: 44, rx: [2120, 2760], ry: [1620, 2200] });
Object.assign(shpArchetypes.mountain, { anchorMin: 34, anchorMax: 42, rx: [2240, 2960], ry: [1640, 2260] });
Object.assign(shpArchetypes.cascade, { anchorMin: 34, anchorMax: 42, rx: [2340, 3100], ry: [1740, 2380] });

shp28ModulePlan = function shp29ModulePlan() {
  const type = shpActiveArchetype?.id || 'speed';
  if (type === 'technical') return [
    ['hairpin', 'tight', 'ШПИЛЬКА', 700, 0.78, 0.95, 0],
    ['market', 'medium', 'СТАРЫЙ РЫНОК', 720, 1.25, 0.96, 0],
    ['gravel', 'medium', 'ГРАВИЙНЫЙ СРЕЗ', 590, 0.92, 0.70, 0.38],
    ['chicane', 'straight', 'БЕТОННАЯ ШИКАНА', 660, 0.76, 0.91, 0],
    ['esses', 'medium', 'СВЯЗКА ЭСОК', 760, 0.90, 0.93, 0]
  ];
  if (type === 'mountain') return [
    ['narrow', 'medium', 'КАМЕННЫЕ ВОРОТА', 860, 0.72, 0.91, 0],
    ['switchback', 'tight', 'СЕРПАНТИН', 940, 0.84, 0.94, 0],
    ['ridge', 'medium', 'ГРЕБЕНЬ', 820, 0.82, 0.88, 0],
    ['tunnel', 'straight', 'ТОННЕЛЬ', 720, 0.80, 0.95, 0],
    ['descent', 'medium', 'ДЛИННЫЙ СПУСК', 1020, 1.08, 0.89, 0]
  ];
  if (type === 'cascade') return [
    ['dam', 'straight', 'ДАМБА', 980, 0.82, 0.86, 0],
    ['causeway', 'straight', 'ДОРОГА НАД ВОДОЙ', 860, 0.78, 0.88, 0],
    ['compression', 'medium', 'КОМПРЕССИЯ', 660, 0.88, 0.80, 0],
    ['spillway', 'medium', 'ВОДОСБРОС', 780, 1.12, 0.90, 0],
    ['chicane', 'straight', 'ШЛЮЗОВЫЕ ВОРОТА', 650, 0.76, 0.92, 0]
  ];
  return [
    ['sweeper', 'medium', 'БОЛЬШАЯ ДУГА', 1080, 1.14, 0.98, 0],
    ['banked', 'medium', 'ПРОФИЛИРОВАННЫЙ ВИРАЖ', 860, 1.05, 1.02, 0],
    ['straight', 'straight', 'ГЛАВНЫЙ РАЗГОН', 1240, 1.06, 1, 0],
    ['braking', 'tight', 'ЖЁСТКОЕ ТОРМОЖЕНИЕ', 720, 0.88, 0.98, 0],
    ['airfield', 'straight', 'СТАРАЯ ПОЛОСА', 900, 1.30, 0.99, 0]
  ];
};

function shp29SectionSurface(section) {
  const fallback = theme?.asphalt || '#30322f';
  const palette = {
    gravel: theme?.shoulder || '#8f795f',
    quarry: '#5e5148',
    tunnel: '#222725',
    dam: '#394442',
    causeway: '#364341',
    spillway: '#45504d',
    compression: '#3d4542',
    market: '#4b4a43',
    plaza: '#4d504a',
    airfield: '#40433f',
    service: '#454740',
    ridge: '#353a36',
    descent: '#363936',
    banked: '#2b302e'
  };
  return palette[section.kind] || fallback;
}

function shp29TraceSectionEdge(section, side, extra = 0, stepDistance = 34) {
  const steps = Math.max(8, Math.ceil(section.length / stepDistance));
  const half = shp28BaseRoadHalf * section.width + extra;
  ctx.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const point = shp28PointAtDistance(section.center - section.length * 0.5 + section.length * step / steps);
    if (!point) continue;
    const x = point.x + point.nx * side * half;
    const y = point.y + point.ny * side * half;
    if (step === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

shp281DrawSections = function shp29DrawSections() {
  for (const section of shp28Sections || []) {
    const width = shp28BaseRoadWidth * section.width;
    shp281TraceSection(section);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = shp29WaterKinds.has(section.kind)
      ? '#8b9994'
      : (shp29EarthKinds.has(section.kind) ? theme.terrainDark : theme.shoulder);
    ctx.lineWidth = width + (section.kind === 'airfield' ? 74 : 54);
    ctx.stroke();

    shp281TraceSection(section);
    ctx.strokeStyle = '#1c201e';
    ctx.lineWidth = width + 14;
    ctx.stroke();

    shp281TraceSection(section);
    ctx.strokeStyle = shp29SectionSurface(section);
    ctx.lineWidth = width;
    ctx.stroke();

    if (section.kind === 'gravel' || section.kind === 'quarry') {
      shp281TraceSection(section);
      ctx.save();
      ctx.strokeStyle = 'rgba(239,225,194,0.22)';
      ctx.lineWidth = width * 0.74;
      ctx.setLineDash([6, 15, 2, 12]);
      ctx.stroke();
      ctx.restore();
    }

    if (section.kind === 'airfield') {
      shp281TraceSection(section);
      ctx.save();
      ctx.strokeStyle = 'rgba(242,238,224,0.30)';
      ctx.lineWidth = 8;
      ctx.setLineDash([70, 34]);
      ctx.stroke();
      ctx.restore();
    } else if (section.kind === 'market' || section.kind === 'service') {
      shp281TraceSection(section);
      ctx.save();
      ctx.strokeStyle = 'rgba(21,24,22,0.25)';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 46]);
      ctx.stroke();
      ctx.restore();
    } else if (section.kind === 'tunnel') {
      shp281TraceSection(section);
      ctx.save();
      ctx.strokeStyle = 'rgba(241,204,104,0.38)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 26]);
      ctx.stroke();
      ctx.restore();
    }

    if (section.kind === 'banked') {
      for (const side of [-1, 1]) {
        shp29TraceSectionEdge(section, side, -9);
        ctx.save();
        ctx.strokeStyle = side > 0 ? 'rgba(240,236,220,0.52)' : 'rgba(211,83,47,0.62)';
        ctx.lineWidth = 13;
        ctx.setLineDash([22, 16]);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
};
