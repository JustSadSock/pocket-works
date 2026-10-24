#!/usr/bin/env node
// Headless editor regression. No live PocketNet account or external film required.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,mkdirSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const output=process.env.PW_QA_OUTPUT_DIR||join(tmpdir(),'ntg-timeline-journey');
mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
  const path=statSync(file).isDirectory()?join(file,'index.html'):file;
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(readFileSync(path));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 for(const vp of [{name:'desktop',width:1366,height:768},{name:'mobile',width:390,height:844}]){
  const ctx=await browser.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.name==='mobile',hasTouch:vp.name==='mobile'});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.route('https://**/*',route=>route.abort());
  await page.goto(origin+'/apps/ne-tem-golosom/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
   const req=indexedDB.open('pocket-works:ne-tem-golosom:drafts',2);
   req.onupgradeneeded=()=>{
    if(!req.result.objectStoreNames.contains('drafts'))req.result.createObjectStore('drafts',{keyPath:'key'});
    if(!req.result.objectStoreNames.contains('media'))req.result.createObjectStore('media',{keyPath:'key'});
   };
   const db=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error)});
   const b1=new Blob(['fake-audio-one'],{type:'audio/webm'}),b2=new Blob(['fake-audio-two'],{type:'audio/webm'});
   const key='solo::wing-launch::44::55';
   const scene={id:'wing-launch',title:'WING IT! · ПОЛЁТ',roles:['Кот','Пёс','Курица'],start:44,duration:55,custom:false};
   const record={key,scene,updated:Date.now(),timeline:{
    version:2,assets:[b1,b2],
    clips:[
     {id:'first',start:3,end:8,offset:0,owner:'solo',asset:0},
     {id:'second',start:14,end:21,offset:0,owner:'solo',asset:1}
    ],past:[],future:[],selected:null
   }};
   await new Promise((ok,fail)=>{
    const tx=db.transaction('drafts','readwrite');
    tx.objectStore('drafts').put(record);
    tx.oncomplete=ok;tx.onerror=()=>fail(tx.error);
   });
   db.close();
  });
  await page.locator('#solo-btn').click();
  await page.locator('[data-scene="wing-launch"]').click();
  await page.locator('#confirm-scene').click();
  await page.locator('#screen-editor:not(.hidden)').waitFor();
  assert.equal(await page.locator('.clip-bar').count(),2,'restores initial clips');

  // A timeupdate must not re-create the focused clip elements.
  assert.equal(await page.locator('#clip-lane').evaluate(el=>{
   const first=el.querySelector('.clip-bar');
   document.querySelector('#stage-video').dispatchEvent(new Event('timeupdate'));
   return first===el.querySelector('.clip-bar');
  }),true,'timeupdate preserves clip DOM');
  assert.equal(await page.locator('#erase-btn').isDisabled(),true,'nothing deleted without explicit selection');
  await page.locator('[data-clip="first"]').click();
  assert.equal(await page.locator('#erase-btn').isEnabled(),true);
  await page.locator('#erase-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),1);
  await page.locator('#undo-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),2);
  await page.locator('#redo-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),1);
  await page.screenshot({path:join(output,vp.name+'-redo.png')});

  await page.locator('#editor-leave').click();
  await page.locator('#screen-library:not(.hidden)').waitFor();
  await page.locator('[data-scene="wing-launch"]').click();
  await page.locator('#confirm-scene').click();
  await page.locator('#screen-editor:not(.hidden)').waitFor();
  assert.equal(await page.locator('.clip-bar').count(),1,'draft survives navigation');
  assert.equal(await page.locator('#undo-btn').isEnabled(),true,'history survives navigation');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#solo-btn').click();
  await page.locator('[data-scene="wing-launch"]').click();
  await page.locator('#confirm-scene').click();
  await page.locator('#screen-editor:not(.hidden)').waitFor();
  assert.equal(await page.locator('.clip-bar').count(),1,'draft survives full reload');
  assert.equal(await page.locator('#undo-btn').isEnabled(),true,'undo stack survives reload');
  await page.locator('#undo-btn').click();
  assert.equal(await page.locator('.clip-bar').count(),2);
  assert.deepEqual(errors,[],vp.name+' must have no JS errors');
  console.log(vp.name,'timeline journey passed');
  await ctx.close();
 }
}finally{
 await browser.close();
 await new Promise(ok=>server.close(ok));
}
