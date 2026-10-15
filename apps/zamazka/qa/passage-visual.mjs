#!/usr/bin/env node
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';
import {admissionMarkup,connectionMarkup,preparingMarkup,waitingMarkup} from '../passage-ui.js';
import {ARTS,artworkURL} from '../artworks.js';
const dir=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-passage-qa');
mkdirSync(dir,{recursive:true});
const url=pathToFileURL(resolve(fileURLToPath(new URL('../index.html',import.meta.url)))).href;
const players=Array.from({length:8},(_,i)=>({id:'id'+i,name:['Анна','Богдан','Марианна Петровская','Лев','Кристина','Глеб','Ника','Валентин'][i]}));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const portrait='<span class="member-seal member-avatar"><span class="guest-initial">А</span></span>';
const head=(label,title,until)=>'<div class="phase-head"><div class="phase-intro"><div class="eyebrow">'+label+'</div><h2>'+title+
 '</h2></div><div class="phase-head-controls"><div class="timer">2:40</div><button class="phase-menu" data-action="menu">← Меню</button></div></div>';
const admissionOptions={name:'Анна',member:false,portrait,artURL:artworkURL(0),escapeText:esc};
const waiting=()=>waitingMarkup({view:{round:2,deadline:Date.now()+88000,drawingSeconds:160,done:['id0','id1','id4'],participants:players},
 ass:{art:1,variation:1,strokes:[]},arts:ARTS,escapeText:esc,
 memberSeal:p=>'<span class="member-seal member-avatar"><span class="guest-initial">'+esc(p.name[0])+'</span></span>',
 head,artFactsHtml:id=>'<span class="art-head-identity">'+esc(ARTS[id]?.artist)+'</span>'});
const layouts=[
 {name:'desktop-window-1366x640',w:1366,h:640},
 {name:'desktop-1920x1080',w:1920,h:1080},
 {name:'desktop-1024x768',w:1024,h:768},
 {name:'mobile-browser-390x680',w:390,h:680,mobile:true},
 {name:'mobile-pwa-390x844',w:390,h:844,mobile:true},
 {name:'mobile-small-320x568',w:320,h:568,mobile:true},
 {name:'mobile-tall-430x932',w:430,h:932,mobile:true},
 {name:'mobile-landscape-844x390',w:844,h:390,mobile:true}
];
const browser=await chromium.launch({headless:true});
let checks=0;
try{
 for(const layout of layouts){
  const context=await browser.newContext({viewport:{width:layout.w,height:layout.h},
   isMobile:!!layout.mobile,hasTouch:!!layout.mobile,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/*.js',route=>route.abort());
  await page.goto(url,{waitUntil:'load'});
  const stages=[
    {name:'admission-create',html:admissionMarkup({...admissionOptions,creating:true})},
    {name:'admission-join-error',html:admissionMarkup({...admissionOptions,creating:false,roomValue:'ABCD-1234',error:'Комната переполнена — максимум восемь игроков.'})},
    {name:'connecting',html:connectionMarkup({mode:'join'})},
    {name:'preparing',html:preparingMarkup({round:2,total:8,ready:4})},
    {name:'waiting',html:waiting()}
  ];
  for(const stage of stages){
   await page.evaluate(({html,height})=>{
    document.querySelector('.app-shell').style.setProperty('--app-viewport-height',height+'px');
    document.querySelector('#screen').innerHTML=html;
   },{html:stage.html,height:layout.h});
   if(stage.name==='preparing')await page.evaluate(()=>{
    for(let i=0;i<3;i++)document.querySelector('[data-art-slot="'+i+'"]')?.classList.add('is-loaded');
    const track=document.querySelector('#artLoadTrack');
    track.style.setProperty('--passage-progress','60%');track.setAttribute('aria-valuenow','3');
    document.querySelector('#artLoadCount').textContent='3 / 5';
   });
   if(stage.name==='waiting'){
    await page.evaluate(async imgUrl=>{
     const image=new Image();image.src=imgUrl;
     try{await image.decode()}catch{}
     for(const id of ['restCanvas','origCanvas']){
      const c=document.getElementById(id);c.width=600;c.height=450;const ctx=c.getContext('2d');
      if(image.naturalWidth)ctx.drawImage(image,0,0,600,450);
      else{ctx.fillStyle='#516f5b';ctx.fillRect(0,0,600,450)}
      if(id==='restCanvas'){ctx.fillStyle='#a9815e99';ctx.beginPath();ctx.ellipse(270,170,100,75,0,0,Math.PI*2);ctx.fill()}
     }
    },artworkURL(1));
   }
   await page.waitForTimeout(140);
   const metrics=await page.evaluate(()=>{
    const root=document.querySelector('#screen'),scene=root.firstElementChild;
    const box=el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
    const base=box(root),main=box(scene);
    const buttons=[...scene.querySelectorAll('button:not([hidden])')].filter(el=>{
     const cs=getComputedStyle(el);return cs.display!=='none'&&cs.visibility!=='hidden';
    });
    const clipped=buttons.filter(el=>{
     const r=box(el);return r.w<22||r.h<20||r.x<base.x-2||r.right>base.right+2||r.y<base.y-2||r.bottom>base.bottom+2;
    }).map(el=>({text:el.textContent.trim().slice(0,40),rect:box(el)}));
    const innerClipped=buttons.filter(el=>{
     const r=box(el);
     for(let p=el.parentElement;p&&p!==scene;p=p.parentElement){
      const c=getComputedStyle(p),pr=box(p);
      if(['clip','hidden'].includes(c.overflowY)&&(r.bottom>pr.bottom+3||r.y<pr.y-3))return true;
      if(['clip','hidden'].includes(c.overflowX)&&(r.right>pr.right+3||r.x<pr.x-3))return true;
     }
     return false;
    }).map(el=>el.textContent.trim().slice(0,30));
    const area=scene.querySelector('.unveil-frame,.passage-art-frame,.passage-image-strip,.passage-steps,.passage-entry-form');
    return {rootScroll:root.scrollHeight-root.clientHeight,sceneScroll:scene.scrollHeight-scene.clientHeight,
      bounds:main,clipped,innerClipped,area:area?box(area):null,buttons:buttons.length};
   });
   assert(metrics.rootScroll<=7,layout.name+' '+stage.name+' root scroll '+JSON.stringify(metrics));
   assert(metrics.sceneScroll<=7,layout.name+' '+stage.name+' document scroll '+JSON.stringify(metrics));
   assert.equal(metrics.clipped.length,0,layout.name+' '+stage.name+' off-screen controls '+JSON.stringify(metrics.clipped));
   assert.equal(metrics.innerClipped.length,0,layout.name+' '+stage.name+' internally hidden controls '+JSON.stringify(metrics.innerClipped));
   assert(metrics.area?.w>100&&metrics.area?.h>35,layout.name+' '+stage.name+' primary surface shrunk '+JSON.stringify(metrics));
   if(stage.name==='waiting')assert(metrics.area.h>55,layout.name+' compare canvas too small');
   await page.screenshot({path:join(dir,layout.name+'-'+stage.name+'.png'),fullPage:false});
   console.log(layout.name+' '+stage.name+' surface '+Math.round(metrics.area.w)+'×'+Math.round(metrics.area.h));
   checks++;
  }
  assert.deepEqual(errors,[],'Unexpected page errors in '+layout.name);
  await context.close();
 }
}finally{await browser.close()}
console.log('ZAMAZKA passages: '+checks+' real CSS/HTML Playwright frames and layout assertions passed');
