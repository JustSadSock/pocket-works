// NE ZHMI! — isolated, deterministic simulation. No DOM, networking or rendering.
import {deviceRect} from './course.js';
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
export function createGame(level = LEVEL) {
  return {
    level,
    x: level.start ?? 1.15, y: 6.5 - ROBOT.halfHeight, vx: 0, vy: 0, dir: 1,
    ground: true, coyote: .1, buffer: 0, cooldown: 0, wallCooldown: 0, t: 0,
    rotation: 0, checkpoint: level.start ?? 1.15, respawns: 0, jumps: 0, reverses: 0, springCooldown:0, hazardCooldown:0,
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
  const level = state.level || LEVEL;
  const eventsOnce=(name)=>{if(!events.includes(name))events.push(name)};
  const delta = clamp(Number.isFinite(dt) ? dt : 0, 0, 1 / 40);
  if (!delta) return events;
  state.t += delta;
  state.cooldown = Math.max(0, state.cooldown - delta);
  state.wallCooldown = Math.max(0, state.wallCooldown - delta);
  state.springCooldown = Math.max(0, (state.springCooldown||0)-delta);
  state.hazardCooldown = Math.max(0, (state.hazardCooldown||0)-delta);
  state.buffer = Math.max(0, state.buffer - delta);
  if (state.ground) state.coyote = .10; else state.coyote = Math.max(0, state.coyote - delta);
  if (state.buffer > 0 && state.coyote > 0) {
    state.vy = -ROBOT.jump;
    state.ground = false; state.coyote = 0; state.buffer = 0; state.jumps++;
    events.push('jump'); state.lastEvent = 'jump';
  }
  const groundSurface=level.platforms.find(p=>state.x>=p.x&&state.x<=p.x+p.w &&
    Math.abs(state.y+ROBOT.halfHeight-p.y)<.14);
  const belt=state.ground && groundSurface?.effect?.startsWith('belt-')
    ? (groundSurface.effect==='belt-right'?1.45:-1.35) : 0;
  const desired = WORLD.speed * state.dir + belt;
  const acceleration = state.ground ? 23 : 9.5;
  state.vx += clamp(desired - state.vx, -acceleration * delta, acceleration * delta);
  const previousX = state.x;
  // Air jets are continuous forces: the same inputs result in the same motion
  // on client and authoritative server, including on low refresh-rate devices.
  for(const device of level.devices||[]) {
    if(state.x+ROBOT.halfWidth<=device.x||state.x-ROBOT.halfWidth>=device.x+device.w)continue;
    if(device.type==='fan-side'&&state.y>4.25)state.vx-=6.4*delta;
    if(device.type==='fan-up'&&state.y>4.4)state.vy-=31*delta;
  }
  state.x = clamp(state.x + state.vx * delta, ROBOT.halfWidth, (level.width ?? WORLD.width) - ROBOT.halfWidth);
  let b = bounds(state);
  for (const p of level.platforms) {
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
      if(p.effect==='spring'&&state.springCooldown<=0){
        state.vy=-11.35;state.ground=false;state.coyote=0;
        state.springCooldown=.36;state.impacts++;eventsOnce('spring');
      }
    } else if (state.vy < 0 && oldTop >= p.y + p.h - .03 && b.top <= p.y + p.h) {
      state.y = p.y + p.h + ROBOT.halfHeight; state.vy = .5;
      events.push('ceiling');
    }
    b = bounds(state);
  }
  if (state.x > level.checkpoint && state.ground && state.checkpoint < level.checkpoint) {
    state.checkpoint = level.checkpoint; eventsOnce('checkpoint'); state.lastEvent = 'checkpoint';
  }
  // Timed machinery blocks and damages only when physically touching the robot.
  // A closed gate is a wall, whereas a lowered piston requires a safe retry.
  const playerBox=bounds(state);
  let hazardous=false;
  for(const device of level.devices||[]) {
    if(!['gate','press'].includes(device.type))continue;
    const r=deviceRect(device,state.t);
    if(!r?.active||playerBox.left>=r.x+r.w||playerBox.right<=r.x||
       playerBox.top>=r.y+r.h||playerBox.bottom<=r.y)continue;
    if(device.type==='press'){hazardous=true;break;}
    const oldLeft=previousX-ROBOT.halfWidth,oldRight=previousX+ROBOT.halfWidth;
    if(state.vx>=0&&oldRight<=r.x+.15){state.x=r.x-ROBOT.halfWidth;state.vx=0;eventsOnce('gate');}
    else if(state.vx<0&&oldLeft>=r.x+r.w-.15){state.x=r.x+r.w+ROBOT.halfWidth;state.vx=0;eventsOnce('gate');}
  }
  if (state.y > WORLD.height + .8 || hazardous) {
    const savedX = state.checkpoint;
    const spawnY=savedX===level.checkpoint?level.checkpointSpawn?.y:undefined;
    Object.assign(state, { x: savedX, y: spawnY ?? (savedX > 9 ? 6.25 - ROBOT.halfHeight : 6.5 - ROBOT.halfHeight),
      vx: 0, vy: 0, dir: 1, ground: true, coyote: .1, buffer: 0, cooldown: 0, wallCooldown: 0, rotation: 0 });
    state.respawns++;
    state.lastEvent = 'respawn'; eventsOnce(hazardous?'hazard':'respawn');
  }
  if (state.x >= level.goal && state.ground) {
    state.finished = true; state.wonAt = state.t; state.vx = 0;
    events.push('finish'); state.lastEvent = 'finish';
  }
  const targetRot = state.ground ? -state.vx * .025 : clamp(state.vx * state.vy * .005, -.2, .2);
  state.rotation += (targetRot - state.rotation) * Math.min(1, delta * 9);
  return events;
}
export function progressGame(state) {
  const level=state.level||LEVEL;
  return clamp((state.x - (level.start??1.15)) / (level.goal - (level.start??1.15)), 0, 1);
}
