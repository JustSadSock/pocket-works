#!/usr/bin/env node
// Non-decorative regression: real app CSS and real phase markup, in isolated
// debug-frame iframes at desktop / tablet / portrait browser dimensions.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'};
const web=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname);
 const path=resolve(root,'.'+name,name.endsWith('/')?'index.html':'');
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 try{const bytes=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes)}
 catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(ok=>web.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+web.address().port+'/apps/zamazka/';
const browser=await chromium.launch({headless:true});
const output=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-visual-147');
await mkdir(output,{recursive:true});
let passed=0;
try{
 for(const size of [{label:'desktop',width:1440,height:900},{label:'compact',width:1160,height:690},{label:'phone',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,isMobile:size.width<700,hasTouch:size.width<700});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('.museum-home').waitFor({timeout:25000});
  await page.evaluate(()=>{
   const frame=document.createElement('iframe');
   frame.id='qaRealFrame';frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:9999;border:0;background:#1c362b';
   document.body.append(frame);
  });
  const child=page.frameLocator('#qaRealFrame');
  const preview=async id=>{
   await page.evaluate(id=>{
    const frame=document.querySelector('#qaRealFrame');
    frame.src='./?__zamazka_debug_screen='+encodeURIComponent(id);
   },id);
   await child.locator('#screen[data-debug-preview="'+id+'"]').waitFor({timeout:30000});
   await page.waitForTimeout(360);
  };
  const metrics=()=>child.locator('#screen').evaluate(root=>{
   const stage=root.firstElementChild?.getBoundingClientRect();
   return {width:root.clientWidth,scroll:root.scrollWidth,
    stageWidth:stage?.width,height:stage?.height,
    lines:document.querySelectorAll('.set-pilaster:not([hidden])').length};
  });
  const compareFrame=async()=>{
   return child.locator('.stake-frame').evaluateAll(nodes=>nodes.map(el=>{
    const r=el.getBoundingClientRect();return {w:r.width,h:r.height};
   }));
  };
  await preview('create');
  if(size.width>=1100){
   const form=await child.locator('.passage-document').evaluate(el=>el.getBoundingClientRect().width);
   assert(form>260&&form<=470,'desktop admission should be compact '+size.label+' '+form);passed++;
  }
  await preview('connecting');
  assert.equal(await child.locator('[data-action="cancel-connect"]').count(),1);
  const ring=await child.locator('.passage-connection-seal').evaluate(el=>({
   before:getComputedStyle(el,'::before').animationDuration,
   after:getComputedStyle(el,'::after').animationDuration,
   cancel:el.closest('section').querySelector('[data-action="cancel-connect"]').getBoundingClientRect().top,
   portrait:el.getBoundingClientRect().bottom
  }));
  assert.notEqual(ring.before,ring.after,'rings cannot share their spin timing');
  assert(ring.cancel>ring.portrait,'Cancel must sit below animated seal');passed+=2;
  await preview('lobby-host');
  if(size.width>=1100){
   const tops=await child.locator('.exhibition-lobby').evaluate(el=>({
    invite:el.querySelector('.room-ticket')?.getBoundingClientRect().top,
    roster:el.querySelector('.lobby-list-heading')?.getBoundingClientRect().top
   }));
   assert(Math.abs(tops.invite-tops.roster)<35,'participant heading misaligned '+JSON.stringify(tops));passed++;
  }
  await preview('preparing');
  const green=await child.locator('.passage-preparing').evaluate(el=>({
   own:getComputedStyle(el).backgroundColor,parent:getComputedStyle(el.parentElement).backgroundColor,
   furniture:el.querySelectorAll('.set-pilaster').length
  }));
  assert.equal(green.own,green.parent,'preparation green must fill entire background');passed++;
  await preview('voting');
  const baseline=await compareFrame();
  await preview('voting-author');
  const mine=await compareFrame();
  assert.equal(mine.length,5);
  assert.equal(baseline.length,5);
  for(let i=0;i<5;i++){
   assert(mine[i].w>60&&mine[i].h>75,'own inspected work is too small '+JSON.stringify(mine[i]));
   assert(Math.abs(mine[i].h-baseline[i].h)<Math.max(30,baseline[i].h*.23),
    'own inspected paintings should match the voting gallery '+i+' '+JSON.stringify([mine[i],baseline[i]]));
  }
  passed+=5;
  await preview('verdict');
  const heights=await child.locator('.finale-ballot-card').evaluateAll(cards=>cards.map(card=>{
   const rim=card.querySelector('.verdict-image'),image=rim?.querySelector('img');
   const frame=rim?.getBoundingClientRect(),photo=image?.getBoundingClientRect();
   return {frame:frame?.height,photo:photo?.height,stage:card.querySelector('.zam-exhibit-stage')?.getBoundingClientRect().height};
  }));
  assert.equal(heights.length,5);
  for(const h of heights)assert(h.frame>90&&h.photo>70&&h.stage>100,
   'protocol has cropped/zero-height paintings '+JSON.stringify(heights));
  const fitBoxes=await child.locator('.finale-ballot-card').evaluateAll(cards=>cards.map(card=>{
   const outer=card.getBoundingClientRect(),frame=card.querySelector('.verdict-image')?.getBoundingClientRect();
   const art=card.querySelector('.verdict-image img'),img=art?.getBoundingClientRect();
   const votes=card.querySelector('.finale-ballot-votes')?.getBoundingClientRect();
   const natural=art?.naturalWidth&&art?.naturalHeight?art.naturalWidth/art.naturalHeight:null;
   return {cardW:outer.width,cardH:outer.height,frameW:frame?.width,frameH:frame?.height,
    top:frame?.top,cardTop:outer.top,bottom:frame?.bottom,votesTop:votes?.top,
    left:frame?.left,cardLeft:outer.left,right:frame?.right,cardRight:outer.right,
    natural,rendered:img?.width&&img?.height?img.width/img.height:null};
  }));
  await child.locator('.verdict-phase').screenshot({path:join(output,size.label+'-verdict.png')});
  assert.equal(fitBoxes.length,5);
  for(const f of fitBoxes){
   assert(f.frameW>45&&f.frameH>90,'ballot picture too small '+size.label+' '+JSON.stringify(f));
   assert(f.left>=f.cardLeft-3&&f.right<=f.cardRight+3,'wood rim spills sideways '+size.label+' '+JSON.stringify(f));
   assert(f.top>=f.cardTop-3&&f.bottom<=f.votesTop+3,'wood rim overlaps coin shelf '+size.label+' '+JSON.stringify(f));
   if(f.natural)assert(Math.abs(f.rendered-f.natural)/f.natural<.04,'picture aspect distorted '+size.label+' '+JSON.stringify(f));
  }
  passed+=fitBoxes.length*3;
  await preview('round-review');
  const exhibition=await child.locator('.round-review-grid').evaluate(el=>({
   display:getComputedStyle(el).display,overflowX:getComputedStyle(el).overflowX,
   scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,cards:el.querySelectorAll('.round-art-card').length
  }));
  assert.equal(exhibition.display,'grid');
  assert.equal(exhibition.cards,5);
  assert(exhibition.scrollWidth<=exhibition.clientWidth+3,
   'restoration exhibition must not scroll sideways '+JSON.stringify(exhibition));
  // Detect the previous collapsed exhibition with tiny artwork and an empty wall.
  const exhibitFrames=await child.locator('.round-art-card').evaluateAll(cards=>cards.map(card=>{
   const stage=card.querySelector('.zam-exhibit-stage')?.getBoundingClientRect();
   const rim=card.querySelector('.round-art-image')?.getBoundingClientRect();
   return {cardHeight:card.getBoundingClientRect().height,stageHeight:stage?.height,
    frameWidth:rim?.width,frameHeight:rim?.height};
  }));
  for(const frame of exhibitFrames){
   assert(frame.cardHeight>=260&&frame.stageHeight>=245,
    'restoration gallery collapsed into a top thumbnail '+size.label+' '+JSON.stringify(frame));
   assert(frame.frameWidth>45&&frame.frameHeight>90,
    'restoration painting is too small '+size.label+' '+JSON.stringify(frame));
  }
  passed+=3+exhibitFrames.length;
  await preview('results');
  assert.equal(await child.locator('.finale-time-scoring').count(),1);
  const winner=await child.locator('#winnerRestoration').evaluate(el=>({
   w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height
  }));
  assert(winner.w>=35&&winner.h>=30,'missing winner painting '+JSON.stringify(winner));passed+=2;
  const rootSize=await metrics();
  assert(rootSize.scroll<=rootSize.width+4,
   'phase horizontal overflow '+size.label+' '+JSON.stringify(rootSize));passed++;
  if(size.label!=='compact')await page.screenshot({path:join(output,size.label+'-results.png')});
  assert.deepEqual(errors,[],'unhandled browser errors '+size.label);
  await context.close();
 }
 console.log('ZAMAZKA visual 147: '+passed+' real-browser geometry assertions, desktop/compact/mobile; no clipped ballots or sideways review');
}finally{await browser.close();await new Promise(ok=>web.close(ok))}
