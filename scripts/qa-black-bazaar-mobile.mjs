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
page.on('dialog',dialog=>dialog.accept());
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
   if(width<=350&&document.documentElement.clientHeight<=600&&expected?.play){
    const actionPage=document.querySelector('[data-sheet-page="actions"]');
    const workButton=actionPage?.querySelector('form[data-form="work"] button[type="submit"]');
    const scrollPanel=document.querySelector('.sheet-content');
    if(workButton&&!actionPage.hidden&&scrollPanel&&
       workButton.getBoundingClientRect().bottom>scrollPanel.getBoundingClientRect().bottom+3)
      issues.push('primary work button clipped below first screen');
   }
   if(overflow>2)issues.push('horizontal overflow '+overflow);
   if(collide(field,tabs))issues.push('table overlaps tabs');
   if(collide(ticket,wallet))issues.push('urgent ticket overlaps wallet');
   for(const icon of document.querySelectorAll('.lot-market-strip svg')){
    const bounds=icon.getBoundingClientRect();
    if(bounds.width>24||bounds.height>24)
     issues.push('auction price/bid icon enlarged beyond 24px');
   }
   // Previous visual audits missed auction art extending beyond a clipped table
   // even though the play-field itself fitted the viewport.
   const auction=rect('.table-stage .artifact'),ribbon=rect('.bottom-ribbon');
   if(auction&&field&&width<=680&&document.documentElement.clientHeight<=670){
    if(auction.top<field.top-3)issues.push('auction art clipped above play field');
    if(ribbon&&auction.bottom>ribbon.top+3)issues.push('auction art overlaps end-turn ribbon');
   }
   for(const sel of ['.play-head','.currency-strip','.urgent-ticket','.play-field','.workspace-tabs']){
    const b=rect(sel);if(!b||!b.width)continue;
    if(b.left< -2||b.right>width+2)issues.push(sel+' exceeds viewport width');
    if(play&&(b.top<play.top-2||b.bottom>play.bottom+2))issues.push(sel+' exceeds play screen');
   }
   const panel=document.querySelector('.sheet-content');
   if(panel&&panel.scrollHeight>panel.clientHeight+5&&!['auto','scroll'].includes(getComputedStyle(panel).overflowY))issues.push('panel clipped without scroll');
   return {issues,overflow,width,height:document.documentElement.clientHeight,phase};
  });
  // Baseline capture before test actions, so reviewed images represent the real
  // starting layout rather than a mutated post-trade or open-tabs state.
  if(['small','phone','desktop'].includes(id))
   await frame.locator('body').screenshot({path:out+'/'+scene+'-'+id+'-baseline.png'});
  // Exercise the real tab delegation, not only static scene geometry.
  if(!['home','lobby','done'].includes(scene)){
   const tabs=await frame.evaluate(()=>{
    const issues=[];
    for(const name of ['actions','market','inventory','secret','deals','players']){
     const button=document.querySelector('[data-action="open-sheet"][data-sheet="'+name+'"]');
     const page=document.querySelector('[data-sheet-page="'+name+'"]');
     if(!button||!page){issues.push('missing tab '+name);continue;}
     button.click();
     if(page.hidden||button.getAttribute('aria-selected')!=='true')issues.push('tab did not open '+name);
     const content=document.querySelector('.sheet-content');
     if(content&&content.scrollHeight>content.clientHeight+5&&!['auto','scroll'].includes(getComputedStyle(content).overflowY))
      issues.push('tab content clipped '+name);
    }
    return issues;
   });
   report.issues.push(...tabs);
  }
  const actionSizes=['small','short','phone','landscape','tablet','desktop'];
  const exercise=async command=>page.evaluate(command=>new Promise((resolve,reject)=>{
   const iframe=document.querySelector('iframe.dev-frame');
   const token=Math.floor(Math.random()*1e9);
   const timer=setTimeout(()=>{removeEventListener('message',onMessage);reject(new Error('QA action timed out: '+command.type));},5000);
   function onMessage(event){
    if(event.source!==iframe.contentWindow||event.data?.source!=='bazaar-debug-preview'||
       event.data.type!=='qa-action-result'||event.data.step!==token)return;
    clearTimeout(timer);removeEventListener('message',onMessage);resolve(event.data);
   }
   addEventListener('message',onMessage);
   iframe.contentWindow.postMessage({source:'bazaar-debug-console',type:'qa-action',run:1,step:token,command},location.origin);
  }),command);
  if(scene==='four'&&actionSizes.includes(id)){
   const work=await exercise({type:'work',resource:'gold'});
   if(work.error||work.after.resources.gold!==work.before.resources.gold+35)report.issues.push('work action did not credit 35 gold');
   const buy=await exercise({type:'broker_buy'});
   if(buy.error||buy.after.resources.gold!==buy.before.resources.gold-75||buy.after.items.length!==buy.before.items.length+1)
    report.issues.push('broker purchase did not transfer item and charge 75 gold');
   if(await frame.locator('.play-screen').count()!==1)report.issues.push('game UI missing after actions');
  }
  if(scene==='buyer'&&actionSizes.includes(id)){
   const before=await exercise({type:'tick'});
   const offerButton=frame.locator('.table-stage .artifact[data-kind="listing"]');
   if(await offerButton.count()!==1)report.issues.push('buyer cannot see active auction lot');
   else{
    const bidButton=frame.locator('.table-trade-actions button[data-action="bid-asking"]');
    if(await bidButton.count()!==1||await bidButton.isDisabled())
     report.issues.push('buyer cannot offer asking price directly on the table');
    else await bidButton.click();
    const awaiting=frame.locator('.table-trade-actions.is-buyer .table-awaiting');
    if(await awaiting.count()!==1||!(await awaiting.innerText()).includes('Твоя ставка'))
     report.issues.push('buyer did not see pending offer on tabletop');
   }
   const offered=await exercise({type:'tick'});
   if(offered.error||offered.after.bids.length!==1||
     offered.after.bids[0].buyer!=='debug-0'||
     offered.after.bids[0].offer.gold!==110||
     offered.after.bids[0].offer.crystals!==1)
     report.issues.push('asking-price bid not submitted correctly');
   if(JSON.stringify(offered.after.resources)!==JSON.stringify(before.after.resources)||
      JSON.stringify(offered.after.items)!==JSON.stringify(before.after.items)||
      offered.after.listing?.id!==before.after.listing?.id)
     report.issues.push('unaccepted bid charged buyer or transferred item');
  }
  if(scene==='seller'&&actionSizes.includes(id)){
   const ask={gold:70,crystals:2,parts:0};
   const cleared=await exercise({type:'cancel'});
   const before=cleared.after;
   const itemId=before.items[0];
   if(cleared.error||cleared.after.listing)report.issues.push('seller failed to clear fixture lot');
   const posted=await exercise({type:'post',itemId,ask});
   if(posted.error||posted.after.listing?.id!==itemId)report.issues.push('seller failed to post item');
   const offered=await exercise({type:'bid',buyer:'debug-1',offer:ask});
   if(offered.error||offered.after.bids.length!==1||offered.after.bids[0].buyer!=='debug-1')
    report.issues.push('buyer bid not visible to seller');
   // Accept through the same visible button and confirmation dialog used by players.
   const itemButton=frame.locator('.table-stage .artifact[data-kind="listing"]');
   if(await itemButton.count()!==1)report.issues.push('auction tabletop listing not clickable');
   else{
    const acceptButton=frame.locator('.table-trade-actions.is-seller button[data-action="accept"][data-player="debug-1"]');
    if(await acceptButton.count()!==1||!await acceptButton.getAttribute('data-bid'))
     report.issues.push('seller cannot accept exact bid from the tabletop');
    else await acceptButton.click();
   }
   const accepted=await exercise({type:'tick'});
   const buyerBefore=before.players.find(p=>p.id==='debug-1');
   const buyerAfter=accepted.after.players.find(p=>p.id==='debug-1');
   if(accepted.error||accepted.after.listing||accepted.after.bids.length)
    report.issues.push('accepted listing or bids not cleared');
   if(accepted.after.items.includes(itemId)||!buyerAfter.inventory.includes(itemId)||
      buyerAfter.items!==buyerBefore.items+1)
    report.issues.push('auction item not delivered to buyer');
   if(accepted.after.resources.gold!==before.resources.gold+ask.gold||
      accepted.after.resources.crystals!==before.resources.crystals+ask.crystals||
      accepted.after.resources.parts!==before.resources.parts+1||
      buyerAfter.resources.gold!==buyerBefore.resources.gold-ask.gold||
      buyerAfter.resources.crystals!==buyerBefore.resources.crystals-ask.crystals)
    report.issues.push('auction payment or first-sale bonus incorrect');
   if(accepted.after.marketDeals!==1)report.issues.push('public sale counter not incremented');
   if(await frame.locator('.table-stage .artifact-note').count()===0)
    report.issues.push('sold item still displayed as active auction lot');
  }
  if(scene==='lobby'&&['small','phone','desktop'].includes(id)){
   const before=await frame.locator('.lobby-player').count();
   const kick=frame.locator('button.lobby-kick').first();
   if(before<2||await kick.count()!==1)report.issues.push('host moderation missing in lobby');
   else{
    await kick.click();
    if(await frame.locator('.lobby-player').count()!==before-1)
     report.issues.push('host kick did not remove lobby participant');
   }
  }
  if(scene==='four'&&['small','phone','desktop'].includes(id)){
   const seat=frame.locator('button.seat[data-action="player-actions"]:not([disabled])').first();
   if(await seat.count()!==1)report.issues.push('host cannot select a participant');
   else{
    const target=await seat.getAttribute('data-player');
    await seat.click();
    const kick=frame.locator('.player-popover button[data-action="kick-player"]');
    if(await kick.count()!==1)report.issues.push('host moderation missing in participant menu');
    else{
     await kick.click();
     const removed=frame.locator('button.seat[data-player="'+target+'"]');
     if(await removed.count()!==1||!await removed.isDisabled())
      report.issues.push('kicked player remains an active trading seat');
    }
   }
  }
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
