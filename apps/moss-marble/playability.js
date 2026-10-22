// Conservative static navigation check for procedural mini-golf courses.
// Every corridor is inflated by the ball radius and an additional aiming margin.
// Dynamic rotors are not treated as permanent walls: they can be timed around.
const BALL_RADIUS = 22;
const DEFAULT_MARGIN = 15;
const GRID = 22;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

function pointInPolygon(x, y, outline) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i], b = outline[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function collidersFor(level) {
  const circles = [];
  for (const object of level.obstacles || []) {
    if (object.kind === 'rockCluster' && object.parts?.length) {
      for (const part of object.parts) circles.push({
        x: object.x + Number(part.x || 0), y: object.y + Number(part.y || 0),
        r: Math.max(1, Number(part.r || object.r || 0))
      });
    } else {
      circles.push({ x: object.x, y: object.y, r: Math.max(1, Number(object.r || 0)) });
    }
  }
  // A moving rotor occupies a variable arc; only its permanent spindle blocks a route.
  for (const rotor of level.rotors || []) circles.push({
    x: rotor.x, y: rotor.y, r: Math.max(12, Number(rotor.thickness || 20) / 2)
  });
  return circles;
}

export function inspectCoursePassage(level, options = {}) {
  const outline = level?.outline;
  if (!Array.isArray(outline) || outline.length < 3 || !level.start || !level.hole) {
    return { ok: false, reason: 'missing-geometry', visited: 0 };
  }
  const margin = Number.isFinite(options.margin) ? options.margin : DEFAULT_MARGIN;
  const clearance = BALL_RADIUS + Math.max(0, margin);
  const step = GRID;
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const columns = Math.ceil((maxX - minX) / step) + 1;
  const rows = Math.ceil((maxY - minY) / step) + 1;
  if (columns * rows > 40000) return { ok: false, reason: 'navigation-budget', visited: 0 };
  const passable = new Uint8Array(columns * rows);
  const circles = collidersFor(level);
  const walls = level.walls || [];

  for (let row = 0; row < rows; row++) {
    const y = minY + row * step;
    for (let col = 0; col < columns; col++) {
      const x = minX + col * step;
      if (!pointInPolygon(x, y, outline)) continue;
      if (outline.some((a, i) => {
        const b = outline[(i + 1) % outline.length];
        return segmentDistance(x, y, a.x, a.y, b.x, b.y) < clearance;
      })) continue;
      if (circles.some(circle => Math.hypot(x - circle.x, y - circle.y) < clearance + circle.r)) continue;
      if (walls.some(wall => segmentDistance(x, y, wall.ax, wall.ay, wall.bx, wall.by) < clearance + Number(wall.thickness || 18) * .5)) continue;
      passable[row * columns + col] = 1;
    }
  }

  const closest = (point) => {
    let best = -1, bestDist = Infinity;
    for (let index = 0; index < passable.length; index++) {
      if (!passable[index]) continue;
      const x = minX + (index % columns) * step;
      const y = minY + Math.floor(index / columns) * step;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < bestDist) { bestDist = distance; best = index; }
    }
    return bestDist < clearance + step * 2 ? best : -1;
  };
  const start = closest(level.start), goal = closest(level.hole);
  if (start < 0 || goal < 0) return { ok: false, reason: start < 0 ? 'start-trapped' : 'hole-trapped', visited: 0 };

  const explored = new Uint8Array(passable.length);
  const queue = new Int32Array(passable.length);
  let first = 0, last = 1, visited = 0;
  explored[start] = 1;
  queue[0] = start;
  while (first < last) {
    const index = queue[first++];
    visited++;
    if (index === goal) return { ok: true, reason: null, visited };
    const col = index % columns, row = Math.floor(index / columns);
    // Orthogonal movement keeps a diagonal from cutting through the corner of a wall.
    for (const candidate of [col > 0 ? index - 1 : -1, col + 1 < columns ? index + 1 : -1,
      row > 0 ? index - columns : -1, row + 1 < rows ? index + columns : -1]) {
      if (candidate >= 0 && passable[candidate] && !explored[candidate]) {
        explored[candidate] = 1;
        queue[last++] = candidate;
      }
    }
  }
  return { ok: false, reason: 'blocked-route', visited };
}

export function repairProceduralPassage(level) {
  const removed = { barriers: [], props: [], rotors: [] };
  let check = inspectCoursePassage(level);
  if (check.ok) return { ...check, removed };

  // Remove complete optional barrier chains; never leave half a decorative wall.
  const barrierIds = [...new Set((level.walls || []).filter(w => w.barrierId).map(w => w.barrierId))];
  for (const id of barrierIds) {
    if (check.ok) break;
    level.walls = level.walls.filter(w => w.barrierId !== id);
    removed.barriers.push(id);
    check = inspectCoursePassage(level);
  }
  // Preserve tunnel mouths, unless they obstruct the only available path.
  if (!check.ok && level.walls?.some(w => w.tunnelWall)) {
    level.walls = level.walls.filter(w => !w.tunnelWall);
    check = inspectCoursePassage(level);
  }
  while (!check.ok && level.obstacles?.length) {
    const prop = level.obstacles.shift();
    removed.props.push(prop.propId || 'prop');
    check = inspectCoursePassage(level);
  }
  while (!check.ok && level.rotors?.length) {
    const rotor = level.rotors.shift();
    removed.rotors.push(rotor.rotorId || 'rotor');
    check = inspectCoursePassage(level);
  }
  // The renderer must receive exactly the colliders that physics receives.
  level.course18.barriers = level.walls.filter(w => w.barrierId);
  level.course18.props = level.obstacles;
  return { ...check, removed };
}
