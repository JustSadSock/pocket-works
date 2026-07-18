import { PLAYER, DIRECTIONS, boardCells, coordKey, parseCoordKey } from './engine.js';

const PALETTE = {
  paper: '#e7dece',
  ink: '#252b2c',
  grid: 'rgba(61,55,45,.16)',
  bronze: '#9d7a43',
  azure: '#315f7a',
  azureLight: '#7ba8ba',
  ochre: '#b66b31',
  ochreLight: '#dda36d'
};

function hex(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export class BoardView {
  constructor(canvas, frame, { onCell, onMove } = {}) {
    this.canvas = canvas;
    this.frame = frame;
    this.onCell = onCell;
    this.onMove = onMove;
    this.geometry = null;
    this.handles = [];
    this.state = null;
    this.canvas.addEventListener('pointerup', (event) => this.#pointer(event));
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
  }

  resize() {
    const rect = this.frame.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    const radius = this.state?.game?.radius || 3;
    const size = Math.min(
      rect.width / (Math.sqrt(3) * (radius * 2 + 1.65)),
      rect.height / (1.5 * (radius * 2 + 1.55))
    );
    this.geometry = {
      width: rect.width,
      height: rect.height,
      dpr,
      size,
      cx: rect.width / 2,
      cy: rect.height / 2 - Math.min(5, rect.height * .012)
    };
    this.render();
  }

  pixel(cell) {
    const { size, cx, cy } = this.geometry;
    return {
      x: cx + size * Math.sqrt(3) * (cell[0] + cell[1] / 2),
      y: cy + size * 1.5 * cell[1]
    };
  }

  render(state = this.state) {
    if (state) this.state = state;
    if (!this.state?.game || !this.geometry) return;
    const { game, selected = [], deployMode = false, interactive = false } = this.state;
    const ctx = this.canvas.getContext('2d');
    const { dpr, width, height, size, cx, cy } = this.geometry;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    this.handles = [];

    const outer = size * (game.radius * Math.sqrt(3) + .76);
    hex(ctx, cx, cy, outer);
    const field = ctx.createRadialGradient(cx, cy, size, cx, cy, outer);
    field.addColorStop(0, '#ebe2d3');
    field.addColorStop(1, '#d2c4ae');
    ctx.fillStyle = field;
    ctx.fill();
    ctx.strokeStyle = 'rgba(61,55,45,.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const deploy = deployMode ? new Set(game.deploymentCells(game.turn).map(coordKey)) : new Set();
    for (const cell of boardCells(game.radius)) {
      const p = this.pixel(cell);
      const homeAzure = cell[1] === -game.radius;
      const homeOchre = cell[1] === game.radius;
      hex(ctx, p.x, p.y, size * .45);
      ctx.fillStyle = homeAzure
        ? 'rgba(49,95,122,.085)'
        : homeOchre
          ? 'rgba(182,107,49,.09)'
          : 'rgba(239,232,218,.42)';
      ctx.fill();
      ctx.strokeStyle = deploy.has(coordKey(cell)) ? 'rgba(157,122,67,.95)' : PALETTE.grid;
      ctx.lineWidth = deploy.has(coordKey(cell)) ? 3 : 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * .075, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(65,58,48,.15)';
      ctx.fill();
    }

    const center = this.pixel([0, 0]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, size * .58, 0, Math.PI * 2);
    ctx.strokeStyle = PALETTE.bronze;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    if (game.centerClaim) {
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(performance.now() / 1000);
      ctx.strokeStyle = game.centerClaim.player === PLAYER.AZURE ? PALETTE.azure : PALETTE.ochre;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = 0; i < game.centerReplies; i += 1) {
        const span = Math.PI * 2 / game.centerReplies;
        const start = -Math.PI / 2 + i * span;
        ctx.beginPath();
        ctx.arc(0, 0, size * .70, start, start + span * (game.centerClaim.replies > i ? .77 : .28));
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const [key, player] of Object.entries(game.board)) {
      this.#piece(ctx, parseCoordKey(key), player, selected.includes(key));
    }

    if (interactive && !deployMode && selected.length) {
      const moves = game.legalMovesForSelection(selected.map(parseCoordKey));
      const points = selected.map((key) => this.pixel(parseCoordKey(key)));
      const centroid = points.reduce(
        (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
        { x: 0, y: 0 }
      );
      const zero = this.pixel([0, 0]);
      for (const move of moves) {
        const step = this.pixel(DIRECTIONS[move.direction]);
        const dx = step.x - zero.x;
        const dy = step.y - zero.y;
        const length = Math.hypot(dx, dy) || 1;
        const x = centroid.x + dx / length * size * (selected.length > 1 ? .92 : .78);
        const y = centroid.y + dy / length * size * (selected.length > 1 ? .92 : .78);
        const r = Math.max(11, size * .23);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = move.kind === 'push' ? '#8c5b2f' : PALETTE.ink;
        ctx.fill();
        ctx.strokeStyle = '#e6d7bb';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(r * .37, 0);
        ctx.lineTo(-r * .18, -r * .30);
        ctx.lineTo(-r * .04, 0);
        ctx.lineTo(-r * .18, r * .30);
        ctx.closePath();
        ctx.fillStyle = '#efe6d5';
        ctx.fill();
        ctx.restore();
        this.handles.push({ x, y, r, move });
      }
    }
  }

  #piece(ctx, cell, player, selected) {
    const p = this.pixel(cell);
    const r = this.geometry.size * .37;
    const key = coordKey(cell);
    const crown = this.state.game.crown[player] === key;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor = 'rgba(42,33,24,.30)';
    ctx.shadowBlur = r * .38;
    ctx.shadowOffsetY = r * .17;
    const gradient = ctx.createRadialGradient(-r * .28, -r * .32, r * .08, 0, 0, r);
    if (player === PLAYER.AZURE) {
      gradient.addColorStop(0, PALETTE.azureLight);
      gradient.addColorStop(.56, PALETTE.azure);
      gradient.addColorStop(1, '#173b50');
    } else {
      gradient.addColorStop(0, PALETTE.ochreLight);
      gradient.addColorStop(.56, PALETTE.ochre);
      gradient.addColorStop(1, '#6d341b');
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = selected ? '#d7b16d' : 'rgba(24,28,29,.55)';
    ctx.lineWidth = selected ? Math.max(3, r * .12) : 1.5;
    ctx.stroke();
    if (this.state.game.lastMove?.destinations?.includes(key)) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(157,122,67,.78)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (crown) {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(-r * .17, -r * .17, r * .34, r * .34);
      ctx.strokeStyle = 'rgba(30,33,32,.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-r * .17, -r * .17, r * .34, r * .34);
    }
    ctx.restore();
  }

  #pointer(event) {
    if (!this.state?.interactive || !this.geometry) return;
    const rect = this.canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const handle = this.handles.find((item) =>
      Math.hypot(point.x - item.x, point.y - item.y) <= item.r * 1.35
    );
    if (handle) {
      this.onMove?.(handle.move);
      return;
    }
    let best = null;
    let distance = Infinity;
    for (const cell of boardCells(this.state.game.radius)) {
      const p = this.pixel(cell);
      const d = Math.hypot(point.x - p.x, point.y - p.y);
      if (d < distance) {
        best = cell;
        distance = d;
      }
    }
    if (best && distance <= this.geometry.size * .53) this.onCell?.(best);
  }
}
