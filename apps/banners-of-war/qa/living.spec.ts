import {test,expect} from '@playwright/test';
test('Living Battlefield: four terrain choices, fog, sector overlays, three camera scales, offline save and replay',async({page,context},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/apps/banners-of-war/');
 await page.locator('#landscape').selectOption('ridge');await page.locator('#visibility').selectOption('fog');await page.locator('#objective').selectOption('territory');await page.locator('#start').click();
 await expect(page.locator('#phase')).toContainText('Развёртывание');await expect(page.locator('#red')).toContainText('в обзоре 0');await page.screenshot({path:info.outputPath('living-strategic.png')});
 await page.locator('#confirm').click();await page.locator('#plus').click();await page.locator('#plus').click();await page.waitForTimeout(180);await page.screenshot({path:info.outputPath('living-tactical.png')});
 await page.locator('#focus').click();await page.waitForTimeout(200);await page.screenshot({path:info.outputPath('living-warriors.png')});
 await page.locator('#layer').selectOption('pressure');await page.locator('#layer').selectOption('contacts');await page.locator('#layer').selectOption('visibility');await page.waitForTimeout(150);await page.screenshot({path:info.outputPath('living-visibility.png')});
 await page.locator('#fit').click();await page.locator('#layer').selectOption('normal');await page.locator('#confirm').click();await page.locator('#confirm').click();await expect(page.locator('#playback')).toBeVisible({timeout:30000});await page.locator('#skip').click();await expect(page.locator('#round')).toContainText('2');
 await page.reload();await expect(page.locator('#resume')).toBeVisible();await page.locator('#resume').click();await expect(page.locator('#round')).toContainText('2');
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:15000});await context.setOffline(true);await page.goto('/apps/banners-of-war/',{waitUntil:'domcontentloaded'});await expect(page.locator('#resume')).toBeVisible();await page.locator('#resume').click();await expect(page.locator('#round')).toContainText('2');await page.locator('#replay').click();await expect(page.locator('#playback')).toBeVisible({timeout:30000});await page.locator('#skip').click();await context.setOffline(false);
 expect(errors).toEqual([]);
});
