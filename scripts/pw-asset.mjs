import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const maxFileSize = 80 * 1024 * 1024;
const userAgent = 'PocketWorksAssetRegistry/0.1 (https://github.com/JustSadSock/pocket-works)';
const isId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(value);
const safePath = (value) => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('%') && !posix.isAbsolute(value) && value.split('/').every((part) => part && part !== '.' && part !== '..');
const hashFile = async (path, algorithm) => {
  const { createReadStream } = await import('node:fs');
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};

export function validateCatalog(catalog) {
  const errors = [];
  if (catalog?.version !== 1 || !Array.isArray(catalog.assets)) return ['expected catalog version 1 and assets array'];
  const ids = new Set();
  for (const asset of catalog.assets) {
    if (!isId(asset.id) || ids.has(asset.id)) errors.push(`invalid or duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    for (const field of ['name', 'style', 'pivot', 'lod', 'source']) if (typeof asset[field] !== 'string' || !asset[field]) errors.push(`${asset.id}: missing ${field}`);
    if (!['model', 'texture', 'hdri'].includes(asset.kind)) errors.push(`${asset.id}: invalid kind`);
    if (!Array.isArray(asset.tags) || !asset.tags.length || !asset.tags.every((tag) => typeof tag === 'string')) errors.push(`${asset.id}: invalid tags`);
    if (!Array.isArray(asset.palette) || !asset.palette.length) errors.push(`${asset.id}: invalid palette`);
    if (!asset.dimensions || !('unit' in asset.dimensions) || !('value' in asset.dimensions)) errors.push(`${asset.id}: missing dimensions`);
    if (asset.provider !== 'polyhaven' || !isId(asset.providerId) || asset.license !== 'CC0-1.0') errors.push(`${asset.id}: unsupported provider/license`);
    if (asset.source !== `https://polyhaven.com/a/${asset.providerId}`) errors.push(`${asset.id}: source does not match provider ID`);
    const { group, resolution, format } = asset.selection ?? {};
    if (!['gltf', 'hdri', 'Diffuse'].includes(group) || !['1k', '2k'].includes(resolution) || !['gltf', 'hdr', 'jpg'].includes(format)) errors.push(`${asset.id}: invalid selection`);
  }
  return errors;
}

export function selectFiles(asset, manifest) {
  const { group, resolution, format } = asset.selection;
  const primary = manifest?.[group]?.[resolution]?.[format];
  if (!primary || !primary.url || !primary.md5 || !primary.size) throw new Error(`No ${group}/${resolution}/${format} variant for ${asset.id}`);
  const filename = decodeURIComponent(new URL(primary.url).pathname.split('/').at(-1));
  const files = [{ path: filename, ...primary }];
  for (const [path, data] of Object.entries(primary.include ?? {})) files.push({ path, ...data });
  for (const file of files) {
    if (!safePath(file.path)) throw new Error(`Unsafe asset path: ${file.path}`);
    const url = new URL(file.url);
    if (url.protocol !== 'https:' || url.hostname !== 'dl.polyhaven.org') throw new Error(`Unexpected download origin for ${file.path}`);
    if (!/^[a-f0-9]{32}$/i.test(file.md5) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > maxFileSize) throw new Error(`Invalid checksum or size for ${file.path}`);
  }
  return files;
}

async function getJson(url, fetcher) {
  const response = await fetcher(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(30000) });
  if (!response.ok || new URL(response.url).hostname !== 'api.polyhaven.com') throw new Error(`Asset API request failed: ${response.status}`);
  return response.json();
}

async function cachedFile(file, cacheDir, fetcher, offline) {
  const cachePath = join(cacheDir, file.md5);
  try {
    if ((await stat(cachePath)).size === file.size && await hashFile(cachePath, 'md5') === file.md5) return cachePath;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (offline) throw new Error(`Missing cached file ${file.path}`);
  await mkdir(cacheDir, { recursive: true });
  const response = await fetcher(file.url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(120000) });
  if (!response.ok || new URL(response.url).hostname !== 'dl.polyhaven.org' || !response.body) throw new Error(`Download failed: ${file.path}`);
  const temp = `${cachePath}.${process.pid}.tmp`;
  let bytes = 0;
  const limiter = new Transform({ transform(chunk, _, callback) {
    bytes += chunk.length;
    callback(bytes > file.size || bytes > maxFileSize ? new Error(`Size limit exceeded: ${file.path}`) : null, chunk);
  } });
  try {
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(temp));
    if (bytes !== file.size || await hashFile(temp, 'md5') !== file.md5) throw new Error(`Integrity check failed: ${file.path}`);
    await rename(temp, cachePath);
    return cachePath;
  } finally { await rm(temp, { force: true }); }
}

export async function addAsset(asset, appSlug, { projectRoot = root, cacheDir = join(projectRoot, '.cache/pw-assets'), fetcher = fetch, offline = false, dryRun = false } = {}) {
  if (!isId(appSlug)) throw new Error('Provide a valid --app slug');
  const appDir = join(projectRoot, 'apps', appSlug);
  const config = JSON.parse(await readFile(join(appDir, 'app.config.json'), 'utf8'));
  if (config.slug !== appSlug) throw new Error('App config slug does not match directory');
  const destination = join(appDir, config.runtime === 'enhanced' ? 'public/assets/registry' : 'assets/registry', asset.id);
  const metadataPath = join(cacheDir, `${asset.providerId}-${asset.selection.group}-${asset.selection.resolution}-${asset.selection.format}.json`);
  let manifest;
  if (offline) manifest = JSON.parse(await readFile(metadataPath, 'utf8'));
  else {
    manifest = await getJson(`https://api.polyhaven.com/files/${asset.providerId}`, fetcher);
    if (!dryRun) { await mkdir(cacheDir, { recursive: true }); await writeFile(metadataPath, JSON.stringify(manifest)); }
  }
  const files = selectFiles(asset, manifest);
  if (dryRun) return { destination, files: files.map(({ path, size }) => ({ path, size })) };
  const records = [];
  for (const file of files) {
    const cached = await cachedFile(file, cacheDir, fetcher, offline);
    const target = join(destination, file.path);
    if (!target.startsWith(destination + sep)) throw new Error('Unsafe destination path');
    await mkdir(dirname(target), { recursive: true });
    await copyFile(cached, target);
    records.push({ path: file.path, size: file.size, md5: file.md5, sha256: await hashFile(cached, 'sha256') });
  }
  const lock = { version: 1, id: asset.id, source: asset.source, provider: asset.provider, license: asset.license, files: records };
  await writeFile(join(destination, 'asset.lock.json'), JSON.stringify(lock, null, 2) + '\n');
  return { destination, files: records };
}

export async function verifyAsset(asset, appSlug, { projectRoot = root } = {}) {
  if (!isId(appSlug)) throw new Error('Provide a valid --app slug');
  const appDir = join(projectRoot, 'apps', appSlug);
  const config = JSON.parse(await readFile(join(appDir, 'app.config.json'), 'utf8'));
  if (config.slug !== appSlug) throw new Error('App config slug does not match directory');
  const destination = join(appDir, config.runtime === 'enhanced' ? 'public/assets/registry' : 'assets/registry', asset.id);
  const lock = JSON.parse(await readFile(join(destination, 'asset.lock.json'), 'utf8'));
  if (lock.id !== asset.id || lock.source !== asset.source || lock.license !== asset.license || !Array.isArray(lock.files) || !lock.files.length) throw new Error('Asset lock metadata mismatch');
  for (const file of lock.files) {
    if (!safePath(file.path) || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error('Invalid asset lock entry');
    const path = join(destination, file.path);
    if ((await stat(path)).size !== file.size || await hashFile(path, 'sha256') !== file.sha256) throw new Error(`Asset integrity check failed: ${file.path}`);
  }
  return { destination, count: lock.files.length };
}

async function main() {
  const [action, id, ...args] = process.argv.slice(2);
  const catalog = JSON.parse(await readFile(join(root, 'assets/catalog.json'), 'utf8'));
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(errors.join('\n'));
  if (action === 'list') {
    for (const asset of catalog.assets) console.log(`${asset.id}\t${asset.kind}\t${asset.tags.join(', ')}`);
    return;
  }
  if (action === 'find') {
    for (const asset of catalog.assets.filter((entry) => entry.tags.some((tag) => tag.toLowerCase().includes((id ?? '').toLowerCase())))) console.log(`${asset.id}\t${asset.name}`);
    return;
  }
  if (!['add', 'verify'].includes(action) || !isId(id)) throw new Error('Usage: npm run pw:asset -- list | find <tag> | add <id> --app <slug> [--offline] [--dry-run] | verify <id> --app <slug>');
  const asset = catalog.assets.find((entry) => entry.id === id);
  if (!asset) throw new Error(`Unknown asset ${id}; use list or find`);
  const appIndex = args.indexOf('--app');
  if (appIndex < 0 || !args[appIndex + 1]) throw new Error('add requires --app <slug>');
  if (action === 'verify') {
    const result = await verifyAsset(asset, args[appIndex + 1]);
    console.log(`Verified ${result.count} file(s): ${result.destination}`);
    return;
  }
  const result = await addAsset(asset, args[appIndex + 1], { offline: args.includes('--offline'), dryRun: args.includes('--dry-run') });
  console.log(`${result.destination}\n${result.files.map((file) => `${file.path} (${file.size} bytes)`).join('\n')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
