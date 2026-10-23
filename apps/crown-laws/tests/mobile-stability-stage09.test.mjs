import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFileSync(path.join(root,name),"utf8");
const css=read("client/stage09-mobile.css");
const app=read("client/app.js");

test("the game is a fixed viewport stage only on live mobile, not debug or menu",()=>{
 assert.match(css,/@media \(max-width:760px\)/);
 assert.match(css,/\.game-shell:not\(\.debug-scene \.game-shell\)\{/);
 assert.match(css,/position:fixed;inset:0;width:100%;height:100dvh/);
 assert.match(css,/\.game-shell__frame\{\s*display:grid;grid-template-rows:auto minmax\(0,1fr\)/);
 assert.doesNotMatch(css,/\.menu-shell\{position:fixed/);
});

test("board retains a 5/7 ratio bounded by ITS container height, not arbitrary viewport subtractions",()=>{
 assert.match(css,/container-type:size/);
 assert.match(css,/width:min\(100cqw,71\.428571cqh\)/);
 assert.match(css,/aspect-ratio:5\/7/);
 assert.doesNotMatch(css,/100dvh\s*-\s*(328|334|350|380)px/);
 assert.match(css,/grid-template-rows:minmax\(0,1fr\) 58px 145px/);
 assert.match(css,/grid-template-areas:"board" "side" "hand"/);
});

test("all variable panels float, never insert normal-flow rows pushing the board",()=>{
 for(const part of [".turn-film",".vision",".hand-panel .detail-card",".game-layout__side>.detail-card",".game-layout__foot"]){
   assert.ok(css.includes(part),part);
 }
 assert.match(css,/\.turn-film\{\s*position:fixed/);
 assert.match(css,/\.vision\{\s*position:fixed/);
 assert.match(css,/\.hand-panel \.detail-card,[\s\S]*?position:fixed/);
 assert.match(css,/\.hand-panel \.sealed-notice\{\s*position:absolute/);
 assert.match(css,/\.game-layout__foot\{\s*position:fixed/);
});

test("horizontal phone layout has three fixed regions without clipping or rescaling the board",()=>{
 assert.match(css,/@media \(max-width:950px\) and \(max-height:600px\) and \(orientation:landscape\)/);
 assert.match(css,/grid-template-areas:"board side hand"/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(90px,21%\) minmax\(162px,27%\)/);
 assert.match(css,/overflow-y:auto;overflow-x:hidden/);
});

test("history, preview, selection, consent and exit stay accessible",()=>{
 assert.match(app,/class="text-btn court-mobile-history" data-action="toggle-history"/);
 assert.match(css,/\.court-mobile-history\{display:none\}/);
 assert.match(css,/\.topbar \.court-mobile-history\{\s*display:inline-flex/);
 for(const action of ["forecast-open","confirm-choice","toggle-history","clear-inspection","vision-step","vision-mode","skip-film"]){
  assert.ok(app.includes('data-action="'+action+'"')||app.includes("'[data-action=\""+action+"\"]'"),action);
 }
 assert.match(css,/safe-area-inset-top/);
 assert.match(css,/safe-area-inset-bottom/);
});

test("0.8.1 CSS is imported and offline cached, version is coherent",()=>{
 const styles=read("styles.css"),worker=read("sw.js"),config=JSON.parse(read("app.config.json"));
 assert.ok(styles.includes("@import './client/stage09-mobile.css';"));
 assert.ok(worker.includes("./client/stage09-mobile.css"));
 assert.equal(config.version,"0.8.1");
 assert.match(worker,/crown-laws-v0\.8\.1/);
 assert.match(read("index.html"),/data-app-version="0\.8\.1"/);
});
