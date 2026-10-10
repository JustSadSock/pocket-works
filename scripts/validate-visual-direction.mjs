import { getRecentArchitectureProfiles, validateArchitecturalDiversity } from './visual-architecture.mjs';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateVisualDirection } from './visual-direction.mjs';

const root = process.cwd();
const visualFile = /\.(?:css|html|svg|png|jpe?g|webp|avif|glb|gltf|blend\d*|aseprite|gdshader|tscn)$/i;
const visualSourceFile = /(?:^|\/)(?:visual|render|animation|motion|scene|art|sprite|ui)[\w-]*\.(?:js|ts|gd)$/i;

export function visualChanges(files) {
  const byApp = new Map();
  for (const filename of files) {
    const match = /^apps\/([^/]+)\/(.+)$/.exec(filename);
    if (!match || match[1].startsWith('_')) continue;
    const [, slug, relative] = match;
    const existing = byApp.get(slug) || { newApp: false, visual: false, files: [] };
    existing.files.push(relative);
    if (relative === 'app.config.json') existing.configChanged = true;
    if (visualFile.test(relative) || visualSourceFile.test(relative)) existing.visual = true;
    byApp.set(slug, existing);
  }
  return byApp;
}

function changedFromGit(base, head) {
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', base, head], { encoding: 'utf8' });
  if (result.status !== 0 || result.error) throw new Error(result.stderr || result.error?.message || 'git diff failed');
  return result.stdout.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
}

async function fileExists(filename) {
  try { await access(filename); return true; } catch { return false; }
}

function normalizedLines(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/#[0-9a-f]{3,8}\b/gi, '#COLOR')
    .replace(/__[A-Z_]+__/g, 'TOKEN')
    .split(/\r?\n/).map(line => line.trim().replace(/\s+/g, ' '))
    .filter(line => line.length >= 12 && !line.startsWith('@media'));
}

export function retainedScaffoldShare(source, template) {
  const lines = normalizedLines(template);
  const seen = new Set(normalizedLines(source));
  return lines.length ? lines.filter(line => seen.has(line)).length / lines.length : 0;
}

async function checkApp(slug, { newApp = false, visual = false } = {}) {
  const base = path.join(root, 'apps', slug);
  const document = path.join(base, 'visual-direction.json');
  const errors = [];
  if (!(await fileExists(document))) {
    if (newApp || visual) errors.push(`apps/${slug}/visual-direction.json is required for new apps and visible design work`);
    return errors;
  }
  let record;
  try { record = JSON.parse(await readFile(document, 'utf8')); }
  catch (error) { return [`apps/${slug}/visual-direction.json cannot be read: ${error.message}`]; }
  errors.push(...validateVisualDirection(record, slug).map(e => `apps/${slug}: ${e}`));
  if (newApp || visual) {
    if (record.schemaVersion !== 2) {
      errors.push(`apps/${slug}: visible work requires visual direction v2 with a real interaction architecture`);
    } else {
      const neighbors = await getRecentArchitectureProfiles(root, slug);
      errors.push(...validateArchitecturalDiversity(record.architecture, neighbors, slug).map(e => `apps/${slug}: ${e}`));
    }
  }
  if (!newApp) return errors;

  // A generated icon with a different app name is not a new art direction.
  const config = JSON.parse(await readFile(path.join(base, 'app.config.json'), 'utf8'));
  const icon = path.join(base, config.runtime === 'enhanced' ? 'public/icons/icon.svg' : 'icons/icon.svg');
  if (await fileExists(icon)) {
    const data = await readFile(icon, 'utf8');
    if (data.includes('M64 64h384v384H64z') && data.includes('M96 352 256 96l160 256-160 64z')) {
      errors.push(`apps/${slug}: replace Pocket Forge's default monogram icon with a product-specific design`);
    }
  }
  if (config.runtime !== 'godot') {
    const stylesheet = path.join(base, config.runtime === 'enhanced' ? 'source/styles.css' : 'styles.css');
    const template = path.join(root, 'apps', config.runtime === 'enhanced' ? '_enhanced-template' : '_template',
      config.runtime === 'enhanced' ? 'source/styles.css' : 'styles.css');
    if (await fileExists(stylesheet) && await fileExists(template)) {
      const retained = retainedScaffoldShare(await readFile(stylesheet,'utf8'), await readFile(template,'utf8'));
      if (retained >= .76) errors.push(`apps/${slug}: still retains ${Math.round(retained * 100)}% of generic starter CSS; create the product's actual layout and materials`);
    }
  }
  return errors;
}

async function main() {
  const explicit = process.argv.find(arg => arg.startsWith('--app='));
  const changed = process.argv.includes('--changed');
  const targets = new Map();
  if (explicit) targets.set(explicit.slice(6), { newApp: false, visual: true });
  else if (changed) {
    const base = process.env.BASE_SHA;
    if (!base) throw new Error('--changed requires BASE_SHA');
    const head = process.env.HEAD_SHA || 'HEAD';
    const files = changedFromGit(base, head);
    const changedApps = visualChanges(files);
    for (const [slug, metadata] of changedApps) {
      const isNew = spawnSync('git', ['cat-file','-e',`${base}:apps/${slug}/app.config.json`], {encoding:'utf8'}).status !== 0;
      const existingDirection = await fileExists(path.join(root,'apps',slug,'visual-direction.json'));
      if (isNew || metadata.visual || existingDirection) targets.set(slug, { newApp: isNew, visual: metadata.visual });
    }
  } else throw new Error('Use --app=<slug> or --changed');
  const failures = [];
  for (const [slug, flags] of targets) failures.push(...await checkApp(slug, flags));
  if (failures.length) {
    console.error('Creative production gate failed:');
    failures.forEach(error => console.error(' - '+error));
    process.exitCode = 1;
  } else console.log(`Creative production gate passed for ${targets.size} app(s). A passing text contract still requires actual screenshot/motion review.`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch(error => { console.error(error.message); process.exitCode=1; });
}
