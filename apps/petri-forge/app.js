import {installMobileRuntime} from '../../shared/mobile-runtime.js';
installMobileRuntime();

/* ===================== Environment (pure JS) ===================== */
const GRID_W=30, GRID_H=20, TILE_SIZE=24;
const TILE = { EMPTY:0, WALL:1, GOAL:2, HAZARD:3, REWARD:4 };
const COLORS = {
  [TILE.EMPTY]:"#18181f",
  [TILE.WALL]:"#3a3a46",
  [TILE.GOAL]:"#47b66b",
  [TILE.HAZARD]:"#b84a4a",
  [TILE.REWARD]:"#c8aa3c",
};
class Env {
  constructor(w,h, rules={}) {
    this.w=w; this.h=h;
    this.grid = Array.from({length:h},()=>Array.from({length:w},()=>TILE.EMPTY));
    this.ax=1; this.ay=1; this.gx=w-2; this.gy=h-2;
    this.steps=0; this.done=false; this.totalReward=0;
    this.rules=Object.assign({
      blocked:[TILE.WALL], maxSteps:1000, stepPenalty:-0.01,
      hazardPunish:-0.5, goalReward:1.0
    }, rules);
  }
  reset(spawn=[1,1], goal=[GRID_W-2,GRID_H-2]){
    this.ax=spawn[0]; this.ay=spawn[1];
    this.gx=goal[0]; this.gy=goal[1];
    this.steps=0; this.done=false; this.totalReward=0;
    return this.observe();
  }
  inBounds(x,y){ return x>=0&&y>=0&&x<this.w&&y<this.h; }
  passable(x,y){ return this.inBounds(x,y) && !this.rules.blocked.includes(this.grid[y][x]); }
  step(a){
    if(this.done) return [this.observe(),0,true,{}];
    const dir = {UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0],STAY:[0,0]};
    const [dx,dy]=dir[a];
    const nx=this.ax+dx, ny=this.ay+dy;
    if(this.passable(nx,ny)){ this.ax=nx; this.ay=ny; }

    let r=this.rules.stepPenalty;
    const t=this.grid[this.ay][this.ax];
    if(t===TILE.HAZARD) r+=this.rules.hazardPunish;
    if(t===TILE.REWARD){ r+=0.2; this.grid[this.ay][this.ax]=TILE.EMPTY; }
    if(this.ax===this.gx && this.ay===this.gy){ r+=this.rules.goalReward; this.done=true; }

    this.steps++; if(this.steps>=this.rules.maxSteps) this.done=true;
    this.totalReward += r;
    return [this.observe(), r, this.done, {}];
  }
  observe(){
    const rad=3, tiles=[];
    for(let dy=-rad; dy<=rad; dy++){
      const row=[];
      for(let dx=-rad; dx<=rad; dx++){
        const x=this.ax+dx, y=this.ay+dy;
        row.push(this.inBounds(x,y) ? this.grid[y][x] : TILE.WALL);
      }
      tiles.push(row);
    }
    return { tiles, goalVec:[this.gx-this.ax, this.gy-this.ay], pos:[this.ax,this.ay] };
  }
}

/* ===================== UI wiring ===================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const stepsEl = document.getElementById('steps');
const trewEl  = document.getElementById('trew');
const statusEl= document.getElementById('status');
const playBtn = document.getElementById('playPause');
const stepBtn = document.getElementById('step');
const resetBtn= document.getElementById('reset');
const saveBtn = document.getElementById('save');
const loadBtn = document.getElementById('load');
const tileSelect = document.getElementById('tileSelect');
const toolSelect = document.getElementById('toolSelect');
const zoomSel = document.getElementById('zoomSel');
const agentSelect= document.getElementById('agentSelect');
const mini = document.getElementById('mini');
const mctx = mini.getContext('2d');
const ctxMenu = document.getElementById('ctxmenu');

const env = new Env(GRID_W, GRID_H);
let spawn=[1,1], goal=[GRID_W-2,GRID_H-2];
env.reset(spawn,goal);

// drawing state & history
let tool='brush';
let drawing=false;
let startX=0,startY=0;
let undoStack=[], redoStack=[];
let view={x:0,y:0,scale:1};
let panStart=null;
toolSelect.onchange = ()=>{ tool = toolSelect.value; };
zoomSel.onchange = ()=>{ view.scale=parseFloat(zoomSel.value); redraw(); };

function setTile(x,y,val){
  if(x<0||y<0||x>=GRID_W||y>=GRID_H) return;
  const old=env.grid[y][x];
  if(old===val) return;
  env.grid[y][x]=val;
  undoStack.push({x,y,old,val});
  redoStack.length=0;
}

function floodFill(x,y,target,repl){
  if(target===repl) return;
  const stack=[[x,y]]; const seen=new Set();
  while(stack.length){
    const [cx,cy]=stack.pop();
    const key=cx+','+cy;
    if(seen.has(key)) continue;
    seen.add(key);
    if(cx<0||cy<0||cx>=GRID_W||cy>=GRID_H) continue;
    if(env.grid[cy][cx]!==target) continue;
    setTile(cx,cy,repl);
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
}

function undo(){
  const op=undoStack.pop();
  if(!op) return;
  env.grid[op.y][op.x]=op.old;
  redoStack.push(op);
  redraw();
}
function redo(){
  const op=redoStack.pop();
  if(!op) return;
  env.grid[op.y][op.x]=op.val;
  undoStack.push(op);
  redraw();
}

function mouseToTile(e){
  const rect=cv.getBoundingClientRect();
  const x=(((e.clientX-rect.left)*cv.width/rect.width)-view.x)/(TILE_SIZE*view.scale);
  const y=(((e.clientY-rect.top)*cv.height/rect.height)-view.y)/(TILE_SIZE*view.scale);
  return {x:Math.max(0,Math.min(GRID_W-1,Math.floor(x))),y:Math.max(0,Math.min(GRID_H-1,Math.floor(y)))};
}

function drawShape(x0,y0,x1,y1){
  const val = (tool==='eraser')?TILE.EMPTY:parseInt(tileSelect.value,10);
  if(tool==='rect'){
    const minX=Math.min(x0,x1), maxX=Math.max(x0,x1);
    const minY=Math.min(y0,y1), maxY=Math.max(y0,y1);
    for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) setTile(x,y,val);
  } else if(tool==='line'){
    let dx=Math.abs(x1-x0), dy=Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1, err=dx-dy;
    let x=x0,y=y0;
    while(true){ setTile(x,y,val); if(x===x1 && y===y1) break; const e2=2*err; if(e2>-dy){err-=dy;x+=sx;} if(e2<dx){err+=dx;y+=sy;} }
  }
  redraw();
}

function generateNoise(){
  for(let y=0;y<GRID_H;y++) for(let x=0;x<GRID_W;x++)
    setTile(x,y, Math.random()<0.2 ? TILE.WALL : TILE.EMPTY);
  redraw();
}

function generateMaze(){
  for(let y=0;y<GRID_H;y++) for(let x=0;x<GRID_W;x++) setTile(x,y,TILE.WALL);
  function carve(x,y){
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]].sort(()=>Math.random()-0.5);
    for(const [dx,dy] of dirs){
      const nx=x+dx*2, ny=y+dy*2;
      if(nx>0&&ny>0&&nx<GRID_W-1&&ny<GRID_H-1&&env.grid[ny][nx]===TILE.WALL){
        setTile(x+dx,y+dy,TILE.EMPTY);
        setTile(nx,ny,TILE.EMPTY);
        carve(nx,ny);
      }
    }
  }
  setTile(1,1,TILE.EMPTY); carve(1,1); redraw();
}

function generateRooms(){
  for(let y=0;y<GRID_H;y++) for(let x=0;x<GRID_W;x++) setTile(x,y,TILE.WALL);
  const rooms=[];
  for(let i=0;i<5;i++){
    const w=3+Math.floor(Math.random()*6), h=3+Math.floor(Math.random()*6);
    const x=1+Math.floor(Math.random()*(GRID_W-w-1));
    const y=1+Math.floor(Math.random()*(GRID_H-h-1));
    rooms.push({x,y,w,h});
    for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) setTile(xx,yy,TILE.EMPTY);
  }
  for(let i=1;i<rooms.length;i++){
    const a=rooms[i-1], b=rooms[i];
    for(let x=Math.min(a.x+b.w/2,b.x+b.w/2); x<=Math.max(a.x+a.w/2,b.x+b.w/2); x++) setTile(Math.floor(x), Math.floor(a.y+a.h/2), TILE.EMPTY);
    for(let y=Math.min(a.y+a.h/2,b.y+b.h/2); y<=Math.max(a.y+a.h/2,b.y+b.h/2); y++) setTile(Math.floor(b.x+b.w/2), Math.floor(y), TILE.EMPTY);
  }
  redraw();
}

function generateIsland(){
  const cx=GRID_W/2, cy=GRID_H/2, maxR=Math.min(cx,cy)-2;
  for(let y=0;y<GRID_H;y++){
    for(let x=0;x<GRID_W;x++){
      const d=Math.hypot(x-cx,y-cy)+Math.random()*2;
      setTile(x,y, d<maxR ? TILE.EMPTY : TILE.WALL);
    }
  }
  redraw();
}

let ctxTile={x:0,y:0};
function handleCtx(i){
  switch(i){
    case 0: spawn=[ctxTile.x,ctxTile.y]; env.reset(spawn,goal); break;
    case 1: goal=[ctxTile.x,ctxTile.y]; env.reset(spawn,goal); break;
    case 2: setTile(ctxTile.x,ctxTile.y,TILE.EMPTY); break;
    case 3: generateNoise(); break;
    case 4: generateMaze(); break;
    case 5: generateRooms(); break;
    case 6: generateIsland(); break;
  }
  redraw();
}

function redraw(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.setTransform(view.scale,0,0,view.scale,view.x,view.y);
  for(let y=0;y<GRID_H;y++){
    for(let x=0;x<GRID_W;x++){
      ctx.fillStyle = COLORS[env.grid[y][x]];
      ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE-1, TILE_SIZE-1);
    }
  }
  ctx.fillStyle = "#4fd18a";
  ctx.fillRect(env.gx*TILE_SIZE, env.gy*TILE_SIZE, TILE_SIZE-1, TILE_SIZE-1);
  ctx.fillStyle = "#4f90d1";
  ctx.fillRect(spawn[0]*TILE_SIZE+8, spawn[1]*TILE_SIZE+8, TILE_SIZE-16, TILE_SIZE-16);
  ctx.fillStyle = "#7fb0ff";
  ctx.fillRect(env.ax*TILE_SIZE+4, env.ay*TILE_SIZE+4, TILE_SIZE-8, TILE_SIZE-8);
  ctx.setTransform(1,0,0,1,0,0);
  stepsEl.textContent = String(env.steps);
  trewEl.textContent = env.totalReward.toFixed(2);
  const ms=mini.width/GRID_W;
  mctx.clearRect(0,0,mini.width,mini.height);
  for(let y=0;y<GRID_H;y++){
    for(let x=0;x<GRID_W;x++){
      mctx.fillStyle=COLORS[env.grid[y][x]];
      mctx.fillRect(x*ms,y*ms,ms,ms);
    }
  }
  mctx.strokeStyle='#fff';
  const vx=-view.x/(TILE_SIZE*view.scale)*ms;
  const vy=-view.y/(TILE_SIZE*view.scale)*ms;
  const vw=cv.width/(TILE_SIZE*view.scale)*ms;
  const vh=cv.height/(TILE_SIZE*view.scale)*ms;
  mctx.strokeRect(vx,vy,vw,vh);
}
redraw();

let dragSpawn=false, dragGoal=false;
cv.addEventListener('pointerdown', e=>{
  if(e.button===1){
    panStart={x:e.clientX,y:e.clientY,ox:view.x,oy:view.y};
    e.preventDefault();
    return;
  }
  if(e.button!==0) return;
  cv.setPointerCapture(e.pointerId);
  const t=mouseToTile(e);
  if(t.x===spawn[0] && t.y===spawn[1]){ dragSpawn=true; return; }
  if(t.x===goal[0] && t.y===goal[1]){ dragGoal=true; return; }
  drawing=true;
  startX=t.x; startY=t.y;
  paint(e);
});
cv.addEventListener('pointermove', e=>{
  if(panStart){
    view.x = panStart.ox + (e.clientX-panStart.x);
    view.y = panStart.oy + (e.clientY-panStart.y);
    redraw();
    return;
  }
  const t=mouseToTile(e);
  if(dragSpawn){
    spawn=[t.x,t.y];
    env.ax=t.x; env.ay=t.y;
    redraw();
    return;
  }
  if(dragGoal){
    goal=[t.x,t.y];
    env.gx=t.x; env.gy=t.y;
    redraw();
    return;
  }
  if(drawing && (tool==='brush'||tool==='eraser')) paint(e);
});
window.addEventListener('pointerup', e=>{
  if(e.button===1){ panStart=null; return; }
  if(e.button!==0) return;
  if(drawing && (tool==='rect'||tool==='line')){
    const t=mouseToTile(e);
    drawShape(startX,startY,t.x,t.y);
  }
  drawing=false;
  dragSpawn=false; dragGoal=false;
});

cv.addEventListener('contextmenu', e=>{
  e.preventDefault();
  const t=mouseToTile(e);
  ctxTile=t;
  ctxMenu.style.left=e.clientX+'px';
  ctxMenu.style.top=e.clientY+'px';
  ctxMenu.innerHTML='';
  ['Set spawn','Set goal','Clear tile','Gen noise','Gen maze','Gen rooms','Gen island'].forEach((txt,i)=>{
    const div=document.createElement('div');
    div.textContent=txt; div.onclick=()=>{handleCtx(i); ctxMenu.style.display='none';};
    ctxMenu.appendChild(div);
  });
  ctxMenu.style.display='block';
});
document.addEventListener('click',()=> ctxMenu.style.display='none');

function paint(e){
  const {x,y}=mouseToTile(e);
  if(x<0||y<0||x>=GRID_W||y>=GRID_H) return;
  if(tool==='pipette'){
    tileSelect.value = String(env.grid[y][x]);
    tool='brush'; toolSelect.value='brush';
    return;
  }
  const val = (tool==='eraser') ? TILE.EMPTY : parseInt(tileSelect.value,10);
  if(tool==='fill'){
    floodFill(x,y, env.grid[y][x], val);
    redraw();
    drawing=false;
  } else if(tool==='brush' || tool==='eraser'){
    setTile(x,y,val);
    redraw();
  }
}

document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT' || e.target.tagName==='SELECT') return;
  if(e.ctrlKey){
    const k=e.key.toLowerCase();
    if(k==='z'){ e.preventDefault(); undo(); }
    else if(k==='y'){ e.preventDefault(); redo(); }
    else if(k==='s'){ e.preventDefault(); saveBtn.onclick(); }
    else if(k==='l'){ e.preventDefault(); loadBtn.onclick(); }
    return;
  }
    switch(e.key){
      case '1': case '2': case '3': case '4': case '5':
        tileSelect.value=String(parseInt(e.key)-1); break;
      case 'b': case 'B': tool='brush'; toolSelect.value='brush'; break;
      case 'e': case 'E': tool='eraser'; toolSelect.value='eraser'; break;
      case 'f': case 'F': tool='fill'; toolSelect.value='fill'; break;
      case 'i': case 'I': tool='pipette'; toolSelect.value='pipette'; break;
      case 'q': case 'Q': tool='rect'; toolSelect.value='rect'; break;
      case 'w': case 'W': tool='line'; toolSelect.value='line'; break;
      case ' ': e.preventDefault(); playBtn.onclick(); break;
      case 'n': case 'N': stepBtn.onclick(); break;
      case 'r': case 'R': resetBtn.onclick(); break;
      case 's': case 'S': saveBtn.onclick(); break;
      case 'l': case 'L': loadBtn.onclick(); break;
    }
  });

/* ===================== Inline Web Worker ===================== */
const workerCode = `
let ACTIONS=["UP","DOWN","LEFT","RIGHT","STAY"];
class QLearning{
  constructor(){ this.q=new Map(); this.eps=0.1; this.lr=0.2; this.gamma=0.98; }
  key(o){ const c=o.tiles.length>>1; const p=[...o.tiles[c-1].slice(c-1,c+2),...o.tiles[c].slice(c-1,c+2),...o.tiles[c+1].slice(c-1,c+2)];
    return o.pos[0]+","+o.pos[1]+"|"+o.goalVec[0]+","+o.goalVec[1]+"|"+p.join(","); }
  ensure(k){ if(!this.q.has(k)) this.q.set(k,{UP:0,DOWN:0,LEFT:0,RIGHT:0,STAY:0}); return this.q.get(k) }
  reset(_o){}
  act(o){ const k=this.key(o), q=this.ensure(k);
    if(Math.random()<this.eps) return ACTIONS[(Math.random()*ACTIONS.length)|0];
    let b="STAY",v=-1e9; for(const a of ACTIONS){ const val=q[a]; if(val>v){v=val;b=a} } return b; }
  learn(tr){ const q1=this.ensure(this.key(tr.s)); const q2=this.ensure(this.key(tr.s2));
    const target = tr.r + (tr.done?0:this.gamma*Math.max(...Object.values(q2)));
    q1[tr.a] += this.lr*(target - q1[tr.a]); }
}
class RandomAgent{ reset(_o){} act(_o){ return ACTIONS[(Math.random()*ACTIONS.length)|0] } }
let agent=null;
onmessage = (e)=>{
  const {type,payload}=e.data;
  if(type==="loadAgent"){
    agent = payload.name==="qlearning" ? new QLearning() : new RandomAgent();
    postMessage({type:"loaded"}); return;
  }
  if(!agent) return;
  if(type==="reset"){ agent.reset(payload.obs); postMessage({type:"ready"}); return; }
  if(type==="act"){ const a=agent.act(payload.obs); postMessage({type:"action",payload:{a}}); return; }
  if(type==="learn" && agent.learn){ agent.learn(payload.tr); }
};
`;
const worker = new Worker(URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'})));

let running=false, pendingAction=false;
function requestAction(){if(pendingAction || env.done) return; pendingAction=true; worker.postMessage({type:'act',payload:{obs:env.observe()}});}

function loadAgent(name){
  statusEl.textContent = 'loading agent...';
  worker.postMessage({ type:'loadAgent', payload:{ name } });
}
worker.onmessage = e=>{
  const {type,payload} = e.data;
  if(type==='loaded'){
    statusEl.textContent = `agent: ${agentSelect.value}`;
    worker.postMessage({ type:'reset', payload:{ obs: env.observe() } });
  } else if(type==='action'){
    pendingAction=false; stepWithAction(payload.a);
  }
};
loadAgent(agentSelect.value);
agentSelect.onchange = ()=> loadAgent(agentSelect.value);

function stepWithAction(a){
  const s = env.observe();
  const [s2, r, done] = env.step(a);
  worker.postMessage({ type:'learn', payload:{ tr:{ s, a, r, s2, done } } });
  redraw();
  if(done){ running=false; playBtn.textContent='Запустить'; statusEl.textContent=env.ax===env.gx&&env.ay===env.gy?'Цель достигнута':'Лимит шагов'; }
}

/* ===================== Controls ===================== */
playBtn.onclick = ()=>{
  running = !running;
  playBtn.textContent = running ? 'Пауза' : 'Запустить';
};
stepBtn.onclick = requestAction;
resetBtn.onclick = ()=>{
  env.reset(spawn,goal); redraw();
  worker.postMessage({ type:'reset', payload:{ obs: env.observe() } });
};
saveBtn.onclick = ()=>{
  const data={grid:env.grid,spawn,goal};
  try {localStorage.setItem('pocket-works:petri-forge:scene', JSON.stringify(data)); statusEl.textContent='Сцена сохранена';} catch {statusEl.textContent='Хранилище недоступно';}
};
loadBtn.onclick = ()=>{
  const raw = localStorage.getItem('pocket-works:petri-forge:scene');
  if(!raw){statusEl.textContent='Сохранённой сцены пока нет'; return;}
  try{
    const data=JSON.parse(raw);
    if(!Array.isArray(data.grid)||data.grid.length!==GRID_H||data.grid.some(row=>!Array.isArray(row)||row.length!==GRID_W||row.some(t=>!Number.isInteger(t)||t<0||t>4))) throw Error('grid');
    for(const p of [data.spawn,data.goal]) if(!Array.isArray(p)||p.length!==2||!env.inBounds(...p)||!p.every(Number.isInteger)) throw Error('position');
    env.grid=data.grid;
    spawn=data.spawn||spawn;
    goal=data.goal||goal;
    env.reset(spawn,goal);
  }catch{statusEl.textContent='Сцена повреждена';}
  redraw();
};

/* ===================== Game loop ===================== */
(function loop(){
  if(running && !document.hidden) requestAction();
  requestAnimationFrame(loop);
})();

cv.addEventListener('pointercancel',()=>{drawing=false;dragSpawn=false;dragGoal=false;panStart=null;});
document.querySelector('#undo').onclick=undo;
document.querySelector('#redo').onclick=redo;
document.querySelector('#generate').onchange=e=>{const v=e.target.value;if(v)handleCtx(Number(v));e.target.value='';};
document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;playBtn.textContent='Запустить';}});
window.render_game_to_text=()=>JSON.stringify({coordinates:'origin top-left; x right, y down; cells',running,done:env.done,agent:{x:env.ax,y:env.ay,algorithm:agentSelect.value},spawn,goal,steps:env.steps,reward:env.totalReward,tool,grid:env.grid});
window.advanceTime=async(ms)=>{for(let i=0;i<Math.min(120,Math.round(ms/16.667));i++){if(!running)break;requestAction();await new Promise(r=>setTimeout(r,0));}redraw();};
loadBtn.onclick();
