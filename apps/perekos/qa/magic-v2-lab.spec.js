import {test,expect} from '@playwright/test';

test('v2 new magic is a real class-free school selection, combat and sealed rune editing loop',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#open-v2-lab').click();
 await expect(page.locator('#magic-v2')).toBeVisible();
 await expect(page.locator('.v2-school')).toHaveCount(3);
 await page.locator('.v2-school.v2-fire').click();
 await expect(page.locator('.v2-kicker')).toContainText('Огонь');
 expect(await page.evaluate(()=>window.__perekosTest.state.magicSchool)).toBe('fire');
 const tab=page.locator('.v2-tab').nth(1);
 await tab.click();
 const castCard=page.locator('.v2-card').filter({hasText:'При выстреле'}).first();
 await castCard.click();
 await page.locator('.v2-reserve-item').filter({hasText:'При выстреле'}).locator('.v2-equip').first().click();
 const guardCard=page.locator('.v2-card').filter({hasText:'Защититься'}).first();
 await guardCard.click();
 await page.locator('.v2-reserve-item').filter({hasText:'Защититься'}).locator('.v2-equip').first().click();
 await expect(page.locator('.v2-editor .v2-installed')).toHaveCount(2);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('.v2-seal').click();
 await expect(page.locator('.v2-sealed')).toHaveCount(1);
 expect(await page.evaluate(()=>window.__perekosTest.state.magicLoadouts[0].slots[1].actions.length)).toBe(0);
 await page.locator('.v2-play').click();
 if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches))await expect(page.locator('#controls')).toBeVisible();
 else await expect(page.locator('#controls')).toBeHidden();
 await expect(page.locator('#forge-edit')).toBeVisible();
 await expect(page.locator('#special-btn')).toBeHidden();
 if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches)){
  // A real touchscreen tap queues one cast on pointerup. Mouse API fakes
  // pointerType=mouse, whose press can be missed between simulation frames.
  await page.locator('#attack-btn').tap();
 }else{
  await page.keyboard.down('Space');await page.waitForTimeout(170);await page.keyboard.up('Space');
 }
 await expect.poll(()=>page.evaluate(()=>window.__perekosTest.state.actors[0].shield),{timeout:4000}).toBeGreaterThan(0);
 await page.locator('#forge-edit').click();
 await expect(page.locator('#magic-v2')).toBeVisible();
 await expect(page.locator('.v2-sealed')).toHaveCount(1);
 expect(await page.evaluate(()=>window.__perekosTest.state.magicLoadouts[0].sealed.length)).toBe(1);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#continue-v2').click();
 await expect(page.locator('#magic-v2')).toBeVisible();
 await expect(page.locator('.v2-sealed')).toHaveCount(1);
});

test('v2 mobile scrollport keeps menu, rune lab and physical arena accessible',async({browser},testInfo)=>{
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
   await page.locator('#open-v2-lab').click();
   await expect(page.locator('#magic-v2')).toBeVisible();
   await page.locator('.v2-school.v2-stone').click();
   const rect=await page.locator('.v2-stage').boundingBox();
   expect(rect.width).toBeGreaterThan(100);
   expect(rect.x).toBeGreaterThanOrEqual(-1);
   expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width+1);
   expect(rect.y+rect.height).toBeLessThanOrEqual(viewport.height+1);
   await page.locator('.v2-play').click();
   await expect(page.locator('#controls')).toBeVisible();
   await expect(page.locator('#special-btn')).toBeHidden();
   const canvas=await page.locator('#world').boundingBox(),hud=await page.locator('#hud').boundingBox();
   expect(canvas.y).toBeGreaterThanOrEqual(hud.y+hud.height-.5);
   await page.locator('#forge-edit').click();
   await expect(page.locator('#magic-v2')).toBeVisible();
   expect(errors).toEqual([]);
   await testInfo.attach('magic-v2-'+viewport.width+'x'+viewport.height,{body:await page.screenshot(),contentType:'image/png'});
  }finally{await context.close()}
 }
});

test('v2 training save is separate from an unfinished old duel, even after reload',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 const old=await page.evaluate(async()=>{
  const mod=await import('/apps/perekos/core.mjs');
  const state=mod.makeMatch(441,'kindle','pebble','duel');
  localStorage.setItem('pocket-works:perekos:match',JSON.stringify(state));
  return JSON.stringify(state);
 });
 await page.locator('#open-v2-lab').click();
 await page.locator('.v2-school.v2-storm').click();
 await page.locator('.v2-play').click();
 await page.locator('#forge-edit').click();
 expect(await page.evaluate(()=>localStorage.getItem('pocket-works:perekos:match'))).toBe(old);
 expect(await page.evaluate(()=>localStorage.getItem('pocket-works:perekos:magic-v2-practice'))).toContain('magicModeV2');
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#continue')).toBeVisible();
 await expect(page.locator('#continue-v2')).toBeVisible();
 await page.locator('#continue-v2').click();
 expect(await page.evaluate(()=>window.__perekosTest.state.magicSchool)).toBe('storm');
 expect(await page.evaluate(()=>localStorage.getItem('pocket-works:perekos:match'))).toBe(old);
});


test('the rune forge composes named stone transformations and physical ground waves',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#open-v2-lab').click();
 await page.locator('.v2-school.v2-stone').click();
 await page.locator('.v2-tab').nth(1).click();
 await page.locator('.v2-card').filter({hasText:'Переплести основу'}).click();
 await page.locator('.v2-reserve-item').filter({hasText:'Переплести основу'}).locator('.v2-equip').click();
 await page.locator('.v2-card').filter({hasText:'Каменная волна'}).click();
 await page.locator('.v2-reserve-item').filter({hasText:'Каменная волна'}).locator('.v2-equip').click();
 await expect(page.locator('.v2-form-summary strong')).toHaveText('Каменная волна');
 await page.locator('.v2-card').filter({hasText:'Эпицентр'}).click();
 await page.locator('.v2-reserve-item').filter({hasText:'Эпицентр'}).locator('.v2-equip').click();
 await expect(page.locator('.v2-form-summary strong')).toHaveText('Землетрясение');
 await page.locator('.v2-play').click();
 await page.evaluate(()=>window.__perekosTest.step());
 const physical=await page.evaluate(()=>({
  magic:window.__perekosTest.state.magicModeV2,
  waves:window.__perekosTest.state.waves.filter(w=>w.v2Element==='stone'),
  projectileCount:window.__perekosTest.state.shots.length
 }));
 expect(physical.magic).toBe(true);
 expect(physical.waves.length).toBeGreaterThan(0);
 expect(physical.waves[0].halfAngle).toBeCloseTo(Math.PI,4);
 expect(physical.projectileCount).toBe(0);
 expect(errors).toEqual([]);
});

test('three newly physical rune families appear in their own offline school only',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#open-v2-lab').click();
 const cases=[
  ['stone','Разлом','Огненная плеть'],
  ['fire','Огненная плеть','Зарядная мина'],
  ['storm','Зарядная мина','Разлом']
 ];
 for(const [index,[school,label,foreign]] of cases.entries()){
  await page.locator('.v2-school.v2-'+school).click();
  await expect(page.locator('.v2-card').filter({hasText:label})).toHaveCount(1);
  await expect(page.locator('.v2-card').filter({hasText:foreign})).toHaveCount(0);
  if(index!==cases.length-1){
   // Switching schools is an in-app action with explicit confirmation.
   // Reloading the same training session would correctly offer Resume instead.
   page.once('dialog',dialog=>dialog.accept());
   await page.getByRole('button',{name:'Сменить стихию'}).click();
   await expect(page.locator('.v2-schools')).toBeVisible();
  }
 }
});
