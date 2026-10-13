import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const css=readFileSync(new URL('../adaptive-layout.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const editor=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert.ok(html.indexOf('href="./native-art.css"')<html.indexOf('href="./adaptive-layout.css"'));
assert.match(sw,/\.\/adaptive-layout\.css/,'offline CSS cache includes hotfix');
assert.match(css,/\.screen>\.mobile-preview \.gallery\.exhibition-grid\{\s*display:flex!important/,'preview is flex, not WebKit grid');
assert.match(css,/flex:0 0 calc\(100% - 42px\)!important/,'preview exposes a single broad painting');
assert.match(css,/\.gallery\.exhibition-grid>\.picture img\{[\s\S]*?object-fit:contain!important/,'full original without crop');
assert.match(css,/\.screen \.reveal-phase \.unveil-frame/,'mobile reveal artwork capped');
assert.match(css,/38dvh,310px/,'reveal no longer takes nearly all display height');
assert.match(css,/\.collection-page>\.archive-gallery\{\s*display:flex!important/,'archive is a vertical list');
assert.match(css,/\.collection-page \.archive-gallery>\.archive-work\{\s*display:grid!important/,'each work has thumbnail next to title');
assert.match(css,/\.collection-page \.archive-work:nth-child\(2n\)\{transform:none!important/,'archive has no alternating offset');
assert.match(app,/class="page collection-page"/,'archive uses new responsive layout');
assert.match(app,/class="gallery archive-gallery"/,'restorations are not big empty cards');
assert.match(app,/class="picture-image archive-art-frame"/,'correct painting aspect passed through image parent');
assert.match(app,/id="precisionHelp"/,'precision explanation always exists in editor');
assert.match(app,/sessionStorage\.getItem\(PRACTICE_KEY\)\|\|localStorage\.getItem/,'can resume temporary practice');
assert.match(app,/sessionStorage\.setItem\(PRACTICE_KEY,data\)/,'can temporarily save practice');
assert.match(editor,/this\.armed=!this\.armed/,'precision button is a toggle, not second-finger hold');
assert.match(editor,/this\.armButton\.querySelector\('strong'\)\.textContent=this\.armed\?'СТОП':'РИСОВАТЬ'/);
assert.match(editor,/sessionStorage\.setItem\(this\.draftKey,payload\)/,'editor retains backup if local storage is full');
assert.match(editor,/try\{localStorage\.setItem\('pocket-works:zamazka:input-mode'/,'quota cannot interrupt mode UI');
const section=editor.slice(editor.indexOf('this.armDown=e=>{'),editor.indexOf("this.armButton?.addEventListener('pointerdown'"));
assert.ok(section.includes('this.armUp=e=>{'));
const listeners={};
const arm={classList:{toggle(k,v){listeners[k]=v}},setAttribute(k,v){listeners[k]=v},querySelector(){return {set textContent(v){listeners.label=v}}},setPointerCapture(){}};
const tool={inputMode:'precision',armPointer:null,armed:false,armButton:arm,pointers:new Map(),
 updatePrecisionHelp(){listeners.help=this.armed?'drawing':'aiming'},
 finishStroke(){listeners.finished=(listeners.finished||0)+1}};
runInNewContext('(function(){'+section+'}).call(tool)',{tool});
function event(id){return {pointerId:id,preventDefault(){},stopPropagation(){}}}
tool.armDown(event(71));assert.equal(tool.armed,true);assert.equal(listeners.label,'СТОП');
tool.armUp(event(71));assert.equal(tool.armed,true,'lifting finger keeps precision drawing armed');
tool.armDown(event(72));assert.equal(tool.armed,false);assert.equal(listeners.label,'РИСОВАТЬ');
tool.armUp(event(72));assert.equal(listeners.finished,1,'disabling precision ends the stroke');
const practiceFn=app.slice(app.indexOf('function persistPractice(){'),app.indexOf('function newPractice(){'));
const tmp=new Map(),alerts=[];
const fake={
 practice:{phase:'preview',round:1,rounds:1,selected:[1,2,3,4,5],deadline:10,drawingSeconds:160,mine:{art:1,variation:3},strokes:[]},
 ARCHIVE_EDITION:4,PRACTICE_KEY:'practice',screen:{querySelector:()=>null},
 localStorage:{setItem(){throw new Error('quota exceeded')}},
 sessionStorage:{setItem(k,v){tmp.set(k,v)}},
 notify:m=>alerts.push(m),JSON
};
runInNewContext('(function(){'+practiceFn+';persistPractice()}).call(null)',fake);
assert.equal(JSON.parse(tmp.get('practice')).selected.length,5,'practice safely falls back to tab storage');
assert.equal(alerts.length,0,'successful session backup avoids repeated quota toasts');
console.log('ZAMAZKA MOBILE: one-card swipe, compact reveal/archive, latch-to-draw precision and quota-safe drafts OK');
