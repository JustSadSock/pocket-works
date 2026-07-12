import { access, cp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const [slug] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  throw new Error('promote-enhanced-build requires a valid app slug');
}

const root = process.cwd();
const appDirectory = path.join(root, 'apps', slug);
const buildDirectory = path.join(appDirectory, '.dist');
const generatedEntries = ['index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'sw.js', 'sw.js.map', 'assets', 'icons', 'registerSW.js'];

try {
  await access(buildDirectory);
} catch {
  throw new Error(`apps/${slug}/.dist does not exist; Vite build did not produce output`);
}

for (const entry of generatedEntries) {
  await rm(path.join(appDirectory, entry), { recursive: true, force: true });
}

for (const entry of await readdir(buildDirectory, { withFileTypes: true })) {
  await cp(path.join(buildDirectory, entry.name), path.join(appDirectory, entry.name), { recursive: true });
}

await rm(buildDirectory, { recursive: true, force: true });
console.log(`Promoted isolated Enhanced build for apps/${slug}.`);
