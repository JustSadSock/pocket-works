import {PocketSocket as WebSocket} from './network.js';
const WS_URL='';const DEFAULT_ROOM='';
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connect');
const roomInput = document.getElementById('room');
const nameInput = document.getElementById('name');
const modeSelect = document.getElementById('mode');

let ws = null;
let playerId = null;
let world = { players: [], map: null };
let lastSend = performance.now();
let seq = 0;

const inputState = {
  keys: {},
  lmb: false,
  rmb: false,
  dash: false,
  ghostToggle: false,
  mouseAngle: 0
};

function connect() {
  if (ws) ws.close();
  ws = new WebSocket(WS_URL);
  statusEl.textContent = 'Connecting...';

  ws.addEventListener('open', () => {
    statusEl.textContent = 'Connected';
    ws.send(JSON.stringify({
      type: 'join',
      roomCode: roomInput.value || DEFAULT_ROOM,
      name: nameInput.value || 'Ronin',
      mode: modeSelect.value
    }));
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'room') {
      playerId = msg.data.playerId;
      roomInput.value=msg.data.roomCode;
      if (msg.data.map) world.map = msg.data.map;
      statusEl.textContent = `Room ${msg.data.roomCode} / you ${playerId}`;
    }
    if (msg.type === 'state') {
      world = msg.data;
      statusEl.textContent=world.phase==='round-end'?'Раунд завершён · новая дуэль через мгновение':world.phase==='lobby'?'Ждём второго бойца · код '+(roomInput.value||'в комнате'):('Дуэль · '+world.mode);
    }
    if (msg.type === 'event') {
      // future: add flashy feedback
    }
  });

  ws.addEventListener('close', () => {
    statusEl.textContent = 'Disconnected';
  });
}

connectBtn.addEventListener('click',()=>{globalThis.katanaCreate=false;connect();});
document.querySelector('#create').onclick=()=>{globalThis.katanaCreate=true;connect();};

window.addEventListener('keydown', (e) => {
  if (['w', 'a', 's', 'd'].includes(e.key)) inputState.keys[e.key] = true;
  if (e.code === 'Space' || e.code === 'ShiftLeft'){inputState.dash=true;e.preventDefault();}
  if (e.code === 'KeyE') inputState.ghostToggle = true;
});
window.addEventListener('keyup', (e) => {
  if (['w', 'a', 's', 'd'].includes(e.key)) inputState.keys[e.key] = false;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) inputState.lmb = true;
  if (e.button === 2) inputState.rmb = true;
});
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) inputState.lmb = false;
  if (e.button === 2) inputState.rmb = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/32,r.height/20),p=world.players.find(p=>p.id===playerId);inputState.mouseAngle=Math.atan2((e.clientY-r.top-r.height/2)/scale-(p?.state.y||0),(e.clientX-r.left-r.width/2)/scale-(p?.state.x||0));});

function sendInput(force=false) {
  if(document.hidden&&!force)return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  const dt = now - lastSend;
  lastSend = now;
  ws.send(JSON.stringify({
    type: 'input',
    payload: {
      seq: ++seq,
      dt,
      keys: inputState.keys,
      mouseAngle: inputState.mouseAngle,
      lmb: inputState.lmb,
      rmb: inputState.rmb,
      dash: inputState.dash,
      ghostToggle: inputState.ghostToggle
    }
  }));
  inputState.dash = false;
  inputState.ghostToggle = false;
}

function draw() {
  ctx.fillStyle='#14191d';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  const scale=Math.min(canvas.width/32,canvas.height/20);ctx.scale(scale,scale);

  drawMap();
  drawPlayers();

  ctx.restore();
  requestAnimationFrame(draw);
}

function drawMap() {
  if (!world.map || !world.map.walls) return;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  world.map.walls.forEach((wall) => {
    ctx.fillRect(wall.x - wall.w / 2, wall.y - wall.h / 2, wall.w, wall.h);
  });
}

function drawPlayers() {
  world.players.forEach((p) => {
    if (p.ghostActor && p.ghostActor.alive) {
      ctx.save();
      ctx.translate(p.ghostActor.state.x, p.ghostActor.state.y);
      ctx.rotate(p.ghostActor.state.facing);
      ctx.fillStyle = 'rgba(56,189,248,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha=p.alive?1:.2;
    ctx.translate(p.state.x, p.state.y);
    ctx.rotate(p.state.facing);
    ctx.fillStyle = p.id === playerId ? '#22d3ee' : '#f472b6';
    ctx.beginPath();
    ctx.arc(0, 0, 0.45, 0, Math.PI * 2);
    ctx.fill();

    if (p.state.attacking) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, 0.7 + Math.min(0.5, (p.state.attackPower || 0) / 2000), -0.7, 0.7);
      ctx.stroke();
    }

    if (p.state.shieldUp) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.arc(0, 0, 0.6, Math.PI * -0.3, Math.PI * 0.3);
      ctx.stroke();
    }

    ctx.restore();

    if (p.ghostInput) {
      ctx.save();
      ctx.translate(p.state.x - Math.cos(p.state.facing) * 0.6, p.state.y - Math.sin(p.state.facing) * 0.6);
      ctx.fillStyle = 'rgba(56,189,248,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

setInterval(sendInput, 1000 / 30);
requestAnimationFrame(draw);

function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
new ResizeObserver(resize).observe(canvas);resize();
for(const button of document.querySelectorAll('[data-key],[data-combat]')){
 const set=value=>{if(value && button.dataset.combat){const me=world.players.find(p=>p.id===playerId),enemy=world.players.find(p=>p.id!==playerId&&p.alive);if(me&&enemy)inputState.mouseAngle=Math.atan2(enemy.state.y-me.state.y,enemy.state.x-me.state.x);}if(button.dataset.key)inputState.keys[button.dataset.key]=value;else inputState[button.dataset.combat]=value;};
 button.onpointerdown=e=>{button.setPointerCapture(e.pointerId);set(true);e.preventDefault();};button.onpointerup=()=>set(false);button.onpointercancel=()=>set(false);button.onlostpointercapture=()=>set(false);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){inputState.keys={};inputState.lmb=false;inputState.rmb=false;sendInput(true);}});
window.render_game_to_text=()=>JSON.stringify({coordinates:'world centered; x right, y down',phase:world.phase,mode:world.mode,playerId,map:world.map,players:world.players.map(p=>({id:p.id,alive:p.alive,state:p.state,ghostMode:p.ghostMode,ghostActor:p.ghostActor,ghost:{cooldown:p.ghost?.cooldown,energy:p.ghost?.energy,active:p.ghost?.active}}))});
window.advanceTime=async ms=>{await new Promise(r=>setTimeout(r,Math.min(ms,1000)));};
try{const saved=JSON.parse(sessionStorage.getItem('pocket-works:katana-echo:pocket-net:'+location.origin+'/pocketnet')||'null');if(saved?.roomId){roomInput.value=saved.roomId.slice(0,8).toUpperCase();globalThis.katanaCreate=false;connect();}}catch{}


