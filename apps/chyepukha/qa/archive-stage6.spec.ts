import {test,expect} from '@playwright/test';
const url='/apps/chyepukha/index.html?chyepukha-preview=archive';
const issue=(id:string,savedAt:number)=>({id,savedAt,playerCount:2,stories:[{
 id:'sheet-0',starter:'Орися',genre:'Абсурдна комедія',setLabel:'Ланцюг провалів',
 fragments:[{author:'Орися',question:'Що почалося?',answer:'Кумедний архіваріус загубив коштовний годинник'},
 {author:'Тарас',question:'Чим завершилося?',answer:'Годинник оголосили новим губернатором міста'}]
}]});
const backup=(id:string)=>({format:'pocketworks-chyepukha-archive',version:1,createdAt:123456,
 editions:[issue(id,1790000000000)]});

test('archived manuscript opens as paper pages, can return to full text and navigates issues',async({page})=>{
 await page.goto(url);
 await expect(page.locator('.archive-manuscript .page-reveal')).toHaveCount(1);
 await expect(page.locator('.archive-manuscript .page-progress')).toContainText('АРКУШ 01 / 03');
 await expect(page.locator('.archive-manuscript .page-manuscript')).toContainText('Архіваріус вирішив');
 await expect(page.locator('.archive-manuscript .page-manuscript')).not.toContainText('Дощ украв');
 await page.locator('[data-act="archive-next-part"]').click();
 await expect(page.locator('.archive-manuscript .page-progress')).toContainText('АРКУШ 02 / 03');
 await expect(page.locator('.archive-manuscript .page-manuscript')).toContainText('Дощ украв');
 await page.locator('[data-act="archive-full"]').click();
 await expect(page.locator('.archive-story-prose')).toContainText('Архіваріус вирішив');
 await expect(page.locator('.archive-story-prose')).toContainText('Дощ украв');
 await page.locator('[data-act="archive-pages"]').click();
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 02 / 03');
 await page.locator('.archive-tab').nth(1).click();
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 01 / 03');
 await page.locator('.archive-tab').first().click();
 await page.locator('[data-act="archive-next-part"]').click();
 await page.locator('[data-act="archive-next-part"]').click();
 await page.locator('[data-act="archive-next-story"]').click();
 await expect(page.locator('.archive-manuscript h3').first()).toContainText('Назар');
});

test('search matches full manuscript content, preserves typing focus, and can be cleared',async({page})=>{
 await page.goto(url);
 const search=page.locator('#archiveSearch');
 await search.fill('невидима коза');
 await expect(search).toHaveValue('невидима коза');
 await expect(search).toBeFocused();
 await expect(page.locator('.archive-tab')).toHaveCount(1);
 await expect(page.locator('.archive-manuscript h3').first()).toContainText('Назар');
 await search.fill('невідоме зовсім');
 await expect(page.locator('.archive-no-match')).toBeVisible();
 await expect(page.locator('#archiveSearch')).toBeFocused();
 await page.locator('[data-act="archive-clear-search"]').click();
 await expect(page.locator('.archive-manuscript')).toBeVisible();
 await expect(page.locator('.archive-tab')).toHaveCount(4);
});

test('pinning and unpinning an issue immediately updates shelf without losing reading position',async({page})=>{
 await page.goto(url);
 await page.locator('[data-act="archive-next-part"]').click();
 const pin=page.locator('.archive-pin').first();
 await expect(pin).toHaveAttribute('aria-pressed','false');
 await pin.click();
 await expect(page.locator('.archive-pin').first()).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 02 / 03');
 await page.locator('.archive-pin').first().click();
 await expect(page.locator('.archive-pin').first()).toHaveAttribute('aria-pressed','false');
});

test('archive is exported in portable JSON and imported without duplicates',async({page})=>{
 await page.goto(url);
 const downloadEvent=page.waitForEvent('download');
 await page.locator('[data-act="archive-export"]').click();
 const download=await downloadEvent;
 expect(download.suggestedFilename()).toMatch(/^chepukha-archive-\d{4}-\d{2}-\d{2}\.json$/);
 const selectFile=async(text:string)=>{
  const chooserEvent=page.waitForEvent('filechooser');
  await page.locator('[data-act="archive-import"]').click();
  const chooser=await chooserEvent;
  await chooser.setFiles({name:'archive.json',mimeType:'application/json',buffer:Buffer.from(text)});
 };
 await selectFile(JSON.stringify(backup('restored-issue')));
 await expect(page.locator('.archive-shelf-item')).toHaveCount(2);
 await expect(page.locator('#toast')).toContainText('Відновлено 1 випусків');
 await selectFile(JSON.stringify(backup('restored-issue')));
 await expect(page.locator('.archive-shelf-item')).toHaveCount(2);
 await expect(page.locator('#toast')).toContainText('немає нових');
});

test('invalid backup does not replace saved manuscripts',async({page})=>{
 await page.goto(url);
 const chooserEvent=page.waitForEvent('filechooser');
 await page.locator('[data-act="archive-import"]').click();
 const chooser=await chooserEvent;
 await chooser.setFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('{"bad":true}')});
 await expect(page.locator('#toast')).toContainText('не резервна копія');
 await expect(page.locator('.archive-shelf-item')).toHaveCount(1);
 await expect(page.locator('.archive-manuscript')).toBeVisible();
});

for(const [size,width,height] of [['phone',390,844],['narrow',320,568],['landscape',844,390]] as const){
 test('archive is usable without horizontal clipping on '+size,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(url);
  await expect(page.locator('#archiveSearch')).toBeVisible();
  await expect(page.locator('[data-act="archive-import"]')).toBeVisible();
  await expect(page.locator('.archive-reader-scroll')).toBeVisible();
  const metrics=await page.evaluate(()=>{
   const r=document.querySelector('.archive-reader-scroll')!.getBoundingClientRect();
   const x=document.querySelector('.archive-actions')!.getBoundingClientRect();
   const shelf=document.querySelector('.archive-editions')!.getBoundingClientRect();
   return {height:r.height,shelf:shelf.height,bottom:x.bottom,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  expect(metrics.height).toBeGreaterThan(28);
  expect(metrics.shelf).toBeGreaterThan(30);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport+3);
  expect(metrics.bottom).toBeLessThanOrEqual(height+5);
  await page.locator('[data-act="archive-next-part"]').click();
  await expect(page.locator('.page-progress')).toContainText('АРКУШ 02');
 });
}
