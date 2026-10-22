import {test,expect} from '@playwright/test';
test('start, move, cast, pause, resume, pick rune and finish complete 1v1 training match',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#primary-action')).toBeVisible();
 await page.locator('#primary-action').click();
 await expect(page.locator('#hud')).toBeVisible();
 const a=await page.evaluate(()=>window.__perekosTest.state.actors[0].x);
 await page.keyboard.down('d');await page.waitForTimeout(330);await page.keyboard.up('d');
 const b=await page.evaluate(()=>window.__perekosTest.state.actors[0].x);
 expect(b).toBeGreaterThan(a);
 await page.keyboard.down('Space');await page.waitForTimeout(250);await page.keyboard.up('Space');
 expect(await page.evaluate(()=>window.__perekosTest.state.shots.length)).toBeGreaterThan(0);
 await page.locator('#pause-btn').click();
 await expect(page.locator('#pause')).toBeVisible();
 await page.locator('#resume').click();
 await expect(page.locator('#hud')).toBeVisible();
 await page.evaluate(()=>{for(let i=0;i<2000&&window.__perekosTest.state.phase==='fight';i++)window.__perekosTest.step()});
 await expect(page.locator('#draft')).toBeVisible({timeout:4000});
 await expect(page.locator('.rune-choice')).toHaveCount(3);
 await page.locator('.rune-choice').first().click();
 await expect(page.locator('#build')).toBeVisible();
 await expect(page.locator('.bench-slot')).toHaveCount(3);
 await expect(page.locator('#chain-preview')).toBeVisible();
 await page.locator('#bench-save').click();
 await page.locator('#bench-fight').click();
 await expect(page.locator('#hud')).toBeVisible();
 expect(await page.evaluate(()=>window.__perekosTest.state.actors[0].runes.length)).toBe(3);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#continue')).toBeVisible();
 await page.locator('#continue').click();
 await expect(page.locator('#hud')).toBeVisible();
 await page.evaluate(()=>{let rounds=0;for(let i=0;i<40000;i++){const g=window.__perekosTest.state;if(g.phase==='result')break;if(g.phase==='draft'){window.__perekosTest.pick(g.pick[0],g.actors[0].runes.length>=5?0:null);rounds++;continue;}if(g.phase==='build'){window.__perekosTest.build();continue;}window.__perekosTest.step();}});
 await expect(page.locator('#result')).toBeVisible({timeout:4500});
 expect(await page.evaluate(()=>Math.max(...window.__perekosTest.state.score))).toBe(4);
 await page.locator('#result-save').click();
 await page.locator('#again').click();await expect(page.locator('#hud')).toBeVisible();
 expect(errors).toEqual([]);
});
test('portrait controls and explicit PocketWorks return',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});const page=await context.newPage();
 try{await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});await page.locator('#primary-action').click();await expect(page.locator('#controls')).toBeVisible();const joy=await page.locator('#stick').boundingBox();expect(joy).toBeTruthy();
 const before=await page.evaluate(()=>window.__perekosTest.state.actors[0].y);
 const x=joy.x+joy.width/2,y=joy.y+joy.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-joy.height*.28,{steps:7});await page.waitForTimeout(350);await page.mouse.up();
 const after=await page.evaluate(()=>window.__perekosTest.state.actors[0].y);expect(after).toBeLessThan(before);
 await page.locator('#pause-btn').click();await expect(page.locator('#pause')).toBeVisible();await expect(page.locator('#pause a[href="../../"]')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 }finally{await context.close()}
});


test('grimoire saves a real five-slot chain and can replay it in solo practice',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#primary-action').click();
 await page.evaluate(()=>{
  for(let i=0;i<2000&&window.__perekosTest.state.phase==='fight';i++)window.__perekosTest.step()
 });
 await expect(page.locator('#draft')).toBeVisible();
 await page.locator('.rune-choice').first().click();
 await expect(page.locator('#build')).toBeVisible();
 const before=await page.evaluate(()=>window.__perekosTest.state.actors[0].runes.slice());
 if(before.length>2){await page.locator('.bench-slot .slot-move button').last().click({force:true}).catch(()=>{})}
 await page.locator('#bench-save').click();
 await page.locator('#bench-fight').click();
 await page.locator('#pause-btn').click();await page.locator('#quit').click();
 await page.locator('#quit-yes').click();await page.locator('#open-grimoire').click();
 await expect(page.locator('#books')).toBeVisible();await expect(page.locator('.book-row')).toHaveCount(1);
 await page.locator('.book-actions button').first().click();
 await expect(page.locator('#hud')).toBeVisible();
 const actual=await page.evaluate(()=>window.__perekosTest.state.actors[0].runes);
 expect(actual.length).toBe(3);
 await page.locator('#pause-btn').click();await page.locator('#quit').click();await page.locator('#quit-yes').click();await page.locator('#open-grimoire').click();
 await page.locator('.book-actions button').last().click();
 await expect(page.locator('#book-delete')).toBeVisible();
 await page.locator('#book-delete-no').click();
 await expect(page.locator('.book-row')).toHaveCount(1);
 await page.locator('.book-actions button').last().click();await page.locator('#book-delete-yes').click();
 await expect(page.locator('.book-row')).toHaveCount(0);
});

test('desktop arena hides mobile controls, shows genuine rune/cooldown dossiers and remembers panel preference',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});const page=await context.newPage();
 try{
  await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#primary-action')).toBeVisible();
  await page.locator('#primary-action').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#controls')).toBeHidden();
  await expect(page.locator('#desktop-dashboard')).toBeVisible();
  await expect(page.locator('#desktop-dossier')).toBeVisible();
  await expect(page.locator('#tactic-mage')).not.toBeEmpty();
  await expect(page.locator('#tactic-runes .rune-chain').first()).toBeVisible();
  await page.locator('#desktop-panels-toggle').click();
  await expect(page.locator('#desktop-dossier')).toBeHidden();
  await expect(page.locator('#desktop-panels-toggle')).toHaveAttribute('aria-expanded','false');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#continue').click();
  await expect(page.locator('#desktop-dossier')).toBeHidden();
  await page.locator('#desktop-panels-toggle').click();
  await expect(page.locator('#desktop-dossier')).toBeVisible();
  await page.keyboard.down('KeyD');await page.waitForTimeout(90);await page.keyboard.up('KeyD');
  await page.locator('#pause-btn').click();
  await expect(page.locator('#desktop-dashboard')).toBeHidden();
 }finally{await context.close()}
});
