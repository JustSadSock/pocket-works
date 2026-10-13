import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage,
  openLibraryPage
} from './helpers';

test('Screen Lab matches the project orientation without viewport overflow', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/screen-lab/', '#orientation');

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const expectedOrientation = viewport!.width > viewport!.height ? 'landscape' : 'portrait';

  await expect(page.locator('#orientation')).toHaveText(expectedOrientation);
  await expect(page.locator('#viewport')).toHaveText(`${viewport!.width} × ${viewport!.height}`);
  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, `orientation-${expectedOrientation}`, {
    fullPage: false,
    mask: [page.locator('#field'), page.locator('#fps'), page.locator('#clock')]
  });
  monitor.assertClean();
});

test('launcher remains usable in the project orientation', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  const screenLabEntry = page.locator('.app-entry[data-slug="screen-lab"]');
  await openLibraryPage(page, screenLabEntry);

  await expect(page.locator('#app-search')).toBeVisible();
  await expect(screenLabEntry.locator('.app-entry__select')).toBeVisible();
  await assertNoHorizontalOverflow(page);

  const viewport = page.viewportSize();
  const orientation = viewport && viewport.width > viewport.height ? 'landscape' : 'portrait';
  await attachCriticalScreenshot(page, testInfo, `launcher-${orientation}`, {
    fullPage: false,
    mask: [page.locator('#network-status')]
  });
  monitor.assertClean();
});


test('NATYAZHENIE landscape phone: full game and corner touch pads remain accessible', async ({ page }, info) => {
 const viewport=page.viewportSize()!;
 test.skip(viewport.width<=viewport.height,'Landscape-only regression for a small touch phone');
 for(const device of [{width:844,height:390},{width:667,height:375},{width:932,height:430}]){
  await page.setViewportSize(device);
  await page.goto('/apps/natyazhenie/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#local')).toBeVisible();
  await page.locator('#local').click();
  await expect(page.locator('#book-sheet')).toBeVisible();
  const book=await page.evaluate(()=>{
   const r=(id:string)=>document.getElementById(id)!.getBoundingClientRect();
   const b=r('book-sheet'),content=r('book-copy');
   return {height:b.height,contentTop:content.top,contentBottom:content.bottom};
  });
  expect(book.height,'briefing covers landscape display').toBeGreaterThan(device.height*.87);
  expect(book.contentTop,'briefing rules are visible').toBeGreaterThanOrEqual(0);
  await page.locator('#book-local-0').click();
  await page.locator('#book-local-1').click();
  await expect(page.locator('#book-sheet')).toBeHidden();
  // The full-height canvas stays interactive, while only the four corner
  // controls can intercept finger taps.
  const geometry=await page.evaluate(()=>{
   const rect=(selector:string)=>{
    const el=document.querySelector(selector)!;const r=el.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};
   };
   const canvas=rect('.game .viewport canvas'),header=rect('.game .game-bar'),
    control=rect('.game .controls'),help=document.querySelector('#pc-help')!;
   const keys=[...document.querySelectorAll<HTMLButtonElement>('.game .controls [data-key]')].map(el=>{
    const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    return {key:el.dataset.key,left:r.left,right:r.right,bottom:r.bottom,hit:document.elementFromPoint(x,y)===el};
   });
   return {canvas,header,control,helpVisible:getComputedStyle(help).display!=='none',
    keys,centerHit:document.elementFromPoint(innerWidth*.5,innerHeight*.68)?.tagName,
    gameplay:document.querySelector('#game')?.getBoundingClientRect().height};
  });
  expect(geometry.helpVisible,'computer shortcut text never appears on touch devices').toBeFalsy();
  expect(geometry.canvas.height,'playfield must have at least 94% of phone height').toBeGreaterThan(device.height*.94);
  expect(geometry.canvas.width,'playfield spans screen').toBeGreaterThan(device.width*.97);
  expect(geometry.header.height,'top status bar stays compact').toBeLessThan(device.height*.17);
  expect(geometry.control.height,'touch controls must not form a huge footer').toBeLessThan(device.height*.27);
  expect(geometry.centerHit,'center of playfield must remain a real canvas').toBe('CANVAS');
  expect(geometry.keys).toHaveLength(4);
  for(const key of geometry.keys){
   expect(key.hit,'touch key '+key.key+' is tappable').toBeTruthy();
   expect(key.bottom,'touch key '+key.key+' in safe bounds').toBeLessThanOrEqual(device.height+1);
  }
  expect(geometry.gameplay).toBeGreaterThan(device.height*.93);
  await attachCriticalScreenshot(page,info,'natyazhenie-landscape-'+device.width+'x'+device.height);
 }
});
