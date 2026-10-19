import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

test('PocketNet preflight is read-only, fails fast, and snapshots atomically', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pw-pocketnet-preflight-'));
  try {
    const scripts = path.join(root, 'scripts');
    const server = path.join(root, 'apps', 'demo', 'server');
    const versions = path.join(root, 'pocketnet', 'module-versions', 'demo');
    const lockPath = path.join(root, 'pocketnet', 'modules.lock.json');
    const generated = path.join(root, 'pocketnet', 'generated-modules.mjs');
    await mkdir(scripts, { recursive: true });
    await mkdir(server, { recursive: true });
    await mkdir(versions, { recursive: true });
    const script = path.join(scripts, 'build-pocketnet-modules.mjs');
    await copyFile(new URL('./build-pocketnet-modules.mjs', import.meta.url), script);
    await writeFile(path.join(server, 'module.json'), '{"gameId":"demo","protocolVersion":1}\n');
    const source = path.join(server, 'module.ts');
    await writeFile(source, 'export const value = 1;\n');
    await writeFile(path.join(versions, 'v1.ts'), 'export const value = 1;\n');
    await writeFile(lockPath, JSON.stringify({ demo: { current: 'v1', versions: ['v1'] } }) + '\n');
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(run('--check').status, 0, 'Matching snapshot must pass preflight');
    await assert.rejects(access(generated), { code: 'ENOENT' }, 'Read-only check must not generate output');
    await writeFile(source, 'export const value = 2;\n');
    const invalid = run('--check');
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Unsnapshotted PocketNet module: demo/);
    assert.equal(run('--snapshot').status, 0, 'Explicit authoring step creates immutable snapshot');
    assert.equal(await readFile(path.join(versions, 'v1.ts'), 'utf8'), 'export const value = 1;\n');
    assert.equal(await readFile(path.join(versions, 'v2.ts'), 'utf8'), 'export const value = 2;\n');
    assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).demo.current, 'v2');
    await rm(generated);
    assert.equal(run('--check').status, 0);
    await assert.rejects(access(generated), { code: 'ENOENT' });
    await writeFile(lockPath, JSON.stringify({ demo: { current: 'v2', versions: ['v1', 'v1'] } }) + '\n');
    assert.match(run('--check').stderr, /Invalid PocketNet/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
