import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const [packageSource, wranglerSource, workflow, godotWorkflow, prepareSite, validateSite] = await Promise.all([
  read('package.json'),
  read('wrangler.jsonc'),
  read('.github/workflows/validate-production.yml'),
  read('.github/workflows/godot-web-runtime.yml'),
  read('scripts/prepare-site.mjs'),
  read('scripts/validate-site.mjs')
]);

const packageJson = JSON.parse(packageSource);
const wrangler = JSON.parse(wranglerSource);
const scripts = packageJson.scripts || {};
const deployCommand = 'npm run build:enhanced && npm run prepare:site && npm run validate:site';
const fullCiCommand = 'npm run prepare:sente-engine && npm run test:sente-ai && npm run health && npm run prepare:site && npm run validate:site';

if (scripts['deploy:site'] !== deployCommand) {
  errors.push(`package.json deploy:site must build Enhanced apps before Cloudflare production assembly: ${deployCommand}`);
}

if (scripts['ci:full'] !== fullCiCommand) {
  errors.push(`package.json ci:full must retain the complete validation path: ${fullCiCommand}`);
}

if (scripts['build:site'] !== 'npm run deploy:site') {
  errors.push('package.json build:site must remain an alias of deploy:site');
}

for (const forbidden of ['prepare:sente-engine', 'test:sente-ai', 'health', 'validate:all', 'test:forge', 'test:enhanced', 'build:godot', 'registry:build']) {
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

if (!prepareSite.includes('data-pocketworks-wasm-chunks') || !prepareSite.includes('WASM_CHUNK_SIZE')) {
  errors.push('prepare-site must split oversized Godot WASM into Cloudflare-safe chunks and inject the reconstruction bootstrap');
}

if (!validateSite.includes('CLOUDFLARE_ASSET_LIMIT') || !validateSite.includes('Buffer.concat(parts)')) {
  errors.push('validate-site must enforce Cloudflare\'s 25 MiB asset limit and verify chunked Godot WASM round-trips');
}

if (!workflow.includes('npm run ci:full')) {
  errors.push('GitHub production validation workflow must run npm run ci:full');
}

if (workflow.includes('git add apps.json')) {
  errors.push('GitHub workflows must never commit the generated application registry');
}

if (workflow.includes('npm run deploy:site') || workflow.includes('npm run build:site')) {
  errors.push('GitHub production validation must not substitute the production deploy path for ci:full');
}

const godotBotSkip = "github.actor != 'github-actions[bot]' || !contains(github.event.head_commit.message, '[godot-export]')";
if (!godotWorkflow.includes(godotBotSkip)) {
  errors.push('Godot Web Runtime may skip [godot-export] pushes only when the actor is github-actions[bot]; squash/main commits must still run full validation');
}

if (errors.length > 0) {
  console.error(`Deployment pipeline validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Deployment pipeline is valid: Cloudflare builds browser-native apps and packages committed Godot exports, while GitHub CI owns heavyweight generation and exhaustive validation.');
