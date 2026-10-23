import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {createInitialState} from "../shared/game-engine.js";

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFileSync(path.join(dir,name),"utf8");
const app=read("client/app.js");
const css=read("client/stage08.css");

test("0.8 ceremony artwork remains an exact self-contained offline SVG export",()=>{
 const original=read("asset-forge/council-seats.svg");
 const published=read("assets/council-seats.svg");
 assert.equal(original,published);
 assert.match(original,/^<svg\b/);
 assert.match(original,/<\/svg>\s*$/);
 assert.doesNotMatch(original,/<(?:script|foreignObject|image)\b/i);
 assert.doesNotMatch(original,/\b(?:href|src)\s*=\s*["'](?:https?:|data:)/i);
 const plan=JSON.parse(read("asset-forge/vector-production-plan.json"));
 const job=plan.jobs.find(x=>x.id==="council-seats");
 assert.ok(job);
 assert.equal(job.adapter,"vector");
 assert.equal(job.source,"asset-forge/council-seats.svg");
 assert.equal(job.outputs.vector,"assets/council-seats.svg");
});

test("version 0.8 precaches every new visual layer",()=>{
 const config=JSON.parse(read("app.config.json"));
 assert.ok(/^0\.8\.\d+$/.test(config.version),"This suite covers the 0.8.x ceremony release line");
 const worker=read("sw.js");
 assert.ok(worker.includes("crown-laws-v"+config.version));
 assert.ok(worker.includes("./client/stage08.css"));
 assert.ok(worker.includes("./assets/council-seats.svg"));
 assert.ok(read("styles.css").includes("@import './client/stage08.css';"));
 assert.ok(css.includes("../assets/council-seats.svg"));
});

test("winning viewer, losing viewer and hot-seat are distinct real ceremony states",()=>{
 const source=read("client/app.js");
 assert.match(source,/const isSelf=!localHotseat&&winnerId===viewer/);
 assert.match(source,/const isDefeat=!localHotseat&&winnerId!==viewer/);
 assert.match(source,/Трон достался сопернику/);
 assert.match(source,/Корона ваша/);
 assert.match(source,/Правитель определён/);
 assert.match(source,/data-action="victory-chronicle"/);
 assert.match(source,/state\.battleLog\|\|\[\]/);
 const state=createInitialState({mode:"hotseat",seed:"victory-ceremony"});
 state.winner="p1";state.players.p1.activeCrowns=3;state.turn=17;
 assert.equal(state.turn-1,16);
 assert.equal(state.players[state.winner].activeCrowns,3);
});

test("clipboard feedback is truthful and network errors cannot crash missing DOM elements",()=>{
 assert.match(app,/navigator\.clipboard\?\.writeText/);
 assert.match(app,/\.then\(\(\)=>\{/);
 assert.match(app,/app\.online\.copyStatus="copied"/);
 assert.match(app,/app\.online\.copyStatus="failed"/);
 assert.match(app,/app\.online\.error=String\(payload\.message/);
 assert.doesNotMatch(app,/error=document\.querySelector\('#network-error'\);error\.hidden=false/);
 assert.match(app,/escapeText\(app\.online\.error\)/);
});

test("the five rules pages, sealed readiness and private device handoff remain actionable",()=>{
 assert.match(app,/RULE_CHAPTERS=\[/);
 for(const id of ["goal","secret","conflict","actors","crown"])assert.ok(app.includes('id:"'+id+'"'));
 assert.match(app,/data-action="rules-chapter"/);
 assert.match(app,/case "rules-chapter":/);
 assert.match(app,/data-action="continue-hotseat"/);
 assert.match(app,/case "continue-hotseat":/);
 assert.match(app,/pass-overlay--ceremony/);
 assert.match(app,/sealed-notice__readiness/);
 assert.match(css,/\.pass-overlay--ceremony\{position:fixed;inset:0;z-index:1001/);
});

test("mobile, keyboard, reduced-motion and input semantics remain explicit",()=>{
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(app,/aria-modal="true"/);
 assert.match(app,/role="alert"/);
 assert.match(app,/data-setting="sound"/);
 assert.match(app,/data-setting="reducedMotion"/);
 assert.match(app,/data-action="rematch"/);
});
