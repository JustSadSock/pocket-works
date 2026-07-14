import { spawnSync } from 'node:child_process';

const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA || 'HEAD';
const allowPlatformChanges = process.env.ALLOW_PLATFORM_CHANGES === 'true';

if (!base) {
  console.log('Change-scope validation skipped: BASE_SHA is not set.');
  process.exit(0);
}

const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMRD', base, head], {
  encoding: 'utf8',
  shell: false
});

if (result.error || result.status !== 0) {
  console.error(result.stderr || result.error?.message || 'git diff failed');
  process.exit(result.status || 1);
}

const changedFiles = result.stdout.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
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
  if (!file.startsWith(`apps/${appSlug}/`)) {
    errors.push(`${file} is outside apps/${appSlug}/`);
  }
}

if (errors.length > 0) {
  console.error('Application PR scope validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  console.error('- Move shared/platform work into a separate PR or add the platform-change label deliberately.');
  process.exit(1);
}

console.log(`Application PR is isolated to apps/${appSlug}/ (${changedFiles.length} file(s)).`);
