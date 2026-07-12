import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const appsDirectory = path.join(root, 'apps');
const registryPath = path.join(root, 'apps.json');

const rootRequiredFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'sw.js',
  'apps.json',
  'README.md',
  'netlify.toml'
];

const appRequiredFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'sw.js',
  'README.md'
];

const errors = [];
const cacheNames = new Map();

function fail(message) {
  errors.push(message);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function readJson(relativePath, label = relativePath) {
  try {
    return JSON.parse(await readText(relativePath));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function requireString(object, key, label) {
  if (typeof object?.[key] !== 'string' || object[key].trim() === '') {
    fail(`${label}.${key} must be a non-empty string`);
    return false;
  }
  return true;
}

function localAssetPath(directory, source) {
  if (typeof source !== 'string' || source.trim() === '') return null;
  if (/^(?:https?:|data:|blob:)/i.test(source)) return null;

  const clean = source.split(/[?#]/, 1)[0].replace(/^\.\//, '');
  if (clean.startsWith('/') || clean.includes('..')) return null;
  return path.join(directory, clean);
}

async function validateHtml(label, relativePath) {
  let html;
  try {
    html = await readText(relativePath);
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
    return;
  }

  const expectedReferences = ['./manifest.webmanifest', './styles.css', './app.js'];
  for (const reference of expectedReferences) {
    if (!html.includes(reference)) fail(`${label} must reference ${reference}`);
  }

  if (!/name=["']viewport["'][^>]*viewport-fit=cover/i.test(html)) {
    fail(`${label} viewport meta must include viewport-fit=cover`);
  }
}

async function validateManifest(label, relativePath, expected) {
  const manifest = await readJson(relativePath, label);
  if (!manifest) return;

  for (const key of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) {
    requireString(manifest, key, label);
  }

  if (manifest.id !== expected.id) fail(`${label}.id must equal ${expected.id}`);
  if (manifest.start_url !== './') fail(`${label}.start_url must equal ./`);
  if (manifest.scope !== './') fail(`${label}.scope must equal ./`);
  if (expected.name && manifest.name !== expected.name) fail(`${label}.name must equal ${expected.name}`);
  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display)) {
    fail(`${label}.display must be standalone, fullscreen or minimal-ui`);
  }

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    fail(`${label}.icons must contain at least one icon`);
    return;
  }

  const directory = path.dirname(relativePath);
  for (const [index, icon] of manifest.icons.entries()) {
    if (!requireString(icon, 'src', `${label}.icons[${index}]`)) continue;
    requireString(icon, 'sizes', `${label}.icons[${index}]`);
    requireString(icon, 'type', `${label}.icons[${index}]`);

    const iconPath = localAssetPath(directory, icon.src);
    if (!iconPath) {
      fail(`${label}.icons[${index}].src must be a local app-owned path`);
      continue;
    }
    if (!(await exists(path.join(root, iconPath)))) {
      fail(`${label}.icons[${index}] points to missing file ${icon.src}`);
    }
  }
}

async function validateServiceWorker(label, relativePath, expectedPrefix) {
  let source;
  try {
    source = await readText(relativePath);
  } catch (error) {
    fail(`${label} could not be read: ${error.message}`);
    return;
  }

  for (const eventName of ['install', 'activate', 'fetch']) {
    if (!source.includes(`addEventListener('${eventName}'`) && !source.includes(`addEventListener("${eventName}"`)) {
      fail(`${label} must handle the ${eventName} event`);
    }
  }

  const cacheMatch = source.match(/(?:const|let)\s+CACHE_NAME\s*=\s*['"`]([^'"`]+)['"`]/);
  if (!cacheMatch) {
    fail(`${label} must declare a static CACHE_NAME string`);
    return;
  }

  const cacheName = cacheMatch[1];
  if (!cacheName.startsWith(expectedPrefix)) {
    fail(`${label} CACHE_NAME must start with ${expectedPrefix}`);
  }

  const previousOwner = cacheNames.get(cacheName);
  if (previousOwner) fail(`${label} reuses cache name ${cacheName} already owned by ${previousOwner}`);
  cacheNames.set(cacheName, label);

  const broadCleanup = /\.filter\s*\(\s*\(?\s*key\s*\)?\s*=>\s*key\s*!==\s*CACHE_NAME\s*\)/;
  if (broadCleanup.test(source)) {
    fail(`${label} deletes caches without checking ownership; cleanup must be prefix-scoped`);
  }

  if (source.includes('caches.keys()') && !source.includes('startsWith(')) {
    fail(`${label} cache cleanup must use an ownership prefix`);
  }

  for (const shellFile of ['./index.html', './styles.css', './app.js', './manifest.webmanifest']) {
    if (!source.includes(shellFile)) fail(`${label} app shell must include ${shellFile}`);
  }
}

for (const relativePath of rootRequiredFiles) {
  if (!(await exists(path.join(root, relativePath)))) fail(`root launcher is missing ${relativePath}`);
}

await validateHtml('root index.html', 'index.html');
await validateManifest('root manifest.webmanifest', 'manifest.webmanifest', { id: '/', name: 'Pocket Works' });
await validateServiceWorker('root sw.js', 'sw.js', 'pocket-works-launcher-');

try {
  const launcherSource = await readText('app.js');
  const launcherHtml = await readText('index.html');
  const directRegistration = launcherSource.includes("serviceWorker.register('./sw.js')") || launcherSource.includes('serviceWorker.register("./sw.js")');
  const managedRegistration = launcherHtml.includes('data-update-manager') && launcherHtml.includes('data-service-worker="./sw.js"');
  if (!directRegistration && !managedRegistration) {
    fail('root launcher must register ./sw.js directly or through the managed update script');
  }
} catch (error) {
  fail(`root launcher registration could not be validated: ${error.message}`);
}

const apps = await readJson('apps.json');
if (!Array.isArray(apps)) {
  fail('apps.json must contain a JSON array');
} else {
  if (apps.length === 0) fail('apps.json must contain at least one registered reference app');

  const slugs = new Set();
  const paths = new Set();

  for (const [index, app] of apps.entries()) {
    const prefix = `apps.json[${index}]`;

    for (const key of ['slug', 'name', 'description', 'path', 'status', 'version', 'accent']) {
      requireString(app, key, prefix);
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.slug || '')) {
      fail(`${prefix}.slug must be lowercase kebab-case`);
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(app.version || '')) {
      fail(`${prefix}.version must use semantic versioning`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(app.accent || '')) {
      fail(`${prefix}.accent must be a six-digit hex color`);
    }
    if (!['active', 'experimental', 'archived'].includes(app.status)) {
      fail(`${prefix}.status must be active, experimental or archived`);
    }
    if (!Array.isArray(app.tags) || app.tags.some((tag) => typeof tag !== 'string' || tag.trim() === '')) {
      fail(`${prefix}.tags must be an array of non-empty strings`);
    }

    const expectedPath = `./apps/${app.slug}/`;
    if (app.path !== expectedPath) fail(`${prefix}.path must equal ${expectedPath}`);
    if (slugs.has(app.slug)) fail(`duplicate slug: ${app.slug}`);
    if (paths.has(app.path)) fail(`duplicate path: ${app.path}`);
    slugs.add(app.slug);
    paths.add(app.path);

    const appDirectory = path.join('apps', app.slug);
    for (const requiredFile of appRequiredFiles) {
      if (!(await exists(path.join(root, appDirectory, requiredFile)))) {
        fail(`${app.slug} is missing ${requiredFile}`);
      }
    }

    await validateHtml(`${app.slug}/index.html`, path.join(appDirectory, 'index.html'));
    await validateManifest(`${app.slug}/manifest.webmanifest`, path.join(appDirectory, 'manifest.webmanifest'), {
      id: `/apps/${app.slug}/`,
      name: app.name
    });
    await validateServiceWorker(`${app.slug}/sw.js`, path.join(appDirectory, 'sw.js'), `${app.slug}-`);

    try {
      const appSource = await readText(path.join(appDirectory, 'app.js'));
      if (!appSource.includes("serviceWorker.register('./sw.js')") && !appSource.includes('serviceWorker.register("./sw.js")')) {
        fail(`${app.slug}/app.js must register ./sw.js`);
      }
    } catch (error) {
      fail(`${app.slug}/app.js could not be read: ${error.message}`);
    }
  }

  try {
    const entries = await readdir(appsDirectory, { withFileTypes: true });
    const unregisteredDirectories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !slugs.has(entry.name))
      .map((entry) => entry.name);

    for (const directory of unregisteredDirectories) {
      fail(`apps/${directory}/ exists but is not registered in apps.json`);
    }
  } catch (error) {
    fail(`apps directory could not be inspected: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(`Pocket Works health check failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Pocket Works health check passed: root launcher and ${apps.length} registered app${apps.length === 1 ? '' : 's'} validated.`);
