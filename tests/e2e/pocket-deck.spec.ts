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
  monitor.assertClean();
});

test('widgets can be configured, reordered and saved without losing previous shelf data',async({page})=>{
  await openDeck(page);
  await page.locator('#deck-customize').click();
  await expect(page.locator('#deck-editor')).toBeVisible();
  await expect(page.locator('[data-edit-id="continue"]')).toBeVisible();
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

test('archive is reversible and project development notes persist independently of saved games',async({page})=>{
  await openDeck(page);
  await page.locator('#deck-bottom-nav [data-deck-view="library"]').click();
  await expect(page.locator('#app-list .app-entry').first()).toBeVisible();
  const target=page.locator('#app-list .app-entry').first();
  const slug=await target.getAttribute('data-slug');
  expect(slug).toBeTruthy();
  await target.locator('.app-entry__select').click();
  await expect(page.locator('#deck-project-detail')).toBeVisible();
  await page.locator('#deck-project-note').fill('Improve flight feel and landing transitions');
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
