import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormaCode, normalizeDocument, compileDocument, splitPartDocument } from '../src/engine.js';
import { meshCompiledPart } from '../src/mesher.js';
import { DEFAULT_DOCUMENT } from '../src/spec.js';
import { export3MF, exportBinarySTL, exportGLB } from '../src/exporters.js';

test('tolerant FormaCode parser accepts fences, comments, and trailing commas', () => {
  const source = `\`\`\`json\n{ // model\n"format":"formacode-1",\n"parts":[{"id":"a","node":{"type":"sphere","radius":5,},}],\n}\n\`\`\``;
  const doc = parseFormaCode(source);
  assert.equal(doc.parts[0].id, 'a');
});

test('default document compiles and meshes into printable triangles', () => {
  const compiled = compileDocument(DEFAULT_DOCUMENT);
  const mesh = meshCompiledPart(compiled.parts[0], { detail: 26, margin: 2 });
  assert.ok(mesh.positions.length > 0);
  assert.ok(mesh.indices.length > 100);
  assert.ok(mesh.analysis.volume > 100);
  assert.equal(mesh.analysis.degenerate, 0);
});

test('SDF split creates two independently compilable parts', () => {
  const source = normalizeDocument({format:'formacode-1',name:'cut',parts:[{id:'body',name:'Body',color:'#cccccc',node:{type:'roundedBox',size:[20,20,20],radius:2}}]});
  const split = splitPartDocument(source, 'body', { axis:'z', position:0, pins:2, pinDiameter:3, clearance:.25 });
  assert.equal(split.parts.length, 2);
  const compiled = compileDocument(split);
  for (const part of compiled.parts) {
    const mesh = meshCompiledPart(part, { detail: 24, margin: 2 });
    assert.ok(mesh.analysis.volume > 10);
  }
});

test('exporters produce non-empty standard containers', async () => {
  const compiled = compileDocument({format:'formacode-1',name:'ball',parts:[{id:'ball',name:'Ball',color:'#ff6633',node:{type:'sphere',radius:5}}]});
  const mesh = meshCompiledPart(compiled.parts[0], { detail: 22, margin: 1 });
  const stl = exportBinarySTL([mesh], 'ball');
  const threeMf = export3MF([mesh], 'ball');
  const glb = exportGLB([mesh], 'ball');
  assert.ok(stl.size > 84);
  assert.ok(threeMf.size > 500);
  assert.ok(glb.size > 500);
  const glbHeader = new DataView(await glb.arrayBuffer()).getUint32(0, true);
  assert.equal(glbHeader, 0x46546c67);
});
