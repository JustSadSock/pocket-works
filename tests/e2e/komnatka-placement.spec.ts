import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot } from './helpers';

type Position={x:number;y:number};
async function enter(page:any){
 await page.goto('/apps/komnatka/?qa=1',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#homeSolo')).toBeVisible({timeout:15_000});
 await page.locator('#homeSolo').click();
 await expect(page.locator('#homeScreen')).toBeHidden();
 await page.waitForFunction(()=>(window as any).__KOMNATKA_TEST__?.stageReady===true,undefined,{timeout:25_000});
}
async function moveFromCatalog(page:any,type:string,target:Position){
 const button=page.locator('#catalog [data-type="'+type+'"]');
 await button.scrollIntoViewIfNeeded();
 const box=await button.boundingBox();
 expect(box,'Expected catalog item to be measurable').not.toBeNull();
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
 await page.mouse.down();
 await page.mouse.move(target.x,target.y,{steps:12});
}
test.describe('КОМНАТКА — actual placement and motion',()=>{
 test.beforeEach(async ({},testInfo)=>{
  test.skip(!testInfo.project.name.includes('portrait'),'Primary dollhouse interactions are portrait-first');
  test.setTimeout(140_000);
 });
 test('catalog drag places an item and occupied spots show an invalid grid',async ({page},testInfo)=>{
  await enter(page);
  const before=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.itemCount);
  const free=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.groundPoint(1.4,1.7)) as Position;
  await moveFromCatalog(page,'stool',free);
  let placement=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.placement);
  expect(placement?.type).toBe('stool');
  expect(placement?.ready).toBe(true);
  expect(placement?.valid).toBe(true);
  expect(await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.gridVisible)).toBe(true);
  await attachCriticalScreenshot(page,testInfo,'komnatka-catalog-drag-grid',{fullPage:false});
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.itemCount)).toBe(before+1);
  expect(await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.gridVisible)).toBe(false);
  const occupied=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.groundPoint(.1,-2.38)) as Position;
  await moveFromCatalog(page,'sofa',occupied);
  placement=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.placement);
  expect(placement?.valid).toBe(false);
  await expect(page.locator('.scene-hint.invalid')).toBeVisible();
  await attachCriticalScreenshot(page,testInfo,'komnatka-invalid-placement',{fullPage:false});
  await page.mouse.up();
  expect(await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.itemCount)).toBe(before+1);
  expect(await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.placement)).toBeNull();
 });
 test('decor goes on the visible tabletop at the cursor, not under the table',async ({page},testInfo)=>{
  await enter(page);
  await page.locator('#categories [data-group="decor"]').click();
  const before=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.itemCount);
  const surface=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.groundPoint(.75,-.76,.72)) as Position;
  await moveFromCatalog(page,'deskclock',surface);
  const placement=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.placement);
  expect(placement?.type).toBe('deskclock');
  expect(placement?.support).toBe('welcome-coffee');
  expect(placement?.valid).toBe(true);
  await attachCriticalScreenshot(page,testInfo,'komnatka-clock-on-visible-tabletop',{fullPage:false});
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.itemCount)).toBe(before+1);
  const upright=await page.evaluate(()=>{
   const q=(window as any).__KOMNATKA_TEST__;
   return q.meshRotation(q.selection,'alarm-upright-ivory-dial');
  });
  expect(upright,'The actual 3D clock face must be upright').toBeCloseTo(Math.PI/2,3);
 });
 test('desktop right-to-left drag is not mistaken for catalog scrolling',async ({page},testInfo)=>{
  await page.setViewportSize({width:1140,height:790});
  await enter(page);
  const before=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.itemCount);
  const free=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.groundPoint(1.45,1.65)) as Position;
  await moveFromCatalog(page,'stool',free);
  expect(await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.placement?.valid)).toBe(true);
  await attachCriticalScreenshot(page,testInfo,'komnatka-desktop-direct-drag',{fullPage:false});
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>(window as any).__KOMNATKA_TEST__.itemCount)).toBe(before+1);
 });
 test('teddy and vase have readable model previews',async ({page},testInfo)=>{
  await enter(page);
  await page.locator('#categories [data-group="decor"]').click();
  for(const type of ['teddy','vase']){
   const item=page.locator('#catalog [data-type="'+type+'"]');
   await item.scrollIntoViewIfNeeded();
   await expect(item.locator('.item-drawing')).toBeVisible();
   await attachCriticalScreenshot(page,testInfo,'komnatka-'+type+'-catalog-shape',{fullPage:false});
  }
 });
 test('table decorations follow real-time lift and catalog specimens remain visible',async ({page},testInfo)=>{
  await enter(page);
  const table=await page.evaluate(()=>(window as any).__KOMNATKA_TEST__.point('welcome-coffee')) as Position|null;
  expect(table,'Coffee table must have a real pickable mesh').not.toBeNull();
  await page.mouse.move(table!.x,table!.y);
  await page.mouse.down();
  await page.waitForTimeout(180);
  const offset=await page.evaluate(()=>{
   const q=(window as any).__KOMNATKA_TEST__;
   return {table:q.meshY('welcome-coffee'),books:q.meshY('welcome-books'),mug:q.meshY('welcome-mug')};
  });
  expect(offset.table).toBeGreaterThan(.06);
  expect(Math.abs(offset.books-.72-offset.table)).toBeLessThan(.014);
  expect(Math.abs(offset.mug-.72-offset.table)).toBeLessThan(.014);
  await attachCriticalScreenshot(page,testInfo,'komnatka-table-with-attached-decor',{fullPage:false});
  await page.mouse.up();
  await page.locator('#categories [data-group="decor"]').click();
  const cushion=page.locator('#catalog [data-type="pillow"] .item-drawing');
  await expect(cushion).toBeVisible();
  await expect(cushion).toHaveCSS('width',/\d+px/);
  await attachCriticalScreenshot(page,testInfo,'komnatka-readable-small-props',{fullPage:false});
  await page.locator('#categories [data-group="furniture"]').click();
  await expect(page.locator('#catalog [data-type="sofa"] .item-drawing')).toBeVisible();
 });
});
