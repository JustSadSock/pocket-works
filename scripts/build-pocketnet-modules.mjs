import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const apps = path.join(root, 'apps');
const versionsRoot = path.join(root, 'pocketnet', 'module-versions');
const lockPath = path.join(root, 'pocketnet', 'modules.lock.json');
const output = path.join(root, 'pocketnet', 'generated-modules.mjs');
const snapshots = process.argv.includes('--snapshot');
const locked = JSON.parse(await readFile(lockPath, 'utf8'));
const generated = [];
const registry = {};
let serial = 0;
for (const dir of await readdir(apps, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name.startsWith('_')) continue;
  const folder = path.join(apps, dir.name, 'server');
  let config, source;
  try {
    config = JSON.parse(await readFile(path.join(folder, 'module.json'), 'utf8'));
    source = await readFile(path.join(folder, 'module.ts'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (config.gameId !== dir.name || config.protocolVersion !== 1) throw Error('Invalid game metadata: ' + dir.name);
  const record = locked[dir.name] || { current: null, versions: [] };
  if (!record.versions.length || await readFile(path.join(versionsRoot, dir.name, record.current + '.ts'), 'utf8').catch(() => '') !== source) {
    if (!snapshots) throw Error('Unsnapshotted PocketNet module: ' + dir.name + '. Run node scripts/build-pocketnet-modules.mjs --snapshot and commit its changes.');
    const id = 'v' + (record.versions.length + 1);
    await mkdir(path.join(versionsRoot, dir.name), { recursive: true });
    await writeFile(path.join(versionsRoot, dir.name, id + '.ts'), source, { flag: 'wx' });
    record.versions.push(id);
    record.current = id;
  }
  for (const version of record.versions) {
    const file = path.join(versionsRoot, dir.name, version + '.ts');
    const text = await readFile(file, 'utf8');
    if (!text.trim() || !/^v[1-9][0-9]*$/.test(version)) throw Error('Invalid module version: ' + dir.name + '@' + version);
    const variable = 'm' + serial++;
    generated.push('import * as ' + variable + ' from ' + JSON.stringify('./module-versions/' + dir.name + '/' + version + '.ts') + ';');
    (registry[dir.name] ||= { current: record.current, versions: {} }).versions[version] = variable;
  }
  locked[dir.name] = record;
}
for (const name of Object.keys(locked)) if (!registry[name]) throw Error('Missing module source for locked game: ' + name);
if (snapshots) await writeFile(lockPath, JSON.stringify(locked, null, 2) + '\n');
const toJs = Object.entries(registry).map(([gameId, record]) =>
  JSON.stringify(gameId) + ': { current: ' + JSON.stringify(record.current) +
  ', versions: { ' + Object.entries(record.versions).map(([version, variable]) => JSON.stringify(version) + ': ' + variable).join(', ') + ' } }');
generated.push('export const POCKET_MODULES = { ' + toJs.join(', ') + ' };');
await writeFile(output, generated.join('\n') + '\n');
console.log('Built ' + Object.keys(registry).length + ' PocketNet module(s) with ' + serial + ' pinned snapshot(s)');
