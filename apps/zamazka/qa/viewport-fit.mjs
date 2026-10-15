#!/usr/bin/env node
// Real production CSS, real CSS geometry. Playwright snapshots for browser chrome
// heights, home-screen PWA proportions, desktop windowed and 16:9/ultrawide.
// Run: ZAMAZKA_QA_ARTIFACT_DIR=... node apps/zamazka/qa/viewport-fit.mjs
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';

const entry=pathToFileURL(resolve(fileURLToPath(new URL('../index.html',import.meta.url)))).href;
const dir=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-viewport-fit');
mkdirSync(dir,{recursive:true});
const scenarios=[
 {name:'desktop-window-1280x650',w:1280,h:650},
 {name:'desktop-window-1366x640',w:1366,h:640},
 {name:'desktop-window-1440x720',w:1440,h:720},
 {name:'desktop-16-9',w:1920,h:1080},
 {name:'desktop-ultrawide',w:2560,h:1080},
 {name:'desktop-4-3',w:1024,h:768},
 {name:'tablet-landscape',w:960,h:600},
 {name:'desktop-short',w:1100,h:520},
 {name:'mobile-safari-browser',w:390,h:680,mobile:true},
 {name:'mobile-chrome-browser',w:360,h:640,mobile:true},
 {name:'mobile-pwa-390',w:390,h:844,mobile:true,standalone:true,safeTop:40},
 {name:'mobile-pwa-430',w:430,h:932,mobile:true,standalone:true,safeTop:50},
 {name:'mobile-small',w:320,h:568,mobile:true},
 {name:'mobile-tall',w:375,h:812,mobile:true,standalone:true,safeTop:34},
 {name:'mobile-landscape',w:844,h:390,mobile:true,standalone:true},
 {name:'tablet-portrait',w:768,h:1024,mobile:true}
];
const players=Array.from({length:8},(_,i)=>'<div class="player"><span class="member-avatar">◉</span><strong class="player-name">Игрок '+(i+1)+'</strong><span class="status">'+(i?'Игрок':'Ведущий')+'</span>'+(i?'<button type="button" class="lobby-kick">Исключить</button>':'')+'</div>').join('');
function lobbyMarkup(count=3){
 const roster=count===8?players:players.split('</div>').slice(0,3).join('</div>')+'</div>';
 return '<section class="page exhibition-lobby">'+
 '<header class="lobby-mast"><div><span class="section-label">СОВМЕСТНАЯ ВЫСТАВКА</span><h2>Комната ожидания</h2></div><button class="lobby-exit">← Выйти</button></header>'+
 '<div class="lobby-invite"><div class="room-ticket"><div class="ticket-top"><span class="section-label">ПРИГЛАСИТЬ В КОМНАТУ</span><span class="ticket-live">ОТКРЫТА</span></div><div class="room-code">ABCD-1234</div>'+
 '<div class="ticket-actions"><button class="btn primary">Скопировать код</button><button class="btn ghost">Ссылка ↗</button><button class="btn pocket-invite">Пригласить друзей</button></div></div>'+
 '<div class="stack lobby-controls"><div class="lobby-controls-title">Настройки выставки</div><label class="field">Раундов</label><select class="input"><option>3 раунда</option></select>'+
 '<label class="field">Время рисования</label><select class="input"><option>3 минуты</option></select>'+
 '<button class="btn primary" data-action="start">Начать выставку ↗</button></div></div>'+
 '<div class="commons-desk"><div class="commons-topline"><div><span class="section-label">ОБЩИЙ ХОЛСТ</span><h3>Совместное рисование</h3><p>Оставьте рисунок друг другу</p></div>'+
 '<span class="commons-online">В СЕТИ</span></div><div class="commons-frame"><canvas id="commonsCanvas" width="960" height="600"></canvas></div>'+
 '<div class="commons-controls"><div class="commons-palette">'+Array.from({length:6},(_,i)=>'<button class="commons-swatch" style="background:hsl('+(i*60)+'deg 45% 48%)"></button>').join('')+
 '</div><label class="commons-width">Толщина<input type="range" min="2" max="48"></label><button class="commons-wipe">Очистить холст</button></div></div>'+
 '<aside class="lobby-attendance"><div class="lobby-list-heading"><span class="section-label">УЧАСТНИКИ · '+count+'/8</span></div><div class="players">'+roster+'</div></aside></section>';
}
const browser=await chromium.launch({headless:true});
try{
 for(const scenario of scenarios){
  const ctx=await browser.newContext({viewport:{width:scenario.w,height:scenario.h},deviceScaleFactor:1,
    isMobile:Boolean(scenario.mobile),hasTouch:Boolean(scenario.mobile)});
  const page=await ctx.newPage();
  await page.goto(entry,{waitUntil:'load'});
  await page.evaluate(({html,displayMode,safeTop,available})=>{
   const shell=document.querySelector('.app-shell');
   document.querySelector('#screen').innerHTML=html;
   shell.style.setProperty('--app-viewport-height',available+'px');
   shell.style.setProperty('--app-safe-top',(safeTop||0)+'px');
   document.documentElement.dataset.testDisplay=displayMode;
  },{html:lobbyMarkup(3),displayMode:scenario.standalone?'standalone':'browser',safeTop:scenario.safeTop||0,available:scenario.h});
  // Force the CSS resize/layout lifecycle to settle, but do not change
  // app drawing dimensions or transform the pointer hit region.
  await page.waitForTimeout(45);
  const metrics=await page.evaluate(()=>{
   const root=document.querySelector('#screen'),scene=root.firstElementChild,canvas=document.querySelector('#commonsCanvas');
   const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
   const rr=rect(root),sc=rect(scene),board=rect(canvas),buttons=[...scene.querySelectorAll('button,select')];
   const visibleButtons=buttons.filter(el=>{
    const r=rect(el),s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&r.w>0&&r.h>0;
   });
   const out=visibleButtons.filter(el=>{
    // The roster deliberately scrolls horizontally on narrow screens.
    // Offscreen kick buttons remain accessible by swiping that rail;
    // they are not clipped primary gameplay controls.
    const rail=el.closest('.lobby-attendance .players');
    if(rail&&rail.scrollWidth>rail.clientWidth+3&&getComputedStyle(rail).overflowX!=='hidden')return false;
    const r=rect(el);return r.x<-2||r.right>innerWidth+2||r.y<rr.y-3||r.bottom>rr.bottom+3;
   }).map(el=>({text:el.textContent.trim().slice(0,25),box:rect(el)}));
   return {rootScroll:root.scrollHeight-root.clientHeight,sceneScroll:scene.scrollHeight-scene.clientHeight,
    htmlScroll:document.documentElement.scrollHeight-document.documentElement.clientHeight,
    wOverflow:root.scrollWidth-root.clientWidth,scene:sc,root:rr,board,
    mast:rect(scene.querySelector('.lobby-mast')),
    invite:rect(scene.querySelector('.lobby-invite')),
    desk:rect(scene.querySelector('.commons-desk')),
    roster:rect(scene.querySelector('.lobby-attendance')),
    buttonCount:visibleButtons.length,
    out,topHeight:document.querySelector('.top').getBoundingClientRect().height,
    canvasTransform:getComputedStyle(canvas).transform,
    boardIsDrawing:board.w>70&&board.h>38};
  });
  assert(metrics.rootScroll<=3,scenario.name+' root scroll '+JSON.stringify(metrics));
  assert(metrics.sceneScroll<=4,scenario.name+' scene overflows '+JSON.stringify(metrics));
  assert(metrics.wOverflow<=3,scenario.name+' horizontal overflow '+JSON.stringify(metrics));
  assert(metrics.boardIsDrawing,scenario.name+' shared canvas disappeared '+JSON.stringify(metrics));
  // A screen may have zero overflow while CSS accidentally auto-places all
  // sections in the wrong grid cells. Check the spatial composition explicitly.
  if(scenario.w>=1100){
   assert(metrics.mast.w>scenario.w*.70,scenario.name+' mast did not span top');
   assert(metrics.invite.right<=metrics.desk.x+4,scenario.name+' invitation not left of board');
   assert(metrics.desk.right<=metrics.roster.x+4,scenario.name+' roster not right of board');
   assert(metrics.board.w>=Math.min(320,scenario.w*.23),scenario.name+' board too small for available screen');
  }else if(scenario.w>=700){
   assert(metrics.invite.right<=metrics.desk.x+4,scenario.name+' two-column layout broken');
   assert(metrics.board.w>=170,scenario.name+' collapsed tablet board');
  }else{
   assert(metrics.desk.y>=metrics.invite.bottom-3,scenario.name+' mobile stage wrong order');
  }
  assert.equal(metrics.canvasTransform,'none',scenario.name+' raster canvas was transformed');
  assert.equal(metrics.out.length,0,scenario.name+' invisible/clipped controls '+JSON.stringify(metrics.out));
  assert(metrics.buttonCount>=9,scenario.name+' some controls missing');
  await page.screenshot({path:join(dir,scenario.name+'.png'),fullPage:false});
  // Four very different windows test a full eight-person roster as well.
  if(['desktop-window-1366x640','desktop-16-9','mobile-pwa-390','mobile-safari-browser'].includes(scenario.name)){
   await page.evaluate(html=>{document.querySelector('#screen').innerHTML=html},lobbyMarkup(8));
   const crowd=await page.evaluate(()=>{
    const s=document.querySelector('#screen'),l=s.firstElementChild;
    return {root:s.scrollHeight-s.clientHeight,scene:l.scrollHeight-l.clientHeight,
      attendance:l.querySelector('.lobby-attendance').getBoundingClientRect().height,
      count:l.querySelectorAll('.player').length};
   });
   assert.equal(crowd.count,8);assert(crowd.root<=3&&crowd.scene<=4,scenario.name+' eight-person layout overflow '+JSON.stringify(crowd));
   await page.screenshot({path:join(dir,scenario.name+'-8players.png'),fullPage:false});
  }
  await ctx.close();
  console.log(scenario.name+': lobby fits, canvas '+Math.round(metrics.board.w)+'x'+Math.round(metrics.board.h)+', '+metrics.buttonCount+' controls visible');
 }
}finally{await browser.close()}
console.log('ZAMAZKA viewport: '+scenarios.length+' cross-aspect layouts and four full-roster variants captured');
