import test from 'node:test';
import assert from 'node:assert/strict';
import {references,analyzeSources,compareSnapshots} from './impact-graph.mjs';
const apps=['a','b','c'];
const files=['apps/a/main.ts','apps/b/main.ts','apps/c/main.ts','shared/bridge.js'];
const analyze=sources=>({apps,...analyzeSources({apps,files,sources})});
test('AST identifies imports, reexports, dynamic literal imports and require',()=>{
 const r=references('apps/a/main.ts',`import x from '../b/main.ts'; export {y} from '../c/main.ts'; const a=import('../b/main.ts'); require('../c/main.ts'); // import '../fake.js'`);
 assert.equal(r.refs.length,4);assert.equal(r.unknown.length,0);
});
test('nonliteral imports and glob are explicitly uncertain',()=>{
 const r=references('app.ts','import(name); import.meta.glob("./*.js"); require(variable);');
 assert.deepEqual(r.unknown.sort(),['glob','module']);
});
test('removed edges remain in base snapshot and propagate transitively',()=>{
 const base=analyze([['apps/b/main.ts',"import '../a/main.ts'"],['apps/c/main.ts',"export * from '../b/main.ts'"]]);
 const head=analyze([['apps/b/main.ts',''],['apps/c/main.ts','']]);
 const r=compareSnapshots(base,head,['apps/a/main.ts']);
 assert.deepEqual(r.staticCandidates,apps);assert.equal(r.globalFallback,false);assert.equal(r.canSkip,false);
});
test('shared consumer and unresolved dependency force full coverage',()=>{
 const base=analyze([['shared/bridge.js',"import '../apps/a/main.ts'"]]);
 const head=analyze([['apps/b/main.ts','import(name)']]);
 const r=compareSnapshots(base,head,['apps/a/main.ts']);
 assert.equal(r.globalFallback,true);assert.deepEqual(r.candidateApps,apps);
 assert.equal(r.uncertainties,1);assert.equal(r.sharedConsumers.length,1);
});
test('HTML, inline scripts and CSS references are collected',()=>{
 const r=references('index.html','<script type="module" src="./main.js"></script><script>import("./other.js")</script><link href="./style.css">');
 assert.equal(r.refs.length,3);
 assert.equal(references('style.css','@import "./other.css"; div { background:url(../image.png) }').refs.length,2);
});
