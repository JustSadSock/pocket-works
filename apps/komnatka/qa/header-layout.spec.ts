import { expect, test } from '@playwright/test';

test('КОМНАТКА: header controls never overlap and desktop catalogue shows all categories',async ({page},testInfo)=>{
 test.skip(!testInfo.project.name.includes('chromium-mobile-portrait'),'Single Chromium layout matrix');
 test.setTimeout(110_000);
 await page.goto('/apps/komnatka/?qa=1',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#homeSolo')).toBeVisible({timeout:25_000});
 await page.locator('#homeSolo').click();
 await expect(page.locator('#homeScreen')).toBeHidden();
 await expect(page.locator('#menuBtn')).toBeVisible();
 for(const width of [1792,1440,1380,1100,900,840,600,430,375,320]){
  await page.setViewportSize({width,height:850});
  const layout=await page.evaluate(()=>{
   const rect=(selector:string)=>{
    const r=document.querySelector(selector)!.getBoundingClientRect();
    return {x:r.left,right:r.right,y:r.top,bottom:r.bottom,width:r.width,height:r.height};
   };
   const topbar=rect('.topbar'),back=rect('.topbar .back'),brand=rect('.topbar .brand'),
    tools=rect('.topbar .quick-tools'),menu=rect('#menuBtn'),online=rect('#onlineBtn');
   const visibleTools=Array.from(document.querySelectorAll<HTMLButtonElement>('.quick-tools button'))
    .filter(el=>getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden')
    .map(el=>({id:el.id,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));
   const dock=rect('.catalog-dock');
   const categories=Array.from(document.querySelectorAll<HTMLButtonElement>('#categories button'))
    .map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
   return {topbar,back,brand,tools,menu,online,visibleTools,dock,categories};
  });
  expect(layout.back.right, `Back overlaps brand at ${width}px`).toBeLessThanOrEqual(layout.brand.x+1);
  expect(layout.brand.right, `Brand overlaps controls at ${width}px`).toBeLessThanOrEqual(layout.tools.x+1);
  expect(layout.tools.right, `Tools overflow viewport at ${width}px`).toBeLessThanOrEqual(width+1);
  expect(layout.menu.height).toBeGreaterThanOrEqual(30);
  expect(layout.online.height).toBeGreaterThanOrEqual(30);
  for(const button of layout.visibleTools){
   expect(button.top,`${button.id} escapes topbar at ${width}px`).toBeGreaterThanOrEqual(layout.topbar.y-1);
   expect(button.bottom,`${button.id} escapes topbar at ${width}px`).toBeLessThanOrEqual(layout.topbar.bottom+1);
  }
  if(width>=1440){
   expect(layout.menu.width).toBeGreaterThan(65);
   expect(layout.online.width).toBeGreaterThan(75);
  }
  if(width>840){
   expect(layout.categories).toHaveLength(6);
   for(const tab of layout.categories){
    expect(tab.left).toBeGreaterThanOrEqual(layout.dock.x-1);
    expect(tab.right).toBeLessThanOrEqual(layout.dock.right+1);
   }
  }
 }
});

test('КОМНАТКА: compact tools are real actions and dismiss on Escape/outside press',async ({page},testInfo)=>{
 test.skip(!testInfo.project.name.includes('chromium-mobile-portrait'),'Single Chromium interaction check');
 await page.setViewportSize({width:375,height:760});
 await page.goto('/apps/komnatka/?qa=1',{waitUntil:'domcontentloaded'});
 await page.locator('#homeSolo').click();
 const toggle=page.locator('#toolsMoreBtn'),panel=page.locator('#toolbarMore');
 await expect(toggle).toBeVisible();
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(panel).toHaveClass(/is-open/);
 await page.locator('#eveningBtn').click();
 await expect(page.locator('#eveningBtn')).toHaveAttribute('aria-pressed','true');
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();
 await page.keyboard.press('Escape');
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();
 await page.locator('#roomCanvas').click({position:{x:20,y:20}});
 await expect(toggle).toHaveAttribute('aria-expanded','false');
});
