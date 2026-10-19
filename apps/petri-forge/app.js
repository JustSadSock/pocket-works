import {installMobileRuntime} from '../../shared/mobile-runtime.js';
installMobileRuntime();

import {GridEnvironment as Env,WIDTH,HEIGHT,TILE,createScenario,validateScene,QAgent} from './lab-core.mjs';
import {listModels,saveModel,loadModel,deleteModel} from './model-store.mjs';
const GRID_W=WIDTH,GRID_H=HEIGHT,TILE_SIZE=24;
const COLORS={
  [TILE.EMPTY]:'#26372f',[TILE.WALL]:'#66766b',
  [TILE.GOAL]:'#83bb77',[TILE.HAZARD]:'#be665c',[TILE.REWARD]:'#d9b65f'
};

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

// Each drawing gesture is a single reversible edit.
let tool='brush',drawing=false,startX=0,startY=0,panStart=null;
let heatData=[],replayData=null,replayIndex=0,replayTimer=null;
let undoStack=[],redoStack=[],operation=null;
let view={x:0,y:0,scale:1};
toolSelect.onchange=()=>{tool=toolSelect.value;};
zoomSel.onchange=()=>{view.scale=parseFloat(zoomSel.value);view.x=(cv.width-cv.width*view.scale)*.5;view.y=(cv.height-cv.height*view.scale)*.5;redraw();};
function beginOperation(){if(operation)commitOperation();operation=new Map();}
function commitOperation(){
  if(!operation)return;
  const items=[...operation.values()].filter(op=>op.old!==op.val);
  if(items.length){undoStack.push(items);if(undoStack.length>80)undoStack.shift();redoStack.length=0;}
  operation=null;
}
function setTile(x,y,val){
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=GRID_W||y>=GRID_H||!Number.isInteger(val)||val<0||val>4)return;
  if(val===TILE.GOAL){
    if(x===spawn[0]&&y===spawn[1]){statusEl.textContent='Цель нельзя поставить на старт';return;}
    if(x===goal[0]&&y===goal[1])return;
    if(env.grid[y][x]===TILE.WALL)setTile(x,y,TILE.EMPTY);
    const op={kind:'goal',old:goal.slice(),val:[x,y]};
    if(operation){if(!operation.has('goal'))operation.set('goal',op);else operation.get('goal').val=[x,y];}
    else{undoStack.push([op]);redoStack.length=0;}
    goal=[x,y];env.gx=x;env.gy=y;return;
  }
  const old=env.grid[y][x];if(old===val)return;
  const op={x,y,old,val},key=y*GRID_W+x;
  if(operation){if(!operation.has(key))operation.set(key,op);else operation.get(key).val=val;}
  else {undoStack.push([op]);if(undoStack.length>80)undoStack.shift();redoStack.length=0;}
  env.grid[y][x]=val;
}
function floodFill(x,y,target,repl){
  if(target===repl)return;
  const stack=[[x,y]],seen=new Set();
  while(stack.length){
    const [cx,cy]=stack.pop(),key=cy*GRID_W+cx;
    if(seen.has(key)||cx<0||cy<0||cx>=GRID_W||cy>=GRID_H)continue;
    seen.add(key);
    if(env.grid[cy][cx]!==target)continue;
    setTile(cx,cy,repl);
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
}
function undo(){
  if(training)return;
  commitOperation();stopReplay();const ops=undoStack.pop();if(!ops)return;
  for(const op of ops){if(op.kind==='goal')goal=op.old.slice();else env.grid[op.y][op.x]=op.old;}
  redoStack.push(ops);env.reset(spawn,goal);redraw();
}
function redo(){
  if(training)return;
  commitOperation();stopReplay();const ops=redoStack.pop();if(!ops)return;
  for(const op of ops){if(op.kind==='goal')goal=op.val.slice();else env.grid[op.y][op.x]=op.val;}
  undoStack.push(ops);env.reset(spawn,goal);redraw();
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
    for(let x=Math.floor(Math.min(a.x+a.w/2,b.x+b.w/2)); x<=Math.floor(Math.max(a.x+a.w/2,b.x+b.w/2)); x++) setTile(Math.floor(x), Math.floor(a.y+a.h/2), TILE.EMPTY);
    for(let y=Math.floor(Math.min(a.y+a.h/2,b.y+b.h/2)); y<=Math.floor(Math.max(a.y+a.h/2,b.y+b.h/2)); y++) setTile(Math.floor(b.x+b.w/2), Math.floor(y), TILE.EMPTY);
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
  if(training)return;
  stopReplay();beginOperation();
  switch(i){
    case 0: spawn=[ctxTile.x,ctxTile.y]; env.reset(spawn,goal); break;
    case 1: goal=[ctxTile.x,ctxTile.y]; env.reset(spawn,goal); break;
    case 2: setTile(ctxTile.x,ctxTile.y,TILE.EMPTY); break;
    case 3: generateNoise(); break;
    case 4: generateMaze(); break;
    case 5: generateRooms(); break;
    case 6: generateIsland(); break;
  }
  if(i>=3&&i<=6){setTile(spawn[0],spawn[1],TILE.EMPTY);setTile(goal[0],goal[1],TILE.EMPTY);}
  commitOperation();env.reset(spawn,goal);redraw();
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
  if(document.querySelector('#heatToggle')?.checked&&heatData.length===GRID_W*GRID_H){
    const peak=Math.max(1,...heatData);
    for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){
      const amount=heatData[y*GRID_W+x];if(amount<1)continue;
      ctx.fillStyle=`rgba(245,155,70,${Math.min(.72,Math.sqrt(amount/peak)*.72)})`;
      ctx.fillRect(x*TILE_SIZE,y*TILE_SIZE,TILE_SIZE-1,TILE_SIZE-1);
    }
  }
  if(replayData?.trace?.length){
    const trace=replayData.trace,limit=Math.min(replayIndex,trace.length-1);
    ctx.beginPath();
    for(let i=0;i<=limit;i++){const p=trace[i];if(i===0)ctx.moveTo((p.x+.5)*TILE_SIZE,(p.y+.5)*TILE_SIZE);else ctx.lineTo((p.x+.5)*TILE_SIZE,(p.y+.5)*TILE_SIZE);}
    ctx.strokeStyle='#edcf7e';ctx.lineWidth=2;ctx.stroke();
    const p=trace[limit];ctx.fillStyle='#fff1a8';ctx.beginPath();ctx.arc((p.x+.5)*TILE_SIZE,(p.y+.5)*TILE_SIZE,7,0,Math.PI*2);ctx.fill();
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
  if(training)return;
  stopReplay();
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
  beginOperation();
  drawing=true;
  startX=t.x; startY=t.y;
  paint(e);
});
cv.addEventListener('pointermove', e=>{
  if(panStart){
    view.x = panStart.ox + (e.clientX-panStart.x)*cv.width/cv.getBoundingClientRect().width;
    view.y = panStart.oy + (e.clientY-panStart.y)*cv.height/cv.getBoundingClientRect().height;
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
  commitOperation();
  if(dragSpawn||dragGoal){if(env.grid[spawn[1]][spawn[0]]===TILE.WALL)setTile(spawn[0],spawn[1],TILE.EMPTY);if(env.grid[goal[1]][goal[0]]===TILE.WALL)setTile(goal[0],goal[1],TILE.EMPTY);env.reset(spawn,goal);}
  drawing=false;
  dragSpawn=false; dragGoal=false;
});

cv.addEventListener('contextmenu', e=>{
  e.preventDefault();if(training)return;
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
    else if(k==='l'){ e.preventDefault(); 
loadBtn.onclick();
 }
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

/* ===================== Asynchronous learning system ===================== */
const worker=new Worker(new URL('./lab-worker.mjs',import.meta.url),{type:'module'});
let running=false,pendingAction=false,training=false;
let historyData=[],lastBest=null,lastWorst=null,snapshotRequest=null;
const $=id=>document.getElementById(id);
const status=text=>{statusEl.textContent=text;};
const sceneNow=()=>({grid:env.grid.map(row=>row.slice()),spawn:spawn.slice(),goal:goal.slice()});
function stopReplay(){if(replayTimer!==null)clearInterval(replayTimer);replayTimer=null;replayData=null;replayIndex=0;}
function requestAction(){if(training||pendingAction||env.done||replayTimer!==null)return;pendingAction=true;worker.postMessage({type:'act',payload:{obs:env.observe()}});}
function loadAgent(name,snapshot=null){pendingAction=false;running=false;playBtn.textContent='▶ Наблюдать';worker.postMessage({type:'loadAgent',payload:{name,snapshot}});}
function updateTrainingUI(data){
  $('metricEpisodes').textContent=Number(data.complete||0).toLocaleString('ru-RU');
  $('metricSuccess').textContent=data.complete?Math.round((data.success||0)*100)+'%':'—';
  $('metricReward').textContent=data.complete?Number(data.average||0).toFixed(2):'—';
  $('progressFill').style.width=(data.episodes?Math.min(100,100*data.complete/data.episodes):0)+'%';
  if(data.history)historyData=data.history;
  if(data.heat)heatData=data.heat;
  drawLearningChart();
  if($('heatToggle').checked)redraw();
}
function drawLearningChart(){
  const canvas=$('learningChart'),c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  c.clearRect(0,0,w,h);c.strokeStyle='#456251';c.lineWidth=1;
  for(const v of [0,.5,1]){const y=8+(h-19)*(1-v);c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
  if(!historyData.length){c.fillStyle='#9aaa9b';c.font='16px system-ui';c.fillText('Запустите обучение, чтобы увидеть прогресс',15,68);return;}
  const max=Math.max(1,historyData[historyData.length-1].episode);
  c.beginPath();
  historyData.forEach((p,i)=>{const x=5+(w-10)*p.episode/max,y=8+(h-19)*(1-p.rate/100);if(i)c.lineTo(x,y);else c.moveTo(x,y);});
  c.strokeStyle='#c1e891';c.lineWidth=3;c.lineCap='round';c.lineJoin='round';c.stroke();
}
function controlsEnabled(isTraining){
  training=isTraining;
  for(const id of ['trainBtn','evaluateBtn','saveBrain','loadBrain','deleteBrain','makeScenario','load','save','playPause','step','reset','agentSelect']){
    $(id).disabled=isTraining;
  }
  $('stopTrain').disabled=!isTraining;
  $('trainState').textContent=isTraining?'Обучение...':'Ожидание';
  if(isTraining){running=false;pendingAction=false;playBtn.textContent='▶ Наблюдать';stopReplay();}
}
async function autosave(snapshot){
  if(snapshot.type!=='qlearning')return;
  try{await saveModel({id:'autosave',name:'Автосохранение',kind:'qlearning',snapshot,states:snapshot.q.length});await refreshLibrary();$('stateCount').textContent=snapshot.q.length.toLocaleString('ru-RU')+' состояний';}
  catch(error){status('Автосохранение: '+error.message);}
}
worker.addEventListener('error',event=>{controlsEnabled(false);pendingAction=false;status('Ошибка модуля обучения');console.error(event.message);});
worker.onmessage=event=>{
  const d=event.data||{};
  if(d.type==='loaded'){pendingAction=false;status('Агент: '+(d.kind==='random'?'случайный':'Q-learning'));$('stateCount').textContent=(d.states||0)+' состояний';}
  else if(d.type==='action'){
    pendingAction=false;if(!training&&replayTimer===null)stepWithAction(d.action);
  }else if(d.type==='training'){controlsEnabled(true);status('Обучение запущено');}
  else if(d.type==='progress'){updateTrainingUI(d);status('Эпизодов: '+d.complete+' / '+d.episodes);}
  else if(d.type==='trained'||d.type==='stopped'){
    controlsEnabled(false);
    const sample=Math.max(1,d.complete);
    updateTrainingUI({complete:d.complete,episodes:d.episodes,success:d.success,average:d.average,history:d.history,heat:d.heat});
    lastBest=d.best;lastWorst=d.worst;$('bestReplay').disabled=!lastBest;$('worstReplay').disabled=!lastWorst;
    status(d.type==='trained'?'Обучение завершено':'Обучение остановлено');
    $('trainState').textContent=d.type==='trained'?'Готово':'Остановлено';
    if(d.snapshot)void autosave(d.snapshot);
  }else if(d.type==='evaluated'){
    const a=d.train,b=d.holdout;
    $('evalResults').innerHTML='<strong>Текущая карта: '+Math.round(a.success*100)+'%</strong> ('+a.count+' тестов), средний путь '+a.steps.toFixed(0)+' шагов.<br><strong class="'+(b.success<.2?'bad':'')+'">Новые карты: '+Math.round(b.success*100)+'%</strong> ('+b.count+' тестов), средний путь '+b.steps.toFixed(0)+' шагов. Проверка не изменяет обученную модель.';
    status('Независимая проверка завершена');
    if(d.replay?.trace){lastBest=d.replay;$('bestReplay').disabled=false;}
  }else if(d.type==='snapshot'){
    if(snapshotRequest){const done=snapshotRequest;snapshotRequest=null;void done(d.snapshot);}
  }else if(d.type==='error'){
    controlsEnabled(false);pendingAction=false;snapshotRequest=null;status('Ошибка: '+d.message);console.error('PetriForge worker:',d.message);
  }
};
function stepWithAction(a){
  if(!a||env.done||training)return;
  const s=env.observe(),[s2,r,done]=env.step(a);
  worker.postMessage({type:'learn',payload:{tr:{s,a,r,s2,done}}});
  redraw();
  if(done){running=false;playBtn.textContent='▶ Наблюдать';status(env.success?'Цель достигнута':'Лимит шагов');}
}
loadAgent(agentSelect.value);
agentSelect.onchange=()=>{if(training)return;stopReplay();loadAgent(agentSelect.value);};

/* ===================== Controls ===================== */
playBtn.onclick = ()=>{
  running = !running;
  playBtn.textContent = running ? 'Ⅱ Пауза' : '▶ Наблюдать';
};
stepBtn.onclick = ()=>{if(!training){stopReplay();requestAction();}};
resetBtn.onclick = ()=>{
  if(training)return;stopReplay();env.reset(spawn,goal);redraw();
};
saveBtn.onclick = ()=>{
  if(training)return;commitOperation();const data=sceneNow();
  try {localStorage.setItem('pocket-works:petri-forge:scene', JSON.stringify(data)); statusEl.textContent='Сцена сохранена';} catch {statusEl.textContent='Хранилище недоступно';}
};
loadBtn.onclick = ()=>{
  if(training)return;stopReplay();const raw = localStorage.getItem('pocket-works:petri-forge:scene');
  if(!raw){statusEl.textContent='Сохранённой сцены пока нет'; return;}
  try{
    const data=JSON.parse(raw);
    if(!Array.isArray(data.grid)||data.grid.length!==GRID_H||data.grid.some(row=>!Array.isArray(row)||row.length!==GRID_W||row.some(t=>!Number.isInteger(t)||t<0||t>4))) throw Error('grid');
    for(const p of [data.spawn,data.goal]) if(!Array.isArray(p)||p.length!==2||!env.inBounds(...p)||!p.every(Number.isInteger)) throw Error('position');
    const safe=validateScene(data);spawn=safe.spawn;goal=safe.goal;env.setScene(safe);
    undoStack=[];redoStack=[];
  }catch{statusEl.textContent='Сцена повреждена';}
  redraw();
};

/* ===================== Game loop ===================== */
(function loop(){
  if(running && !document.hidden) requestAction();
  requestAnimationFrame(loop);
})();

cv.addEventListener('pointercancel',()=>{commitOperation();drawing=false;dragSpawn=false;dragGoal=false;panStart=null;});
document.querySelector('#undo').onclick=undo;
document.querySelector('#redo').onclick=redo;
document.querySelector('#generate').onchange=e=>{const v=e.target.value;if(v)handleCtx(Number(v));e.target.value='';};
document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;playBtn.textContent='▶ Наблюдать';stopReplay();}});
window.render_game_to_text=()=>JSON.stringify({coordinates:'origin top-left; x right, y down; cells',running,done:env.done,agent:{x:env.ax,y:env.ay,algorithm:agentSelect.value},spawn,goal,steps:env.steps,reward:env.totalReward,tool,grid:env.grid});
window.advanceTime=async(ms)=>{for(let i=0;i<Math.min(120,Math.round(ms/16.667));i++){if(!running)break;requestAction();await new Promise(r=>setTimeout(r,0));}redraw();};

/* ===================== Experiment controls ===================== */
$('makeScenario').onclick=()=>{
  if(training)return;
  stopReplay();commitOperation();
  const chosen=$('scenarioSelect').value;
  if(chosen==='custom'){status('Нарисованный мир сохранён в редакторе');return;}
  const generated=createScenario(chosen,Number($('worldSeed').value)||41);
  env.setScene(generated);spawn=generated.spawn;goal=generated.goal;
  undoStack=[];redoStack=[];heatData=[];lastBest=null;lastWorst=null;
  $('bestReplay').disabled=true;$('worstReplay').disabled=true;
  view={x:0,y:0,scale:1};zoomSel.value='1';redraw();
  status('Испытание построено: '+$('scenarioSelect').selectedOptions[0].textContent);
};
$('trainBtn').onclick=()=>{
  if(training)return;
  stopReplay();running=false;pendingAction=false;
  playBtn.textContent='▶ Наблюдать';
  if(agentSelect.value==='random'){status('Для обучения выберите Q-learning');return;}
  try{
    const scene=validateScene(sceneNow()),episodes=Number($('episodeCount').value);
    $('metricEpisodes').textContent='0';$('metricSuccess').textContent='—';$('metricReward').textContent='—';$('progressFill').style.width='0%';
    historyData=[];heatData=[];drawLearningChart();lastBest=null;lastWorst=null;
    $('bestReplay').disabled=true;$('worstReplay').disabled=true;
    controlsEnabled(true);
    worker.postMessage({type:'train',payload:{scene,episodes,seed:Number($('worldSeed').value)||41,maxSteps:320}});
  }catch(error){controlsEnabled(false);status('Нельзя обучать: '+error.message);}
};
$('stopTrain').onclick=()=>{if(training)worker.postMessage({type:'stop'});};
$('evaluateBtn').onclick=()=>{
  if(training)return;
  try{
    const scene=validateScene(sceneNow());
    status('Идёт независимая оценка...');
    worker.postMessage({type:'evaluate',payload:{scene,seed:9101,scenarioId:$('scenarioSelect').value==='custom'?'corridor':$('scenarioSelect').value}});
  }catch(error){status('Ошибка проверки: '+error.message);}
};
function beginReplay(candidate){
  if(training||!candidate?.trace?.length)return;
  stopReplay();running=false;playBtn.textContent='▶ Наблюдать';
  replayData=candidate;replayIndex=0;redraw();
  $('replayInfo').textContent='Эпизод '+(candidate.episode||'тест')+' · '+candidate.trace.length+' кадров · '+(candidate.success?'Цель достигнута':'Цель не достигнута')+'. Нажмите ещё раз для остановки.';
  replayTimer=setInterval(()=>{
    if(!replayData)return;
    replayIndex=Math.min(replayData.trace.length-1,replayIndex+1);
    redraw();
    if(replayIndex>=replayData.trace.length-1){clearInterval(replayTimer);replayTimer=null;status('Повтор завершён');}
  },45);
}
$('bestReplay').onclick=()=>{if(replayTimer!==null){stopReplay();redraw();}else beginReplay(lastBest);};
$('worstReplay').onclick=()=>{if(replayTimer!==null){stopReplay();redraw();}else beginReplay(lastWorst);};
$('heatToggle').onchange=redraw;
async function refreshLibrary(){
  const select=$('modelSelect'),selected=select.value;
  try{
    const records=await listModels();select.replaceChildren();
    if(!records.length){const option=document.createElement('option');option.value='';option.textContent='Нет сохранённых моделей';select.append(option);}
    for(const item of records){const option=document.createElement('option');option.value=item.id;option.textContent=item.name+' · '+(item.states||0)+' состояний';select.append(option);}
    if(records.some(m=>m.id===selected))select.value=selected;
  }catch(error){status('Библиотека недоступна: '+error.message);}
}
const askSnapshot=handler=>{
  if(snapshotRequest||training){status('Мозг занят; завершите текущую операцию');return;}
  snapshotRequest=handler;worker.postMessage({type:'snapshot'});
};
$('saveBrain').onclick=()=>askSnapshot(async snapshot=>{
  const name=$('modelName').value.trim()||'Мой агент',id='model-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
  try{await saveModel({id,name,kind:snapshot.type,snapshot,states:snapshot.q?.length||0});await refreshLibrary();$('modelSelect').value=id;status('Мозг сохранён: '+name);}
  catch(error){status('Не удалось сохранить: '+error.message);}
});
$('loadBrain').onclick=async()=>{
  if(training)return;
  const id=$('modelSelect').value;if(!id){status('Выберите сохранённую модель');return;}
  try{
    const item=await loadModel(id);if(!item)throw Error('Модель не найдена');
    stopReplay();agentSelect.value=item.snapshot.type==='random'?'random':'qlearning';
    loadAgent(agentSelect.value,item.snapshot);$('modelName').value=item.name;
    status('Модель загружена: '+item.name);
  }catch(error){status('Не удалось загрузить: '+error.message);}
};
$('deleteBrain').onclick=async()=>{
  const id=$('modelSelect').value;if(!id)return;
  const option=$('modelSelect').selectedOptions[0];
  if(!confirm('Удалить модель «'+option.textContent+'» без возможности восстановления?'))return;
  try{await deleteModel(id);await refreshLibrary();status('Модель удалена');}catch(error){status('Не удалось удалить: '+error.message);}
};
$('exportBrain').onclick=()=>askSnapshot(snapshot=>{
  try{
    const data={format:'petri-forge-agent',version:1,name:$('modelName').value.slice(0,64),snapshot};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='petri-forge-agent.json';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);status('Модель экспортирована');
  }catch(error){status('Ошибка экспорта: '+error.message);}
});
$('importBrain').onchange=async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(file.size>10_000_000){status('Файл слишком большой (макс. 10 МБ)');return;}
  try{
    const data=JSON.parse(await file.text());
    if(data?.format!=='petri-forge-agent'||data.version!==1||!data.snapshot)throw Error('Несовместимый файл');
    const kind=data.snapshot.type;
    if(!['qlearning','random'].includes(kind))throw Error('Алгоритм не поддерживается');
    if(kind==='qlearning'){const validator=new QAgent(1);validator.load(data.snapshot);}
    else if(data.snapshot.version!==1)throw Error('Версия модели не поддерживается');
    const name=String(data.name||'Импортированный мозг').slice(0,64);
    // Validate the checkpoint in the Worker before saving it.
    stopReplay();agentSelect.value=kind;loadAgent(kind,data.snapshot);
    const id='import-'+Date.now().toString(36);
    await saveModel({id,name,kind,snapshot:data.snapshot,states:data.snapshot.q?.length||0});
    await refreshLibrary();$('modelSelect').value=id;$('modelName').value=name;status('Модель импортирована: '+name);
  }catch(error){status('Не удалось импортировать: '+error.message);}
};
drawLearningChart();
try{
  if(localStorage.getItem('pocket-works:petri-forge:scene'))loadBtn.onclick();
  else{
    const initial=createScenario('corridor',41);
    env.setScene(initial);spawn=initial.spawn;goal=initial.goal;
    $('scenarioSelect').value='corridor';redraw();
    status('Первый маршрут готов. Запустите обучение.');
  }
}catch(error){status('Ошибка открытия сцены: '+error.message);}
void refreshLibrary();
window.render_game_to_text=()=>JSON.stringify({
  coordinates:'origin top-left; x right, y down; cells',
  running,training,done:env.done,agent:{x:env.ax,y:env.ay,algorithm:agentSelect.value},
  spawn,goal,steps:env.steps,reward:env.totalReward,
  history:historyData.slice(-6),replay:replayData?{cursor:replayIndex,total:replayData.trace.length}:null,grid:env.grid
});
