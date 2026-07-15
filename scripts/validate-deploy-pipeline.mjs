import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const [packageSource, wranglerSource, workflow] = await Promise.all([
  read('package.json'),
  read('wrangler.jsonc'),
  read('.github/workflows/validate-production.yml')
]);

const packageJson = JSON.parse(packageSource);
const wrangler = JSON.parse(wranglerSource);
const scripts = packageJson.scripts || {};
const deployCommand = 'npm run prepare:site && npm run validate:site';
const fullCiCommand = 'npm run prepare:sente-engine && npm run test:sente-ai && npm run health && npm run prepare:site && npm run validate:site';

if (scripts['deploy:site'] !== deployCommand) {
  errors.push(`package.json deploy:site must remain the fast Cloudflare production path: ${deployCommand}`);
}

if (scripts['ci:full'] !== fullCiCommand) {
  errors.push(`package.json ci:full must retain the complete validation path: ${fullCiCommand}`);
}

if (scripts['build:site'] !== 'npm run deploy:site') {
  errors.push('package.json build:site must remain an alias of deploy:site');
}

for (const forbidden of ['prepare:sente-engine', 'test:sente-ai', 'health', 'validate:all', 'test:forge', 'test:enhanced', 'build:enhanced', 'registry:build']) {
  if ((scripts['deploy:site'] || '').includes(forbidden)) {
    errors.push(`deploy:site must not include heavy or redundant step ${forbidden}`);
  }
}

if (wrangler.name !== 'pocket-works') {
  errors.push('wrangler.jsonc must deploy the pocket-works Worker');
}

if (wrangler.assets?.directory !== './dist-site') {
  errors.push('wrangler.jsonc assets.directory must remain ./dist-site');
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(wrangler.compatibility_date || '')) {
  errors.push('wrangler.jsonc must define an explicit compatibility_date');
}

if (!workflow.includes('npm run ci:full')) {
  errors.push('GitHub production validation workflow must run npm run ci:full');
}

if (workflow.includes('git add apps.json')) {
  errors.push('GitHub workflows must never commit the generated application registry');
}

if (workflow.includes('npm run deploy:site') || workflow.includes('npm run build:site')) {
  errors.push('GitHub production validation must not substitute the fast deploy path for ci:full');
}

if (errors.length > 0) {
  console.error(`Deployment pipeline validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Deployment pipeline separation is valid: Cloudflare packages dist-site and GitHub CI owns exhaustive validation.');
