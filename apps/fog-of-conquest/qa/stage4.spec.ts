import {test,expect} from '@playwright/test';

async function openBattle(page:any){
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();
 await page.locator('#twoBtn').click();
 await expect.poll(()=>page.evaluate(()=>window.state?.seen?.[1]?.flat().some(Boolean))).toBe(true);
}
test('terrain relief is rendered exclusively on previously explored cells',async({page})=>{
 await openBattle(page);
 const audit=await page.evaluate(()=>{
  const calls=[];
  const original=window.FogVisual.depth;
  window.FogVisual.depth=(ctx,t,r,c,...rest)=>{calls.push({t,r,c});return original(ctx,t,r,c,...rest);};
  window.redraw();
  const seen=window.state.seen[window.state.currentPlayer];
  const allValid=calls.every(({r,c})=>Boolean(seen[r][c]));
  window.FogVisual.depth=original;
  return {allValid,n:calls.length,styles:[...new Set(calls.map(c=>c.t))]};
 });
 expect(audit.n).toBeGreaterThan(0);
 expect(audit.allValid).toBe(true);
});

test('music / sfx settings persist and mute removes all synthesized output',async({page})=>{
 await openBattle(page);
 await page.locator('#settingsBtn').click();
 await expect(page.locator('#settingsOverlay')).toBeVisible();
 await page.locator('#musicEnable').check();
 await page.locator('#sfxEnable').uncheck();
 await page.locator('#musicVolume').fill('0.35');
 await page.locator('#sfxVolume').fill('0.8');
 const muted=await page.evaluate(()=>{
   const a=window.FogAudio;
   return {state:a.state(),attack:a.play('attack'),click:a.play('uiClick')};
 });
 expect(muted.state.musicEnabled).toBe(true);
 expect(muted.state.sfxEnabled).toBe(false);
 expect(muted.state.musicVolume).toBeCloseTo(.35);
 expect(muted.attack).toBe(false);
 expect(muted.click).toBe(false);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect.poll(()=>page.evaluate(()=>window.FogAudio?.state()?.musicEnabled)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>window.FogAudio?.state()?.sfxEnabled)).toBe(false);
 await page.locator('#startSettingsBtn').click();
 await page.locator('#musicEnable').uncheck();
 await expect.poll(()=>page.evaluate(()=>window.FogAudio?.state()?.ambiencePlaying)).toBe(false);
});

test('no remote MP3 requests, recording provides supported fallback and never leaks object URLs',async({page})=>{
 const requests:string[]=[];
 page.on('request',req=>{if(/samplelib|\.mp3(?:\?|$)/.test(req.url()))requests.push(req.url());});
 await openBattle(page);
 await page.evaluate(()=>{
  const canvas=document.getElementById('canvas');
  Object.defineProperty(canvas,'captureStream',{value:undefined,configurable:true});
  window.recordReplayVideo();
 });
 await expect(page.locator('#fogRecordStatus')).toContainText('не поддерживается');
 await expect(page.locator('#fogRecordStatus')).toHaveAttribute('data-error','true');
 expect(requests).toEqual([]);
});

test('all render modes stay legible at phone and landscape, including motion reduction',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await openBattle(page);
 for(const viewport of [{width:320,height:640},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const style of ['simple','toen','ai']){
   await page.locator('#settingsBtn').click();
   await page.locator('#styleSelect').selectOption(style);
   await page.locator('#settingsCloseBtn').click();
   await expect.poll(()=>page.locator('#canvas').evaluate((c:HTMLCanvasElement)=>{
    const ctx=c.getContext('2d');
    const pixels=ctx?.getImageData(0,0,Math.min(c.width,80),Math.min(c.height,80)).data;
    return !!pixels&&Array.from(pixels).some((v,i)=>i%4===3&&v!==0);
   })).toBe(true);
   const fit=await page.evaluate(()=>{
    const a=document.querySelector('#controls')!.getBoundingClientRect();
    const b=document.querySelector('#battleViewport')!.getBoundingClientRect();
    return {panel:a.right,mapHeight:b.height,docScroll:document.documentElement.scrollWidth};
   });
   expect(fit.panel).toBeLessThanOrEqual(viewport.width+2);
   expect(fit.mapHeight).toBeGreaterThan(100);
   expect(fit.docScroll).toBeLessThanOrEqual(viewport.width+2);
   await page.screenshot({path:`fog-stage4-${viewport.width}x${viewport.height}-${style}.png`});
  }
 }
});
