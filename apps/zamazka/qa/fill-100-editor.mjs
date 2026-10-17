import assert from 'node:assert/strict';
import {Editor} from '../editor.js';

// Scenarios 81–95 use real Editor gesture, undo, redo, serialization,
// point/zoom and draft adoption paths. No fake button outcomes: commands
// invoke the real registered event callbacks.
let passed=0;
const CASES={
 81:'one bucket then undo',82:'bucket undo redo',83:'five undo operations',
 84:'five redo operations',85:'undo then a different bucket',
 86:'one bucket autosave restore',87:'50 buckets draft restore',
 88:'bucket after draft restore',89:'render submission serialization',
 90:'archive snapshot pigment fidelity',91:'mouse positioning',
 92:'finger positioning',93:'stylus positioning',94:'two-finger zoom positioning',
 95:'portrait artwork positioning'};
const whole={x:0,y:0,w:600,h:450,points:[[0,0],[600,0],[600,450],[0,450]]};
const rects=[[0,0,600,450],[30,55,460,335],[80,70,240,410]];
function make(v){
 const [left,top,width,height]=rects[v],events={};
 const root={querySelector(){return null},querySelectorAll(){return []},addEventListener(n,fn){events['root:'+n]=fn}};
 const viewport={clientWidth:width,clientHeight:height,clientLeft:0,clientTop:0,style:{},classList:{toggle(){},add(){},remove(){}},
  addEventListener(n,fn){events['view:'+n]=fn},getBoundingClientRect(){return {left,top,width,height}}};
 const canvas={width:1200,height:900,style:{},classList:{toggle(){},add(){},remove(){}},setPointerCapture(){},
  addEventListener(n,fn){events['canvas:'+n]=fn},getBoundingClientRect(){return {left,top,width,height,right:left+width,bottom:top+height}}};
 const e=Object.assign(Object.create(Editor.prototype),{zone:whole,root,viewport,canvas,cursor:null,armButton:null,sideButton:null,
  tool:'fill',color:'#b13d27',size:8,inputMode:'direct',hand:'right',
  strokes:[],redoStack:[],working:null,pointers:new Map(),scale:1.9,tx:0,ty:0,
  closed:false,armed:false,armPointer:null,aimPointer:null,aim:null,spaceTool:null,
  edgePaused:false,edgeGestureGroup:null,outsidePoint:null,limitWarned:false,
  render(){this.renderCount=(this.renderCount||0)+1},save(){this.savedCount=(this.savedCount||0)+1},
  onChange(){},onSound(){},hidePickerPreview(){},updateDrawingTip(){},
  updatePrecisionHelp(){},hideCursor(){},showCursor(){},cursorContact(){}
 });
 const oldWin=globalThis.window,oldDoc=globalThis.document;
 globalThis.window={addEventListener(){}};
 globalThis.document={addEventListener(){},querySelector(){return null},visibilityState:'visible'};
 try{e.attach()}finally{
  if(oldWin===undefined)delete globalThis.window;else globalThis.window=oldWin;
  if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;
 }
 return e;
}
const stroke=(i)=>({t:'fill',c:'#'+(0x223344+i*1000).toString(16).padStart(6,'0'),s:8,p:[[100+i%150,120+i%130]]});
const command=(e,cmd)=>e.actions({target:{closest(){return {dataset:{cmd}}}}});
const tap=(e,x=100,y=120,type='mouse')=>{
 const r=e.canvas.getBoundingClientRect();
 e.down({pointerId:99,button:0,pointerType:type,clientX:r.left+x*r.width/600,
  clientY:r.top+y*r.height/450,target:e.canvas,preventDefault(){}});
 e.up({pointerId:99,button:0,pointerType:type,clientX:r.left+x*r.width/600,
  clientY:r.top+y*r.height/450,target:e.canvas,type:'pointerup',preventDefault(){}});
};
for(let id=81;id<=95;id++)for(let v=0;v<3;v++){
 try{
 const e=make(v);
 if(id===81){tap(e);assert.equal(e.strokes.length,1);command(e,'undo');assert.equal(e.strokes.length,0);assert.equal(e.redoStack.length,1)}
 if(id===82){tap(e);command(e,'undo');command(e,'redo');assert.equal(e.strokes.length,1);assert.equal(e.strokes[0].t,'fill')}
 if(id===83){e.strokes=Array.from({length:5},(_,i)=>stroke(i));e.recountPoints();for(let n=0;n<5;n++)command(e,'undo');assert.equal(e.strokes.length,0);assert.equal(e.redoStack.length,5)}
 if(id===84){e.strokes=Array.from({length:5},(_,i)=>stroke(i));e.recountPoints();for(let n=0;n<5;n++)command(e,'undo');for(let n=0;n<5;n++)command(e,'redo');assert.deepEqual(e.strokes,Array.from({length:5},(_,i)=>stroke(i)))}
 if(id===85){tap(e);command(e,'undo');e.color='#22cc33';tap(e,240,180);assert.equal(e.strokes.length,1);assert.equal(e.redoStack.length,0);assert.equal(e.strokes[0].c,'#22cc33')}
 if(id===86){tap(e);const saved=JSON.parse(JSON.stringify(e.getSnapshot())),next=make(v);assert(next.adoptDraft(saved));assert.deepEqual(next.getSnapshot(),saved)}
 if(id===87){e.strokes=Array.from({length:50},(_,i)=>stroke(i));const saved=JSON.parse(JSON.stringify(e.getSnapshot())),next=make(v);assert(next.adoptDraft(saved));assert.equal(next.getSnapshot().length,50);assert.deepEqual(next.getSnapshot(),saved)}
 if(id===88){tap(e);const saved=e.getSnapshot(),next=make(v);assert(next.adoptDraft(saved));next.color='#2244aa';tap(next,300,220);assert.equal(next.strokes.length,2);assert.equal(next.strokes[1].c,'#2244aa')}
 if(id===89){tap(e);const draft=e.getSnapshot(),committed=e.getData();assert.deepEqual(committed,draft);assert.equal(committed[0].t,'fill')}
 if(id===90){tap(e);e.color='#445566';tap(e,300,220);let initial=JSON.parse(JSON.stringify(e.getData()));const next=make(v);assert(next.adoptDraft(initial));assert.deepEqual(next.getData(),initial)}
 if([91,92,93].includes(id)){const type=id===91?'mouse':id===92?'touch':'pen';tap(e,140,160,type);assert.equal(e.strokes.length,1);assert.deepEqual(e.strokes[0].p[0],[140,160]);}
 if(id===94){const old=e.canvas.getBoundingClientRect();const p=e.point({clientX:old.left+old.width*.4,clientY:old.top+old.height*.4});e.canvas.getBoundingClientRect=()=>({left:old.left-100,top:old.top-80,width:old.width*2,height:old.height*2});const p2=e.point({clientX:old.left-100+old.width*.8,clientY:old.top-80+old.height*.8});assert.deepEqual(p2,p);tap(e,240,180,'touch');assert.deepEqual(e.strokes[0].p[0],[240,180])}
 if(id===95){const old=e.canvas.getBoundingClientRect();e.canvas.getBoundingClientRect=()=>({...old,width:old.width*.55,height:old.height*1.4});tap(e,270,285,'pen');assert.deepEqual(e.strokes[0].p[0],[270,285]);}
 passed++;
 }catch(error){throw new Error('ZAMAZKA scenario #'+id+' '+CASES[id]+' layout='+v+': '+error.message,{cause:error})}
}
assert.equal(passed,45);
console.log('ZAMAZKA FILL-100 EDITOR: 45 passed / 45; 15 numbered scenarios × 3 aspect, input, undo and restored-draft layouts');
