import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Editor} from '../editor.js';
const listeners=new Map(),viewportListeners=new Map(),rootListeners=new Map();
const viewport={
 clientLeft:5,clientTop:5,clientWidth:600,clientHeight:450,
 classList:{toggle(){},add(){},remove(){}},
 getBoundingClientRect(){return {left:10,top:20,width:610,height:460}},
 addEventListener(k,fn){viewportListeners.set(k,fn)},removeEventListener(){},
};
const canvas={
 width:1200,height:900,
 getBoundingClientRect(){return {left:15,top:25,width:600,height:450,right:615,bottom:475}},
 addEventListener(k,fn){listeners.set(k,fn)},removeEventListener(){},
};
const custom={value:'14'},cursor={style:{setProperty(){}},hidden:true};
const root={
 querySelector(sel){
  if(sel==='#brushSize')return custom;
  if(sel==='#brushCursor')return cursor;
  return null;
 },
 querySelectorAll(){return []},
 addEventListener(k,fn){rootListeners.set(k,fn)},
 removeEventListener(){}
};
const e=Object.create(Editor.prototype);
Object.assign(e,{
 canvas,viewport,root,cursor,
 tool:'brush',size:14,color:'#123456',
 inputMode:'direct',strokes:[],working:null,pointers:new Map(),
 lastCursor:null,lastMousePoint:null,armButton:null,sideButton:null,
 closed:false,scale:1.9,tx:0,ty:0,
 finishStroke(){this.working=null},zoom(){this.zoomCalls=(this.zoomCalls||0)+1},
 render(){},showChanges:0
});
globalThis.window={addEventListener(){},removeEventListener(){}};
globalThis.document={querySelector(){return null}};
e.showCursor({clientX:115,clientY:145,pointerType:'mouse'});
assert.equal(cursor.style.left,'100px','cursor accounts for left border');
assert.equal(cursor.style.top,'120px','cursor accounts for top border');
assert.deepEqual(e.point({clientX:115,clientY:145}),[100,120],'paint and cursor use same canvas coordinates');
e.attach();
const wheel=viewportListeners.get('wheel');
let prevented=false;
wheel({altKey:true,deltaY:-110,preventDefault(){prevented=true}});
assert.equal(e.size,16,'Alt + wheel increases brush diameter');
assert.equal(custom.value,'16','size slider follows hotkey');
assert.equal(e.zoomCalls||0,0,'Alt + wheel must not zoom');
wheel({altKey:false,deltaY:110,clientX:115,clientY:145,preventDefault(){}});
assert.equal(e.zoomCalls,1,'normal wheel retains zoom');
assert.ok(prevented);
e.pointers.set(7,[120,170]);
e.pinch={d:5};
listeners.get('lostpointercapture')({pointerId:7,pointerType:'mouse'});
assert.equal(e.pointers.size,0,'lost capture cannot block future painting');
assert.equal(e.pinch,null,'pinch state recovers');
// RMB + horizontal drag changes the brush diameter, without adding a paint stroke
// or taking over the middle-button pan gesture.
const right=(x,id=81)=>({pointerId:id,pointerType:'mouse',button:2,clientX:x,clientY:145,
  target:canvas,preventDefault(){}});
const startingSize=e.size;
e.down(right(115));
assert.equal(e.pointers.size,0,'RMB size drag never begins a drawing pointer');
assert.equal(e.working,null,'RMB cannot paint');
e.move({...right(195),button:-1});
assert.ok(e.size>startingSize,'rightward RMB drag increases brush diameter');
assert.equal(Number(custom.value),e.size,'size slider tracks RMB adjustment');
e.move({...right(35),button:-1});
assert.ok(e.size<startingSize,'leftward RMB drag decreases brush diameter');
e.up({...right(35),type:'pointerup'});
assert.equal(e.sizeDrag,null,'release clears brush size drag');
e.down(right(115,82));e.lostCapture({pointerId:82,pointerType:'mouse',clientX:115,clientY:145});
assert.equal(e.sizeDrag,null,'lost pointer capture cannot strand resizing');
e.down(right(115,83));e.keyboardBlur();
assert.equal(e.sizeDrag,null,'window blur cancels RMB resizing');
const menu=viewportListeners.get('contextmenu');
let contextPrevented=false;menu({preventDefault(){contextPrevented=true}});
assert.ok(contextPrevented,'browser context menu is suppressed over drawing area');
const css=readFileSync(new URL('../gallery-motion.css',import.meta.url),'utf8');
assert.match(css,/\.commons-desk canvas\{width:min\(100%,720px\);height:auto;max-height:none;object-fit:fill/,'desktop shared canvas must not letterbox');
console.log('ZAMAZKA: border-aligned cursor, Alt+wheel brush, capture loss and shared-canvas dimensions OK');
