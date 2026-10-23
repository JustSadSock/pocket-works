const {chromium}=await import(process.env.BAZAAR_PLAYWRIGHT_MODULE||'playwright');
import {mkdir,writeFile} from 'node:fs/promises';

const devices=[['small',320,568],['short',375,667],['phone',390,844],['landscape',844,390],['tablet',820,1024],['tablet-landscape',1024,768],['desktop',1440,900]];
const scenes=['home','lobby','two','four','six','buyer','seller','bids','black','deals','urgent','event','bankrupt','done'];
const base=process.env.BAZAAR_QA_ORIGIN||'http://127.0.0.1:8765';
const out='qa-artifacts/black-bazaar-mobile';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1800,height:1250},deviceScaleFactor:1});
const rows=[];
try{
 await page.goto(base+'/apps/black-bazaar/?debug=1',{waitUntil:'domcontentloaded'});
 await page.locator('iframe.dev-frame').waitFor({timeout:20000});
 const frame=page.frame({url:/preview\.html/});
 if(!frame)throw Error('QA preview frame did not load');
 await frame.locator('#app button').first().waitFor({timeout:20000});
 for(const scene of scenes)for(const [id,width,height] of devices){
  await page.locator('iframe.dev-frame').evaluate((el,{width,height})=>{
   el.style.width=width+'px';el.style.height=height+'px';
   el.style.transform='none';
  },{width,height});
  await page.evaluate(id=>new Promise((resolve,reject)=>{
   const token=Math.floor(Math.random()*1e9);
   const iframe=document.querySelector('iframe.dev-frame');
   const timeout=setTimeout(()=>{removeEventListener('message',receive);reject(new Error('Scene did not acknowledge: '+id));},5000);
   function receive(event){
    if(event.source!==iframe.contentWindow||event.data?.source!=='bazaar-debug-preview'||event.data.type!=='scene-ready'||event.data.step!==token)return;
    clearTimeout(timeout);removeEventListener('message',receive);resolve();
   }
   addEventListener('message',receive);
   iframe.contentWindow.postMessage({source:'bazaar-debug-console',type:'scene',id,run:1,step:token},location.origin);
  }),scene);
  await frame.evaluate(({width,height,play})=>{window.__bazaarQaExpected={width,height,play};},{width,height,play:!['home','lobby','done'].includes(scene)});
  const report=await frame.evaluate(()=>{
   const width=document.documentElement.clientWidth;
   const overflow=Math.max(0,document.documentElement.scrollWidth-width);
   const rect=s=>document.querySelector(s)?.getBoundingClientRect();
   const play=rect('.play-screen'),field=rect('.play-field'),tabs=rect('.workspace-tabs'),ticket=rect('.urgent-ticket'),wallet=rect('.currency-strip');
   const collide=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>4&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>4;
   const issues=[];
   const expected=window.__bazaarQaExpected;
   if(expected&& (width!==expected.width||document.documentElement.clientHeight!==expected.height))
     issues.push('wrong frame viewport '+width+'x'+document.documentElement.clientHeight);
   const phase=document.querySelector('.play-screen')?'play':document.querySelector('#app')?.textContent?.trim().slice(0,35);
   if(expected?.play&&(!document.querySelector('.play-field')||!document.querySelector('.workspace-tabs')))
     issues.push('game scene missing');
   if(document.querySelector('#app')?.textContent?.includes('Подключаемся…'))issues.push('loading placeholder');
   if(overflow>2)issues.push('horizontal overflow '+overflow);
   if(collide(field,tabs))issues.push('table overlaps tabs');
   if(collide(ticket,wallet))issues.push('urgent ticket overlaps wallet');
   for(const sel of ['.play-head','.currency-strip','.urgent-ticket','.play-field','.workspace-tabs']){
    const b=rect(sel);if(!b||!b.width)continue;
    if(b.left< -2||b.right>width+2)issues.push(sel+' exceeds viewport width');
    if(play&&(b.top<play.top-2||b.bottom>play.bottom+2))issues.push(sel+' exceeds play screen');
   }
   const panel=document.querySelector('.sheet-content');
   if(panel&&panel.scrollHeight>panel.clientHeight+5&&!['auto','scroll'].includes(getComputedStyle(panel).overflowY))issues.push('panel clipped without scroll');
   return {issues,overflow,width,height:document.documentElement.clientHeight,phase};
  });
  const result={scene,device:id,requested:{width,height},...report};
  if(report.issues.length||scene==='four'&&['small','short','phone','landscape','tablet','desktop'].includes(id)){
   await frame.locator('body').screenshot({path:out+'/'+scene+'-'+id+'.png'});
  }
  rows.push(result);
 }
}finally{await browser.close();}
await writeFile(out+'/report.json',JSON.stringify({total:rows.length,failures:rows.filter(r=>r.issues.length),results:rows},null,2));
const failures=rows.filter(r=>r.issues.length);
console.log('Black Bazaar viewport matrix: '+rows.length+' combinations, '+failures.length+' with reported issues.');
for(const row of failures.slice(0,35))console.log(row.scene+' / '+row.device+': '+row.issues.join('; '));
if(rows.length!==scenes.length*devices.length||failures.length)process.exitCode=1;
