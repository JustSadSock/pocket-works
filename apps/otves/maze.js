const DIRECTIONS = [
  { key: 'n', opposite: 's', dc: 0, dr: -1 },
  { key: 'e', opposite: 'w', dc: 1, dr: 0 },
  { key: 's', opposite: 'n', dc: 0, dr: 1 },
  { key: 'w', opposite: 'e', dc: -1, dr: 0 }
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

export function dimensionsForLevel(level, aspect = 0.65) {
  const step = Math.max(0, level - 1);
  if (aspect > 1.08) {
    return {
      cols: Math.min(17, 10 + Math.floor(step / 2)),
      rows: Math.min(11, 7 + Math.floor(step / 3))
    };
  }
  return {
    cols: Math.min(12, 7 + Math.floor(step / 3)),
    rows: Math.min(17, 10 + Math.floor(step / 2))
  };
}

export function createMaze({ cols, rows, seed }) {
  const random = mulberry32(seed);
  const cells = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => ({
    col,
    row,
    visited: false,
    n: true,
    e: true,
    s: true,
    w: true
  })));

  const stack = [cells[0][0]];
  cells[0][0].visited = true;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const candidates = shuffle(DIRECTIONS.slice(), random).filter(({ dc, dr }) => {
      const col = current.col + dc;
      const row = current.row + dr;
      return col >= 0 && col < cols && row >= 0 && row < rows && !cells[row][col].visited;
    });

    if (!candidates.length) {
      stack.pop();
      continue;
    }

    const direction = candidates[0];
    const next = cells[current.row + direction.dr][current.col + direction.dc];
    current[direction.key] = false;
    next[direction.opposite] = false;
    next.visited = true;
    stack.push(next);
  }

  for (const row of cells) {
    for (const cell of row) delete cell.visited;
  }

  const wallThickness = 0.13;
  const walls = buildWallRects(cells, wallThickness);
  return {
    cols,
    rows,
    seed,
    cells,
    walls,
    wallThickness,
    start: { x: 0.5, y: 0.5 },
    goal: { x: cols - 0.5, y: rows - 0.5 }
  };
}

function buildWallRects(cells, thickness) {
  const rows = cells.length;
  const cols = cells[0].length;
  const walls = [];
  const addHorizontal = (col, row) => walls.push({
    x: col - thickness / 2,
    y: row - thickness / 2,
    width: 1 + thickness,
    height: thickness,
    orientation: 'h'
  });
  const addVertical = (col, row) => walls.push({
    x: col - thickness / 2,
    y: row - thickness / 2,
    width: thickness,
    height: 1 + thickness,
    orientation: 'v'
  });

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[row][col];
      if (cell.n) addHorizontal(col, row);
      if (cell.w) addVertical(col, row);
      if (row === rows - 1 && cell.s) addHorizontal(col, row + 1);
      if (col === cols - 1 && cell.e) addVertical(col + 1, row);
    }
  }

  return walls;
}

export function seedForLevel(runSeed, level) {
  let value = (runSeed ^ Math.imul(level + 17, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}
