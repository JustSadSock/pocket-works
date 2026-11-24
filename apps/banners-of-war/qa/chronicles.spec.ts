import {test,expect} from '@playwright/test';
test('Chronicles atlas, historical side selection and save/resume',async({page})=>{
 await page.goto('/apps/banners-of-war/');await page.locator('#chronicles').click();await expect(page.locator('#chronicle-detail svg')).toBeVisible();await page.locator('#chronicle-id').selectOption('agincourt');await page.locator('#chronicle-side').selectOption('1');await page.locator('#chronicle-launch').click();await expect(page.locator('#map')).toBeVisible();await expect(page.locator('#blue')).toContainText('Франция');await page.reload();await page.locator('#resume').click();await expect(page.locator('#blue')).toContainText('Франция');
});
