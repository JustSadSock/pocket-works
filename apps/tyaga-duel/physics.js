// ТЯГА — deterministic local duel simulation. Coordinates: 360 x adaptive height.
export const STEP = 1 / 120;
export const WIN_SCORE = 5;
export const ARENAS = [
  { id: "open", name: "ПУСТОТА", detail: "Чистое поле" },
  { id: "pins", name: "РИКОШЕТ", detail: "Три отражателя" },
  { id: "swing", name: "МАЯТНИК", detail: "Подвижная преграда" }
];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const R = 12;
const GOAL = 26;
const GRAVITY = 1120;
const MAX_SPEED = 1000;

export function createGame(arena = "open", height = 720) {
  const g = {
    w: 360, h: Math.max(430, height), arena: ARENAS.some(a => a.id === arena) ? arena : "open",
    score: [0, 0], rounds: 0, phase: "between", owner: -1,
    gravity: 0, elapsed: 0, lastImpact: -10,
    ball: { x: 180, y: height / 2, vx: 0, vy: 0, r: R }
  };
  serve(g);
  return g;
}
export function resizeGame(g, height) {
  const old = g.h;
  g.h = Math.max(430, height);
  g.ball.y *= g.h / old;
  g.ball.vy *= g.h / old;
}
export function serve(g) {
  g.rounds += 1;
  const direction = g.rounds % 2 ? 1 : -1;
  g.ball = { x: 180, y: g.h * .5, vx: direction * 62, vy: 0, r: R };
  g.gravity = 0;
  g.owner = -1;
  g.elapsed = 0;
  g.phase = "play";
}
export function claim(g, side) {
  if (g.phase !== "play" || (side !== 0 && side !== 1) || g.owner === side) return false;
  const direction = side === 0 ? -1 : 1;
  g.owner = side;
  g.gravity = GRAVITY * direction;
  g.ball.vy = clamp(g.ball.vy + direction * 115, -MAX_SPEED, MAX_SPEED);
  return true;
}
export function getBumpers(g) {
  const h = g.h;
  if (g.arena === "pins") return [
    { x: 92, y: h * .34, r: 21, vx: 0, vy: 0 },
    { x: 268, y: h * .66, r: 21, vx: 0, vy: 0 },
    { x: 251, y: h * .50, r: 16, vx: 0, vy: 0 }
  ];
  if (g.arena === "swing") return [
    { x: 180 + 94 * Math.cos(g.elapsed * 1.36), y: h * .50, r: 26, vx: -127.84 * Math.sin(g.elapsed * 1.36), vy: 0 },
    { x: 92, y: h * .28, r: 14, vx: 0, vy: 0 },
    { x: 268, y: h * .72, r: 14, vx: 0, vy: 0 }
  ];
  return [];
}
export function stepGame(g, dt = STEP) {
  if (g.phase !== "play") return null;
  dt = clamp(dt, 0, STEP);
  g.elapsed += dt;
  const b = g.ball;
  b.vy = clamp(b.vy + g.gravity * dt, -MAX_SPEED, MAX_SPEED);
  b.vx *= 1 - .18 * dt;
  b.vy *= 1 - .055 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  let impact = 0;
  if (b.x - R < 16) {
    b.x = 16 + R;
    b.vx = Math.abs(b.vx) * .92 + 12;
    impact = Math.abs(b.vx);
  } else if (b.x + R > g.w - 16) {
    b.x = g.w - 16 - R;
    b.vx = -Math.abs(b.vx) * .92 - 12;
    impact = Math.abs(b.vx);
  }
  for (const p of getBumpers(g)) {
    let dx = b.x - p.x, dy = b.y - p.y;
    const distSq = dx * dx + dy * dy;
    const min = R + p.r;
    if (distSq >= min * min) continue;
    if (distSq < .000001) { dx = 0; dy = g.rounds % 2 ? -1 : 1; }
    const distance = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / distance, ny = dy / distance;
    b.x += nx * (min - distance + .04);
    b.y += ny * (min - distance + .04);
    const rvx = b.vx - p.vx, rvy = b.vy - p.vy;
    const approach = rvx * nx + rvy * ny;
    if (approach < 0) {
      const impulse = -1.84 * approach;
      b.vx = clamp(b.vx + nx * impulse + ny * 7, -MAX_SPEED, MAX_SPEED);
      b.vy = clamp(b.vy + ny * impulse - nx * 7, -MAX_SPEED, MAX_SPEED);
      impact = Math.max(impact, -approach);
    }
  }
  if (b.y - R <= GOAL || b.y + R >= g.h - GOAL) {
    const scorer = b.y < g.h / 2 ? 0 : 1;
    g.score[scorer] += 1;
    g.phase = g.score[scorer] >= WIN_SCORE ? "finished" : "between";
    return { kind: "goal", scorer, finished: g.phase === "finished" };
  }
  if (impact > 65 && g.elapsed - g.lastImpact > .07) {
    g.lastImpact = g.elapsed;
    return { kind: "impact", strength: Math.min(1, impact / 540), x: b.x, y: b.y };
  }
  return null;
}
