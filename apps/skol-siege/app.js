import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { AMMO, LEVELS, createLevel, currentWind, findStructure, resolveShot, shotsLeft, validState } from './model.mjs';

installMobileRuntime();
createWorkshopMode({
  appName: 'СКОЛ',
  version: '1.0.0',
  cachePrefix: 'skol-siege-',
  storageNamespace: 'pocket-works:skol-siege',
  onReset: () => location.reload()
});

const $ = id => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const ui = {
  begin: $('begin'), intro: $('intro'), result: $('result'), menu: $('menu-overlay'), confirm: $('confirm'),
  fire: $('fire'), sound: $('sound'), menuButton: $('menu'), closeMenu: $('close-menu'), feedback: $('feedback'),
  note: $('aim-note'), next: $('next'), again: $('again'), a11y: $('a11y')
};
const SAVE_KEY = 'pocket-works:skol-siege:v1';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const easeOut = t => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
const hash = n => ((Math.sin(n * 127.1 + 92.7) * 43758.5453) % 1 + 1) % 1;
const rand = (seed, i) => hash(seed * 12.13 + i * 7.9);
let W = 390, H = 844, S = .55, cx = 195, baseY = 455, catY = 640;
let dpr = 1, lastFrame = 0, audio = null, flashTimer = 0;
let mode = 'intro', modeBeforeMenu = 'intro';
let focusRestore = null;
let pointerId = null;
let game = createLevel(0);
let unlocked = 0;
let best = [null, null, null];
let selected = 'stone';
let soundOn = true;
let touched = false;
let aim = { x: 0, y: -30, drag: false };
let flight = null;
const particles = [];
let shake = 0;
let countdown = 0;

function readSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || data.schema !== 1) return;
    unlocked = clamp(Number.isInteger(data.unlocked) ? data.unlocked : 0, 0, LEVELS.length - 1);
    best = Array.isArray(data.best) ? [0, 1, 2].map(i => Number.isInteger(data.best[i]) && data.best[i] > 0 ? data.best[i] : null) : best;
    soundOn = data.soundOn !== false;
    if (validState(data.game) && data.game.level <= unlocked) game = data.game;
    if (game.phase !== 'playing') game = createLevel(Math.max(game.level, unlocked));
    if (typeof data.selected === 'string' && AMMO[data.selected]) selected = data.selected;
  } catch { /* Private browsing and corrupt saves start a fresh campaign. */ }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: 1, unlocked, best, soundOn, selected, game })); }
  catch { /* Fully playable with storage disabled. */ }
}
readSave();

function contextAudio() {
  if (!soundOn) return null;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  } catch { return null; }
}
function sound(kind) {
  const ac = contextAudio();
  if (!ac) return;
  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(kind === 'impact' ? .11 : kind === 'victory' ? .07 : .035, now + .012);
  gain.gain.exponentialRampToValueAtTime(.001, now + (kind === 'victory' ? .65 : kind === 'impact' ? .3 : .095));
  gain.connect(ac.destination);
  const osc = ac.createOscillator();
  osc.type = kind === 'impact' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(kind === 'impact' ? 112 : kind === 'victory' ? 390 : 360, now);
  osc.frequency.exponentialRampToValueAtTime(kind === 'impact' ? 47 : kind === 'victory' ? 560 : 210, now + .17);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + (kind === 'victory' ? .67 : kind === 'impact' ? .32 : .1));
}
function vibrate(ms) { if (navigator.vibrate && !reduced.matches) navigator.vibrate(ms); }

function setMessage(message, dur = 1600) {
  ui.feedback.textContent = message;
  ui.feedback.hidden = false;
  ui.a11y.textContent = message;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { ui.feedback.hidden = true; }, dur);
}
function syncUI() {
  const l = LEVELS[game.level];
  $('mission').textContent = l.name;
  $('act').textContent = `ОСАДА ${String(game.level + 1).padStart(2, '0')} / 03`;
  $('mission-hint').textContent = l.subtitle;
  const gate = findStructure(game, 'gate');
  const keep = findStructure(game, 'keep');
  for (const [id, data] of [['gate-bars', gate], ['keep-bars', keep]]) {
    const parent = $(id);
    parent.replaceChildren(...Array.from({ length: data.maxHp }, (_, i) => {
      const bar = document.createElement('i');
      if (i >= data.hp) bar.className = 'off';
      return bar;
    }));
    parent.parentElement.setAttribute('aria-label', `${data.kind === 'gate' ? 'Врата' : 'Донжон'}: ${data.hp} из ${data.maxHp}`);
  }
  const wind = currentWind(game);
  $('wind-number').textContent = wind === 0 ? '0' : `${wind > 0 ? '+' : ''}${wind}`;
  document.querySelector('.wind-box').className = 'wind-box' + (wind === 0 ? ' calm' : wind < 0 ? ' left' : '');
  document.querySelector('.wind-box').setAttribute('aria-label', `Ветер: ${wind === 0 ? 'штиль' : wind < 0 ? `${Math.abs(wind)} влево` : `${wind} вправо`}`);
  if (!game.ammo[selected] || game.ammo[selected] <= 0) selected = Object.keys(AMMO).find(id => game.ammo[id] > 0) || 'stone';
  for (const id of Object.keys(AMMO)) {
    const btn = $(`ammo-${id}`);
    btn.disabled = game.ammo[id] < 1 || game.phase !== 'playing';
    btn.classList.toggle('is-selected', selected === id);
    btn.setAttribute('aria-pressed', String(selected === id));
    btn.title = AMMO[id].description;
    $(`stock-${id}`).textContent = game.ammo[id];
  }
  $('shot-count').textContent = `${shotsLeft(game)} ${shotsLeft(game) === 1 ? 'ЗАРЯД' : 'ЗАРЯДОВ'}`;
  ui.fire.disabled = game.phase !== 'playing' || mode !== 'playing' || !!flight || shotsLeft(game) === 0;
  $('begin').textContent = game.turn ? 'ПРОДОЛЖИТЬ ОСАДУ →' : 'НАЧАТЬ ОСАДУ →';
  ui.sound.classList.toggle('is-muted', !soundOn);
  ui.sound.setAttribute('aria-label', soundOn ? 'Выключить звук' : 'Включить звук');
  ui.sound.setAttribute('aria-pressed', String(soundOn));
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  W = Math.max(240, rect.width); H = Math.max(300, rect.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S = Math.min(W / 700, H / 650, 1.4);
  cx = W / 2;
  baseY = H * .553;
  catY = Math.min(H * .79, H - (H < 610 ? 150 : 163));
}
function pos(x, y) { return { x: cx + x * S, y: baseY + y * S }; }
const catapultX = () => cx - (W >= 820 ? 210 : 112) * S;
const shotOrigin = () => ({ x: catapultX() + 7*S, y: catY - 145 * S });
function polygon(points, fill, stroke, line = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
}
function ellipse(x, y, rx, ry, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function line(points, color, width = 1, dash = null) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
}
function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, '#e9dfc4'); gradient.addColorStop(.5, '#d9c49a'); gradient.addColorStop(1, '#ac9469');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  ellipse(W * .77, H * .252, 50 * S, 50 * S, '#f8e5b8', .86);
  for (let layer = 0; layer < 3; layer++) {
    const horizon = H * (.40 + layer * .052);
    const step = Math.max(22, 70 * S);
    const pts = [[0, H], [0, horizon]];
    for (let x = 0; x <= W + step; x += step) {
      const n = hash((Math.floor(x / step) + 2) * 3.2 + layer * 57);
      const swell = Math.sin(x / W * 5 + layer * 3) * 24 * S;
      pts.push([x, horizon - (10 + n * (36 - layer * 6)) * S + swell]);
    }
    pts.push([W, H]);
    polygon(pts, ['#bbb18d', '#9b9a78', '#858b67'][layer]);
  }
  const groundTop = H * .505;
  ctx.fillStyle = '#90936f'; ctx.fillRect(0, groundTop, W, H - groundTop);
  // Seeded sparse wheat and contour lines: no frame-to-frame random texture.
  for (let i = 0; i < 160; i++) {
    const x = rand(25, i) * W;
    const y = groundTop + rand(44, i) * (H - groundTop);
    const len = (2 + rand(55, i) * 5) * S;
    line([[x, y], [x + len, y - len * .18]], i % 3 ? 'rgba(230,216,164,.23)' : 'rgba(58,79,53,.25)', Math.max(.6, S));
  }
  const bcx = cx, bcy = baseY + 4 * S;
  ellipse(bcx + 7*S, bcy + 14*S, 382*S, 132*S, '#483f2e', .23);
  ellipse(bcx, bcy, 385*S, 130*S, '#705f41');
  ellipse(bcx, bcy - 12*S, 377*S, 119*S, '#7e855e');
  ellipse(bcx - 20*S, bcy - 30*S, 324*S, 98*S, '#91966c', .36);
  // The siege road, hand-drawn through the small scale model.
  line([[cx-7*S, baseY+14*S], [cx-22*S, baseY+52*S], [catapultX(), catY-2*S]], '#7b714f', 48*S);
  line([[cx-7*S, baseY+14*S], [cx-22*S, baseY+52*S], [catapultX(), catY-2*S]], '#aaa17a', 38*S);
  for (let i = 0; i < 75; i++) {
    const x = cx + (rand(43, i) * 2 - 1) * 345 * S;
    const y = bcy + (rand(46, i) * 2 - 1) * 105 * S;
    if (((x-cx)/(365*S))**2 + ((y-bcy)/(110*S))**2 > 1) continue;
    if (Math.abs(x - (cx - 33*S)) < 38*S && y > bcy) continue;
    const r = (1 + rand(56,i)*3)*S;
    ellipse(x, y, r*2, r*.5, i % 2 ? '#5e7453' : '#c3bb8d', .66);
  }
  // Board-edge hand marks.
  ctx.save(); ctx.strokeStyle = 'rgba(66,56,37,.28)'; ctx.lineWidth = 1*S;
  ctx.beginPath(); ctx.ellipse(bcx,bcy - 12*S,377*S,119*S,0,0,Math.PI*2); ctx.stroke(); ctx.restore();
}
function drawTree(x, y, size = 1) {
  const px = cx + x*S, py = baseY + y*S, r = 18*S*size;
  ellipse(px+3*S,py+6*S,r*1.1,r*.28,'#3e4d34',.33);
  line([[px,py],[px+2*S,py-28*S*size]],'#584b32',5*S*size);
  polygon([[px-r,py-18*S*size],[px,py-58*S*size],[px+r,py-18*S*size]],'#566948','#46573b',1*S);
  polygon([[px-r*.8,py-33*S*size],[px,py-70*S*size],[px+r*.8,py-33*S*size]],'#6e7c50');
  line([[px-r*.3,py-39*S*size],[px,py-58*S*size]],'#b1ad76',2*S);
}
function drawSurroundings() {
  for (const [x,y,z] of [[-340,-42,1],[-326,5,.62],[-299,56,.76],[330,-14,1],[343,31,.62],[304,69,.75]]) drawTree(x,y,z);
  // Wooden palisade stakes behind the walls.
  for (let i = 0; i < 8; i++) {
    const x = cx + (-207 + i*56)*S;
    const y = baseY - 112*S;
    polygon([[x-4*S,y],[x-4*S,y-19*S],[x,y-27*S],[x+4*S,y-19*S],[x+4*S,y]], '#6f6047','#5b4d3c',.8*S);
  }
}
function drawRubble(s) {
  const {x,y} = pos(s.x,s.y);
  const floor = y + s.height*S*.52;
  ellipse(x,floor+6*S,s.width*S*.62,20*S,'#483d32',.24);
  for (let i=0;i<20;i++) {
    const rx=x+(rand(s.x+100,i)*2-1)*s.width*S*.58;
    const ry=floor+(rand(s.y-40,i)*2-1)*13*S;
    const size=(5+rand(s.maxHp+8,i)*10)*S;
    polygon([[rx-size,ry],[rx-size*.3,ry-size*.7],[rx+size,ry-size*.25],[rx+size*.6,ry+size*.5]], i%3===0?'#6f6a5d':i%3===1?'#b0a38b':'#8f8571','#686357',.6*S);
  }
}
function block(x,y,w,h,depth,front='#928a79',right='#736e62',top='#b4a995') {
  polygon([[x-w/2,y-h],[x+w/2,y-h],[x+w/2+depth,y-h-depth*.39],[x-w/2+depth,y-h-depth*.39]],top,'#736e5c',.8*S);
  polygon([[x+w/2,y-h],[x+w/2+depth,y-h-depth*.39],[x+w/2+depth,y-depth*.39],[x+w/2,y]],right,'#605c53',.8*S);
  polygon([[x-w/2,y-h],[x+w/2,y-h],[x+w/2,y],[x-w/2,y]],front,'#6d685b',1*S);
}
function stoneCourses(s, x, y, w, h) {
  ctx.save(); ctx.beginPath();ctx.rect(x-w/2+2*S,y-h+2*S,w-4*S,h-4*S);ctx.clip();
  const rows = Math.max(3, Math.floor(h / (17*S)));
  const gap = h/rows;
  for(let i=1;i<rows;i++){
    const yy = y-h+i*gap;
    line([[x-w/2,yy],[x+w/2,yy]],'rgba(61,56,46,.24)',.9*S);
  }
  for(let i=0;i<rows;i++){
    const offset = i%2 ? 9*S : 0;
    for(let j=-5;j<9;j++) {
      const xx=x-w/2+j*25*S+offset;
      const yy=y-h+i*gap;
      line([[xx,yy+1*S],[xx,yy+gap-2*S]],'rgba(62,57,48,.23)',1*S);
    }
  }
  for(let i=0;i<12;i++){
    const rx=x+(rand(11+s.x,i)-.5)*w*.91;
    const ry=y-h+rand(31+s.y,i)*h;
    line([[rx,ry],[rx+5*S,ry+1.5*S]],'rgba(244,227,196,.19)',1.4*S);
  }
  if(s.hp<s.maxHp){
    const n=s.maxHp-s.hp;
    for(let i=0;i<n+1;i++){
      const crackX=x+((rand(s.x-46,i)-.5)*w*.75);
      const crackY=y-(.3+rand(s.y+8,i)*.35)*h;
      line([[crackX,crackY-10*S],[crackX-4*S,crackY+3*S],[crackX+2*S,crackY+11*S],[crackX-2*S,crackY+18*S]],'rgba(59,45,37,.65)',(1.1+i*.13)*S);
    }
  }
  ctx.restore();
}
function battlements(x, topY, width, height, count) {
  const step=width/count;
  for(let i=0;i<count;i++){
    if(i%2)continue;
    const xx=x-width/2+i*step;
    polygon([[xx,topY],[xx,topY-height],[xx+step*.75,topY-height],[xx+step*.75,topY]],'#a89f8c','#746a59',.9*S);
    line([[xx+3*S,topY-height+2*S],[xx+step*.65,topY-height+2*S]],'#d2c4a9',.8*S);
  }
}
function drawKeep(s) {
  if(!s.hp){drawRubble(s);return;}
  const {x,y}=pos(s.x,s.y);
  const w=s.width*S,h=s.height*S, bottom=y+h*.58;
  ellipse(x+12*S,bottom+5*S,w*.58,17*S,'#332f29',.3);
  block(x,bottom,w,h,22*S,'#938c7d','#6d6a5e','#bcb39e');
  stoneCourses(s,x,bottom,w,h);
  battlements(x,bottom-h,w,19*S,12);
  // Tall stained windows cast a strict, dark rhythm.
  for(const xx of [-43,0,43]){
    const px=x+xx*S, py=bottom-h*.51;
    polygon([[px-6*S,py+12*S],[px-6*S,py-8*S],[px,py-15*S],[px+6*S,py-8*S],[px+6*S,py+12*S]],'#4f514e','#cec5ae',1.2*S);
    line([[px,py-14*S],[px,py+12*S]],'#837b6b',1.5*S);
  }
  const top=bottom-h-23*S;
  line([[x,top],[x,top-50*S]],'#47382a',3*S);
  const flutter=(flight || reduced.matches) ? 0 : Math.sin(performance.now()*.001)*2*S;
  polygon([[x+1*S,top-49*S],[x+41*S+flutter,top-40*S],[x+29*S+flutter,top-28*S],[x+1*S,top-31*S]],'#a34734','#6a352a',.8*S);
  polygon([[x+9*S,top-45*S],[x+17*S,top-42*S],[x+10*S,top-35*S]],'#eed2a6');
}
function drawWall(s) {
  if(!s.hp){drawRubble(s);return;}
  const {x,y}=pos(s.x,s.y);
  const w=s.width*S,h=s.height*S,bottom=y+h*.52;
  ellipse(x+5*S,bottom+4*S,w*.52,10*S,'#3c382b',.29);
  block(x,bottom,w,h,13*S,'#9b9482','#797466','#b9ae93');
  stoneCourses(s,x,bottom,w,h);
  battlements(x,bottom-h,w,15*S,10);
  for(let i=0;i<3;i++){
    const xx=x+(i-1)*34*S;
    line([[xx,bottom-h*.62],[xx,bottom-h*.43]],'#514d43',3*S);
  }
}
function drawGate(s) {
  if(!s.hp){drawRubble(s);return;}
  const {x,y}=pos(s.x,s.y);
  const w=s.width*S,h=s.height*S,bottom=y+h*.54;
  ellipse(x+5*S,bottom+4*S,w*.55,12*S,'#302d27',.26);
  block(x,bottom,w,h,12*S,'#a39c88','#7a7569','#c0b39a');
  stoneCourses(s,x,bottom,w,h);
  const aw=48*S, ah=58*S;
  ctx.save();ctx.beginPath();ctx.moveTo(x-aw,bottom);ctx.lineTo(x-aw,bottom-ah+aw*.33);ctx.quadraticCurveTo(x,bottom-ah-aw*.82,x+aw,bottom-ah+aw*.33);ctx.lineTo(x+aw,bottom);ctx.closePath();ctx.fillStyle='#454238';ctx.fill();ctx.lineWidth=5*S;ctx.strokeStyle='#b7ab91';ctx.stroke();ctx.clip();
  ctx.fillStyle='#6f5037';ctx.fillRect(x-aw+6*S,bottom-ah,aw*2-12*S,ah);
  for(let i=0;i<6;i++)line([[x-aw+i*16*S,bottom-ah],[x-aw+i*16*S,bottom]],'rgba(45,34,25,.65)',3*S);
  for(let i=0;i<3;i++)line([[x-aw,bottom-ah+12*S+i*16*S],[x+aw,bottom-ah+12*S+i*16*S]],'#3a3530',2*S);
  ctx.restore();
  battlements(x,bottom-h,w,16*S,10);
  polygon([[x-8*S,bottom-h+6*S],[x+8*S,bottom-h+6*S],[x+7*S,bottom-h+29*S],[x,bottom-h+37*S],[x-7*S,bottom-h+29*S]],'#8b4a36','#65412f',1*S);
  line([[x,bottom-h+12*S],[x,bottom-h+29*S]],'#e2c697',2*S);
}
function drawTower(s) {
  if(!s.hp){drawRubble(s);return;}
  const {x,y}=pos(s.x,s.y);
  const w=s.width*S,h=s.height*S,bottom=y+h*.49;
  ellipse(x+7*S,bottom+4*S,w*.58,15*S,'#2c2b25',.36);
  // Octagonal watchtower body: side facets share one north-west light source.
  const tx=x-w*.51,rx=x+w*.51,ty=bottom-h;
  polygon([[tx,ty+12*S],[tx+13*S,ty],[rx-9*S,ty],[rx,ty+12*S],[rx,bottom-12*S],[rx-9*S,bottom],[tx+13*S,bottom],[tx,bottom-12*S]],'#8b8777','#5f5e53',1.2*S);
  polygon([[tx,ty+12*S],[tx+13*S,ty],[tx+13*S,bottom],[tx,bottom-12*S]],'#aaa18b');
  polygon([[rx-9*S,ty],[rx,ty+12*S],[rx,bottom-12*S],[rx-9*S,bottom]],'#6d6b60');
  stoneCourses(s,x,bottom,w-25*S,h-4*S);
  for(let i=0;i<2;i++){
    const yy=bottom-h*(.36+i*.33);
    polygon([[x-4*S,yy+10*S],[x-4*S,yy-9*S],[x,yy-16*S],[x+4*S,yy-9*S],[x+4*S,yy+10*S]],'#484a45','#bbb19a',.8*S);
  }
  polygon([[x-w*.56,ty+4*S],[x-w*.56,ty-10*S],[x-w*.39,ty-10*S],[x-w*.39,ty+4*S],[x-w*.17,ty+4*S],[x-w*.17,ty-13*S],[x+w*.04,ty-13*S],[x+w*.04,ty+4*S],[x+w*.22,ty+4*S],[x+w*.22,ty-10*S],[x+w*.4,ty-10*S],[x+w*.4,ty+4*S],[x+w*.56,ty+4*S],[x+w*.56,ty+18*S],[x-w*.56,ty+18*S]],'#a8a08d','#6b675b',1.3*S);
  ellipse(x,ty+4*S,w*.56,12*S,'#b7ae97',.55);
}
function drawStructures() {
  const keep = findStructure(game,'keep'); drawKeep(keep);
  drawWall(findStructure(game,'wall-left')); drawWall(findStructure(game,'wall-right'));
  drawGate(findStructure(game,'gate'));
  drawTower(findStructure(game,'tower-left')); drawTower(findStructure(game,'tower-right'));
}
function drawTrebuchet() {
  const x=catapultX(),y=catY;
  ellipse(x+10*S,y+13*S,123*S,22*S,'#2c2c20',.25);
  // Wheels with concentric timber rims and four spokes.
  for(const wx of [x-65*S,x+59*S]){
    ellipse(wx,y-1*S,31*S,31*S,'#3c2e22');
    ellipse(wx,y-1*S,25*S,25*S,'#785538');
    ctx.beginPath();ctx.ellipse(wx,y-1*S,20*S,20*S,0,0,Math.PI*2);ctx.strokeStyle='#a47b4c';ctx.lineWidth=3*S;ctx.stroke();
    for(let i=0;i<8;i++){const a=i*Math.PI/4;line([[wx,y-1*S],[wx+Math.cos(a)*22*S,y-1*S+Math.sin(a)*22*S]],'#3f3024',3.4*S);}
    ellipse(wx,y-1*S,6*S,6*S,'#d5a465');
  }
  polygon([[x-106*S,y-19*S],[x+92*S,y-19*S],[x+90*S,y-34*S],[x-99*S,y-35*S]],'#704c2f','#382b20',2*S);
  // Triangular timber A-frames and pinned crossbrace.
  for(const side of [-1,1]){
    const ox=side*23*S;
    line([[x-77*S+ox,y-28*S],[x+ox,y-133*S],[x+83*S+ox,y-28*S]],'#412d21',17*S);
    line([[x-77*S+ox,y-28*S],[x+ox,y-133*S],[x+83*S+ox,y-28*S]],'#986b43',12*S);
  }
  line([[x-50*S,y-68*S],[x+47*S,y-68*S]],'#453321',13*S);
  line([[x-50*S,y-68*S],[x+47*S,y-68*S]],'#a47a51',8*S);
  const recoil = flight ? Math.sin(Math.min(1,flight.t)*Math.PI)*.45 : 0;
  const armX=x+16*S, armY=y-128*S;
  ctx.save();ctx.translate(armX,armY);ctx.rotate(-.39+recoil);
  line([[-19*S,59*S],[22*S,-128*S]],'#3d2b20',18*S);
  line([[-19*S,59*S],[22*S,-128*S]],'#aa7b4e',13*S);
  polygon([[16*S,-130*S],[33*S,-130*S],[35*S,-115*S],[11*S,-115*S]],'#6d4a34','#3f2d21',1*S);
  line([[25*S,-128*S],[25*S,-158*S]],'#5e4b33',2.2*S);
  ellipse(25*S,-159*S,14*S,8*S,'#584333');
  ctx.restore();
  ellipse(armX,armY,12*S,12*S,'#513b29'); ellipse(armX,armY,6*S,6*S,'#ba915a');
  // A side counterweight, dark iron with four polished bolts.
  polygon([[x-5*S,y-42*S],[x+32*S,y-42*S],[x+42*S,y-13*S],[x-14*S,y-13*S]],'#60513f','#3c3026',1.7*S);
  for(const dx of [-1,1])ellipse(x+13*S+dx*17*S,y-27*S,2*S,2*S,'#b6a079');
}
function drawAim(t) {
  if(game.phase!=='playing' || mode!=='playing')return;
  const p=pos(aim.x,aim.y);
  const wind=currentWind(game), impactX=p.x+wind*24*S;
  const origin=shotOrigin();
  // Arcing range marks lead naturally from the catapult to the strike point.
  ctx.save();ctx.globalAlpha=.62;ctx.beginPath();ctx.moveTo(origin.x,origin.y);
  ctx.quadraticCurveTo((origin.x+p.x)/2,(origin.y+p.y)/2-195*S,p.x,p.y);
  ctx.strokeStyle='#6b5031';ctx.lineWidth=Math.max(1,1.6*S);ctx.setLineDash([3*S,8*S]);ctx.stroke();ctx.setLineDash([]);ctx.restore();
  const ring = aim.drag && !reduced.matches ? 2*S : 0;
  ctx.save();ctx.translate(p.x,p.y);ctx.strokeStyle='#f4dfab';ctx.lineWidth=3*S;ctx.beginPath();ctx.arc(0,0,24*S+ring,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#674229';ctx.lineWidth=2*S;ctx.beginPath();ctx.arc(0,0,24*S+ring,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<4;i++){const a=i*Math.PI/2;line([[Math.cos(a)*30*S,Math.sin(a)*30*S],[Math.cos(a)*39*S,Math.sin(a)*39*S]],'#674229',2*S);}
  ellipse(0,0,3*S,3*S,'#633e29');ctx.restore();
  if(wind){
    line([[p.x,p.y+35*S],[impactX,p.y+35*S]],'#81563a',1.4*S,[4*S,3*S]);
    ctx.beginPath();ctx.arc(impactX,p.y,11*S,0,Math.PI*2);ctx.strokeStyle='#ae513d';ctx.lineWidth=2*S;ctx.stroke();
    line([[impactX-6*S,p.y],[impactX+6*S,p.y]],'#a44633',1.2*S);
  }
  const target = game.structures.filter(s=>s.hp>0).sort((a,b)=>Math.hypot(a.x-aim.x,a.y-aim.y)-Math.hypot(b.x-aim.x,b.y-aim.y))[0];
  if(target && Math.hypot(target.x-aim.x,target.y-aim.y)<target.radius+12){
    const name={gate:'ВРАТА',keep:'ДОНЖОН',tower:'БАШНЯ',wall:'СТЕНА'}[target.kind];
    const shield = target.kind==='keep' && findStructure(game,'gate').hp>0 && selected!=='bolt';
    const text=shield ? 'ЗАЩИЩЁН ВРАТАМИ' : `${name}  ${target.hp}/${target.maxHp}`;
    ctx.font=`700 ${11*Math.max(.8,S)}px system-ui`;
    const width=ctx.measureText(text).width+20*S;
    const labelY=p.y-48*S;
    ctx.fillStyle='#4c3e2e';ctx.fillRect(clamp(p.x-width/2,8,W-width-8),labelY-15*S,width,24*S);
    ctx.fillStyle='#f2e2bd';ctx.textBaseline='middle';ctx.fillText(text,clamp(p.x-width/2,8,W-width-8)+10*S,labelY-3*S);
  }
}
function drawProjectile() {
  if(!flight)return;
  const t=clamp(flight.t,0,1);
  const a=shotOrigin(),b=pos(flight.hitX,flight.hitY);
  const x=lerp(a.x,b.x,t),groundY=lerp(a.y,b.y,t);
  const y=groundY-Math.sin(Math.PI*t)*190*S;
  ellipse(x+5*S,groundY,13*S*(1+t*.3),4*S,'#342f24',.28);
  ctx.save();ctx.translate(x,y);ctx.rotate(t*8);
  if(flight.type==='stone'){
    polygon([[-13*S,-7*S],[-5*S,-15*S],[11*S,-10*S],[16*S,5*S],[5*S,14*S],[-10*S,12*S]],'#8d8e83','#575a55',1.2*S);
    line([[-5*S,-9*S],[5*S,-11*S],[13*S,1*S]],'#c1bcac',1.5*S);
  } else if(flight.type==='fire'){
    ellipse(0,0,13*S,13*S,'#b06a43');line([[-8*S,-9*S],[8*S,-9*S]],'#694832',2*S);
    ellipse(-6*S,-8*S,7*S,9*S,'#dfaa5b');
  } else {
    line([[-19*S,0],[17*S,0]],'#5e625f',6*S);
    polygon([[20*S,0],[9*S,-9*S],[9*S,9*S]],'#b4b2a4','#525753',1.3*S);
  }
  ctx.restore();
}
function spawnDebris(x,y,type,hits) {
  const p=pos(x,y), count=reduced.matches?8:(hits.length?30:12);
  for(let i=0;i<count;i++){
    const a=(i*2.39996)+rand(8,i);
    const speed=(75+rand(14,i)*220)*S;
    particles.push({x:p.x,y:p.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-110*S,life:.85+rand(7,i)*.65,age:0,size:(2+rand(22,i)*6)*S,color:type==='fire'?['#b65e34','#d8a253','#55473a'][i%3]:['#7d7667','#aaa28b','#615948'][i%3]});
  }
  if(particles.length>100)particles.splice(0,particles.length-100);
}
function drawParticles() {
  for(const p of particles){
    const alpha=1-p.age/p.life;
    ctx.save();ctx.globalAlpha=Math.max(0,alpha);ctx.translate(p.x,p.y);
    ctx.rotate(p.age*4);
    ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.7);ctx.restore();
  }
}
function render(now) {
  ctx.save();
  if(shake>0 && !reduced.matches) {
    const amount=shake*S;
    ctx.translate(Math.sin(now*.047)*amount,Math.cos(now*.065)*amount*.55);
  }
  drawBackground();drawSurroundings();drawStructures();drawTrebuchet();
  if(mode==='playing')drawAim(now);
  drawProjectile();drawParticles();
  ctx.restore();
}
function tick(now) {
  const dt=lastFrame ? clamp((now-lastFrame)/1000,0,.06) : 0;
  lastFrame=now;
  if(!document.hidden && mode!=='menu') {
    if(flight && mode==='playing'){
      flight.t+=dt/(reduced.matches?.32:.92);
      if(flight.t>=1)finishShot();
    }
    if(shake>0)shake=Math.max(0,shake-dt*18);
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=300*S*dt;if(p.age>p.life)particles.splice(i,1);}
  }
  render(now);
  requestAnimationFrame(tick);
}

function fire() {
  if(mode!=='playing'||flight||game.phase!=='playing')return;
  if(!game.ammo[selected]){setMessage('Снаряды закончились');return;}
  const type=selected;
  const r=resolveShot(game,type,aim.x,aim.y);
  if(!r.ok){setMessage(r.reason);return;}
  flight={t:0,type,hitX:r.x,hitY:r.y,result:r};
  ui.fire.disabled=true;
  ui.fire.querySelector('.fire-button__text').textContent='В ПОЛЁТЕ';
  sound('press');vibrate(10);
  ui.note.classList.add('fade');touched=true;
}
function finishShot() {
  if(!flight)return;
  const {result:r,type}=flight;
  game=r.state;
  spawnDebris(r.x,r.y,type,r.hits);
  shake=r.hits.length?8:2;
  flight=null;
  sound('impact');vibrate(r.hits.length?[15,30,20]:10);
  ui.fire.querySelector('.fire-button__text').textContent='ВЫСТРЕЛ';
  if(r.hits.some(h=>h.id==='keep'&&h.destroyed)) setMessage('ДОНЖОН РАЗРУШЕН');
  else if(r.hits.some(h=>h.id==='gate'&&h.destroyed))setMessage('ВРАТА РАЗБИТЫ');
  else if(r.hits.some(h=>h.destroyed))setMessage('УКРЕПЛЕНИЕ РУХНУЛО');
  else if(r.hits.length)setMessage(`ПОПАДАНИЕ · ${r.hits.reduce((n,h)=>n+h.damage,0)}`);
  else if(r.shielded)setMessage('ДОНЖОН ЗАЩИЩЁН ВРАТАМИ');
  else setMessage('МИМО');
  if(game.phase==='won'){
    unlocked=Math.max(unlocked,Math.min(LEVELS.length-1,game.level+1));
    const remain=shotsLeft(game);
    if(best[game.level]===null || remain>best[game.level])best[game.level]=remain;
    countdown=performance.now()+700;
  } else if(game.phase==='lost')countdown=performance.now()+700;
  save();syncUI();
  if(game.phase!=='playing')setTimeout(showResult,reduced.matches?80:730);
}
function showResult(){
  if(game.phase==='playing'||mode==='menu')return;
  mode='result';
  const win=game.phase==='won';
  $('result-kicker').textContent=win?'КРЕПОСТЬ ПАЛА':'ПОРОХ ИСЧЕРПАН';
  $('result-title').textContent=win?(game.level===2?'Все цитадели пали':'Пролом!'):'Осада не удалась';
  $('result-text').textContent=win?game.level===2?'Три крепости взяты. Кампания завершена.':'Каменная стена повержена. Следующее укрепление ждёт.':'Боеприпасы закончились, донжон ещё стоит. Попробуй иной порядок ударов.';
  $('result-stock').textContent=shotsLeft(game);
  ui.next.hidden=!win;
  ui.next.innerHTML=game.level===2?'НОВАЯ КАМПАНИЯ <span aria-hidden="true">→</span>':'СЛЕДУЮЩАЯ КРЕПОСТЬ <span aria-hidden="true">→</span>';
  ui.result.hidden=false;
  ui.fire.disabled=true;
  if(win){sound('victory');vibrate([20,30,20]);}
  ui.next.focus();
}
function startLevel(index){
  game=createLevel(index);selected='stone';aim={x:0,y:-30,drag:false};flight=null;particles.length=0;shake=0;
  mode='playing';ui.intro.hidden=true;ui.result.hidden=true;ui.menu.hidden=true;ui.confirm.hidden=true;
  ui.note.classList.remove('fade');touched=false;save();syncUI();
}
function begin(){
  mode='playing';ui.intro.hidden=true;ui.menu.hidden=true;ui.result.hidden=true;
  ui.note.classList.toggle('fade',game.turn>0);
  syncUI();sound('press');
}
function openMenu(){
  if(mode==='menu')return;
  modeBeforeMenu=mode;
  focusRestore=document.activeElement;
  mode='menu';ui.menu.hidden=false;ui.confirm.hidden=true;
  const list=$('level-list');list.replaceChildren();
  for(let i=0;i<LEVELS.length;i++){
    const btn=document.createElement('button');btn.type='button';btn.className='level-choice'+(i===game.level?' current':'');
    btn.disabled=i>unlocked;
    const seal=document.createElement('span');seal.className='seal';seal.textContent=i>unlocked?'×':String(i+1);
    const label=document.createElement('span');const name=document.createElement('strong');name.textContent=LEVELS[i].name;
    const small=document.createElement('small');small.textContent=i>unlocked?'Закрыта':best[i]!==null?`Рекорд · ${best[i]} зарядов в запасе`:i===game.level?'Текущая осада':'Играть';
    label.append(name,small);btn.append(seal,label);
    btn.addEventListener('click',()=>{if(i===game.level){closeMenu();return;}startLevel(i);sound('press');});
    list.append(btn);
  }
  syncUI();ui.closeMenu.focus();
}
function closeMenu(){
  ui.menu.hidden=true;ui.confirm.hidden=true;
  mode=modeBeforeMenu;
  if(mode==='result' || (mode==='playing' && game.phase!=='playing'))showResult();
  syncUI();focusRestore?.focus?.();
}
function resetSave(){
  unlocked=0;best=[null,null,null];try{localStorage.removeItem(SAVE_KEY);}catch{}
  startLevel(0);sound('press');setMessage('ПОХОД НАЧАТ ЗАНОВО');
}
function changeAim(pointX,pointY){
  aim.x=clamp((pointX-cx)/S,-340,340);
  aim.y=clamp((pointY-baseY)/S,-264,29);
  if(!touched){touched=true;ui.note.classList.add('fade');}
}
function localPointer(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
canvas.addEventListener('pointerdown',e=>{
  if(mode!=='playing'||flight||game.phase!=='playing'||(e.pointerType==='mouse'&&e.button!==0))return;
  pointerId=e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  aim.drag=true;
  const p=localPointer(e);changeAim(p.x,p.y);
  sound('press');
});
canvas.addEventListener('pointermove',e=>{if(aim.drag&&pointerId===e.pointerId){const p=localPointer(e);changeAim(p.x,p.y);}});
function stopPointer(e){if(pointerId!==e.pointerId)return;pointerId=null;aim.drag=false;try{canvas.releasePointerCapture(e.pointerId);}catch{}}
canvas.addEventListener('pointerup',stopPointer);canvas.addEventListener('pointercancel',stopPointer);canvas.addEventListener('lostpointercapture',()=>{pointerId=null;aim.drag=false;});
ui.fire.addEventListener('click',fire);
for(const btn of document.querySelectorAll('[data-ammo]'))btn.addEventListener('click',()=>{if(mode!=='playing'||flight)return;const id=btn.dataset.ammo;if(game.ammo[id]>0){selected=id;syncUI();save();sound('press');setMessage(AMMO[id].description.toUpperCase(), 1050);}});
ui.begin.addEventListener('click',begin);
ui.sound.addEventListener('click',()=>{soundOn=!soundOn;save();syncUI();if(soundOn)sound('press');});
ui.menuButton.addEventListener('click',openMenu);
ui.closeMenu.addEventListener('click',closeMenu);
ui.next.addEventListener('click',()=>{startLevel(game.level===LEVELS.length-1?0:game.level+1);sound('press');});
ui.again.addEventListener('click',()=>{startLevel(game.level);sound('press');});
$('reset').addEventListener('click',()=>{ui.confirm.hidden=false;$('cancel-reset').focus();});
$('cancel-reset').addEventListener('click',()=>{ui.confirm.hidden=true;ui.closeMenu.focus();});
$('confirm-reset').addEventListener('click',resetSave);
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(!ui.confirm.hidden){ui.confirm.hidden=true;ui.closeMenu.focus();}
    else if(mode==='menu')closeMenu();
    else if(mode==='playing')openMenu();
    return;
  }
  if(mode==='intro'&&e.key==='Enter'){e.preventDefault();begin();return;}
  if(mode!=='playing'||e.target instanceof HTMLButtonElement||e.target instanceof HTMLAnchorElement)return;
  if(['1','2','3'].includes(e.key)){
    const id=['stone','fire','bolt'][Number(e.key)-1];if(game.ammo[id]){selected=id;syncUI();}return;
  }
  const step=e.shiftKey?24:12;
  if(e.key==='ArrowLeft')aim.x=clamp(aim.x-step,-340,340);
  else if(e.key==='ArrowRight')aim.x=clamp(aim.x+step,-340,340);
  else if(e.key==='ArrowUp')aim.y=clamp(aim.y-step,-264,29);
  else if(e.key==='ArrowDown')aim.y=clamp(aim.y+step,-264,29);
  else if(e.code==='Space'){e.preventDefault();fire();return;}
  else return;
  e.preventDefault();ui.note.classList.add('fade');touched=true;
});
window.addEventListener('resize',resize,{passive:true});
document.addEventListener('visibilitychange',()=>{lastFrame=0;});
resize();syncUI();requestAnimationFrame(tick);