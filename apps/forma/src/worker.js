import { compileDocument } from './engine.js';
import { meshCompiledPart } from './mesher.js';

self.onmessage = event => {
  const { id, document, detail, margin } = event.data || {};
  try {
    const compiled = compileDocument(document);
    const meshes = [];
    for (let i = 0; i < compiled.parts.length; i++) {
      const part = compiled.parts[i];
      self.postMessage({ id, type: 'progress', part: i, total: compiled.parts.length, name: part.name, progress: 0 });
      const mesh = meshCompiledPart(part, {
        detail,
        margin,
        onProgress: progress => self.postMessage({ id, type: 'progress', part: i, total: compiled.parts.length, name: part.name, progress })
      });
      meshes.push(mesh);
      self.postMessage({ id, type: 'progress', part: i + 1, total: compiled.parts.length, name: part.name, progress: 1 });
    }
    const transfer=[];
    for(const m of meshes) transfer.push(m.positions.buffer,m.normals.buffer,m.indices.buffer);
    self.postMessage({ id, type: 'result', meshes }, transfer);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || String(error), stack: error?.stack || '' });
  }
};
