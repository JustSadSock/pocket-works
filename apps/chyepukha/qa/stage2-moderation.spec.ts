import {test,expect} from '@playwright/test';

const preview=(screen:string)=>'/apps/chyepukha/index.html?chyepukha-preview='+screen;

test('an offline host opens a countdown rather than a premature election',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('moderation-recovery-wait'));
 await expect(page.locator('[data-recovery-countdown]')).toContainText('До виборів нового ведучого');
 await expect(page.locator('[data-recovery-candidate]')).toHaveCount(3);
 await expect(page.locator('[data-recovery-candidate]:not([disabled])')).toHaveCount(0);
});

test('one online player may vote themselves in as host after five minutes',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('moderation-solo'));
 await expect(page.locator('[data-recovery-countdown]')).toContainText('1 голос');
 const vote=page.locator('[data-act="vote-host"][data-id="qa-third"]');
 await expect(vote).toBeEnabled();
 await vote.click();
 await expect(page.locator('.moderation-sheet h3')).toContainText('Керування авторами');
 await expect(page.locator('[data-recovery-countdown]')).toHaveCount(0);
});

test('after a kick the curator chooses replacement, skip or later',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('moderation-kicked'));
 await expect(page.locator('[aria-label="Доля місця автора"]')).toBeVisible();
 await expect(page.locator('[data-act="choice-replace"]')).toBeVisible();
 await expect(page.locator('[data-act="choice-skip"]')).toBeVisible();
 await page.locator('[data-act="choice-replace"]').click();
 await expect(page.locator('.moderation-ticket')).toContainText('DEMO12345678');
 await page.goto(preview('moderation-kicked'));
 await page.locator('[data-act="choice-skip"]').click();
 await expect(page.locator('[data-act="confirm-skip"]')).toBeVisible();
 await page.locator('[data-act="confirm-skip"]').click();
 await expect(page.locator('.moderation-sheet')).toBeVisible();
});

test('transferring the host role requires a separate confirmation',async({page})=>{
 await page.goto(preview('moderation-v7'));
 await page.locator('[data-act="ask-transfer-host"]').first().click();
 await expect(page.locator('[aria-label="Передача повноважень"]')).toBeVisible();
 await page.locator('[data-act="confirm-transfer-host"]').click();
 await expect(page.locator('.moderation-sheet')).toHaveCount(0);
 await expect(page.locator('[data-act="manage-players"]')).toBeVisible();
});
