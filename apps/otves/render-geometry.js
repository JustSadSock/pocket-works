// Pure, deterministic 3D meshes shared by the WebGL renderer and its regression tests.
// World: X = maze column, Z = maze row, Y = height above the maze floor.
function mesh() {
  return { positions: [], normals: [], indices: [] };
}

function face(target, a, b, c, d, normal) {
  const index = target.positions.length / 3;
  for (const point of [a, b, c, d]) {
    target.positions.push(...point);
    target.normals.push(...normal);
  }
  target.indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
}

function finish(target) {
  return {
    positions: new Float32Array(target.positions),
    normals: new Float32Array(target.normals),
    indices: new Uint32Array(target.indices)
  };
}

export function makeBox(x0, y0, z0, x1, y1, z1) {
  const m = mesh();
  face(m, [x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0], [0,1,0]);
  face(m, [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1], [0,-1,0]);
  face(m, [x0,y0,z1], [x1,y0,z1], [x1,y1,z1], [x0,y1,z1], [0,0,1]);
  face(m, [x1,y0,z0], [x0,y0,z0], [x0,y1,z0], [x1,y1,z0], [0,0,-1]);
  face(m, [x1,y0,z1], [x1,y0,z0], [x1,y1,z0], [x1,y1,z1], [1,0,0]);
  face(m, [x0,y0,z0], [x0,y0,z1], [x0,y1,z1], [x0,y1,z0], [-1,0,0]);
  return finish(m);
}

// The old maze exports overlapping wall rectangles. Drawing each as a cube would
// cause z-fighting at every junction. Build the exact union of the rectangles,
// exposing only its top and genuine exterior faces.
export function makeUnifiedWalls(walls, height = 0.38) {
  const uniqueSorted = (values) => [...new Set(values.map((v) => +v.toFixed(6)))].sort((a, b) => a - b);
  const xs = uniqueSorted(walls.flatMap((w) => [w.x, w.x + w.width]));
  const zs = uniqueSorted(walls.flatMap((w) => [w.y, w.y + w.height]));
  const m = mesh();
  if (!walls.length) return finish(m);
  const cols = xs.length - 1;
  const rows = zs.length - 1;
  const filled = new Uint8Array(cols * rows);
  const idx = (x,z) => z * cols + x;
  for (let z = 0; z < rows; z++) {
    const cz = (zs[z] + zs[z + 1]) / 2;
    for (let x = 0; x < cols; x++) {
      const cx = (xs[x] + xs[x + 1]) / 2;
      if (walls.some((w) => cx >= w.x - 0.000001 &&
        cx <= w.x + w.width + 0.000001 &&
        cz >= w.y - 0.000001 && cz <= w.y + w.height + 0.000001)) {
        filled[idx(x,z)] = 1;
      }
    }
  }
  let exposed = 0;
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      if (!filled[idx(x,z)]) continue;
      const x0 = xs[x], x1 = xs[x+1], z0 = zs[z], z1 = zs[z+1];
      face(m,[x0,height,z0],[x0,height,z1],[x1,height,z1],[x1,height,z0],[0,1,0]);
      const open = (dx,dz) => x+dx<0 || x+dx>=cols || z+dz<0 || z+dz>=rows || !filled[idx(x+dx,z+dz)];
      if (open(-1,0)) {
        face(m,[x0,0,z0],[x0,0,z1],[x0,height,z1],[x0,height,z0],[-1,0,0]); exposed++;
      }
      if (open(1,0)) {
        face(m,[x1,0,z1],[x1,0,z0],[x1,height,z0],[x1,height,z1],[1,0,0]); exposed++;
      }
      if (open(0,-1)) {
        face(m,[x1,0,z0],[x0,0,z0],[x0,height,z0],[x1,height,z0],[0,0,-1]); exposed++;
      }
      if (open(0,1)) {
        face(m,[x0,0,z1],[x1,0,z1],[x1,height,z1],[x0,height,z1],[0,0,1]); exposed++;
      }
    }
  }
  const result = finish(m);
  result.exposedSides = exposed;
  return result;
}

export function makeFloorWithHole(cols, rows, goal, radius = 0.385) {
  const m = mesh();
  const goalX = Math.floor(goal.x);
  const goalZ = Math.floor(goal.y);
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      if (x === goalX && z === goalZ) continue;
      face(m,[x,0,z],[x,0,z+1],[x+1,0,z+1],[x+1,0,z],[0,1,0]);
    }
  }
  // A square tile around the hole, tessellated into an annular surface.
  // Each radial edge reaches the exact tile boundary (no cracks with other tiles).
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const points = [i, i+1].map((n) => {
      const angle = n * Math.PI * 2 / steps;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      const toEdge = 0.5 / Math.max(Math.abs(dx), Math.abs(dz));
      return {
        inner: [goal.x + dx * radius, 0, goal.y + dz * radius],
        outer: [goal.x + dx * toEdge, 0, goal.y + dz * toEdge]
      };
    });
    face(m,points[0].inner,points[0].outer,points[1].outer,points[1].inner,[0,1,0]);
  }
  // Real vertical thickness around the board; unlike a plane it has visible edges.
  face(m,[0,-0.24,rows],[cols,-0.24,rows],[cols,0,rows],[0,0,rows],[0,0,1]);
  face(m,[cols,-0.24,0],[0,-0.24,0],[0,0,0],[cols,0,0],[0,0,-1]);
  face(m,[cols,-0.24,rows],[cols,-0.24,0],[cols,0,0],[cols,0,rows],[1,0,0]);
  face(m,[0,-0.24,0],[0,-0.24,rows],[0,0,rows],[0,0,0],[-1,0,0]);
  return finish(m);
}

export function makeWell(x, z, radius = 0.385, depth = 0.235) {
  const m = mesh();
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const a = i * 2 * Math.PI / steps;
    const b = (i + 1) * 2 * Math.PI / steps;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const A = [x+radius*ca,0,z+radius*sa];
    const B = [x+radius*cb,0,z+radius*sb];
    const C = [x+radius*cb,-depth,z+radius*sb];
    const D = [x+radius*ca,-depth,z+radius*sa];
    // Inward-facing surface, visible from above the recessed opening.
    face(m,A,B,C,D,[-(ca+cb)*.5,0,-(sa+sb)*.5]);
    face(m,[x,-depth,z],D,C,[x,-depth,z],[0,1,0]);
  }
  return finish(m);
}

export function makeTorus(major, minor, rings = 64, sides = 10) {
  const m = mesh();
  for (let i = 0; i < rings; i++) {
    const a = i * Math.PI * 2 / rings, b = (i+1) * Math.PI * 2 / rings;
    for (let j = 0; j < sides; j++) {
      const c = j * Math.PI * 2 / sides, d = (j+1) * Math.PI * 2 / sides;
      const point = (theta,phi) => [(major+minor*Math.cos(phi))*Math.cos(theta),minor*Math.sin(phi),(major+minor*Math.cos(phi))*Math.sin(theta)];
      const normal = (theta,phi) => [Math.cos(theta)*Math.cos(phi),Math.sin(phi),Math.sin(theta)*Math.cos(phi)];
      const index = m.positions.length/3;
      for (const [theta,phi] of [[a,c],[b,c],[b,d],[a,d]]) {
        m.positions.push(...point(theta,phi));
        m.normals.push(...normal(theta,phi));
      }
      m.indices.push(index,index+1,index+2,index,index+2,index+3);
    }
  }
  return finish(m);
}

export function makeSphere(radius = 0.265, longitude = 32, latitude = 20) {
  const m = mesh();
  for (let y = 0; y < latitude; y++) {
    for (let x = 0; x < longitude; x++) {
      const angles = [[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
      const first = m.positions.length / 3;
      for (const [u,v] of angles) {
        const phi = u * Math.PI*2/longitude;
        const theta = v * Math.PI/latitude;
        const normal = [Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi)];
        m.positions.push(...normal.map((component) => component*radius));
        m.normals.push(...normal);
      }
      m.indices.push(first,first+1,first+2,first,first+2,first+3);
    }
  }
  return finish(m);
}
