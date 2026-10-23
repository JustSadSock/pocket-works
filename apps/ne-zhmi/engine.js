// NE ZHMI! — isolated, deterministic simulation. No DOM, networking or rendering.
export const WORLD = Object.freeze({ width: 18, height: 8, gravity: 19, speed: 3.4 });
export const ROBOT = Object.freeze({ halfWidth: 0.33, halfHeight: 0.46, jump: 9.15 });
export const LEVEL = Object.freeze({
  name: 'Испытательный цех', goal: 16.5, checkpoint: 10.25,
  platforms: [
    { x: 0, y: 6.5, w: 4.72, h: 1.5, id: 'start' },
    { x: 5.48, y: 5.45, w: 3.15, h: 2.55, id: 'step' },
    { x: 9.4, y: 6.25, w: 3.18, h: 1.75, id: 'dock' },
    { x: 13.35, y: 6.5, w: 4.65, h: 1.5, id: 'finish' }
  ]
});
export const FIXED_DT = 1 / 120;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function createGame() {
  return {
    x: 1.15, y: 6.5 - ROBOT.halfHeight, vx: 0, vy: 0, dir: 1,
    ground: true, coyote: .1, buffer: 0, cooldown: 0, wallCooldown: 0, t: 0,
    rotation: 0, checkpoint: 1.15, respawns: 0, jumps: 0, reverses: 0,
    finished: false, wonAt: null, impacts: 0, lastEvent: 'ready'
  };
}
function bounds(state) {
  return { left: state.x - ROBOT.halfWidth, right: state.x + ROBOT.halfWidth, top: state.y - ROBOT.halfHeight, bottom: state.y + ROBOT.halfHeight };
}
const overlap = (a,b) => a.left < b.x + b.w - 1e-5 && a.right > b.x + 1e-5;
export function commandGame(state, action) {
  if (state.finished) return 'finished';
  if (action === 'reverse') {
    if (state.cooldown > .01) return 'cooldown';
    state.dir *= -1; state.cooldown = .24; state.reverses++;
    state.lastEvent = 'reverse';
    return 'reverse';
  }
  if (action === 'jump') {
    // Buffered jump: input a fraction before landing is not discarded.
    state.buffer = .13;
    state.lastEvent = 'jump-request';
    return 'jump-request';
  }
  return 'unknown';
}
export function stepGame(state, dt = FIXED_DT) {
  if (state.finished) return [];
  const events = [];
  const delta = clamp(Number.isFinite(dt) ? dt : 0, 0, 1 / 40);
  if (!delta) return events;
  state.t += delta;
  state.cooldown = Math.max(0, state.cooldown - delta);
  state.wallCooldown = Math.max(0, state.wallCooldown - delta);
  state.buffer = Math.max(0, state.buffer - delta);
  if (state.ground) state.coyote = .10; else state.coyote = Math.max(0, state.coyote - delta);
  if (state.buffer > 0 && state.coyote > 0) {
    state.vy = -ROBOT.jump;
    state.ground = false; state.coyote = 0; state.buffer = 0; state.jumps++;
    events.push('jump'); state.lastEvent = 'jump';
  }
  const desired = WORLD.speed * state.dir;
  const acceleration = state.ground ? 23 : 9.5;
  state.vx += clamp(desired - state.vx, -acceleration * delta, acceleration * delta);
  const previousX = state.x;
  state.x = clamp(state.x + state.vx * delta, ROBOT.halfWidth, WORLD.width - ROBOT.halfWidth);
  let b = bounds(state);
  for (const p of LEVEL.platforms) {
    if (b.bottom > p.y + .025 && b.top < p.y + p.h - .02 && overlap(b,p)) {
      if (state.vx > 0 && previousX + ROBOT.halfWidth <= p.x + .09) {
        state.x = p.x - ROBOT.halfWidth; state.vx = 0;
        if (state.wallCooldown <= 0) { events.push('wall'); state.wallCooldown = .25; }
      } else if (state.vx < 0 && previousX - ROBOT.halfWidth >= p.x + p.w - .09) {
        state.x = p.x + p.w + ROBOT.halfWidth; state.vx = 0;
        if (state.wallCooldown <= 0) { events.push('wall'); state.wallCooldown = .25; }
      }
    }
  }
  state.vy += WORLD.gravity * delta;
  const oldY = state.y;
  state.y += state.vy * delta;
  state.ground = false;
  b = bounds(state);
  for (const p of LEVEL.platforms) {
    if (!overlap(b,p)) continue;
    const oldBottom = oldY + ROBOT.halfHeight;
    const oldTop = oldY - ROBOT.halfHeight;
    if (state.vy >= 0 && oldBottom <= p.y + .055 && b.bottom >= p.y) {
      state.y = p.y - ROBOT.halfHeight;
      if (state.vy > 4.5) { state.impacts++; events.push('land'); }
      state.vy = 0; state.ground = true;
    } else if (state.vy < 0 && oldTop >= p.y + p.h - .03 && b.top <= p.y + p.h) {
      state.y = p.y + p.h + ROBOT.halfHeight; state.vy = .5;
      events.push('ceiling');
    }
    b = bounds(state);
  }
  if (state.x > LEVEL.checkpoint && state.ground && state.checkpoint < LEVEL.checkpoint) {
    state.checkpoint = LEVEL.checkpoint; events.push('checkpoint'); state.lastEvent = 'checkpoint';
  }
  if (state.y > WORLD.height + .8) {
    const savedX = state.checkpoint;
    Object.assign(state, { x: savedX, y: savedX > 9 ? 6.25 - ROBOT.halfHeight : 6.5 - ROBOT.halfHeight,
      vx: 0, vy: 0, dir: 1, ground: true, coyote: .1, buffer: 0, cooldown: 0, wallCooldown: 0, rotation: 0 });
    state.respawns++;
    state.lastEvent = 'respawn'; events.push('respawn');
  }
  if (state.x >= LEVEL.goal && state.ground) {
    state.finished = true; state.wonAt = state.t; state.vx = 0;
    events.push('finish'); state.lastEvent = 'finish';
  }
  const targetRot = state.ground ? -state.vx * .025 : clamp(state.vx * state.vy * .005, -.2, .2);
  state.rotation += (targetRot - state.rotation) * Math.min(1, delta * 9);
  return events;
}
export function progressGame(state) { return clamp((state.x - 1.15) / (LEVEL.goal - 1.15), 0, 1); }
