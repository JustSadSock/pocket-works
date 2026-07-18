import { PLAYER, DIRECTIONS, boardCells, coordKey, parseCoordKey } from './engine.js';

const PALETTE = {
  paper: '#eee5d5',
  paperDeep: '#cdbda2',
  ink: '#182225',
  grid: 'rgba(58,50,39,.20)',
  gridLight: 'rgba(255,255,255,.34)',
  bronze: '#a77e3c',
  bronzeLight: '#d2ad68',
  azure: '#2f627e',
  azureLight: '#84b0c1',
  azureDark: '#12384d',
  ochre: '#b9692e',
  ochreLight: '#e0a16a',
  ochreDark: '#672f18'
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

function line(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
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
      rect.width / (Math.sqrt(3) * (radius * 2 + 1.78)),
      rect.height / (1.5 * (radius * 2 + 1.68))
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

    this.#field(ctx, game, size, cx, cy);
    const deploy = deployMode ? new Set(game.deploymentCells(game.turn).map(coordKey)) : new Set();
    this.#cells(ctx, game, size, deploy);
    this.#center(ctx, game, size);
    this.#lastMove(ctx, game, size);
    this.#selectionBand(ctx, selected, size);

    for (const [key, player] of Object.entries(game.board)) {
      this.#piece(ctx, parseCoordKey(key), player, selected.includes(key));
    }

    if (interactive && !deployMode && selected.length) this.#moveHandles(ctx, game, selected, size);
  }

  #field(ctx, game, size, cx, cy) {
    const outer = size * (game.radius * Math.sqrt(3) + .82);
    ctx.save();
    ctx.shadowColor = 'rgba(43,33,22,.24)';
    ctx.shadowBlur = size * .36;
    ctx.shadowOffsetY = size * .14;
    hex(ctx, cx, cy, outer);
    const field = ctx.createRadialGradient(cx - size * .4, cy - size * .55, size * .5, cx, cy, outer);
    field.addColorStop(0, '#f0e8da');
    field.addColorStop(.55, '#ded2be');
    field.addColorStop(1, '#bfae91');
    ctx.fillStyle = field;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(54,46,35,.42)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    hex(ctx, cx, cy, outer - size * .14);
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 6);
    const axis = ctx.createLinearGradient(0, -outer, 0, outer);
    axis.addColorStop(0, 'rgba(167,126,60,0)');
    axis.addColorStop(.18, 'rgba(210,173,104,.44)');
    axis.addColorStop(.5, 'rgba(167,126,60,.78)');
    axis.addColorStop(.82, 'rgba(210,173,104,.44)');
    axis.addColorStop(1, 'rgba(167,126,60,0)');
    ctx.fillStyle = axis;
    ctx.fillRect(-size * .027, -outer * .88, size * .054, outer * 1.76);
    ctx.restore();
  }

  #cells(ctx, game, size, deploy) {
    for (const cell of boardCells(game.radius)) {
      const p = this.pixel(cell);
      const key = coordKey(cell);
      const homeAzure = cell[1] === -game.radius;
      const homeOchre = cell[1] === game.radius;
      const deployable = deploy.has(key);

      hex(ctx, p.x, p.y + size * .025, size * .47);
      ctx.fillStyle = 'rgba(70,55,35,.055)';
      ctx.fill();

      hex(ctx, p.x, p.y, size * .45);
      const tile = ctx.createLinearGradient(p.x, p.y - size * .45, p.x, p.y + size * .45);
      if (homeAzure) {
        tile.addColorStop(0, 'rgba(47,98,126,.18)');
        tile.addColorStop(1, 'rgba(47,98,126,.055)');
      } else if (homeOchre) {
        tile.addColorStop(0, 'rgba(185,105,46,.17)');
        tile.addColorStop(1, 'rgba(185,105,46,.05)');
      } else {
        tile.addColorStop(0, 'rgba(255,255,255,.25)');
        tile.addColorStop(1, 'rgba(239,230,214,.05)');
      }
      ctx.fillStyle = tile;
      ctx.fill();
      ctx.strokeStyle = deployable ? PALETTE.bronzeLight : PALETTE.grid;
      ctx.lineWidth = deployable ? 3 : 1;
      ctx.stroke();

      if (deployable) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.PI / 6);
        ctx.strokeStyle = 'rgba(103,77,31,.70)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-size * .16, size * .10);
        ctx.lineTo(0, -size * .12);
        ctx.lineTo(size * .16, size * .10);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * .062, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(58,49,37,.20)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x - size * .015, p.y - size * .02, size * .025, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE.gridLight;
        ctx.fill();
      }
    }
  }

  #center(ctx, game, size) {
    const center = this.pixel([0, 0]);
    const medallion = ctx.createRadialGradient(center.x - size * .18, center.y - size * .2, 1, center.x, center.y, size * .66);
    medallion.addColorStop(0, '#f4e6c7');
    medallion.addColorStop(.52, '#cda95f');
    medallion.addColorStop(1, '#8b672e');
    ctx.beginPath();
    ctx.arc(center.x, center.y, size * .59, 0, Math.PI * 2);
    ctx.fillStyle = medallion;
    ctx.fill();
    ctx.strokeStyle = 'rgba(79,57,23,.76)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center.x, center.y, size * .40, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,244,215,.62)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let index = 0; index < 4; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 2;
      ctx.beginPath();
      ctx.arc(center.x + Math.cos(angle) * size * .28, center.y + Math.sin(angle) * size * .28, size * .035, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(76,53,20,.62)';
      ctx.fill();
    }

    if (game.centerClaim) {
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.strokeStyle = game.centerClaim.player === PLAYER.AZURE ? PALETTE.azure : PALETTE.ochre;
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      for (let i = 0; i < game.centerReplies; i += 1) {
        const span = Math.PI * 2 / game.centerReplies;
        const start = -Math.PI / 2 + i * span + .08;
        const complete = game.centerClaim.replies > i;
        ctx.beginPath();
        ctx.arc(0, 0, size * .73, start, start + span * (complete ? .78 : .31));
        ctx.globalAlpha = complete ? 1 : .35;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  #lastMove(ctx, game, size) {
    const move = game.lastMove;
    if (!move?.destinations?.length) return;
    const points = move.destinations.map((key) => this.pixel(parseCoordKey(key)));
    ctx.save();
    ctx.strokeStyle = 'rgba(167,126,60,.52)';
    ctx.lineWidth = Math.max(2, size * .045);
    ctx.setLineDash([size * .12, size * .10]);
    line(ctx, points);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, size * .48, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(210,173,104,.60)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  #selectionBand(ctx, selected, size) {
    if (selected.length < 2) return;
    const points = selected.map((key) => this.pixel(parseCoordKey(key)));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(67,49,22,.30)';
    ctx.lineWidth = size * .24;
    line(ctx, points);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.bronzeLight;
    ctx.lineWidth = size * .10;
    line(ctx, points);
    ctx.stroke();
    ctx.restore();
  }

  #moveHandles(ctx, game, selected, size) {
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
      const distance = size * (selected.length > 1 ? 1.02 : .87);
      const x = centroid.x + dx / length * distance;
      const y = centroid.y + dy / length * distance;
      const r = Math.max(12, size * .25);
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.strokeStyle = move.kind === 'push' ? 'rgba(139,76,32,.58)' : 'rgba(24,34,37,.24)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(centroid.x + dx / length * size * .44, centroid.y + dy / length * size * .44);
      ctx.lineTo(x - dx / length * r * .85, y - dy / length * r * .85);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.translate(x, y);
      ctx.rotate(Math.PI / 6);
      hex(ctx, 0, 0, r);
      const token = ctx.createLinearGradient(0, -r, 0, r);
      if (move.kind === 'push') {
        token.addColorStop(0, '#a96731');
        token.addColorStop(1, '#71401f');
      } else {
        token.addColorStop(0, '#354448');
        token.addColorStop(1, '#162023');
      }
      ctx.fillStyle = token;
      ctx.shadowColor = 'rgba(31,26,19,.28)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#e8d8b8';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.rotate(angle - Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(r * .38, 0);
      ctx.lineTo(-r * .16, -r * .29);
      ctx.lineTo(-r * .02, 0);
      ctx.lineTo(-r * .16, r * .29);
      ctx.closePath();
      ctx.fillStyle = '#f2e8d7';
      ctx.fill();
      ctx.restore();
      this.handles.push({ x, y, r, move });
    }
  }

  #piece(ctx, cell, player, selected) {
    const p = this.pixel(cell);
    const r = this.geometry.size * .37;
    const key = coordKey(cell);
    const crown = this.state.game.crown[player] === key;
    ctx.save();
    ctx.translate(p.x, p.y);

    if (selected) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.34, 0, Math.PI * 2);
      const halo = ctx.createRadialGradient(0, 0, r * .78, 0, 0, r * 1.34);
      halo.addColorStop(0, 'rgba(210,173,104,.28)');
      halo.addColorStop(1, 'rgba(210,173,104,0)');
      ctx.fillStyle = halo;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.ellipse(0, r * .23, r * .82, r * .38, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(42,31,20,.23)';
    ctx.fill();

    ctx.shadowColor = 'rgba(40,31,22,.34)';
    ctx.shadowBlur = r * .38;
    ctx.shadowOffsetY = r * .14;
    const gradient = ctx.createRadialGradient(-r * .30, -r * .36, r * .07, 0, 0, r);
    if (player === PLAYER.AZURE) {
      gradient.addColorStop(0, PALETTE.azureLight);
      gradient.addColorStop(.42, '#427795');
      gradient.addColorStop(.72, PALETTE.azure);
      gradient.addColorStop(1, PALETTE.azureDark);
    } else {
      gradient.addColorStop(0, PALETTE.ochreLight);
      gradient.addColorStop(.42, '#c47b41');
      gradient.addColorStop(.72, PALETTE.ochre);
      gradient.addColorStop(1, PALETTE.ochreDark);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.beginPath();
    ctx.arc(0, 0, r * .86, Math.PI * 1.04, Math.PI * 1.83);
    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = Math.max(1.2, r * .07);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = selected ? PALETTE.bronzeLight : 'rgba(18,25,27,.62)';
    ctx.lineWidth = selected ? Math.max(3, r * .12) : 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * .75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,244,225,.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (crown) {
      ctx.rotate(Math.PI / 4);
      const mark = r * .21;
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(-mark, -mark, mark * 2, mark * 2);
      ctx.strokeStyle = 'rgba(26,31,31,.68)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-mark, -mark, mark * 2, mark * 2);
      ctx.beginPath();
      ctx.moveTo(-mark * .66, 0);
      ctx.lineTo(mark * .66, 0);
      ctx.moveTo(0, -mark * .66);
      ctx.lineTo(0, mark * .66);
      ctx.strokeStyle = 'rgba(167,126,60,.72)';
      ctx.stroke();
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
