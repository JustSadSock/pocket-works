// Shared operator contract. A room always assigns the first N roles, 2 <= N <= 6.
const ABILITIES=Object.freeze([
 {id:'jump',name:'ПРЫГ',operator:'Прыжок',key:'ПРОБЕЛ / W',icon:'↑',color:'#e7b06d',hold:false},
 {id:'reverse',name:'РАЗВОРОТ',operator:'Разворот',key:'R / ←',icon:'↶',color:'#91bbc6',hold:false},
 {id:'magnet',name:'МАГНИТ',operator:'Магнит',key:'M',icon:'⊂',color:'#bba4d4',hold:true},
 {id:'brake',name:'ТОРМОЗ',operator:'Тормоз',key:'B',icon:'Ⅱ',color:'#d5ab98',hold:true},
 {id:'push',name:'ТОЛЧОК',operator:'Толчок',key:'E',icon:'➜',color:'#a9bf84',hold:false},
 {id:'float',name:'ПОПЛАВОК',operator:'Поплавок',key:'F',icon:'◯',color:'#e0bd83',hold:true}
]);
const MIN_OPERATORS=2;
const MAX_OPERATORS=6;
function operatorAbilities(count){
 const n=Math.max(MIN_OPERATORS,Math.min(MAX_OPERATORS,Math.floor(count)||MIN_OPERATORS));
 return ABILITIES.slice(0,n);
}
const HOLD_ACTIONS=Object.freeze(['magnet','brake','float']);

// Mechanical Course Factory — deterministic, physically reachable by two controls.
// All modules expose a flat floor at the entry and exit for lossless composition.
// Additional art does not constitute a mechanic: every marked device participates
// in the simulation in engine.js. The client and pinned PocketNet use this source.
const MODULES=Object.freeze([
  {kind:'rail',name:'Рельсовый путь',hint:'Место для передышки'},
  {kind:'gap',name:'Разрыв пола',hint:'Прыжок через шахту'},
  {kind:'double-gap',name:'Две шахты',hint:'Серия коротких прыжков'},
  {kind:'step',name:'Высокий порог',hint:'Прыжок на ступень'},
  {kind:'islands',name:'Островки',hint:'Платформы среди пустоты'},
  {kind:'spring',name:'Пружина',hint:'Автоматический подброс'},
  {kind:'belt-right',name:'Попутный конвейер',hint:'Ускоряющая лента'},
  {kind:'belt-left',name:'Встречный конвейер',hint:'Лента мешает движению'},
  {kind:'fan-up',name:'Подъёмный поток',hint:'Воздух поднимает робота'},
  {kind:'fan-side',name:'Боковой поток',hint:'Воздух толкает влево'},
  {kind:'press',name:'Пресс',hint:'Опускается с интервалом'},
  {kind:'gate',name:'Шлюз',hint:'Открывается и закрывается'},
  {kind:'mag-rail',name:'Магнитная подвеска',hint:'Магнит помогает перелететь шахту',required:'magnet'},
  {kind:'timing-press',name:'Двойной пресс',hint:'Тормоз позволяет переждать опасную фазу',required:'brake'},
  {kind:'cargo-switch',name:'Грузовой шлюз',hint:'Толчком доставьте груз до датчика',required:'push'},
  {kind:'float-gap',name:'Длинный пролёт',hint:'Поплавок удерживает Болтика над пропастью',required:'float'}
]);
const COURSE_THEMES=Object.freeze([
 {id:'factory',name:'ИСПЫТАТЕЛЬНЫЙ ЦЕХ',base:'#9aafa4',ground:'#79877b',accent:'#f0b45f'},
 {id:'warehouse',name:'СКЛАД МЕХАНИЗМОВ',base:'#adaba0',ground:'#8b7a69',accent:'#e9a46d'},
 {id:'kitchen',name:'МЕХАНИЧЕСКАЯ КУХНЯ',base:'#b1beb4',ground:'#809a93',accent:'#cfa67c'}
]);
const SECTION_W=4.6;
const round=n=>Math.round(n*1000)/1000;
function rng(seed) {
  let value=(seed>>>0)||1;
  return ()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;};
}
const floor=(platforms,x,w,effect='')=>{
  if(w<.04)return;
  platforms.push({x:round(x),y:6.5,w:round(w),h:1.5,id:'deck'+platforms.length,...(effect?{effect}:{})});
};
function section(kind,x,platforms,devices,random) {
  const p=(offset,w,effect='')=>floor(platforms,x+offset,w,effect);
  const add=(type,offset,w=.5,props={})=>devices.push({type,x:round(x+offset),w, ...props});
  switch(kind) {
    case 'rail':p(0,SECTION_W);break;
    case 'gap':
      p(0,1.35);p(2.18,SECTION_W-2.18);
      add('warning',1.35,.83);break;
    case 'double-gap':
      p(0,1.12);p(1.85,.92);p(3.43,SECTION_W-3.43);
      add('warning',1.12,.73);add('warning',2.77,.66);break;
    case 'step':
      p(0,1.22);platforms.push({x:round(x+1.22),y:5.53,w:1.72,h:2.47,id:'raised'+platforms.length});
      p(2.94,SECTION_W-2.94);add('step',1.22,1.72);break;
    case 'islands':
      p(0,1.08);p(1.6,.68);p(2.68,.52);p(3.7,SECTION_W-3.7);
      add('warning',1.08,.52);add('warning',2.28,.4);add('warning',3.2,.5);break;
    case 'spring':
      p(0,1.67);p(1.67,.7,'spring');p(2.37,SECTION_W-2.37);
      add('spring',1.67,.7);break;
    case 'belt-right':
      p(0,.55);p(.55,3.1,'belt-right');p(3.65,SECTION_W-3.65);
      add('belt-right',.55,3.1);break;
    case 'belt-left':
      p(0,.55);p(.55,3.1,'belt-left');p(3.65,SECTION_W-3.65);
      add('belt-left',.55,3.1);break;
    case 'fan-up':
      p(0,SECTION_W);add('fan-up',1.48,1.66,{strength:1});break;
    case 'fan-side':
      p(0,SECTION_W);add('fan-side',1.55,1.65,{strength:1});break;
    case 'press':
      p(0,SECTION_W);add('press',2.02,.76,{phase:round(random()*6.2)});break;
    case 'gate':
      p(0,SECTION_W);add('gate',2.02,.34,{phase:round(random()*6.2)});break;
    case 'mag-rail':
      p(0,1.12);p(3.65,SECTION_W-3.65);
      add('mag-rail',1.55,1.55,{y:3.65});add('warning',1.12,2.53);break;
    case 'timing-press':
      p(0,SECTION_W);add('press',1.75,.6,{phase:round(random()*4)});
      add('press',2.95,.6,{phase:round(random()*4)});break;
    case 'cargo-switch':
      p(0,SECTION_W);
      add('cargo',1.05,.48,{padX:round(x+3.05)});
      add('cargo-pad',3.05,.63);
      add('cargo-gate',3.9,.36);break;
    case 'float-gap':
      p(0,.85);p(4.05,SECTION_W-4.05);
      add('warning',.85,3.2);add('balloon-sign',1.5,1.6);break;
    default:throw Error('Unknown mechanical module '+kind);
  }
}
export function generateCourse(seed=1,sectionCount=5,playerCount=2) {
  const number=(Number(seed)>>>0)||1;
  const random=rng(number);
  const count=clamp(Math.floor(sectionCount)||5,4,6);
  const theme=COURSE_THEMES[Math.floor(random()*COURSE_THEMES.length)];
  const sections=[],platforms=[],devices=[];
  floor(platforms,0,3.1);
  let previous=null;
  for(let i=0;i<count;i++){
    let choices=MODULES.filter(m=>m.kind!==previous &&
      (!m.required || ['jump','reverse','magnet','brake','push','float'].slice(0,playerCount).includes(m.required)) &&
      (i>0||!['press','gate','timing-press','cargo-switch'].includes(m.kind)));
    // Guaranteed two-action reachable courses: major vertical jumps are not
    // adjacent, so a player always gets at least one safe landing run-up.
    if(['gap','double-gap','step','islands','mag-rail','float-gap'].includes(previous))
      choices=choices.filter(m=>!['gap','double-gap','step','islands','mag-rail','float-gap'].includes(m.kind));
    if(!choices.length)choices=MODULES;
    const selected=choices[Math.floor(random()*choices.length)];
    const x=round(3.1+i*SECTION_W);
    sections.push({kind:selected.kind,name:selected.name,x,w:SECTION_W,index:i+1});
    section(selected.kind,x,platforms,devices,random);
    previous=selected.kind;
  }
  const end=round(3.1+count*SECTION_W);
  floor(platforms,end,3.1);
  const width=round(end+3.1);
  const pointIndex=Math.floor((count-1)/2);
  const checkpoint=round(3.1+(pointIndex+1)*SECTION_W+.25);
  return {seed:number,version:2,playerCount,name:theme.name,theme:theme.id,sections,platforms,devices,
    width,height:8,start:1.15,goal:round(width-1.45),
    checkpoint,checkpointSpawn:{x:checkpoint,y:6.04},length:count};
}
function deviceRect(device,t) {
  if(device.type==='press'){
    const wave=(Math.sin(t*2.35+device.phase)+1)/2;
    return {x:device.x,y:3.38+wave*2.8,w:device.w,h:.82,active:true};
  }
  if(device.type==='gate'){
    const closed=Math.sin(t*1.75+device.phase)<.15;
    return {x:device.x,y:closed?4.8:2.3,w:device.w,h:closed?1.7:1.05,active:closed};
  }
  return null;
}
function validateCourse(course) {
  if(!course||!Number.isInteger(course.seed)||!Array.isArray(course.platforms)||!course.platforms.length)return false;
  if(course.length<4||course.length>6||course.goal>=course.width||course.checkpoint>=course.goal)return false;
  if(course.platforms.some(p=>p.x<0||p.w<=0||p.y<3||p.y>6.5||p.x+p.w>course.width+.001))return false;
  // A shared-floor connector exists on both ends of every module; these are
  // the guaranteed safe retry and composition surfaces.
  for(const s of course.sections){
    for(const x of [s.x+.1,s.x+s.w-.1])
      if(!course.platforms.some(p=>p.x<=x&&p.x+p.w>=x&&p.y===6.5))return false;
  }
  const jumpRange=3.4*(2*9.15/19);
  for(let i=0;i<course.platforms.length-1;i++){
    const a=course.platforms[i],b=course.platforms[i+1];
    if(b.x-a.x-a.w>jumpRange-.2 && !(course.sections||[]).some(s=>
      ['float-gap','mag-rail'].includes(s.kind) && a.x+a.w>=s.x && b.x<=s.x+s.w+.1))return false;
  }
  return true;
}

// NE ZHMI! — isolated, deterministic simulation. No DOM, networking or rendering.
const WORLD = Object.freeze({ width: 18, height: 8, gravity: 19, speed: 3.4 });
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
const FIXED_DT = 1 / 120;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function createGame(level = LEVEL) {
  return {
    level,
    held:{magnet:false,brake:false,float:false},
    energy:{magnet:1,brake:1,float:1},
    pushCooldown:0,pushes:0,magnetUses:0,brakeTime:0,floatTime:0,
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
function commandGame(state, action, pressed=true) {
  if(HOLD_ACTIONS.includes(action)){
    if(state.finished)return 'finished';
    if(pressed && state.energy[action]<.14)return 'empty';
    if(state.held[action]===!!pressed)return 'nochange';
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
      if(Math.abs(box.x-state.x)<2.4 && Math.abs(box.y-state.y)<1.4)
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
function stepGame(state, dt = FIXED_DT) {
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
  for(const action of HOLD_ACTIONS){
    const on=!!state.held[action]&&state.energy[action]>.005;
    state.energy[action]=clamp(state.energy[action]+(on?-(action==='float'?.25:.19):.29)*delta,0,1);
    if(on&&action==='brake')state.brakeTime+=delta;
    if(on&&action==='float')state.floatTime+=delta;
    // Exhaustion must actually release the force. Otherwise a held key would
    // generate hundreds of one-frame force flickers while partially recharging.
    if(on&&state.energy[action]<=.005){
      state.energy[action]=0;state.held[action]=false;eventsOnce('empty-'+action);
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
    if(device.type!=='mag-rail'||Math.abs(state.x-(device.x+device.w/2))>3.0)continue;
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
      state.x=Math.min(state.x,box.x-.42);
      state.vx=Math.min(state.vx,.1);
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
  if (state.y > WORLD.height + .8 || hazardous) {
    const savedX = state.checkpoint;
    const spawnY=savedX===level.checkpoint?level.checkpointSpawn?.y:undefined;
    Object.assign(state, { x: savedX, y: spawnY ?? (savedX > 9 ? 6.25 - ROBOT.halfHeight : 6.5 - ROBOT.halfHeight),
      vx: 0, vy: 0, dir: 1, ground: true, coyote: .1, buffer: 0, cooldown: 0, wallCooldown: 0, rotation: 0,
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
function progressGame(state) {
  const level=state.level||LEVEL;
  return clamp((state.x - (level.start??1.15)) / (level.goal - (level.start??1.15)), 0, 1);
}

// Protocol v5 — authoritative PocketNet 2–6 operator simulation.
// The backend is message-driven: a peer sends activity pulses, but only the
// server advances time and applies control impulses. No client can set position.
export const MIN_PLAYERS=2;
export const MAX_PLAYERS=6;
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
export function reset(s,now) {
  const course=generateCourse((s.seed ^ Math.imul(s.round+1,2654435761))>>>0,5,s.players.length);
  s.robot=createGame(course);s.phase='play';s.hold=false;
  s.round++;s.revision++;
  s.lastClock=now;s.lastBroadcast=0;s.remainder=0;
  s.signals=Object.fromEntries(s.roles.map(id=>[id,now]));
  s.sequences={};
}
function heartbeat(s,id,now) {
  if(s.roles.includes(id))s.signals[id]=now;
}
function advance(s,now) {
  if(s.phase!=='play')return;
  const alive=s.roles.length>=MIN_PLAYERS && s.roles.length===s.players.length &&
    s.roles.every(id=>now-(s.signals?.[id]||0)<=PULSE_WINDOW_MS);
  if(!alive){
    for(const action of HOLD_ACTIONS)s.robot.held[action]=false;
    if(!s.hold)freeze(s,now);else s.lastClock=now;return;
  }
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
export function message(s,player,payload,now=Date.now()){
  const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  const id=player?.id;
  if(!s.players.some(p=>p.id===id))return [];
  if(v.type==='sync') return emitState(s,id);
  if(v.type==='swap'&&s.phase==='lobby'&&id===s.host&&s.players.length>=MIN_PLAYERS){
    s.roles.unshift(s.roles.pop());s.revision++;return emitState(s);
  }
  if(v.type==='start'&&id===s.host&&['lobby','won'].includes(s.phase)){
    if(s.players.length<MIN_PLAYERS)return notice(id,'Для запуска нужны хотя бы два оператора');
    s.roles=s.roles.length===s.players.length&&s.roles.every(role=>s.players.some(p=>p.id===role))
      ?s.roles:[s.players[0].id,s.players[1].id];
    reset(s,now);return emitState(s);
  }
  if(v.type==='restart'&&id===s.host&&['play','won'].includes(s.phase)) {
    reset(s,now);return emitState(s);
  }
  if(v.type==='pulse'&&s.phase==='play') {
    // Advance BEFORE recording a new pulse so a disconnected operator cannot
    // accidentally fast-forward the stalled state merely by reconnecting.
    const priorPhase=s.phase;
    advance(s,now);
    heartbeat(s,id,now);
    if(s.hold)advance(s,now);
    // Terminal transitions MUST reach both clients even when a previous
    // position snapshot was sent within the normal throttle interval.
    if(s.phase!==priorPhase||now-s.lastBroadcast>=105||s.hold!==s.lastHold){
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
    const action=ABILITIES[role]?.id||null;
    if(!action||action!==v.action)return [];
    if(HOLD_ACTIONS.includes(action)&&typeof v.pressed!=='boolean')return [];
    const previous=s.sequences[id]||0;
    if(v.seq<=previous)return [];
    s.sequences[id]=v.seq;
    const outcome=commandGame(s.robot,action,HOLD_ACTIONS.includes(action)?v.pressed:true);
    if(outcome==='cooldown')return notice(id,'Механизм ещё перезаряжается');
    if(outcome==='nochange')return [];
    s.revision++;s.lastBroadcast=now;return emitState(s);
  }
  return [];
}
const module={
  protocolVersion:1,
  createRoom({player}){
    return {state:{phase:'lobby',host:player.id,players:[player],roles:[],
      robot:createGame(),seed:Math.floor(Math.random()*4294967295)||1,round:0,revision:0,hold:false,lastClock:0,lastBroadcast:0,lastHold:false,
      signals:{},sequences:{},remainder:0}};
  },
  onJoin({state,players}){
    if(players.length>MAX_PLAYERS)throw Error('room_full');
    if(state.phase!=='lobby')throw Error('match_in_progress');
    state.players=players;
    // Existing seats keep their roles when more people enter the lobby.
    state.roles=[...state.roles.filter(id=>players.some(p=>p.id===id)),
      ...players.map(p=>p.id).filter(id=>!state.roles.includes(id))];
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
