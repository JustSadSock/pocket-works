import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('export compact AI party and import it without losing mode, turn or fog',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();
 await page.locator('#aiBtn').click();
 await page.locator('#aiStartBtn').click();
 await page.locator('#settingsBtn').click();
 await expect(page.locator('#fogExportCurrentBtn')).toBeVisible();
 const ready=page.waitForEvent('download');
 await page.locator('#fogExportCurrentBtn').click();
 const download=await ready;
 const bytes=await readFile(await download.path()!);
 const contents=JSON.parse(bytes.toString('utf8'));
 expect(contents.version).toBe(5);
 expect(contents.aiMode).toBe(true);
 expect(contents.replayArchive.version).toBe(1);
 expect(contents.replayEvents).toBeUndefined();
 await page.locator('#settingsMenuBtn').click();
 await page.locator('#loadBtn').click();
 await page.locator('#fogImportSaveInput').setInputFiles({
   name:'my-foс-save.json',mimeType:'application/json',buffer:bytes
 });
 await expect(page.locator('#fogSaveNotice')).toContainText('импортирована');
 const imported=await page.evaluate(()=>{
   const key=window.listSaves().find(s=>s.key.includes('-import-'))?.key;
   if(!key)throw Error('Imported save not found');
   return window.loadGameData(key);
 });
 expect(imported).toBe(true);
 expect(await page.evaluate(()=>window.FogCurrentMode())).toMatchObject({aiMode:true,aiLevel:2});
 expect(await page.evaluate(()=>window.state.turn)).toBe(0);
 expect(errors).toEqual([]);
});
test('malformed imported save is rejected and original game remains intact',async({page})=>{
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();
 await page.locator('#twoBtn').click();
 const old=await page.evaluate(()=>({turn:window.state.turn,units:window.units.length}));
 await page.locator('#settingsBtn').click();await page.locator('#settingsMenuBtn').click();
 await page.locator('#loadBtn').click();
 await page.locator('#fogImportSaveInput').setInputFiles({
  name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"map":[],"origin":"pocketnet"}')
 });
 await expect(page.locator('#fogSaveNotice')).toContainText('отклонён');
 expect(await page.evaluate(()=>window.listSaves().some(s=>s.key.includes('-import-')))).toBe(false);
 await page.locator('#loadCloseBtn').click();
 const newer=await page.evaluate(()=>({turn:window.state.turn,units:window.units.length}));
 expect(newer.turn).toBe(0);
 expect(old.units).toBeGreaterThan(0);
});
test('replay archive in autosave stays capped and legacy original replay plays after migration',async({page})=>{
 await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
 await page.locator('#newGameBtn').click();
 await page.locator('#twoBtn').click();
 await page.evaluate(()=>window.saveGame());
 const archive=await page.evaluate(()=>{
  const key=window.listSaves().find(s=>s.key!=='focSave_autosave')!.key;
  const stored=JSON.parse(localStorage.getItem(key)!);
  return {key,compact:stored.replayArchive?.version,events:stored.replayEvents};
 });
 expect(archive.compact).toBe(1);expect(archive.events).toBeUndefined();
 await page.reload({waitUntil:'domcontentloaded'});
 expect(await page.evaluate(key=>window.loadGameData(key),archive.key)).toBe(true);
 expect(await page.evaluate(()=>window.replayEvents.length)).toBeGreaterThan(0);
});
