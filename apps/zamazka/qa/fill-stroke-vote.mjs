import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {floodFillRaster,Editor} from '../editor.js';

const w=48,h=30,area=new Uint8ClampedArray(w*h*4),walls=new Uint8ClampedArray(w*h*4);
const at=(x,y)=>(y*w+x)*4;
for(let y=3;y<27;y++)for(let x=3;x<45;x++)area[at(x,y)+3]=255;
// A pen separator touching two damage-mask edges must close BOTH paint basins.
// The previous mergeOpenRegions mode incorrectly erased adjacent fills.
for(let y=3;y<27;y++)walls[at(23,y)+3]=255;
let out=new Uint8ClampedArray(w*h*4);
const run=(point,mergeOpenRegions)=>floodFillRaster({
 width:w,height:h,walls,zone:area,output:out,point,color:[220,30,70],mergeOpenRegions
});
assert.ok(run([12,15],false)>100);
assert.equal(out[at(30,15)+3],0,'legacy connected basin contains only one side');
out=new Uint8ClampedArray(w*h*4);
assert.ok(run([12,15],true)>100);
for(const [x,y] of [[4,4],[12,15]]){
 assert.deepEqual(Array.from(out.slice(at(x,y),at(x,y)+4)),[220,30,70,255],
  'the clicked basin is painted up to its own boundary');
}
for(const [x,y] of [[30,15],[44,26]]){
 assert.equal(out[at(x,y)+3],0,
  'a cutout-edge separator must not flood a neighbouring basin');
}
assert.ok(run([30,15],true)>100,'other basin can be filled independently');
assert.equal(out[at(12,15)],220,'the new fill must not replace its neighbour');
assert.equal(out[at(2,15)+3],0,'even full-region fill never leaves damaged mask');

// A genuinely enclosed pocket is still independently colourable.
const pocketWalls=new Uint8ClampedArray(w*h*4);
for(let y=7;y<=17;y++)for(let x=8;x<=18;x++)
 if(x===8||x===18||y===7||y===17)pocketWalls[at(x,y)+3]=255;
out=new Uint8ClampedArray(w*h*4);
const pocket=floodFillRaster({width:w,height:h,walls:pocketWalls,zone:area,output:out,
 point:[12,12],color:[10,120,200],mergeOpenRegions:true});
assert.ok(pocket>30&&pocket<200,'closed inner area stays independent');
assert.equal(out[at(35,12)+3],0,'closed pocket does not fill the whole patch');

const editor=Object.assign(Object.create(Editor.prototype),{
 zone:{x:0,y:0,w:600,h:450},strokes:[],working:null,
 saveSnapshot(){},save(){},render(){},onChange(){},
 size:8,tool:'brush',color:'#123456',redoStack:[]
});
editor.beginStroke([12,30]);
for(let i=1;i<=22;i++)editor.extendStroke([12+i*.6,30]);
editor.finishStroke();
assert.ok(editor.strokes[0].p.length>12,'close-spaced motion is retained rather than randomly skipped');
const original=editor.strokes[0];
editor.strokes=[original,{...original,p:original.p.map(p=>[p[0]+160,p[1]+40])}];
editor.strokes[1].g=editor.strokes[0].g;
editor.compactStrokeBudget();
assert.equal(editor.strokes.length,2,'budget compaction never joins two disconnected parts of a gesture');

const moduleSource=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(moduleSource,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const api={},randomMath=Object.create(Math);randomMath.random=()=>.12;
runInNewContext(compiled,{exports:api,Math:randomMath,Date,Array,Number,Object,JSON,Set,Map,Error,console});
assert.equal(api.RULESET_VERSION,21,'new immutable PocketNet ruleset');
const host={id:'a',name:'A'},guest={id:'b',name:'B'},players=[host,guest];
const state=api.default.createRoom({player:host}).state;
api.default.onJoin({state,player:guest,players});
api.default.onMessage({state,player:host,players,payload:{type:'start',rounds:1}});
assert.equal(state.assignments.a.art,state.assignments.b.art,'two participants can receive same painting');
assert.ok(state.selected.includes(state.assignments.a.art),'duplicate is among five previewed images');
assert.notEqual(state.assignments.a.variation,undefined);
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../restoration-17.css',import.meta.url),'utf8');
assert.match(app,/voteScreenToken===view\.round\+':'\+view\.turn/,'vote state patches live DOM instead of recreating gallery');
assert.match(app,/oldBallot=page==='vote'&&which==='verdict'/,'time expiry preserves painted ballot while public vote dossier mounts');
assert.match(app,/finishVoteTransition\(\)/,'outgoing ballot cleared after replacement canvas is ready');
assert.match(css,/\.vote-transition-layer/,'phase transition layer fades without redrawing original cards');
assert.match(readFileSync(new URL('../editor.js',import.meta.url),'utf8'),/canvas\.clientWidth\|\|canvas\.parentElement/,'zoom does not trigger layout-based raster reallocations');
console.log('ZAMAZKA: no half-fill, closed pockets, continuous strokes, duplicate art, no voting redraw and zoom cache OK');
