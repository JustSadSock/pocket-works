import {test,expect} from '@playwright/test';

const cases=[
 {name:'compact portrait',width:320,height:568,touch:true},
 {name:'small portrait',width:360,height:640,touch:true},
 {name:'iPhone portrait',width:390,height:844,touch:true},
 {name:'large portrait',width:430,height:932,touch:true},
 {name:'phone landscape',width:844,height:390,touch:true},
 {name:'compact landscape',width:667,height:375,touch:true},
 {name:'desktop',width:1280,height:800,touch:false},
 {name:'wide desktop',width:1440,height:900,touch:false}
];

const intersects=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
                          Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));

test('v0.28: HUD, controls and entire court never overlap across real viewport sizes',async({browser},testInfo)=>{
 for(const size of cases){
  const context=await browser.newContext({
   viewport:{width:size.width,height:size.height},
   isMobile:size.touch,hasTouch:size.touch,
   deviceScaleFactor:1,serviceWorkers:'block'
  });
  try{
   const page=await context.newPage(),errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
   // Click the real mode/action handlers even if the compact menu cannot fit every
   // secondary option at once. This suite measures the fight viewport.
   await page.evaluate(()=>{document.getElementById('mode-duel').click();document.getElementById('primary-action').click()});
   await expect(page.locator('#hud')).toBeVisible();
   await expect(page.locator('#world')).toBeVisible();
   if(size.touch)await expect(page.locator('#controls')).toBeVisible();
   else await expect(page.locator('#controls')).toBeHidden();
   await page.waitForFunction(()=>{
    const el=document.getElementById('world');
    const arena=document.getElementById('arena').getBoundingClientRect();
    const bounds=el.getBoundingClientRect();
    return bounds.width>100&&bounds.height>150&&bounds.width<=arena.width+.8&&bounds.height<=arena.height+.8;
   });
   const measured=await page.evaluate(()=>{
    const ids=['world','arena','hud','controls','stick','attack-btn','shield-btn','dash-btn','special-btn','special-choice','pause-btn'];
    const boxes=Object.fromEntries(ids.map(id=>{
     const node=document.getElementById(id),r=node.getBoundingClientRect();
     return[id,{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,visible:!!r.width&&!!r.height&&getComputedStyle(node).display!=='none'}]
    }));
    return{boxes,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};
   });
   const b=measured.boxes,c=b.world,a=b.arena,h=b.hud;
   expect(c.width, size.name+' canvas width').toBeGreaterThan(100);
   expect(c.height, size.name+' canvas height').toBeGreaterThan(150);
   expect(Math.abs(c.width/c.height-400/620), size.name+' canvas aspect').toBeLessThan(.012);
   expect(c.left, size.name+' canvas left').toBeGreaterThanOrEqual(-.8);
   expect(c.top, size.name+' canvas top').toBeGreaterThanOrEqual(-.8);
   expect(c.right, size.name+' canvas right').toBeLessThanOrEqual(size.width+.8);
   expect(c.bottom, size.name+' canvas bottom').toBeLessThanOrEqual(size.height+.8);
   expect(c.top, size.name+' HUD above court').toBeGreaterThanOrEqual(h.bottom-.8);
   expect(intersects(h,c), size.name+' scoreboard obscures field').toBe(0);
   expect(measured.scrollWidth, size.name+' horizontal scroll').toBeLessThanOrEqual(size.width+1);
   expect(measured.scrollHeight, size.name+' vertical scroll').toBeLessThanOrEqual(size.height+1);
   if(size.touch){
    for(const id of ['stick','attack-btn','shield-btn','dash-btn','special-btn','special-choice']){
     expect(b[id].visible, size.name+' '+id+' missing').toBe(true);
     expect(intersects(b[id],c),size.name+' '+id+' obscures court').toBe(0);
     expect(b[id].left,size.name+' '+id+' off left').toBeGreaterThanOrEqual(-.8);
     expect(b[id].right,size.name+' '+id+' off right').toBeLessThanOrEqual(size.width+.8);
     expect(b[id].bottom,size.name+' '+id+' off bottom').toBeLessThanOrEqual(size.height+.8);
    }
   }
   // Aim at the first and last visible rows; a visually contained but padded
   // canvas breaks this mapping, and would fail the following assertions.
   const x=c.left+c.width*.5;
   await page.mouse.click(x,c.top+c.height*.02);
   const upper=await page.evaluate(()=>window.__perekosTest.aim?.y);
   expect(upper,size.name+' upper aim').toBeGreaterThanOrEqual(0);
   expect(upper,size.name+' upper aim').toBeLessThan(25);
   await page.mouse.click(x,c.bottom-c.height*.02);
   const lower=await page.evaluate(()=>window.__perekosTest.aim?.y);
   expect(lower,size.name+' lower aim').toBeGreaterThan(595);
   expect(lower,size.name+' lower aim').toBeLessThanOrEqual(620);
   expect(errors,size.name+' page errors').toEqual([]);
   if(['iPhone portrait','phone landscape','wide desktop'].includes(size.name)){
    await testInfo.attach('perekos-v028-'+size.name.replaceAll(' ','-'),{
     body:await page.screenshot(),contentType:'image/png'
    });
   }
   await page.locator('#pause-btn').click();
   await expect(page.locator('#pause')).toBeVisible();
   await page.locator('#resume').click();
   await expect(page.locator('#hud')).toBeVisible();
  }finally{await context.close()}
 }
});

test('v0.28: resizing or changing round text never shifts the view under HUD',async({page})=>{
 await page.setViewportSize({width:1280,height:800});
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#mode-duel').click();
 await page.locator('#primary-action').click();
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:1440,height:900}]){
  await page.setViewportSize(viewport);
  await page.waitForFunction(()=>{
   const arena=document.getElementById('arena').getBoundingClientRect();
   const court=document.getElementById('world').getBoundingClientRect();
   return court.width>100&&court.width<=arena.width+.8&&court.height<=arena.height+.8;
  });
  const before=await page.locator('#world').boundingBox();
  await page.evaluate(()=>{
   document.getElementById('clock').textContent='09:59';
   document.getElementById('round-number').textContent='РАУНД 999';
   document.getElementById('score-me').textContent='● ● ● ●';
  });
  const after=await page.locator('#world').boundingBox();
  const hud=await page.locator('#hud').boundingBox();
  expect(after.y).toBeGreaterThanOrEqual(hud.y+hud.height-1);
  expect(after.width/after.height).toBeCloseTo(400/620,2);
  expect(Math.abs(after.x-before.x)).toBeLessThan(2);
  expect(after.height).toBeGreaterThan(150);
 }
});
