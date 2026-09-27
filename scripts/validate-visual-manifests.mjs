import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isList = (v) => Array.isArray(v) && v.length > 0 && v.every(isText);
const isUnit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function validateVisualManifest(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['manifest must be an object'];
  if (data.version !== 1) errors.push('version must be 1');
  for (const field of ['direction', 'lighting', 'camera']) if (!isText(data[field])) errors.push(`${field} must be nonempty text`);
  for (const field of ['shapeLanguage', 'palette', 'effects', 'avoid']) if (!isList(data[field])) errors.push(`${field} must be a nonempty string array`);
  if (Array.isArray(data.palette) && data.palette.some((v) => !/^#[0-9a-fA-F]{6}$/.test(v))) errors.push('palette must contain #RRGGBB colors');
  if (!Array.isArray(data.roughness) || data.roughness.length !== 2 || !data.roughness.every(isUnit) || data.roughness[0] > data.roughness[1]) errors.push('roughness must be an ascending [min, max] in 0..1');
  if (!['low', 'medium', 'high'].includes(data.contrast)) errors.push('contrast must be low, medium or high');
  if (!['low', 'medium', 'high'].includes(data.detailScale)) errors.push('detailScale must be low, medium or high');
  if (!isUnit(data.decorationDensity)) errors.push('decorationDensity must be in 0..1');
  return errors;
}

export async function validateAppVisualManifests(root) {
  const apps = await readdir(join(root, 'apps'), { withFileTypes: true });
  const failures = [];
  let count = 0;
  for (const app of apps) {
    if (!app.isDirectory() || app.name.startsWith('_')) continue;
    const path = join(root, 'apps', app.name, 'visual.pw.json');
    let text;
    try { text = await readFile(path, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    count++;
    try {
      for (const error of validateVisualManifest(JSON.parse(text))) failures.push(`${app.name}: ${error}`);
    } catch (error) { failures.push(`${app.name}: invalid JSON (${error.message})`); }
  }
  return { count, failures };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { count, failures } = await validateAppVisualManifests(process.cwd());
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log(`Visual manifests valid: ${count} app(s).`);
}
