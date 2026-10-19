import {test,expect} from '@playwright/test';

test('art pass: stage geometry, animated sprites, effects and mobile bounds',async({page},info)=>{
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#menu')).toBeVisible();
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 const snapshot=await page.evaluate(()=>{
  const canvas=document.getElementById('world'),ctx=canvas.getContext('2d');
  const sample=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data).join(',');
  const colors=new Set();
  for(let y=26;y<585;y+=13)for(let x=27;x<372;x+=13)colors.add(sample(x,y));
  return {size:[canvas.width,canvas.height],distinct:colors.size,edge:sample(4,305),court:sample(193,304)};
 });
 expect(snapshot.size).toEqual([400,620]);
 expect(snapshot.distinct).toBeGreaterThan(35);
 expect(snapshot.edge).not.toEqual(snapshot.court);
 await info.attach('sunken-stone-menu',{body:await page.screenshot(),contentType:'image/png'});
 await page.locator('#primary-action').click();
 await expect(page.locator('#controls')).toBeVisible();
 const direction=await page.evaluate(async()=>{
  const mod=await import('/apps/perekos/mage-art.mjs');
  const c=document.createElement('canvas');c.width=100;c.height=110;const ctx=c.getContext('2d');
  const shape=face=>{ctx.clearRect(0,0,100,110);mod.drawMage(ctx,undefined,{x:50,y:68,scale:1.6,face,casting:.42,moving:.9,mageId:'coil'});
   return Array.from(ctx.getImageData(0,0,100,110).data).join(',')};
  return [shape(0),shape(Math.PI)].map(s=>s.length?s:'' );
 });
 expect(direction[0]).not.toEqual(direction[1]);
 const real=await page.evaluate(async()=>{
  const {tick,STEP}=await import('/apps/perekos/core.mjs');
  const s=window.__perekosTest.state;
  s.actors[0].runes=['on_cast','ball','as_storm'];
  s.actors[0].x=165;s.actors[0].y=320;s.actors[1].x=230;s.actors[1].y=320;
  for(let i=0;i<19&&s.phase==='fight';i++)tick(s,{x:0,y:0,attack:true,aim:{x:230,y:320}},STEP,{x:0,y:0,attack:false,aim:{x:165,y:320}});
  return {combos:s.elementCombos[0],reaction:s.fx.some(e=>e.k==='react_steam'),phase:s.phase};
 });
 expect(real.phase).toBe('fight');
 expect(real.combos).toBeGreaterThan(0);
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 await info.attach('authoritative-magic-burst',{body:await page.screenshot(),contentType:'image/png'});
 const layout=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,canvas:document.getElementById('world').getBoundingClientRect().width}));
 expect(layout.document).toBeLessThanOrEqual(layout.width+1);
 expect(layout.canvas).toBeLessThanOrEqual(layout.width+1);
 expect(errors).toEqual([]);
});

test('art pass: six unique costumes and weapon stance on mobile and desktop',async({page},info)=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#choose-mage').click();
 await expect(page.locator('#mage-options .mage-option')).toHaveCount(6);
 const shapes=await page.evaluate(async()=>{
  const {MAGES}=await import('/apps/perekos/mages.mjs'),{drawMage}=await import('/apps/perekos/mage-art.mjs');
  const c=document.createElement('canvas');c.width=100;c.height=110;const ctx=c.getContext('2d');
  return MAGES.map(m=>{ctx.clearRect(0,0,100,110);drawMage(ctx,undefined,{x:50,y:68,mageId:m.id,scale:1.35,casting:.41});
   return ctx.getImageData(0,0,100,110).data.reduce((a,v,i)=>a+((v*i)%251),0)});
 });
 expect(new Set(shapes).size).toBe(6);
 await info.attach('six-fighter-materials',{body:await page.screenshot(),contentType:'image/png'});
});

test('v0.8 danger guides are visible and align with existing projectile hitboxes',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const data=await page.evaluate(async()=>{
  const {combatCues,drawGroundCues}=await import('/apps/perekos/combat-readability.mjs');
  const s={phase:'fight',actors:[{x:180,y:310},{x:335,y:310}],barriers:[],
   shots:[{owner:1,x:95,y:310,vx:300,vy:0,r:5,life:1,element:'fire'}],mines:[]};
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=620;
  const c=canvas.getContext('2d');drawGroundCues(c,s,0,2);
  const pixels=c.getImageData(90,298,120,25).data;
  return {isDanger:combatCues(s).shots[0].imminent,
   painted:pixels.some((channel,index)=>index%4===3&&channel>10)};
 });
 expect(data.isDanger).toBe(true);expect(data.painted).toBe(true);
});
