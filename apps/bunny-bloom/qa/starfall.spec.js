import {test,expect} from '@playwright/test';

const V2='pocket-works:bunny-bloom:v2';
const MEADOW='pocket-works:bunny-bloom:meadow-v3';

test('starfall starts at fourth bouquet, awards stars and restores after reload', async ({page},testInfo)=>{
  test.setTimeout(65000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({storage,meadow})=>{
    try{
      if(sessionStorage.getItem('bunny-qa-initialized'))return;
      sessionStorage.setItem('bunny-qa-initialized','1');
      const now=Date.now();
      localStorage.setItem(storage,JSON.stringify({
        stars:0,harvests:3,beds:[{kind:'rose',plantedAt:now-12000,readyAt:now-2000,watered:true},null,null],
        friends:[],night:true,bonuses:{},bunnyGift:0,seed:'rose',counts:{rose:3,bell:0,sun:0},claimed:[]
      }));
      localStorage.removeItem(meadow);
    }catch{}
  },{storage:V2,meadow:MEADOW});
  await page.goto('/apps/bunny-bloom/');
  await expect(page.locator('#bed0.ripe')).toBeVisible();
  // Logic test seeds a ripe flower; the separate visual suite validates real pointer taps.
  await page.locator('#bed0').evaluate(element=>element.click());
  await expect(page.locator('#sky-event')).toBeVisible();
  await expect(page.locator('#starfallCounter')).toContainText('Звездопад');
  await expect(page.locator('.catch-star')).toHaveCount(1);
  await page.locator('.catch-star').first().click();
  await expect(page.locator('#bank')).toContainText('5');
  await page.locator('#bunny').click();
  await expect(page.locator('#bunny-art')).toHaveAttribute('src',/^data:image\/gif;base64,/);
  await expect(page.locator('#bunny-art')).toHaveJSProperty('complete',true);
  const size=await page.locator('#bunny-art').evaluate(async image=>{
    await image.decode();return [image.naturalWidth,image.naturalHeight];
  });
  expect(size).toEqual([52,46]);
  await page.screenshot({path:testInfo.outputPath('starfall.png'),fullPage:true});
  // The init script deliberately replaces storage on navigation, so inspect current storage before reloading.
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),MEADOW);
  expect(saved.starsCaught).toBe(1);
  // The initial seeding script runs only once per browser session.
  await page.reload();
  await expect(page.locator('#sky-event')).toBeVisible();
  const persisted=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),MEADOW);
  expect(persisted.starsCaught).toBe(1);
  expect(errors).toEqual([]);
});

test('broken save data does not prevent garden or catalog loading',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({storage,meadow})=>{
    try{localStorage.setItem(storage,'{"stars":"bad","beds":{}}');localStorage.setItem(meadow,'invalid-json')}catch{}
  },{storage:V2,meadow:MEADOW});
  await page.goto('/apps/bunny-bloom/');
  await expect(page.locator('#bed0')).toBeVisible();
  await expect(page.locator('#sky-event')).toBeHidden();
  await page.locator('#journal').click();
  await expect(page.locator('#journalSheet')).toBeVisible();
  await page.locator('#journalClose').click();
  await expect(page.locator('#journalSheet')).toBeHidden();
  expect(errors).toEqual([]);
});
