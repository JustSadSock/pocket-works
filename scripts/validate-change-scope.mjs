import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA || 'HEAD';
const allowPlatformChanges = process.env.ALLOW_PLATFORM_CHANGES === 'true';

if (!base) {
  console.log('Change-scope validation skipped: BASE_SHA is not set.');
  process.exit(0);
}

const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMRD', `${base}...${head}`], {
  encoding: 'utf8',
  shell: false
});

if (result.error || result.status !== 0) {
  console.error(result.stderr || result.error?.message || 'git diff failed');
  process.exit(result.status || 1);
}

const changedFiles = result.stdout.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
const nameStatus = spawnSync('git', ['diff', '--name-status', `${base}...${head}`], { encoding: 'utf8', shell: false });
if (nameStatus.error || nameStatus.status !== 0) {
  console.error(nameStatus.stderr || nameStatus.error?.message || 'git diff --name-status failed');
  process.exit(nameStatus.status || 1);
}
const snapshotErrors = [];
for (const line of nameStatus.stdout.split(/\r?\n/).filter(Boolean)) {
  const [status, ...paths] = line.split('\t');
  if (paths.some(file => /^pocketnet\/module-versions\/[^/]+\/v[1-9][0-9]*\.ts$/.test(file)) && status !== 'A') {
    snapshotErrors.push(`Pinned PocketNet module versions are immutable: ${line}`);
  }
}
if (snapshotErrors.length) {
  for (const error of snapshotErrors) console.error(error);
  process.exit(1);
}
const appSlugs = [...new Set(changedFiles
  .map((file) => file.match(/^apps\/([^/]+)\//)?.[1])
  .filter((slug) => slug && !slug.startsWith('_'))
)];

if (appSlugs.length === 0) {
  console.log(`Infrastructure-only change scope accepted (${changedFiles.length} file(s)).`);
  process.exit(0);
}

if (allowPlatformChanges) {
  console.log(`Platform change scope accepted by label for app(s): ${appSlugs.join(', ')}.`);
  process.exit(0);
}

const errors = [];
if (appSlugs.length > 1) {
  errors.push(`an application PR may modify only one app directory; found: ${appSlugs.join(', ')}`);
}

const appSlug = appSlugs[0];
for (const file of changedFiles) {
  const appPath = file.startsWith(`apps/${appSlug}/`);
  const newSnapshot = new RegExp(`^pocketnet/module-versions/${appSlug}/v[1-9][0-9]*\\.ts$`).test(file);
  const snapshotLock = file === 'pocketnet/modules.lock.json';
  const sourceChanged = changedFiles.includes(`apps/${appSlug}/server/module.ts`);
  if (!appPath && !(sourceChanged && (newSnapshot || snapshotLock))) {
    errors.push(`${file} is outside apps/${appSlug}/ or its explicitly pinned PocketNet release`);
  }
}

if (changedFiles.includes('pocketnet/modules.lock.json')) {
  const oldLock = spawnSync('git', ['show', `${base}:pocketnet/modules.lock.json`], { encoding: 'utf8', shell: false });
  if (oldLock.status !== 0) {
    errors.push('Cannot verify PocketNet lock isolation against base commit');
  } else {
    try {
      const before = JSON.parse(oldLock.stdout);
      const after = JSON.parse(readFileSync('pocketnet/modules.lock.json', 'utf8'));
      for (const slug of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (slug !== appSlug && JSON.stringify(before[slug]) !== JSON.stringify(after[slug])) {
          errors.push(`PocketNet lock record for unrelated game ${slug} was changed`);
        }
      }
    } catch (error) {
      errors.push(`Unable to validate PocketNet lock contents: ${error.message}`);
    }
  }
}
if (errors.length > 0) {
  console.error('Application PR scope validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  console.error('- Move shared/platform work into a separate PR or add the platform-change label deliberately.');
  process.exit(1);
}

console.log(`Application PR is isolated to apps/${appSlug}/ (${changedFiles.length} file(s)).`);
