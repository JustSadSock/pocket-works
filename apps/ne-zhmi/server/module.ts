// Frozen physics core shared in logic with the client for the first network protocol.
const WORLD = Object.freeze({ width: 18, height: 8, gravity: 19, speed: 3.4 });
const ROBOT = Object.freeze({ halfWidth: 0.33, halfHeight: 0.46, jump: 9.15 });
const LEVEL = Object.freeze({
  name: 'Испытательный цех', goal: 16.5, checkpoint: 10.25,
  platforms: [
    { x: 0, y: 6.5, w: 4.72, h: 1.5, id: 'start' },
    { x: 5.48, y: 5.45, w: 3.15, h: 2.55, id: 'step' },
    { x: 9.4, y: 6.25, w: 3.18, h: 1.75, id: 'dock' },
    { x: 13.35, y: 6.5, w: 4.65, h: 1.5, id: 'finish' }
  ]
});
const FIXED_DT = 1 / 120;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function createGame() {
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
function commandGame(state, action) {
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
function stepGame(state, dt = FIXED_DT) {
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
function progressGame(state) { return clamp((state.x - 1.15) / (LEVEL.goal - 1.15), 0, 1); }


// Protocol v1 — authoritative PocketNet two-player simulation.
// The backend is message-driven: a peer sends activity pulses, but only the
// server advances time and applies control impulses. No client can set position.
export const MIN_PLAYERS=2;
export const MAX_PLAYERS=2;
const PULSE_WINDOW_MS=1250;
const MAX_DELTA_MS=180;
function snapshot(s) {
  return { phase:s.phase,host:s.host,players:s.players,roles:s.roles,
    robot:s.robot,round:s.round,revision:s.revision,hold:s.hold,
    pulseAge: s.phase==='play'?Date.now()-s.lastClock:0 };
}
function stateEvent(s,to){return {type:'state', ...(to?{to}:{}),payload:snapshot(s)};}
function emitState(s,to){return [stateEvent(s,to)];}
function notice(to,value){return [{type:'notice',to,payload:value}];}
function freeze(s,now){
  if(s.phase==='play'){
    s.hold=true;s.lastClock=now;s.revision++;
  }
}
function reset(s,now) {
  s.robot=createGame();s.phase='play';s.hold=false;
  s.round++;s.revision++;
  s.lastClock=now;s.lastBroadcast=0;
  s.signals=Object.fromEntries(s.roles.map(id=>[id,now]));
  s.sequences={};
}
function heartbeat(s,id,now) {
  if(s.roles.includes(id))s.signals[id]=now;
}
function advance(s,now) {
  if(s.phase!=='play')return;
  const alive=s.roles.length===2 && s.players.length===2 &&
    s.roles.every(id=>now-(s.signals?.[id]||0)<=PULSE_WINDOW_MS);
  if(!alive){if(!s.hold)freeze(s,now);else s.lastClock=now;return;}
  if(s.hold){
    s.hold=false;s.lastClock=now;s.revision++;
    return;
  }
  const elapsed=Math.min(MAX_DELTA_MS,Math.max(0,now-s.lastClock));
  s.lastClock=now;
  let left=elapsed/1000;
  // Fixed simulation quanta, independent from message cadence. Remainder is
  // conserved for deterministic restitution on irregular WebSocket timing.
  s.remainder=(s.remainder||0)+left;
  let steps=0;
  while(s.remainder>=FIXED_DT&&steps<30) {
    stepGame(s.robot,FIXED_DT);
    s.remainder-=FIXED_DT;steps++;
    if(s.robot.finished) {
      s.phase='won';s.hold=false;s.revision++;
      break;
    }
  }
  if(steps>=30)s.remainder=0;
}
function message(s,player,payload,now=Date.now()){
  const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const id=player?.id;
  if(!s.players.some(p=>p.id===id))return [];
  if(v.type==='sync') return emitState(s,id);
  if(v.type==='swap'&&s.phase==='lobby'&&id===s.host&&s.players.length===2){
    s.roles.reverse();s.revision++;return emitState(s);
  }
  if(v.type==='start'&&id===s.host&&['lobby','won'].includes(s.phase)){
    if(s.players.length!==2)return notice(id,'Для запуска нужны два оператора');
    s.roles=s.roles.length===2&&s.roles.every(role=>s.players.some(p=>p.id===role))
      ?s.roles:[s.players[0].id,s.players[1].id];
    reset(s,now);return emitState(s);
  }
  if(v.type==='restart'&&id===s.host&&['play','won'].includes(s.phase)) {
    reset(s,now);return emitState(s);
  }
  if(v.type==='pulse'&&s.phase==='play') {
    // Advance BEFORE recording a new pulse so a disconnected operator cannot
    // accidentally fast-forward the stalled state merely by reconnecting.
    advance(s,now);
    heartbeat(s,id,now);
    if(s.hold)advance(s,now);
    if(now-s.lastBroadcast>=105||s.hold!==s.lastHold){
      s.lastBroadcast=now;s.lastHold=s.hold;return emitState(s);
    }
    return [];
  }
  if(v.type==='input'&&s.phase==='play') {
    advance(s,now);
    heartbeat(s,id,now);
    if(s.hold) return emitState(s,id);
    if(v.round!==s.round||!Number.isSafeInteger(v.seq)||v.seq<=0||v.seq>1e9)return [];
    const role=s.roles.indexOf(id);
    const action=role===0?'jump':role===1?'reverse':null;
    if(!action||action!==v.action)return [];
    const previous=s.sequences[id]||0;
    if(v.seq<=previous)return [];
    s.sequences[id]=v.seq;
    const outcome=commandGame(s.robot,action);
    if(outcome==='cooldown')return notice(id,'Разворот ещё перезаряжается');
    s.revision++;s.lastBroadcast=now;return emitState(s);
  }
  return [];
}
const module={
  protocolVersion:1,
  createRoom({player}){
    return {state:{phase:'lobby',host:player.id,players:[player],roles:[],
      robot:createGame(),round:0,revision:0,hold:false,lastClock:0,lastBroadcast:0,lastHold:false,
      signals:{},sequences:{},remainder:0}};
  },
  onJoin({state,players}){
    if(players.length>2)throw Error('room_full');
    if(state.phase!=='lobby')throw Error('match_in_progress');
    state.players=players;state.roles=players.map(p=>p.id);
    state.revision++;return {state,events:emitState(state)};
  },
  onLeave({state,players}){
    state.players=players;
    state.host=players.some(p=>p.id===state.host)?state.host:players[0]?.id||'';
    state.phase='lobby';state.roles=players.map(p=>p.id);
    state.hold=false;state.robot=createGame();
    state.round++;state.revision++;
    state.signals={};state.sequences={};state.remainder=0;
    return {state,events:emitState(state)};
  },
  onMessage({state,player,payload}){
    return {state,events:message(state,player,payload)};
  }
};
export default module;
