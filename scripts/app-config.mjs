import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const APP_CONFIG_FILE = 'app.config.json';
export const APP_CONFIG_SCHEMA_VERSION = 1;
export const APP_PRESETS = ['vanilla', 'interactive', 'canvas', 'game-2d', 'audio'];
export const APP_STATUSES = ['active', 'experimental', 'archived'];
export const APP_ORIENTATIONS = ['any', 'portrait', 'landscape'];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const colorPattern = /^#[0-9a-f]{6}$/i;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function requireString(config, key, errors) {
  if (typeof config[key] !== 'string' || config[key].trim() === '') {
    errors.push(`${key} must be a non-empty string`);
  }
}

export function validateAppConfig(config, directoryName = config?.slug) {
  const errors = [];

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['config must be a JSON object'];
  }

  if (config.schemaVersion !== APP_CONFIG_SCHEMA_VERSION) {
    errors.push(`schemaVersion must equal ${APP_CONFIG_SCHEMA_VERSION}`);
  }

  for (const key of [
    'slug',
    'name',
    'shortName',
    'description',
    'version',
    'releaseDate',
    'status',
    'preset',
    'accent',
    'backgroundColor',
    'themeColor',
    'orientation',
    'cacheName',
    'storageNamespace'
  ]) {
    requireString(config, key, errors);
  }

  if (!slugPattern.test(config.slug || '')) errors.push('slug must be lowercase kebab-case');
  if (directoryName && config.slug !== directoryName) errors.push(`slug must match directory name ${directoryName}`);
  if (!semverPattern.test(config.version || '')) errors.push('version must use semantic versioning');
  if (!isoDatePattern.test(config.releaseDate || '') || Number.isNaN(Date.parse(`${config.releaseDate}T00:00:00Z`))) {
    errors.push('releaseDate must use a valid YYYY-MM-DD date');
  }
  if (!APP_STATUSES.includes(config.status)) errors.push(`status must be one of: ${APP_STATUSES.join(', ')}`);
  if (!APP_PRESETS.includes(config.preset)) errors.push(`preset must be one of: ${APP_PRESETS.join(', ')}`);
  if (!APP_ORIENTATIONS.includes(config.orientation)) errors.push(`orientation must be one of: ${APP_ORIENTATIONS.join(', ')}`);

  for (const key of ['accent', 'backgroundColor', 'themeColor']) {
    if (!colorPattern.test(config[key] || '')) errors.push(`${key} must be a six-digit hex color`);
  }

  if (!Array.isArray(config.tags) || config.tags.length === 0 || config.tags.some((tag) => typeof tag !== 'string' || tag.trim() === '')) {
    errors.push('tags must be a non-empty array of non-empty strings');
  }

  if (!Array.isArray(config.changelog) || config.changelog.length === 0 || config.changelog.length > 8 || config.changelog.some((note) => typeof note !== 'string' || note.trim() === '')) {
    errors.push('changelog must contain between 1 and 8 non-empty strings');
  }

  if (!Number.isInteger(config.order) || config.order < 0) errors.push('order must be a non-negative integer');
  if (typeof config.shortName === 'string' && config.shortName.length > 20) errors.push('shortName must be 20 characters or fewer');

  const expectedCachePrefix = `${config.slug}-`;
  if (typeof config.cacheName === 'string' && !config.cacheName.startsWith(expectedCachePrefix)) {
    errors.push(`cacheName must start with ${expectedCachePrefix}`);
  }

  const expectedStorageNamespace = `pocket-works:${config.slug}`;
  if (config.storageNamespace !== expectedStorageNamespace) {
    errors.push(`storageNamespace must equal ${expectedStorageNamespace}`);
  }

  return errors;
}

export function toRegistryEntry(config) {
  return {
    slug: config.slug,
    name: config.name,
    shortName: config.shortName,
    description: config.description,
    path: `./apps/${config.slug}/`,
    status: config.status,
    version: config.version,
    updatedAt: config.releaseDate,
    changelog: [...config.changelog],
    accent: config.accent,
    tags: [...config.tags],
    preset: config.preset,
    storageNamespace: config.storageNamespace
  };
}

export function formatRegistry(entries) {
  return `${JSON.stringify(entries, null, 2)}\n`;
}

export async function collectAppConfigs(root = process.cwd()) {
  const appsDirectory = path.join(root, 'apps');
  const entries = await readdir(appsDirectory, { withFileTypes: true });
  const configs = [];
  const errors = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;

    const relativePath = path.join('apps', entry.name, APP_CONFIG_FILE);
    try {
      const source = await readFile(path.join(root, relativePath), 'utf8');
      const config = JSON.parse(source);
      const configErrors = validateAppConfig(config, entry.name);
      errors.push(...configErrors.map((message) => `${relativePath}: ${message}`));
      configs.push(config);
    } catch (error) {
      errors.push(`${relativePath}: ${error.message}`);
    }
  }

  const uniqueFields = [
    ['slug', new Map()],
    ['cacheName', new Map()],
    ['storageNamespace', new Map()]
  ];

  for (const config of configs) {
    for (const [field, values] of uniqueFields) {
      const value = config?.[field];
      if (!value) continue;
      if (values.has(value)) errors.push(`${field} ${value} is duplicated by ${values.get(value)} and ${config.slug}`);
      values.set(value, config.slug);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return configs.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

export async function buildRegistryEntries(root = process.cwd()) {
  return (await collectAppConfigs(root)).map(toRegistryEntry);
}
