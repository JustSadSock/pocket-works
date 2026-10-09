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
const state={...restore(),running:false,runTime:0,phase:0,runResult:null,history:[],drag:null,toastTimer:0,flash:0,winShown:false,spinFactor:0,impact:null};
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
  const dial=document.querySelector('.wind-dial');if(dial)dial.style.setProperty('--charge',state.charge+'%');
  const signal=$('link-indicator'),connected=graph.connected&&!graph.jam;
  signal.classList.toggle('connected',connected);signal.classList.toggle('jammed',graph.jam);
  $('link-label').textContent=graph.jam?'ЗАКЛИНИЛО':connected?'ПРИВОД СОЕДИНЁН':'ПРИВОД РАЗОМКНУТ';
  $('run').setAttribute('aria-label',state.running?'Остановить механизм':'Запустить механизм');
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
  snapshot();state.gears[state.level]=trial;apply();sound('place');state.flash=.32;
  state.impact={id:index,x,y,t:0};redraw=true;
  try{window.navigator?.vibrate?.(12);}catch{}
  return true;
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
  state.spinFactor=0;
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
$('sound').setAttribute('aria-pressed',String(state.sound));
  $('sound').setAttribute('aria-pressed',String(state.sound));
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
  const impact=state.impact&&state.impact.id===n.id?state.impact:null;
  const drop=impact ? -Math.pow(1-impact.t/.34,2)*4*Math.cos(impact.t*26) : 0;
  circle(x+3,y+7,r+7,'#03191cbd');
  ctx.translate(x,y+drop);
  const angle=speed===null?0:state.phase*speed*TAU/60;
  ctx.rotate(angle);
  // Layered tooth flank, body and bevel: each polygon remains coupled to the same shaft angle.
  ctx.save();ctx.translate(0,5.5);gearPath(r,t);ctx.fillStyle='#392b22';ctx.fill();
  ctx.translate(0,-2);gearPath(r,t);ctx.fillStyle='#735234';ctx.fill();
  ctx.restore();
  gearPath(r,t);
  const metal=ctx.createLinearGradient(-r,-r,r,r);
  metal.addColorStop(0,'#ffdf9f');metal.addColorStop(.22,'#d6a86c');
  metal.addColorStop(.46,'#b1834d');metal.addColorStop(.7,'#865e36');
  metal.addColorStop(.88,'#d7af72');metal.addColorStop(1,'#fff0bf');
  ctx.fillStyle=metal;ctx.fill();ctx.lineWidth=1.7;ctx.strokeStyle='#36281d';ctx.stroke();
  gearPath(r-3,t);ctx.strokeStyle='#ffe1aa99';ctx.lineWidth=.85;ctx.stroke();
  // Engraved concentric machining lines and recessed apertures.
  circle(0,0,r-8,'#6e5034','#f2ce8d',1.3);
  circle(0,0,r-11,'#a58050','#4d3b27',1);
  ctx.lineWidth=.6;ctx.strokeStyle='#ffdc9d5a';
  for(let k=0;k<3;k++){arc(0,0,r-12.3-k*2.1);ctx.stroke();}
  const slots=n.size===1?4:n.size===2?5:6;
  for(let i=0;i<slots;i++){
    const a=i*TAU/slots;
    const rx=Math.cos(a)*(r-15),ry=Math.sin(a)*(r-15);
    const hole=Math.max(2.8,r*.107);
    circle(rx,ry,hole+1,'#553f2c','#dbab6b',.7);
    circle(rx-.4,ry-.6,hole-.7,'#233b39','#866b47',.6);
  }
  const hub=ctx.createRadialGradient(-3,-4,2,0,0,12);
  hub.addColorStop(0,'#fff1c3');hub.addColorStop(.28,'#c79f62');hub.addColorStop(.8,'#76552f');hub.addColorStop(1,'#3e2d1f');
  circle(0,1,11,hub,'#2a251e',2);
  circle(0,-1,5.1,'#344844','#e7c68b',1.5);
  circle(-1.1,-2.2,1.3,'#ffebbd');
  line(0,-r+12,0,-r+5,'#fff0c1',1.8);
  ctx.restore();
}
function screw(x,y){circle(x+1,y+2,5,'#0b2829');circle(x,y,4,'#ac9a71','#253c39',1);line(x-2,y+1,x+2,y-1,'#3b463b',1);}
function label(text,x,y,color='#a9c3ae',size=10){
  ctx.fillStyle=color;ctx.font=size+'px Arial';ctx.textAlign='center';ctx.fillText(text,x,y);
}
function drawPlate(){
  const bg=ctx.createRadialGradient(145,188,28,180,280,435);
  bg.addColorStop(0,'#3a5750');bg.addColorStop(.43,'#213c3c');bg.addColorStop(1,'#091e25');
  ctx.fillStyle=bg;ctx.fillRect(0,0,360,500);
  // Fine lathed grain, lacquer scratches and shallow reflected light.
  for(let i=0;i<208;i++){
    const x=(i*73.39)%360,y=(i*127.17)%500;
    line(x,y,x+(i%4+1)*1.7,y+(i%3-1)*.7,i%5===0?'#c7b78b18':'#07181824',.7);
  }
  const bevel=ctx.createLinearGradient(0,152,0,418);
  bevel.addColorStop(0,'#90866c');bevel.addColorStop(.03,'#273936');
  bevel.addColorStop(.06,'#0b2225');bevel.addColorStop(.95,'#0b2225');
  bevel.addColorStop(.98,'#637560');bevel.addColorStop(1,'#101f22');
  ctx.fillStyle=bevel;ctx.fillRect(7,153,346,269);
  ctx.strokeStyle='#bbaf86';ctx.lineWidth=1.5;ctx.strokeRect(8,153,344,267);
  const well=ctx.createRadialGradient(155,260,10,178,305,240);
  well.addColorStop(0,'#385954');well.addColorStop(.62,'#193e40');
  well.addColorStop(1,'#0a2a30');
  ctx.fillStyle=well;ctx.fillRect(17,164,326,242);
  ctx.strokeStyle='#0a2224';ctx.lineWidth=4;ctx.strokeRect(17,164,326,242);
  ctx.strokeStyle='#7d917d';ctx.lineWidth=1;ctx.strokeRect(20,167,320,235);
  // Cast metal texture and precisely milled registration grid.
  for(let i=0;i<8;i++){
    const x=36+i*41;line(x,179,x,392,'#c3d2b013',.65);
  }
  for(let j=0;j<6;j++){
    const y=190+j*39;line(28,y,332,y,'#c3d2b013',.65);
  }
  for(let i=0;i<190;i++){
    const x=25+(i*47.7)%310,y=174+(i*83.7)%225;
    circle(x,y,.38,i%3?'#a2b6a713':'#091b1f37');
  }
  [29,331].forEach(x=>[171,399].forEach(y=>{
    circle(x+1,y+3,8,'#06191a','#485046',1);
    circle(x,y,5,'#a88d5f','#e7d0a0',1);
    line(x-2.4,y+2.2,x+2.4,y-2.2,'#36332c',1.5);
  }));
  // Top mounted dual binnacle: spring reserve and output tachometer.
  ctx.fillStyle='#0b1f22';ctx.fillRect(21,81,318,69);
  ctx.strokeStyle='#927d59';ctx.lineWidth=1.5;ctx.strokeRect(22,82,316,68);
  line(23,85,337,85,'#ebc98d55',1);
  const glass=ctx.createLinearGradient(20,87,20,144);glass.addColorStop(0,'#1a3534');
  glass.addColorStop(.5,'#0f282c');glass.addColorStop(1,'#203d39');
  ctx.fillStyle=glass;ctx.fillRect(25,87,309,58);
  label('РЕСУРС ПРУЖИНЫ',105,99,'#bdc2a8',7.7);
  label('ОБОРОТЫ / МИН',267,99,'#bdc2a8',7.7);
  // Energy display consists of twenty-one physically seated brass shutters.
  for(let i=0;i<21;i++){
    const x=30+i*6.4,active=i*5<=state.charge;
    ctx.fillStyle=active?'#bd9053':'#263b38';ctx.fillRect(x,108,4.5,25);
    if(active){line(x+.7,109,x+.7,130,'#ffe8aa98',1);line(x+4,109,x+4,130,'#503e30',.8);}
    else line(x+2,108,x+2,130,'#6e817540',.8);
  }
  ctx.strokeStyle='#a99166';ctx.lineWidth=1;ctx.strokeRect(27,105,141,31);
  // Glass-covered output dial.
  circle(265,121,20,'#0a1a20','#bca577',3);
  circle(265,121,17,'#213e3e','#e5cb96',.7);
  for(let k=0;k<13;k++){
    const a=(k/12)*Math.PI*1.45+Math.PI*.78;
    line(265+Math.cos(a)*12,121+Math.sin(a)*12,265+Math.cos(a)*15.4,121+Math.sin(a)*15.4,'#e0c38c',1);
  }
  const out=graph&&graph.output||0;
  const needle=(Math.sign(out)*Math.min(1,Math.abs(out)/36))*1.4;
  const theta=-Math.PI/2+needle;
  line(265,121,265+Math.cos(theta)*13,121+Math.sin(theta)*13,'#f2d197',1.9);
  circle(265,121,3,'#d7b981','#3d3027',.6);
  arc(261,116,14,Math.PI*1.14,Math.PI*1.65);ctx.strokeStyle='#f2f6e64b';ctx.lineWidth=1.3;ctx.stroke();
  label(out?'ВАЛ '+labelRPM(out)+' RPM':'НЕТ ХОДА',265,145,'#ccb988',7.7);
  label('МАШИННОЕ ОТДЕЛЕНИЕ',180,439,'#c3b38e',8.2);
  line(42,448,318,448,'#a493685d',1);
  label('ИСТОЧНИК',79,429,'#bac9ac',8);
  label('ВЫХОД',280,429,'#bac9ac',8);
  label('ПЕРЕДАЧИ  /  ПАТЕНТ   M-01',180,469,'#9aaf99',7.5);
}
function drawSocket(x,y,occupied,index){
  circle(x+2,y+4,15,'#081c1ea6');
  circle(x,y,13,'#5b6856','#142e2e',2.4);
  circle(x,y,10,'#172b2d','#c2a675',2);
  circle(x,y,6,'#081a1e','#536b64',1);
  circle(x-1,y-1,2.4,'#121e20','#c6aa79',.8);
  if(!occupied){
    const pulse=state.drag&&socketAt(state.drag.p.x,state.drag.p.y)===index;
    if(pulse){
      circle(x,y,18,'#d4b37523','#ffdda0',1.7);
      for(let k=0;k<4;k++){
        const a=k*TAU/4+Math.PI/4;
        line(x+Math.cos(a)*19,y+Math.sin(a)*19,x+Math.cos(a)*24,y+Math.sin(a)*24,'#f7dba7',1.5);
      }
    }
    ctx.save();ctx.setLineDash([2,3]);
    arc(x,y,20,0,TAU);ctx.strokeStyle='#a9ad8b6a';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  }
}
function drawSourceAndTarget(){
  const p=level();const source=graph.nodes[0],target=graph.nodes[1];
  [source,target].forEach(n=>{
    circle(n.x+3,n.y+6,n.r+15,'#071b1cda','#293e3a',1);
    circle(n.x,n.y,n.r+12,'#4a584a','#ba9e6c',3);
    circle(n.x,n.y,n.r+8,'#193d3b','#364e42',2);
    for(let i=0;i<8;i++){const a=i*TAU/8;circle(n.x+Math.cos(a)*(n.r+10),n.y+Math.sin(a)*(n.r+10),1.3,'#e2c793');}
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
  if(state.impact){
    const i=state.impact,progress=Math.min(1,i.t/.34);
    const alpha=Math.max(0,(1-progress)*.7);
    circle(i.x,i.y,RADII[current()[i.id]||2]+7+progress*18,null,'rgba(255,220,151,'+alpha+')',2-progress);
  }
  if(state.flash>0){
    ctx.strokeStyle='rgba(239,187,94,'+(state.flash*.45)+')';ctx.lineWidth=2.4;ctx.strokeRect(21,168,318,233);
  }
  redraw=false;
}
function tick(ts){
  if(document.hidden){raf=0;return;}
  const dt=Math.min(.055,(ts-(lastTime||ts))/1000);lastTime=ts;
  if(state.running){
    const jammed=state.runResult&&state.runResult.jam;
    const wanted=jammed ? .065 : 1;
    state.spinFactor+=(wanted-state.spinFactor)*Math.min(1,dt*(jammed?17:3.7));
    state.runTime+=dt;
    state.charge=Math.max(0,state.charge-dt*16);
    if(state.runTime>=1.85||state.charge<=0){save();finish();}
    redraw=true;
  }else if(state.spinFactor>.002){
    state.spinFactor*=Math.exp(-dt*7);
    redraw=true;
  }
  if(state.spinFactor>.002)state.phase+=dt*state.spinFactor;
  if(state.impact){
    state.impact.t+=dt;
    if(state.impact.t>=.34)state.impact=null;
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
