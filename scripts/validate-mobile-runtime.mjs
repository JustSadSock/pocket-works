import { reportValidationDebt } from './validation-debt.mjs';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { buildRegistryEntries } from './app-config.mjs';

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
  '--app-safe-top', '--app-viewport-height', '--app-keyboard-inset', ':where(html, body, body *)',
  '-webkit-user-select: none', '-webkit-touch-callout: none', '[data-selectable] *',
  '-webkit-tap-highlight-color: transparent', 'touch-action: manipulation', 'font-size: max(16px, 1em)', '[data-gesture-surface]',
  '.is-app-scroll-locked', '[data-native-press].is-pressed', 'overflow-x: clip'
], 'shared/mobile-runtime.css');

// iOS Safari and installed PWAs must both reserve a real, consistent tap-safe strip.
requireIncludes(runtimeCss, [
  '--app-top-interaction-gap: 12px', 'calc(env(safe-area-inset-top, 0px)',
  '(display-mode: standalone)', 'max(58px', '(orientation: portrait)'
], 'iPhone top interaction safe area');
const launcherCss = await read('styles.css');
const zamazkaCss = await read('apps/zamazka/atelier-shell.css');
const flagpostCss = await read('apps/flagpost/styles.css');
const folioCss = await read('apps/folio/styles.css');
const tapeCss = await read('apps/jam-tape/styles.css');
requireIncludes(launcherCss, ['--safe-top:max(24px,var(--app-safe-top', 'shelf-shell'], 'launcher top inset');
requireIncludes(zamazkaCss, ['calc(6px + var(--app-safe-top', 'top{'], 'Zamazka safe toolbar');
requireIncludes(flagpostCss, ['height:calc(65px + var(--app-safe-top', 'padding:calc(8px + var(--app-safe-top'], 'Flagpost safe masthead');
requireIncludes(folioCss, ['--safe-t:max(8px,var(--app-safe-top', 'padding:var(--safe-t)'], 'Folio safe toolbar');
requireIncludes(tapeCss, ['padding:calc(8px + var(--app-safe-top'], 'Jam Tape safe masthead');

// The Pocket ID/Social native dialogs live in the top layer rather than in the
// safe-area-padded launcher. Verify the modal itself is anchored below the iOS
// system bar, and its mobile fallback exit cannot scroll out of view.
const socialDialogCss=await read('shared/pocket-social.css');
const idDialogCss=await read('shared/pocket-id.css');
const socialDialogJs=await read('shared/pocket-social.js');
requireIncludes(socialDialogCss, [
  'top:var(--pws-modal-top)', 'height:calc(100dvh - var(--pws-modal-top)',
  '--app-safe-top', '.pws-mobile-exit', 'min-height:44px'
], 'Pocket Social modal iOS safe exit');
requireIncludes(idDialogCss, [
  'top:var(--pw-id-modal-top)', 'max-height:calc(100dvh - var(--pw-id-modal-top)',
  'pw-id-dialog__top{position:sticky', 'pw-id-dialog__close{width:44px'
], 'Pocket ID account dialog iOS safe exit');
requireIncludes(socialDialogJs, [
  "button('close','Закрыть меню')", "action==='close'"
], 'Pocket Social alternate exit');

const runtimeJs = await read('shared/mobile-runtime.js');
requireIncludes(runtimeJs, [
  'export function installMobileRuntime', 'export function bindPointerGesture', 'export function capturePointer',
  'export function releasePointer', 'export function setDocumentScrollLocked', 'window.visualViewport', "'pointercancel'",
  "'lostpointercapture'", "'dragstart'", "'selectstart'", "'selectionchange'", 'selectableSelector',
  "'contextmenu'", "'gesturestart'", '--app-keyboard-inset'
], 'shared/mobile-runtime.js');

let registry = [];
try { registry = await buildRegistryEntries(root); }
catch (error) { fail(`application manifests could not build the registry: ${error.message}`); }

const quickTargets = [
  { slug: '_template', registered: false },
  ...registry.filter((app) => app.runtime === 'quick').map((app) => ({ slug: app.slug, registered: true }))
];

for (const target of quickTargets) {
  const directory = `apps/${target.slug}`;
  const html = await read(`${directory}/index.html`);
  // Several faithful ports intentionally have no app.js. Discover their
  // *actual* first-party ES module with an installed shared mobile runtime.
  let entrypoint='app.js';
  try { await access(path.join(root,directory,'app.js')); }
  catch {
    const scripts=[...html.matchAll(/<script\b[^>]*>/g)].map(m=>m[0]);
    for(const tag of scripts) {
      if(!/\btype=["']module["']/.test(tag))continue;
      const match=/\bsrc=["']\.\/([^"']+\.js)["']/.exec(tag);
      if(!match||match[1].includes('/'))continue;
      let code='';
      try { code=await readFile(path.join(root,directory,match[1]),'utf8'); } catch { continue; }
      if(code.includes('../../shared/mobile-runtime.js')&&code.includes('installMobileRuntime')) {
        entrypoint=match[1];break;
      }
    }
  }
  const appJs = await read(`${directory}/${entrypoint}`);
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

const godotTargets = [
  { slug: '_godot-template', registered: false },
  ...registry.filter((app) => app.runtime === 'godot').map((app) => ({ slug: app.slug, registered: true }))
];

for (const target of godotTargets) {
  const directory = `apps/${target.slug}`;
  const project = await read(`${directory}/project.godot`);
  const bridge = await read(`${directory}/source/pocket_works.gd`);
  const main = await read(`${directory}/source/main.gd`);
  requireIncludes(project, ['renderer/rendering_method="gl_compatibility"', 'PocketWorks="*res://source/pocket_works.gd"'], `${directory}/project.godot`);
  requireIncludes(bridge, ['JavaScriptBridge', 'exit_to_launcher', 'publish_test_state', 'storage_set', 'storage_get'], `${directory}/source/pocket_works.gd`);
  requireIncludes(main, ['PocketWorks.exit_to_launcher', 'PocketWorks.publish_test_state'], `${directory}/source/main.gd`);
}

const regressions = reportValidationDebt('mobile',errors,root);
if (regressions.length > 0) {
  console.error(`Mobile runtime validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of regressions) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Mobile runtime validation passed for Quick, Enhanced and Godot templates plus ${registry.length} self-registered app${registry.length === 1 ? '' : 's'}.`);
