import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createGame,action,tick,stats,save,load,W,H,nearHome,DOMINATION_SECONDS,DOMINATION_SITES,clamp} from './engine.js';
import {renderBattle,renderMinimap,nearestSite} from './render.js';
installMobileRuntime();
const $=id=>document.getElementById(id);
const root=$('app'),canvas=$('field'),ctx=canvas.getContext('2d',{alpha:false});
const storedKey='pocket-works:mezha:match-v1',optionsKey='pocket-works:mezha:options';
const screen={menu:$('startScreen'),pause:$('pauseScreen'),end:$('endScreen'),confirm:$('confirm')};
let opts={sound:true,skill:'regular'};try{opts={...opts,...JSON.parse(localStorage.getItem(optionsKey)||'{}')}}catch{}
if(!['casual','regular','veteran'].includes(opts.skill))opts.skill='regular';
let game=null,preview=createGame(20261014,true),mode='capture',captain=0,site=null,view={x:0,y:0,w:W,h:H};
let camera={x:W*.34,y:H*.50,zoom:1},pendingReset=false,paused=false,audio=null,last=0,acc=0,raf=0,lastHud=0,lastMinimap=0,lastSave=0,toastTimer=null,hasPlayed=false;
const pointers=new Map();let pinch=null,down=null;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let stored=null;try{stored=load(localStorage.getItem(storedKey))}catch{}
function playSound(f=540,d=.09,g=.025,shape='square'){
 if(!opts.sound)return;
 try{audio ||= new (window.AudioContext||window.webkitAudioContext)();
  if(audio.state==='suspended')audio.resume();
  const a=audio.createOscillator(),v=audio.createGain();a.type=shape;a.frequency.setValueAtTime(f,audio.currentTime);
  a.frequency.exponentialRampToValueAtTime(f*.7,audio.currentTime+d);
  v.gain.setValueAtTime(g,audio.currentTime);v.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+d);
  a.connect(v).connect(audio.destination);a.start();a.stop(audio.currentTime+d+.01);
 }catch{}
}
function buzz(){try{navigator.vibrate?.(12)}catch{}}
function notify(msg,fail=false){
 const t=$('toast');t.textContent=msg;t.className='message shown'+(fail?' fail':'');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.className='message'},1450);
 if(fail)playSound(190,.12,.017);
}
function storageWrite(){
 if(!game||game.phase!=='battle')return;
 try{localStorage.setItem(storedKey,save(game))}catch{}
}
function storageClear(){try{localStorage.removeItem(storedKey)}catch{}}
function hidePanels(){screen.menu.hidden=true;screen.pause.hidden=true;screen.end.hidden=true;screen.confirm.hidden=true;$('recruitPanel').hidden=true;$('siteCard').hidden=true;}
function currentState(){return game||preview}
function resize(){
 const b=canvas.getBoundingClientRect();
 const q=.68;canvas.width=Math.max(160,Math.round(b.width*q));canvas.height=Math.max(190,Math.round(b.height*q));
 ctx.imageSmoothingEnabled=false;computeView();
}
function computeView(){
 const rect=canvas.getBoundingClientRect(),aspect=Math.max(.38,rect.width/Math.max(1,rect.height));
 // Zoom follows world-height, not phone width. Otherwise portrait devices
 // would be clamped permanently at one magnification level.
 let h=800/camera.zoom,w=h*aspect;
 if(h>1300){h=1300;w=h*aspect}
 if(w>1120){w=1120;h=w/aspect}
 if(w<240){w=240;h=w/aspect}
 camera.x=clamp(camera.x,Math.min(W/2,w/2),Math.max(W/2,W-w/2));
 camera.y=clamp(camera.y,Math.min(H/2,h/2),Math.max(H/2,H-h/2));
 view={x:camera.x-w/2,y:camera.y-h/2,w,h};
}
function focusAt(x,y){camera.x=x;camera.y=y;computeView()}
function zoomBy(factor){
 camera.zoom=clamp(camera.zoom*factor,.63,2.6);computeView();
}
function screenToWorld(clientX,clientY){
 const b=canvas.getBoundingClientRect();return{x:view.x+(clientX-b.left)/b.width*view.w,y:view.y+(clientY-b.top)/b.height*view.h};
}
function syncHUD(){
 const s=currentState(),p=stats(s,0),q=stats(s,1);
 $('gold').textContent=Math.floor(p.gold);$('wood').textContent=Math.floor(p.wood);$('food').textContent=Math.floor(p.food);
 $('troopCount').textContent=p.troops+' / 12';
 $('clock').textContent=[Math.floor(s.time/60),Math.floor(s.time%60)].map(v=>String(v).padStart(2,'0')).join(':');
 $('blueKeep').innerHTML='НАШ ЗАМОК <b>'+Math.ceil(p.base)+'</b>';
 $('redKeep').innerHTML='ВРАГ <b>'+Math.ceil(q.base)+'</b>';
 $('controlCount').textContent='⚑ '+p.sites+' : '+q.sites+' ⚑';
 $('dominationMine').style.width=(100*p.domination/DOMINATION_SECONDS).toFixed(1)+'%';
 $('dominationEnemy').style.width=(100*q.domination/DOMINATION_SECONDS).toFixed(1)+'%';
 const ruling=p.domination>0?0:q.domination>0?1:-1;
 const count=ruling===0?p.domination:ruling===1?q.domination:0;
 const remain=Math.max(0,Math.ceil(DOMINATION_SECONDS-count));
 $('controlTime').textContent=ruling<0?'6 ДЛЯ ПОБЕДЫ':(ruling===0?'НАША ВЛАСТЬ ':'УГРОЗА ')+Math.floor(remain/60)+':'+String(remain%60).padStart(2,'0');
 $('matchStrip').classList.toggle('under-pressure',ruling===1);
 $('matchStrip').classList.toggle('holding-ground',ruling===0);
 for(let i=0;i<2;i++){
  const o=$('cap'+i);o.classList.toggle('current',i===captain);o.setAttribute('aria-pressed',String(i===captain));
  const order=s.orders[i];const squadCount=s.squads.filter(u=>u.captain===i).length;
  const b=o.querySelector('small');b.textContent=squadCount+' ОТР. · '+({capture:'ЦЕЛЬ',defend:'ОБОРОНА',raid:'НАБЕГ'})[order.mode];
 }
 for(const btn of document.querySelectorAll('[data-mode]'))btn.classList.toggle('active',btn.dataset.mode===mode);
 for(const btn of document.querySelectorAll('[data-doctrine]')){
  const active=btn.dataset.doctrine===s.players[0].doctrine;
  btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
 }
 if(site){
  const z=s.sites.find(q=>q.id===site);
  if(!z)site=null;
  else{
   $('siteCard').hidden=false;
   $('siteName').textContent=z.name;
   $('siteDetails').textContent=(z.owner===0?'Наше владение':z.owner===1?'Владеет противник':'Свободное владение')+(z.capture>1?' · захват '+Math.ceil(z.capture)+'%':'')+' · башня '+z.fort+'/2';
   $('fortify').hidden=z.owner!==0||z.fort>=2;
   if(z.owner===0){
    $('fortify').textContent=z.fort===0?'БАШНЯ · 45/65':'УСИЛИТЬ · 80/105';
   }
  }
 }else $('siteCard').hidden=true;
 const label=game?.orders[captain].name||'Бертрана';
 $('orderHint').textContent='Коснись карты: '+({capture:'занять',defend:'защитить',raid:'набег на'})[mode]+' цель для '+label;
}
function enterGame(s){
 game=s;hasPlayed=true;paused=false;pendingReset=false;opts.skill=s.botSkill||'regular';syncDifficulty();hidePanels();root.classList.remove('game-idle');root.classList.add('game-active');
 camera={x:W*.28,y:H*.50,zoom:1.1};mode='capture';captain=0;site=null;last=performance.now();acc=0;computeView();syncHUD();
 notify('Выбери капитана, затем коснись цели на карте');playSound(410,.16,.04);
 storageWrite();
}
function startNew(){storageClear();enterGame(createGame(Date.now(),true,opts.skill))}
function syncDifficulty(){
 for(const b of document.querySelectorAll('[data-skill]')){
  const active=b.dataset.skill===opts.skill;
  b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));
 }
}
function openMenu(){
 if(game?.phase==='battle')storageWrite();
 game=null;site=null;paused=false;hidePanels();root.classList.add('game-idle');root.classList.remove('game-active');
 camera={x:W*.50,y:H*.50,zoom:.90};computeView();
 try{stored=load(localStorage.getItem(storedKey))}catch{stored=null}
 $('continueBtn').hidden=!stored;syncDifficulty();screen.menu.hidden=false;
}
function pauseGame(){
 if(!game||game.phase!=='battle')return;
 paused=true;storageWrite();hidePanels();screen.pause.hidden=false;
 $('pauseDetail').textContent='Наши владения: '+stats(game,0).sites+'/7 · Соперник: '+({casual:'спокойный',regular:'равный',veteran:'суровый'}[game.botSkill]||'равный')+'.';
 $('soundBtn').textContent='ЗВУК: '+(opts.sound?'ВКЛ.':'ВЫКЛ.');
 playSound(330,.08,.021);
}
function resumeGame(){
 if(!game||game.phase!=='battle')return;
 hidePanels();paused=false;last=performance.now();syncHUD();playSound(620,.07,.025);
}
function showEnd(){
 paused=true;storageClear();hidePanels();
 const win=game.winner;
 $('outcome').textContent=win===0?'ПОБЕДА':win===1?'ПОРАЖЕНИЕ':'НИЧЬЯ';
 const reason=game.victory;
 $('outcomeDetail').textContent=reason==='domination'?(win===0?'ВЫ УДЕРЖАЛИ ШЕСТЬ ВЛАДЕНИЙ':'ВРАГ УДЕРЖАЛ ШЕСТЬ ВЛАДЕНИЙ'):reason==='score'?'РЕШЕНИЕ ПО ИТОГАМ ДВАДЦАТИ МИНУТ':win===0?'ВРАЖЕСКАЯ КРЕПОСТЬ ПАЛА':win===1?'НАША КРЕПОСТЬ ПАЛА':'ВОЙНА БЕЗ ПОБЕДИТЕЛЯ';
 $('endSites').textContent=stats(game,0).sites+'/7';$('endKills').textContent=game.players[0].kills;
 $('endTime').textContent=Math.floor(game.time/60)+':'+String(Math.floor(game.time%60)).padStart(2,'0');
 screen.end.hidden=false;playSound(win===0?640:160,.36,.037,'triangle');
}
function pointAction(x,y){
 if(!game||paused||game.phase!=='battle')return;
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>W||y<0||y>H)return;
 const selected=nearestSite(game,x,y,58);
 site=selected?.id||null;
 const order=action(game,0,{kind:'order',captain,mode,x:clamp(x,52.5,W-52.5),y:clamp(y,52.5,H-52.5)});
 const supply=game.sites.some(z=>z.owner===0&&['silver','ford','fen'].includes(z.id));
 const enemyKeep=nearHome(1);const triesKeep=Math.hypot(x-enemyKeep.x,y-enemyKeep.y)<78*1.5;
 notify(order.ok&&triesKeep&&!supply?'Для сильной осады сначала удерживай центральное владение':order.message,!order.ok);
 if(order.ok){playSound(mode==='raid'?330:mode==='defend'?430:590,.12,.036);buzz();storageWrite()}
 syncHUD();
}
function pointerReset(){down=null;pinch=null;pointers.clear()}
canvas.addEventListener('pointerdown',e=>{
 if(!game||paused||game.phase!=='battle')return;
 if(e.button!==0)return;
 e.preventDefault();canvas.setPointerCapture?.(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){down={id:e.pointerId,x:e.clientX,y:e.clientY,move:false};pinch=null}
 else if(pointers.size===2){const a=[...pointers.values()];pinch={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),zoom:camera.zoom};down=null}
});
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 const previous=pointers.get(e.pointerId);
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pinch&&pointers.size>=2){const a=[...pointers.values()];const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);camera.zoom=clamp(pinch.zoom*d/Math.max(1,pinch.distance),.63,2.6);computeView();return}
 if(down&&down.id===e.pointerId){
  if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)down.move=true;
  if(down.move){
   const b=canvas.getBoundingClientRect();camera.x-=(e.clientX-previous.x)/b.width*view.w;
   camera.y-=(e.clientY-previous.y)/b.height*view.h;computeView();
  }
 }
});
canvas.addEventListener('pointerup',e=>{
 if(!pointers.has(e.pointerId))return;
 if(down&&down.id===e.pointerId&&!down.move){const p=screenToWorld(e.clientX,e.clientY);pointAction(p.x,p.y)}
 pointers.delete(e.pointerId);down=null;if(pointers.size<2)pinch=null;
});
for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{pointers.delete(e.pointerId);down=null;pinch=null});
canvas.addEventListener('wheel',e=>{if(!game||paused)return;e.preventDefault();zoomBy(e.deltaY>0?.88:1.12)},{passive:false});
$('minimap').addEventListener('pointerdown',e=>{
 if(!game||paused)return;
 e.preventDefault();const b=$('minimap').getBoundingClientRect();
 focusAt((e.clientX-b.left)/b.width*W,(e.clientY-b.top)/b.height*H);playSound(450,.04,.012);
});
$('fitBtn').onclick=()=>{camera.zoom=.63;camera.x=W/2;camera.y=H/2;computeView();notify('Камера по центру карты');playSound(400,.05,.012)};
$('zoomPlus').onclick=()=>{zoomBy(1.27);playSound(450,.05,.012)};
$('zoomMinus').onclick=()=>{zoomBy(.79);playSound(370,.05,.012)};
for(let i=0;i<2;i++)$('cap'+i).onclick=()=>{
 captain=i;site=null;
 const o=currentState().orders[i];mode=o.mode||'capture';
 const troops=currentState().squads.filter(u=>u.captain===i&&u.side===0);
 if(troops.length)focusAt(troops.reduce((n,u)=>n+u.x,0)/troops.length,troops.reduce((n,u)=>n+u.y,0)/troops.length);
 syncHUD();playSound(520-i*70,.06,.024);
};
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{
 mode=b.dataset.mode;syncHUD();playSound(mode==='raid'?390:540,.055,.025);
};
$('recruitBtn').onclick=()=>{if(!game||paused)return;$('recruitPanel').hidden=!$('recruitPanel').hidden;playSound(430,.08,.016)};
$('recruitClose').onclick=()=>{$('recruitPanel').hidden=true;playSound(290,.06,.011)};
document.querySelectorAll('[data-recruit]').forEach(b=>b.onclick=()=>{
 if(!game)return;
 const result=action(game,0,{kind:'recruit',type:b.dataset.recruit});notify(result.message,!result.ok);
 if(result.ok){playSound(330,.12,.033);buzz();storageWrite();$('recruitPanel').hidden=true}
 syncHUD();
});
document.querySelectorAll('[data-doctrine]').forEach(btn=>btn.onclick=()=>{
 if(!game||paused)return;
 const result=action(game,0,{kind:'doctrine',value:btn.dataset.doctrine});
 notify(result.message,!result.ok);
 if(result.ok){playSound(495,.11,.027);storageWrite()}
 syncHUD();
});
$('fortify').onclick=()=>{
 if(!site||!game)return;
 const res=action(game,0,{kind:'fort',site});notify(res.message,!res.ok);
 if(res.ok){playSound(220,.22,.034);storageWrite()}syncHUD();
};
$('siteClose').onclick=()=>{site=null;syncHUD()};
document.querySelectorAll('[data-skill]').forEach(btn=>btn.onclick=()=>{
 opts.skill=btn.dataset.skill;syncDifficulty();playSound(opts.skill==='veteran'?630:opts.skill==='casual'?360:500,.07,.02);
 try{localStorage.setItem(optionsKey,JSON.stringify(opts))}catch{}
});
$('startBtn').onclick=startNew;
$('continueBtn').onclick=()=>{if(stored)enterGame(stored);else notify('Сохранение не найдено',true)};
$('pauseBtn').onclick=()=>{if(game&&!paused)pauseGame();else if(paused)resumeGame()};
$('resumeBtn').onclick=resumeGame;
$('menuBtn').onclick=openMenu;$('endMenuBtn').onclick=openMenu;
$('againBtn').onclick=startNew;
$('restartBtn').onclick=()=>{pendingReset=true;screen.confirm.hidden=false;playSound(270,.1,.016)};
$('cancelReset').onclick=()=>{pendingReset=false;screen.confirm.hidden=true};
$('acceptReset').onclick=()=>{if(pendingReset)startNew()};
$('soundBtn').onclick=()=>{opts.sound=!opts.sound;try{localStorage.setItem(optionsKey,JSON.stringify(opts))}catch{}$('soundBtn').textContent='ЗВУК: '+(opts.sound?'ВКЛ.':'ВЫКЛ.');playSound(610,.07,.024)};
document.addEventListener('keydown',e=>{
 if(e.target instanceof HTMLInputElement)return;
 if(e.key==='Escape'){if(!screen.confirm.hidden){screen.confirm.hidden=true;return}if(!$('recruitPanel').hidden){$('recruitPanel').hidden=true;return}if(!screen.pause.hidden)resumeGame();else if(game&&!paused)pauseGame();return}
 if(!game||paused)return;
 if(e.key==='1'||e.key==='2')$('cap'+(Number(e.key)-1)).click();
 if(e.key.toLowerCase()==='q')$('capture').click();
 if(e.key.toLowerCase()==='w')$('defend').click();
 if(e.key.toLowerCase()==='e')$('raid').click();
 if(e.key.toLowerCase()==='r')$('recruitBtn').click();
});
window.addEventListener('resize',resize);
window.addEventListener('pagehide',storageWrite);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){storageWrite();last=performance.now();pointerReset()}
 else{last=performance.now()}
});
function loop(now){
 raf=requestAnimationFrame(loop);
 const dt=Math.min(.12,Math.max(0,(now-last)/1000||0));last=now;
 if(game&&!paused&&game.phase==='battle'&&!document.hidden){
  acc+=dt;let iterations=0;
  while(acc>=.05&&iterations<4){tick(game,.05);acc-=.05;iterations++}
  if(iterations===4)acc=Math.min(.1,acc);
  if(game.phase==='end')showEnd();
  if(now-lastSave>6000){storageWrite();lastSave=now}
 }
 computeView();renderBattle(ctx,currentState(),view,{captain,site},reducedMotion?0:now/1000);
 if(now-lastHud>280){syncHUD();lastHud=now}
 if(now-lastMinimap>400){renderMinimap($('minimap'),currentState(),view);lastMinimap=now}
}
resize();openMenu();last=performance.now();raf=requestAnimationFrame(loop);
