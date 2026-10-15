import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const css=readFileSync(new URL('../adaptive-layout.css',import.meta.url),'utf8');
const focusCSS=readFileSync(new URL('../mobile-focus.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const editor=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.ok(html.indexOf('href="./native-art.css"')<html.indexOf('href="./adaptive-layout.css"'));
assert.match(sw,/\.\/adaptive-layout\.css/,'offline CSS cache includes hotfix');
assert.match(sw,/\.\/mobile-focus\.css/,'offline cache includes portrait focus layout');
assert.ok(html.indexOf('href="./mobile-focus.css"')>html.indexOf('href="./museum-afterhours-home.css"'), 'portrait CSS wins theme cascade');
assert.match(css,/\.screen>\.mobile-preview \.gallery\.exhibition-grid\{\s*display:flex!important/,'preview is flex, not WebKit grid');
assert.match(css,/flex:0 0 calc\(100% - 42px\)!important/,'preview exposes a single broad painting');
assert.match(css,/\.gallery\.exhibition-grid>\.picture img\{[\s\S]*?object-fit:contain!important/,'full original without crop');
assert.match(css,/\.screen \.reveal-phase \.unveil-frame/,'mobile reveal artwork capped');
assert.match(css,/38dvh,310px/,'reveal no longer takes nearly all display height');
assert.match(focusCSS,/\.collection-page \.archive-gallery \{[\s\S]*?overflow-x:auto!important;overflow-y:hidden!important/,'archive scrolls only horizontally');
assert.match(focusCSS,/\.suspect-gallery \{[\s\S]*?overflow-x:auto!important;overflow-y:hidden!important/,'voting gallery is horizontal');
assert.match(focusCSS,/overflow:clip!important/,'portrait root cannot scroll vertically');
assert.match(css,/\.collection-page \.archive-work:nth-child\(2n\)\{transform:none!important/,'archive has no alternating offset');
assert.match(app,/class="page collection-page"/,'archive uses new responsive layout');
assert.match(app,/class="gallery archive-gallery"/,'restorations are not big empty cards');
assert.match(app,/class="picture-image archive-art-frame"/,'correct painting aspect passed through image parent');
assert.match(app,/id="precisionHelp"/,'precision explanation always exists in editor');
assert.match(app,/storedPractice\|\|JSON\.parse\(localStorage\.getItem\(PRACTICE_KEY\)/,'can resume temporary practice from IndexedDB or fallback');
assert.match(app,/sessionStorage\.setItem\(PRACTICE_KEY,data\)/,'can temporarily save practice');
assert.doesNotMatch(editor,/this\.armed=!this\.armed/,'precision must not stay armed between taps');
assert.match(editor,/this\.setArmState\(false\)/,'button release must immediately stop painting');
assert.match(editor,/sessionStorage\.setItem\(this\.draftKey,JSON\.stringify\(strokes\)\)/,'editor writes a tab backup before IndexedDB');
assert.match(editor,/try\{localStorage\.setItem\('pocket-works:zamazka:input-mode'/,'quota cannot interrupt mode UI');
const section=editor.slice(editor.indexOf('this.setArmState=active=>{'),editor.indexOf("this.armButton?.addEventListener('pointerdown'"));
assert.ok(section.includes('this.armUp=e=>{'));
const listeners={};
const arm={classList:{toggle(k,v){listeners[k]=v}},setAttribute(k,v){listeners[k]=v},querySelector(){return {set textContent(v){listeners.label=v}}},setPointerCapture(){}};
const tool={inputMode:'precision',armPointer:null,armed:false,armButton:arm,pointers:new Map(),
 updatePrecisionHelp(){listeners.help=this.armed?'drawing':'aiming'},
 finishStroke(){listeners.finished=(listeners.finished||0)+1}};
runInNewContext('(function(){'+section+'}).call(tool)',{tool});
function event(id){return {pointerId:id,preventDefault(){},stopPropagation(){}}}
tool.armDown(event(71));assert.equal(tool.armed,true);assert.equal(listeners.label,'РИСУЮ');
tool.armUp(event(71));assert.equal(tool.armed,false,'lifting the second finger MUST disarm precision ink');
assert.equal(listeners.label,'УДЕРЖИВАЙ');
assert.equal(listeners.finished,1,'finger release ends an active stroke');
tool.armDown(event(72));assert.equal(tool.armed,true);
tool.armUp(event(72));assert.equal(tool.armed,false);
assert.equal(listeners.finished,2,'second press and release also ends ink; no toggle backlog');
const practiceFn=app.slice(app.indexOf('function persistPractice(){'),app.indexOf('function newPractice(){'));
const tmp=new Map(),alerts=[];
const fake={
 practice:{phase:'preview',round:1,rounds:1,selected:[1,2,3,4,5],deadline:10,drawingSeconds:160,mine:{art:1,variation:3},strokes:[]},
 ARCHIVE_EDITION:4,PRACTICE_KEY:'practice',screen:{querySelector:()=>null},
 zamazkaStore:{set:()=>Promise.resolve()},Promise,
 localStorage:{setItem(){throw new Error('quota exceeded')}},
 sessionStorage:{setItem(k,v){tmp.set(k,v)}},
 notify:m=>alerts.push(m),JSON
};
runInNewContext('(function(){'+practiceFn+';persistPractice()}).call(null)',fake);
assert.equal(JSON.parse(tmp.get('practice')).selected.length,5,'practice safely falls back to tab storage');
assert.equal(alerts.length,0,'successful session backup avoids repeated quota toasts');
console.log('ZAMAZKA MOBILE: one-card swipe, compact reveal/archive, two-finger press-and-hold precision and quota-safe drafts OK');
