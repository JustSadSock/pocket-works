import {test,expect} from '@playwright/test';

test('P0: beta tiny stays on-map and survives a full reload',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();
 await page.locator('#mapSizeSelect').selectOption('tiny');
 await page.locator('#betaBtn').click();
 const initial=await page.evaluate(()=>{
   const bogs=window.units.filter(u=>u.type==='bog');
   return {size:[window.ROWS,window.COLS],bogs:bogs.map(u=>({r:u.r,c:u.c})),
     mode:window.FogCurrentMode()};
 });
 expect(initial.size).toEqual([5,8]);expect(initial.bogs).toHaveLength(2);
 for(const bog of initial.bogs){expect(bog.r).toBeGreaterThanOrEqual(0);expect(bog.r).toBeLessThan(5);expect(bog.c).toBeGreaterThanOrEqual(0);expect(bog.c).toBeLessThan(8);}
 await page.locator('#settingsBtn').click();
 await page.locator('#saveBtn').click();
 await expect(page.locator('#fogSaveNotice')).toContainText('Партия сохранена');
 const key=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('focSave_')&&k!=='focSave_autosave').at(-1));
 expect(key).toBeTruthy();
 await page.reload({waitUntil:'domcontentloaded'});
 const loaded=await page.evaluate(key=>window.loadGameData(key!),key);
 expect(loaded).toBe(true);
 expect(await page.evaluate(()=>window.FogCurrentMode().modeBeta)).toBe(true);
 expect(await page.evaluate(()=>window.BUILD_TYPES.base.spawn.includes('bog'))).toBe(true);
 expect(await page.evaluate(()=>window.units.filter(u=>u.type==='bog').length)).toBe(2);
 expect(errors).toEqual([]);
});

test('P0: AI and current side persist; malformed local save never changes live match',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();
 await page.locator('#aiBtn').click();
 await page.locator('#aiLevelSelect').selectOption('6');
 await page.locator('#aiStartBtn').click();
 expect(await page.evaluate(()=>window.saveGame())).toBe(true);
 const key=await page.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('focSave_')&&k!=='focSave_autosave'));
 await page.reload({waitUntil:'domcontentloaded'});
 expect(await page.evaluate(key=>window.loadGameData(key!),key)).toBe(true);
 expect(await page.evaluate(()=>window.FogCurrentMode())).toMatchObject({aiMode:true,aiLevel:6,modeBeta:false});
 await page.evaluate(()=>localStorage.setItem('focSave_broken','{"map":[],"state":null}'));
 const before=await page.evaluate(()=>({units:window.units.map(u=>({...u})),turn:window.state.turn}));
 expect(await page.evaluate(()=>window.loadGameData('focSave_broken'))).toBe(false);
 expect(await page.evaluate(()=>({units:window.units.map(u=>({...u})),turn:window.state.turn}))).toEqual(before);
 await expect(page.locator('#fogSaveNotice')).toContainText('Не удалось загрузить');
 expect(errors).toEqual([]);
});

test('P0: quota error is visible; failed saves do not appear in the load list',async({page})=>{
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();await page.locator('#twoBtn').click();
 const result=await page.evaluate(()=>{
   const old=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){if(k.startsWith('focSave_'))throw new DOMException('Full','QuotaExceededError');return old.call(this,k,v);};
   try{return window.saveGame();}finally{Storage.prototype.setItem=old;}
 });
 expect(result).toBe(false);
 await expect(page.locator('#fogSaveNotice')).toContainText('закончилось место');
 expect(await page.evaluate(()=>window.listSaves().some(s=>s.key!=='focSave_autosave'))).toBe(false);
});

test('P1: loading south-side hotseat pans toward own territory on phone',async({page},info)=>{
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();await page.locator('#twoBtn').click();
 await page.evaluate(()=>window.nextTurn());
 expect(await page.evaluate(()=>window.saveGame())).toBe(true);
 const key=await page.evaluate(()=>window.listSaves().find(s=>s.key!=='focSave_autosave')?.key);
 await page.reload({waitUntil:'domcontentloaded'});
 expect(await page.evaluate(key=>window.loadGameData(key!),key)).toBe(true);
 expect(await page.evaluate(()=>window.state.currentPlayer)).toBe(2);
 if(info.project.name.endsWith('phone')){
   await expect.poll(()=>page.locator('#battleViewport').evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
 }
});
