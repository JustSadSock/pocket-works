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
