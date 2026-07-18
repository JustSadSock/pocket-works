import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [launcher, index, rootWorker, prepareSite, vetrolomWorker, vetrolomConfig] = await Promise.all([
  read('launcher-update-all-v3.js'),
  read('index.html'),
  read('sw.js'),
  read('scripts/prepare-site.mjs'),
  read('apps/vetrolom/sw.js'),
  read('apps/vetrolom/app.config.json')
]);
const errors = [];
const requireToken = (source, token, label) => { if (!source.includes(token)) errors.push(`${label} must include ${token}`); };
for (const token of ['APP_TIMEOUT','withTimeout(updateApplicationCore','full update','timedOut','skipped —','UPDATE_CONCURRENCY=2','verifyServerRelease']) requireToken(launcher, token, 'launcher watchdog');
for (const source of [index, rootWorker, prepareSite]) requireToken(source, 'launcher-update-all-v3.js', 'launcher deployment');
for (const token of ['AbortController','Promise.allSettled','caches.match(canonical)','RUNTIME_SHELL','APP_VERSION=\'1.5.2\'']) requireToken(vetrolomWorker, token, 'Vetrolom worker');
const config = JSON.parse(vetrolomConfig);
if (config.version !== '1.5.2' || config.cacheName !== 'vetrolom-v1.5.2') errors.push('Vetrolom config must match worker 1.5.2');
if (errors.length) {
  console.error(`Update watchdog validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log('Verified bulk update watchdog and Vetrolom resilient precache contract are valid.');
