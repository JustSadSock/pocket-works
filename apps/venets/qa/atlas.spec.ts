import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

const PATH='/apps/venets/index.html';
const snap=async(page,testInfo,state)=>{
  if(!process.env.PW_QA_OUTPUT_DIR)return;
  mkdirSync(process.env.PW_QA_OUTPUT_DIR,{recursive:true});
  await page.screenshot({path:join(process.env.PW_QA_OUTPUT_DIR,
    'living-atlas-'+testInfo.project.name+'-'+state+'.png'),fullPage:false});
};
test('the map renders 12 real counties with live owners, heraldry and focus',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(PATH);
  await page.locator('#begin').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await page.locator('[data-panel="lands"]').click();
  await expect(page.locator('#panel-lands')).toBeVisible();
  const map=page.locator('.living-atlas');
  await expect(map).toBeVisible();
  await expect(page.locator('.atlas-county')).toHaveCount(12);
  await expect(page.locator('.atlas-county.is-selected')).toHaveCount(1);
  await expect(page.locator('.atlas-county[data-province="pr-01"]')).toHaveAttribute('aria-label',/Графство Берег/);
  await snap(page,testInfo,'atlas');
  await page.locator('.atlas-county[data-province="pr-05"]').click();
  await expect(page.locator('.atlas-county[data-province="pr-05"]')).toHaveClass(/is-selected/);
  await expect(page.locator('#province-info')).toContainText('Чернолесье');
  await page.locator('[data-atlas-view="family"]').click();
  await expect(page.locator('#genealogy-tree')).toBeVisible();
  await expect(page.locator('#genealogy-tree .kin-generation')).toHaveCount(3);
  await expect(page.locator('#genealogy-tree .kin-node')).not.toHaveCount(0);
  await snap(page,testInfo,'family');
  await page.locator('[data-atlas-view="atlas"]').click();
  await expect(map).toBeVisible();
  await page.locator('[data-panel="council"]').click();
  await page.locator('#next-year').click();
  await expect(page.locator('#year-count')).toHaveText('1067');
  await page.locator('[data-panel="lands"]').click();
  await expect(page.locator('.atlas-county')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('320px viewport remains usable without page scrolling or obscured timeline',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto(PATH);
  await expect(page.locator('#begin')).toBeVisible();
  await page.locator('#begin').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await page.locator('[data-panel="lands"]').click();
  await expect(page.locator('.living-atlas')).toBeVisible();
  await expect(page.locator('#next-year')).toBeVisible();
  const result=await page.evaluate(()=>{
    const body=document.body,root=document.querySelector('.app-shell');
    const panel=document.querySelector('#panel-lands');
    const canvas=document.querySelector('.atlas-canvas');
    return {pageWidth:document.documentElement.scrollWidth,screenWidth:innerWidth,
      pageHeight:document.documentElement.scrollHeight,screenHeight:innerHeight,
      atlasHeight:canvas.getBoundingClientRect().height,
      atlasWidth:canvas.getBoundingClientRect().width,
      panelHeight:panel.getBoundingClientRect().height};
  });
  expect(result.pageWidth).toBeLessThanOrEqual(result.screenWidth+2);
  expect(result.pageHeight).toBeLessThanOrEqual(result.screenHeight+3);
  expect(result.atlasHeight).toBeGreaterThan(70);
  expect(result.atlasWidth).toBeGreaterThan(100);
  await snap(page,testInfo,'small-phone');
});
