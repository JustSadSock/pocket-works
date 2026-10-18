import { test, expect } from '@playwright/test';

test('campaign: playable map, turn, autosave, reload and return',async ({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#newGame')).toBeVisible();
  await page.locator('#newGame').click();
  await expect(page.locator('#start')).toBeHidden();
  await expect(page.locator('#field')).toBeVisible();
  await expect(page.locator('#endTurn')).toBeEnabled();
  const display=await page.locator('#map').evaluate((el:HTMLCanvasElement)=>{
    const {width,height}=el;
    const ctx=el.getContext('2d')!;
    const pixels=ctx.getImageData(0,0,width,height).data;
    const samples=new Set<string>();
    for(let y=0;y<height;y+=23)for(let x=0;x<width;x+=23){
      const n=(y*width+x)*4;
      samples.add(pixels[n]+','+pixels[n+1]+','+pixels[n+2]);
    }
    return {width,height,colors:samples.size};
  });
  expect(display.width).toBeGreaterThan(160);
  expect(display.height).toBeGreaterThan(220);
  expect(display.colors).toBeGreaterThan(12);
  await page.screenshot({path:info.outputPath('01-map.png')});
  await page.locator('#zoomIn').click();
  await page.locator('#focus').click();
  await page.locator('#endTurn').click();
  await expect(page.locator('#season')).toContainText('ХОД 2',{timeout:12000});
  await page.screenshot({path:info.outputPath('02-turn.png')});
  await page.locator('#menuBtn').click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#save').click();
  await page.locator('#resume').click();
  await expect(page.locator('#menu')).toBeHidden();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#continueGame')).toBeEnabled();
  await page.locator('#continueGame').click();
  await expect(page.locator('#start')).toBeHidden();
  await expect(page.locator('#season')).toContainText('ХОД 2');
  const bounds=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,vw:innerWidth,vh:innerHeight}));
  expect(bounds.w).toBeLessThanOrEqual(bounds.vw+2);
  expect(bounds.h).toBeLessThanOrEqual(bounds.vh+2);
  expect(errors).toEqual([]);
});

test('menu: online lobby and cancellation do not trap the app',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/apps/fog-of-conquest/',{waitUntil:'domcontentloaded'});
  await page.locator('#onlineBtn').click();
  await expect(page.locator('#online')).toBeVisible();
  await expect(page.locator('#createRoom')).toBeVisible();
  await page.locator('#onlineClose').click();
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#online')).toBeHidden();
  await page.locator('#newGame').click();
  await page.locator('#menuBtn').click();
  await page.locator('#newConfirm').click();
  await expect(page.locator('#confirm')).toBeVisible();
  await page.locator('#confirmNo').click();
  await expect(page.locator('#confirm')).toBeHidden();
  await expect(page.locator('#field')).toBeVisible();
  expect(errors).toEqual([]);
});
