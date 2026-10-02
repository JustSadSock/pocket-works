import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Document, NodeIO } from '@gltf-transform/core';
import { compileForApp, compilerArgs, validateCompilerManifest } from './asset-compiler.mjs';

function tinyGlb() {
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
  const indices = document.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2])).setBuffer(buffer);
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
  document.createScene().addChild(document.createNode('touchable').setMesh(document.createMesh('triangle').addPrimitive(primitive)));
  return new NodeIO().writeBinary(document);
}

test('manifest excludes traversal and preserves animated scene nodes', () => {
  assert.deepEqual(validateCompilerManifest({ version: 1, jobs: [{ source: 'assets/source/tree.glb', output: 'public/models/tree.glb', profile: 'animated' }] }), []);
  assert.ok(validateCompilerManifest({ version: 1, jobs: [{ source: '../secret.glb', output: '../out.glb', profile: 'bad' }] }).length >= 3);
  const flags = compilerArgs({ profile: 'animated' }, 'bin', 'in.glb', 'out.glb');
  assert.deepEqual(flags.slice(flags.indexOf('--flatten'), flags.indexOf('--flatten') + 2), ['--flatten', 'false']);
  assert.deepEqual(flags.slice(flags.indexOf('--simplify'), flags.indexOf('--simplify') + 2), ['--simplify', 'false']);
});

test('compiles a real GLB and writes a reproducible integrity lock', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'pw-compile-'));
  try {
    const app = join(projectRoot, 'apps', 'demo');
    await mkdir(join(app, 'assets/source'), { recursive: true });
    await mkdir(join(projectRoot, 'node_modules/.bin'), { recursive: true });
    const { symlink } = await import('node:fs/promises');
    const realCli = join(process.cwd(), 'node_modules/.bin/gltf-transform');
    await symlink(realCli, join(projectRoot, 'node_modules/.bin/gltf-transform'));
    await writeFile(join(app, 'assets/source/triangle.glb'), await tinyGlb());
    await writeFile(join(app, 'asset-compiler.json'), JSON.stringify({ version: 1, jobs: [{ source: 'assets/source/triangle.glb', output: 'public/models/triangle.glb', profile: 'animated' }] }));
    const reports = await compileForApp('demo', { projectRoot });
    assert.equal(reports.length, 1);
    assert.ok(reports[0].outputBytes > 12);
    const lock = JSON.parse(await readFile(join(app, 'asset-compiler.lock.json')));
    assert.match(lock.jobs[0].outputSha256, /^[a-f0-9]{64}$/);
  } finally { await rm(projectRoot, { recursive: true, force: true }); }
});
