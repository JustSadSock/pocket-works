import {test,expect} from '@playwright/test';

test('v0.9 visual pass: six equipped mage costumes, expressive casts, actual spell choreography',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#choose-mage').click();
 await expect(page.locator('#mage-options .mage-option')).toHaveCount(6);
 const sprites=await page.evaluate(async()=>{
  const {MAGES}=await import('/apps/perekos/mages.mjs');
  const {drawMage}=await import('/apps/perekos/mage-art.mjs');
  const c=document.createElement('canvas');c.width=130;c.height=145;const ctx=c.getContext('2d');
  const paint=(id,casting)=>{
   ctx.clearRect(0,0,130,145);
   drawMage(ctx,undefined,{x:65,y:90,mageId:id,scale:1.55,face:0,casting,time:.18});
   const data=ctx.getImageData(0,0,130,145).data;
   let hash=2166136261;
   for(let i=0;i<data.length;i+=4)hash=Math.imul(hash^data[i]^data[i+1]^(data[i+3]<<1),16777619)>>>0;
   return hash;
  };
  return MAGES.map(m=>({id:m.id,ready:paint(m.id,0),casting:paint(m.id,.4)}));
 });
 expect(sprites).toHaveLength(6);
 expect(new Set(sprites.map(x=>x.casting)).size).toBe(6);
 for(const s of sprites)expect(s.ready).not.toEqual(s.casting);
 await info.attach('v09-distinct-classes',{body:await page.screenshot(),contentType:'image/png'});
 await page.locator('#mage-cancel').click();
 await page.locator('#primary-action').click();
 await expect(page.locator('#hud')).toBeVisible();
 const confirmed=await page.evaluate(async()=>{
  const {tick,STEP}=await import('/apps/perekos/core.mjs');
  const {SpellChoreography}=await import('/apps/perekos/spell-choreography.mjs');
  const s=window.__perekosTest.state;
  s.actors[0].x=165;s.actors[0].y=320;
  s.actors[1].x=225;s.actors[1].y=320;
  for(let i=0;i<18&&s.phase==='fight';i++)tick(s,{x:0,y:0,attack:true,aim:{x:225,y:320}},STEP,
   {x:0,y:0,attack:false,aim:{x:165,y:320}});
  const before=JSON.stringify(s);
  const theater=new SpellChoreography();theater.ingest(s);
  return {same:before===JSON.stringify(s),real:s.fx.some(f=>f.k==='shoot'||f.k.startsWith('impact_')),
   motifs:theater.motifs.length,types:theater.motifs.map(m=>m.kind)};
 });
 expect(confirmed.same).toBe(true);
 expect(confirmed.real).toBe(true);
 expect(confirmed.motifs).toBeGreaterThan(0);
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('v09-in-battle',{body:await page.screenshot(),contentType:'image/png'});
 const bounds=await page.evaluate(()=>({screen:innerWidth,doc:document.documentElement.scrollWidth,
  world:document.querySelector('#world').getBoundingClientRect().width}));
 expect(bounds.doc).toBeLessThanOrEqual(bounds.screen+1);
 expect(bounds.world).toBeLessThanOrEqual(bounds.screen+1);
 expect(errors).toEqual([]);
});

test('v0.9 accessibility: reduced motion causes no time-dependent flicker in stage effects',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const state=await page.evaluate(async()=>{
  const {SpellChoreography,drawSpellProjectiles,drawSpellActors,drawSpellGround,drawSpellForeground}=
   await import('/apps/perekos/spell-choreography.mjs');
  const s={phase:'fight',round:1,serial:3,ticks:5,actors:[
   {id:0,x:100,y:240,mageId:'wire',cast:.4},{id:1,x:230,y:300,mageId:'slate',cast:.2}],
   shots:[{owner:0,x:160,y:280,vx:245,vy:25,element:'storm',style:'bolt',life:1}],
   fx:[{id:1,k:'shoot',x:100,y:240},{id:2,k:'react_crack',x:180,y:310},{id:3,k:'impact_rock',x:210,y:315}]};
  const theater=new SpellChoreography();theater.ingest(s,true);
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=620;const ctx=canvas.getContext('2d');
  const draw=(t)=>{
   ctx.clearRect(0,0,400,620);drawSpellGround(ctx,theater,true);drawSpellActors(ctx,s,t,true);
   drawSpellProjectiles(ctx,s,t,true);drawSpellForeground(ctx,theater,true);
   return canvas.toDataURL();
  };
  return {same:draw(0)===draw(22),count:theater.motifs.length};
 });
 expect(state.same).toBe(true);
 expect(state.count).toBe(3);
});
