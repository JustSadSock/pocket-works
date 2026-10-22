import {test,expect} from '@playwright/test';

test('six-class aiming: touch-style drag preserves the ray near the arena corner',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#primary-action').click();
 await expect(page.locator('#hud')).toBeVisible();
 await page.evaluate(()=>{
  const a=window.__perekosTest.state.actors[0];
  a.x=365;a.y=550;a.cast=0;
 });
 const button=await page.locator('#attack-btn').boundingBox();
 expect(button).toBeTruthy();
 const x=button.x+button.width/2,y=button.y+button.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+42,y-54,{steps:6});
 const value=await page.evaluate(()=>{
  const a=window.__perekosTest.state.actors[0],aim=window.__perekosTest.aim;
  return {a:{x:a.x,y:a.y},aim};
 });
 expect(value.aim).toBeTruthy();
 expect(Math.atan2(value.aim.y-value.a.y,value.aim.x-value.a.x)).toBeCloseTo(Math.atan2(-54,42),5);
 expect(value.aim.x).toBeGreaterThan(360);
 expect(value.aim.x).toBeLessThanOrEqual(400); // PocketNet accepts the court intersection
 await page.mouse.up();
 expect(errors).toEqual([]);
});

test('impact residue and class cast accents render without changing the combat snapshot',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const seen=await page.evaluate(async()=>{
  const {DuelFeedback}=await import('/apps/perekos/duel-feedback.mjs');
  const f=new DuelFeedback(),s={phase:'fight',round:1,serial:4,
   actors:[{id:0,x:180,y:300,mageId:'wire',cast:.43},{id:1,x:230,y:310,mageId:'slate',cast:.49}],
   fx:[{id:1,k:'shoot',x:180,y:300},{id:2,k:'hit',x:230,y:310},
    {id:3,k:'impact_rock',x:232,y:312},{id:4,k:'react_crack',x:228,y:315}]};
  const before=JSON.stringify(s);
  f.ingest(s);f.advance(1/60);
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=620;
  const ctx=canvas.getContext('2d');f.ground(ctx);f.actors(ctx,s,.22);f.air(ctx);
  const alpha=ctx.getImageData(0,0,400,620).data.filter((_,i)=>i%4===3&&ctx.getImageData!==undefined);
  return {unchanged:before===JSON.stringify(s),count:f.particles.length,scars:f.scars.length,
   opaque:alpha.some(n=>n>0)};
 });
 expect(seen.unchanged).toBe(true);
 expect(seen.count).toBeGreaterThan(0);
 expect(seen.scars).toBe(3);
 expect(seen.opaque).toBe(true);
});
