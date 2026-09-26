import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

type GodotTarget = {
  slug: string;
  runtime?: string;
  orientation?: 'any' | 'portrait' | 'landscape';
};

function godotTargets(): GodotTarget[] {
  const appsRoot = path.join(process.cwd(), 'apps');
  const targets: GodotTarget[] = [];
  for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    try {
      const config = JSON.parse(readFileSync(path.join(appsRoot, entry.name, 'app.config.json'), 'utf8')) as GodotTarget;
      if (config.runtime === 'godot' && config.slug) targets.push(config);
    } catch {
      // Structural validators own malformed app configs.
    }
  }
  return targets.sort((left, right) => left.slug.localeCompare(right.slug));
}

function canonicalWasmSize(slug: string) {
  const webRoot = path.join(process.cwd(), 'apps', slug, 'web');
  const wasm = readdirSync(webRoot).find((name) => name.endsWith('.wasm'));
  if (!wasm) return 0;
  return statSync(path.join(webRoot, wasm)).size;
}

const targets = godotTargets();

test.describe('Godot production transport', () => {
  test.skip(targets.length === 0, 'No registered Godot applications exist.');

  for (const app of targets) {
    test(`${app.slug} boots through Cloudflare-safe WASM transport`, async ({ page }, testInfo) => {
      const landscape = testInfo.project.name.includes('landscape');
      if (app.orientation === 'landscape') test.skip(!landscape, 'Landscape Godot app is exercised in the landscape mobile projects.');
      if (app.orientation === 'portrait') test.skip(landscape, 'Portrait Godot app is exercised in the portrait mobile projects.');

      test.setTimeout(90_000);
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      const chunkResponses: Array<{ url: string; encoding: string | null }> = [];

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('response', async (response) => {
        if (!response.url().includes('.wasm.part-')) return;
        chunkResponses.push({
          url: response.url(),
          encoding: (await response.allHeaders())['content-encoding'] ?? null
        });
      });

      const response = await page.goto(`/apps/${app.slug}/`, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);

      let runtime: {
        state: unknown;
        chunkBootstrap: boolean;
        startupOverlayExists: boolean;
        canvas: { width: number; height: number } | null;
      } | null = null;

      await expect.poll(async () => {
        try {
          const snapshot = await page.evaluate(() => ({
            state: (window as any).__AI_TEST_STATE__ ?? null,
            chunkBootstrap: Boolean(document.querySelector('script[data-pocketworks-wasm-chunks]')),
            startupOverlayExists: Boolean(document.getElementById('status')),
            canvas: (() => {
              const canvas = document.querySelector('canvas');
              if (!canvas) return null;
              const rect = canvas.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            })()
          }));
          runtime = snapshot;
          return Boolean(
            snapshot.state &&
            !snapshot.startupOverlayExists &&
            snapshot.canvas &&
            snapshot.canvas.width > 0 &&
            snapshot.canvas.height > 0
          );
        } catch (error) {
          const message = String(error);
          if (
            message.includes('Execution context was destroyed') ||
            message.includes('most likely because of a navigation') ||
            message.includes('Cannot find context with specified id')
          ) {
            return false;
          }
          throw error;
        }
      }, {
        timeout: 75_000,
        intervals: [250, 500, 1_000]
      }).toBe(true);

      expect(runtime, `${app.slug} never reached a stable Godot runtime context`).not.toBeNull();

      expect(runtime.state, `${app.slug} never published its Godot QA bridge`).not.toBeNull();
      expect(runtime.startupOverlayExists, `${app.slug} remained stuck on the Godot startup overlay`).toBe(false);
      expect(runtime.canvas?.width ?? 0).toBeGreaterThan(0);
      expect(runtime.canvas?.height ?? 0).toBeGreaterThan(0);
      expect(pageErrors, `Unhandled browser errors while starting ${app.slug}`).toEqual([]);

      if (canonicalWasmSize(app.slug) > 24 * 1024 * 1024) {
        expect(runtime.chunkBootstrap, `${app.slug} oversized WASM did not receive the production chunk bootstrap`).toBe(true);
        expect(chunkResponses.length, `${app.slug} never requested its WASM chunks`).toBeGreaterThanOrEqual(2);
        expect(chunkResponses.every((item) => item.encoding === null), `${app.slug} WASM chunks must not rely on HTTP Content-Encoding`).toBe(true);
      }

      await testInfo.attach('godot-transport-state', {
        body: Buffer.from(JSON.stringify({ app, runtime, chunkResponses, consoleErrors, pageErrors }, null, 2)),
        contentType: 'application/json'
      });
    });
  }
});
