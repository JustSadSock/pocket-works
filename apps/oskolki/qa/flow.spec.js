import { test, expect } from '@playwright/test';

async function placeById(page, id) {
  await page.locator('#bankZone .tile[data-piece="' + id + '"]').click();
}
async function solve(page) {
  const total = await page.locator('#bankZone .tile').count();
  for (let id = 0; id < total; id++) await placeById(page, id);
}

test('import, complete, check accuracy, see errors, repeat and return to text', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/apps/oskolki/?qa-flow=1');
  await expect(page.locator('#editorScreen')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('01-editor.png') });
  await page.locator('#sourceInput').fill(
    '1. Свет распространяется быстрее звука и достигает нас раньше.\n2. История помогает понимать причины и последствия событий.'
  );
  await expect(page.locator('#sourceCount')).toContainText('2');
  await page.locator('#startBtn').click();
  await expect(page.locator('#playScreen')).toBeVisible();
  await expect(page.locator('#roundCounter')).toContainText('01 / 02');
  await expect(page.locator('#checkBtn')).toBeDisabled();
  await expect(page.locator('#bankZone .tile').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('02-scrambled.png') });
  await solve(page);
  await expect(page.locator('#checkBtn')).toBeEnabled();
  await expect(page.locator('#bankZone .tile')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('03-assembled.png') });
  await page.locator('#checkBtn').click();
  await expect(page.locator('#reviewScreen')).toBeVisible();
  await expect(page.locator('#reviewPercent')).toContainText('100');
  await page.screenshot({ path: testInfo.outputPath('04-perfect.png') });
  await page.locator('#nextBtn').click();
  await expect(page.locator('#roundCounter')).toContainText('02 / 02');
  const count = await page.locator('#bankZone .tile').count();
  for (let id = count - 1; id >= 0; id--) await placeById(page, id);
  await page.locator('#checkBtn').click();
  await expect(page.locator('#reviewMessage')).toContainText('фрагментов');
  await page.screenshot({ path: testInfo.outputPath('05-errors.png') });
  await page.locator('#nextBtn').click();
  await expect(page.locator('#resultsScreen')).toBeVisible();
  await expect(page.locator('.result-row')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('06-results.png') });
  await page.locator('#retryBtn').click();
  await expect(page.locator('#roundCounter')).toContainText('01 / 01');
  await page.reload();
  await expect(page.locator('#playScreen')).toBeVisible();
  await expect(page.locator('#roundCounter')).toContainText('01 / 01');
  await solve(page);
  await page.locator('#checkBtn').click();
  await page.locator('#nextBtn').click();
  await expect(page.locator('#retryBtn')).toBeHidden();
  await page.locator('#newBtn').click();
  await expect(page.locator('#sourceInput')).toHaveValue(/Свет распространяется/);
  expect(errors).toEqual([]);
});

test('undo and active round survive refresh, exit asks for confirmation', async ({ page }) => {
  await page.goto('/apps/oskolki/?qa-persist=1');
  await page.locator('#sourceInput').fill('1. Uno dos tres cuatro cinco seis siete ocho.\n2. Deux trois quatre.');
  await page.locator('#startBtn').click();
  await page.locator('#bankZone .tile').first().click();
  await expect(page.locator('#answerZone .tile')).toHaveCount(1);
  await page.locator('#undoBtn').click();
  await expect(page.locator('#answerZone .tile')).toHaveCount(0);
  await page.locator('#bankZone .tile').first().click();
  await page.reload();
  await expect(page.locator('#answerZone .tile')).toHaveCount(1);
  await page.locator('#leaveBtn').click();
  await expect(page.locator('#confirmLayer')).toBeVisible();
  await page.locator('#modalCancel').click();
  await expect(page.locator('#playScreen')).toBeVisible();
  await page.locator('#leaveBtn').click();
  await page.locator('#modalAccept').click();
  await expect(page.locator('#editorScreen')).toBeVisible();
});

test('Unicode puzzle input and phone viewport never overflow document', async ({ page }, testInfo) => {
  await page.goto('/apps/oskolki/?qa-unicode=1');
  await page.locator('#sourceInput').fill('1. اللغة العربية لغة جميلة ومهمة في العالم.\n2. 学习历史帮助我们理解今天的世界。');
  await page.locator('#startBtn').click();
  await expect(page.locator('#answerZone')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('07-arabic.png') });
  await solve(page);
  await page.locator('#checkBtn').click();
  await expect(page.locator('#reviewPercent')).toContainText('100');
  await page.locator('#nextBtn').click();
  await solve(page);
  await page.locator('#checkBtn').click();
  await expect(page.locator('#reviewPercent')).toContainText('100');
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - innerWidth,
    height: document.documentElement.scrollHeight - innerHeight
  }));
  expect(overflow.width).toBeLessThanOrEqual(2);
  expect(overflow.height).toBeLessThanOrEqual(2);
});
