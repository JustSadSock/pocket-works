import assert from 'node:assert/strict';
import { normalizeAppConfig, validateAppConfig } from './app-config.mjs';

const base = {
  schemaVersion: 1,
  slug: 'demo-app',
  name: 'Demo App',
  shortName: 'Demo',
  description: 'Demo application',
  version: '1.2.3',
  releaseDate: '2026-09-08',
  releaseDateTime: '2026-09-08T12:00:00+03:00',
  status: 'active',
  preset: 'vite',
  runtime: 'enhanced',
  accent: '#112233',
  backgroundColor: '#223344',
  themeColor: '#334455',
  orientation: 'landscape',
  cacheName: 'demo-app-v1.2.3',
  storageNamespace: 'pocket-works:demo-app',
  tags: ['demo'],
  changelog: ['Initial release'],
  order: 1
};

assert.deepEqual(validateAppConfig(base, 'demo-app'), []);

const tolerant = normalizeAppConfig({
  ...base,
  schemaVersion: '1',
  version: 'v1.2.3',
  releaseDate: 'September 8, 2026',
  releaseDateTime: '2026-09-08 23:15:00',
  status: 'Published',
  runtime: 'Advanced',
  preset: 'VITE',
  orientation: 'horizontal',
  accent: '#abc',
  backgroundColor: '223344',
  themeColor: '#DEF',
  tags: 'demo',
  changelog: 'Initial release',
  order: '1'
}, 'demo-app');

assert.equal(tolerant.schemaVersion, 1);
assert.equal(tolerant.version, '1.2.3');
assert.equal(tolerant.releaseDate, '2026-09-08');
assert.equal(tolerant.releaseDateTime, '2026-09-08T23:15:00.000Z');
assert.equal(tolerant.status, 'active');
assert.equal(tolerant.runtime, 'enhanced');
assert.equal(tolerant.preset, 'vite');
assert.equal(tolerant.orientation, 'landscape');
assert.equal(tolerant.accent, '#aabbcc');
assert.equal(tolerant.backgroundColor, '#223344');
assert.equal(tolerant.themeColor, '#ddeeff');
assert.deepEqual(tolerant.tags, ['demo']);
assert.deepEqual(tolerant.changelog, ['Initial release']);
assert.equal(tolerant.order, 1);
assert.deepEqual(validateAppConfig(tolerant, 'demo-app'), []);

const timezoneBoundary = normalizeAppConfig({
  ...base,
  releaseDate: '2026-09-08',
  releaseDateTime: '2026-09-08T01:15:00+03:00'
}, 'demo-app');
assert.equal(timezoneBoundary.releaseDate, '2026-09-08');
assert.equal(timezoneBoundary.releaseDateTime, '2026-09-07T22:15:00.000Z');
assert.deepEqual(validateAppConfig(timezoneBoundary, 'demo-app'), []);

const withDefaults = normalizeAppConfig({
  ...base,
  shortName: '',
  cacheName: '',
  storageNamespace: '',
  orientation: 'auto'
}, 'demo-app');
assert.equal(withDefaults.shortName, 'Demo App');
assert.equal(withDefaults.cacheName, 'demo-app-v1.2.3');
assert.equal(withDefaults.storageNamespace, 'pocket-works:demo-app');
assert.equal(withDefaults.orientation, 'any');
assert.deepEqual(validateAppConfig(withDefaults, 'demo-app'), []);

const invalid = { ...base, status: 'banana', slug: 'Wrong Slug' };
const errors = validateAppConfig(invalid, 'demo-app');
assert(errors.some((error) => error.includes('slug')));
assert(errors.some((error) => error.includes('status')));

console.log('App config normalization tests passed');
