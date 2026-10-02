import { readFile, writeFile } from 'node:fs/promises';

export function validateVisualScenes(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.scenes) || !data.scenes.length) throw new Error('visual-scenes.json requires version 1 and scenes');
  const names = new Set();
  for (const scene of data.scenes) {
    if (!/^[a-z0-9_-]+$/.test(scene.name) || names.has(scene.name)) throw new Error(`Invalid or duplicate scene name: ${scene.name}`);
    names.add(scene.name);
    if (scene.path && (!scene.path.startsWith('/') || scene.path.startsWith('//'))) throw new Error('Scene path must be an app-local absolute path');
    for (const step of scene.steps ?? []) {
      if (!['click', 'waitFor', 'pause'].includes(step.action)) throw new Error(`Unknown visual scene action: ${step.action}`);
      if (step.action !== 'pause' && (!step.selector || typeof step.selector !== 'string')) throw new Error('Selector required for click/waitFor');
      if (step.action === 'pause' && (!Number.isFinite(step.ms) || step.ms < 0 || step.ms > 3000)) throw new Error('Pause must be 0..3000 ms');
    }
  }
  return data.scenes;
}

export async function scanDom(page) {
  return page.evaluate(() => {
    const width = window.innerWidth, height = window.innerHeight;
    const overflows = [];
    const smallTargets = [];
    const interactive = document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]');
    for (const el of interactive) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 55);
      if (rect.left < -2 || rect.top < -2 || rect.right > width + 2 || rect.bottom > height + 2) overflows.push({ label, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
      if (rect.width < 40 || rect.height < 40) smallTargets.push({ label, width: Math.round(rect.width), height: Math.round(rect.height) });
    }
    return {
      viewport: { width, height },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      overflows, smallTargets,
      metrics: window.__PW_VISUAL_METRICS__ ?? null
    };
  });
}

const escapeXml = (v) => String(v).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
export async function writeContactSheet(entries, target) {
  const cellW = 400, cellH = 340, cols = Math.min(3, entries.length), rows = Math.ceil(entries.length / cols);
  const cells = [];
  for (let i = 0; i < entries.length; i++) {
    const { screenshot, label } = entries[i];
    const data = (await readFile(screenshot)).toString('base64');
    const x = i % cols * cellW, y = Math.floor(i / cols) * cellH;
    cells.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="#20242a"/><text x="${x + 12}" y="${y + 24}" fill="#fff" font-size="15">${escapeXml(label)}</text><image x="${x + 10}" y="${y + 34}" width="${cellW - 20}" height="${cellH - 44}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${data}"/>`);
  }
  await writeFile(target, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cols * cellW}" height="${rows * cellH}" viewBox="0 0 ${cols * cellW} ${rows * cellH}">${cells.join('')}</svg>`);
}
