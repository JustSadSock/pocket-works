// NE ZHMI! — isolated, deterministic simulation. No DOM, networking or rendering.
import {deviceRect} from './course.js';
import {HOLD_ACTIONS} from './abilities.js';
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
    held:{magnet:false,brake:false,float:false},
    energy:{magnet:1,brake:1,float:1},
    pushCooldown:0,pushes:0,magnetUses:0,brakeTime:0,floatTime:0,brakeCharge:0,brakeGuard:0,
    cargo:(level.devices||[]).filter(d=>d.type==='cargo').map(d=>({x:d.x,y:5.98,vx:0,id:d.x,latched:false,padX:d.padX})),
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
export function commandGame(state, action, pressed=true) {
  if(HOLD_ACTIONS.includes(action)){
    if(state.finished)return 'finished';
    if(pressed && state.energy[action]<.14)return 'empty';
    if(state.held[action]===!!pressed)return 'nochange';
    if(action==='brake'&&!pressed){
      // A deliberate stop charges a brief safe exit through the press.
      // An instant tap never grants protection.
      if(state.brakeCharge>=.22)state.brakeGuard=Math.max(state.brakeGuard,1.08);
      state.brakeCharge=0;
    }
    state.held[action]=!!pressed;
    if(action==='magnet'&&pressed)state.magnetUses++;
    state.lastEvent=action+(pressed?'-on':'-off');
    return state.lastEvent;
  }
  if (state.finished) return 'finished';
  if (action === 'reverse') {
    if (state.cooldown > .01) return 'cooldown';
    state.dir *= -1; state.cooldown = .24; state.reverses++;
    state.lastEvent = 'reverse';
    return 'reverse';
  }
  if(action==='push'){
    if(state.pushCooldown>0)return 'cooldown';
    state.pushCooldown=1.15;state.pushes++;
    state.vx+=state.dir*5.4;
    for(const box of state.cargo||[]){
      if(Math.abs(box.x-state.x)<2.8 && Math.abs(box.y-state.y)<3.3)
        box.vx+=state.dir*16;
    }
    state.lastEvent='push';return 'push';
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
  state.pushCooldown=Math.max(0,(state.pushCooldown||0)-delta);
  state.brakeGuard=Math.max(0,(state.brakeGuard||0)-delta);
  for(const action of HOLD_ACTIONS){
    const on=!!state.held[action]&&state.energy[action]>.005;
    state.energy[action]=clamp(state.energy[action]+(on?-(action==='float'?.25:.19):.29)*delta,0,1);
    if(on&&action==='brake'){
      state.brakeTime+=delta;
      state.brakeCharge=Math.min(.6,(state.brakeCharge||0)+delta);
    }
    if(on&&action==='float')state.floatTime+=delta;
    // Exhaustion must actually release the force. Otherwise a held key would
    // generate hundreds of one-frame force flickers while partially recharging.
    if(on&&state.energy[action]<=.005){
      state.energy[action]=0;state.held[action]=false;
      if(action==='brake')state.brakeCharge=0;
      eventsOnce('empty-'+action);
    }
  }
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
  const braking=state.held.brake&&state.energy.brake>.005;
  const desired = braking?0:WORLD.speed*state.dir+belt;
  const acceleration = braking?45:(state.ground?23:9.5);
  state.vx += clamp(desired - state.vx, -acceleration * delta, acceleration * delta);
  if(braking)state.vx*=Math.max(0,1-10*delta);
  if(state.held.magnet&&state.energy.magnet>.005)for(const device of level.devices||[]){
    // Magnetic lift only acts under the physical rail; the robot descends
    // before the next cargo or timed machinery can be skipped.
    if(device.type!=='mag-rail'||state.x<device.x-.9||state.x>device.x+device.w+.45)continue;
    if(state.y>3.5 && state.y<7)state.vy-=28*delta;
  }
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
  for(const box of state.cargo||[]){
    const distance=state.x-box.x;
    if(state.held.magnet&&state.energy.magnet>.005&&Math.abs(distance)<3){
      box.vx+=Math.sign(distance)*12*delta;
    }
    box.vx*=Math.max(0,1-1.3*delta);
    box.x=clamp(box.x+box.vx*delta,.4,(level.width||18)-.4);
    if(!box.latched&&Math.abs(box.x-box.padX)<.4){box.latched=true;box.vx=0;eventsOnce('cargo');}
    if(!box.latched&&Math.abs(box.x-state.x)<.45){
      // Resolve against the approach side. Previously a robot travelling
      // left from the RIGHT teleported straight through to the other side.
      const cameFromLeft=previousX<=box.x;
      if(cameFromLeft&&state.vx>0){
        state.x=Math.min(state.x,box.x-.42);state.vx=Math.min(state.vx,0);
      }else if(!cameFromLeft&&state.vx<0){
        state.x=Math.max(state.x,box.x+.42);state.vx=Math.max(state.vx,0);
      }
    }
  }
  const floating=state.held.float&&state.energy.float>.005;
  state.vy += (floating?WORLD.gravity*.29:WORLD.gravity)*delta;
  if(floating)state.vy=Math.min(state.vy,2.9);
  const oldY = state.y;
  state.y += state.vy * delta;
  state.ground = false;
  b = bounds(state);
  for (const p of level.platforms) {
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
    if(!['gate','press','cargo-gate'].includes(device.type))continue;
    const r=device.type==='cargo-gate'?{x:device.x,y:4.55,w:device.w,h:1.95,active:!(state.cargo||[]).some(c=>c.latched&&Math.abs(c.padX-device.x)<1.3)}:deviceRect(device,state.t);
    if(!r?.active||playerBox.left>=r.x+r.w||playerBox.right<=r.x||
       playerBox.top>=r.y+r.h||playerBox.bottom<=r.y)continue;
    if(device.type==='press'){hazardous=true;break;}
    const oldLeft=previousX-ROBOT.halfWidth,oldRight=previousX+ROBOT.halfWidth;
    if(state.vx>=0&&oldRight<=r.x+.15){state.x=r.x-ROBOT.halfWidth;state.vx=0;eventsOnce('gate');}
    else if(state.vx<0&&oldLeft>=r.x+r.w-.15){state.x=r.x+r.w+ROBOT.halfWidth;state.vx=0;eventsOnce('gate');}
  }
  if (state.y > WORLD.height + .8 || (hazardous && state.hazardCooldown<=0 && state.brakeGuard<=0)) {
    const savedX = state.checkpoint;
    const spawnY=savedX===level.checkpoint?level.checkpointSpawn?.y:undefined;
    Object.assign(state, { x: savedX, y: spawnY ?? (savedX > 9 ? 6.25 - ROBOT.halfHeight : 6.5 - ROBOT.halfHeight),
      vx: 0, vy: 0, dir: 1, ground: true, coyote: .1, buffer: 0, cooldown: 0, wallCooldown: 0, rotation: 0,
      hazardCooldown:.65,brakeCharge:0,brakeGuard:0,
      held:{magnet:false,brake:false,float:false},
      cargo:(level.devices||[]).filter(d=>d.type==='cargo').map(d=>({x:d.x,y:5.98,vx:0,id:d.x,latched:false,padX:d.padX})) });
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
