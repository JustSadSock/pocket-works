import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'apps.json');
const requiredFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'sw.js',
  'README.md'
];

function fail(message) {
  console.error(`Validation failed: ${message}`);
  process.exitCode = 1;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let apps;

try {
  apps = JSON.parse(await readFile(registryPath, 'utf8'));
} catch (error) {
  fail(`apps.json is not valid JSON: ${error.message}`);
  process.exit();
}

if (!Array.isArray(apps)) {
  fail('apps.json must contain a JSON array');
  process.exit();
}

const slugs = new Set();
const paths = new Set();

for (const [index, app] of apps.entries()) {
  const prefix = `apps.json[${index}]`;

  for (const key of ['slug', 'name', 'description', 'path', 'status', 'version']) {
    if (typeof app[key] !== 'string' || app[key].trim() === '') {
      fail(`${prefix}.${key} must be a non-empty string`);
    }
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.slug || '')) {
    fail(`${prefix}.slug must be lowercase kebab-case`);
  }

  if (!['active', 'experimental', 'archived'].includes(app.status)) {
    fail(`${prefix}.status must be active, experimental or archived`);
  }

  const expectedPath = `./apps/${app.slug}/`;
  if (app.path !== expectedPath) {
    fail(`${prefix}.path must equal ${expectedPath}`);
  }

  if (slugs.has(app.slug)) fail(`duplicate slug: ${app.slug}`);
  if (paths.has(app.path)) fail(`duplicate path: ${app.path}`);
  slugs.add(app.slug);
  paths.add(app.path);

  const directory = path.join(root, 'apps', app.slug);
  for (const requiredFile of requiredFiles) {
    if (!(await exists(path.join(directory, requiredFile)))) {
      fail(`${app.slug} is missing ${requiredFile}`);
    }
  }

  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.webmanifest'), 'utf8'));
    const expectedId = `/apps/${app.slug}/`;
    if (manifest.id !== expectedId) fail(`${app.slug} manifest id must equal ${expectedId}`);
    if (manifest.start_url !== './') fail(`${app.slug} manifest start_url must equal ./`);
    if (manifest.scope !== './') fail(`${app.slug} manifest scope must equal ./`);
  } catch (error) {
    fail(`${app.slug} manifest is invalid: ${error.message}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Validated ${apps.length} registered app${apps.length === 1 ? '' : 's'}.`);
