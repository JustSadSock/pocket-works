import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {Editor,MIN_BRUSH_SIZE,MAX_EDITOR_ZOOM,firstDamageEntry} from '../editor.js';
import {insideDamage} from '../artworks.js';

const zone={x:40,y:40,w:50,h:55,points:[[40,40],[90,40],[90,95],[40,95]]};
const makeEditor=()=>Object.assign(Object.create(Editor.prototype),{
 zone,color:'#334455',size:MIN_BRUSH_SIZE,tool:'brush',
 strokes:[],redoStack:[],working:null,edgePaused:false,edgeGestureGroup:null,outsidePoint:null,
 render(){},save(){},onChange(){},onSound(){}
});
const editor=makeEditor();
editor.beginStroke([10,65]);
assert.equal(editor.working,null,'touching the original must not create a stroke');
assert.equal(editor.edgePaused,true,'the drawing gesture is armed outside the mask');
editor.beginStroke([58,65]);
assert.ok(editor.working,'drawing starts automatically on entering the cutout');
assert.ok(editor.working.p[0][0]>40&&editor.working.p[0][0]<44,'entering segment reaches inner boundary');
assert.ok(editor.working.p.every(p=>insideDamage(zone,p)),'every saved point is inside the cutout');
editor.extendStroke([68,65]);
editor.extendStroke([112,65]);
assert.equal(editor.edgePaused,true,'leaving cutout suspends the same gesture');
assert.equal(editor.strokes.length,1,'first piece is committed without a cross-cutout connector');
editor.beginStroke([79,73]);
editor.extendStroke([76,80]);
editor.finishStroke();
assert.equal(editor.strokes.length,2,'returning to the cutout starts another segment');
assert.equal(editor.strokes[0].g,editor.strokes[1].g,'both pieces are one undo gesture');
assert.ok(editor.strokes.every(s=>s.p.every(p=>insideDamage(zone,p))),'no marks on original artwork');
const outsideOnly=makeEditor();
outsideOnly.beginStroke([3,3]);outsideOnly.beginStroke([7,7]);outsideOnly.finishStroke();
assert.equal(outsideOnly.strokes.length,0,'a gesture entirely outside never counts against stroke limit');
assert.equal(firstDamageEntry(zone,[10,60],[70,60])[0]>40,true,'fast finger movement catches the border');

const zoomer=Object.assign(Object.create(Editor.prototype),{
 viewport:{clientWidth:400,clientHeight:300},canvas:{style:{}},
 scale:1.9,tx:0,ty:0,lastCursor:null
});
zoomer.zoom(100);
assert.equal(zoomer.scale,MAX_EDITOR_ZOOM,'zoom buttons reach eight times');
zoomer.zoom(.001);
assert.equal(zoomer.scale,1,'zoom-out remains bounded');

const compile=src=>{
 const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};
 runInNewContext(js,{exports,Date,Math,Number,Array,Object,JSON,Map,Set,Error,console});
 return exports;
};
const current=compile(readFileSync(new URL('../server/module.ts',import.meta.url),'utf8'));
const old=compile(readFileSync(new URL('../../../pocketnet/module-versions/zamazka/v14.ts',import.meta.url),'utf8'));
assert.equal(current.RULESET_VERSION,21);
const host={id:'host',name:'Host'},guest={id:'guest',name:'Guest'},players=[host,guest];
const fine={c:'#324a43',s:.25,t:'brush',p:[[60,60],[65,65]]};
function submit(mod){
 const state=mod.createRoom({player:host}).state;
 mod.onJoin({state,player:guest,players});
 mod.onMessage({state,player:host,players,payload:{type:'start',rounds:1}});
 state.phase='drawing';
 const a=state.assignments[host.id];
 const result=mod.onMessage({state,player:host,players,payload:{
  type:'submit_chunk',round:state.round,art:a.art,variation:a.variation,
  revision:'rfine1',index:0,parts:1,strokes:[fine]
 }});
 return {state,result};
}
const modern=submit(current.default);
assert.equal(modern.state.assignments[host.id].strokes?.[0].s,.25,'new rooms accept real subpixel strokes');
assert.ok(modern.result.events.some(e=>e.type==='submission_saved'),'server confirms the fine artwork');
const legacy=submit(old.default);
assert.equal(legacy.state.assignments[host.id].strokes,null,'old pinned room rules are unmodified');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(app,/Number\(roomModuleVersion\.slice\(1\)\)>=15/,'legacy rooms retain 1px minimum');
assert.match(app,/settingConfirmVote/,'manual coin confirmation is opt-in in settings');
assert.match(app,/function doSubmit\(\)[\s\S]*?modal\('Сдать реставрацию\?'/,'painting submission retains confirmation');
assert.match(app,/id="brushSizeValue"/,'fine brush size is visible');
console.log('ZAMAZKA: outside-to-inside strokes, 8x zoom, 0.25px server brushes, voting-only optional confirmation OK');
