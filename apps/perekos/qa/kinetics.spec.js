import {test,expect} from '@playwright/test';

test('v0.12: seven directional projectile silhouettes and seven distinct real impacts',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const output=await page.evaluate(async()=>{
  const {drawKineticProjectiles,ContactTheater,MAX_KINETIC_SHOTS}=
   await import('/apps/perekos/spell-kinetics.mjs');
  const styles=['orb','flame','bolt','arc','rock','wave','echo'];
  const sheet=document.createElement('canvas');
  sheet.id='spell-kinetics-audit';sheet.width=640;sheet.height=490;
  sheet.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(96vw,640px);height:auto;background:#24382f;z-index:9999;image-rendering:pixelated;border:2px solid #c7a377;';
  const c=sheet.getContext('2d');c.imageSmoothingEnabled=false;
  c.fillStyle='#24382f';c.fillRect(0,0,sheet.width,sheet.height);
  const hashes=[];
  for(let i=0;i<styles.length;i++){
   const style=styles[i],school=i<2?'fire':i<4?'storm':i<6?'stone':'fire';
   const individual=document.createElement('canvas');individual.width=92;individual.height=92;
   const paint=individual.getContext('2d');paint.imageSmoothingEnabled=false;
   const shots=[{x:47,y:45,vx:i%2?200:300,vy:i%2?130:-80,owner:0,
    style,element:school,r:style==='wave'?12:style==='rock'?8:5,life:1}];
   const s={phase:'fight',shots};drawKineticProjectiles(paint,s,.21);
   const fx=new ContactTheater();fx.ingest({phase:'fight',round:1,serial:1,ticks:1,
     fx:[{id:1,k:'impact_'+style,x:45,y:48}]});
   fx.draw(paint);
   const pixels=paint.getImageData(0,0,92,92).data;
   let hash=2166136261;
   for(let j=0;j<pixels.length;j+=4)hash=Math.imul(hash^pixels[j]^pixels[j+1]^(pixels[j+3]<<1),16777619)>>>0;
   hashes.push(hash);
   c.drawImage(individual,i*92+1,130);
   c.fillStyle='#f2d8a9';c.font='bold 13px monospace';c.fillText(style,i*92+8,119);
  }
  // Full scene contains only state-authoritative objects.
  const arena={phase:'fight',shots:styles.map((style,i)=>({
   x:50+i*82,y:328,vx:200,vy:i%2?26:-22,owner:0,
   style,element:i<2?'fire':i<4?'storm':'stone',r:style==='rock'?8:style==='wave'?12:5,
   life:.7
  }))};
  drawKineticProjectiles(c,arena,.35);
  document.body.append(sheet);
  return {hashes,cap:MAX_KINETIC_SHOTS};
 });
 expect(new Set(output.hashes).size).toBe(7);
 expect(output.cap).toBeLessThanOrEqual(24);
 await info.attach('v012-materials-contact-sheet',{body:await page.screenshot(),contentType:'image/png'});
 await page.locator('#spell-kinetics-audit').evaluate(el=>el.remove());
 await page.locator('#primary-action').click();
 await expect(page.locator('#hud')).toBeVisible();
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('v012-combat-mobile',{body:await page.screenshot(),contentType:'image/png'});
 const bound=await page.evaluate(()=>({screen:innerWidth,page:document.documentElement.scrollWidth}));
 expect(bound.page).toBeLessThanOrEqual(bound.screen+1);
 expect(errors).toEqual([]);
});
test('v0.12: no duplicated renderer and proper reduced-motion result at desktop scale',async({page},info)=>{
 await page.setViewportSize({width:1440,height:900});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const audit=await page.evaluate(async()=>{
  const source=await (await fetch('/apps/perekos/app.js')).text();
  const {drawKineticProjectiles,ContactTheater}=await import('/apps/perekos/spell-kinetics.mjs');
  const state={phase:'fight',shots:[{owner:0,x:180,y:270,vx:300,vy:40,style:'arc',element:'storm',r:5,life:1}]};
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=620;
  const context=canvas.getContext('2d');
  const render=time=>{context.clearRect(0,0,400,620);drawKineticProjectiles(context,state,time,{reduced:true});return canvas.toDataURL()};
  const before=JSON.stringify(state);
  const first=render(0),second=render(60);
  const theater=new ContactTheater();
  theater.ingest({round:1,serial:1,ticks:1,fx:[{id:1,k:'impact_rock',x:210,y:310}]},true);
  theater.draw(context,true);
  return {oneRenderer:source.includes('drawKineticProjectiles(ctx,active')&&!source.includes('drawShots(active)')&&!source.includes('drawSpellProjectiles(ctx,active'),
   reducedStable:first===second,untouched:before===JSON.stringify(state),
   contacts:theater.contacts.length};
 });
 expect(audit.oneRenderer).toBe(true);
 expect(audit.reducedStable).toBe(true);
 expect(audit.untouched).toBe(true);
 expect(audit.contacts).toBe(1);
 await info.attach('v012-desktop-arena',{body:await page.screenshot(),contentType:'image/png'});
});
