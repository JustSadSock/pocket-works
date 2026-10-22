import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {WIDTH,HEIGHT,TICK,MAX_TIME,createBall,stepBall,shotVelocity,traceShot,constrainPoint,validPoint,safeWorld} from './physics.mjs';

installMobileRuntime();
const $=id=>document.getElementById(id);
const board=$('board'),ctx=board.getContext('2d',{alpha:false}),box=$('canvasWrap');
const KEY='pocket-works:billiard-lab:v1';
const LEVELS=[
 {name:'Прямая',subtitle:'Первый закон',hint:'Найди прямую линию от шара к датчику.',lesson:'Движение по прямой. Пока никаких отражений.',required:0,par:1,shape:'rectangle',origin:[137,268],target:[763,268],bumps:[],mirrors:[],angle:0},
 {name:'Одна стенка',subtitle:'Равные углы',hint:'Коснись борта хотя бы один раз перед датчиком.',lesson:'Угол падения равен углу отражения: α = β.',required:1,par:3,shape:'rectangle',origin:[146,364],target:[763,362],bumps:[[457,363]],mirrors:[],angle:325},
 {name:'Зеркало',subtitle:'Нормаль',hint:'Пройди через отражение от линии или борта.',lesson:'Скорость зеркально отражается относительно нормали к поверхности.',required:1,par:3,shape:'rectangle',origin:[131,378],target:[774,174],bumps:[],mirrors:[[357,116,503,397]],angle:335},
 {name:'Двойной след',subtitle:'Два отскока',hint:'Нужно два отражения до касания датчика.',lesson:'Цепочка отражений может превратить прямой путь в орбиту.',required:2,par:4,shape:'rectangle',origin:[153,274],target:[734,277],bumps:[[443,273]],mirrors:[[570,94,645,265]],angle:312},
 {name:'Призма',subtitle:'Узкий проход',hint:'Обойди зеркала и доберись до датчика.',lesson:'Изменение угла всего на градус заметно меняет далёкую траекторию.',required:1,par:4,shape:'rectangle',origin:[138,428],target:[746,107],bumps:[[480,235]],mirrors:[[285,110,315,310],[620,280,684,475]],angle:334},
 {name:'Кольцо',subtitle:'Круговой стол',hint:'Здесь нормаль борта всегда смотрит к центру.',lesson:'Круговой бильярд рождает регулярные многоугольные орбиты.',required:1,par:4,shape:'circle',origin:[277,264],target:[615,246],bumps:[[441,270]],mirrors:[],angle:313},
 {name:'Три стороны',subtitle:'Треугольник',hint:'Острые углы делают траектории капризными.',lesson:'В многоугольниках соседние близкие лучи быстро расходятся.',required:2,par:5,shape:'triangle',origin:[431,420],target:[661,429],bumps:[[550,399]],mirrors:[],angle:295},
 {name:'Стадион',subtitle:'Хаос отражений',hint:'Окончательный опыт: три отражения перед попаданием.',lesson:'Прямые и круглые борта стадиона порождают сложные траектории.',required:3,par:6,shape:'stadium',origin:[242,270],target:[670,277],bumps:[[420,270],[555,327]],mirrors:[],angle:312}
];
const readSaved=()=>{try{const raw=JSON.parse(localStorage.getItem(KEY)||'{}');return raw&&typeof raw==='object'?raw:{}}catch{return {}}};
const saved=readSaved();
let lab=safeWorld(saved.lab||{shape:'rectangle',origin:{x:180,y:270},target:{x:730,y:260},bumpers:[{x:460,y:270}],segments:[{x1:500,y1:106,x2:595,y2:215}],gravity:0,restitution:0.98,friction:0.01});
let best=Array.isArray(saved.best)?Array.from({length:LEVELS.length},(_,i)=>{const n=Number(saved.best[i]);return Number.isInteger(n)&&n>0&&n<1000?n:0}):Array(LEVELS.length).fill(0);
let unlocked=Math.max(0,Math.min(LEVELS.length-1,Number.isInteger(saved.unlocked)?saved.unlocked:0));
let level=Math.max(0,Math.min(unlocked,Number.isInteger(saved.level)?saved.level:0));
let mode=saved.mode==='lab'?'lab':'challenge',tool='aim';
let angle=Number.isFinite(saved.angle)?Math.max(0,Math.min(359,saved.angle)):0;
let power=Number.isFinite(saved.power)?Math.max(10,Math.min(100,saved.power)):76;
let sound=saved.sound!==false,fan=Boolean(saved.fan),world;
let ball,started=false,drag=null,prediction=null,dirtyPrediction=true,dirtyRender=true;
let time=0,bounces=0,travel=0,attempts=0,accumulator=0,previousFrame=0;
let sparks=[],trail=[],editorUndo=[],toastTimer,toastText='',currentPreset='custom';
let audioContext=null,skippedFrames=0;
function persist(){
 const data={mode,level,unlocked,best,lab,angle,power,sound,fan};
 try{localStorage.setItem(KEY,JSON.stringify(data))}catch{notify('Хранилище недоступно. Настройки не сохранятся.')}
}
function puzzleWorld(index){
 const p=LEVELS[index];return {shape:p.shape,origin:{x:p.origin[0],y:p.origin[1]},target:{x:p.target[0],y:p.target[1]},
 bumpers:p.bumps.map(b=>({x:b[0],y:b[1]})),segments:p.mirrors.map(s=>({x1:s[0],y1:s[1],x2:s[2],y2:s[3]})),
 gravity:0,friction:0.006,restitution:1,requiredBounces:p.required};
}
function notify(message){toastText=message;const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2600)}
function soundFx(kind,impact=1){
 if(!sound)return;
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  if(!audioContext)audioContext=new Audio();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  const osc=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
  osc.type=kind==='win'?'sine':'triangle';
  const start=kind==='win'?540:kind==='launch'?190:Math.min(700,190+impact*.32);
  osc.frequency.setValueAtTime(start,now);osc.frequency.exponentialRampToValueAtTime(kind==='win'?940:kind==='launch'?260:Math.max(95,start*.45),now+.16);
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(kind==='win'?.06:Math.min(.045,.009+impact/18000),now+.007);gain.gain.exponentialRampToValueAtTime(.0001,now+.19);
  osc.connect(gain).connect(audioContext.destination);osc.start(now);osc.stop(now+.2);
 }catch{}
}
function buzz(ms=14){try{if(navigator.vibrate)navigator.vibrate(ms)}catch{}}
function createWorld(resetAngle=false){
 world=mode==='lab'?lab:puzzleWorld(level);
 ball=createBall(world.origin.x,world.origin.y);
 started=false;time=0;bounces=0;travel=0;accumulator=0;trail=[];sparks=[];
 if(resetAngle&&mode==='challenge'){angle=(LEVELS[level].angle+360)%360;power=75}
 dirtyPrediction=true;dirtyRender=true;
 syncControls();renderUI();
}
function renderUI(){
 const challenge=mode==='challenge';$('challengeTab').classList.toggle('active',challenge);$('labTab').classList.toggle('active',!challenge);
 $('challengeTab').setAttribute('aria-pressed',String(challenge));$('labTab').setAttribute('aria-pressed',String(!challenge));
 $('challengePanel').hidden=!challenge;$('labPanel').hidden=challenge;$('fanBtn').hidden=challenge;$('undoBtn').hidden=challenge;
 $('undoBtn').disabled=editorUndo.length===0;
 const p=LEVELS[level];
 $('sceneKicker').textContent=challenge?'ЗАДАЧА '+String(level+1).padStart(2,'0')+' / 08':'ЭКСПЕРИМЕНТ / '+({rectangle:'01',circle:'02',stadium:'03',triangle:'04'}[world.shape]||'01');
 $('sceneTitle').textContent=challenge?p.name:{rectangle:'Прямоугольный стол',circle:'Круговой стол',stadium:'Стадион',triangle:'Треугольный стол'}[world.shape];
 $('recordChip').textContent=challenge?best.filter(Boolean).length+' / 8 решено':'СВОБОДНЫЙ РЕЖИМ';
 $('headerMeta').textContent=challenge?'Журнал / '+String(level+1).padStart(2,'0'):'Стол / '+world.shape;
 $('shotState').textContent=started?'В ДВИЖЕНИИ':'ГОТОВ';$('shotState').classList.toggle('live',started);
 $('launchBtn').classList.toggle('running',started);$('launchLabel').textContent=started?'СТОП':'ПУСК';
 $('simHint').textContent=started?'ЭКСПЕРИМЕНТ ИДЁТ':(mode==='lab'&&tool!=='aim'?{
 mirror:'ПРОВЕДИ ЛИНИЮ ЗЕРКАЛА',bumper:'НАЖМИ, ЧТОБЫ ПОСТАВИТЬ БАМПЕР',erase:'НАЖМИ НА ОБЪЕКТ',origin:'УКАЖИ НОВЫЙ СТАРТ',target:'УКАЖИ НОВЫЙ ДАТЧИК'}[tool]:'ПОТЯНИ ОТ ШАРА · ОТПУСТИ');
 $('runReadout').textContent=started?'Следи за отражениями.':'Прицел: потяни от шара или измени угол.';
 $('positionDisplay').textContent='X '+Math.round(ball.x)+' · Y '+Math.round(ball.y);
 $('soundBtn').textContent=sound?'♪':'♪̸';$('soundBtn').setAttribute('aria-pressed',String(sound));$('soundBtn').setAttribute('aria-label',sound?'Выключить звук':'Включить звук');
 $('fanBtn').setAttribute('aria-pressed',String(fan));
 if(challenge){
  $('goalTitle').textContent=p.required?'Не меньше '+p.required+' отражени'+(p.required===1?'я':'й'):'Попади в датчик';
  $('goalText').textContent=p.hint;$('lessonCopy').textContent=p.lesson;
  $('attemptCount').textContent=String(attempts);$('bestCount').textContent=best[level]?best[level]+' п.':'—';
  updateLevels();
 }else{
  $('shapeSelect').value=world.shape;
  $('gravityRange').value=String(world.gravity);$('gravityValue').textContent=String(world.gravity);
  $('elasticityRange').value=String(Math.round(world.restitution*100));$('elasticityValue').textContent=Math.round(world.restitution*100)+'%';
  document.querySelectorAll('[data-tool]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tool===tool));
 }
}
function updateLevels(){
 const host=$('levelGrid');host.replaceChildren();
 LEVELS.forEach((lvl,i)=>{const b=document.createElement('button');b.type='button';b.className='level-button'+(i===level?' active':'')+(best[i]?' done':'');
 b.disabled=i>unlocked;b.setAttribute('aria-label','Задача '+(i+1)+': '+lvl.name+(i>unlocked?', заблокирована':''));
 b.innerHTML='<span>'+(i>unlocked?'×':String(i+1).padStart(2,'0'))+'</span><small>'+(best[i]?('★ '+best[i]):i>unlocked?'· · ·':i===level?'СЕЙЧАС':'ОТКРЫТА')+'</small>';
 b.addEventListener('click',()=>loadLevel(i));host.appendChild(b)})
}
function syncControls(){
 $('angleRange').value=String(Math.round((angle+360)%360));$('powerRange').value=String(Math.round(power));
 $('angleValue').textContent=Math.round((angle+360)%360)+'°';$('powerValue').textContent=Math.round(power)+'%';
 $('reflectionDisplay').textContent='α '+Math.round((angle+360)%360)+'°';
 dirtyPrediction=true;dirtyRender=true;
}
function enterMode(next){
 if(next===mode)return;drag=null;started=false;$('resultOverlay').hidden=true;
 mode=next;editorUndo=[];attempts=0;if(mode==='challenge'){angle=LEVELS[level].angle;power=75}
 else {tool='aim';angle=0;power=70}
 createWorld(false);persist();
}
function loadLevel(i){
 if(i<0||i>unlocked||i>=LEVELS.length)return;
 $('resultOverlay').hidden=true;level=i;attempts=0;angle=LEVELS[level].angle;power=75;drag=null;
 createWorld(false);persist();
}
function resetShot(message=''){
 started=false;drag=null;ball=createBall(world.origin.x,world.origin.y);
 time=0;bounces=0;travel=0;accumulator=0;trail=[];sparks=[];
 dirtyRender=true;dirtyPrediction=true;renderUI();if(message)notify(message);
}
function launch(){
 if(!$('confirmOverlay').hidden||!$('resultOverlay').hidden)return;
 if(started){resetShot('Шар возвращён на старт.');return}
 drag=null;const v=shotVelocity(angle,power);
 ball=createBall(world.origin.x,world.origin.y,v.vx,v.vy);
 started=true;time=0;bounces=0;travel=0;accumulator=0;trail=[{x:ball.x,y:ball.y}];
 if(mode==='challenge'){attempts++;$('attemptCount').textContent=String(attempts)}
 renderUI();soundFx('launch');buzz(10);dirtyRender=true;persist();
}
function resolveFinish(){
 if(!started)return;
 started=false;accumulator=0;dirtyRender=true;
 if(mode==='lab'){
  soundFx('win');notify('Датчик сработал. Траектория завершена.');
  resetShot();return;
 }
 const previous=best[level],score=Math.max(1,attempts);
 best[level]=previous?Math.min(previous,score):score;
 unlocked=Math.min(LEVELS.length-1,Math.max(unlocked,level+1));
 persist();soundFx('win');buzz([24,40,24]);
 const last=level===LEVELS.length-1;
 $('resultKicker').textContent=last?'КУРС ЗАВЕРШЁН':'ОПЫТ '+String(level+1).padStart(2,'0')+' УДАЛСЯ';
 $('resultTitle').textContent=last?'Все законы под контролем':'Точное попадание';
 $('resultDescription').textContent='Попыток: '+score+' · отражений: '+bounces+' · время: '+time.toFixed(1)+' с';
 const medal=score<=LEVELS[level].par?3:score<=LEVELS[level].par+2?2:1;
 $('resultBadges').textContent='★ '.repeat(medal)+'☆ '.repeat(3-medal);
 $('nextBtn').textContent=last?'В лабораторию →':'Следующая задача →';
 $('resultOverlay').hidden=false;renderUI();
}
function updatePhysics(){
 const previous=ball;
 const result=stepBall(ball,world,TICK);ball=result.ball;
 time+=TICK;travel+=Math.hypot(ball.x-previous.x,ball.y-previous.y);
 if(result.bounces){
  bounces+=result.bounces;
  sparks.push({x:ball.x,y:ball.y,t:0,r:Math.min(27,8+result.impact*.025)});
  if(sparks.length>35)sparks.shift();soundFx('hit',result.impact);
 }
 if(trail.length<550&&Math.floor(time*120)%3===0)trail.push({x:ball.x,y:ball.y});
 if(result.sensor&&bounces>=(world.requiredBounces||0)){resolveFinish();return}
 if(time>=MAX_TIME||(time>.6&&Math.hypot(ball.vx,ball.vy)<7)){
  resetShot(mode==='challenge'?'Мимо датчика. Попробуй другой угол.':'Измерение завершено.');
  return;
 }
 dirtyRender=true;
}
function predict(){
 if(started)return;
 prediction=traceShot(world,angle,power);
 dirtyPrediction=false;
 $('bounceStat').textContent=String(prediction.bounces);
 $('lengthStat').textContent=(prediction.length/100).toFixed(1)+' м';
 $('timeStat').textContent=prediction.time.toFixed(1)+' с';
 $('trajectoryHint').textContent=prediction.hit?'Луч достигает датчика':'Луч рассчитан · '+prediction.bounces+' отск.';
}
function snapshotLab(){editorUndo.push(JSON.stringify(lab));if(editorUndo.length>20)editorUndo.shift()}
function modifyLab(change){
 if(mode!=='lab'||started)return;
 snapshotLab();change();
 lab=safeWorld(lab);world=lab;ball=createBall(world.origin.x,world.origin.y);
 trail=[];currentPreset='custom';dirtyPrediction=true;dirtyRender=true;renderUI();persist();
}
function undo(){
 if(mode!=='lab'||editorUndo.length===0)return;
 lab=safeWorld(JSON.parse(editorUndo.pop()));world=lab;resetShot();renderUI();persist();notify('Последнее изменение отменено.');
}
function setTool(value){if(mode!=='lab'||started)return;tool=value;drag=null;renderUI();dirtyRender=true}
function preset(name){
 if(mode!=='lab'||started)return;
 modifyLab(()=>{
  if(name==='clear'){lab.bumpers=[];lab.segments=[];lab.gravity=0;lab.restitution=1;lab.friction=0.01}
  if(name==='maze'){
   lab.shape='rectangle';lab.origin={x:150,y:410};lab.target={x:764,y:146};lab.gravity=0;
   lab.bumpers=[{x:370,y:210},{x:580,y:356}];
   lab.segments=[{x1:280,y1:115,x2:290,y2:330},{x1:485,y1:210,x2:610,y2:120},{x1:640,y1:245,x2:690,y2:447}];
  }
  if(name==='chaos'){
   lab.shape='stadium';lab.origin={x:220,y:270};lab.target={x:675,y:300};lab.gravity=0;lab.restitution=1;
   lab.bumpers=[{x:365,y:172},{x:460,y:366},{x:556,y:198}];
   lab.segments=[{x1:366,y1:250,x2:520,y2:311}];
  }
 });currentPreset=name;notify({clear:'Стол очищен от препятствий.',maze:'Установка «Лабиринт» загружена.',chaos:'Установка «Хаос» загружена.'}[name]);
}
function nearestObstacle(p){
 let min=Infinity,found=null;
 lab.bumpers.forEach((b,i)=>{const d=Math.hypot(p.x-b.x,p.y-b.y);if(d<min){min=d;found={type:'bumper',i}}});
 lab.segments.forEach((s,i)=>{
  const ex=s.x2-s.x1,ey=s.y2-s.y1,t=Math.max(0,Math.min(1,((p.x-s.x1)*ex+(p.y-s.y1)*ey)/(ex*ex+ey*ey||1)));
  const d=Math.hypot(p.x-s.x1-t*ex,p.y-s.y1-t*ey);
  if(d<min){min=d;found={type:'mirror',i}}
 });
 return min<32?found:null;
}
function pointOf(event){
 const rect=board.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*WIDTH,y:(event.clientY-rect.top)/rect.height*HEIGHT};
}
function updateAim(p){
 const dx=p.x-world.origin.x,dy=p.y-world.origin.y;
 const distance=Math.hypot(dx,dy);
 if(distance<12)return;
 angle=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
 if(drag?.fromBall)power=Math.max(10,Math.min(100,Math.round(distance/2.25)));
 syncControls();
}
function pointerStart(e){
 if(e.button!==0||!$('resultOverlay').hidden||!$('confirmOverlay').hidden||started)return;
 const p=pointOf(e);if(!validPoint(world.shape,p,3))return;
 try{board.setPointerCapture(e.pointerId)}catch{}
 const d=Math.hypot(p.x-world.origin.x,p.y-world.origin.y);
 drag={id:e.pointerId,begin:p,end:p,fromBall:d<=62,moved:0,kind:mode==='lab'?tool:'aim'};
 if(drag.kind==='aim'&&d>62)updateAim(p);
 dirtyRender=true;
}
function pointerMove(e){
 if(!drag||e.pointerId!==drag.id||started)return;
 const p=pointOf(e);drag.end=p;drag.moved=Math.hypot(p.x-drag.begin.x,p.y-drag.begin.y);
 if(drag.kind==='aim')updateAim(p);
 dirtyRender=true;
}
function pointerEnd(e,cancel=false){
 if(!drag||e.pointerId!==drag.id)return;
 const action=drag;drag=null;
 try{if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId)}catch{}
 if(cancel||started){dirtyRender=true;return}
 const p=pointOf(e);
 if(action.kind==='aim'){
  if(action.moved>19&&Math.hypot(p.x-world.origin.x,p.y-world.origin.y)>26){
   const dx=p.x-world.origin.x,dy=p.y-world.origin.y;
   angle=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
   if(action.fromBall)power=Math.max(10,Math.min(100,Math.round(Math.hypot(dx,dy)/2.25)));
   syncControls();launch();
  }else if(action.fromBall&&Math.hypot(p.x-world.origin.x,p.y-world.origin.y)>25&&action.moved>8){updateAim(p);launch()}
  else {syncControls();persist()}
  return;
 }
 if(action.kind==='mirror'){
  const a=constrainPoint(world.shape,action.begin,14),b=constrainPoint(world.shape,p,14);
  if(Math.hypot(a.x-b.x,a.y-b.y)<23){a.x-=30;b.x+=30}
  const p1=constrainPoint(world.shape,a,14),p2=constrainPoint(world.shape,b,14);
  if(lab.segments.length>=25){notify('Максимум 25 зеркал.');return}
  modifyLab(()=>lab.segments.push({x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y}));
  soundFx('hit',200);return;
 }
 if(action.kind==='bumper'){
  if(lab.bumpers.length>=25){notify('Максимум 25 бамперов.');return}
  const at=constrainPoint(world.shape,p,25);
  if(Math.hypot(at.x-lab.origin.x,at.y-lab.origin.y)<42){notify('Слишком близко к шару.');return}
  modifyLab(()=>lab.bumpers.push(at));soundFx('hit',100);
 }else if(action.kind==='erase'){
  const closest=nearestObstacle(p);
  if(!closest){notify('Здесь нечего стирать.');return}
  modifyLab(()=>{if(closest.type==='bumper')lab.bumpers.splice(closest.i,1);else lab.segments.splice(closest.i,1)});
 }else if(action.kind==='origin'){
  const at=constrainPoint(world.shape,p,14);
  modifyLab(()=>lab.origin=at);
 }else if(action.kind==='target'){
  const at=constrainPoint(world.shape,p,29);
  modifyLab(()=>lab.target=at);
 }
 dirtyRender=true;
}
function drawArenaPath(){
 ctx.beginPath();
 if(world.shape==='circle'){ctx.arc(450,270,224,0,Math.PI*2)}
 else if(world.shape==='stadium'){ctx.moveTo(281,50);ctx.lineTo(619,50);ctx.arc(619,270,220,-Math.PI/2,Math.PI/2);ctx.lineTo(281,490);ctx.arc(281,270,220,Math.PI/2,Math.PI*1.5)}
 else if(world.shape==='triangle'){ctx.moveTo(450,30);ctx.lineTo(859,498);ctx.lineTo(41,498);ctx.closePath()}
 else ctx.rect(31,31,838,478);
}
function gridPaint(){
 ctx.save();ctx.fillStyle='#d5ddd2';ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.strokeStyle='#c3ccc1';ctx.lineWidth=.75;ctx.beginPath();
 for(let x=0;x<=WIDTH;x+=30){ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT)}
 for(let y=0;y<=HEIGHT;y+=30){ctx.moveTo(0,y);ctx.lineTo(WIDTH,y)}
 ctx.stroke();ctx.strokeStyle='#aab9ae';ctx.lineWidth=1;
 for(let x=0;x<=WIDTH;x+=150){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT);ctx.stroke()}
 for(let y=0;y<=HEIGHT;y+=150){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WIDTH,y);ctx.stroke()}
 ctx.restore();
}
function ballDraw(x,y,accent=false){
 ctx.save();ctx.translate(x,y);
 ctx.fillStyle='#1d282b33';ctx.beginPath();ctx.ellipse(3,5,12,6,.3,0,Math.PI*2);ctx.fill();
 const grad=ctx.createRadialGradient(-4,-5,1,0,0,12);
 grad.addColorStop(0,'#fffdf4');grad.addColorStop(.55,'#f8ece1');grad.addColorStop(1,accent?'#6d9c93':'#ce6542');
 ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=accent?'#43796f':'#943d2c';ctx.lineWidth=2;ctx.stroke();
 ctx.beginPath();ctx.arc(-3,-3,2,0,Math.PI*2);ctx.fillStyle='#fff9e7';ctx.fill();ctx.restore();
}
function renderPath(points,stroke,width=2,dashed=[]){
 if(!points?.length)return;
 ctx.save();ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash(dashed);
 ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
 for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
 ctx.stroke();ctx.restore();
}
function drawTarget(){
 const t=world.target;ctx.save();ctx.translate(t.x,t.y);
 ctx.fillStyle='#68aaa12c';ctx.beginPath();ctx.arc(0,0,33,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#3e9688';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,26,0,Math.PI*2);ctx.stroke();
 ctx.strokeStyle='#67b2a6';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#398c82';ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();
 for(let a=0;a<4;a++){const t=a*Math.PI/2;ctx.strokeStyle='#44877e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Math.cos(t)*33,Math.sin(t)*33);ctx.lineTo(Math.cos(t)*40,Math.sin(t)*40);ctx.stroke()}
 ctx.restore();
}
function drawObjects(){
 for(const s of world.segments){
  ctx.strokeStyle='#172e32';ctx.lineWidth=13;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();
  ctx.strokeStyle='#d7b48a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();
  for(const p of [{x:s.x1,y:s.y1},{x:s.x2,y:s.y2}]){ctx.fillStyle='#233d42';ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f7e4b9';ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill()}
 }
 for(const b of world.bumpers){
  ctx.fillStyle='#20323633';ctx.beginPath();ctx.ellipse(b.x+3,b.y+5,25,12,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#cf6748';ctx.beginPath();ctx.arc(b.x,b.y,22,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#733b32';ctx.lineWidth=4;ctx.stroke();
  ctx.fillStyle='#f8d09c';ctx.beginPath();ctx.arc(b.x,b.y,12,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#a65945';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,6,0,Math.PI*2);ctx.stroke();
 }
}
function drawAngleMarker(){
 if(started)return;
 const v=shotVelocity(angle,power),length=Math.hypot(v.vx,v.vy),nx=v.vx/length,ny=v.vy/length;
 const x=world.origin.x,y=world.origin.y,tip=56+power*.72;
 ctx.strokeStyle='#df6847';ctx.lineWidth=3;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x+nx*18,y+ny*18);ctx.lineTo(x+nx*tip,y+ny*tip);ctx.stroke();
 ctx.fillStyle='#d86643';ctx.beginPath();ctx.moveTo(x+nx*(tip+10),y+ny*(tip+10));
 ctx.lineTo(x+nx*(tip-2)-ny*7,y+ny*(tip-2)+nx*7);
 ctx.lineTo(x+nx*(tip-2)+ny*7,y+ny*(tip-2)-nx*7);ctx.closePath();ctx.fill();
 ctx.lineWidth=1.3;ctx.strokeStyle='#c26044a0';ctx.beginPath();ctx.arc(x,y,35,-.05,angle*Math.PI/180);ctx.stroke();
}
function drawBoard(){
 if(!ctx)return;
 const dpr=Math.min(2,devicePixelRatio||1),rect=board.getBoundingClientRect();
 const targetW=Math.max(1,Math.round(rect.width*dpr)),targetH=Math.max(1,Math.round(rect.height*dpr));
 if(board.width!==targetW||board.height!==targetH){board.width=targetW;board.height=targetH}
 ctx.setTransform(board.width/WIDTH,0,0,board.height/HEIGHT,0,0);
 ctx.fillStyle='#23353a';ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.fillStyle='#314c4b';for(let x=0;x<WIDTH;x+=20){ctx.fillRect(x,0,1,HEIGHT)}for(let y=0;y<HEIGHT;y+=20){ctx.fillRect(0,y,WIDTH,1)}
 ctx.save();drawArenaPath();ctx.shadowColor='#101c1d90';ctx.shadowBlur=25;ctx.shadowOffsetY=9;ctx.fillStyle='#e4e9da';ctx.fill();ctx.restore();
 ctx.save();drawArenaPath();ctx.clip();gridPaint();
 if(!started){
  if(dirtyPrediction||!prediction)predict();
  if(mode==='lab'&&fan){
   for(const difference of [-7,-4,-2,2,4,7]){
    const ghost=traceShot(world,(angle+difference+360)%360,power,{maxTime:8});
    renderPath(ghost.path,'#568d8580',1.4,[2,6]);
   }
  }
  renderPath(prediction.path,'#d0714dab',2.4,[6,6]);
  for(const collision of prediction.hits.slice(0,120)){
   ctx.save();ctx.translate(collision.x,collision.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#d36d48';ctx.fillRect(-3.7,-3.7,7.4,7.4);ctx.restore();
  }
 }else{renderPath(trail,'#bd6448b7',2.6)}
 drawTarget();drawObjects();
 for(const spark of sparks){
  ctx.save();ctx.globalAlpha=Math.max(0,1-spark.t/.32);ctx.strokeStyle='#dd7048';ctx.lineWidth=2;ctx.beginPath();ctx.arc(spark.x,spark.y,Math.min(38,spark.r+spark.t*55),0,Math.PI*2);ctx.stroke();ctx.restore();
 }
 if(drag?.kind==='mirror'){
  const a=constrainPoint(world.shape,drag.begin),b=constrainPoint(world.shape,drag.end);
  ctx.save();ctx.lineWidth=11;ctx.strokeStyle='#2f5e62a0';ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();
 }
 if(!started)drawAngleMarker();
 ballDraw(ball.x,ball.y);
 ctx.restore();
 drawArenaPath();ctx.lineWidth=13;ctx.strokeStyle='#304746';ctx.stroke();drawArenaPath();ctx.lineWidth=3;ctx.strokeStyle='#d1ac83';ctx.stroke();
 const marks=[{x:12,y:12},{x:WIDTH-12,y:12},{x:12,y:HEIGHT-12},{x:WIDTH-12,y:HEIGHT-12}];
 if(world.shape==='rectangle')for(const p of marks){ctx.fillStyle='#a3aaa0';ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill()}
}
function frame(t){
 const frameDelta=previousFrame?Math.min(.045,(t-previousFrame)/1000):0;previousFrame=t;
 if(document.visibilityState==='visible'){
  if(started){
   accumulator+=frameDelta;
   let steps=0;
   while(started&&accumulator>=TICK&&steps<8){updatePhysics();accumulator-=TICK;steps++}
   if(steps===8)accumulator=0;
   $('bounceStat').textContent=String(bounces);
   $('lengthStat').textContent=(travel/100).toFixed(1)+' м';
   $('timeStat').textContent=time.toFixed(1)+' с';
   $('positionDisplay').textContent='X '+Math.round(ball.x)+' · Y '+Math.round(ball.y);
   $('trajectoryHint').textContent='Фактический след · '+bounces+' отск.';
  }
  for(const s of sparks)s.t+=frameDelta;
  sparks=sparks.filter(s=>s.t<.32);
  if(sparks.length)dirtyRender=true;
  if(dirtyRender||dirtyPrediction||started){drawBoard();dirtyRender=false}
 }
 requestAnimationFrame(frame);
}
board.addEventListener('pointerdown',pointerStart);
board.addEventListener('pointermove',pointerMove);
board.addEventListener('pointerup',e=>pointerEnd(e));
board.addEventListener('pointercancel',e=>pointerEnd(e,true));
board.addEventListener('lostpointercapture',e=>{if(drag&&drag.id===e.pointerId){drag=null;dirtyRender=true}});
board.addEventListener('contextmenu',e=>e.preventDefault());
$('launchBtn').addEventListener('click',launch);
$('resetBtn').addEventListener('click',()=>resetShot('Шар на стартовой позиции.'));
$('challengeTab').addEventListener('click',()=>enterMode('challenge'));
$('labTab').addEventListener('click',()=>enterMode('lab'));
$('undoBtn').addEventListener('click',undo);
$('fanBtn').addEventListener('click',()=>{fan=!fan;renderUI();dirtyRender=true;persist();notify(fan?'Веер показывает соседние траектории.':'Веер выключен.')});
$('soundBtn').addEventListener('click',()=>{sound=!sound;renderUI();persist();if(sound)soundFx('launch')});
$('angleRange').addEventListener('input',e=>{if(started)return;angle=Number(e.target.value);syncControls();persist()});
$('powerRange').addEventListener('input',e=>{if(started)return;power=Number(e.target.value);syncControls();persist()});
$('toolGrid').addEventListener('click',e=>{const btn=e.target.closest('[data-tool]');if(btn)setTool(btn.dataset.tool)});
$('shapeSelect').addEventListener('change',e=>modifyLab(()=>{lab.shape=e.target.value;lab.origin=constrainPoint(lab.shape,lab.origin);lab.target=constrainPoint(lab.shape,lab.target,29)}));
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>preset(button.dataset.preset)));
$('gravityRange').addEventListener('input',e=>modifyLab(()=>lab.gravity=Number(e.target.value)));
$('elasticityRange').addEventListener('input',e=>modifyLab(()=>lab.restitution=Number(e.target.value)/100));
$('clearBtn').addEventListener('click',()=>{$('confirmOverlay').hidden=false;$('clearAcceptBtn').focus()});
$('clearCancelBtn').addEventListener('click',()=>{$('confirmOverlay').hidden=true;$('clearBtn').focus()});
$('clearAcceptBtn').addEventListener('click',()=>{modifyLab(()=>{lab.bumpers=[];lab.segments=[]});$('confirmOverlay').hidden=true;notify('Стол очищен.')});
$('nextBtn').addEventListener('click',()=>{const done=level===LEVELS.length-1;$('resultOverlay').hidden=true;if(done)enterMode('lab');else loadLevel(level+1)});
$('retryBtn').addEventListener('click',()=>{$('resultOverlay').hidden=true;attempts=0;resetShot()});
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey||e.altKey)||/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||''))return;
 if(e.key==='Escape'){
  if(!$('confirmOverlay').hidden){$('confirmOverlay').hidden=true;return}
  if(!$('resultOverlay').hidden){$('resultOverlay').hidden=true;resetShot();return}
  if(drag){drag=null;dirtyRender=true}return;
 }
 if(!$('resultOverlay').hidden||!$('confirmOverlay').hidden)return;
 let changed=false;
 if(e.key==='ArrowLeft'){angle=(angle-(e.shiftKey?5:1)+360)%360;changed=true}
 if(e.key==='ArrowRight'){angle=(angle+(e.shiftKey?5:1))%360;changed=true}
 if(e.key==='ArrowUp'){power=Math.min(100,power+5);changed=true}
 if(e.key==='ArrowDown'){power=Math.max(10,power-5);changed=true}
 if(changed){e.preventDefault();if(!started){syncControls();persist()}return}
 if(e.code==='Space'||e.key==='Enter'){e.preventDefault();launch()}
 if(e.key.toLowerCase()==='r'){e.preventDefault();resetShot()}
 if(e.key==='Backspace'&&mode==='lab'){e.preventDefault();undo()}
});
document.addEventListener('visibilitychange',()=>{previousFrame=0;if(document.hidden){accumulator=0;persist()}});
window.addEventListener('pagehide',persist);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>dirtyRender=true).observe(box);
window.addEventListener('resize',()=>dirtyRender=true);
createWorkshopMode({appName:'РИКОШЕТ',version:'1.0.0',cachePrefix:'billiard-lab-',storageNamespace:'pocket-works:billiard-lab',onReset(){try{localStorage.removeItem(KEY)}catch{}window.location.reload()}});
createWorld(mode==='challenge'&&!Number.isFinite(saved.angle));
requestAnimationFrame(frame);
