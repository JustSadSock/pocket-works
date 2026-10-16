import assert from 'node:assert/strict';
import {Editor} from '../editor.js';

const e=Object.create(Editor.prototype);
const custom={value:''},ink={data:new Uint8ClampedArray([33,77,129,255])};
let picks=0;
e.canvas={
 width:1200,height:900,
 getBoundingClientRect(){return {left:0,top:0,right:600,bottom:450,width:600,height:450}},
 getContext(){return {getImageData(){picks++;return ink}}},addEventListener(){}
};
e.viewport={classList:{toggle(){}},addEventListener(){},removeEventListener(){}};
e.root={querySelector(sel){return sel==='#customColor'?custom:null},querySelectorAll(){return []},addEventListener(){}};
e.tool='brush';e.color='#304a43';e.size=12;e.strokes=[{c:'#304a43',s:12,t:'brush',p:[[12,15],[14,17]]}];
e.working={c:'#ffab00',s:5,t:'brush',p:[[15,17],[16,20]]};
e.pointers=new Map();e.closed=false;e.lastCursor=null;e.spaceTool=null;e.onChange=()=>{};
e.saveSnapshot=()=>{};e.render=()=>{};e.save=()=>{};
const snapshot=e.getSnapshot();
assert.equal(snapshot.length,2,'unfinished stroke included in draft backup');
snapshot[0].p[0][0]=555;
assert.equal(e.strokes[0].p[0][0],12,'backup does not mutate geometry');
e.working=null;
await e.pick([125,170],true);
assert.equal(e.color,'#214d81','sampling visible painting works inside damaged region');
assert.equal(e.tool,'brush','temporary picker leaves original tool intact');
assert.equal(custom.value,e.color,'custom color chip updates');
assert.equal(picks,1);

// Beige damage paper is never a legitimate paint sample, even when opaque.
e.zone={x:100,y:130,w:110,h:95,points:[[100,130],[210,130],[210,225],[100,225]]};
assert.equal(e.canPick([150,185]),false,'empty restoration cutout must be rejected');
assert.equal(e.canPick([210,185]),true,'original painting outside cutout is allowed');
assert.equal(e.canPick([700,175]),false,'viewport beyond art is never a painting');
const preserved=e.color;
await e.pick([150,185],true);
assert.equal(e.color,preserved,'holding the pipette over beige cannot modify color');
assert.equal(picks,1,'background cannot even be sampled at canvas level');
e.strokes=[{c:'#123456',s:12,t:'brush',p:[[122,170],[128,170]]}];
assert.equal(e.canPick([125,170]),true,'real brush pigment is a valid source');
await e.pick([125,170],true);
assert.equal(picks,2,'a real brush stroke can be sampled');
e.strokes.push({c:'#e8ddc6',s:16,t:'erase',p:[[125,170]]});
assert.equal(e.canPick([125,170]),false,'erasing a colored stroke leaves no sample source');
e.strokes.push({c:'#abcdef',s:10,t:'brush',p:[[125,170]]});
assert.equal(e.canPick([125,170]),true,'new paint over erasure becomes pickable');
e.strokes=[];e.working={c:'#ff1100',s:10,t:'brush',p:[[135,175]]};
assert.equal(e.canPick([135,175]),true,'current uncommitted brush stroke is a valid source');
e.working=null;
e.strokes=[{c:'#123456',s:12,t:'brush',p:[[125,170]]}];

const handler=Object.create(Editor.prototype);
Object.assign(handler,e,{tool:'brush',color:'#123456',spaceTool:null,spacePicked:false,lastMousePoint:{clientX:125,clientY:170,pointerType:'mouse'},strokes:[],working:null});
handler.root=e.root;
const listeners=new Map();globalThis.window={addEventListener(name,fn){listeners.set(name,fn)}};
globalThis.document={querySelector(){return null}};
handler.attach();
const prevent=()=>{};
handler.keyboardDown({code:'Space',preventDefault:prevent,repeat:false,ctrlKey:false,altKey:false,metaKey:false,target:{matches(){return false}}});
assert.equal(handler.tool,'picker','hold Space activates eyedropper');
assert.equal(handler.spaceTool,'brush','the previous tool is preserved');
handler.keyboardUp({code:'Space',preventDefault:prevent});
assert.equal(handler.tool,'brush','releasing Space restores previous tool');
await Promise.resolve();
assert.equal(handler.color,'#214d81','releasing Space samples hover position without click');
console.log('ZAMAZKA: unfinished stroke backup, own-paint picker and Space hold/release OK');
