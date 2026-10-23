import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {BASE_LAWS,LAW_CARDS,SLOT_TYPES} from "../shared/game-data.js";
import {createInitialState,applyDebugAction} from "../shared/game-engine.js";
import {lawReadout,lawSlotsView} from "../client/law-readout.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const app=read("client/app.js"),css=read("client/stage11-law-codex.css");

test("every one of 25 decrees presents the matching standing category and proposed text without modifying match",()=>{
 const state=createInitialState({seed:"0.9-world"});
 const before=structuredClone(state);
 for(const card of LAW_CARDS){
  const v=lawReadout(state,card.id,card.id,"compare");
  assert.ok(v,card.id);
  assert.equal(v.comparison,true);
  assert.equal(v.slot,card.slot);
  assert.equal(v.card.id,card.id);
  assert.equal(v.active.id,BASE_LAWS[card.slot].id);
  assert.equal(v.activeIsBase,true);
  assert.equal(v.selectedId,card.id);
  assert.equal(v.categoryMatches,true);
  assert.match(v.card.description,/./);
  assert.match(v.active.description,/./);
 }
 assert.deepEqual(state,before);
});
test("an active existing non-base law is correctly compared against its proposed successor",()=>{
 let state=createInitialState({seed:"codex-replacement"});
 const replacement=LAW_CARDS.find(c=>c.slot==="guard");
 state=applyDebugAction(state,{type:"set-law",slot:"guard",cardId:replacement.id,owner:"p1"});
 const candidate=LAW_CARDS.find(c=>c.slot==="guard"&&c.id!==replacement.id);
 const v=lawReadout(state,candidate.id,candidate.id,"compare");
 assert.equal(v.active.id,replacement.id);
 assert.equal(v.activeIsBase,false);
 assert.equal(v.card.id,candidate.id);
 assert.equal(v.same,false);
 const same=lawReadout(state,replacement.id,replacement.id,"compare");
 assert.equal(same.same,true);
});
test("inspecting any standing law preserves the player's selected decree as a separate fact",()=>{
 const state=createInitialState({seed:"inspection"});
 const selected=LAW_CARDS[0];
 for(const slot of SLOT_TYPES){
  const base=BASE_LAWS[slot];
  const v=lawReadout(state,selected.id,base.id,"inspect");
  assert.equal(v.comparison,false);
  assert.equal(v.active.id,base.id);
  assert.equal(v.slot,slot);
  assert.equal(v.selectedId,selected.id);
 }
 assert.equal(lawReadout(state,selected.id,selected.id,null),null);
 assert.equal(lawReadout(state,null,null,"inspect"),null);
});
test("only the chosen category is highlighted, not replaced in the public five laws",()=>{
 const state=createInitialState({seed:"highlight"});
 const selected=LAW_CARDS.find(c=>c.slot==="priest");
 const rows=lawSlotsView(state,selected.id,"beast");
 assert.equal(rows.length,5);
 assert.equal(rows.filter(row=>row.selected).length,1);
 assert.equal(rows.find(row=>row.slot==="priest").selectedLaw.id,selected.id);
 assert.equal(rows.find(row=>row.slot==="priest").active.id,BASE_LAWS.priest.id);
 assert.equal(rows.find(row=>row.slot==="beast").inspected,true);
 assert.equal(rows.find(row=>row.slot==="beast").selected,false);
});
test("all controls are real: inspect, compare, confirm, forecast, clear, unselect and keyboard dismissal",()=>{
 for(const action of ["law-compare","clear-inspection","unselect-card","forecast-open","confirm-choice"]){
  assert.ok(app.includes('data-action="'+action+'"'),action+" button missing");
  assert.ok(app.includes('case "'+action+'":')||["forecast-open","confirm-choice"].includes(action)&&app.includes('case "'+action+'":'),action+" handler missing");
 }
 assert.ok(app.includes('app.lawSheetMode="inspect"'));
 assert.ok(app.includes('app.lawSheetMode=app.selectedCardId?"compare":null'));
 assert.ok(app.includes('app.lawSheetMode=null;app.focusCardId=null;app.inspectedSlot=null;render()'));
 assert.match(app,/if\(event\.key==="Escape"&&app\.lawSheetMode\)/);
 assert.doesNotMatch(app,/if\(app\.inspectedSlot\)app\.selectedCardId=null/);
});
test("the comparison panel cannot resize the fixed mobile board or obscure a scenario film",()=>{
 assert.match(css,/@media \(max-width:760px\)/);
 assert.match(css,/position:fixed;z-index:118/);
 assert.match(css,/max-height:min\(49dvh,405px\)/);
 assert.match(css,/\.codex-sheet__actions button\{min-height:43px\}/);
 assert.ok(app.includes('!app.forecast && !app.film?.active ? detailCard(state) : ""'));
 const styles=read("styles.css"),worker=read("sw.js"),config=JSON.parse(read("app.config.json"));
 assert.ok(styles.includes("@import './client/stage11-law-codex.css';"));
 assert.ok(worker.includes("./client/law-readout.js"));
 assert.ok(worker.includes("./client/stage11-law-codex.css"));
 assert.equal(config.version,"0.9.0");
 assert.ok(worker.includes("crown-laws-v"+config.version));
});
