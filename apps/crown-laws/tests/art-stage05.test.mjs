import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const file=relative=>readFileSync(path.join(root,relative),"utf8");
const names=["court-figures","throne-relief","decree-ornament"];

test("all illustrated 0.5 assets are original, editable SVG and published unchanged",()=>{
  for(const name of names){
    const authored=file(`asset-forge/${name}.svg`);
    const runtime=file(`assets/${name}.svg`);
    assert.equal(runtime,authored,`Source/export diverged for ${name}`);
    assert.match(runtime,/^<svg\b/);
    assert.match(runtime,/<\/svg>\s*$/);
    assert.doesNotMatch(runtime,/<(?:script|foreignObject|image)\b/i);
    assert.doesNotMatch(runtime,/<!(?:DOCTYPE|ENTITY)\b/i);
    assert.doesNotMatch(runtime,/\b(?:href|src)\s*=\s*["'](?:https?:|data:)/i);
  }
});

test("all new illustrations are consumed by the game and its service worker",()=>{
  const css=file("client/stage05.css");
  const rootCss=file("styles.css");
  const worker=file("sw.js");
  assert.match(rootCss,/@import '\.\/client\/stage05\.css';/);
  assert.match(worker,/\.\/client\/stage05\.css/);
  for(const name of names){
    assert.ok(css.includes(`../assets/${name}.svg`),name+" is missing from CSS");
    assert.ok(worker.includes(`./assets/${name}.svg`),name+" is not available offline");
  }
});

test("Royal Codex art production jobs have editable vector sources and bounded outputs",()=>{
  const plan=JSON.parse(file("asset-forge/vector-production-plan.json"));
  assert.equal(plan.version,2);
  assert.equal(plan.runtimeRoot,".");
  for(const name of names){
    const job=plan.jobs.find(entry=>entry.id===name);
    assert.ok(job,`No Forge production job for ${name}`);
    assert.equal(job.adapter,"vector");
    assert.equal(job.source,`asset-forge/${name}.svg`);
    assert.equal(job.outputs.vector,`assets/${name}.svg`);
    assert.equal(job.outputs.image,`assets/${name}.png`);
    assert.ok(job.budget.maxBytes>0);
  }
});

test("0.5 diagnostics offer a dedicated non-mutating illustrated art gallery",()=>{
  const app=file("client/app.js");
  assert.match(app,/function artGalleryHTML\(\)/);
  assert.match(app,/\["art","Арт-галерея"\]/);
  assert.match(app,/if\(scene==="art"\)markup=artGalleryHTML\(\)/);
  assert.match(app,/saved=\{screen:app.screen/);
});
