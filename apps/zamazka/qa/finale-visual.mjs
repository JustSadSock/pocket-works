import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';
import {ARTS,REAL_COUNT,artworkURL} from '../artworks.js';
import {finaleVerdictMarkup,finaleResultsMarkup,finaleRevealAuditMarkup} from '../finale-ui.js';

const dir=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-finale-qa');
mkdirSync(dir,{recursive:true});
const url=pathToFileURL(resolve(fileURLToPath(new URL('../index.html',import.meta.url)))).href;
const selected=Array.from({length:5},(_,i)=>REAL_COUNT+i);
const people=Array.from({length:8},(_,i)=>({id:'p'+i,name:['Анна','Богдан','Мира','Лев','Соня','Глеб','Ника','Роман'][i]}));
const votes=Object.fromEntries(people.slice(1).map((p,i)=>[p.id,
 Array.from({length:5},(_,k)=>k===i%5?3:0)]));
const gallery=[{id:'p2',name:'Мира',art:selected[2],variation:1,strokes:[],votes}];
const scores=Object.fromEntries(people.map((p,i)=>[p.id,{mask:Math.max(0,180-i*16),eye:Math.max(0,63+i*9)}]));
const view={phase:'verdict',round:1,rounds:3,turn:0,host:'p0',participants:people,selected,gallery,scores,deadline:Date.now()+60000};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const memberSeal=p=>'<span class="member-seal member-avatar"><span class="guest-initial">'+esc(p.name.charAt(0))+'</span></span>';
const chipDots=n=>'<span class="chip-dots">'+Array.from({length:Math.min(n,9)},()=>'<i class="chip-dot" aria-hidden="true"></i>').join('')+'</span>';
const head=(overline,title)=>'<div class="phase-head"><div class="phase-intro"><div class="eyebrow">'+esc(overline)+'</div><h2>'+esc(title)+'</h2></div><div class="phase-head-controls"><span class="timer">0:28</span></div></div>';
const verdict=finaleVerdictMarkup({view,artworks:ARTS,artworkURL,escapeText:esc,head,chipDots,hostId:'p0'});
const results=finaleResultsMarkup({view,escapeText:esc,memberSeal,pocketPlayerBadge:()=>'',hostId:'p0'});
const g=gallery[0],correct=selected.indexOf(g.art);
const breakdown=people.filter(p=>p.id!==g.id).map(p=>({
 name:p.name,correct:g.votes[p.id]?.[correct]||0,
 wrong:3-(g.votes[p.id]?.[correct]||0),points:Math.round((g.votes[p.id]?.[correct]||0)*100/7)
}));
const wrong=breakdown.reduce((n,p)=>n+p.wrong,0);
const answerStrip=selected.map((id,i)=>'<div class="reveal-option'+(id===g.art?' is-answer':'')+'"><div class="reveal-option-image">'+
 (id===g.art?'<canvas id="correctCandidate"></canvas>':'<img src="'+artworkURL(id)+'" alt="'+esc(ARTS[id].title)+'">')+
 '</div><span>№ '+(i+1)+(id===g.art?' · ВЕРНО':'')+'</span></div>').join('');
const reveal='<section class="phase-page reveal-phase finale-reveal finale-scene is-composed" data-finale-phase="reveal">'+
 head('РАЗОБЛАЧЕНИЕ · 1 / 8','Подлинник найден')+
 '<div class="phase-body reveal-layout"><div class="reveal-main"><div class="finale-reveal-provenance"><span class="finale-overline">ЗАКЛЮЧЕНИЕ · ДЕЛО 01</span>'+
 '<h3>'+esc(g.name)+'</h3><p>Подлинник: <strong>'+esc(ARTS[g.art].title)+'</strong> · '+esc(ARTS[g.art].artist)+'</p></div>'+
 '<div class="reveal-answer-strip" aria-label="Итоги голосования — правильный вариант подсвечен">'+answerStrip+'</div>'+
 '<div class="finale-inspection-label"><span>РЕСТАВРАЦИЯ</span><i></i><span>ОРИГИНАЛ</span></div>'+
 '<div class="unveil-frame" id="unveilStage" style="--split:50%">'+
 '<canvas id="restCanvas" class="unveil-bottom" aria-label="Реставрация"></canvas>'+
 '<canvas id="origCanvas" class="unveil-top" aria-label="Подлинник"></canvas>'+
 '<span class="unveil-label left">РЕСТАВРАЦИЯ</span><span class="unveil-label right">ОРИГИНАЛ</span><div class="unveil-ruler"></div></div>'+
 '<label class="unveil-control">Сравнение: двигай разделитель <input id="unveilRange" type="range" min="0" max="100" value="50"></label></div>'+
 '<div class="reveal-brief finale-reveal-brief"><div class="outcome-head finale-outcome"><span>ПОДЛИННИК УСТАНОВЛЕН</span><h3>Полотно № 3</h3><strong>'+esc(ARTS[g.art].title)+'</strong></div>'+
 finaleRevealAuditMarkup({breakdown,wrong,bonus:Math.round(wrong*50/7),escapeText:esc,chipDots})+
 '<button class="btn primary" data-action="advance">Следующий экспонат →</button></div></div></section>';
const layouts=[
 {name:'windowed-1366-640',w:1366,h:640},
 {name:'desktop-1920-1080',w:1920,h:1080},
 {name:'compact-1024-768',w:1024,h:768},
 {name:'browser-390-680',w:390,h:680,mobile:true},
 {name:'pwa-390-844',w:390,h:844,mobile:true},
 {name:'small-360-640',w:360,h:640,mobile:true},
 {name:'landscape-844-390',w:844,h:390,mobile:true}
];
const browser=await chromium.launch({headless:true});
try{
 for(const layout of layouts){
  const context=await browser.newContext({viewport:{width:layout.w,height:layout.h},isMobile:!!layout.mobile,hasTouch:!!layout.mobile,deviceScaleFactor:1});
  const page=await context.newPage();
  await page.route('**/*.js',route=>route.abort());
  await page.goto(url,{waitUntil:'load'});
  for(const [name,markup] of [['verdict',verdict],['reveal',reveal],['results',results]]){
   await page.evaluate(({markup,viewportHeight})=>{
    document.querySelector('.app-shell').style.setProperty('--app-viewport-height',viewportHeight+'px');
    document.querySelector('#screen').innerHTML=markup;
   },{markup,viewportHeight:layout.h});
   if(name==='reveal'){
    await page.evaluate(async src=>{
     const img=new Image();img.src=src;try{await img.decode()}catch{}
     for(const key of ['restCanvas','origCanvas','correctCandidate']){
      const canvas=document.getElementById(key);if(!canvas)continue;
      canvas.width=600;canvas.height=450;const ctx=canvas.getContext('2d');
      if(img.naturalWidth)ctx.drawImage(img,0,0,600,450);
      else{ctx.fillStyle='#75958b';ctx.fillRect(0,0,600,450)}
      if(key!=='origCanvas'){ctx.fillStyle='#b78559af';ctx.fillRect(130,110,165,140);}
     }
    },artworkURL(g.art));
   }
   await page.waitForTimeout(620);
   const metrics=await page.evaluate(()=>{
    const root=document.querySelector('#screen'),scene=root.firstElementChild,r=scene.getBoundingClientRect();
    const interactive=[...scene.querySelectorAll('button')].filter(e=>getComputedStyle(e).display!=='none');
    const action=interactive.find(e=>e.matches('[data-action="advance"],[data-action="next"]'));
    const ar=action?.getBoundingClientRect();
    const hidden=interactive.filter(e=>{const a=e.getBoundingClientRect();return a.width<22||a.height<22}).map(e=>e.textContent.trim());
    const rail=scene.querySelector('.finale-ballot-grid'),ranking=scene.querySelector('.finale-ranking');
    const stage=scene.querySelector('.unveil-frame, .finale-laureate, .verdict-image');
    return {scroll:root.scrollHeight-root.clientHeight,sceneScroll:scene.scrollHeight-scene.clientHeight,
     shellHeight:document.querySelector('.app-shell').clientHeight,scene:{height:r.height,width:r.width},
     actionVisible:!action||!!(ar&&ar.top>=0&&ar.bottom<=root.getBoundingClientRect().bottom+2),
     hidden,stage:stage?{w:stage.getBoundingClientRect().width,h:stage.getBoundingClientRect().height}:null,
     railScrollable:rail?rail.scrollWidth>rail.clientWidth+3:null,
     rankingScrollable:ranking?ranking.scrollHeight>ranking.clientHeight+3:null};
   });
   assert(metrics.scroll<=5,layout.name+' '+name+' root overflow '+JSON.stringify(metrics));
   assert(metrics.sceneScroll<=7,layout.name+' '+name+' scene overflow '+JSON.stringify(metrics));
   assert(metrics.actionVisible,layout.name+' '+name+' primary action is clipped '+JSON.stringify(metrics));
   assert.deepEqual(metrics.hidden,[],layout.name+' '+name+' collapsed buttons');
   assert(metrics.stage?.w>=50&&metrics.stage?.h>=35,layout.name+' '+name+' stage too small '+JSON.stringify(metrics));
   if(name==='verdict'&&layout.w<=400)assert(metrics.railScrollable,layout.name+' should swipe evidence horizontally');
   await page.screenshot({path:join(dir,layout.name+'-'+name+'.png'),fullPage:false});
   console.log(layout.name+' '+name+' stage '+Math.round(metrics.stage.w)+'×'+Math.round(metrics.stage.h)+' scroll='+metrics.scroll);
  }
  await context.close();
 }
 console.log('ZAMAZKA finale: 21 production-style Playwright captures and viewport/action checks passed; '+dir);
}finally{await browser.close()}
