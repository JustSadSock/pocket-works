const EPS = 1e-7;
const DEG = Math.PI / 180;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const vec3 = (v, fallback = [0, 0, 0]) => Array.isArray(v) && v.length >= 3 ? v.slice(0, 3).map(Number) : fallback.slice();
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function tolerantJsonParse(source) {
  let text = String(source ?? '').trim();
  if (!text) throw new Error('Код пуст. Вставьте FormaCode или импортируйте файл.');
  const fenced = text.match(/```(?:json|formacode|forma)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  text = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = String(error.message).match(/position\s+(\d+)/i);
    if (match) {
      const pos = Number(match[1]);
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      throw new Error(`Ошибка JSON около строки ${line}, столбца ${col}. ${error.message}`);
    }
    throw new Error(`Не удалось прочитать FormaCode: ${error.message}`);
  }
}

export function normalizeDocument(input) {
  if (!input || typeof input !== 'object') throw new Error('Корень FormaCode должен быть объектом.');
  const format = String(input.format || input.schema || '').toLowerCase();
  if (!['formacode-1', 'forma/1', 'forma-code-1'].includes(format)) {
    throw new Error('Неподдерживаемый формат. Ожидается "format": "formacode-1".');
  }
  if (!Array.isArray(input.parts) || !input.parts.length) throw new Error('В документе нет массива parts с деталями.');
  const ids = new Set();
  const parts = input.parts.map((part, index) => {
    if (!part || typeof part !== 'object') throw new Error(`Деталь ${index + 1} задана неверно.`);
    let id = String(part.id || `part-${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
    if (!id) id = `part-${index + 1}`;
    if (ids.has(id)) throw new Error(`Повторяющийся id детали: ${id}`);
    ids.add(id);
    const node = part.node || part.shape || part.geometry;
    if (!node) throw new Error(`У детали «${part.name || id}» нет node.`);
    validateNode(node, `parts[${index}].node`);
    return {
      id,
      name: String(part.name || id).slice(0, 80),
      color: normalizeColor(part.color || '#d9dfd3'),
      visible: part.visible !== false,
      node: structuredCloneSafe(node),
      meta: part.meta && typeof part.meta === 'object' ? structuredCloneSafe(part.meta) : {}
    };
  });
  return {
    format: 'formacode-1',
    name: String(input.name || 'Без названия').slice(0, 120),
    units: 'mm',
    author: String(input.author || '').slice(0, 120),
    notes: String(input.notes || '').slice(0, 1000),
    settings: {
      detail: clamp(Math.round(num(input.settings?.detail, 46)), 20, 96),
      margin: clamp(num(input.settings?.margin, 2), 0.5, 20)
    },
    parts
  };
}

export function parseFormaCode(source) {
  return normalizeDocument(tolerantJsonParse(source));
}

function structuredCloneSafe(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function normalizeColor(color) {
  const s = String(color || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + [...s.slice(1)].map(c => c + c).join('').toLowerCase();
  return '#d9dfd3';
}

function validateNode(node, path) {
  if (!node || typeof node !== 'object') throw new Error(`${path} должен быть объектом.`);
  const type = String(node.type || '').trim();
  const supported = new Set([
    'sphere', 'box', 'roundedBox', 'cylinder', 'torus', 'capsule', 'extrudePolygon', 'lathe',
    'union', 'subtract', 'intersect', 'smoothUnion', 'array', 'radialArray', 'mirror', 'halfSpace'
  ]);
  if (!supported.has(type)) throw new Error(`${path}: неизвестный type «${type}».`);
  if (['union', 'subtract', 'intersect', 'smoothUnion'].includes(type)) {
    if (!Array.isArray(node.children) || !node.children.length) throw new Error(`${path}.children должен содержать геометрию.`);
    node.children.forEach((child, i) => validateNode(child, `${path}.children[${i}]`));
  }
  if (['array', 'radialArray', 'mirror'].includes(type)) {
    if (!node.child) throw new Error(`${path}.child отсутствует.`);
    validateNode(node.child, `${path}.child`);
  }
  if (type === 'extrudePolygon') validatePolygon(node.points, `${path}.points`);
  if (type === 'lathe') validatePolygon(node.profile, `${path}.profile`);
}

function validatePolygon(points, path) {
  if (!Array.isArray(points) || points.length < 3 || points.some(p => !Array.isArray(p) || p.length < 2)) {
    throw new Error(`${path} должен содержать минимум три точки [x, y].`);
  }
}

export function compileDocument(document) {
  const doc = normalizeDocument(document);
  return {
    ...doc,
    parts: doc.parts.map(part => ({ ...part, compiled: compileNode(part.node) }))
  };
}

export function compileNode(node) {
  validateNode(node, 'node');
  const base = compileRawNode(node);
  const transform = readTransform(node);
  if (!transform.hasTransform) return base;
  const inv = inverseTransformFactory(transform);
  const bounds = transformBounds(base.bounds, transform);
  return {
    bounds,
    sdf(x, y, z) {
      const p = inv(x, y, z);
      return base.sdf(p[0], p[1], p[2]) * transform.distanceScale;
    }
  };
}

function compileRawNode(node) {
  switch (node.type) {
    case 'sphere': return primitiveSphere(node);
    case 'box': return primitiveBox(node, false);
    case 'roundedBox': return primitiveBox(node, true);
    case 'cylinder': return primitiveCylinder(node);
    case 'torus': return primitiveTorus(node);
    case 'capsule': return primitiveCapsule(node);
    case 'extrudePolygon': return primitiveExtrude(node);
    case 'lathe': return primitiveLathe(node);
    case 'halfSpace': return primitiveHalfSpace(node);
    case 'union': return operationUnion(node);
    case 'smoothUnion': return operationSmoothUnion(node);
    case 'subtract': return operationSubtract(node);
    case 'intersect': return operationIntersect(node);
    case 'array': return operationArray(node);
    case 'radialArray': return operationRadialArray(node);
    case 'mirror': return operationMirror(node);
    default: throw new Error(`Неизвестный узел ${node.type}`);
  }
}

function primitiveSphere(node) {
  const r = Math.max(EPS, num(node.radius, 10));
  return { bounds: boxBounds([-r, -r, -r], [r, r, r]), sdf: (x, y, z) => Math.hypot(x, y, z) - r };
}

function primitiveBox(node, rounded) {
  const size = vec3(node.size, [20, 20, 20]).map(v => Math.max(EPS, Math.abs(v)));
  const h = size.map(v => v / 2);
  const r = rounded ? clamp(num(node.radius, 2), 0, Math.min(...h) - EPS) : 0;
  const bounds = boxBounds(h.map(v => -v), h);
  return {
    bounds,
    sdf(x, y, z) {
      const qx = Math.abs(x) - (h[0] - r);
      const qy = Math.abs(y) - (h[1] - r);
      const qz = Math.abs(z) - (h[2] - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    }
  };
}

function primitiveCylinder(node) {
  const radius = Math.max(EPS, num(node.radius, 8));
  const height = Math.max(EPS, num(node.height, 20));
  const h = height / 2;
  const axis = String(node.axis || 'z').toLowerCase();
  const bounds = axis === 'x' ? boxBounds([-h, -radius, -radius], [h, radius, radius])
    : axis === 'y' ? boxBounds([-radius, -h, -radius], [radius, h, radius])
      : boxBounds([-radius, -radius, -h], [radius, radius, h]);
  return {
    bounds,
    sdf(x, y, z) {
      let axial, radial;
      if (axis === 'x') { axial = x; radial = Math.hypot(y, z); }
      else if (axis === 'y') { axial = y; radial = Math.hypot(x, z); }
      else { axial = z; radial = Math.hypot(x, y); }
      const dx = radial - radius;
      const dy = Math.abs(axial) - h;
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
    }
  };
}

function primitiveTorus(node) {
  const major = Math.max(EPS, num(node.majorRadius, 12));
  const minor = Math.max(EPS, num(node.minorRadius, 3));
  const axis = String(node.axis || 'z').toLowerCase();
  const R = major + minor;
  const bounds = axis === 'x' ? boxBounds([-minor, -R, -R], [minor, R, R])
    : axis === 'y' ? boxBounds([-R, -minor, -R], [R, minor, R])
      : boxBounds([-R, -R, -minor], [R, R, minor]);
  return {
    bounds,
    sdf(x, y, z) {
      if (axis === 'x') return Math.hypot(Math.hypot(y, z) - major, x) - minor;
      if (axis === 'y') return Math.hypot(Math.hypot(x, z) - major, y) - minor;
      return Math.hypot(Math.hypot(x, y) - major, z) - minor;
    }
  };
}

function primitiveCapsule(node) {
  const radius = Math.max(EPS, num(node.radius, 5));
  const length = Math.max(0, num(node.length, 20));
  const h = length / 2;
  const axis = String(node.axis || 'z').toLowerCase();
  const bounds = axis === 'x' ? boxBounds([-h - radius, -radius, -radius], [h + radius, radius, radius])
    : axis === 'y' ? boxBounds([-radius, -h - radius, -radius], [radius, h + radius, radius])
      : boxBounds([-radius, -radius, -h - radius], [radius, radius, h + radius]);
  return {
    bounds,
    sdf(x, y, z) {
      let a, b, c;
      if (axis === 'x') { a = x; b = y; c = z; }
      else if (axis === 'y') { a = y; b = x; c = z; }
      else { a = z; b = x; c = y; }
      a -= clamp(a, -h, h);
      return Math.hypot(a, b, c) - radius;
    }
  };
}

function primitiveExtrude(node) {
  const points = node.points.map(p => [num(p[0]), num(p[1])]);
  const height = Math.max(EPS, num(node.height, 10));
  const h = height / 2;
  const pb = bounds2(points);
  return {
    bounds: boxBounds([pb.min[0], pb.min[1], -h], [pb.max[0], pb.max[1], h]),
    sdf(x, y, z) {
      const d2 = polygonSdf(x, y, points);
      const dz = Math.abs(z) - h;
      return Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0);
    }
  };
}

function primitiveLathe(node) {
  const profile = node.profile.map(p => [Math.max(0, num(p[0])), num(p[1])]);
  const pb = bounds2(profile);
  const r = pb.max[0];
  return {
    bounds: boxBounds([-r, -r, pb.min[1]], [r, r, pb.max[1]]),
    sdf(x, y, z) { return polygonSdf(Math.hypot(x, y), z, profile); }
  };
}

function primitiveHalfSpace(node) {
  const normal = normalize3(vec3(node.normal, [1, 0, 0]));
  const offset = num(node.offset, 0);
  return {
    infinite: true,
    bounds: boxBounds([-1e6, -1e6, -1e6], [1e6, 1e6, 1e6]),
    sdf: (x, y, z) => x * normal[0] + y * normal[1] + z * normal[2] - offset
  };
}

function operationUnion(node) {
  const children = node.children.map(compileNode);
  return {
    bounds: unionBounds(children.map(c => c.bounds)),
    sdf(x, y, z) {
      let d = Infinity;
      for (const c of children) d = Math.min(d, c.sdf(x, y, z));
      return d;
    }
  };
}

function operationSmoothUnion(node) {
  const children = node.children.map(compileNode);
  const k = Math.max(EPS, num(node.radius, node.k ?? 2));
  return {
    bounds: expandBounds(unionBounds(children.map(c => c.bounds)), k),
    sdf(x, y, z) {
      let d = children[0].sdf(x, y, z);
      for (let i = 1; i < children.length; i++) d = smoothMin(d, children[i].sdf(x, y, z), k);
      return d;
    }
  };
}

function operationSubtract(node) {
  const children = node.children.map(compileNode);
  return {
    bounds: children[0].bounds,
    sdf(x, y, z) {
      let d = children[0].sdf(x, y, z);
      for (let i = 1; i < children.length; i++) d = Math.max(d, -children[i].sdf(x, y, z));
      return d;
    }
  };
}

function operationIntersect(node) {
  const children = node.children.map(compileNode);
  const finite = children.filter(c => !c.infinite && Math.max(...c.bounds.size) < 1e5);
  const bounds = finite.length ? intersectBounds(finite.map(c => c.bounds)) : children[0].bounds;
  return {
    bounds,
    sdf(x, y, z) {
      let d = -Infinity;
      for (const c of children) d = Math.max(d, c.sdf(x, y, z));
      return d;
    }
  };
}

function operationArray(node) {
  const child = compileNode(node.child);
  const count = clamp(Math.round(num(node.count, 2)), 1, 64);
  const step = vec3(node.step, [10, 0, 0]);
  const centered = node.centered !== false;
  const offsets = [];
  for (let i = 0; i < count; i++) {
    const t = centered ? i - (count - 1) / 2 : i;
    offsets.push([step[0] * t, step[1] * t, step[2] * t]);
  }
  const bounds = unionBounds(offsets.map(o => translateBounds(child.bounds, o)));
  return {
    bounds,
    sdf(x, y, z) {
      let d = Infinity;
      for (const o of offsets) d = Math.min(d, child.sdf(x - o[0], y - o[1], z - o[2]));
      return d;
    }
  };
}

function operationRadialArray(node) {
  const child = compileNode(node.child);
  const count = clamp(Math.round(num(node.count, 6)), 1, 64);
  const axis = String(node.axis || 'z').toLowerCase();
  const span = num(node.angle, 360);
  const offset = num(node.startAngle, 0);
  const angles = Array.from({ length: count }, (_, i) => (offset + (span === 360 ? i * span / count : i * span / Math.max(1, count - 1))) * DEG);
  const rotatePoint = axis === 'x' ? rotatePointX : axis === 'y' ? rotatePointY : rotatePointZ;
  const bounds = unionBounds(angles.map(a => rotateBounds(child.bounds, axis, -a)));
  return {
    bounds,
    sdf(x, y, z) {
      let d = Infinity;
      for (const a of angles) {
        const p = rotatePoint(x, y, z, -a);
        d = Math.min(d, child.sdf(p[0], p[1], p[2]));
      }
      return d;
    }
  };
}

function operationMirror(node) {
  const child = compileNode(node.child);
  const axes = Array.isArray(node.axes) ? node.axes.map(String) : [String(node.axis || 'x')];
  const combos = [[1, 1, 1]];
  for (const axis of axes) {
    const idx = axis.toLowerCase() === 'y' ? 1 : axis.toLowerCase() === 'z' ? 2 : 0;
    const current = combos.slice();
    for (const c of current) { const n = c.slice(); n[idx] *= -1; combos.push(n); }
  }
  const bounds = unionBounds(combos.map(s => boxBounds(
    child.bounds.min.map((v, i) => s[i] > 0 ? v : -child.bounds.max[i]),
    child.bounds.max.map((v, i) => s[i] > 0 ? v : -child.bounds.min[i])
  )));
  return {
    bounds,
    sdf(x, y, z) {
      let d = Infinity;
      for (const s of combos) d = Math.min(d, child.sdf(x * s[0], y * s[1], z * s[2]));
      return d;
    }
  };
}

function smoothMin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function readTransform(node) {
  const position = vec3(node.position || node.translate, [0, 0, 0]);
  const rotation = vec3(node.rotation, [0, 0, 0]).map(v => v * DEG);
  const rawScale = Array.isArray(node.scale) ? vec3(node.scale, [1, 1, 1]) : [num(node.scale, 1), num(node.scale, 1), num(node.scale, 1)];
  const scale = rawScale.map(v => Math.abs(v) < EPS ? EPS : v);
  const hasTransform = position.some(v => Math.abs(v) > EPS) || rotation.some(v => Math.abs(v) > EPS) || scale.some(v => Math.abs(v - 1) > EPS);
  return { position, rotation, scale, hasTransform, distanceScale: Math.min(...scale.map(Math.abs)) };
}

function inverseTransformFactory(t) {
  return (x, y, z) => {
    x -= t.position[0]; y -= t.position[1]; z -= t.position[2];
    [x, y, z] = rotatePointZ(x, y, z, -t.rotation[2]);
    [x, y, z] = rotatePointY(x, y, z, -t.rotation[1]);
    [x, y, z] = rotatePointX(x, y, z, -t.rotation[0]);
    return [x / t.scale[0], y / t.scale[1], z / t.scale[2]];
  };
}

function transformBounds(bounds, transform) {
  const corners = boundsCorners(bounds).map(([x, y, z]) => {
    x *= transform.scale[0]; y *= transform.scale[1]; z *= transform.scale[2];
    [x, y, z] = rotatePointX(x, y, z, transform.rotation[0]);
    [x, y, z] = rotatePointY(x, y, z, transform.rotation[1]);
    [x, y, z] = rotatePointZ(x, y, z, transform.rotation[2]);
    return [x + transform.position[0], y + transform.position[1], z + transform.position[2]];
  });
  return pointsBounds(corners);
}

function rotateBounds(bounds, axis, angle) {
  const f = axis === 'x' ? rotatePointX : axis === 'y' ? rotatePointY : rotatePointZ;
  return pointsBounds(boundsCorners(bounds).map(p => f(p[0], p[1], p[2], angle)));
}

function rotatePointX(x, y, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x, y * c - z * s, y * s + z * c]; }
function rotatePointY(x, y, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, y, -x * s + z * c]; }
function rotatePointZ(x, y, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c, z]; }

function polygonSdf(x, y, points) {
  let minSq = Infinity;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = x - a[0], wy = y - a[1];
    const t = clamp((wx * vx + wy * vy) / Math.max(EPS, vx * vx + vy * vy), 0, 1);
    const dx = wx - vx * t, dy = wy - vy * t;
    minSq = Math.min(minSq, dx * dx + dy * dy);
    if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] || EPS) + a[0])) inside = !inside;
  }
  return Math.sqrt(minSq) * (inside ? -1 : 1);
}

function bounds2(points) {
  const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
  for (const p of points) { min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]); max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]); }
  return { min, max };
}

export function boxBounds(min, max) {
  return { min: min.slice(), max: max.slice(), size: max.map((v, i) => v - min[i]), center: max.map((v, i) => (v + min[i]) / 2) };
}

function pointsBounds(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  return boxBounds(min, max);
}

export function unionBounds(boundsList) {
  if (!boundsList.length) return boxBounds([0, 0, 0], [0, 0, 0]);
  return pointsBounds(boundsList.flatMap(boundsCorners));
}

function intersectBounds(boundsList) {
  const min = [0, 1, 2].map(i => Math.max(...boundsList.map(b => b.min[i])));
  const max = [0, 1, 2].map(i => Math.min(...boundsList.map(b => b.max[i])));
  for (let i = 0; i < 3; i++) if (max[i] < min[i]) max[i] = min[i] + EPS;
  return boxBounds(min, max);
}

export function expandBounds(bounds, amount) {
  return boxBounds(bounds.min.map(v => v - amount), bounds.max.map(v => v + amount));
}

function translateBounds(bounds, offset) {
  return boxBounds(bounds.min.map((v, i) => v + offset[i]), bounds.max.map((v, i) => v + offset[i]));
}

function boundsCorners(bounds) {
  const [x0, y0, z0] = bounds.min, [x1, y1, z1] = bounds.max;
  return [[x0,y0,z0],[x1,y0,z0],[x0,y1,z0],[x1,y1,z0],[x0,y0,z1],[x1,y0,z1],[x0,y1,z1],[x1,y1,z1]];
}

function normalize3(v) {
  const l = Math.hypot(...v) || 1;
  return v.map(x => x / l);
}

export function translatePartNode(node, offset) {
  return { type: 'union', position: vec3(offset), children: [structuredCloneSafe(node)] };
}

export function transformPartNode(node, { position = [0,0,0], rotation = [0,0,0], scale = [1,1,1] } = {}) {
  return { type: 'union', position: vec3(position), rotation: vec3(rotation), scale: Array.isArray(scale) ? vec3(scale, [1,1,1]) : num(scale, 1), children: [structuredCloneSafe(node)] };
}

export function splitPartDocument(document, partId, options = {}) {
  const doc = normalizeDocument(document);
  const index = doc.parts.findIndex(p => p.id === partId);
  if (index < 0) throw new Error('Деталь для разреза не найдена.');
  const source = doc.parts[index];
  const axis = ['x','y','z'].includes(options.axis) ? options.axis : 'z';
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const compiled = compileNode(source.node);
  const cut = Number.isFinite(Number(options.position)) ? Number(options.position) : compiled.bounds.center[axisIndex];
  const gap = clamp(num(options.gap, 0.2), 0, 5);
  const negativeNormal = [0,0,0]; negativeNormal[axisIndex] = 1;
  const positiveNormal = [0,0,0]; positiveNormal[axisIndex] = -1;
  const negClip = { type: 'halfSpace', normal: negativeNormal, offset: cut - gap / 2 };
  const posClip = { type: 'halfSpace', normal: positiveNormal, offset: -(cut + gap / 2) };
  let negNode = { type: 'intersect', children: [structuredCloneSafe(source.node), negClip] };
  let posNode = { type: 'intersect', children: [structuredCloneSafe(source.node), posClip] };
  const pins = clamp(Math.round(num(options.pins, 0)), 0, 2);
  if (pins > 0) {
    const pinDiameter = clamp(num(options.pinDiameter, 4), 1, 20);
    const clearance = clamp(num(options.clearance, 0.25), 0.05, 1.5);
    const depth = clamp(num(options.pinDepth, 5), 2, 20);
    const secondary = [0,1,2].filter(i => i !== axisIndex);
    const b = compiled.bounds;
    const span = b.size[secondary[0]];
    const offsets = pins === 1 ? [0] : [-span * 0.22, span * 0.22];
    const pinNodes = offsets.map((off, i) => {
      const p = b.center.slice();
      p[axisIndex] = cut + depth * 0.25;
      p[secondary[0]] = b.center[secondary[0]] + off;
      if (pins === 1) p[secondary[1]] = b.center[secondary[1]];
      else p[secondary[1]] = b.center[secondary[1]] + (i ? -1 : 1) * b.size[secondary[1]] * 0.12;
      return { type: 'cylinder', radius: pinDiameter / 2, height: depth * 1.5, axis, position: p };
    });
    const holeNodes = pinNodes.map(pin => ({ ...structuredCloneSafe(pin), radius: pinDiameter / 2 + clearance, height: depth * 1.7 }));
    negNode = { type: 'union', children: [negNode, ...pinNodes] };
    posNode = { type: 'subtract', children: [posNode, ...holeNodes] };
  }
  const baseName = source.name;
  const left = { ...source, id: uniqueId(doc.parts, `${source.id}-a`), name: `${baseName} · A`, node: negNode };
  const right = { ...source, id: uniqueId([...doc.parts, left], `${source.id}-b`), name: `${baseName} · B`, node: posNode, color: shiftColor(source.color, 0.08) };
  doc.parts.splice(index, 1, left, right);
  return doc;
}

function uniqueId(parts, base) {
  const ids = new Set(parts.map(p => p.id));
  let id = base, n = 2;
  while (ids.has(id)) id = `${base}-${n++}`;
  return id;
}

function shiftColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const values = [n >> 16, (n >> 8) & 255, n & 255].map(v => clamp(Math.round(v + 255 * amount), 0, 255));
  return '#' + values.map(v => v.toString(16).padStart(2, '0')).join('');
}

export function serializeDocument(document) {
  return JSON.stringify(normalizeDocument(document), null, 2);
}
