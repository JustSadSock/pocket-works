import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];
function fail(message) { errors.push(message); }

async function read(relativePath) {
  try { return await readFile(path.join(root, relativePath), 'utf8'); }
  catch (error) { fail(`${relativePath} could not be read: ${error.message}`); return ''; }
}

function requireIncludes(source, fragments, label) {
  for (const fragment of fragments) if (!source.includes(fragment)) fail(`${label} must include ${fragment}`);
}

const runtimeCss = await read('shared/mobile-runtime.css');
requireIncludes(runtimeCss, [
  '--app-safe-top', '--app-viewport-height', '--app-keyboard-inset', '-webkit-user-select: none', '-webkit-touch-callout: none',
  '-webkit-tap-highlight-color: transparent', 'touch-action: manipulation', 'font-size: max(16px, 1em)', '[data-gesture-surface]',
  '.is-app-scroll-locked', '[data-native-press].is-pressed', 'overflow-x: clip'
], 'shared/mobile-runtime.css');

const runtimeJs = await read('shared/mobile-runtime.js');
requireIncludes(runtimeJs, [
  'export function installMobileRuntime', 'export function bindPointerGesture', 'export function capturePointer',
  'export function releasePointer', 'export function setDocumentScrollLocked', 'window.visualViewport', "'pointercancel'",
  "'lostpointercapture'", "'dragstart'", "'contextmenu'", "'gesturestart'", '--app-keyboard-inset'
], 'shared/mobile-runtime.js');

const registry = JSON.parse(await read('apps.json') || '[]');

const quickTargets = [
  { slug: '_template', registered: false },
  ...registry.filter((app) => app.runtime !== 'enhanced').map((app) => ({ slug: app.slug, registered: true }))
];

for (const target of quickTargets) {
  const directory = `apps/${target.slug}`;
  const html = await read(`${directory}/index.html`);
  const appJs = await read(`${directory}/app.js`);
  const serviceWorker = await read(`${directory}/sw.js`);
  requireIncludes(html, ['../../shared/mobile-runtime.css', 'data-app-shell'], `${directory}/index.html`);
  requireIncludes(appJs, ['../../shared/mobile-runtime.js', 'installMobileRuntime'], `${directory}/app.js`);
  requireIncludes(serviceWorker, ['../../shared/mobile-runtime.css', '../../shared/mobile-runtime.js'], `${directory}/sw.js`);
  if (target.registered && !html.includes('data-native-press')) fail(`${directory}/index.html must expose at least one immediate press-feedback control`);
}

const enhancedTargets = [
  { slug: '_enhanced-template', registered: false },
  ...registry.filter((app) => app.runtime === 'enhanced').map((app) => ({ slug: app.slug, registered: true }))
];

for (const target of enhancedTargets) {
  const directory = `apps/${target.slug}`;
  const sourceHtml = await read(`${directory}/source/index.html`);
  const sourceMain = await read(`${directory}/source/main.ts`);
  requireIncludes(sourceHtml, ['data-app-shell', 'data-native-press'], `${directory}/source/index.html`);
  requireIncludes(sourceMain, ['shared/mobile-runtime', 'installMobileRuntime'], `${directory}/source/main.ts`);
  if (target.registered) {
    const builtHtml = await read(`${directory}/index.html`);
    if (!builtHtml.includes('data-app-shell')) fail(`${directory}/index.html must preserve the application shell after build`);
  }
}

if (errors.length > 0) {
  console.error(`Mobile runtime validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Mobile runtime validation passed for Quick and Enhanced templates plus ${registry.length} registered app${registry.length === 1 ? '' : 's'}.`);
