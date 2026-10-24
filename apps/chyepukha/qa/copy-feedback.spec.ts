import {test,expect} from '@playwright/test';

test('clipboard denial is not shown as successful manuscript copying',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Permission denied'))}});
  document.execCommand=()=>false;
 });
 await page.goto('/apps/chyepukha/index.html?chyepukha-preview=results');
 await expect(page.locator('[data-act=copy-story]')).toBeVisible();
 await page.locator('[data-act=copy-story]').click();
 await expect(page.locator('#toast')).toContainText('Копіювання недоступне.');
});

test('legacy clipboard fallback reports success only when the browser confirms it',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Permission denied'))}});
  document.execCommand=()=>true;
 });
 await page.goto('/apps/chyepukha/index.html?chyepukha-preview=results');
 await page.locator('[data-act=copy-story]').click();
 await expect(page.locator('#toast')).toContainText('Скопійовано.');
});
