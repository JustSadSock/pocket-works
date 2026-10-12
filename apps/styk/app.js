import {WORLD,STATS,SCENARIOS,makeGame,orderUnit,getEnds,lineFromEnds,planEnemy,stepBattle,closeRound,status,strength,safeLoad,serialize} from './core.js';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
installMobileRuntime();

const $=id=>document.getElementById(id);
const canvas=$('field'),ctx=canvas.getContext('2d',{alpha:false});
const KEY='pocket-works:styk:campaign-v1';
const colors={friend:'#375d6a',enemy:'#945241',friendLight:'#96c1be',enemyLight:'#e4a486'};
let game=makeGame(0),selected='f0',mode='home',chapter=0,unlocked=0,sound=true,drag=null,preview=null,playing=false;
let frame=0,acc=0,lastTime=0,roundTime=0,speed=1,particles=[],arrows=[],worldCache=null,cacheTerrain='',scale=1,ox=0,oy=0,viewW=0,viewH=0,toastTimer=0,ac=null;
let initial={friend:1,enemy:1},pausedFrom='plan',uiAccumulator=0;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,t)=>a+(b-a)*clamp(t,0,1);
const range=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const seed=(n)=>{let x=(n|0)||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}};
const rnd=seed(9938);
function stored(){
 try{
  let s=JSON.parse(localStorage.getItem(KEY)||'null');
  return s&&s.v===1&&Number.isInteger(s.unlocked)&&s.unlocked>=0&&s.unlocked<=2?s:null;
 }catch{return null;}
}
function save(){
 try{localStorage.setItem(KEY,JSON.stringify({v:1,unlocked,chapter:game.stage,battle:serialize(game),sound}));}catch{}
}
function prepareInitial(){
 initial.friend=game.units.filter(u=>u.side==='friend').reduce((a,b)=>a+b.maxMen,0);
 initial.enemy=game.units.filter(u=>u.side==='enemy').reduce((a,b)=>a+b.maxMen,0);
}
function announce(msg){
 $('feedback').textContent=msg;$('feedback').classList.add('visible');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('feedback').classList.remove('visible'),2700);
}
function audio(kind){
 if(!sound)return;
 try{
  ac=ac||new (window.AudioContext||window.webkitAudioContext)();
  if(ac.state==='suspended')ac.resume();
  const oscillator=ac.createOscillator(),gain=ac.createGain(),filter=ac.createBiquadFilter();
  const t=ac.currentTime;
  oscillator.type=kind==='battle'?'sawtooth':kind==='rout'?'triangle':'sine';
  oscillator.frequency.setValueAtTime(kind==='battle'?138:kind==='rout'?190:440,t);
  oscillator.frequency.exponentialRampToValueAtTime(kind==='battle'?66:kind==='rout'?95:kind==='select'?580:320,t+.15);
  filter.type='lowpass';filter.frequency.value=kind==='battle'?410:1000;
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(kind==='battle'?.035:.021,t+.015);gain.gain.exponentialRampToValueAtTime(.0001,t+.16);
  oscillator.connect(filter);filter.connect(gain);gain.connect(ac.destination);
  oscillator.start(t);oscillator.stop(t+.17);
 }catch{}
}
function buzz(){if(navigator.vibrate)navigator.vibrate(10);}
function chapterButtons(){
 const host=$('chapters');host.replaceChildren();
 SCENARIOS.forEach((sc,i)=>{
  const b=document.createElement('button');b.type='button';
  b.className='chapter'+(chapter===i?' current':'');
  b.disabled=i>unlocked;
  b.innerHTML='<span class="chapter-numeral">'+String(i+1).padStart(2,'0')+'</span><span class="chapter-label">'+sc.name+'</span><span class="chapter-state">'+(i>unlocked?'Закрыто':i<unlocked?'Пройдено':'Доступно')+'</span>';
  b.addEventListener('click',()=>{chapter=i;audio('select');chapterButtons();updateHome();});
  host.appendChild(b);
 });
}
function updateHome(){
 const s=stored();
 $('home-title').textContent=SCENARIOS[chapter].name;
 $('home-subtitle').textContent=SCENARIOS[chapter].subtitle;
 $('start').textContent=(s&&s.chapter===chapter&&s.battle&&!safeLoad(s.battle)?.winner)?'Продолжить сражение':'Начать сражение';
}
function showHome(){
 mode='home';playing=false;$('home').hidden=false;$('pause').hidden=true;$('result').hidden=true;
 $('dock').classList.add('inactive');chapterButtons();updateHome();updateHud();
}
function startBattle(continueSave=true){
 const s=stored();
 let recovered=continueSave&&s&&s.chapter===chapter?safeLoad(s.battle):null;
 if(recovered?.winner)recovered=null;
 game=recovered||makeGame(chapter);game.events.length=0;
 game.winner=null;selected=game.units.find(u=>u.side==='friend'&&!u.routed)?.id||null;
 prepareInitial();cacheTerrain='';particles=[];arrows=[];preview=null;drag=null;
 mode='plan';playing=false;
 $('home').hidden=true;$('pause').hidden=true;$('result').hidden=true;
 $('dock').classList.remove('inactive');
 save();audio('select');updateHud();
 announce(recovered?'Сражение восстановлено.':'Выберите синий отряд, затем укажите точку на поле.');
}
function pause(){
 if(mode!=='plan'&&mode!=='battle')return;
 pausedFrom=mode;if(mode==='battle')playing=false;
 mode='pause';$('pause').hidden=false;updateHud();audio('select');
}
function resume(){
 if(mode!=='pause')return;
 mode=pausedFrom;playing=pausedFrom==='battle';$('pause').hidden=true;updateHud();
}
function endScreen(winner){
 playing=false;mode='end';
 $('result').hidden=false;
 const victory=winner==='friend';
 $('result').dataset.outcome=victory?'victory':'defeat';
 $('result-kicker').textContent=victory?'ПОБЕДА':'ПОРАЖЕНИЕ';
 $('result-title').textContent=victory?'Фронт устоял':'Линия рассыпалась';
 $('result-copy').textContent=victory?'Неприятель отступил. Вы удержали целостность своих отрядов и сломали его боевой порядок.':'Вражеское давление разрушило строй. Попробуйте уплотнить копейщиков и вывести конницу во фланг.';
 $('result-score').textContent='Свои: '+strength(game,'friend')+' · Противник: '+strength(game,'enemy');
 $('next').textContent=victory&&game.stage<2?'Следующее сражение':'Повторить бой';
 if(victory)unlocked=Math.max(unlocked,Math.min(2,game.stage+1));
 save();audio(victory?'select':'rout');updateHud();
}
function runTurn(){
 if(mode!=='plan'||playing)return;
 mode='battle';playing=true;roundTime=0;acc=0;speed=1;preview=null;drag=null;
 planEnemy(game);audio('battle');buzz();updateHud();save();
}
function finishTurn(){
 playing=false;
 const result=closeRound(game);
 if(result){endScreen(result);return;}
 mode='plan';
 selected=game.units.find(u=>u.id===selected&&!u.routed)?.id||game.units.find(u=>u.side==='friend'&&!u.routed)?.id||null;
 save();updateHud();
 if(game.round===2)announce('Новые два приказа. Уже отданные приказы сохраняются.');
 else if(game.events.some(e=>e.type==='rout'))announce('Разрыв строя! Поддерживайте соседние отряды.');
}
function stanceText(s){return {hold:'Держать',advance:'Вперёд',charge:'Натиск',withdraw:'Отход'}[s]||'Держать'}
function updateHud(){
 const sc=SCENARIOS[game.stage],u=game.units.find(x=>x.id===selected&&!x.routed);
 $('round').textContent='ХОД '+String(game.round).padStart(2,'0')+' / '+sc.rounds;
 $('phase').textContent=mode==='battle'?'СТОЛКНОВЕНИЕ':mode==='end'?'ИТОГ':mode==='home'?'КАМПАНИЯ':'ПРИКАЗЫ';
 const ff=game.units.filter(x=>x.side==='friend').reduce((n,x)=>n+(x.routed?0:x.men),0);
 const ee=game.units.filter(x=>x.side==='enemy').reduce((n,x)=>n+(x.routed?0:x.men),0);
 $('friend-men').textContent=ff;$('enemy-men').textContent=ee;
 $('friend-progress').style.width=Math.max(0,ff/initial.friend*100)+'%';
 $('enemy-progress').style.width=Math.max(0,ee/initial.enemy*100)+'%';
 $('scenario').textContent=sc.name;
 $('commands').textContent=String(game.remaining)+' / 2';
 $('unit-name').textContent=u?STATS[u.type].label:'Выберите отряд';
 $('unit-details').textContent=u?(u.men+' воинов · '+Math.round(u.morale)+'% дух · '+Math.round(u.cohesion)+'% строй'):'Коснитесь своего знамени';
 $('unit-color').style.background=u?colors.friend:'transparent';
 document.querySelectorAll('[data-stance]').forEach(el=>{
  el.classList.toggle('chosen',u?.target.stance===el.dataset.stance);
  el.disabled=mode!=='plan'||!u||(game.remaining===0&&!game.edited.includes(u.id));
 });
 $('execute').disabled=mode!=='plan';$('speed').hidden=mode!=='battle';
 $('speed').textContent=speed===1?'1×':'2×';
 $('command-help').textContent=mode==='battle'?'Смотрите, где рвётся линия':!u?'Выберите синий отряд':
  game.remaining===0?'Приказы исчерпаны · начинайте ход':
  game.edited.includes(u.id)?'Переместите стяг или потяните край линии':'Коснитесь поля для движения · тяните края строя';
 $('play-label').textContent=mode==='battle'?'Идёт бой':mode==='end'?'Сражение окончено':'Выполнить приказы';
 $('execute').textContent='Выполнить ход';
 $('dock').classList.toggle('in-battle',mode==='battle');
}
function select(id){
 if(mode!=='plan')return;
 const u=game.units.find(x=>x.id===id&&x.side==='friend'&&!x.routed);
 if(!u)return;
 selected=id;preview=null;audio('select');updateHud();
}
function setOrder(patch){
 if(!selected)return;
 if(!orderUnit(game,selected,patch)){announce('Все приказы потрачены. Выполните ход.');return;}
 save();updateHud();
}
function worldPoint(e){
 const r=canvas.getBoundingClientRect();
 return {x:(e.clientX-r.left-ox)/scale,y:(e.clientY-r.top-oy)/scale};
}
function lineDist(p,a,b){
 let dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
 return Math.hypot(p.x-(a.x+dx*t),p.y-(a.y+dy*t));
}
function friendlyAt(p){
 let best=null,bd=70;
 for(const u of game.units){
  if(u.side!=='friend'||u.routed)continue;
  const ends=getEnds(u.x,u.y,u.angle,u.width);
  const d=Math.min(range(p,u),lineDist(p,ends[0],ends[1]));
  if(d<bd){best=u;bd=d;}
 }
 return best;
}
canvas.addEventListener('pointerdown',e=>{
 if(mode!=='plan')return;
 const p=worldPoint(e);
 if(p.x<0||p.x>WORLD.w||p.y<0||p.y>WORLD.h)return;
 try{canvas.setPointerCapture(e.pointerId)}catch{}
 const u=game.units.find(x=>x.id===selected);
 const t=preview||u?.target;
 if(u&&!u.routed&&t){
   const ends=getEnds(t.x,t.y,t.angle,t.width);
   const hitRadius=29/Math.max(.55,scale);
   const j=ends.findIndex(q=>range(q,p)<hitRadius);
   if(j>=0){drag={kind:'edge',index:j,initial:p,base:{...t},other:ends[1-j],moved:false};return;}
   if(range(p,t)<49/Math.max(.55,scale)){drag={kind:'center',initial:p,base:{...t},moved:false};return;}
 }
 const found=friendlyAt(p);
 if(found){select(found.id);drag={kind:'center',initial:p,base:{...found.target},moved:false,pick:true};return;}
 drag={kind:'point',initial:p,moved:false};
});
canvas.addEventListener('pointermove',e=>{
 if(!drag||mode!=='plan')return;
 const p=worldPoint(e);
 const dx=p.x-drag.initial.x,dy=p.y-drag.initial.y;
 if(Math.hypot(dx,dy)>9)drag.moved=true;
 if(!drag.moved)return;
 if(drag.kind==='edge'){
  const fixed=drag.other,changed={x:clamp(p.x,20,740),y:clamp(p.y,40,960)};
  preview=lineFromEnds(drag.index===0?changed:fixed,drag.index===0?fixed:changed,drag.base.angle);
  preview={...drag.base,...preview,width:clamp(preview.width,68,226)};
 }else if(drag.kind==='center'){
  preview={...drag.base,x:clamp(drag.base.x+dx,34,726),y:clamp(drag.base.y+dy,40,960),stance:drag.base.stance==='hold'?'advance':drag.base.stance};
 }else if(drag.kind==='point'){
  preview={...(game.units.find(u=>u.id===selected)?.target||{}),x:clamp(p.x,34,726),y:clamp(p.y,40,960),stance:'advance'};
 }
});
function releasePointer(e){
 if(!drag||mode!=='plan')return;
 const d=drag;drag=null;
 if(d.moved&&preview){
  const order=preview;preview=null;setOrder(order);
 }else if(d.kind==='point'){
  const p=worldPoint(e);
  const found=friendlyAt(p);
  if(found)select(found.id);
  else if(p.x>=0&&p.x<=WORLD.w&&p.y>=0&&p.y<=WORLD.h&&selected){
   const u=game.units.find(q=>q.id===selected);
   setOrder({...u.target,x:clamp(p.x,34,726),y:clamp(p.y,40,960),stance:u.target.stance==='hold'?'advance':u.target.stance});
  }
 }else preview=null;
}
canvas.addEventListener('pointerup',releasePointer);
canvas.addEventListener('pointercancel',()=>{drag=null;preview=null;});
function onResize(){
 const rect=canvas.getBoundingClientRect();
 viewW=rect.width;viewH=rect.height;
 const dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.max(1,Math.round(viewW*dpr));canvas.height=Math.max(1,Math.round(viewH*dpr));
 scale=Math.min(viewW/WORLD.w,viewH/WORLD.h);ox=(viewW-WORLD.w*scale)/2;oy=(viewH-WORLD.h*scale)/2;
}
new ResizeObserver(onResize).observe(canvas);
window.addEventListener('resize',onResize);
function drawTree(c,x,y,r,shade){
 c.save();
 c.fillStyle='rgba(41,54,39,.22)';c.beginPath();c.ellipse(x+6,y+9,r*1.13,r*.68,-.25,0,Math.PI*2);c.fill();
 c.fillStyle='#4e5944';c.fillRect(x-1,y-5,3,14);
 for(let i=0;i<6;i++){
  const a=i*1.04+shade*1.4,rr=r*(.45+(i%3)*.09);
  c.fillStyle=['#586b4e','#637656','#7d875e','#4e6650'][((i+shade*7)|0)%4];
  c.beginPath();c.arc(x+Math.cos(a)*r*.33,y+Math.sin(a)*r*.27,rr,0,Math.PI*2);c.fill();
 }
 c.fillStyle='rgba(207,213,157,.17)';c.beginPath();c.ellipse(x-r*.22,y-r*.2,r*.42,r*.18,-.45,0,Math.PI*2);c.fill();
 c.restore();
}
function terrain(){
 const sc=SCENARIOS[game.stage];
 if(worldCache&&cacheTerrain===sc.terrain)return worldCache;
 cacheTerrain=sc.terrain;
 const off=document.createElement('canvas');off.width=WORLD.w;off.height=WORLD.h;
 const c=off.getContext('2d');const random=seed(9841+game.stage*163);
 c.fillStyle='#a6af88';c.fillRect(0,0,760,1000);
 const g=c.createLinearGradient(0,0,760,1000);g.addColorStop(0,'rgba(219,211,159,.26)');g.addColorStop(.6,'rgba(38,67,49,.025)');g.addColorStop(1,'rgba(51,68,50,.18)');c.fillStyle=g;c.fillRect(0,0,760,1000);
 // Ground color broken up as low-frequency field shapes.
 for(let i=0;i<130;i++){
  const x=random()*820-30,y=random()*1060-30,r=24+random()*92;
  c.fillStyle=i%3===0?'rgba(69,102,66,.05)':i%3===1?'rgba(238,217,152,.048)':'rgba(108,92,63,.033)';
  c.beginPath();c.ellipse(x,y,r,r*(.2+random()*.45),random()*Math.PI,0,Math.PI*2);c.fill();
 }
 // Cultivated tracks.
 c.save();c.strokeStyle='rgba(112,100,67,.13)';c.lineWidth=48;c.lineCap='round';
 c.beginPath();c.moveTo(80,1020);c.bezierCurveTo(280,750,410,530,660,-25);c.stroke();
 c.strokeStyle='rgba(232,211,156,.13)';c.lineWidth=28;c.stroke();c.restore();
 if(sc.terrain==='ford'){
  function brook(yshift){
   c.beginPath();c.moveTo(-20,470+yshift);
   for(let i=0;i<=8;i++){let x=i*110;c.lineTo(x,470+yshift+Math.sin(i*.86)*17);}
   c.lineTo(780,527+yshift);for(let i=8;i>=0;i--){let x=i*110;c.lineTo(x,527+yshift+Math.sin(i*.86)*17);}
   c.closePath();
  }
  brook(0);c.fillStyle='#677d78';c.fill();c.strokeStyle='rgba(59,83,79,.38)';c.lineWidth=4;c.stroke();
  c.save();c.beginPath();c.rect(285,443,190,125);c.clip();
  c.fillStyle='#988f69';c.fillRect(285,443,190,125);c.strokeStyle='#c2b38a';c.lineWidth=7;
  for(let i=0;i<15;i++){let x=290+i*13;c.beginPath();c.moveTo(x,469);c.lineTo(x+3,535);c.stroke();}
  c.restore();
  for(let i=0;i<36;i++){
   let x=random()*760,y=481+random()*38+Math.sin(x/110)*10;
   if(x>274&&x<479)continue;
   c.strokeStyle=i%2?'rgba(224,228,194,.37)':'rgba(60,91,91,.24)';c.lineWidth=1+random()*2;
   c.beginPath();c.moveTo(x,y);c.lineTo(x+12+random()*19,y-2);c.stroke();
  }
 }else if(sc.terrain==='hill'){
  for(let i=6;i>=1;i--){
   c.fillStyle=i%2===0?'rgba(207,194,144,.13)':'rgba(95,100,59,.075)';
   c.beginPath();c.ellipse(375,477,285-i*29,160-i*14,-.06,0,Math.PI*2);c.fill();
   c.strokeStyle='rgba(89,104,71,.18)';c.lineWidth=2;c.stroke();
  }
 }else{
  for(let side of [0,1]){
   c.fillStyle='rgba(57,82,56,.085)';c.beginPath();
   c.ellipse(side?665:78,515,135,205,side?-.3:.25,0,Math.PI*2);c.fill();
  }
 }
 // Thousands of tiny physically consistent grass blades, baked only once.
 for(let i=0;i<3600;i++){
  const x=random()*760,y=random()*1000;
  if(sc.terrain==='ford'&&y>475&&y<532&&!(x>280&&x<480))continue;
  const len=2+random()*6;
  c.strokeStyle=random()<.63?'rgba(58,95,60,.20)':'rgba(239,231,164,.24)';
  c.lineWidth=.6+random()*.55;
  c.beginPath();c.moveTo(x,y);c.lineTo(x-1-random()*2,y-len);c.stroke();
 }
 // Canopies are clustered away from the main tactical axes.
 let trees=[];
 if(sc.terrain==='ford')trees=[[49,229,30],[77,272,32],[713,630,28],[677,668,39],[39,639,31],[59,692,37],[716,192,31],[683,161,29],[50,375,20],[715,825,38]];
 if(sc.terrain==='grove')trees=[[50,400,32],[83,429,37],[106,492,43],[73,568,39],[33,650,31],[689,387,31],[665,470,44],[713,542,42],[694,623,36],[74,270,28],[620,751,27],[48,838,25]];
 if(sc.terrain==='hill')trees=[[48,284,30],[91,335,29],[688,235,28],[700,690,38],[65,725,31],[690,834,28],[55,860,25]];
 trees.forEach(([x,y,r],i)=>drawTree(c,x,y,r,random()));
 for(let i=0;i<130;i++){
  const x=random()*760,y=random()*1000,rr=1+random()*4;
  c.fillStyle='rgba(78,79,64,.25)';
  c.beginPath();c.ellipse(x+3,y+3,rr*1.5,rr*.7,-.2,0,6.3);c.fill();
  c.fillStyle=i%3===0?'#c2bc94':'#94957b';
  c.beginPath();c.ellipse(x,y,rr,rr*.7,.3,0,6.3);c.fill();
 }
 // Battle mat vignette, subtle and functional.
 const vign=c.createRadialGradient(380,490,250,380,490,620);
 vign.addColorStop(0,'rgba(24,34,25,0)');vign.addColorStop(1,'rgba(37,54,43,.22)');
 c.fillStyle=vign;c.fillRect(0,0,760,1000);
 worldCache=off;return off;
}
function soldiers(u,time){
 const n=u.men,columns=clamp(Math.round(u.width/11),7,19);
 const rows=Math.ceil(n/columns),spacing=u.width/Math.max(1,columns-1);
 const fx=Math.cos(u.angle),fy=Math.sin(u.angle),px=-fy,py=fx;
 const marching=Math.hypot(u.target.x-u.x,u.target.y-u.y)>9&&!u.engaged;
 const army=u.side==='friend';
 const coat=army?['#315260','#436e76','#557782','#344e5c']:['#844236','#a45a48','#b16d52','#733e38'];
 const helmet=army?'#c6c7b5':'#b9b0a2',shield=army?'#d4cdb0':'#e5ba8b';
 for(let i=0;i<n;i++){
  const row=Math.floor(i/columns),col=i%columns;
  const horizontal=(col-(columns-1)/2)*spacing;
  const curve=Math.sin(Math.PI*(col+.5)/columns)*u.bend*26;
  const depth=(rows-1)*6.5-row*13;
  let x=u.x+horizontal*px+(depth-curve)*fx,y=u.y+horizontal*py+(depth-curve)*fy;
  const bob=marching?Math.sin(time*10+i*2.3)*1.1:0;
  x+=bob*fx;y+=bob*fy;
  ctx.fillStyle='rgba(35,43,34,.22)';ctx.beginPath();ctx.ellipse(x+1.9,y+2.9,5.2,u.type==='horse'?5.4:3.1,.15,0,6.29);ctx.fill();
  if(u.type==='horse'){
   ctx.save();ctx.translate(x,y);ctx.rotate(u.angle+Math.PI/2);
   ctx.fillStyle=i%3?'#766652':'#514f45';ctx.beginPath();ctx.ellipse(0,0,4.1,7.5,0,0,6.29);ctx.fill();
   ctx.fillStyle='#80725a';ctx.beginPath();ctx.ellipse(0,-6.5,2.9,4,0,0,6.29);ctx.fill();ctx.restore();
  }
  ctx.save();ctx.translate(x,y);ctx.rotate(u.angle+Math.PI/2);
  if(u.type==='spear'||u.type==='horse'){
   ctx.strokeStyle='#4b493a';ctx.lineWidth=1.35;ctx.beginPath();ctx.moveTo(2.5,2);ctx.lineTo(2.5,-13-(i%3));ctx.stroke();
   ctx.strokeStyle='#c7c7ab';ctx.lineWidth=1.05;ctx.beginPath();ctx.moveTo(2.5,-13);ctx.lineTo(2.5,-16);ctx.stroke();
  }else if(u.type==='sword'){
   ctx.strokeStyle='#c8c2ae';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(2,1);ctx.lineTo(3,-9);ctx.stroke();
  }else{
   ctx.strokeStyle='#ad936c';ctx.lineWidth=1.65;ctx.beginPath();ctx.arc(4,-.5,6,-1.6,1.6);ctx.stroke();
   ctx.strokeStyle='#d9ceb4';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(4,-7);ctx.lineTo(4,6);ctx.stroke();
  }
  ctx.fillStyle=coat[i%4];ctx.beginPath();ctx.ellipse(0,0,u.type==='horse'?3.6:4.25,4.9,0,0,6.29);ctx.fill();
  ctx.fillStyle=helmet;ctx.beginPath();ctx.ellipse(0,-2.4,3.25,3.05,0,0,6.29);ctx.fill();
  ctx.fillStyle='#64695f';ctx.fillRect(-3.2,-2.9,6.4,.95);
  if(u.type!=='bow'){
   ctx.fillStyle=shield;ctx.beginPath();ctx.ellipse(-3.7,.9,2.7,4.1,-.15,0,6.29);ctx.fill();
   ctx.fillStyle=coat[(i+1)%4];ctx.fillRect(-4.4,-.9,1.3,3.1);
  }
  ctx.restore();
 }
}
function standard(u,time){
 const fx=Math.cos(u.angle),fy=Math.sin(u.angle),px=-fy,py=fx;
 const x=u.x-fx*29,y=u.y-fy*29;
 ctx.strokeStyle='rgba(33,42,39,.36)';ctx.lineWidth=3.4;
 ctx.beginPath();ctx.moveTo(x+3,y+4);ctx.lineTo(x+3,y-22);ctx.stroke();
 ctx.strokeStyle='#d9d4b4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+2);ctx.lineTo(x,y-24);ctx.stroke();
 const w=Math.sin(time*3+u.x*.1)*3;
 ctx.fillStyle=u.side==='friend'?'#325565':'#9e4e3d';
 ctx.beginPath();ctx.moveTo(x,y-23);ctx.lineTo(x+16+w,y-20);
 ctx.lineTo(x+13+w*.6,y-9);ctx.lineTo(x,y-12);ctx.closePath();ctx.fill();
 ctx.strokeStyle=u.side==='friend'?'#9bb5b2':'#e2b389';ctx.lineWidth=1.6;ctx.stroke();
 ctx.fillStyle=u.side==='friend'?'#d9cfaa':'#e0c49c';
 ctx.beginPath();ctx.arc(x+8+w*.5,y-16,2.25,0,6.29);ctx.fill();
}
function drawGoal(t,alpha=1){
 ctx.save();ctx.globalAlpha=alpha;
 const ends=getEnds(t.x,t.y,t.angle,t.width);
 ctx.strokeStyle='#e9dcab';ctx.lineWidth=3;ctx.setLineDash([9,8]);
 ctx.beginPath();ctx.moveTo(ends[0].x,ends[0].y);ctx.lineTo(ends[1].x,ends[1].y);ctx.stroke();
 ctx.setLineDash([]);
 for(let i=0;i<2;i++){
  let p=ends[i];
  ctx.fillStyle='rgba(39,56,48,.85)';ctx.beginPath();ctx.arc(p.x,p.y,16,0,6.29);ctx.fill();
  ctx.strokeStyle='#efe0ae';ctx.lineWidth=2.8;ctx.beginPath();ctx.arc(p.x,p.y,13,0,6.29);ctx.stroke();
  ctx.beginPath();ctx.moveTo(p.x-7,p.y);ctx.lineTo(p.x+7,p.y);ctx.moveTo(p.x,p.y-7);ctx.lineTo(p.x,p.y+7);ctx.stroke();
 }
 ctx.fillStyle='#f1e8ca';ctx.beginPath();ctx.arc(t.x,t.y,9,0,6.29);ctx.fill();
 ctx.fillStyle='#41574d';ctx.beginPath();ctx.arc(t.x,t.y,4,0,6.29);ctx.fill();
 ctx.restore();
}
function renderWorld(now){
 const dpr=canvas.width/(viewW||1);
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#526354';ctx.fillRect(0,0,viewW,viewH);
 ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
 ctx.drawImage(terrain(),0,0);
 // Base path for selected order; solid on current formation, dashed at target.
 const u=game.units.find(x=>x.id===selected&&!x.routed);
 if(mode==='plan'&&u){
  const t=preview||u.target;
  if(Math.hypot(t.x-u.x,t.y-u.y)>10){
   ctx.strokeStyle='rgba(240,229,181,.65)';ctx.lineWidth=2.8;ctx.setLineDash([5,7]);
   ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.quadraticCurveTo((u.x+t.x)/2+14,(u.y+t.y)/2,t.x,t.y);ctx.stroke();ctx.setLineDash([]);
  }
  const e=getEnds(u.x,u.y,u.angle,u.width);
  ctx.fillStyle='rgba(248,229,169,.085)';ctx.beginPath();ctx.ellipse(u.x,u.y,u.width*.69,43,u.angle+Math.PI/2,0,6.29);ctx.fill();
  ctx.strokeStyle='#e8d7a0';ctx.lineWidth=2.7;ctx.beginPath();ctx.moveTo(e[0].x,e[0].y);ctx.lineTo(e[1].x,e[1].y);ctx.stroke();
 }
 for(const v of [...game.units].sort((a,b)=>a.y-b.y)){
  if(v.routed||v.men<=0)continue;
  soldiers(v,now);
  standard(v,now);
  if(v.flash>0){
   ctx.globalAlpha=v.flash*1.2;ctx.fillStyle='#f0e2c7';
   ctx.beginPath();ctx.ellipse(v.x,v.y,v.width*.47,27,v.angle+Math.PI/2,0,6.29);ctx.fill();ctx.globalAlpha=1;
  }
  if(v.morale<46){
   ctx.fillStyle='#dfb17d';ctx.fillRect(v.x-13,v.y-48,26,3);
   ctx.fillStyle='#974838';ctx.fillRect(v.x-13,v.y-48,26*(v.morale/100),3);
  }
 }
 if(mode==='plan'&&u)drawGoal(preview||u.target);
 for(const a of arrows){
   const t=clamp(a.life/a.max,0,1),x=lerp(a.x,a.tx,1-t),y=lerp(a.y,a.ty,1-t);
   ctx.strokeStyle='#eee0b8';ctx.lineWidth=1.65;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(a.x-a.tx)*.04,y+(a.y-a.ty)*.04);ctx.stroke();
 }
 for(const p of particles){
  ctx.globalAlpha=clamp(p.life/p.max,0,1);
  ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,6.29);ctx.fill();
 }ctx.globalAlpha=1;
 ctx.restore();
}
function acceptEvents(){
 if(!game.events.length)return;
 for(const ev of game.events.splice(0)){
  if(ev.type==='impact'){
   for(let i=0;i<3;i++){let a=rnd()*6.28,v=18+rnd()*39;
    particles.push({x:ev.x,y:ev.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-20,life:.43,max:.43,size:1.5+rnd()*2,color:i%2?'#d7c79d':'#665d48'});}
  }else if(ev.type==='volley'){
   for(let i=0;i<5;i++)arrows.push({x:ev.x-15+i*7,y:ev.y,tx:ev.tx+(i-2)*7,ty:ev.ty,life:.40+i*.02,max:.40+i*.02});
  }else if(ev.type==='rout'){
    audio('rout');
    for(let i=0;i<18;i++){let a=rnd()*6.28,v=20+rnd()*55;
     particles.push({x:ev.x,y:ev.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-8,life:.85,max:.85,size:1.2+rnd()*3,color:ev.side==='friend'?'#375d6a':'#ae654b'});}
   }
 }
 particles=particles.slice(-140);arrows=arrows.slice(-120);
}
function loop(ts){
 const dt=clamp((ts-lastTime)/1000||0,0,.09);lastTime=ts;
 if(mode==='battle'&&playing){
   acc+=dt*speed;
   const STEP=1/30;
   let count=0;
   while(acc>=STEP&&count<8){
    stepBattle(game,STEP);acc-=STEP;roundTime+=STEP;count++;
    acceptEvents();
   }
   uiAccumulator+=dt;
   if(uiAccumulator>.22){uiAccumulator=0;updateHud();}
   if(roundTime>=5.7){finishTurn();}
 }
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=35*dt;p.life-=dt}
 for(const a of arrows)a.life-=dt;
 particles=particles.filter(x=>x.life>0);arrows=arrows.filter(x=>x.life>0);
 if(viewW>0)renderWorld(ts/1000);
 frame=requestAnimationFrame(loop);
}
function wire(){
 $('start').addEventListener('click',()=>startBattle());
 $('menuBtn').addEventListener('click',()=>{if(mode==='plan'||mode==='battle')pause();else if(mode==='pause')resume();else if(mode==='home')$('about').hidden=false;else if(mode==='end')showHome();});
 $('resume').addEventListener('click',resume);
 $('back-campaign').addEventListener('click',()=>{ $('pause').hidden=true;showHome();});
 $('restart').addEventListener('click',()=>{$('restart-confirm').hidden=false;});
 $('confirm-no').addEventListener('click',()=>{$('restart-confirm').hidden=true;});
 $('confirm-yes').addEventListener('click',()=>{$('restart-confirm').hidden=true;chapter=game.stage;startBattle(false);});
 $('next').addEventListener('click',()=>{
  const won=game.winner==='friend';chapter=won&&game.stage<2?game.stage+1:game.stage;
  startBattle(false);
 });
 $('result-home').addEventListener('click',()=>{chapter=game.stage;showHome();});
 $('execute').addEventListener('click',runTurn);
 $('speed').addEventListener('click',()=>{speed=speed===1?2:1;updateHud();});
 $('audio').addEventListener('click',()=>{sound=!sound;$('audio').textContent=sound?'Звук: вкл.':'Звук: выкл.';save();if(sound)audio('select');});
 $('about').addEventListener('click',()=>{$('about').hidden=true;});
 document.querySelectorAll('[data-stance]').forEach(b=>b.addEventListener('click',()=>{
  const u=game.units.find(x=>x.id===selected);if(!u||mode!=='plan')return;
  const stance=b.dataset.stance;
  let patch={stance};
  if(stance!=='hold'&&Math.hypot(u.target.x-u.x,u.target.y-u.y)<14){
   const options=game.units.filter(v=>v.side==='enemy'&&!v.routed);
   if(options.length){const enemy=options.reduce((a,v)=>range(u,a)<range(u,v)?a:v);
    const theta=Math.atan2(enemy.y-u.y,enemy.x-u.x);
    patch=stance==='withdraw'?{stance,x:clamp(u.x-Math.cos(theta)*160,34,726),y:clamp(u.y-Math.sin(theta)*160,40,960)}:
       {stance,x:enemy.x,y:enemy.y};
   }
  }
  setOrder(patch);audio('select');
 }));
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
   if(!$('about').hidden)$('about').hidden=true;
   else if(!$('restart-confirm').hidden)$('restart-confirm').hidden=true;
   else if(mode==='pause')resume();
   else if(mode==='plan')pause();
  }else if(e.key==='Enter'&&mode==='plan'&&!e.repeat)runTurn();
  else if('1234'.includes(e.key)&&mode==='plan'){
   const stance=['hold','advance','charge','withdraw'][Number(e.key)-1];
   const u=game.units.find(x=>x.id===selected);if(u)setOrder({stance});
  }
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){lastTime=0;if(mode==='battle'){speed=1;}}
 });
}
const s=stored();
if(s){
 unlocked=s.unlocked;sound=s.sound!==false;chapter=clamp(Number(s.chapter)||0,0,unlocked);
 let loaded=safeLoad(s.battle);
 if(loaded){game=loaded;prepareInitial();}
}
$('audio').textContent=sound?'Звук: вкл.':'Звук: выкл.';
prepareInitial();wire();showHome();onResize();requestAnimationFrame(loop);
