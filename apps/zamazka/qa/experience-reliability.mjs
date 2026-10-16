import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {paintPackets} from '../draft-transfer.js';
import {Editor,simplifyPoints,MAX_STROKE_POINTS} from '../editor.js';

let time=42_000;
class Clock extends Date{static now(){return time}}
const moduleSrc=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const output=ts.transpileModule(moduleSrc,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(output,{exports,Date:Clock,Math,Number,Array,Set,Map,JSON,Object,Error,console});
assert.equal(exports.RULESET_VERSION,19);
const game=exports.default,host={id:'author',name:'Artist'},guest={id:'guest',name:'Expert'},players=[host,guest];
const state=game.createRoom({player:host}).state;
game.onJoin({state,player:guest,players});
const send=(actor,payload)=>game.onMessage({state,player:actor,players,payload});
send(host,{type:'start',rounds:1,drawingSeconds:300});
time=state.deadline+1;send(host,{type:'pulse'});
const a=state.assignments[host.id];
const strokes=Array.from({length:60},(_,i)=>({c:'#123456',s:12,t:'brush',p:Array.from({length:23},(_,j)=>[i*8+j/10,j*5])}));
const chunks=paintPackets({type:'submit_chunk',round:state.round,art:a.art,variation:a.variation,strokes,revision:'rconfirmed-1'});
assert.ok(chunks.length>1);
for(const packet of chunks.slice(0,-1)){
 const result=send(host,packet);
 assert.equal(state.assignments[host.id].strokes,null,'no premature commit');
 assert.ok(!result.events.some(e=>e.type==='submission_saved'),'no early acknowledgement');
}
const saved=send(host,chunks.at(-1));
assert.equal(state.assignments[host.id].strokes.length,strokes.length,'complete drawing committed');
const receipt=saved.events.find(e=>e.type==='submission_saved');
assert.equal(receipt?.to,host.id,'receipt private');
assert.equal(receipt?.payload.revision,'rconfirmed-1','receipt linked to submitted revision');
assert.equal(receipt?.payload.lines,strokes.length);
assert.ok(saved.events.some(e=>e.type==='state'&&e.to===host.id&&e.payload.done.includes(host.id)),'state independently confirms receipt');
const editor=Object.create(Editor.prototype);
Object.assign(editor,{zone:{x:0,y:0,w:600,h:450},strokes:[],working:null,size:12,tool:'brush',color:'#123456',limitWarned:false,redoStack:[],render(){},save(){},saveSnapshot(){},inside(){return true},onChange(){}});
editor.beginStroke([2,2]);
for(let i=0;i<190;i++)editor.extendStroke([2+i*2,30+Math.sin(i/12)*7]);
editor.finishStroke();
assert.ok(editor.strokes.every(s=>s.p.length<=MAX_STROKE_POINTS),'network segment cap preserved');
const poly=Array.from({length:45},(_,i)=>[i,i%2===0?20:20.02]);
assert.deepEqual(simplifyPoints(poly,20)[0],poly[0],'polyline first endpoint fixed');
assert.deepEqual(simplifyPoints(poly,20).at(-1),poly.at(-1),'polyline last endpoint fixed');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
assert.match(app,/mode==='resume'/,'reload resumes prior room');
assert.match(app,/submission_saved/,'server ACK recognized');
assert.match(app,/attemptSubmission\(\)/,'lost upload retried');
assert.match(app,/pendingSubmit=\(\(\)=>/,'pending final snapshot persisted');
assert.match(app,/id="pickerPreview"/,'eyedropper preview mounted');
const render=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
assert.match(render,/paintCachedFrame/,'editor caches background and completed strokes');
assert.match(render,/getCoalescedEvents/,'coalesced pointer events supported');
// Render-cache test: a moving hand must never repaint 60 finished strokes.
let createdLayers=0;
function mockCanvas(){
 const canvas={width:600,height:450,parentElement:{clientWidth:600},getBoundingClientRect(){return {width:600,height:450}}};
 const state={lineCalls:0};
 const ctx=new Proxy({canvas,state},{get(obj,key){
   if(key in obj)return obj[key];
   if(key==='lineTo')return ()=>{state.lineCalls++};
   return ()=>{};
 }});
 canvas.getContext=()=>ctx;return canvas;
}
globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false})};
globalThis.document={createElement(type){assert.equal(type,'canvas');createdLayers++;return mockCanvas()}};
const cached=Object.create(Editor.prototype);
Object.assign(cached,{canvas:mockCanvas(),closed:false,zone:{x:150,y:100,w:200,h:200,kind:'round',seed:18},
 strokes:[{c:'#123456',s:12,t:'brush',p:[[160,120],[180,150]]}],
 working:null,paintRevision:1});
const image={naturalWidth:800,naturalHeight:600};
cached.paintCachedFrame(image);
const firstLineCount=cached.inkCtx.state.lineCalls;
const firstLayers=createdLayers;
assert.ok(firstLineCount>0,'completed paint rendered at least once');
cached.working={c:'#ff00aa',s:8,t:'brush',p:[[180,150],[200,180]]};
cached.paintCachedFrame(image);
assert.equal(createdLayers,firstLayers+1,'first live brush creates exactly one reusable paint layer');
const activeLayerCount=createdLayers;
cached.paintCachedFrame(image);
assert.equal(createdLayers,activeLayerCount,'subsequent brush frames reuse existing layers');
assert.equal(cached.inkCtx.state.lineCalls,firstLineCount,'live pointer does not replay committed strokes');
cached.paintRevision++;
cached.paintCachedFrame(image);
assert.ok(cached.inkCtx.state.lineCalls>firstLineCount,'changing committed painting invalidates ink cache');

// A long pointer gesture becomes several packet-sized network segments BEFORE
// pointerup. Each retired segment must already be visible in the ink cache;
// the current live segment is rendered separately on every animation frame.
const continuous=Object.create(Editor.prototype);
Object.assign(continuous,{
 canvas:mockCanvas(),closed:false,zone:{x:0,y:0,w:600,h:450},
 strokes:[],working:null,paintRevision:0,size:12,tool:'brush',color:'#345678',
 redoStack:[],limitWarned:false,inside(){return true},render(){},
 save(){},saveSnapshot(){},onChange(){}
});
continuous.paintCachedFrame(image);
assert.equal(continuous.inkCtx.state.lineCalls,0,'initially no permanent brush path');
continuous.beginStroke([80,150]);
for(let i=1;i<=MAX_STROKE_POINTS+1;i++)continuous.extendStroke([80+i*2,150+15*Math.sin(i/6)]);
assert.equal(continuous.strokes.length,1,'the first network segment is retired mid-gesture');
assert.ok(continuous.working?.p.length>1,'the pointer is still drawing the next segment');
continuous.paintCachedFrame(image);
const firstSegmentCalls=continuous.inkCtx.state.lineCalls;
assert.ok(firstSegmentCalls>0,'the retired segment stays visible before pointerup');
for(let i=MAX_STROKE_POINTS+2;i<=MAX_STROKE_POINTS*2+5;i++)continuous.extendStroke([80+i*2,150+15*Math.sin(i/6)]);
assert.ok(continuous.strokes.length>=2,'the same gesture can retire another segment');
continuous.paintCachedFrame(image);
assert.ok(continuous.inkCtx.state.lineCalls>firstSegmentCalls,'second rollover also updates the visible completed ink');
assert.equal(new Set(continuous.strokes.map(stroke=>stroke.g)).size,1,'all segments remain one undo gesture');

console.log('ZAMAZKA: atomic server receipt, persisted retry, room restoration, point fidelity and cached drawing OK');
