import {expect,test,type Page,type TestInfo} from '@playwright/test';
import {assertNoHorizontalOverflow,attachCriticalScreenshot} from './helpers';

async function boot(page:Page){
  await page.addInitScript(()=>{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:String(input),location.href);
      const data=url.pathname==='/pocket-id/me'?{user:null}:
        url.pathname==='/pocket-id/config'?{googleEnabled:false,avatars:[]}:
        url.pathname==='/pocket-social/me'?{profile:null}:
        url.pathname==='/pocket-id/global-archive'?{archived:['screen-lab'],pinned:['zamazka','komnatka'],canManage:false}:null;
      return data?Promise.resolve(new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})):original(input,init);
    };
  });
  await page.goto('/',{waitUntil:'networkidle'});
  await expect(page.locator('.deck-focus__play').first()).toBeVisible();
}
async function shot(page:Page,info:TestInfo,name:string){
  await assertNoHorizontalOverflow(page);
  const overflow=await page.locator('dialog[open]').evaluateAll(dialogs=>dialogs.map(d=>d.scrollWidth-d.clientWidth));
  expect(overflow.every(delta=>delta<=1),'dialog contents fit their width').toBe(true);
  await attachCriticalScreenshot(page,info,name,{fullPage:false});
}

test('catalog identity and the full menu journey remain readable at every viewport',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await boot(page);
  await expect(page.locator('.deck-focus__hero-label>span').first()).toHaveText('Попробовать');
  await shot(page,info,'01-home');
  await page.locator('#deck-bottom-nav [data-deck-view=library]').click();
  await expect(page.locator('#detail-panel')).toBeHidden();
  await expect(page.locator('#app-list .deck-cover-photo')).toHaveCount(0);
  const cabinet=page.locator('.app-entry[data-slug=art-cabinet]');
  await expect(cabinet.locator('.app-preview')).toHaveClass(/has-app-icon/);
  await expect.poll(()=>cabinet.locator('.app-preview').evaluate(e=>(e as HTMLElement).style.getPropertyValue('--app-icon-image'))).toContain('shared/catalog-art/art-cabinet.svg');
  await shot(page,info,'02-catalog');
  await cabinet.locator('.app-entry__more').click();
  await expect(page.locator('#detail-name')).toHaveText('КАРТОТЕКА');
  await expect(page.locator('#detail-screenshot')).toBeVisible();
  await shot(page,info,'03-detail');
  await page.locator('#detail-screenshot').click();
  await expect(page.locator('#catalog-lightbox')).toBeVisible();
  expect(await page.locator('#catalog-lightbox-image').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await shot(page,info,'04-screenshot');
  await page.locator('#catalog-lightbox-close').click();
  await page.locator('#detail-close').click();
  await expect(page.locator('#detail-panel')).toBeHidden();
  await page.locator('[data-deck-tools]').click();
  await shot(page,info,'05-settings');
  await page.locator('.shelf-tools__advanced>summary').click();
  await expect(page.locator('#tools-facts')).toContainText('Версия оболочки');
  await shot(page,info,'06-diagnostics');
  await page.locator('#tools-close').click();
  await page.locator('#deck-organize-start').click();
  await page.locator('#deck-batch-grid [data-batch-slug=art-cabinet]').click();
  await expect(page.locator('#deck-batch-count')).toHaveText('1 выбрано');
  await expect(page.locator('#deck-batch-scope-label')).toBeHidden();
  await shot(page,info,'07-selection');
  await page.locator('#deck-batch-close').click();
  await page.locator('#deck-bottom-nav [data-deck-view=home]').click();
  await page.locator('#deck-customize').click();
  await expect(page.locator('#deck-editor-preview span')).toHaveCount(3);
  await shot(page,info,'08-editor');
  await page.locator('[data-deck-size=continue][data-size-value=half]').click();
  await expect(page.locator('#deck-editor-preview span').first()).toHaveAttribute('data-size','half');
  await page.locator('#deck-editor-cancel').click();
  await page.locator('.pw-confirm [data-choice=discard]').click();
  await page.locator('#pocket-id-trigger').click();
  await expect(page.locator('#pocket-id-dialog')).toBeVisible();
  await shot(page,info,'09-pocket-id');
  await page.locator('#pocket-id-close').click();
  expect(errors).toEqual([]);
});

test('small icons keep a reachable details control and archive never retains an unrelated detail',async({page})=>{
  await boot(page);
  await page.locator('#deck-bottom-nav [data-deck-view=library]').click();
  await page.locator('[data-deck-density=micro]').click();
  const more=page.locator('.app-entry').first().locator('.app-entry__more');
  await expect(more).toBeVisible();
  const rect=await more.boundingBox();expect(rect!.width).toBeGreaterThanOrEqual(44);expect(rect!.height).toBeGreaterThanOrEqual(44);
  await more.click();
  await page.locator('#detail-close').click();
  await page.locator('#deck-bottom-nav [data-deck-view=archive]').click();
  await expect(page.locator('#detail-panel')).toBeHidden();
  await expect(page.locator('#app-list .app-entry')).toHaveCount(1);
  await expect(page.locator('#app-list .app-entry')).toHaveAttribute('data-slug','screen-lab');
  await page.reload({waitUntil:'networkidle'});
  await expect(page.locator('html')).toHaveAttribute('data-deck-density','micro');
  await expect(page.locator('#deck-view-title')).toHaveText('Архив');
  await assertNoHorizontalOverflow(page);
});

test('launcher opens a real application and returns with recent history intact',async({page})=>{
  await boot(page);
  await page.locator('#deck-bottom-nav [data-deck-view=archive]').click();
  await page.locator('.app-entry[data-slug=screen-lab] .app-entry__select').click();
  await expect(page).toHaveURL(/\/apps\/screen-lab\//);
  await expect(page.locator('body')).toBeVisible();
  await page.goBack({waitUntil:'networkidle'});
  await expect(page.locator('#deck-view-title')).toHaveText('Архив');
  const recent=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-works:shelf:v2')||'{}'));
  expect(JSON.stringify(recent)).toContain('screen-lab');
  await page.locator('#deck-bottom-nav [data-deck-view=home]').click();
  // Globally archived apps stay outside quick play even after a direct launch.
  await expect(page.locator('.deck-focus__play').first()).not.toHaveAttribute('data-deck-open','screen-lab');
});

test('reduced motion preserves navigation without large animated transforms',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});await boot(page);
  await page.locator('#deck-bottom-nav [data-deck-view=library]').click();
  await page.locator('.app-entry').first().locator('.app-entry__more').click();
  const duration=await page.locator('#detail-panel').evaluate(e=>getComputedStyle(e).transitionDuration);
  expect(duration).toBe('0s');
  await shot(page,info,'10-reduced-motion');
});

test('saved widget sizes change the desktop composition rather than only the preview',async({page})=>{
  test.skip((page.viewportSize()?.width||0)<981,'Phone layout adapts every collection to the available width.');
  await boot(page);
  const before=await page.locator('.deck-widget--continue').boundingBox();
  await page.locator('#deck-customize').click();
  await page.locator('[data-deck-size=continue][data-size-value=half]').click();
  await page.locator('#deck-editor-save').click();
  const after=await page.locator('.deck-widget--continue').boundingBox();
  expect(after!.width).toBeLessThan(before!.width/2);
  await page.reload({waitUntil:'networkidle'});
  await expect(page.locator('.deck-widget--continue')).toHaveClass(/deck-widget--half/);
});
