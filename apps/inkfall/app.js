import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createRenderer } from './renderer.js';

installMobileRuntime();

const $=s=>document.querySelector(s);
const canvas=$('#game');
const state={
  screen:'menu',depth:0,charge:0,lives:3,speed:260,flash:0,
  player:{x:0,targetX:0,y:0,vx:0,invuln:0,burst:0},
  tears:[],sparks:[],particles:[],trails:[]
};
const renderer=createRenderer(canvas,state);
const menu=$('#menu'),pause=$('#pause'),over=$('#gameover');
const score=$('#score'),meter=$('#meterFill'),burstBtn=$('#burstBtn'),pauseBtn=$('#pauseBtn');
const STORAGE='pocket-works:inkfall:best';
let best=Number(localStorage.getItem(STORAGE)||0);
let seed=7331,last=performance.now(),tearTimer=.7,sparkTimer=.35,pointer=null,hitStop=0;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function setScreen(next){
  state.screen=next;
  menu.hidden=next!=='menu';pause.hidden=next!=='paused';over.hidden=next!=='gameover';
  pauseBtn.style.visibility=next==='playing'?'visible':'hidden';
  burstBtn.style.visibility=next==='playing'?'visible':'hidden';
}
function hud(){
  score.textContent=Math.floor(state.depth);
  meter.style.width=clamp(state.charge,0,100)+'%';
  const ready=state.charge>=100;
  burstBtn.disabled=!ready;
  burstBtn.querySelector('small').textContent=ready?'разорвать поток':'нужен полный импульс';
}
function particles(x,y,color,n=12,s=120){
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2+rand()*.2,sp=s*(.45+rand()*.75);
    state.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.45+rand()*.3,size:1.5+rand()*3,color});
  }
}
function reset(){
  seed=7331;state.depth=0;state.charge=0;state.lives=3;state.speed=260;state.flash=0;
  state.tears.length=0;state.sparks.length=0;state.particles.length=0;state.trails.length=0;
  const {W,H}=renderer.size();
  Object.assign(state.player,{x:W*.5,targetX:W*.5,y:H*.74,vx:0,invuln:0,burst:0});
  tearTimer=.7;sparkTimer=.35;hitStop=0;hud();
}
function start(){reset();setScreen('playing')}
function end(){
  setScreen('gameover');
  const n=Math.floor(state.depth);
  if(n>best){best=n;localStorage.setItem(STORAGE,String(best))}
  $('#finalScore').textContent=n+' м';
  $('#bestScore').textContent='Рекорд: '+best+' м';
}
function spawnTear(){
  const {W}=renderer.size(),w=48+rand()*74;
  state.tears.push({x:34+rand()*Math.max(1,W-68-w),y:-100,w,h:28+rand()*28,lean:(rand()-.5)*.7});
}
function spawnSpark(){
  const {W}=renderer.size();
  state.sparks.push({x:34+rand()*Math.max(1,W-68),y:-40,r:7+rand()*3,phase:rand()*Math.PI*2});
}
function circleRect(cx,cy,r,o){
  const nx=clamp(cx,o.x,o.x+o.w),ny=clamp(cy,o.y,o.y+o.h),dx=cx-nx,dy=cy-ny;
  return dx*dx+dy*dy<r*r;
}
function hit(){
  const p=state.player;
  if(p.invuln>0||p.burst>0)return;
  state.lives--;p.invuln=1.05;state.flash=.34;state.charge=Math.max(0,state.charge-30);hitStop=.05;
  particles(p.x,p.y,'#f2ecdf',18,175);
  if(navigator.vibrate)navigator.vibrate(18);
  if(state.lives<=0)end();
}
function doBurst(){
  if(state.screen!=='playing'||state.charge<100)return;
  state.charge=0;state.player.burst=1.05;state.player.invuln=1.05;
  particles(state.player.x,state.player.y,'#df7c55',26,205);
  for(const o of state.tears){
    const dx=o.x+o.w/2-state.player.x,dy=o.y+o.h/2-state.player.y;
    if(dx*dx+dy*dy<180*180){o.dead=true;particles(o.x+o.w/2,o.y+o.h/2,'#f2ecdf',8,130);state.depth+=6}
  }
  hud();
}
function update(dt){
  if(hitStop>0){hitStop-=dt;return}
  state.depth+=dt*state.speed*.055;
  state.speed=Math.min(520,260+state.depth*.34);
  const p=state.player,old=p.x;
  p.x+=(p.targetX-p.x)*(1-Math.exp(-dt*13));p.vx=(p.x-old)/Math.max(dt,.001);
  p.invuln=Math.max(0,p.invuln-dt);p.burst=Math.max(0,p.burst-dt);
  state.trails.push({x:p.x,y:p.y+18,life:.42,vx:-p.vx*.0007});
  if(state.trails.length>26)state.trails.shift();

  tearTimer-=dt;sparkTimer-=dt;
  if(tearTimer<=0){spawnTear();tearTimer=Math.max(.29,.78-state.depth*.00055)*(.74+rand()*.52)}
  if(sparkTimer<=0){spawnSpark();sparkTimer=.55+rand()*.65}

  const fall=state.speed*(p.burst>0?1.28:1);
  for(const o of state.tears){
    o.y+=fall*dt;
    if(!o.dead&&circleRect(p.x,p.y,13,o)){
      o.dead=true;
      if(p.burst>0){particles(o.x+o.w/2,o.y+o.h/2,'#f2ecdf',8,130);state.depth+=5}else hit();
    }
  }
  for(const o of state.sparks){
    o.y+=fall*dt*.92;
    let dx=o.x-p.x,dy=o.y-p.y;
    if(p.burst>0&&dx*dx+dy*dy<170*170){o.x+=(p.x-o.x)*Math.min(1,dt*7);o.y+=(p.y-o.y)*Math.min(1,dt*7);dx=o.x-p.x;dy=o.y-p.y}
    if(dx*dx+dy*dy<23*23){o.dead=true;state.charge=Math.min(100,state.charge+20);state.depth+=4;particles(o.x,o.y,'#df7c55',10,110)}
  }
  for(const q of state.particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.vx*=Math.pow(.1,dt);q.vy*=Math.pow(.18,dt);q.life-=dt}
  for(const q of state.trails){q.y+=fall*dt*.15;q.x+=q.vx;q.life-=dt}
  const {H}=renderer.size();
  state.tears=state.tears.filter(o=>!o.dead&&o.y<H+120);
  state.sparks=state.sparks.filter(o=>!o.dead&&o.y<H+80);
  state.particles=state.particles.filter(o=>o.life>0);
  state.trails=state.trails.filter(o=>o.life>0);
  state.flash=Math.max(0,state.flash-dt*1.8);
  hud();
}
function frame(now){
  const dt=Math.min(.033,Math.max(0,(now-last)/1000));last=now;
  if(state.screen==='playing')update(dt);
  renderer.render(now);requestAnimationFrame(frame);
}
function pointerX(x){
  const r=canvas.getBoundingClientRect();
  state.player.targetX=clamp(x-r.left,28,r.width-28);
}
canvas.addEventListener('pointerdown',e=>{if(state.screen!=='playing')return;pointer=e.pointerId;canvas.setPointerCapture?.(pointer);pointerX(e.clientX)});
canvas.addEventListener('pointermove',e=>{if(state.screen==='playing'&&e.pointerId===pointer)pointerX(e.clientX)});
for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,e=>{if(e.pointerId===pointer)pointer=null});
canvas.addEventListener('lostpointercapture',()=>{pointer=null});

$('#startBtn').addEventListener('click',start);
$('#restartBtn').addEventListener('click',start);
$('#restartPauseBtn').addEventListener('click',start);
$('#resumeBtn').addEventListener('click',()=>setScreen('playing'));
pauseBtn.addEventListener('click',()=>{if(state.screen==='playing')setScreen('paused')});
burstBtn.addEventListener('click',doBurst);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.screen==='playing')setScreen('paused')});
addEventListener('resize',()=>renderer.resize(),{passive:true});

renderer.resize();setScreen('menu');hud();requestAnimationFrame(frame);
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}),{once:true});
