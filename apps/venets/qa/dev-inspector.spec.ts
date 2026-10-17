import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

const ENTRY='/apps/venets/index.html';
const screenshot=async(page,testInfo,name)=>{
  if(!process.env.PW_QA_OUTPUT_DIR)return;
  mkdirSync(process.env.PW_QA_OUTPUT_DIR,{recursive:true});
  await page.screenshot({path:join(process.env.PW_QA_OUTPUT_DIR,
    'inspector-'+testInfo.project.name+'-'+name+'.png'),fullPage:false});
};
const savedCampaign=async(page)=>page.evaluate(async()=>{
  return await new Promise((resolve,reject)=>{
    const open=indexedDB.open('venets-campaigns',1);
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,req=db.transaction('saves','readonly').objectStore('saves').get('active');
      req.onsuccess=()=>{resolve(req.result??null);db.close()};
      req.onerror=()=>{reject(req.error);db.close()};
    };
  });
});

test('Backquote opens a compact top-left inspector and switches actual previews',async({page},testInfo)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(ENTRY);
  await expect(page.locator('#begin')).toBeVisible();
  await page.keyboard.press('Backquote');
  const overlay=page.locator('.venets-dev-inspector');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.venets-dev-list [data-inspector-screen]')).toHaveCount(13);
  await expect(overlay.locator('.venets-dev-frame')).toHaveAttribute('title',/Совет/);
  const frame=page.frameLocator('.venets-dev-frame');
  await expect(frame.locator('#game-screen')).toBeVisible();
  await expect(frame.locator('#year-count')).toHaveText('1066');
  await screenshot(page,testInfo,'phone-council');

  await overlay.locator('[data-inspector-device="desktop"]').click();
  await expect(overlay.locator('[data-inspector-size]')).toContainText('1366 × 768');
  await screenshot(page,testInfo,'desktop-council');
  await overlay.locator('[data-inspector-device="phone"]').click();
  await expect(overlay.locator('[data-inspector-size]')).toContainText('390 × 844');

  const states=[
    ['menu','#menu-screen'],
    ['menu-resume','#resume'],
    ['lands','#panel-lands'],
    ['history','#panel-history'],
    ['confirm','#confirm-dialog'],
    ['decision','#last-action'],
    ['notice','#notice'],
    ['restart','#new-dialog'],
    ['invalid-seed','#menu-screen'],
    ['ending','#ending-screen'],
    ['docs','#docs-screen'],
    ['loading','#loading-screen']
  ];
  for(const [id,selector] of states){
    await overlay.locator('[data-inspector-screen="'+id+'"]').click();
    await expect(frame.locator(selector),'Failed inspector state '+id).toBeVisible();
    if(id==='invalid-seed')await expect(frame.locator('#begin')).toBeDisabled();
    if(id==='decision')await expect(frame.locator('#last-action')).toContainText(/Прошение|Решение/);
    if(id==='ending')await screenshot(page,testInfo,'ending');
    if(id==='confirm')await screenshot(page,testInfo,'confirm');
  }
  expect(errors).toEqual([]);
  await page.keyboard.press('Backquote');
  await expect(overlay).toHaveCount(0);
});

test('previewed outcomes never change the real campaign or saved data',async({page},testInfo)=>{
  await page.goto(ENTRY);
  await page.locator('#begin').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  const savedBefore=await savedCampaign(page).then(x=>x??'').catch(()=>null);
  const year=await page.locator('#year-count').textContent();
  const name=await page.locator('#ruler-name').textContent();

  await page.keyboard.press('Backquote');
  const overlay=page.locator('.venets-dev-inspector');
  const frame=page.frameLocator('.venets-dev-frame');
  await overlay.locator('[data-inspector-screen="decision"]').click();
  await expect(frame.locator('#last-action')).toBeVisible();
  await overlay.locator('[data-inspector-screen="ending"]').click();
  await expect(frame.locator('#ending-screen')).toBeVisible();
  await overlay.locator('[data-inspector-screen="confirm"]').click();
  await expect(frame.locator('#confirm-dialog')).toBeVisible();

  // Press Backquote inside the child frame: the parent inspector must close.
  await frame.locator('#confirm-cancel').focus();
  await page.keyboard.press('Backquote');
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#year-count')).toHaveText(year);
  await expect(page.locator('#ruler-name')).toHaveText(name);
  if(savedBefore!==null&&savedBefore!==''){
    const savedAfter=await savedCampaign(page);
    expect(savedAfter).toBe(savedBefore);
  }
  await screenshot(page,testInfo,'saved-original-unchanged');
});
