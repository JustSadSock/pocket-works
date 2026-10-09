import { installMobileRuntime } from '../../shared/mobile-runtime.js';
installMobileRuntime();

const $ = (id) => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const TAU = Math.PI * 2, BASE_RPM = 12, RADII = {1:19,2:27,3:35};
const CASES = [
  {name:'ПЕРЕДАЧА',subtitle:'ПРОВЕДИ ВРАЩЕНИЕ',hint:'Три средние шестерни соединят ведущий и ведомый валы.',source:[55,247,2],target:[271,247,2],holes:[[109,247],[163,247],[217,247]],stock:{1:0,2:3,3:0},sign:1},
  {name:'УСКОРЕНИЕ',subtitle:'РАЗГОНИ ВЫХОДНОЙ ВАЛ',hint:'Используй две средние и одну малую шестерню.',source:[48,260,3],target:[248,260,1],holes:[[110,260],[164,260],[210,260],[164,325],[210,325]],stock:{1:1,2:2,3:0},sign:1},
  {name:'РЕВЕРС',subtitle:'ИЗМЕНИ НАПРАВЛЕНИЕ',hint:'Нечётное число зацеплений развернёт выходной вал.',source:[60,250,2],target:[222,250,2],holes:[[114,250],[168,250],[168,314]],stock:{1:0,2:2,3:0},sign:-1},
  {name:'ОБХОДНОЙ ПУТЬ',subtitle:'ПЕРЕДАЙ ВРАЩЕНИЕ ПО ДУГЕ',hint:'Четыре средних колеса обойдут закрытый участок станка.',source:[57,309,3],target:[227,309,2],holes:[[119,309],[119,255],[173,255],[227,255],[173,363]],stock:{1:0,2:4,3:0},sign:-1},
  {name:'РЕДУКТОР',subtitle:'ЗАМЕДЛИ МЕХАНИЗМ',hint:'Собери передачу от малого ведущего колеса к большому ведомому.',source:[55,255,1],target:[287,255,3],holes:[[101,255],[163,255],[225,255],[163,331]],stock:{1:0,2:2,3:1},sign:1},
  {name:'ЛАБИРИНТ',subtitle:'ПОСЛЕДНИЙ МЕХАНИЗМ',hint:'Четыре шестерни разного размера проведут вращение через поворот.',source:[55,315,2],target:[271,269,3],holes:[[109,315],[155,315],[155,269],[209,269],[209,335],[155,369]],stock:{1:1,2:3,3:0},sign:-1}
];
const FREE = {name:'СВОБОДНАЯ СБОРКА',subtitle:'СОБСТВЕННАЯ МАШИНА',hint:'Без ограничений: экспериментируй с передачами и направлением.',source:[55,247,2],target:[271,247,2],holes:[[109,247],[163,247],[217,247],[109,193],[163,193],[217,193],[109,301],[163,301],[217,301],[163,355]],stock:{1:999,2:999,3:999},sign:1};
function centerScene(scene){
  const ys=[scene.source[1],scene.target[1],...scene.holes.map(h=>h[1])];
  const shift=296-(Math.min(...ys)+Math.max(...ys))/2;
  scene.source[1]+=shift;scene.target[1]+=shift;
  scene.holes.forEach(h=>{h[1]+=shift;});
}
CASES.forEach(centerScene);centerScene(FREE);
const KEY='pocket-works:mechanica:v1';
function restore(){
  try {
    const v=JSON.parse(localStorage.getItem(KEY)||'null')||{};
    const gears=Array.from({length:7},(_,i)=>{
      const data=v.gears && v.gears[i];
      if(!data || typeof data!=='object') return {};
      const result={};
      Object.entries(data).forEach(([k,n])=>{const idx=Number(k),lim=(i===6?FREE:CASES[i]).holes.length;if(Number.isInteger(idx)&&idx>=0&&idx<lim&&[1,2,3].includes(n))result[idx]=n;});
      return result;
    });
    return {level:Number.isInteger(v.level)&&v.level>=0&&v.level<=6?v.level:0,solved:Array.from({length:6},(_,i)=>Boolean(v.solved&&v.solved[i])),gears,selected:[1,2,3].includes(v.selected)?v.selected:2,sound:v.sound!==false,charge:Number.isFinite(v.charge)?Math.max(0,Math.min(100,v.charge)):100};
  } catch {return {level:0,solved:Array(6).fill(false),gears:Array.from({length:7},()=>({})),selected:2,sound:true,charge:100};}
}
const state={...restore(),running:false,runTime:0,phase:0,runResult:null,history:[],drag:null,toastTimer:0,flash:0,winShown:false};
let graph=null, audio=null, lastTime=0, raf=0, screen={scale:1,ox:0,oy:0,w:360,h:500}, redraw=true;
const level=()=>state.level===6?FREE:CASES[state.level], current=()=>state.gears[state.level];
function save(){
  try{localStorage.setItem(KEY,JSON.stringify({level:state.level,solved:state.solved,gears:state.gears,selected:state.selected,sound:state.sound,charge:state.charge}));}catch{}
}
function sound(kind){
  if(!state.sound)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    audio=audio||new AC();if(audio.state==='suspended')audio.resume();
    const t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
    const freq={tap:450,place:340,wind:180,run:130,error:105,win:610}[kind]||270;
    osc.type=kind==='win'?'sine':kind==='error'?'triangle':'square';
    osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(kind==='win'?freq*1.35:freq*.64,t+.14);
    gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(kind==='wind'?.048:.026,t+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,t+(kind==='win'?.38:.17));
    osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+(kind==='win'?.42:.2));
  }catch{}
}
function toast(message){
  const el=$('toast');el.textContent=message;el.classList.add('show');
  clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
}
function remaining(type){
  if(state.level===6)return Infinity;
  return (level().stock[type]||0)-Object.values(current()).filter(n=>n===type).length;
}
function labelRPM(rpm){
  if(!rpm)return '0';return (Math.round(Math.abs(rpm)*10)/10).toLocaleString('ru-RU',{maximumFractionDigits:1});
}
function getGraph(){
  const p=level(),nodes=[{id:'source',x:p.source[0],y:p.source[1],r:RADII[p.source[2]],size:p.source[2],fixed:true},
    {id:'target',x:p.target[0],y:p.target[1],r:RADII[p.target[2]],size:p.target[2],fixed:true}];
  Object.entries(current()).forEach(([id,size])=>{
    const h=p.holes[Number(id)];if(h)nodes.push({id:Number(id),x:h[0],y:h[1],r:RADII[size],size,fixed:false});
  });
  const links=Array.from({length:nodes.length},()=>[]);
  let jam=false;
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j],d=Math.hypot(a.x-b.x,a.y-b.y),sum=a.r+b.r;
    if(d<sum-5)jam=true;
    if(Math.abs(d-sum)<=3){links[i].push(j);links[j].push(i);}
  }
  const rpm=Array(nodes.length).fill(null);rpm[0]=BASE_RPM;
  const todo=[0];
  for(let k=0;k<todo.length;k++){
    const i=todo[k];
    for(const j of links[i]){
      const speed=-rpm[i]*nodes[i].r/nodes[j].r;
      if(rpm[j]===null){rpm[j]=speed;todo.push(j);}
      else if(Math.abs(rpm[j]-speed)>.02)jam=true;
    }
  }
  const output=rpm[1],need=BASE_RPM*nodes[0].r/nodes[1].r;
  const solved=!jam&&output!==null&&Math.sign(output)===p.sign&&Math.abs(Math.abs(output)-need)<.08;
  return {nodes,links,rpm,jam,output,need,solved,connected:output!==null,edges:links.reduce((s,a)=>s+a.length,0)/2};
}
function refresh(){
  graph=getGraph();
  const p=level();const free=state.level===6;
  $('chapter').textContent=free?'РЕЖИМ МАСТЕРА':'СХЕМА '+['I','II','III','IV','V','VI'][state.level];
  $('puzzle-title').textContent=p.name;$('goal').textContent=p.subtitle;
  $('hintline').textContent=p.hint;
  $('case-index').textContent=free?'∞':String(state.level+1).padStart(2,'0');
  $('stock-label').textContent=free?'ЗАПАС НЕ ОГРАНИЧЕН':'ВЫБЕРИ И ПОСТАВЬ';
  $('charge-read').textContent='ПРУЖИНА · '+Math.ceil(state.charge)+'%';
  $('run').classList.toggle('running',state.running);
  $('run').querySelector('b').textContent=state.running?'СТОП':'ПУСК';
  $('run-caption').textContent=state.running?'ОСТАНОВИТЬ':'ИСПЫТАТЬ МАШИНУ';
  const text=graph.jam?'ЗАКЛИНИЛО · КОЛЁСА ПЕРЕКРЫТЫ':graph.connected?'ВЫХОД · '+labelRPM(graph.output)+' ОБ/МИН · '+(graph.output>0?'↻':'↺'):'ВЫХОД · НЕТ СОЕДИНЕНИЯ';
  $('gear-status').textContent=text;
  document.querySelectorAll('.part').forEach(b=>{
    const type=Number(b.dataset.size),remain=remaining(type);
    b.disabled=remain<=0 && state.selected!==type;
    b.classList.toggle('active',state.selected===type);b.setAttribute('aria-pressed',String(state.selected===type));
    b.querySelector('.part-count').textContent=free?'∞':String(Math.max(0,remain));
  });
  $('undo').disabled=!state.history.length;
  $('wind').disabled=state.charge>=100||state.running;
  redraw=true;
}
function snapshot(){state.history.push({...current()});if(state.history.length>40)state.history.shift();}
function stop(){if(state.running){state.running=false;state.runResult=null;state.runTime=0;}}
function apply(){
  stop();save();refresh();
}
function place(index,size,movingFrom=null){
  const p=level();
  if(index<0||index>=p.holes.length)return false;
  const currentG=current(),old=currentG[index];
  if(old!=null&&movingFrom!==index){toast('Гнездо уже занято');sound('error');return false;}
  if(movingFrom===index)return true;
  if(remaining(size)<=0 && (movingFrom==null||currentG[movingFrom]!==size)){toast('Таких шестерён больше нет');sound('error');return false;}
  const trial={...currentG};if(movingFrom!=null)delete trial[movingFrom];trial[index]=size;
  const x=p.holes[index][0],y=p.holes[index][1],r=RADII[size];
  const others=[[p.source[0],p.source[1],RADII[p.source[2]]],[p.target[0],p.target[1],RADII[p.target[2]]]];
  Object.entries(trial).forEach(([key,t])=>{if(Number(key)!==index){const h=p.holes[Number(key)];others.push([h[0],h[1],RADII[t]]);}});
  if(others.some(g=>Math.hypot(x-g[0],y-g[1])<r+g[2]-5)){
    toast('Колёса накладываются. Нужна другая деталь.');sound('error');return false;
  }
  snapshot();state.gears[state.level]=trial;apply();sound('place');state.flash=.32;return true;
}
function remove(index){
  if(current()[index]==null)return;
  snapshot();const next={...current()};delete next[index];state.gears[state.level]=next;
  apply();sound('tap');
}
function switchLevel(index){
  if(index!==6&&(index<0||index>=CASES.length|| (index>0&&!state.solved[index-1]))){toast('Сначала заверши предыдущую схему');return;}
  stop();state.level=index;state.history=[];state.charge=100;state.winShown=false;
  if(remaining(state.selected)===0){state.selected=[1,2,3].find(s=>remaining(s)>0)||2;}
  save();refresh();closeModal();sound('tap');
}
function wind(){
  if(state.running){toast('Останови механизм перед заводом');return;}
  if(state.charge>=100){toast('Пружина полностью заведена');return;}
  state.charge=Math.min(100,state.charge+35);state.flash=.35;
  save();refresh();sound('wind');
}
function run(){
  if(state.running){stop();refresh();sound('tap');return;}
  if(state.charge<20){toast('Недостаточно энергии. Заведи пружину.');sound('error');return;}
  graph=getGraph();state.running=true;state.runTime=0;state.runResult=graph;
  refresh();sound('run');
  if(graph.jam)toast('Механизм заклинивает');
  else if(!graph.connected)toast('Вращение не дошло до выходного вала');
  else if(!graph.solved&&state.level!==6)toast('Неверное направление передачи');
}
function finish(){
  state.running=false;state.runTime=0;
  if(state.level===6){toast(graph.connected?'Передача работает!':'Испытание окончено — цепь разомкнута');refresh();return;}
  if(state.runResult&&state.runResult.solved){
    state.solved[state.level]=true;save();refresh();sound('win');state.flash=1;state.winShown=true;
    const next=state.level+1;const last=next===6;
    openModal('<div class="eyebrow">ИСПЫТАНИЕ ПРОЙДЕНО</div><div class="medallion">✦</div><h2 id="modal-title">Механизм работает</h2><p>Выходной вал вращается с нужной скоростью и направлением. Передаточное отношение рассчитано верно.</p><div class="modal-actions"><button class="secondary" data-action="close">ОСМОТРЕТЬ</button><button data-action="'+(last?'free':'next')+'">'+(last?'МАСТЕРСКАЯ':'СЛЕДУЮЩАЯ')+'</button></div>');
  }else{sound('error');toast(state.runResult&&state.runResult.jam?'Шестерни заклинило':state.runResult&&state.runResult.connected?'Не то направление вращения':'Цепь не передаёт движение');refresh();}
}
function openModal(html){$('modal-content').innerHTML=html;$('modal').hidden=false;state.drag=null;stop();refresh();}
function closeModal(){$('modal').hidden=true;$('modal-content').innerHTML='';refresh();}
function showLevels(){
  let entries='';
  CASES.forEach((p,i)=>{
    const locked=i>0&&!state.solved[i-1],completed=state.solved[i];
    entries+='<button class="scheme '+(state.level===i?'current':'')+'" type="button" data-action="choose" data-level="'+i+'" '+(locked?'disabled':'')+'><span>'+String(i+1).padStart(2,'0')+' · '+p.name+'</span><small>'+(locked?'ЗАКРЫТО':completed?'ПРОЙДЕНО ✓':'ОТКРЫТО')+'</small></button>';
  });
  entries+='<button class="scheme '+(state.level===6?'current':'')+'" type="button" data-action="choose" data-level="6"><span>∞ · СВОБОДНАЯ СБОРКА</span><small>БЕЗ ЛИМИТА</small></button>';
  openModal('<div class="eyebrow">КНИГА МЕХАНИЗМОВ</div><h2 id="modal-title">Выбери чертёж</h2><div class="modal-menu">'+entries+'</div><div class="modal-actions"><button class="secondary" data-action="close">ВЕРНУТЬСЯ К СТАНКУ</button></div>');
}
function askClear(){
  if(!Object.keys(current()).length){toast('Станок уже свободен');return;}
  openModal('<div class="eyebrow">ДЕМОНТАЖ</div><h2 id="modal-title">Очистить станок?</h2><p>Все установленные шестерни этой схемы вернутся на склад. Пройденные задания останутся открыты.</p><div class="modal-actions"><button class="secondary" data-action="close">ОСТАВИТЬ</button><button data-action="confirm-clear">ОЧИСТИТЬ</button></div>');
}
$('levels').addEventListener('click',showLevels);
$('clear').addEventListener('click',askClear);
$('undo').addEventListener('click',()=>{
  const last=state.history.pop();if(!last)return;state.gears[state.level]=last;apply();sound('tap');
});
$('wind').addEventListener('click',wind);$('run').addEventListener('click',run);
$('sound').addEventListener('click',()=>{
  state.sound=!state.sound;$('sound').classList.toggle('off',!state.sound);
  $('sound').setAttribute('aria-label',state.sound?'Выключить звук':'Включить звук');save();if(state.sound)sound('tap');
});
$('modal').addEventListener('click',e=>{
  const button=e.target.closest('[data-action]');if(!button){
    if(e.target.dataset.close)closeModal();return;
  }
  const action=button.dataset.action;
  if(action==='close')closeModal();
  if(action==='choose')switchLevel(Number(button.dataset.level));
  if(action==='next')switchLevel(Math.min(6,state.level+1));
  if(action==='free')switchLevel(6);
  if(action==='confirm-clear'){snapshot();state.gears[state.level]={};apply();closeModal();sound('tap');}
});
document.querySelectorAll('.part').forEach(el=>{
  el.addEventListener('click',()=>{if(el.disabled)return;state.selected=Number(el.dataset.size);save();refresh();sound('tap');});
});
function syncSize(){
  const bounds=canvas.getBoundingClientRect(),dpr=Math.min(3,window.devicePixelRatio||1);
  const w=Math.max(1,bounds.width),h=Math.max(1,bounds.height);
  const bw=Math.round(w*dpr),bh=Math.round(h*dpr);
  const changed=canvas.width!==bw||canvas.height!==bh||screen.w!==w||screen.h!==h;
  if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
  const scale=Math.min(w/360,h/500);
  screen={scale,ox:(w-360*scale)/2,oy:(h-500*scale)/2,w,h,dpr};if(changed)redraw=true;
}
function position(clientX,clientY){
  const rect=canvas.getBoundingClientRect();
  return {x:(clientX-rect.left-screen.ox)/screen.scale,y:(clientY-rect.top-screen.oy)/screen.scale};
}
function socketAt(x,y){
  let best=-1,d=26;
  level().holes.forEach((p,i)=>{const v=Math.hypot(x-p[0],y-p[1]);if(v<d){best=i;d=v;}});
  return best;
}
function gearAt(x,y){
  let best=null,d=Infinity;
  graph.nodes.forEach(n=>{
    const distance=Math.hypot(x-n.x,y-n.y);
    if(distance<n.r+7&&distance<d){best=n;d=distance;}
  });
  return best;
}
canvas.addEventListener('pointerdown',e=>{
  if(!$('modal').hidden)return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p=position(e.clientX,e.clientY),gear=gearAt(p.x,p.y);
  state.drag={pointer:e.pointerId,start:p,p,gear,from:gear&&!gear.fixed?gear.id:null,moved:false};
  redraw=true;
});
canvas.addEventListener('pointermove',e=>{
  const d=state.drag;if(!d||d.pointer!==e.pointerId)return;
  d.p=position(e.clientX,e.clientY);
  if(Math.hypot(d.p.x-d.start.x,d.p.y-d.start.y)>7)d.moved=true;
  redraw=true;
});
function endPointer(e,cancel=false){
  const d=state.drag;if(!d||d.pointer!==e.pointerId)return;state.drag=null;redraw=true;
  if(cancel)return;
  if(d.moved){
    if(d.from!=null){const slot=socketAt(d.p.x,d.p.y);if(slot>=0&&slot!==d.from)place(slot,current()[d.from],d.from);}
    return;
  }
  if(d.gear){
    if(d.gear.fixed){if(d.gear.id==='source')wind();else toast('Это выходной вал. Соедини его с приводом.');}
    else remove(d.gear.id);
    return;
  }
  const slot=socketAt(d.p.x,d.p.y);
  if(slot>=0){place(slot,state.selected);return;}
  toast('Коснись круглого посадочного гнезда');
}
canvas.addEventListener('pointerup',e=>endPointer(e));
canvas.addEventListener('pointercancel',e=>endPointer(e,true));
document.querySelectorAll('.part').forEach(el=>{
  let start=null;
  el.addEventListener('pointerdown',e=>{
    if(el.disabled)return;
    start={id:e.pointerId,x:e.clientX,y:e.clientY,size:Number(el.dataset.size),moved:false};
    try{el.setPointerCapture(e.pointerId);}catch{}
    state.selected=start.size;save();refresh();
  });
  el.addEventListener('pointermove',e=>{
    if(!start||start.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>9)start.moved=true;
    if(start.moved){const p=position(e.clientX,e.clientY);state.drag={pointer:e.pointerId,p,start:p,gear:null,from:null,fromTray:start.size,moved:true};redraw=true;}
  });
  el.addEventListener('pointerup',e=>{
    if(!start||e.pointerId!==start.id)return;
    if(start.moved){const p=position(e.clientX,e.clientY),rect=canvas.getBoundingClientRect();if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){const slot=socketAt(p.x,p.y);if(slot>=0)place(slot,start.size);}}
    start=null;state.drag=null;redraw=true;
  });
  el.addEventListener('pointercancel',()=>{start=null;state.drag=null;redraw=true;});
});
function arc(x,y,r,start=0,end=TAU){ctx.beginPath();ctx.arc(x,y,r,start,end);}
function circle(x,y,r,fill,stroke,width=1){
  arc(x,y,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}
function line(x1,y1,x2,y2,color,width=1){
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function gearPath(r,teeth){
  const inn=r-3.2,outer=r+4;
  ctx.beginPath();
  for(let k=0;k<teeth*4;k++){
    const a=(k/(teeth*4))*TAU-Math.PI/2;
    const radius=k%4===0||k%4===3?inn:outer;
    const x=Math.cos(a)*radius,y=Math.sin(a)*radius;
    if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();
}
function drawGear(n,speed,opacity=1,x=n.x,y=n.y){
  const r=n.r,t=n.size===1?10:n.size===2?14:18;
  ctx.save();ctx.globalAlpha=opacity;
  circle(x+2.6,y+5,r+6,'#071c1f99');
  ctx.translate(x,y);
  const angle=speed===null?0:(state.phase*speed*TAU/60);
  ctx.rotate(angle);
  gearPath(r,t);
  const metal=ctx.createRadialGradient(-r*.35,-r*.43,r*.12,0,0,r+7);
  metal.addColorStop(0,'#fae6ad');metal.addColorStop(.32,'#cb9b60');metal.addColorStop(.67,'#977048');metal.addColorStop(.84,'#d6b278');metal.addColorStop(1,'#493c2c');
  ctx.fillStyle=metal;ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle='#3b2d21';ctx.stroke();
  gearPath(r-3,t);ctx.strokeStyle='#ffe2a1';ctx.lineWidth=1;ctx.stroke();
  circle(0,0,r-9,'#806c4b','#eed3a0',2);
  circle(0,0,r-12,'#3f675f','#382d21',3);
  const slots=n.size===1?4:n.size===2?5:6;
  for(let i=0;i<slots;i++){
    const a=i*TAU/slots,rx=Math.cos(a)*(r-16),ry=Math.sin(a)*(r-16);
    circle(rx,ry,Math.max(2,r*.12),'#244941','#cfa773',1);
  }
  circle(0,0,10,'#edd4a0','#4d3929',2);
  circle(-2,-2,4.5,'#4b4e42','#b99d6c',1);
  line(0,-r+13,0,-10,'#f6d49b',1.3);
  ctx.restore();
}
function screw(x,y){circle(x+1,y+2,5,'#0b2829');circle(x,y,4,'#ac9a71','#253c39',1);line(x-2,y+1,x+2,y-1,'#3b463b',1);}
function label(text,x,y,color='#a9c3ae',size=10){
  ctx.fillStyle=color;ctx.font=size+'px Arial';ctx.textAlign='center';ctx.fillText(text,x,y);
}
function drawPlate(){
  const bg=ctx.createLinearGradient(0,0,360,500);
  bg.addColorStop(0,'#2b5c57');bg.addColorStop(.35,'#204f4d');bg.addColorStop(.7,'#143d3f');bg.addColorStop(1,'#092e33');
  ctx.fillStyle=bg;ctx.fillRect(0,0,360,500);
  for(let i=0;i<130;i++){
    const x=(i*71.39)%360,y=(i*123.17)%500;line(x,y,x+((i%3)+2),y+.5,i%4?'#cce2c30b':'#0b20211b',.7);
  }
  ctx.strokeStyle='#73978a55';ctx.lineWidth=1;for(let x=18;x<=342;x+=27){line(x,161,x,406,'#a1b3a00a');}for(let y=166;y<=400;y+=27){line(15,y,345,y,'#a1b3a00a');}
  const rim=ctx.createLinearGradient(0,158,0,410);rim.addColorStop(0,'#193d3e');rim.addColorStop(.5,'#32625c');rim.addColorStop(1,'#092e2f');
  ctx.fillStyle=rim;ctx.fillRect(12,156,336,256);
  ctx.strokeStyle='#879a83';ctx.lineWidth=2;ctx.strokeRect(13,157,334,254);ctx.strokeStyle='#08292a';ctx.lineWidth=4;ctx.strokeRect(18,162,324,244);
  [26,334].forEach(x=>[170,398].forEach(y=>screw(x,y)));
  // Calibration top: an inset spring cylinder and a functional brass output dial.
  ctx.fillStyle='#0b2d30';ctx.fillRect(19,84,322,66);ctx.strokeStyle='#65887b';ctx.strokeRect(20,85,320,65);
  label('ЗАПАС ХОДА',93,98,'#b7cbb7',8);label('ВЫХОДНОЙ ВАЛ',264,98,'#b7cbb7',8);
  for(let i=0;i<21;i++){
    const x=29+i*6.4;ctx.fillStyle=i*5<=state.charge?'#cfaa6f':'#385752';
    ctx.fillRect(x,110,4,15);line(x,128,x+3,128,'#c0b38b55',1);
  }
  ctx.strokeStyle='#a88c61';ctx.strokeRect(26,106,134,25);
  circle(265,122,18,'#0a2b2d','#ac996e',3);
  for(let k=0;k<12;k++){const a=k*TAU/12;line(265+Math.cos(a)*12.5,122+Math.sin(a)*12.5,265+Math.cos(a)*15.5,122+Math.sin(a)*15.5,'#c2b382',1);}
  const out=graph&&graph.output||0,needle=(Math.sign(out)*Math.min(1,Math.abs(out)/40))*1.3;
  const theta=Math.PI/2+needle;
  line(265,122,265+Math.cos(theta)*11,122-Math.sin(theta)*11,'#eac58d',2);
  circle(265,122,3,'#deb77b');
  label(out?'ОБ/МИН '+labelRPM(out):'НЕТ ХОДА',265,145,'#b6cfb8',8);
  // Foot brass transmission markings.
  label('M E C H A N I C A  /  P A T E N T   N°  0 1',180,448,'#c7af83',8);
  line(38,458,322,458,'#7f9e8b',1);
  label('ВЕДУЩИЙ',80,427,'#a9bca7',9);label('ВЕДОМЫЙ',280,427,'#a9bca7',9);
}
function drawSocket(x,y,occupied,index){
  circle(x+1.5,y+3,11,'#0b2527');
  circle(x,y,9,'#0d3436','#779689',2);
  circle(x,y,4,'#071f21','#b49b71',1);
  if(!occupied){
    const pulse=state.drag&&socketAt(state.drag.p.x,state.drag.p.y)===index;
    if(pulse){circle(x,y,15,null,'#f9d99d',2);}
    line(x-16,y,x-10,y,'#99a694',1);line(x+10,y,x+16,y,'#99a694',1);
    line(x,y-16,x,y-10,'#99a694',1);line(x,y+10,x,y+16,'#99a694',1);
  }
}
function drawSourceAndTarget(){
  const p=level();const source=graph.nodes[0],target=graph.nodes[1];
  [source,target].forEach(n=>{
    circle(n.x+1,n.y+2,n.r+13,'#0e3132','#8b9479',3);
    circle(n.x,n.y,n.r+9,'#173f40','#43635c',2);
  });
  label('01',source.x,source.y-source.r-19,'#c9b18b',10);
  label('02',target.x,target.y-target.r-19,'#c9b18b',10);
  graph.nodes.forEach((n,i)=>drawGear(n,graph.rpm[i]));
  // A radial crank handle over the driver, and the eccentric drive pin of the output.
  const a=state.phase*BASE_RPM*TAU/60;
  const x=source.x+Math.cos(a)*11,y=source.y+Math.sin(a)*11;
  circle(x,y,5,'#e4c382','#533924',1.3);
  if(graph.output!==null){
    const b=state.phase*graph.output*TAU/60;
    const r=target.r*.48;
    const px=target.x+Math.cos(b)*r,py=target.y+Math.sin(b)*r;
    line(target.x,target.y,px,py,'#f4cc88',3);
    circle(px,py,5,'#e8cd92','#3c2e20',1.3);
  }
}
function drawConnections(){
  if(!state.running)return;
  graph.links.forEach((adj,i)=>{
    adj.forEach(j=>{
      if(j<=i||graph.rpm[i]===null||graph.rpm[j]===null)return;
      const a=graph.nodes[i],b=graph.nodes[j],angle=Math.atan2(b.y-a.y,b.x-a.x);
      const cx=a.x+Math.cos(angle)*a.r,cy=a.y+Math.sin(angle)*a.r;
      circle(cx,cy,2.6,'#fbe7ae99');
    });
  });
}
function render(){
  if(!ctx)return;syncSize();
  ctx.setTransform(screen.dpr,0,0,screen.dpr,0,0);
  ctx.clearRect(0,0,screen.w,screen.h);
  ctx.translate(screen.ox,screen.oy);ctx.scale(screen.scale,screen.scale);
  drawPlate();
  level().holes.forEach((h,i)=>drawSocket(h[0],h[1],current()[i]!=null,i));
  drawSourceAndTarget();drawConnections();
  const d=state.drag;
  if(d&&d.moved&&(d.from!=null||d.fromTray!=null)){
    const size=d.fromTray||current()[d.from];
    if(size){drawGear({r:RADII[size],size},null,.70,d.p.x,d.p.y);}
  }
  if(state.flash>0){
    ctx.strokeStyle='rgba(241,210,143,'+(state.flash*.55)+')';ctx.lineWidth=4;ctx.strokeRect(19,163,322,242);
  }
  redraw=false;
}
function tick(ts){
  if(document.hidden){raf=0;return;}
  const dt=Math.min(.055,(ts-(lastTime||ts))/1000);lastTime=ts;
  if(state.running){
    state.phase+=dt;
    state.runTime+=dt;
    state.charge=Math.max(0,state.charge-dt*16);
    if(state.runTime>(state.level===6?1.85:1.85)||state.charge<=0){save();finish();}
    redraw=true;
  }
  if(state.flash>0){state.flash=Math.max(0,state.flash-dt*.9);redraw=true;}
  if(redraw||state.running)render();
  raf=requestAnimationFrame(tick);
}
function startLoop(){if(!raf){lastTime=0;raf=requestAnimationFrame(tick);}}
window.addEventListener('resize',()=>{syncSize();redraw=true;startLoop();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;save();}
  else{redraw=true;startLoop();}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('modal').hidden)closeModal();
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&$('modal').hidden){e.preventDefault();$('undo').click();}
});
window.addEventListener('pagehide',save);
window.__AI_TEST_STATE__=()=>({level:state.level,solved:[...state.solved],gears:{...current()},charge:state.charge,running:state.running,connected:getGraph().connected,output:getGraph().output,jam:getGraph().jam});
$('sound').classList.toggle('off',!state.sound);
if(state.level>0&&state.level<6&&!state.solved[state.level-1])state.level=0;
if(remaining(state.selected)<=0)state.selected=[1,2,3].find(s=>remaining(s)>0)||2;
refresh();startLoop();
