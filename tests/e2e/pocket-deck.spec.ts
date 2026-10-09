import { expect, test } from '@playwright/test';
import { attachCriticalScreenshot, assertNoHorizontalOverflow, monitorUnexpectedBrowserOutput } from './helpers';

async function openDeck(page: import('@playwright/test').Page) {
  await page.goto('/', {waitUntil:'domcontentloaded'});
  await expect(page.locator('html')).toHaveClass(/has-pocket-deck/);
  await expect(page.locator('#deck-bottom-nav')).toBeVisible();
  await expect(page.locator('#deck-widgets .deck-widget').first()).toBeVisible();
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
  await expect(page.locator('#deck-widgets .deck-tile').first()).toBeVisible();
  await attachCriticalScreenshot(page,info,'deck-first-frame',{fullPage:false});
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#deck-view-title')).toHaveText('Library');
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  expect(await page.locator('#app-list .app-entry').count()).toBeGreaterThan(30);
  await page.locator('[data-deck-density="micro"]').click();
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
  await target.locator('.app-entry__select').click();
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
  await archived.locator('.app-entry__select').click();
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
  await page.locator('.app-entry[data-slug="'+first+'"] .app-entry__select').click();
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
  await page.locator(`.app-entry[data-slug="${slug}"] .app-entry__select`).click();
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
  await page.locator('[data-deck-density="micro"]').click();
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#deck-view-title')).toHaveText('Library');
  await expect(page.locator('html')).toHaveAttribute('data-deck-density','micro');
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  await page.locator('#deck-bottom-nav [data-deck-view="home"]').click();
  await expect(page.locator('#deck-home')).toBeVisible();
  await context.setOffline(false);
});
