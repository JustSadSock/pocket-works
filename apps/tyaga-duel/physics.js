// ТЯГА: deterministic, fixed-step gravity duel. World width 360, adaptive height.
export const STEP = 1 / 120;
export const WIN_SCORE = 5;
export const HOLD_RAMP = 1.4;
export const ARENAS = [
  { id: "open", name: "ПУСТОТА", detail: "Чистая дуэль перегрузок" },
  { id: "pins", name: "РИКОШЕТ", detail: "Отражатели и ускорители" },
  { id: "swing", name: "МАЯТНИК", detail: "Движущаяся преграда и ускорители" }
];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const R = 12, GOAL = 26;
const BASE_GRAVITY = 340, PEAK_GRAVITY = 930, MAX_SPEED = 1420;
const MAX_COMBO = 4;

export function createGame(arena = "open", height = 720) {
  const h = Math.max(430, height);
  const g = {
    w: 360, h, arena: ARENAS.some(a => a.id === arena) ? arena : "open",
    score: [0, 0], rounds: 0, phase: "between", owner: -1,
    gravity: 0, hold: 0, charge: 0, lastCounter: 0,
    elapsed: 0, lastImpact: -10, lastCollision: "", lastCollisionAt: -10,
    combo: 0, boostInside: [false, false], boostFlash: [0, 0],
    ball: { x: 180, y: h / 2, vx: 0, vy: 0, r: R }
  };
  serve(g);
  return g;
}
export function resizeGame(g, height) {
  const old = g.h;
  g.h = Math.max(430, height);
  g.ball.y *= g.h / old;
  g.ball.vy *= g.h / old;
  g.boostInside.fill(false);
}
export function serve(g) {
  g.rounds += 1;
  const direction = g.rounds % 2 ? 1 : -1;
  g.ball = { x: 180, y: g.h * .5, vx: direction * 110, vy: 0, r: R };
  g.gravity = 0; g.owner = -1; g.hold = 0; g.charge = 0;
  g.lastCounter = 0; g.elapsed = 0; g.lastImpact = -10;
  g.lastCollision = ""; g.lastCollisionAt = -10; g.combo = 0;
  g.boostInside = [false, false]; g.boostFlash = [0, 0];
  g.phase = "play";
}
export function claim(g, side) {
  if (g.phase !== "play" || (side !== 0 && side !== 1) || g.owner === side) return false;
  const outgoing = g.owner < 0 ? 0 : g.charge;
  const direction = side === 0 ? -1 : 1;
  // Longer possession creates faster pull AND a more violent reversal.
  const counter = 115 + 455 * outgoing;
  g.owner = side;
  g.hold = 0; g.charge = 0;
  g.gravity = BASE_GRAVITY * direction;
  g.lastCounter = counter;
  g.ball.vy = clamp(g.ball.vy + direction * counter, -MAX_SPEED, MAX_SPEED);
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
    { x: 180 + 94 * Math.cos(g.elapsed * 1.36), y: h * .50 + 18 * Math.sin(g.elapsed * .7), r: 26, vx: -127.84 * Math.sin(g.elapsed * 1.36), vy: 12.6 * Math.cos(g.elapsed * .7) },
    { x: 92, y: h * .28, r: 14, vx: 0, vy: 0 },
    { x: 268, y: h * .72, r: 14, vx: 0, vy: 0 }
  ];
  return [];
}
// Paired kinetic gates. Entry with vertical momentum redirects and amplifies velocity;
// returning through the same gate after a rebound can create another launch.
export function getBoosters(g) {
  const h = g.h;
  if (g.arena === "pins") return [
    { x: 172, y: h * .58, w: 115, h: 17, bias: 1 },
    { x: 105, y: h * .42, w: 115, h: 17, bias: -1 }
  ];
  if (g.arena === "swing") return [
    { x: 105, y: h * .40, w: 115, h: 17, bias: -1 },
    { x: 171, y: h * .60, w: 115, h: 17, bias: 1 }
  ];
  return [];
}
function chain(g, kind) {
  const alternating = g.lastCollision && g.lastCollision !== kind
    && g.elapsed - g.lastCollisionAt < 1.45;
  g.combo = alternating ? Math.min(MAX_COMBO, Math.max(1, g.combo) + 1) : 1;
  g.lastCollision = kind;
  g.lastCollisionAt = g.elapsed;
  return g.combo;
}
export function stepGame(g, dt = STEP) {
  if (g.phase !== "play") return null;
  dt = clamp(dt, 0, STEP);
  g.elapsed += dt;
  for (let i = 0; i < g.boostFlash.length; i++) g.boostFlash[i] = Math.max(0, g.boostFlash[i] - dt * 2.7);
  if (g.owner !== -1) {
    g.hold = Math.min(HOLD_RAMP, g.hold + dt);
    g.charge = g.hold / HOLD_RAMP;
    g.gravity = (g.owner === 0 ? -1 : 1) *
      (BASE_GRAVITY + (PEAK_GRAVITY - BASE_GRAVITY) * Math.pow(g.charge, 1.3));
  }
  const b = g.ball;
  b.vy = clamp(b.vy + g.gravity * dt, -MAX_SPEED, MAX_SPEED);
  b.vx *= 1 - .18 * dt;
  b.vy *= 1 - .055 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  let impact = 0, reflected = false;
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
    const min = R + p.r;
    const distSq = dx * dx + dy * dy;
    if (distSq >= min * min) continue;
    if (distSq < .000001) { dx = .001; dy = g.rounds % 2 ? -1 : 1; }
    const distance = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / distance, ny = dy / distance;
    b.x += nx * (min - distance + .04);
    b.y += ny * (min - distance + .04);
    const rvx = b.vx - p.vx, rvy = b.vy - p.vy;
    const approach = rvx * nx + rvy * ny;
    if (approach < -12) {
      const impulse = -1.88 * approach;
      b.vx = clamp(b.vx + nx * impulse + ny * 7, -MAX_SPEED, MAX_SPEED);
      b.vy = clamp(b.vy + ny * impulse - nx * 7, -MAX_SPEED, MAX_SPEED);
      impact = Math.max(impact, -approach);
      reflected = true;
    }
  }
  let combo = 0;
  if (reflected && g.elapsed - g.lastImpact > .085) combo = chain(g, "reflect");
  const boosters = getBoosters(g);
  let launched = -1;
  for (let i = 0; i < boosters.length; i++) {
    const p = boosters[i];
    const inside = b.x + R > p.x && b.x - R < p.x + p.w &&
      b.y + R > p.y - p.h / 2 && b.y - R < p.y + p.h / 2;
    if (inside && !g.boostInside[i] && Math.abs(b.vy) > 135) {
      const direction = Math.sign(b.vy);
      const energy = Math.min(1, Math.abs(b.vy) / 900);
      b.vx = clamp(b.vx + p.bias * (115 + energy * 165), -MAX_SPEED, MAX_SPEED);
      b.vy = clamp(b.vy * 1.22 + direction * (95 + energy * 90), -MAX_SPEED, MAX_SPEED);
      combo = chain(g, "boost");
      if (combo > 1) {
        b.vx = clamp(b.vx * 1.07, -MAX_SPEED, MAX_SPEED);
        b.vy = clamp(b.vy * 1.07, -MAX_SPEED, MAX_SPEED);
      }
      g.boostFlash[i] = 1;
      launched = i;
    }
    g.boostInside[i] = inside;
  }
  if (b.y - R <= GOAL || b.y + R >= g.h - GOAL) {
    const scorer = b.y < g.h / 2 ? 0 : 1;
    g.score[scorer] += 1;
    g.phase = g.score[scorer] >= WIN_SCORE ? "finished" : "between";
    return { kind: "goal", scorer, finished: g.phase === "finished" };
  }
  if (launched !== -1) return { kind: "boost", strength: Math.min(1,Math.abs(b.vy) / 1000), x: b.x, y: b.y, combo, gate: launched };
  if (impact > 65 && g.elapsed - g.lastImpact > .085) {
    g.lastImpact = g.elapsed;
    return { kind: "impact", strength: Math.min(1, impact / 540), x: b.x, y: b.y, combo: reflected ? combo : 0 };
  }
  return null;
}
