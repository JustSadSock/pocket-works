import { createGame, resizeGame, serve, claim, stepGame, getBumpers, getBoosters, STEP, WIN_SCORE, ARENAS } from "./physics.js";
import { installMobileRuntime } from "../../shared/mobile-runtime.js";
installMobileRuntime();

const $ = id => document.getElementById(id);
const canvas = $("field"), ctx = canvas.getContext("2d", { alpha: false });
const shell = document.querySelector(".instrument");
const STORE = "pocket-works:tyaga-duel:settings:v1";
function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE) || "{}");
    return { arena: ARENAS.some(a => a.id === p.arena) ? p.arena : "open",
      sound: p.sound !== false, mode: p.mode === "local" ? "local" : "ai",
      wins: Number.isInteger(p.wins) && p.wins >= 0 && p.wins < 100000 ? p.wins : 0 };
  } catch { return {arena:"open",sound:true,mode:"ai",wins:0}; }
}
const prefs = readPrefs();
function savePrefs() { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* private browsing */ } }
const state = {
  screen:"menu", returnScreen:"play", mode:prefs.mode, arena:prefs.arena,
  game:createGame(prefs.arena), last:0, accumulator:0, betweenTime:0, hintTime:0,
  aiDelay:.5, claimFlash:0, claimSide:-1, trail:[], sparks:[], ripples:[],
  frameCount:0, time:0, cssW:360, cssH:720, scale:1, pointerFlash:0,
  comboToast:0, comboCount:0, comboX:180, comboY:360
};

class Sound {
  constructor() { this.ctx = null; this.noise = null; }
  unlock() {
    if (!prefs.sound) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      if (!this.noise) {
        const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * .3), this.ctx.sampleRate);
        const samples = buf.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
        this.noise = buf;
      }
    } catch { this.ctx = null; }
  }
  tone(frequency, duration, wave = "sine", volume = .06, end = null, delay = 0) {
    if (!prefs.sound) return;
    this.unlock();
    const a = this.ctx; if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), gain = a.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(frequency, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end || frequency), t + duration);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(gain).connect(a.destination);o.start(t);o.stop(t + duration + .02);
  }
  // Dry contact of an electromagnetic relay, layered with a short metal resonance.
  texture(frequency, duration = .09, volume = .035) {
    if (!prefs.sound) return;
    this.unlock();
    if (!this.ctx || !this.noise) return;
    const a = this.ctx, t = a.currentTime;
    const source = a.createBufferSource(), filter = a.createBiquadFilter(), gain = a.createGain();
    source.buffer = this.noise;
    filter.type = "bandpass"; filter.frequency.value = frequency; filter.Q.value = 1.4;
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(filter).connect(gain).connect(a.destination);
    source.start(t); source.stop(t + duration + .005);
  }
  pull(side, counter = 115) {
    const force = Math.min(1, (counter - 115) / 455);
    this.tone(side === 0 ? 370 : 260, .13 + force * .07, "triangle", .042 + force * .02, side === 0 ? 620 + force * 140 : 175 - force * 50);
    this.texture(480 + 820 * force, .048 + force * .06, .014 + force * .02);
  }
  hit(strength) {
    this.tone(125 + strength * 90, .075, "triangle", .023 + strength * .02, 85);
    this.texture(340 + strength * 460, .05, .018 + strength * .018);
  }
  boost(combo = 1) {
    this.tone(240 + combo * 25, .15, "sawtooth", .019, 670 + combo * 100);
    this.texture(1200 + combo * 110, .11, .04);
    if (combo > 1) this.tone(570, .11, "triangle", .029, 850, .075);
  }
  goal(side) {
    this.tone(side === 0 ? 440 : 330,.2,"triangle",.065,side === 0 ? 610 : 250);
    this.tone(side === 0 ? 660 : 495,.27,"sine",.04,side === 0 ? 880 : 390,.13);
  }
}
const sound = new Sound();
function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch {} }
function announce(text) { $("status").textContent = text; }
function setScreen(screen) {
  state.screen = screen;
  $("menuScreen").hidden = screen !== "menu";
  $("pauseScreen").hidden = screen !== "paused";
  $("resultScreen").hidden = screen !== "result";
  $("hud").hidden = screen === "menu";
  $("pauseButton").hidden = screen === "menu" || screen === "result" || screen === "paused";
  $("pointBanner").hidden = screen !== "between";
  if (screen === "menu") {
    $("hud").hidden = true;
    state.trail.length = 0;
    state.ripples.length = 0;
    state.sparks.length = 0;
  }
}
function updateLabels() {
  const index = Math.max(0,ARENAS.findIndex(a => a.id === prefs.arena));
  $("arenaIndex").textContent = String(index + 1).padStart(2,"0") + " / 03";
  $("arenaName").textContent = ARENAS[index].name;
  $("topScore").textContent = String(state.game.score[0]);
  $("bottomScore").textContent = String(state.game.score[1]);
  $("bottomName").textContent = state.mode === "ai" ? "ИИ" : "НИЗ";
  for (const key of ["menuSound","pauseSound"]) $(key).textContent = "ЗВУК: " + (prefs.sound ? "ВКЛ" : "ВЫКЛ");
}
function resize() {
  const rect = shell.getBoundingClientRect();
  const w = Math.max(1,rect.width), h = Math.max(1,rect.height);
  state.cssW = w; state.cssH = h; state.scale = w / 360;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.max(1,Math.round(w * pixelRatio));
  canvas.height = Math.max(1,Math.round(h * pixelRatio));
  ctx.setTransform(canvas.width / 360, 0, 0, canvas.height / (h / state.scale), 0, 0);
  resizeGame(state.game, h / state.scale);
}
function start(mode) {
  sound.unlock();
  state.mode = prefs.mode = mode;
  state.arena = prefs.arena;
  state.game = createGame(state.arena, state.cssH / state.scale);
  state.accumulator = 0; state.betweenTime = 0; state.aiDelay = .45;
  state.trail.length = 0; state.sparks.length = 0; state.ripples.length = 0;
  state.claimFlash = 0; state.hintTime = 4;state.comboToast = 0;state.comboCount = 0;
  $("inputHint").textContent = mode === "ai" ? "КАСАНИЕ ГДЕ УГОДНО · W / ↑ / ПРОБЕЛ" : "ВЕРХНЯЯ И НИЖНЯЯ ПОЛОВИНЫ · W / S";
  $("inputHint").classList.remove("dismissed");
  savePrefs();updateLabels();setScreen("play");
  announce(mode === "ai" ? "Матч против ИИ. Верх тянет шар вверх." : "Локальная дуэль. Каждый нажимает свою половину экрана.");
}
function toMenu() {
  if (state.screen === "play" || state.screen === "between" || state.screen === "paused") {
    if (!window.confirm("Завершить текущий матч?")) return;
  }
  state.game = createGame(prefs.arena, state.cssH / state.scale);
  updateLabels();setScreen("menu");announce("Главное меню");
}
function pause() {
  if (state.screen !== "play" && state.screen !== "between") return;
  state.returnScreen = state.screen;
  setScreen("paused");announce("Пауза");
}
function resume() {
  if (state.screen !== "paused") return;
  state.last = 0;state.accumulator = 0;setScreen(state.returnScreen);announce("Матч продолжается");
}
function toggleSound() { prefs.sound = !prefs.sound;savePrefs();updateLabels();sound.unlock(); }
function changeArena(direction) {
  const i = ARENAS.findIndex(a => a.id === prefs.arena);
  prefs.arena = ARENAS[(i + direction + ARENAS.length) % ARENAS.length].id;
  state.arena = prefs.arena;state.game = createGame(prefs.arena,state.cssH / state.scale);
  savePrefs();updateLabels();sound.tone(220,.07,"sine",.03,280);
}
function spawnRing(x,y,side,radius=8) {
  state.ripples.push({x,y,side,r:radius,life:1});
  if (state.ripples.length > 12) state.ripples.shift();
}
function emitImpact(x,y,strength,side=-1) {
  const n = Math.min(13, Math.ceil(strength * 10 + 3));
  for (let i=0;i<n;i++) {
    const angle = 2 * Math.PI * i / n;
    state.sparks.push({x,y,vx:Math.cos(angle)*(35 + 90*strength),vy:Math.sin(angle)*(35 + 90*strength),life:.35 + strength*.22,side});
  }
  if(state.sparks.length>100) state.sparks.splice(0,state.sparks.length-100);
}
function pull(side) {
  if (state.screen !== "play" || (state.mode === "ai" && side === 1)) return;
  if (!claim(state.game,side)) return;
  state.claimSide = side;state.claimFlash = .3;
  $("inputHint").classList.add("dismissed");state.hintTime = 0;
  state.trail.length = 0;
  spawnRing(state.game.ball.x,state.game.ball.y,side,8+Math.max(0,state.game.lastCounter-115)*.03);
  const target = side === 0 ? document.querySelector(".score-top") : document.querySelector(".score-bottom");
  target.classList.remove("pulse");void target.offsetWidth;target.classList.add("pulse");
  window.setTimeout(() => target.classList.remove("pulse"),150);
  if (state.mode === "ai" && side === 0) state.aiDelay = .35 + Math.random() * .35;
  if(state.game.lastCounter > 260) emitImpact(state.game.ball.x,state.game.ball.y,(state.game.lastCounter-115)/455,side);
  sound.pull(side,state.game.lastCounter);vibrate(state.game.lastCounter > 350 ? 15 : 8);
}
function onGoal(event) {
  const side = event.scorer;
  updateLabels();sound.goal(side);vibrate(24);
  emitImpact(state.game.ball.x,state.game.ball.y,.95,side);
  $("pointTitle").textContent = side === 0 ? "ВЕРХ +1" : state.mode === "ai" ? "ИИ +1" : "НИЗ +1";
  $("pointBanner").dataset.side = side === 0 ? "top" : "bottom";
  if(event.finished) {
    if (side === 0 && state.mode === "ai") { prefs.wins += 1;savePrefs(); }
    $("winnerTitle").textContent = side === 0 ? "ВЕРХ ПОБЕДИЛ" : state.mode === "ai" ? "ИИ ПОБЕДИЛ" : "НИЗ ПОБЕДИЛ";
    $("winnerMark").textContent = side === 0 ? "↑" : "↓";
    $("winnerMark").classList.toggle("bottom",side === 1);
    $("resultScore").textContent = state.game.score[0] + " : " + state.game.score[1];
    setScreen("result");announce($("winnerTitle").textContent);
  } else {
    state.betweenTime = 1.0;setScreen("between");
    announce($("pointTitle").textContent);
  }
}
function pointToSide(e) {
  if (state.mode === "ai") return 0;
  const r = canvas.getBoundingClientRect();
  return e.clientY - r.top < r.height * .5 ? 0 : 1;
}
canvas.addEventListener("pointerdown",e => {
  if (state.screen !== "play") return;
  e.preventDefault();sound.unlock();pull(pointToSide(e));
}, {passive:false});
canvas.addEventListener("contextmenu",e => e.preventDefault());
document.addEventListener("keydown", e => {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  if (["Space","ArrowUp","ArrowDown"].includes(e.code)) e.preventDefault();
  if (e.code === "Escape") { if (state.screen === "paused") resume();else pause(); return; }
  if (state.screen !== "play") return;
  if (["KeyW","ArrowUp","Space"].includes(e.code)) {sound.unlock();pull(0);}
  if (state.mode === "local" && ["KeyS","ArrowDown"].includes(e.code)) {sound.unlock();pull(1);}
});
$("aiButton").addEventListener("click",()=>start("ai"));
$("localButton").addEventListener("click",()=>start("local"));
$("arenaPrev").addEventListener("click",()=>changeArena(-1));
$("arenaNext").addEventListener("click",()=>changeArena(1));
$("menuSound").addEventListener("click",toggleSound);
$("pauseSound").addEventListener("click",toggleSound);
$("pauseButton").addEventListener("click",pause);
$("resumeButton").addEventListener("click",resume);
$("restartButton").addEventListener("click",()=>start(state.mode));
$("pauseHome").addEventListener("click",toMenu);
$("rematchButton").addEventListener("click",()=>start(state.mode));
$("resultHome").addEventListener("click",toMenu);
document.addEventListener("visibilitychange",()=>{if(document.hidden)pause();state.last=0;});
window.addEventListener("resize",resize,{passive:true});

function update(dt) {
  state.time += dt;
  const moving = state.screen === "play";
  if (moving) {
    if (state.mode === "ai") {
      state.aiDelay -= dt;
      if (state.aiDelay <= 0 && state.game.owner !== 1) {
        const g = state.game, b = g.ball, depth = b.y / g.h;
        // An imperfect, reactive opponent: anticipate trajectory and dangerous build-up,
        // without instant perfect counters or arbitrary free impulses.
        // The bottom AI scores at the bottom: defend against upward motion,
        // not against the ball already travelling toward its own goal.
        const urgent = (b.vy < -110 && depth < .40)
          || (b.vy < -450 && depth < .60)
          || (g.owner === 0 && g.charge > .55 && b.vy < -80)
          || (depth < .20 && b.vy < 0);
        const opportunity = (g.owner === -1 && g.elapsed > 1.1)
          || (depth < .62 && b.vy < 100 && Math.random() < .25);
        if (urgent || opportunity) {
          if (claim(g, 1)) {
            state.claimSide = 1;state.claimFlash = .3;
            state.trail.length = 0;
            spawnRing(b.x, b.y, 1, 8 + Math.max(0,g.lastCounter-115)*.03);
            if (g.lastCounter > 260) emitImpact(b.x,b.y,(g.lastCounter-115)/455,1);
            sound.pull(1,g.lastCounter);
          }
        }
        state.aiDelay = urgent ? .25 + Math.random()*.14 : .24 + Math.random()*.3;
      }
    }
    state.accumulator = Math.min(state.accumulator + dt,.06);
    let iterations=0;
    while(state.accumulator >= STEP && iterations<8) {
      state.accumulator-=STEP;
      const event=stepGame(state.game,STEP);
      state.frameCount++;
      if (state.frameCount%5 === 0) {
        state.trail.unshift({x:state.game.ball.x,y:state.game.ball.y});
        if(state.trail.length>15)state.trail.pop();
      }
      if(event?.kind==="impact") {
        sound.hit(event.strength);
        emitImpact(event.x,event.y,event.strength);
      } else if(event?.kind==="boost") {
        sound.boost(event.combo);
        emitImpact(event.x,event.y,.65+event.strength*.34,state.game.owner);
        spawnRing(event.x,event.y,state.game.owner,15);
        vibrate(event.combo > 1 ? 20 : 11);
      }
      if(event?.combo>1) {
        state.comboToast=.88;state.comboCount=event.combo;state.comboX=event.x;state.comboY=event.y;
      }
      if(event?.kind==="goal") {
        onGoal(event);state.accumulator=0;break;
      }
      iterations++;
    }
  } else if (state.screen === "between") {
    state.betweenTime -= dt;
    if(state.betweenTime<=0) {
      serve(state.game);state.trail.length=0;state.aiDelay=.45;
      setScreen("play");announce("Следующий розыгрыш");
    }
  }
  state.claimFlash = Math.max(0,state.claimFlash-dt);
  state.comboToast = Math.max(0,state.comboToast-dt);
  if(state.hintTime>0) {state.hintTime-=dt;if(state.hintTime<=0)$("inputHint").classList.add("dismissed");}
  for (const p of state.sparks) {p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-dt*2.2;p.vy*=1-dt*2.2;p.life-=dt;}
  state.sparks=state.sparks.filter(p=>p.life>0);
  for (const ring of state.ripples){ring.r+=220*dt;ring.life-=dt*2.6;}
  state.ripples=state.ripples.filter(p=>p.life>0);
}
function pathCircle(x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);}
function strokeLine(x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function drawField(h,t) {
  ctx.fillStyle="#e5e4dc";ctx.fillRect(0,0,360,h);
  ctx.fillStyle="#d9bcae";ctx.fillRect(0,0,360,24);
  ctx.fillStyle="#b9d0d2";ctx.fillRect(0,h-24,360,24);
  // Solid opposing force fields, not ornamental game-board tiles.
  ctx.fillStyle="#f3e9e2";ctx.fillRect(0,24,360,h*.5-24);
  ctx.fillStyle="#e2ebea";ctx.fillRect(0,h*.5,360,h*.5-24);
  ctx.strokeStyle="#a1a9a2";ctx.lineWidth=.65;ctx.setLineDash([3,9]);
  strokeLine(20,h*.5,340,h*.5);ctx.setLineDash([]);
  ctx.strokeStyle="#aab2aa";ctx.lineWidth=1;
  strokeLine(17,24,17,h-24);strokeLine(343,24,343,h-24);
  for(let i=0;i<14;i++){
    const y=48+(h-96)*(i/13);
    ctx.lineWidth=i===6||i===7?2:1;ctx.strokeStyle="#aeb4af";
    strokeLine(17,y,24,y);strokeLine(336,y,343,y);
  }
  // Goal jaws and compact scoring slots.
  ctx.strokeStyle="#b84f37";ctx.lineWidth=6;strokeLine(60,27,300,27);
  ctx.strokeStyle="#346b81";strokeLine(60,h-27,300,h-27);
  ctx.fillStyle="#b84f37";ctx.fillRect(177,21,6,12);
  ctx.fillStyle="#346b81";ctx.fillRect(177,h-33,6,12);
  if(state.claimFlash>0 && state.screen!=="menu"){
    const a=state.claimFlash/.3;ctx.fillStyle=state.claimSide===0?"rgba(184,79,55,"+(a*.07)+")":"rgba(52,107,129,"+(a*.08)+")";
    ctx.fillRect(20,state.claimSide===0?24:h/2,320,h/2-24);
  }
  if(state.screen==="menu"){
    ctx.globalAlpha=.14;ctx.strokeStyle="#333d3b";ctx.lineWidth=1.5;
    for(let i=0;i<9;i++)strokeLine(90+i*23,h*.28,110+i*23,h*.72);
    ctx.globalAlpha=1;
  }
}
function drawBoosters(g,t) {
  const gates = getBoosters(g);
  for (let i=0;i<gates.length;i++) {
    const p=gates[i], energy=g.boostFlash[i]||0, top=p.y-p.h/2;
    ctx.globalAlpha=.95;
    ctx.fillStyle=energy>.02?"#e2cf94":"#c7c2a6";
    ctx.fillRect(p.x,top,p.w,p.h);
    ctx.strokeStyle=energy>.02?"#967131":"#897d57";
    ctx.lineWidth=1.8;ctx.strokeRect(p.x,top,p.w,p.h);
    ctx.save();ctx.beginPath();ctx.rect(p.x,top,p.w,p.h);ctx.clip();
    ctx.strokeStyle="#665c43";ctx.lineWidth=1.5;
    const scroll=(t*24)%19;
    for(let j=-2;j<9;j++){
      const x=p.x+j*19+scroll;
      strokeLine(x,top+3,x+7,top+p.h/2);
      strokeLine(x+7,top+p.h/2,x,top+p.h-3);
    }
    ctx.restore();
    ctx.globalAlpha=1;
    ctx.fillStyle="#5d5b4a";ctx.fillRect(p.x-4,top-3,4,p.h+6);ctx.fillRect(p.x+p.w,top-3,4,p.h+6);
    if(energy>.01){
      ctx.globalAlpha=energy*.35;ctx.fillStyle="#d5aa4c";
      ctx.fillRect(p.x-5,top-6,p.w+10,p.h+12);ctx.globalAlpha=1;
    }
  }
}
function drawBumpers(g) {
  const bumpers=getBumpers(g);
  for(const p of bumpers){
    ctx.fillStyle="#9ca5a0";pathCircle(p.x+2,p.y+3,p.r+2);ctx.fill();
    ctx.fillStyle="#66726d";pathCircle(p.x,p.y,p.r);ctx.fill();
    ctx.strokeStyle="#d4d9d2";ctx.lineWidth=2.5;pathCircle(p.x,p.y,p.r-6);ctx.stroke();
    ctx.fillStyle="#333d3a";pathCircle(p.x,p.y,4);ctx.fill();
    ctx.strokeStyle="#ccd1c9";ctx.lineWidth=1;
    for(let j=0;j<4;j++){const a=j*Math.PI/2;strokeLine(p.x+Math.cos(a)*(p.r-9),p.y+Math.sin(a)*(p.r-9),p.x+Math.cos(a)*(p.r-4),p.y+Math.sin(a)*(p.r-4));}
  }
}
function drawBall(g,t) {
  const b=g.ball;
  const bx=state.screen==="menu"?180:b.x;
  const by=state.screen==="menu"?g.h*.51+Math.sin(t*1.35)*5:b.y;
  if(state.screen!=="menu"){
    for(let i=state.trail.length-1;i>=0;i--){
      const a=state.trail[i];
      ctx.fillStyle=g.owner===0?"rgba(184,79,55,"+((1-i/16)*.12)+")":g.owner===1?"rgba(52,107,129,"+((1-i/16)*.12)+")":"rgba(42,50,47,.06)";
      pathCircle(a.x,a.y,b.r*(1-i/18));ctx.fill();
    }
  }
  ctx.fillStyle="#a7afa9";pathCircle(bx+2,by+4,14);ctx.fill();
  ctx.fillStyle="#242b2a";pathCircle(bx,by,12);ctx.fill();
  ctx.fillStyle="#f2f1e9";pathCircle(bx-4,by-4,4.7);ctx.fill();
  ctx.strokeStyle="#88928d";ctx.lineWidth=1.5;pathCircle(bx,by,13.5);ctx.stroke();
  if(state.screen!=="menu" && g.owner!==-1){
    const charge=g.charge;
    ctx.strokeStyle=g.owner===0?"#b84f37":"#346b81";
    ctx.globalAlpha=.35+charge*.6;ctx.lineWidth=2.5+charge*2;
    ctx.beginPath();ctx.arc(bx,by,19+charge*4,-Math.PI/2,-Math.PI/2+charge*Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
    if(charge>.35){
      ctx.fillStyle=g.owner===0?"#b84f37":"#346b81";
      ctx.font="900 12px Arial, sans-serif";
      ctx.textAlign=bx>270?"right":"left";
      ctx.fillText("×"+(1+charge*1.39).toFixed(1),bx>270?bx-27:bx+27,Math.max(28,by-16));
    }
    const dir=g.owner===0?-1:1;
    ctx.strokeStyle=g.owner===0?"#b84f37":"#346b81";
    ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(bx-6,by-dir*25);ctx.lineTo(bx,by-dir*32);ctx.lineTo(bx+6,by-dir*25);ctx.stroke();
  }
}
function drawFX() {
  for (const ring of state.ripples) {
    ctx.globalAlpha=Math.min(1,ring.life);ctx.strokeStyle=ring.side===0?"#b84f37":"#346b81";
    ctx.lineWidth=2;pathCircle(ring.x,ring.y,ring.r);ctx.stroke();
  }
  ctx.globalAlpha=1;
  for(const p of state.sparks){
    ctx.fillStyle=p.side===0?"#b84f37":p.side===1?"#346b81":"#65716b";
    ctx.globalAlpha=Math.min(1,p.life*2);
    ctx.fillRect(p.x-1,p.y-1,3.5,3.5);
  }
  ctx.globalAlpha=1;
  if(state.comboToast>0 && state.screen==="play"){
    ctx.globalAlpha=Math.min(1,state.comboToast*2);
    ctx.textAlign="center";
    ctx.font="900 15px Arial, sans-serif";ctx.fillStyle="#735d31";
    ctx.fillText("СВЯЗКА ×"+state.comboCount,Math.max(84,Math.min(276,state.comboX)),Math.max(65,state.comboY-43-(1-state.comboToast)*20));
    ctx.globalAlpha=1;
  }
}
function render(t) {
  const g=state.game;
  ctx.setTransform(canvas.width/360,0,0,canvas.height/g.h,0,0);
  ctx.clearRect(0,0,360,g.h);
  drawField(g.h,t);
  drawBoosters(g,t);
  drawBumpers(g);
  drawBall(g,t);
  drawFX();
}
function loop(timestamp) {
  if (!state.last) state.last=timestamp;
  const dt=Math.min(.045,Math.max(0,(timestamp-state.last)/1000));state.last=timestamp;
  if(!document.hidden) {update(dt);render(timestamp/1000);}
  requestAnimationFrame(loop);
}
resize();updateLabels();setScreen("menu");requestAnimationFrame(loop);
