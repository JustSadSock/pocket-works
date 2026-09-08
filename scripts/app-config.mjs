import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const APP_CONFIG_FILE = 'app.config.json';
export const APP_CONFIG_SCHEMA_VERSION = 1;
export const QUICK_APP_PRESETS = ['vanilla', 'interactive', 'canvas', 'game-2d', 'audio'];
export const ENHANCED_APP_PRESETS = ['vite', 'pixi', 'phaser', 'tone'];
export const APP_PRESETS = [...QUICK_APP_PRESETS, ...ENHANCED_APP_PRESETS];
export const APP_RUNTIMES = ['quick', 'enhanced'];
export const APP_STATUSES = ['active', 'experimental', 'archived'];
export const APP_ORIENTATIONS = ['any', 'portrait', 'landscape'];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const colorPattern = /^#[0-9a-f]{6}$/i;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const STATUS_ALIASES = new Map([
  ['active', 'active'], ['live', 'active'], ['enabled', 'active'], ['current', 'active'], ['published', 'active'],
  ['experimental', 'experimental'], ['experiment', 'experimental'], ['beta', 'experimental'], ['preview', 'experimental'], ['dev', 'experimental'], ['development', 'experimental'],
  ['archived', 'archived'], ['archive', 'archived'], ['inactive', 'archived'], ['disabled', 'archived'], ['deprecated', 'archived']
]);
const RUNTIME_ALIASES = new Map([
  ['quick', 'quick'], ['standard', 'quick'], ['basic', 'quick'], ['static', 'quick'],
  ['enhanced', 'enhanced'], ['advanced', 'enhanced'], ['vite', 'enhanced']
]);
const ORIENTATION_ALIASES = new Map([
  ['any', 'any'], ['auto', 'any'], ['both', 'any'], ['free', 'any'], ['unspecified', 'any'],
  ['portrait', 'portrait'], ['vertical', 'portrait'],
  ['landscape', 'landscape'], ['horizontal', 'landscape']
]);

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeAlias(value, aliases) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  return aliases.get(normalized) ?? normalized;
}

function normalizeColor(value) {
  if (typeof value !== 'string') return value;
  let color = value.trim();
  if (/^[0-9a-f]{6}$/i.test(color)) color = `#${color}`;
  if (/^#[0-9a-f]{3}$/i.test(color)) color = `#${[...color.slice(1)].map((digit) => digit.repeat(2)).join('')}`;
  return color.toLowerCase();
}

function normalizeDate(value) {
  if (typeof value !== 'string') return value;
  const source = value.trim();
  if (isoDatePattern.test(source)) return source;
  const parsed = Date.parse(source);
  if (Number.isNaN(parsed)) return source;
  return new Date(parsed).toISOString().slice(0, 10);
}

function normalizeDateTime(value, fallbackDate) {
  if (typeof value !== 'string' || value.trim() === '') {
    return isoDatePattern.test(fallbackDate || '') ? `${fallbackDate}T00:00:00Z` : value;
  }
  let source = value.trim();
  if (isoDatePattern.test(source)) source = `${source}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(source)) source = `${source.replace(' ', 'T')}:00Z`;
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(source)) source = `${source.replace(' ', 'T')}Z`;
  const parsed = Date.parse(source);
  if (Number.isNaN(parsed)) return source;
  return new Date(parsed).toISOString();
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(trimmed).filter((item) => typeof item !== 'string' || item !== '');
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()];
  return value;
}

export function normalizeAppConfig(source, directoryName = source?.slug) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const config = { ...source };
  for (const key of ['slug', 'name', 'shortName', 'description', 'preset', 'cacheName', 'storageNamespace']) config[key] = trimmed(config[key]);

  if (typeof config.schemaVersion === 'string' && /^\d+$/.test(config.schemaVersion.trim())) config.schemaVersion = Number(config.schemaVersion.trim());
  if (typeof config.order === 'string' && /^\d+$/.test(config.order.trim())) config.order = Number(config.order.trim());
  if (typeof config.version === 'string') config.version = config.version.trim().replace(/^v(?=\d)/i, '');
  if (typeof config.preset === 'string') config.preset = config.preset.toLowerCase();
  config.status = normalizeAlias(config.status, STATUS_ALIASES);
  config.runtime = normalizeAlias(config.runtime, RUNTIME_ALIASES);
  config.orientation = normalizeAlias(config.orientation, ORIENTATION_ALIASES);
  config.accent = normalizeColor(config.accent);
  config.backgroundColor = normalizeColor(config.backgroundColor);
  config.themeColor = normalizeColor(config.themeColor);
  config.tags = normalizeList(config.tags);
  config.changelog = normalizeList(config.changelog);

  const rawReleaseDateTime = config.releaseDateTime;
  config.releaseDate = normalizeDate(config.releaseDate);
  config.releaseDateTime = normalizeDateTime(rawReleaseDateTime, config.releaseDate);
  if ((!config.releaseDate || !isoDatePattern.test(config.releaseDate)) && typeof config.releaseDateTime === 'string' && !Number.isNaN(Date.parse(config.releaseDateTime))) {
    config.releaseDate = new Date(config.releaseDateTime).toISOString().slice(0, 10);
  }

  const slug = typeof config.slug === 'string' && config.slug ? config.slug : directoryName;
  if ((config.cacheName == null || config.cacheName === '') && slug) config.cacheName = `${slug}-v${config.version || '1.0.0'}`;
  if ((config.storageNamespace == null || config.storageNamespace === '') && slug) config.storageNamespace = `pocket-works:${slug}`;
  if ((config.shortName == null || config.shortName === '') && typeof config.name === 'string') config.shortName = config.name.slice(0, 20);
  if (config.runtime == null || config.runtime === '') config.runtime = 'quick';
  if (config.orientation == null || config.orientation === '') config.orientation = 'any';
  if (config.schemaVersion == null) config.schemaVersion = APP_CONFIG_SCHEMA_VERSION;

  return config;
}

function requireString(config, key, errors) {
  if (typeof config[key] !== 'string' || config[key].trim() === '') errors.push(`${key} must be a non-empty string`);
}

export function runtimeForConfig(config) {
  return normalizeAlias(config?.runtime || 'quick', RUNTIME_ALIASES);
}

export function validateAppConfig(source, directoryName = source?.slug) {
  const errors = [];

  if (!source || typeof source !== 'object' || Array.isArray(source)) return ['config must be a JSON object'];
  const config = normalizeAppConfig(source, directoryName);

  if (config.schemaVersion !== APP_CONFIG_SCHEMA_VERSION) errors.push(`schemaVersion must equal ${APP_CONFIG_SCHEMA_VERSION}`);

  for (const key of ['slug', 'name', 'shortName', 'description', 'version', 'releaseDate', 'releaseDateTime', 'status', 'preset', 'accent', 'backgroundColor', 'themeColor', 'orientation', 'cacheName', 'storageNamespace']) requireString(config, key, errors);

  const runtime = runtimeForConfig(config);
  if (!APP_RUNTIMES.includes(runtime)) errors.push(`runtime must resolve to one of: ${APP_RUNTIMES.join(', ')}`);
  if (!slugPattern.test(config.slug || '')) errors.push('slug must be lowercase kebab-case');
  if (directoryName && config.slug !== directoryName) errors.push(`slug must match directory name ${directoryName}`);
  if (!semverPattern.test(config.version || '')) errors.push('version must resolve to semantic versioning');
  if (!isoDatePattern.test(config.releaseDate || '') || Number.isNaN(Date.parse(`${config.releaseDate}T00:00:00Z`))) errors.push('releaseDate must resolve to a valid calendar date');
  if (!isoDateTimePattern.test(config.releaseDateTime || '') || Number.isNaN(Date.parse(config.releaseDateTime || ''))) errors.push('releaseDateTime must resolve to an ISO 8601 timestamp');
  if (!APP_STATUSES.includes(config.status)) errors.push(`status must resolve to one of: ${APP_STATUSES.join(', ')}`);

  const allowedPresets = runtime === 'enhanced' ? ENHANCED_APP_PRESETS : QUICK_APP_PRESETS;
  if (!allowedPresets.includes(config.preset)) errors.push(`preset ${config.preset} is not valid for the ${runtime} runtime; expected one of: ${allowedPresets.join(', ')}`);
  if (!APP_ORIENTATIONS.includes(config.orientation)) errors.push(`orientation must resolve to one of: ${APP_ORIENTATIONS.join(', ')}`);

  for (const key of ['accent', 'backgroundColor', 'themeColor']) if (!colorPattern.test(config[key] || '')) errors.push(`${key} must resolve to a six-digit hex color`);
  if (!Array.isArray(config.tags) || config.tags.length === 0 || config.tags.some((tag) => typeof tag !== 'string' || tag.trim() === '')) errors.push('tags must contain at least one non-empty string');
  if (!Array.isArray(config.changelog) || config.changelog.length === 0 || config.changelog.length > 8 || config.changelog.some((note) => typeof note !== 'string' || note.trim() === '')) errors.push('changelog must contain between 1 and 8 non-empty strings');
  if (!Number.isInteger(config.order) || config.order < 0) errors.push('order must resolve to a non-negative integer');
  if (typeof config.shortName === 'string' && config.shortName.length > 20) errors.push('shortName must be 20 characters or fewer');

  const expectedCachePrefix = `${config.slug}-`;
  if (typeof config.cacheName === 'string' && !config.cacheName.startsWith(expectedCachePrefix)) errors.push(`cacheName must start with ${expectedCachePrefix}`);
  const expectedStorageNamespace = `pocket-works:${config.slug}`;
  if (config.storageNamespace !== expectedStorageNamespace) errors.push(`storageNamespace must equal ${expectedStorageNamespace}`);

  return errors;
}

export function toRegistryEntry(source) {
  const config = normalizeAppConfig(source);
  return {
    slug: config.slug,
    name: config.name,
    shortName: config.shortName,
    description: config.description,
    path: `./apps/${config.slug}/`,
    status: config.status,
    version: config.version,
    updatedAt: config.releaseDateTime,
    changelog: [...config.changelog],
    accent: config.accent,
    tags: [...config.tags],
    preset: config.preset,
    runtime: runtimeForConfig(config),
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
    const appDirectory = path.join(appsDirectory, entry.name);
    const appEntries = await readdir(appDirectory, { withFileTypes: true });
    const hasConfig = appEntries.some((child) => child.isFile() && child.name === APP_CONFIG_FILE);
    const isReservation = appEntries.some((child) => child.isFile() && child.name === '.branch-reservation');
    if (!hasConfig) {
      const visibleEntries = appEntries.filter((child) => !child.name.startsWith('.'));
      if (isReservation || visibleEntries.length === 0) continue;
      errors.push(`${path.join('apps', entry.name, APP_CONFIG_FILE)}: missing ${APP_CONFIG_FILE}`);
      continue;
    }

    const relativePath = path.join('apps', entry.name, APP_CONFIG_FILE);
    try {
      const source = await readFile(path.join(root, relativePath), 'utf8');
      const rawConfig = JSON.parse(source);
      const config = normalizeAppConfig(rawConfig, entry.name);
      const configErrors = validateAppConfig(config, entry.name);
      errors.push(...configErrors.map((message) => `${relativePath}: ${message}`));
      configs.push(config);
    } catch (error) {
      errors.push(`${relativePath}: ${error.message}`);
    }
  }

  const uniqueFields = [['slug', new Map()], ['cacheName', new Map()], ['storageNamespace', new Map()]];
  for (const config of configs) {
    for (const [field, values] of uniqueFields) {
      const value = config?.[field];
      if (!value) continue;
      if (values.has(value)) errors.push(`${field} ${value} is duplicated by ${values.get(value)} and ${config.slug}`);
      values.set(value, config.slug);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  return configs.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

export async function buildRegistryEntries(root = process.cwd()) {
  return (await collectAppConfigs(root)).map(toRegistryEntry);
}
