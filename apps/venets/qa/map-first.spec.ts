import {test,expect} from '@playwright/test';
const ENTRY='/apps/venets/index.html';
const layout=page=>page.evaluate(()=>({
  pageW:document.documentElement.scrollWidth,pageH:document.documentElement.scrollHeight,
  viewportW:innerWidth,viewportH:innerHeight,
  menu:document.querySelector('#menu-screen')?.getBoundingClientRect().toJSON(),
  map:document.querySelector('#start-map')?.getBoundingClientRect().toJSON()
}));
test('political start is on the map and picks a real vassal duchy',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(ENTRY);
  await expect(page.locator('#start-map .living-atlas')).toBeVisible();
  await expect(page.locator('#start-map .atlas-county')).toHaveCount(12);
  await page.locator('[data-start-rank="duchy"]').click();
  await expect(page.locator('[data-start-rank="duchy"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#start-map .atlas-county[data-title="du-02"]').first()).toBeVisible();
  await page.locator('#start-map .atlas-county[data-title="du-02"]').first().click();
  await expect(page.locator('#starts')).toContainText('Герцогство Срединные земли');
  await expect(page.locator('#starts')).toContainText('Сюзерен:');
  await page.locator('#begin').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#panel-lands .living-atlas')).toBeVisible();
  await expect(page.locator('#ruler-rank')).toHaveText(/ГЕРЦОГСТВО/);
  await expect.poll(()=>page.evaluate(async()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('venets-campaigns',1);
    open.onsuccess=()=>{
      const db=open.result,q=db.transaction('saves','readonly').objectStore('saves').get('active');
      q.onsuccess=()=>{db.close();resolve(q.result?JSON.parse(q.result).startCountyId:null)};
      q.onerror=()=>reject(q.error);
    };
    open.onerror=()=>reject(open.error);
  }))).toBe('du-02');
  expect(errors).toEqual([]);
});
test('king is selectable as genuine top liege and the year advances',async({page})=>{
  await page.goto(ENTRY);
  await page.locator('[data-start-rank="kingdom"]').click();
  await expect(page.locator('#starts')).toContainText('Независимый государь');
  await page.locator('#begin').click();
  await expect(page.locator('#ruler-rank')).toHaveText(/КОРОЛЕВСТВО/);
  await page.locator('[data-panel="council"]').click();
  await expect(page.locator('#panel-council')).toBeVisible();
  await page.locator('#next-year').click();
  await expect(page.locator('#year-count')).toHaveText('1067');
});
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1366,height:768}]){
 test('menu does not scroll, map and start are visible at '+viewport.width+'x'+viewport.height,async({page})=>{
  await page.setViewportSize(viewport);
  await page.goto(ENTRY);
  await expect(page.locator('#begin')).toBeVisible();
  await expect(page.locator('#start-map .living-atlas')).toBeVisible();
  const p=await layout(page);
  expect(p.pageW).toBeLessThanOrEqual(p.viewportW+2);
  expect(p.pageH).toBeLessThanOrEqual(p.viewportH+3);
  expect(p.map.height).toBeGreaterThan(95);
  await page.locator('#begin').click();
  await expect(page.locator('#panel-lands .living-atlas')).toBeVisible();
  const gameSize=await page.locator('#panel-lands').boundingBox();
  expect(gameSize?.width).toBeGreaterThan(viewport.width*.8);
  const after=await layout(page);
  expect(after.pageW).toBeLessThanOrEqual(after.viewportW+2);
  expect(after.pageH).toBeLessThanOrEqual(after.viewportH+3);
 });
}
