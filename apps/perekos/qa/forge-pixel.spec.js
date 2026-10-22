import {test,expect} from '@playwright/test';

test('six Forge pixel fighters load offline-ready exports and retain 48 directional identities',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const checks=await page.evaluate(async()=>{
  const {MAGE_PIXEL_CLASSES,forgeMageReady,forgeMageStatus,renderForgeMage}=
   await import('/apps/perekos/mage-pixel.mjs');
  const ready=await forgeMageReady();
  const canvas=document.createElement('canvas');canvas.width=108;canvas.height=128;
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  const hashes=[];
  for(const cls of MAGE_PIXEL_CLASSES)for(let d=0;d<8;d++){
   c.clearRect(0,0,108,128);
   renderForgeMage(c,undefined,{x:54,y:70,mageId:cls,face:d*Math.PI/4,
    time:0,scale:2,pose:{still:true,look:d*Math.PI/4}});
   const bytes=c.getImageData(0,0,108,128).data;
   let hash=2166136261,opaque=0;
   for(let p=0;p<bytes.length;p+=4){
    if(bytes[p+3])opaque++;
    hash=Math.imul(hash^(bytes[p])^(bytes[p+1]<<8)^(bytes[p+2]<<16)^bytes[p+3],16777619)>>>0;
   }
   hashes.push({cls,d,hash,opaque});
  }
  return {ready,status:forgeMageStatus(),hashes,viewport:innerWidth,
   document:document.documentElement.scrollWidth};
 });
 expect(checks.ready).toBe(true);
 expect(checks.status).toBe('ready');
 expect(checks.hashes).toHaveLength(48);
 expect(new Set(checks.hashes.map(v=>v.hash)).size).toBeGreaterThanOrEqual(42);
 expect(checks.hashes.every(v=>v.opaque>600&&v.opaque<2200)).toBe(true);
 expect(checks.document).toBeLessThanOrEqual(checks.viewport+1);
 await page.locator('#choose-mage').click();
 await info.attach('true-pixel-character-selection',{body:await page.screenshot(),contentType:'image/png'});
 await page.locator('#mage-cancel').click();
 await page.locator('#primary-action').click();
 await expect(page.locator('#hud')).toBeVisible();
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('true-pixel-live-duel',{body:await page.screenshot(),contentType:'image/png'});
 expect(errors).toEqual([]);
});

test('native pixel blocks are exact 3x3 squares without smoothing in real browser Canvas',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const {forgeMageReady,renderForgeMage}=await import('/apps/perekos/mage-pixel.mjs');
  if(!(await forgeMageReady()))return {available:false};
  const canvas=document.createElement('canvas');canvas.width=120;canvas.height=150;
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  renderForgeMage(ctx,undefined,{x:60,y:90,mageId:'kindle',face:0,scale:3,time:0,
   pose:{still:true,look:0}});
  const data=ctx.getImageData(0,0,120,150).data;
  let blocks=0,errors=0;
  const originX=24,originY=21;
  // Art drawing origin = (60-12*3, 90-23*3). Every 3x3 group
  // must have identical unfiltered rgba, including transparent pixels.
  for(let y=0;y<32;y++)for(let x=0;x<24;x++){
   const start=((originY+y*3)*120+originX+x*3)*4;
   const expected=Array.from(data.slice(start,start+4));
   for(let by=0;by<3;by++)for(let bx=0;bx<3;bx++){
    const p=((originY+y*3+by)*120+originX+x*3+bx)*4;
    if(data[p]!==expected[0]||data[p+1]!==expected[1]||data[p+2]!==expected[2]||data[p+3]!==expected[3])errors++;
   }
   blocks++;
  }
  return {available:true,blocks,errors};
 });
 expect(result.available).toBe(true);
 expect(result.blocks).toBe(24*32);
 expect(result.errors).toBe(0);
});
