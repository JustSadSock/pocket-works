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

test('All-files mode handles documents, audio and archives without data loss', async ({ page }) => {
  await page.goto('/apps/press/');
  await page.locator('[data-mode="smart"]').click();
  await expect(page.locator('#modeTitle')).toContainText('Сжать любые файлы');
  await expect(page.locator('#picker')).toHaveAttribute('accept', '');
  await page.locator('#picker').setInputFiles([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Повторяющийся документ. '.repeat(1000)) },
    { name: 'audio.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from([0xff, 0xfb, 0x90, 0x64]) },
    { name: 'table.csv', mimeType: 'text/csv', buffer: Buffer.from('id,name\\n'.repeat(400)) }
  ]);
  await expect(page.locator('#queue .file-row')).toHaveCount(3);
  await page.locator('#actionBtn').click();
  await expect(page.locator('#stateMsg')).toContainText('Готово: 3 из 3');
  await expect(page.locator('#queue .download')).toHaveCount(3);
  await expect(page.locator('#queue')).toContainText('ZIP без потерь');
  await expect(page.locator('#queue')).toContainText('оставлен оригинал');
  await expect(page.locator('#allBtn')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('#allBtn').click();
  const result = await download;
  expect(result.suggestedFilename()).toContain('.zip');
});

test('Archive preview plays WAV locally, switches to safe text and closes on mode change', async ({ page }) => {
  await page.goto('/apps/press/');
  await page.locator('[data-mode="unpack"]').click();
  const sampleRate = 8000;
  const wav = Buffer.alloc(44 + sampleRate * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(sampleRate * 2, 40);
  for (let i = 0; i < sampleRate; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / sampleRate) * 800), 44 + i * 2);
  const zip = await createZip([
    { blob: new Blob([wav]), path: 'sounds/test.WAV' },
    { blob: new Blob(['<script>window.previewExecuted = true</script>']), path: 'safe.html' },
    { blob: new Blob(['unknown']), path: 'unknown.bin' }
  ]);
  await page.locator('#picker').setInputFiles({ name: 'preview.zip', mimeType: 'application/zip', buffer: Buffer.from(await zip.arrayBuffer()) });
  await page.locator('#actionBtn').click();
  await expect(page.locator('#archiveEntries .file-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Предпросмотр sounds/test.WAV' }).click();
  const audio = page.locator('.archive-preview audio');
  await expect(audio).toBeVisible();
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.duration)).toBeCloseTo(1, 1);
  await expect(audio).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => audio.evaluate(async (a: HTMLAudioElement) => (await fetch(a.src)).headers.get('content-type'))).toBe('audio/wav');
  await page.getByRole('button', { name: 'Предпросмотр safe.html' }).click();
  await expect(audio).toHaveCount(0);
  await expect(page.locator('.preview-text')).toContainText('<script>');
  expect(await page.evaluate(() => (window as any).previewExecuted)).toBeUndefined();
  await page.getByRole('button', { name: 'Предпросмотр unknown.bin' }).click();
  await expect(page.locator('.preview-status')).toContainText('недоступен');
  await expect(page.locator('.archive-preview')).toHaveCount(1);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.archive-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Предпросмотр sounds/test.WAV' }).click();
  await page.locator('[data-mode="photo"]').click();
  await expect(page.locator('.archive-preview')).toHaveCount(0);
});
