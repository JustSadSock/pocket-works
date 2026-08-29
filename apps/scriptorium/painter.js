import { configureSubjects, drawFigure, drawObject, itemBounds } from './subjects.js';
let canvas;
let ctx;
let state;
let selectedId;
let FORMATS;
let BACKGROUNDS;
let FRAMES;
let PALETTES;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export function renderScene(options) {
  ({ canvas, ctx, state, selectedId, FORMATS, BACKGROUNDS, FRAMES, PALETTES } = options);
  configureSubjects({ ctx, state, PALETTES });
  render(options.includeSelection !== false);
}

function palette() { return PALETTES[state.palette] || PALETTES.york; }
function ink() { return palette().ink; }

function configureCanvas() {
  const format = FORMATS[state.format];
  if (canvas.width !== format.width || canvas.height !== format.height) {
    canvas.width = format.width;
    canvas.height = format.height;
  }
}

function render(includeSelection = true) {
  configureCanvas();
  const w = canvas.width;
  const h = canvas.height;
  const bg = BACKGROUNDS[state.background];
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg.fill;
  ctx.fillRect(0, 0, w, h);
  drawWash(bg, w, h);
  if (state.texture) drawTexture(w, h);
  drawOrnament(w, h);
  for (const item of state.items) drawItem(item, includeSelection && item.id === selectedId);
  drawInscription(w, h);
  drawFrame(w, h);
  ctx.restore();
}

function drawWash(bg, w, h) {
  const gradient = ctx.createRadialGradient(w * .48, h * .4, Math.min(w, h) * .08, w * .5, h * .5, Math.max(w, h) * .72);
  gradient.addColorStop(0, hexToRgba(bg.wash, .28));
  gradient.addColorStop(1, 'rgba(55,31,15,.08)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function drawTexture(w, h) {
  ctx.save();
  for (let i = 0; i < 170; i += 1) {
    const x = ((i * 137.7 + 43) % 1000) / 1000 * w;
    const y = ((i * 233.3 + 91) % 1000) / 1000 * h;
    const r = 1 + (i % 5) * .7;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(69,42,20,.08)' : 'rgba(255,239,178,.08)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrame(w, h) {
  if (state.frame === 'none') return;
  const m = Math.min(w, h) * .035;
  ctx.save();
  ctx.strokeStyle = ink();
  ctx.lineWidth = state.lineWeight;
  if (state.frame === 'plain') {
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  } else if (state.frame === 'double') {
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    ctx.lineWidth = Math.max(2, state.lineWeight * .55);
    ctx.strokeRect(m + 12, m + 12, w - (m + 12) * 2, h - (m + 12) * 2);
  } else if (state.frame === 'blocks') {
    const edge = m * .78;
    ctx.lineWidth = Math.max(2, state.lineWeight * .65);
    ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    for (let x = m; x < w - m; x += edge) {
      ctx.strokeRect(x, m, Math.min(edge, w - m - x), edge * .55);
      ctx.strokeRect(x, h - m - edge * .55, Math.min(edge, w - m - x), edge * .55);
    }
    for (let y = m + edge * .55; y < h - m - edge * .55; y += edge) {
      ctx.strokeRect(m, y, edge * .55, Math.min(edge, h - m - edge * .55 - y));
      ctx.strokeRect(w - m - edge * .55, y, edge * .55, Math.min(edge, h - m - edge * .55 - y));
    }
  } else if (state.frame === 'ribbon') {
    ctx.lineWidth = Math.max(2, state.lineWeight * .55);
    const step = 34;
    ctx.beginPath();
    for (let x = m; x < w - m; x += step) {
      ctx.moveTo(x, m); ctx.lineTo(Math.min(x + step / 2, w - m), m + 12); ctx.lineTo(Math.min(x + step, w - m), m);
      ctx.moveTo(x, h - m); ctx.lineTo(Math.min(x + step / 2, w - m), h - m - 12); ctx.lineTo(Math.min(x + step, w - m), h - m);
    }
    for (let y = m; y < h - m; y += step) {
      ctx.moveTo(m, y); ctx.lineTo(m + 12, Math.min(y + step / 2, h - m)); ctx.lineTo(m, Math.min(y + step, h - m));
      ctx.moveTo(w - m, y); ctx.lineTo(w - m - 12, Math.min(y + step / 2, h - m)); ctx.lineTo(w - m, Math.min(y + step, h - m));
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawOrnament(w, h) {
  if (state.ornament === 'none') return;
  const p = palette();
  ctx.save();
  ctx.strokeStyle = p.colors[2];
  ctx.fillStyle = p.colors[2];
  ctx.lineWidth = Math.max(3, state.lineWeight * .7);
  const m = Math.min(w, h) * .07;
  if (state.ornament === 'stars') {
    for (let i = 0; i < 9; i += 1) {
      const x = m + (w - m * 2) * ((i * .137 + .07) % 1);
      const y = m + (h - m * 2) * ((i * .281 + .13) % .46);
      starPath(x, y, 9 + (i % 3) * 3, 5);
      ctx.fill();
    }
  } else if (state.ornament === 'vine') {
    const x = m + 3;
    ctx.beginPath();
    ctx.moveTo(x, h * .18);
    ctx.bezierCurveTo(x + 42, h * .33, x - 28, h * .52, x + 26, h * .72);
    ctx.stroke();
    for (let i = 0; i < 5; i += 1) {
      const yy = h * (.24 + i * .105);
      ctx.beginPath();
      ctx.ellipse(x + (i % 2 ? 20 : -3), yy, 15, 7, i % 2 ? -.6 : .6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (state.ornament === 'knots') {
    ctx.lineWidth = Math.max(2, state.lineWeight * .55);
    for (const yy of [m, h - m]) {
      for (let x = m; x < w - m - 30; x += 52) {
        ctx.beginPath();
        ctx.moveTo(x, yy); ctx.bezierCurveTo(x + 12, yy - 14, x + 24, yy + 14, x + 36, yy); ctx.bezierCurveTo(x + 24, yy - 14, x + 12, yy + 14, x, yy);
        ctx.stroke();
      }
    }
  } else if (state.ornament === 'corners') {
    const s = 74;
    for (const [x, y, rx, ry] of [[m,m,1,1],[w-m,m,-1,1],[m,h-m,1,-1],[w-m,h-m,-1,-1]]) {
      ctx.save(); ctx.translate(x,y); ctx.scale(rx, ry);
      ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(0, 0); ctx.lineTo(s, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(22, 22, 15, 0, Math.PI * 1.5); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawInscription(w, h) {
  const text = state.inscription.trim();
  if (!text) return;
  const size = clamp(Math.min(w, h) * .035, 25, 44);
  ctx.save();
  ctx.fillStyle = ink();
  ctx.font = `700 ${size}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '2px';
  const y = state.inscriptionPosition === 'top' ? Math.min(w, h) * .09 : h - Math.min(w, h) * .085;
  const max = w * .72;
  let renderText = text.toUpperCase();
  while (ctx.measureText(renderText).width > max && renderText.length > 5) renderText = `${renderText.slice(0, -2)}…`;
  ctx.fillText(renderText, w / 2, y);
  ctx.restore();
}

function drawItem(item, selected) {
  const x = item.x * canvas.width;
  const y = item.y * canvas.height;
  ctx.save();
  ctx.translate(x, y);
  if (selected) drawSelection(item);
  ctx.scale(item.flip ? -item.scale : item.scale, item.scale);
  if (item.type === 'figure') drawFigure(item);
  else drawObject(item);
  ctx.restore();
}

function drawSelection(item) {
  const b = itemBounds(item);
  ctx.save();
  ctx.strokeStyle = '#fff1b8';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(b.x * item.scale, b.y * item.scale, b.w * item.scale, b.h * item.scale);
  ctx.setLineDash([]);
  ctx.fillStyle = '#382318';
  ctx.beginPath();
  ctx.arc((b.x + b.w) * item.scale, b.y * item.scale, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function starPath(cx, cy, outer, points, innerRatio = .45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI / points;
    const r = i % 2 === 0 ? outer : outer * innerRatio;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
}
