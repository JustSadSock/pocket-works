import {expect,test} from '@playwright/test';
import {attachCriticalScreenshot,monitorUnexpectedBrowserOutput} from './helpers';

test.describe('CANTICA III illuminated manuscript',()=>{
  test('portrait book, folio flip, puzzle return and persistence',async({page},info)=>{
    test.skip(info.project.name.includes('landscape'),'Codex designed for portrait phones');
    const monitor=monitorUnexpectedBrowserOutput(page);
    await page.goto('/apps/cantica-glass/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#glass')).toBeVisible();
    await expect(page.locator('#levelName')).toContainText(/\S+/);
    const intro=page.locator('.window-stage');
    expect((await intro.boundingBox())?.height).toBeGreaterThan(180);
    await attachCriticalScreenshot(page,info,'cantica-01-playfield',{fullPage:false});

    await page.locator('#chaptersBtn').click();
    await expect(page.locator('#manuscript')).toBeVisible();
    await expect(page.locator('.volume-entry')).toHaveCount(10);
    await expect(page.locator('.volume-entry').first()).toBeEnabled();
    await expect(page.locator('.volume-entry').nth(1)).toBeDisabled();
    await expect(page.locator('#codexTitle')).toHaveText('Книга света');
    await page.waitForTimeout(480);
    await attachCriticalScreenshot(page,info,'cantica-02-library',{fullPage:false});

    await page.locator('.volume-entry').first().click();
    await expect(page.locator('.fenestra')).toHaveCount(25);
    await expect(page.locator('.fenestra').first()).toBeEnabled();
    await expect(page.locator('.fenestra').nth(1)).toBeDisabled();
    await expect(page.locator('#codexTitle')).toHaveText('Пробуждение');
    await page.waitForTimeout(330);
    await attachCriticalScreenshot(page,info,'cantica-03-folio-first',{fullPage:false});

    await page.locator('#codexNext').click();
    await expect(page.locator('.fenestra').first()).toHaveAttribute('aria-label',/Окно 26/);
    await expect(page.locator('#codexPrev')).toBeEnabled();
    await page.waitForTimeout(340);
    await attachCriticalScreenshot(page,info,'cantica-04-folio-second',{fullPage:false});

    await page.locator('#codexPrev').click();
    await expect(page.locator('.fenestra').first()).toHaveAttribute('aria-label',/Окно 1/);
    await page.locator('.fenestra').first().click();
    await expect(page.locator('#manuscript')).toBeHidden();
    await expect(page.locator('#glass')).toBeVisible();
    await page.locator('#hintBtn').click();
    await expect(page.locator('#status')).toContainText('Строка');

    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('#glass')).toBeVisible();
    await page.locator('#chaptersBtn').click();
    await expect(page.locator('.volume-entry')).toHaveCount(10);
    await page.locator('#codexClose').click();
    await expect(page.locator('#manuscript')).toBeHidden();
    monitor.assertNoUnexpectedBrowserOutput();
  });
});
