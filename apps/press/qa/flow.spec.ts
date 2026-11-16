import { test, expect } from '@playwright/test';
import { createZip } from '../zip.mjs';

test('ZIP creation + extraction with verified content', async ({ page }) => {
  await page.goto('/apps/press/');
  await page.locator('[data-mode="pack"]').click();
  await page.locator('#picker').setInputFiles([
    { name: 'пример.txt', mimeType: 'text/plain', buffer: Buffer.from('Привет, архив!'.repeat(200)) },
    { name: 'report.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') }
  ]);
  await expect(page.locator('#queue .file-row')).toHaveCount(2);
  await page.locator('#actionBtn').click();
  await expect(page.locator('#stateMsg')).toContainText('ZIP готов');
  await expect(page.locator('#allBtn')).toBeVisible();
  await page.locator('[data-mode="unpack"]').click();
  const zip = await createZip([{ blob: new Blob(['Привет, архив!']), path: 'folder/пример.txt' }]);
  await page.locator('#picker').setInputFiles({
    name: 'test.zip', mimeType: 'application/zip', buffer: Buffer.from(await zip.arrayBuffer())
  });
  await page.locator('#actionBtn').click();
  await expect(page.locator('#archiveEntries .file-row')).toHaveCount(1);
  await expect(page.locator('#stateMsg')).toContainText('CRC32 пройдена');
});
test('Photo compression and result comparison', async ({ page }) => {
  await page.goto('/apps/press/');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const x = c.getContext('2d')!; x.fillStyle = '#c95d31'; x.fillRect(0,0,640,480);
    x.fillStyle = '#293a29'; for (let i=0;i<30;i++) x.fillRect(i*23,30+i*10,20,200);
    return new Promise<string>(resolve => c.toBlob(b => {const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(b!);},'image/png'));
  });
  await page.locator('#picker').setInputFiles({ name:'pattern.png', mimeType:'image/png',buffer:Buffer.from(png,'base64') });
  await page.locator('#actionBtn').click();
  await expect(page.locator('#stateMsg')).toContainText('Готово: 1 из 1');
  await expect(page.locator('#sizeReport')).toBeVisible();
  await expect(page.locator('#queue .download')).toHaveCount(1);
  await page.locator('#format').selectOption('jpeg');
  await expect(page.locator('#format')).toHaveValue('jpeg');
});
