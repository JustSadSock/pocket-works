import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const name = process.argv[2] || 'unknown';
const dist = path.join(process.cwd(), 'dist-site');
await mkdir(dist, { recursive: true });
await appendFile(path.join(dist, 'netlify-entrypoints.txt'), `${new Date().toISOString()} ${name}\n`, 'utf8');
try {
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Netlify diagnostic</title><pre>Entrypoint diagnostic.</pre>', { flag: 'wx' });
} catch {}
console.log(`[netlify-diagnostic] invoked ${name}`);
