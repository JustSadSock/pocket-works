#!/usr/bin/env node
// Desktop workbench visual/interaction contract with no real camera or servers.
// Seed overlapping clips then assert every action stays within a fixed dock.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mimes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 try{const name=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(name!==root&&!name.startsWith(root+sep)){res.writeHead(403).end();return}
  const p=statSync(name).isDirectory()?join(name,'index.html'):name;
  res.writeHead(200,{'content-type':mimes[extname(p)]||'application/octet-stream','cache-control':'no-store'}).end(readFileSync(p));
 }catch{res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port+'/apps/ne-tem-golosom/';
const browser=await chromium.launch({headless:true});
const sizes=[
 {width:1024,height:600},{width:1366,height:768},{width:1440,height:900},
 {width:1920,height:1080},{width:390,height:844,mobile:true},{width:360,height:720,mobile:true}
];
try{
 for(const size of sizes){
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},isMobile:!!size.mobile,hasTouch:!!size.mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?debug=play',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
   const key='debug::solo::wing-launch::44::55',b=new Blob(['fixture'],{type:'audio/webm'});
   const db=await new Promise((resolve,reject)=>{
    const r=indexedDB.open('pocket-works:ne-tem-golosom:drafts',2);
    r.onupgradeneeded=()=>{
     if(!r.result.objectStoreNames.contains('drafts'))r.result.createObjectStore('drafts',{keyPath:'key'});
     if(!r.result.objectStoreNames.contains('media'))r.result.createObjectStore('media',{keyPath:'key'});
    };
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
   });
   const clips=[{id:'first',start:2,end:7,offset:0,asset:0,owner:'solo'},
    {id:'second',start:3,end:8,offset:0,asset:0,owner:'solo'},
    {id:'third',start:4,end:9,offset:0,asset:0,owner:'solo'}];
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts','readwrite');
    tx.objectStore('drafts').put({key,scene:{id:'wing-launch',title:'Workstation',start:44,duration:55},updated:Date.now(),
      timeline:{version:2,assets:[b],clips,past:[],future:[],selected:'first'}});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });db.close();
  });
  await page.goto(base+'?debug=play&screen=editor',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#screen-editor:not(.hidden)');
  await page.locator('[data-clip="first"]').click();
  await page.locator('#voice-fx-more').click();
  const metrics=await page.evaluate(()=>{
   const q=x=>document.querySelector(x);
   const rect=x=>x.getBoundingClientRect();
   const desk=q('.editor-desk'),stage=q('.stage-wrap'),editor=q('#screen-editor'),inspector=q('.editor-inspector'),
     extra=q('.voice-fx-extra'),timeline=q('.timeline-viewport');
   const safe=(el,parent,tol=3)=>{
    const r=rect(el),p=rect(parent);
    return r.width>0&&r.height>0&&r.left>=p.left-tol&&r.right<=p.right+tol&&r.top>=p.top-tol&&r.bottom<=p.bottom+tol;
   };
   const controls=['#record-btn','#count-record-btn','#finish-btn','#clip-volume',
    '#clip-fade-in','#clip-fade-out','#voice-fx-more','#voice-fx-audition','#voice-fx-pin'];
   const bad=controls.filter(sel=>!safe(q(sel),desk));
   const effects=[...extra.querySelectorAll('button[data-voice-fx]')];
   const blocked=effects.filter(el=>!safe(el,extra)).map(el=>el.textContent);
   return {editor:rect(editor).toJSON(),stage:rect(stage).toJSON(),desk:rect(desk).toJSON(),
    inspector:rect(inspector).toJSON(),extra:rect(extra).toJSON(),
    deskScroll:desk.scrollHeight-desk.clientHeight,extraScroll:extra.scrollHeight-extra.clientHeight,
    timelineScroll:timeline.scrollHeight-timeline.clientHeight,
    bad,blocked,pinned:q('#voice-fx-more').getAttribute('aria-expanded')};
  });
  if(!size.mobile){
   assert(metrics.desk.height>=300,JSON.stringify({size,metrics}));
   assert(metrics.deskScroll<=3,'Desktop desk must never vertically scroll '+JSON.stringify({size,metrics}));
   assert(metrics.extraScroll<=3,'FX shelf must not hide controls vertically '+JSON.stringify({size,metrics}));
   assert.equal(metrics.bad.length,0,'All main buttons within desk '+JSON.stringify({size,metrics}));
   assert.equal(metrics.blocked.length,0,'All extra effects accessible without scrolling '+JSON.stringify({size,metrics}));
   assert(metrics.stage.height>=100,'Movie remains usable '+JSON.stringify({size,metrics}));
   const before=metrics.desk;
   await page.locator('#voice-fx-more').click();
   await page.locator('#voice-fx-more').click();
   const unchanged=await page.evaluate(()=>{
    const d=document.querySelector('.editor-desk').getBoundingClientRect();
    return {top:d.top,height:d.height};
   });
   assert(Math.abs(unchanged.top-before.top)<2&&Math.abs(unchanged.height-before.height)<2,
    'FX toggling must not resize desktop dock '+JSON.stringify({size,metrics,unchanged}));
  }else{
   assert(await page.locator('#voice-fx-extra').isVisible(),'Mobile extra voice FX works');
   assert(await page.locator('#finish-btn').isVisible(),'Mobile finish is accessible');
  }
  assert.deepEqual(errors,[],JSON.stringify({size,errors}));
  console.log(size.width+'x'+size.height,'desk',Math.round(metrics.desk.height),'fx buttons',16,'layout OK');
  await context.close();
 }
}finally{await browser.close();await new Promise(done=>server.close(done))}
