import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot, assertNoHorizontalOverflow, monitorUnexpectedBrowserOutput } from './helpers';

async function openDeck(page: import('@playwright/test').Page) {
  // The static preview has no Cloudflare account endpoints. WebKit can send
  // Service Worker-controlled fetches before Playwright's network routes,
  // so intercept only these three bootstrap calls in the document itself.
  await page.addInitScript(()=>{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      const value=typeof input==='string'?input:input instanceof Request?input.url:String(input);
      let pathname='';
      try{pathname=new URL(value,location.href).pathname;}catch{return original(input,init);}
      const response=pathname==='/pocket-id/me'?{user:null}:
        pathname==='/pocket-id/config'?{googleEnabled:false,avatars:[]}:
        pathname==='/pocket-social/me'?{profile:null}:null;
      if(response!==null)return Promise.resolve(new Response(JSON.stringify(response),{
        status:200,headers:{'content-type':'application/json'}
      }));
      return original(input,init);
    };
  });
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await expect(page.locator('html')).toHaveClass(/has-pocket-deck/);
  await expect(page.locator('#deck-bottom-nav')).toBeVisible();
  if((page.viewportSize()?.width||1000)<=980)await expect(page.locator('#deck-focus__featured, .deck-focus__featured').first()).toBeVisible();
  else await expect(page.locator('#deck-widgets .deck-widget').first()).toBeVisible();
}

test('Pocket Deck boots into an authored home and switches to dense library',async({page},info)=>{
  const monitor=monitorUnexpectedBrowserOutput(page);
  const missingResources:string[]=[];
  page.on('response',response=>{
    if(response.status()>=400)missingResources.push(`${response.status()} ${response.url()}`);
  });
  await openDeck(page);
  await expect(page.locator('[data-deck-view="home"]').last()).toHaveAttribute('aria-current','page');
  await expect(page.locator('#deck-home')).toBeVisible();
  if((page.viewportSize()?.width||1000)<=980)await expect(page.locator('#deck-focus .deck-focus__play')).toBeVisible();
  else await expect(page.locator('#deck-widgets .deck-tile').first()).toBeVisible();
  await attachCriticalScreenshot(page,info,'deck-first-frame',{fullPage:false});
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#deck-view-title')).toHaveText('Library');
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  expect(await page.locator('#app-list .app-entry').count()).toBeGreaterThan(30);
  await page.locator('#library-options > summary').click();
  await page.locator('[data-deck-density="micro"]').click();
  await page.locator('#library-options > summary').click();
  await expect(page.locator('html')).toHaveAttribute('data-deck-density','micro');
  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page,info,'deck-contact-sheet',{fullPage:false});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('html')).toHaveAttribute('data-deck-density','micro');
  await expect(page.locator('#deck-view-title')).toHaveText('Library');
  if(missingResources.length)console.log('Pocket Deck missing resources:',missingResources);
  monitor.assertClean();
});

test('widgets can be configured, reordered and saved without losing previous shelf data',async({page},info)=>{
  await openDeck(page);
  await page.locator('#deck-customize').click();
  await expect(page.locator('#deck-editor')).toBeVisible();
  await expect(page.locator('[data-edit-id="continue"]')).toBeVisible();
  await attachCriticalScreenshot(page,info,'deck-widget-editor',{fullPage:false});
  await page.locator('#deck-widget-picker').selectOption('projects');
  await page.locator('#deck-widget-add').click();
  await expect(page.locator('#deck-editor-list .deck-editor-row')).toHaveCount(4);
  const newRow=page.locator('#deck-editor-list .deck-editor-row').last();
  const id=await newRow.getAttribute('data-edit-id');
  expect(id).toMatch(/^projects-/);
  await newRow.locator('[data-deck-size]').click();
  await page.locator('[data-deck-move="'+id+'"][data-dir="-1"]').click();
  await page.locator('#deck-editor-save').click();
  await expect(page.locator('#deck-editor')).not.toBeVisible();
  await expect(page.locator('#deck-widgets .deck-widget')).toHaveCount(4);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#deck-widgets .deck-widget')).toHaveCount(4);
  await expect(page.locator('#deck-widgets .deck-widget').nth(2)).toHaveAttribute('data-widget-id',id);
  await page.locator('#deck-customize').click();
  await page.locator('[data-deck-remove="'+id+'"]').click();
  await page.locator('#deck-editor-cancel').click();
  await expect(page.locator('#deck-widgets .deck-widget')).toHaveCount(4);
});

test('archive is reversible and project development notes persist independently of saved games',async({page},info)=>{
  await openDeck(page);
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  const target=page.locator('#app-list .app-entry').first();
  const slug=await target.getAttribute('data-slug');
  expect(slug).toBeTruthy();
  await target.locator('.app-entry__more').click();
  await page.locator('#detail-extras > summary').click();
  await expect(page.locator('#deck-project-detail')).toBeVisible();
  await page.locator('#deck-project-note').fill('Improve flight feel and landing transitions');
  await page.locator('#deck-project-detail [data-deck-stage="building"]').click();
  await expect(page.locator('#deck-project-note')).toHaveValue('Improve flight feel and landing transitions');
  await page.locator('#deck-project-note').scrollIntoViewIfNeeded();
  await attachCriticalScreenshot(page,info,'deck-note-after-stage-change',{fullPage:false});
  await page.locator('#deck-note-save').click();
  await expect(page.locator('#deck-note-feedback')).toContainText('Saved');
  await page.locator('#deck-project-detail [data-deck-stage="archive"]').click();
  await page.locator('#detail-close').click();
  await page.locator('#deck-bottom-nav [data-deck-view="archive"]').click();
  await expect(page.locator('#deck-view-title')).toHaveText('Archive');
  const archived=page.locator('.app-entry[data-slug="'+slug+'"]');
  await expect(archived).toBeVisible();
  await archived.locator('.app-entry__more').click();
  await page.locator('#detail-extras > summary').click();
  await expect(page.locator('#deck-project-note')).toHaveValue('Improve flight feel and landing transitions');
  await page.locator('#deck-project-detail [data-deck-stage="trial"]').click();
  await page.locator('#detail-close').click();
  await expect(archived).toHaveCount(0);
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('.app-entry[data-slug="'+slug+'"]')).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.app-entry[data-slug="'+slug+'"]')).toBeVisible();
});

test('one-hand customization and search preserve mobile navigation',async({page})=>{
  await openDeck(page);
  // Hold a non-interactive portion of the home to enter edit mode.
  const heading=page.locator('.deck-home__intro h2');
  const bounds=await heading.boundingBox();
  expect(bounds).toBeTruthy();
  await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+bounds!.height/2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.locator('#deck-editor')).toBeVisible();
  await page.locator('#deck-editor-cancel').click();
  await page.locator('#deck-search-action').click();
  await expect(page.locator('#app-search')).toBeFocused();
  await page.locator('#app-search').fill('screen lab');
  await expect(page.locator('#app-list .app-entry')).toHaveCount(1);
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test('bulk organization selects unkept projects and archives only after confirmation',async({page})=>{
  await openDeck(page);
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await page.locator('#library-options > summary').click();
  await expect(page.locator('#deck-organize-start')).toBeVisible();
  await page.locator('#deck-organize-start').click();
  const bar=page.locator('#deck-organize-bar');
  await expect(bar).toBeVisible();
  const cards=page.locator('#app-list .app-entry');
  await expect(cards.first()).toBeVisible();
  const first=await cards.first().getAttribute('data-slug');
  const second=await cards.nth(1).getAttribute('data-slug');
  expect(first).toBeTruthy();expect(second).toBeTruthy();
  await cards.first().locator('.app-entry__select').click();
  await cards.nth(1).locator('.app-entry__select').click();
  await expect(page.locator('#deck-organize-count')).toHaveText('2 selected');
  await page.locator('[data-deck-organize-archive]').click();
  await expect(page.locator('#deck-archive-confirm')).toBeVisible();
  await page.locator('#deck-archive-cancel').click();
  await expect(page.locator('.app-entry[data-slug="'+first+'"]')).toBeVisible();
  await page.locator('[data-deck-organize-archive]').click();
  await page.locator('#deck-archive-accept').click();
  await expect(page.locator('#deck-organize-bar')).toBeHidden();
  await expect(page.locator('.app-entry[data-slug="'+first+'"]')).toHaveCount(0);
  await expect(page.locator('.app-entry[data-slug="'+second+'"]')).toHaveCount(0);
  await page.locator('#deck-bottom-nav [data-deck-view="archive"]').click();
  await expect(page.locator('.app-entry[data-slug="'+first+'"]')).toBeVisible();
  await expect(page.locator('.app-entry[data-slug="'+second+'"]')).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.app-entry[data-slug="'+first+'"]')).toBeVisible();
  // Reloading turns this into a returning-user visit: acknowledge the current
  // shell's release receipt before interacting with the underlying project.
  await expect(page.locator('[data-digest-close]')).toBeVisible();
  await page.locator('[data-digest-close]').click();
  await page.locator('.app-entry[data-slug="'+first+'"] .app-entry__more').click();
  await page.locator('#detail-extras > summary').click();
  await page.locator('[data-deck-stage="trial"]').click();
  await page.locator('#detail-close').click();
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('.app-entry[data-slug="'+first+'"]')).toBeVisible();
});

test('cancelled widget drag preserves its position',async({page})=>{
  await openDeck(page);
  await page.locator('#deck-customize').click();
  const rows=page.locator('#deck-editor-list .deck-editor-row');
  const order=await rows.evaluateAll(items=>items.map(item=>item.getAttribute('data-edit-id')));
  const handle=rows.first().locator('[data-deck-drag]');
  const box=await handle.boundingBox();
  const target=await rows.nth(1).boundingBox();
  expect(box).toBeTruthy();expect(target).toBeTruthy();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.down();
  await page.mouse.move(box!.x+box!.width/2,target!.y+target!.height/2);
  await handle.dispatchEvent('pointercancel',{pointerId:1,clientY:target!.y+target!.height/2});
  await page.mouse.up();
  await expect(rows.first()).not.toHaveClass(/is-dragging/);
  expect(await rows.evaluateAll(items=>items.map(item=>item.getAttribute('data-edit-id')))).toEqual(order);
  await page.locator('#deck-editor-save').click();
  expect(await page.locator('#deck-widgets .deck-widget').evaluateAll(items=>items.map(item=>item.getAttribute('data-widget-id')))).toEqual(order);
});

test('archiving a spotlight removes the project from home widgets',async({page})=>{
  await openDeck(page);
  await page.locator('#deck-customize').click();
  await page.locator('#deck-widget-picker').selectOption('spotlight');
  await page.locator('#deck-widget-add').click();
  const picker=page.locator('[data-deck-widget-slug]').last();
  const slug=await picker.inputValue();
  await page.locator('#deck-editor-save').click();
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await page.locator(`.app-entry[data-slug="${slug}"] .app-entry__more`).click();
  await page.locator('#detail-extras > summary').click();
  await page.locator('[data-deck-stage="archive"]').click();
  await page.locator('#detail-close').click();
  await page.locator('#deck-bottom-nav [data-deck-view="home"]').click();
  await expect(page.locator(`#deck-home [data-deck-open="${slug}"]`)).toHaveCount(0);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator(`#deck-home [data-deck-open="${slug}"]`)).toHaveCount(0);
});

test('saved layout and launcher navigation remain available offline',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','Offline Service Worker navigation is covered in Chromium, as in service-worker.spec.ts; Playwright WebKit reports an internal navigation error in offline mode.');
  await openDeck(page);
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>
      navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
  });
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await page.locator('#library-options > summary').click();
  await page.locator('[data-deck-density="micro"]').click();
  await page.locator('#library-options > summary').click();
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#deck-view-title')).toHaveText('Library');
  await expect(page.locator('html')).toHaveAttribute('data-deck-density','micro');
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  await page.locator('#deck-bottom-nav [data-deck-view="home"]').click();
  await expect(page.locator('#deck-home')).toBeVisible();
  await context.setOffline(false);
});


test('focus-first library shows actions on demand without losing advanced filters',async({page})=>{
  await openDeck(page);
  await expect(page.locator('.deck-home__intro h2')).toHaveText('Pick a game.');
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#library-options')).not.toHaveAttribute('open');
  await expect(page.locator('#update-installed-button')).toBeHidden();
  await page.locator('#library-options > summary').click();
  await expect(page.locator('#update-installed-button')).toBeVisible();
  await page.locator('#library-options [data-filter="offline"]').click();
  await expect(page.locator('#library-options')).not.toHaveAttribute('open');
  await expect(page.locator('#library-options-label')).toHaveText('Offline');
  await page.locator('[data-filter="all"]').click();
  await expect(page.locator('#library-options-label')).toHaveText('More');
  await page.locator('#app-list .app-entry').first().locator('.app-entry__more').click();
  await expect(page.locator('#detail-open')).toBeVisible();
  await expect(page.locator('#detail-changelog')).toBeHidden();
  await page.locator('#detail-extras > summary').click();
  await expect(page.locator('#detail-changelog')).toBeVisible();
});

test('phone home fits the viewport and keeps account and secondary widgets reachable',async({page})=>{
  await openDeck(page);
  if((page.viewportSize()?.width||1000)>980)return;
  await expect(page.locator('#deck-account-spotlight')).toBeVisible();
  await expect(page.locator('#deck-focus__featured, .deck-focus__featured').first()).toBeVisible();
  const fits=await page.evaluate(()=>document.documentElement.scrollHeight<=window.innerHeight+3);
  expect(fits).toBe(true);
  await expect(page.locator('#deck-widgets .deck-widget').first()).toBeHidden();
  await page.locator('#deck-widgets-toggle').click();
  await expect(page.locator('#deck-widgets .deck-widget').first()).toBeVisible();
  await page.locator('#deck-widgets-toggle').click();
  await expect(page.locator('#deck-focus .deck-focus__play')).toBeVisible();
});
test('library primary card opens a game while details are separate',async({page})=>{
  await openDeck(page);
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  const first=page.locator('#app-list .app-entry').first();
  await expect(first.locator('.app-entry__select')).toHaveAttribute('data-action','open');
  await expect(first.locator('.app-entry__more')).toHaveAttribute('data-action','details');
  await first.locator('.app-entry__more').click();
  await expect(page.locator('#detail-open')).toBeVisible();
});

test('Home can batch-select any catalogue game, save and archive several at once',async({page},info)=>{
  await openDeck(page);
  await page.locator('#deck-batch-trigger').click();
  const picker=page.locator('#deck-batch-picker');
  await expect(picker).toBeVisible();
  const tiles=page.locator('#deck-batch-grid [data-batch-slug]');
  expect(await tiles.count()).toBeGreaterThan(30);
  const slug1=await tiles.first().getAttribute('data-batch-slug');
  const slug2=await tiles.nth(1).getAttribute('data-batch-slug');
  expect(slug1).toBeTruthy();expect(slug2).toBeTruthy();
  await tiles.first().click();
  await tiles.nth(1).click();
  await expect(page.locator('#deck-batch-count')).toHaveText('2 выбрано');
  await expect(page.locator('#deck-batch-save')).toBeEnabled();
  await page.locator('#deck-batch-save').click();
  await expect(page.locator('#deck-batch-status')).toContainText('сохранены');
  await expect(page.locator('#deck-batch-count')).toHaveText('0 выбрано');
  await page.locator('[data-batch-slug="'+slug1+'"]').click();
  await page.locator('[data-batch-slug="'+slug2+'"]').click();
  await expect(page.locator('#deck-batch-unsave')).toBeEnabled();
  await page.locator('#deck-batch-personal').click();
  await expect(page.locator('#deck-batch-personal-confirm')).toBeVisible();
  await page.locator('#deck-batch-confirm-cancel').click();
  await expect(page.locator('[data-batch-slug="'+slug1+'"]')).toBeVisible();
  await page.locator('#deck-batch-personal').click();
  await page.locator('#deck-batch-confirm-accept').click();
  await expect(page.locator('[data-batch-slug="'+slug1+'"]')).toHaveCount(0);
  await page.locator('[data-batch-tab="archive"]').click();
  await expect(page.locator('[data-batch-slug="'+slug1+'"]')).toBeVisible();
  await expect(page.locator('[data-batch-slug="'+slug2+'"]')).toBeVisible();
  await attachCriticalScreenshot(page,info,'deck-home-batch-archive',{fullPage:false});
  await page.locator('[data-batch-slug="'+slug1+'"]').click();
  await page.locator('[data-batch-slug="'+slug2+'"]').click();
  await page.locator('#deck-batch-personal').click();
  await page.locator('#deck-batch-confirm-accept').click();
  await page.locator('[data-batch-tab="active"]').click();
  await expect(page.locator('[data-batch-slug="'+slug1+'"]')).toBeVisible();
  await page.locator('#deck-batch-close').click();
  await expect(picker).toBeHidden();
  if((page.viewportSize()?.width||1000)<=980)await expect(page.locator('#deck-focus .deck-focus__play')).toBeVisible();
  else await expect(page.locator('#deck-widgets .deck-tile').first()).toBeVisible();
});

test('Home batch administrator action sends one verified bulk request and can restore globally',async({page})=>{
  await page.addInitScript(()=>{
    const existing=window.fetch.bind(window);
    const globalArchive=new Set<string>();
    (window as any).__batchWrites=[];
    window.fetch=(input,init)=>{
      const url=typeof input==='string'?input:input instanceof Request?input.url:String(input);
      let path;
      try{path=new URL(url,location.href).pathname}catch{return existing(input,init)}
      if(path!=='/pocket-id/global-archive')return existing(input,init);
      const method=init?.method|| (input instanceof Request?input.method:'GET');
      if(method==='POST'){
        const body=JSON.parse(String(init?.body||'{}'));
        (window as any).__batchWrites.push(body);
        for(const slug of body.slugs||[]){
          if(body.archived)globalArchive.add(slug);else globalArchive.delete(slug);
        }
      }
      return Promise.resolve(new Response(JSON.stringify({archived:[...globalArchive],canManage:true}),{
        status:200,headers:{'content-type':'application/json'}
      }));
    };
  });
  await openDeck(page);
  await page.locator('#deck-batch-trigger').click();
  await expect(page.locator('#deck-batch-global')).toBeVisible();
  const tiles=page.locator('#deck-batch-grid [data-batch-slug]');
  const slugs=[await tiles.first().getAttribute('data-batch-slug'),await tiles.nth(1).getAttribute('data-batch-slug')];
  await tiles.first().click();
  await tiles.nth(1).click();
  await expect(page.locator('#deck-batch-global')).toBeEnabled();
  await page.locator('#deck-batch-global').click();
  await expect(page.locator('#deck-global-confirm')).toBeVisible();
  await page.locator('#deck-global-confirm-accept').click();
  await expect(page.locator('#deck-batch-status')).toContainText('общий архив');
  await page.locator('[data-batch-tab="archive"]').click();
  for(const slug of slugs)await expect(page.locator('[data-batch-slug="'+slug+'"]')).toBeVisible();
  for(const slug of slugs)await page.locator('[data-batch-slug="'+slug+'"]').click();
  await page.locator('#deck-batch-global').click();
  await page.locator('#deck-global-confirm-accept').click();
  const writes=await page.evaluate(()=>(window as any).__batchWrites);
  expect(writes).toHaveLength(2);
  expect(writes[0].archived).toBe(true);
  expect(writes[0].slugs).toEqual(slugs);
  expect(writes[1].archived).toBe(false);
  await page.locator('[data-batch-tab="active"]').click();
  for(const slug of slugs)await expect(page.locator('[data-batch-slug="'+slug+'"]')).toBeVisible();
});

test('administrator pins games for everyone and pinned games lead the public library',async({page})=>{
  await page.addInitScript(()=>{
    const original=window.fetch.bind(window);
    const pinned=new Set<string>();
    (window as any).__pinWrites=[];
    window.fetch=(input,init)=>{
      const url=typeof input==='string'?input:input instanceof Request?input.url:String(input);
      let path='';
      try{path=new URL(url,location.href).pathname;}catch{return original(input,init);}
      if(path!=='/pocket-id/global-archive'&&path!=='/pocket-id/global-pins')return original(input,init);
      const method=init?.method||(input instanceof Request?input.method:'GET');
      if(path==='/pocket-id/global-pins'&&method==='POST'){
        const body=JSON.parse(String(init?.body||'{}'));
        (window as any).__pinWrites.push(body);
        for(const slug of body.slugs||[]){
          if(body.pinned)pinned.add(slug);else pinned.delete(slug);
        }
      }
      return Promise.resolve(new Response(JSON.stringify({archived:[],pinned:[...pinned],canManage:true}),{
        status:200,headers:{'content-type':'application/json'}
      }));
    };
  });
  await openDeck(page);
  await page.locator('#deck-batch-trigger').click();
  const target=page.locator('#deck-batch-grid [data-batch-slug]').last();
  const slug=await target.getAttribute('data-batch-slug');
  expect(slug).toBeTruthy();
  await target.click();
  await expect(page.locator('#deck-batch-pin')).toBeEnabled();
  await expect(page.locator('#deck-batch-unpin')).toBeDisabled();
  await page.locator('#deck-batch-pin').click();
  await expect(page.locator('#deck-global-confirm')).toBeVisible();
  await page.locator('#deck-global-confirm-cancel').click();
  expect(await page.evaluate(()=>(window as any).__pinWrites)).toHaveLength(0);
  await page.locator('#deck-batch-pin').click();
  await page.locator('#deck-global-confirm-accept').click();
  await expect(page.locator('#deck-batch-status')).toContainText('закреплены');
  await expect(page.locator('[data-batch-slug="'+slug+'"] .deck-batch__scope--pin')).toBeVisible();
  await page.locator('#deck-batch-close').click();
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#app-list .app-entry').first()).toHaveAttribute('data-slug',slug!);
  await expect(page.locator('.app-entry[data-slug="'+slug+'"] .app-entry__pin')).toBeVisible();
  await page.locator('.app-entry[data-slug="'+slug+'"] .app-entry__more').click();
  await page.locator('#detail-extras > summary').click();
  await expect(page.locator('[data-deck-global-pin="'+slug+'"]')).toHaveText('Unpin for everyone');
  await page.locator('[data-deck-global-pin="'+slug+'"]').click();
  await page.locator('#deck-global-confirm-accept').click();
  await expect(page.locator('[data-deck-global-pin="'+slug+'"]')).toHaveText('Pin for everyone');
  await expect(page.locator('.app-entry[data-slug="'+slug+'"] .app-entry__pin')).toBeHidden();
  const writes=await page.evaluate(()=>(window as any).__pinWrites);
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual({slugs:[slug],pinned:true});
  expect(writes[1]).toEqual({slugs:[slug],pinned:false});
});

test('globally pinned covers stay visible to guests without granting management controls',async({page})=>{
  await page.addInitScript(()=>{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      const url=typeof input==='string'?input:input instanceof Request?input.url:String(input);
      let path='';
      try{path=new URL(url,location.href).pathname;}catch{return original(input,init);}
      if(path!=='/pocket-id/global-archive')return original(input,init);
      return Promise.resolve(new Response(JSON.stringify({
        archived:[],pinned:['screen-lab'],canManage:false
      }),{status:200,headers:{'content-type':'application/json'}}));
    };
  });
  await openDeck(page);
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#app-list .app-entry').first()).toHaveAttribute('data-slug','screen-lab');
  await expect(page.locator('.app-entry[data-slug="screen-lab"] .app-entry__pin')).toBeVisible();
  await page.locator('.app-entry[data-slug="screen-lab"] .app-entry__more').click();
  await page.locator('#detail-extras > summary').click();
  await expect(page.locator('[data-deck-global-pin]')).toHaveCount(0);
  await page.locator('#detail-close').click();
  await page.locator('#deck-bottom-nav [data-deck-view="home"]').click();
  await page.locator('#deck-batch-trigger').click();
  await expect(page.locator('#deck-batch-pin')).toBeHidden();
  await expect(page.locator('#deck-batch-unpin')).toBeHidden();
});
