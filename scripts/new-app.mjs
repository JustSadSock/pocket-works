import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  APP_PRESETS,
  APP_RUNTIMES,
  ENHANCED_APP_PRESETS,
  QUICK_APP_PRESETS,
  validateAppConfig
} from './app-config.mjs';
import { getPreset } from './presets.mjs';
import { getEnhancedPreset } from './enhanced-presets.mjs';

const textExtensions = new Set(['.css', '.html', '.js', '.ts', '.json', '.md', '.svg', '.webmanifest']);

function parseArguments(argv) {
  const options = {};
  const positionals = [];
  for (const argument of argv) {
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    const [rawKey, ...rawValue] = argument.slice(2).split('=');
    options[rawKey] = rawValue.length > 0 ? rawValue.join('=') : true;
  }
  return { slug: positionals[0], options };
}

function humanize(slug) {
  return slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function escapeMarkup(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function replaceTokens(source, replacements) {
  let result = source;
  for (const [token, value] of Object.entries(replacements)) result = result.split(token).join(value);
  return result;
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function transformDirectory(directory, replacements) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await transformDirectory(target, replacements);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name))) continue;
    const source = await readFile(target, 'utf8');
    await writeFile(target, replaceTokens(source, replacements), 'utf8');
  }
}

function runNpm(root, args, failureMessage) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) throw new Error(failureMessage);
}

function runValidation(root) {
  runNpm(root, ['run', 'validate:all'], 'generated application did not pass validation');
}

function buildEnhancedApp(root, slug) {
  runNpm(root, ['run', 'build', '--workspace', `@pocket-works/${slug}`], 'enhanced application build failed; run npm install at the repository root first');
}

function printHelp() {
  console.log(`Pocket Forge\n\nUsage:\n  npm run new:app -- <slug> --preset=interactive [options]\n  npm run new:app -- <slug> --runtime=enhanced --preset=pixi [options]\n\nRuntimes:\n  ${APP_RUNTIMES.join(', ')}\n\nQuick presets:\n  ${QUICK_APP_PRESETS.join(', ')}\n\nEnhanced presets:\n  ${ENHANCED_APP_PRESETS.join(', ')}\n\nAll presets:\n  ${APP_PRESETS.join(', ')}\n\nOptions:\n  --runtime=quick|enhanced\n  --name="Human Name"\n  --short-name="Home Label"\n  --description="One sentence purpose"\n  --release-note="Initial release note"\n  --accent=#ff4d1f\n  --background=#10110f\n  --theme=#10110f\n  --orientation=portrait|landscape|any\n  --status=active|experimental\n  --order=100\n  --skip-health\n  --skip-build\n`);
}

export async function createApp(argv = process.argv.slice(2), root = process.cwd()) {
  const { slug, options } = parseArguments(argv);
  if (options.help || !slug) {
    printHelp();
    if (!slug) throw new Error('an application slug is required');
    return null;
  }

  const runtime = typeof options.runtime === 'string' ? options.runtime : 'quick';
  if (!APP_RUNTIMES.includes(runtime)) throw new Error(`Unknown runtime ${runtime}. Available: ${APP_RUNTIMES.join(', ')}`);

  const defaultPreset = runtime === 'enhanced' ? 'vite' : 'vanilla';
  const presetName = typeof options.preset === 'string' ? options.preset : defaultPreset;
  const preset = runtime === 'enhanced' ? getEnhancedPreset(presetName) : getPreset(presetName);
  const name = typeof options.name === 'string' ? options.name : humanize(slug);
  const shortName = typeof options['short-name'] === 'string' ? options['short-name'] : name.slice(0, 20);
  const description = typeof options.description === 'string' ? options.description : preset.description;
  const accent = typeof options.accent === 'string' ? options.accent : '#ff4d1f';
  const backgroundColor = typeof options.background === 'string' ? options.background : '#10110f';
  const themeColor = typeof options.theme === 'string' ? options.theme : backgroundColor;
  const version = '0.1.0';
  const releaseDateTime = new Date().toISOString();
  const releaseDate = releaseDateTime.slice(0, 10);
  const changelog = [typeof options['release-note'] === 'string' ? options['release-note'] : `Initial ${preset.label.toLowerCase()} preset release.`];
  const order = Number.parseInt(options.order || '100', 10);

  const config = {
    schemaVersion: 1,
    runtime,
    slug,
    name,
    shortName,
    description,
    version,
    releaseDate,
    releaseDateTime,
    changelog,
    status: typeof options.status === 'string' ? options.status : 'experimental',
    preset: presetName,
    accent,
    backgroundColor,
    themeColor,
    orientation: typeof options.orientation === 'string' ? options.orientation : 'portrait',
    cacheName: `${slug}-v${version}`,
    storageNamespace: `pocket-works:${slug}`,
    tags: [...preset.tags],
    order
  };

  const configErrors = validateAppConfig(config, slug);
  if (configErrors.length > 0) throw new Error(configErrors.join('\n'));

  const templateName = runtime === 'enhanced' ? '_enhanced-template' : '_template';
  const templateDirectory = path.join(root, 'apps', templateName);
  const appDirectory = path.join(root, 'apps', slug);
  if (await pathExists(appDirectory)) throw new Error(`apps/${slug} already exists`);

  const replacements = {
    '__APP_SLUG__': slug,
    '__APP_NAME__': escapeMarkup(name),
    '__APP_SHORT_NAME__': escapeMarkup(shortName),
    '__APP_DESCRIPTION__': escapeMarkup(description),
    '__APP_ACCENT__': accent,
    '__APP_BACKGROUND__': backgroundColor,
    '__APP_THEME__': themeColor,
    '__APP_VERSION__': version,
    '__APP_RELEASE_DATE__': releaseDate,
    '__APP_RELEASE_DATETIME__': releaseDateTime,
    '__APP_CHANGELOG_JSON__': JSON.stringify(changelog),
    '__APP_CACHE_VERSION__': config.cacheName,
    '__APP_STORAGE_NAMESPACE__': config.storageNamespace,
    '__APP_STATUS__': config.status,
    '__APP_PRESET__': presetName,
    '__APP_ORIENTATION__': config.orientation,
    '__APP_ORDER__': String(order),
    '__APP_TAGS_JSON__': JSON.stringify(config.tags),
    '__PRESET_LABEL__': escapeMarkup(preset.label),
    '__PRESET_DESCRIPTION__': preset.description,
    '__PRESET_MARKUP__': preset.markup,
    '__PRESET_SCRIPT__': preset.script || '',
    '__PRESET_STYLES__': preset.styles || '',
    '__ENHANCED_IMPORTS__': preset.imports || '',
    '__ENHANCED_SCRIPT__': preset.script || '',
    '__ENHANCED_CORE__': preset.core || '',
    '__ENHANCED_TEST__': preset.test || '',
    '__ENHANCED_STYLES__': preset.styles || ''
  };

  const manifest = {
    id: `/apps/${slug}/`,
    name,
    short_name: shortName,
    description,
    start_url: './',
    scope: './',
    display: 'standalone',
    display_override: ['standalone', 'fullscreen', 'minimal-ui'],
    orientation: config.orientation,
    background_color: backgroundColor,
    theme_color: themeColor,
    icons: [{ src: './icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
  };

  try {
    await cp(templateDirectory, appDirectory, { recursive: true });
    await transformDirectory(appDirectory, replacements);
    const iconDirectory = runtime === 'enhanced' ? path.join(appDirectory, 'public', 'icons') : path.join(appDirectory, 'icons');
    await mkdir(iconDirectory, { recursive: true });
    await writeFile(path.join(appDirectory, 'app.config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    if (runtime === 'quick') await writeFile(path.join(appDirectory, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const safeName = escapeMarkup(name);
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${safeName}">\n  <rect width="512" height="512" fill="${backgroundColor}"/>\n  <path d="M64 64h384v384H64z" fill="none" stroke="${accent}" stroke-width="22"/>\n  <path d="M96 352 256 96l160 256-160 64z" fill="${accent}" opacity=".92"/>\n  <text x="256" y="318" text-anchor="middle" fill="${backgroundColor}" font-family="system-ui,sans-serif" font-size="112" font-weight="900">${escapeMarkup(initials(name))}</text>\n</svg>\n`;
    await writeFile(path.join(iconDirectory, 'icon.svg'), icon, 'utf8');

    if (runtime === 'enhanced' && !options['skip-build']) buildEnhancedApp(root, slug);
    if (!options['skip-health']) runValidation(root);
  } catch (error) {
    await rm(appDirectory, { recursive: true, force: true });
    throw error;
  }

  console.log(`Pocket Forge created apps/${slug} with the ${runtime}/${presetName} preset.`);
  console.log('The app is self-registered by app.config.json; no shared registry file was modified.');
  console.log(`Open after npm run prepare:site: /apps/${slug}/`);
  return config;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  createApp().catch((error) => {
    console.error(`Pocket Forge failed: ${error.message}`);
    process.exit(1);
  });
}
