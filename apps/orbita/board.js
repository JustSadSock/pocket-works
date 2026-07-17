import { RINGS, SECTORS } from './engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const RING_RADII = [82, 142, 202, 262];
export const ROMAN = ['I', 'II', 'III', 'IV'];

function createSvg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
}

export function pointAtRadius(radius, sector) {
  const angle = ((sector * 45) - 90) * Math.PI / 180;
  return { x: 300 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius };
}

export function pointFor(ring, sector) {
  return pointAtRadius(RING_RADII[ring], sector);
}

export function buildBoard(board) {
  board.replaceChildren();
  board.append(createSvg('circle', { class: 'field-disc', cx: 300, cy: 300, r: 292 }));

  for (let sector = 0; sector < SECTORS; sector += 1) {
    const inner = pointAtRadius(56, sector);
    const outer = pointAtRadius(284, sector);
    board.append(createSvg('line', {
      class: 'radial-guide', x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y
    }));
  }

  for (let ring = 0; ring < RINGS; ring += 1) {
    const group = createSvg('g', { class: 'ring-group', 'data-ring-group': ring });
    group.append(createSvg('circle', { class: 'ring-band', cx: 300, cy: 300, r: RING_RADII[ring] }));
    group.append(createSvg('circle', { class: 'ring-rail', cx: 300, cy: 300, r: RING_RADII[ring] }));

    for (let tick = 0; tick < 16; tick += 1) {
      const angle = ((tick * 22.5) - 90) * Math.PI / 180;
      const radius = RING_RADII[ring];
      const length = tick % 2 === 0 ? 8 : 4;
      group.append(createSvg('line', {
        class: 'ring-tick',
        x1: 300 + Math.cos(angle) * (radius - length),
        y1: 300 + Math.sin(angle) * (radius - length),
        x2: 300 + Math.cos(angle) * (radius + length),
        y2: 300 + Math.sin(angle) * (radius + length)
      }));
    }

    for (let sector = 0; sector < SECTORS; sector += 1) {
      const { x, y } = pointFor(ring, sector);
      const cell = createSvg('g', {
        class: 'board-cell', transform: `translate(${x} ${y})`,
        'data-cell': 'true', 'data-ring': ring, 'data-sector': sector,
        role: 'button', tabindex: '0'
      });
      cell.append(createSvg('circle', { class: 'cell-hit', cx: 0, cy: 0, r: 31 }));
      cell.append(createSvg('circle', { class: 'cell-well', cx: 0, cy: 0, r: 21 }));
      group.append(cell);
    }

    const labelPoint = pointAtRadius(RING_RADII[ring], 1);
    const label = createSvg('text', { class: 'ring-number', x: labelPoint.x, y: labelPoint.y });
    label.textContent = ROMAN[ring];
    group.append(label);
    board.append(group);
  }

  board.append(createSvg('circle', { class: 'center-spindle', cx: 300, cy: 300, r: 20 }));
  board.append(createSvg('circle', { class: 'center-dot', cx: 300, cy: 300, r: 6 }));
}

export function renderBoard(board, state, { canPlace, locked }) {
  board.classList.toggle('phase-rotate', state.phase === 'rotate');
  board.classList.toggle('ai-locked', locked);
  const winnerKeys = new Set(state.winPath.map((cell) => `${cell.ring}:${cell.sector}`));
  const challengeKeys = new Set(state.challengePath.map((cell) => `${cell.ring}:${cell.sector}`));

  board.querySelectorAll('[data-cell]').forEach((cell) => {
    const ring = Number(cell.dataset.ring);
    const sector = Number(cell.dataset.sector);
    const value = state.board[ring][sector];
    const pending = state.pendingPlacement?.ring === ring && state.pendingPlacement?.sector === sector;
    cell.classList.toggle('available', value === null && canPlace);
    cell.classList.toggle('pending', Boolean(pending));
    cell.classList.toggle('winner', winnerKeys.has(`${ring}:${sector}`));
    cell.classList.toggle('challenged', challengeKeys.has(`${ring}:${sector}`));
    cell.setAttribute('aria-disabled', String(!(value === null && canPlace)));
    cell.querySelectorAll('.stone, .stone-core, .stone-shadow').forEach((node) => node.remove());
    if (value !== null) {
      cell.append(createSvg('circle', { class: 'stone-shadow', cx: 0, cy: 0, r: 18 }));
      cell.append(createSvg('circle', { class: `stone color-${value}`, cx: 0, cy: 0, r: 18 }));
      cell.append(createSvg('circle', { class: 'stone-core', cx: -6, cy: -7, r: 5 }));
    }
  });

  board.querySelectorAll('.win-path, .challenge-path').forEach((node) => node.remove());
  if (state.challengePath.length > 1 && state.challengeColor !== null) {
    const challenge = createSvg('path', {
      class: `challenge-path color-${state.challengeColor}`,
      d: winPathData(state.challengePath)
    });
    board.insertBefore(challenge, board.querySelector('.center-spindle'));
  }

  if (state.winPath.length > 1 && state.winnerColor !== null) {
    const path = createSvg('path', {
      class: `win-path color-${state.winnerColor}`,
      d: winPathData(state.winPath)
    });
    board.insertBefore(path, board.querySelector('.center-spindle'));
  }
}

function winPathData(path) {
  const commands = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    const a = pointFor(current.ring, current.sector);
    const b = pointFor(next.ring, next.sector);
    if (current.ring !== next.ring) {
      commands.push(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
    } else {
      const clockwise = (next.sector - current.sector + SECTORS) % SECTORS === 1;
      commands.push(`M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${RING_RADII[current.ring]} ${RING_RADII[current.ring]} 0 0 ${clockwise ? 1 : 0} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
    }
  }
  return commands.join(' ');
}

export function animateBoardRing(board, ring, direction, duration) {
  const group = board.querySelector(`[data-ring-group="${ring}"]`);
  if (!group) return Promise.resolve(false);
  board.classList.add('rotating');
  group.style.transition = `transform ${duration}ms cubic-bezier(.2,.72,.18,1)`;
  requestAnimationFrame(() => { group.style.transform = `rotate(${direction * 45}deg)`; });
  return new Promise((resolve) => window.setTimeout(() => {
    group.style.transition = 'none';
    group.style.transform = 'rotate(0deg)';
    group.getBoundingClientRect();
    board.classList.remove('rotating');
    resolve(true);
  }, duration + 30));
}

export function svgCoordinates(board, event) {
  const rect = board.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * 600 / rect.width,
    y: (event.clientY - rect.top) * 600 / rect.height
  };
}

export function nearestRing(point) {
  const radius = Math.hypot(point.x - 300, point.y - 300);
  const distances = RING_RADII.map((ringRadius) => Math.abs(ringRadius - radius));
  const ring = distances.indexOf(Math.min(...distances));
  return distances[ring] > 34 ? null : ring;
}

export function angleFromCenter(point) {
  return Math.atan2(point.y - 300, point.x - 300);
}

export function normalizedAngleDifference(from, to) {
  let difference = to - from;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}
