import {test,expect} from '@playwright/test';
const preview=id=>'/apps/chyepukha/index.html?chyepukha-preview='+id;

test('editor events animate once and use a visible seal before waiting',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('writing-first'));
 await expect(page.locator('#scene')).not.toHaveAttribute('data-motion');
 await page.locator('#answer').fill('Архіваріус випадково загубив червоний блокнот у старому музеї');
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('#scene')).toHaveAttribute('data-motion','proof');
 await expect(page.locator('.writer-selection')).toBeVisible();
 const proofName=await page.locator('.selection-paper').evaluate(el=>getComputedStyle(el).animationName);
 expect(proofName).toContain('chy-copy-arrive');
 for(const index of [0,2,4])await page.locator('.word').nth(index).click();
 await expect(page.locator('.selection-stage.is-complete')).toBeVisible();
 await page.locator('[data-act=back-to-draft]').click();
 await expect(page.locator('#scene')).toHaveAttribute('data-motion','rewrite');
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('#scene')).toHaveAttribute('data-motion','proof');
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('#scene')).toHaveAttribute('data-motion','seal');
 await expect(page.locator('.wax')).toBeVisible();
 await expect(page.locator('.wax')).toHaveCSS('animation-name','chy-stamp-hit');
});

test('reduced motion removes animated paper, seals and word selection',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(preview('writing-first'));
 await page.locator('#answer').fill('Архіваріус залишив жовту валізу біля старої школи');
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.writer-selection')).toBeVisible();
 await expect(page.locator('.selection-paper')).toHaveCSS('animation-name','none');
 await page.locator('.word').first().click();
 await expect(page.locator('.word.selected')).toHaveCSS('animation-name','none');
 for(const index of [1,2])await page.locator('.word').nth(index).click();
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.wax')).toHaveCSS('animation-name','none');
});

test('mobile keyboard-open layout keeps send button reachable and text editable',async({page})=>{
 await page.setViewportSize({width:390,height:620});
 await page.goto(preview('writing-first'));
 await page.evaluate(()=>{
  document.documentElement.style.setProperty('--app-viewport-height','390px');
  document.documentElement.classList.add('is-app-keyboard-open');
 });
 await expect(page.locator('#answer')).toBeVisible();
 await page.locator('#answer').fill('Старий фокусник загубив капелюх на міському вокзалі');
 const b=await page.locator('.editor-primary').evaluate(el=>el.getBoundingClientRect());
 expect(b.bottom).toBeLessThanOrEqual(393);
 expect(b.right).toBeLessThanOrEqual(392);
 expect(b.height).toBeGreaterThanOrEqual(34);
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.writer-selection')).toBeVisible();
 const r=await page.locator('.editor-primary').evaluate(el=>el.getBoundingClientRect());
 expect(r.bottom).toBeLessThanOrEqual(393);
});
