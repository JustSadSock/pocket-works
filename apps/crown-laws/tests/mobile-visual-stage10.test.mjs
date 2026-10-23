import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createInitialState } from "../shared/game-engine.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const js=read("client/app.js");
const css=read("client/stage10-mobile-qa.css");

test("board, effects and ghost coordinates are expressed as browser-native percent literals",()=>{
 assert.match(js,/style="--x:\$\{piece\.x\};--y:\$\{piece\.y\};left:\$\{\(piece\.x\+\.5\)\*20\}%;top:\$\{\(piece\.y\+\.5\)\*\(100\/7\)\}%"/);
 assert.match(js,/style="--x:\$\{effect\.x\};--y:\$\{effect\.y\};left:\$\{\(effect\.x\+\.5\)\*20\}%;top:\$\{\(effect\.y\+\.5\)\*\(100\/7\)\}%"/);
 assert.match(js,/style="--gx:\$\{p\.x\};--gy:\$\{p\.y\};left:\$\{\(p\.x\+\.5\)\*20\}%;top:\$\{\(p\.y\+\.5\)\*\(100\/7\)\}%"/);
 for(let y=0;y<7;y++)for(let x=0;x<5;x++){
  const left=(x+.5)*20,top=(y+.5)*(100/7);
  assert.ok(left>0 && left<100 && top>0 && top<100);
 }
 const initial=createInitialState({seed:"mobile-visual"});
 for(const piece of Object.values(initial.pieces)){
  assert.ok(piece.x>=0 && piece.x<=4 && piece.y>=0 && piece.y<=6);
 }
});

test("board restores exactly 35 individually visible cell surfaces",()=>{
 assert.match(css,/height:min\(140cqw,100cqh\)/);\n assert.match(css,/\.board-grid\s*\{/);
 assert.match(css,/width:100%;\s*height:100%/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-rows:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css,/\.board-cell\s*\{/);
 assert.match(css,/min-width:0;\s*min-height:0/);
 assert.match(css,/box-shadow:inset 0 0 0 1px/);
});

test("mobile decrees show a horizontally arranged seal and readable title without covering actions",()=>{
 assert.match(css,/\.law-card\s*\{/);
 assert.match(css,/flex-direction:row/);
 assert.match(css,/\.law-card__sigil\s*\{/);
 assert.match(css,/flex:0 0 36px/);
 assert.match(css,/\.law-card__title\s*\{/);
 assert.match(css,/-webkit-line-clamp:2/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/\.hand-panel \.detail-card/);
});

test("advisor does not display a competing decree sheet during the forecast or live playback",()=>{
 assert.match(js,/app\.selectedCardId && !app\.forecast && !app\.film\?\.active \? detailCard/);
 assert.match(js,/!app\.forecast && !app\.film\?\.active && !app\.selectedCardId && app\.focusCardId/);
 assert.match(js,/window\.inspect_crown_board = \(\) =>/);
 assert.match(js,/cellCount: cells\.length/);
 assert.match(js,/pieces: Array\.from\(root\.querySelectorAll\("\.piece"\)\)/);
});

test("release includes the CSS fix in the service-worker precache",()=>{
 const config=JSON.parse(read("app.config.json"));
 assert.equal(config.version,"0.8.2");
 assert.ok(read("styles.css").includes("@import './client/stage10-mobile-qa.css';"));
 assert.ok(read("sw.js").includes("./client/stage10-mobile-qa.css"));
 assert.ok(read("index.html").includes('data-app-version="0.8.2"'));
 assert.match(read("sw.js"),/crown-laws-v0\.8\.2/);
});
