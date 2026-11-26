import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('every direct launcher entry import is present in the offline service-worker shell',()=>{
 const app=readFileSync(path.join(root,'app.js'),'utf8');
 const worker=readFileSync(path.join(root,'sw.js'),'utf8');
 const block=worker.match(/const APP_SHELL = \[([\s\S]*?)\n\];/);
 assert.ok(block,'service worker APP_SHELL declaration is missing');
 const shell=new Set([...block[1].matchAll(/['"]([^'"]+)['"]/g)].map(match=>match[1]));
 const imports=[...app.matchAll(/^\s*import\s+(?:[^'";\n]+\s+from\s+)?['"]([^'"]+)['"]\s*;?\s*$/gm)].map(match=>match[1]);
 assert.ok(imports.length>0,'launcher entry imports were not detected');
 const missing=imports.filter(spec=>spec.startsWith('./')&&!shell.has(spec));
 assert.deepEqual(missing,[],'offline shell must precache every direct launcher entry import');
 for(const spec of imports.filter(value=>value.startsWith('./')))assert.ok(existsSync(path.resolve(root,spec)),'missing launcher import '+spec);
});
