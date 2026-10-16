import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export function monitorUnexpectedBrowserOutput(page: Page) {
  const errors: string[] = [];
  const dialogs: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('dialog', async (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss().catch(() => {});
  });

  return {
    assertClean() {
      expect(errors, `Unexpected browser errors:\n${errors.join('\n')}`).toEqual([]);
      expect(dialogs, `Unexpected browser dialogs:\n${dialogs.join('\n')}`).toEqual([]);
    }
  };
}

export async function openStablePage(page: Page, url: string, ready: string | Locator) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const target = typeof ready === 'string' ? page.locator(ready).first() : ready;
  await expect(target).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

export async function openLibraryPage(page: Page, ready: string | Locator) {
  await openStablePage(page, '/', 'h1');
  await expect(page.locator('html')).toHaveClass(/is-launcher-ui-ready/);
  await page.locator('#deck-bottom-nav button[data-deck-view="library"]').click();
  await expect(typeof ready === 'string' ? page.locator(ready).first() : ready).toBeVisible();
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return width - window.innerWidth;
  });
  expect(overflow, `Document overflows the viewport by ${overflow}px`).toBeLessThanOrEqual(1);
}

export async function assertNativeControlStyles(locator: Locator) {
  const styles = await locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      touchAction: computed.touchAction,
      userSelect: computed.userSelect,
      webkitUserSelect: computed.getPropertyValue('-webkit-user-select'),
      tapHighlight: computed.getPropertyValue('-webkit-tap-highlight-color')
    };
  });

  expect(styles.touchAction).toBe('manipulation');
  expect([styles.userSelect, styles.webkitUserSelect]).toContain('none');
  expect(styles.tapHighlight.replaceAll(' ', '')).toMatch(/transparent|rgba\(0,0,0,0\)/);
}

export async function attachCriticalScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: { fullPage?: boolean; mask?: Locator[] } = {}
) {
  const path = testInfo.outputPath(`${name}.png`);

  try {
    await page.screenshot({
      path,
      fullPage: options.fullPage ?? true,
      // Disabling CSS animations forces an additional style/layout synchronization.
      // On continuously rendered WebGL canvases Chromium can then block in the GPU
      // readback path even while the page itself keeps rendering normally. Evidence
      // capture must never become the application-under-test failure.
      animations: 'allow',
      caret: 'hide',
      mask: options.mask || [],
      timeout: 6_000
    });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hasCanvas = await page.locator('canvas').count().then((count) => count > 0).catch(() => false);
    if (!hasCanvas || !/screenshot|timeout/i.test(message)) throw error;

    await testInfo.attach(`${name}-capture-warning`, {
      body: Buffer.from(
        `Screenshot evidence capture was skipped after a bounded WebGL readback timeout.\n${message}\n`,
        'utf8'
      ),
      contentType: 'text/plain'
    });
  }
}

export async function waitForActiveServiceWorker(page: Page, expectedScopeSuffix: string) {
  await page.waitForFunction(async (scopeSuffix) => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(
      registration?.scope.endsWith(String(scopeSuffix)) &&
      registration.active?.state === 'activated'
    );
  }, expectedScopeSuffix, { timeout: 15_000 });
}

// Static site previews have no Cloudflare account service. Keep real assets and workers.
export async function mockGuestShellServices(page:Page){
  await page.addInitScript(()=>{
    const original=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof Request?input.url:String(input),location.href);
      const data=url.pathname==='/pocket-id/me'?{user:null}:
        url.pathname==='/pocket-id/config'?{googleEnabled:false,avatars:[]}:
        url.pathname==='/pocket-social/me'?{profile:null}:
        url.pathname==='/pocket-id/global-archive'?{archived:[],pinned:[],canManage:false}:null;
      return data?Promise.resolve(new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})):original(input,init);
    };
  });
}
