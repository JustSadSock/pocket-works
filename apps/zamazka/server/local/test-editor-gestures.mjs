// Regression for continuous painting and desktop mouse interaction.
// Exercise the actual Editor pointer handlers without requiring a browser UI.
import { strict as assert } from 'node:assert';
import { Editor, simplifyPoints } from '../../editor.js';

const storage=new Map();
globalThis.localStorage={
 getItem:key=>storage.get(key)||null,
 setItem:(key,value)=>storage.set(key,String(value)),
 removeItem:key=>storage.delete(key)
};
const makeTarget=()=>{
 const events=new Map();
 return {
  events,
  style:{},classList:{current:new Set(),add(value){this.current.add(value)},remove(value){this.current.delete(value)},toggle(value,on){if(on)this.add(value);else this.remove(value)}},
  addEventListener(type,listener){events.set(type,listener)},
  removeEventListener(type){events.delete(type)},
  setPointerCapture(id){this.lastCapture=id},
  getBoundingClientRect(){return {left:0,top:0,width:600,height:450}}
 };
};
globalThis.window=makeTarget();
globalThis.document={querySelector:()=>null};
const canvas=makeTarget(),viewport=makeTarget(),root=makeTarget();
viewport.clientWidth=600;viewport.clientHeight=450;
root.querySelector=(selector)=>selector==='#paintCanvas'?canvas:selector==='.viewport'?viewport:null;
root.querySelectorAll=()=>[];
const editor=Object.create(Editor.prototype);
Object.assign(editor,{
 root,canvas,viewport,zone:{x:0,y:0,w:600,h:450},
 tool:'brush',color:'#123456',size:12,strokes:[],redoStack:[],working:null,
 pointers:new Map(),scale:1.9,tx:0,ty:0,closed:false,draftKey:'test:draft',
 onChange:()=>{},render:()=>{}
});
editor.attach();
function event(x,y,pointerId=1,button=0,target=canvas,pointerType='mouse'){
 return {clientX:x,clientY:y,pointerId,button,target,pointerType,preventDefault(){}};
}
editor.down(event(45,140));
for(let i=1;i<540;i++)editor.move(event(45+i*.9,140+30*Math.sin(i*.08)));
assert(editor.working,'long gesture unexpectedly ended before pointerup');
assert(editor.working.p.length<=45,'long gesture exceeded server stroke budget');
assert(Math.abs(editor.working.p.at(-1)[0]-(45+539*.9))<1,'last point stopped following cursor');
assert(editor.working.p.length>2,'line collapsed to a single point');
editor.up(event(45+539*.9,140));
assert.equal(editor.strokes.length,1);
assert.equal(editor.getData().length,1);
assert.equal(editor.getData()[0].p.at(-1)[0],editor.strokes[0].p.at(-1)[0]);

const before=editor.strokes.length;
const panStart={tx:editor.tx,ty:editor.ty};
editor.down(event(180,180,2,1));
assert.equal(editor.working,null,'middle mouse accidentally began painting');
assert(viewport.classList.current.has('is-panning'),'middle mouse should enable pan cursor');
editor.move(event(240,215,2,1));
assert.equal(editor.tx,panStart.tx+60,'middle drag horizontal translation');
assert.equal(editor.ty,panStart.ty+35,'middle drag vertical translation');
editor.up(event(240,215,2,1));
assert.equal(editor.strokes.length,before,'middle mouse must not create a stroke');
assert(!viewport.classList.current.has('is-panning'),'pan cursor must reset');

editor.frameDown(event(120,160,3,1,viewport));
assert.equal(editor.viewportCapturedPointer,3);
const previous=editor.tx;
editor.frameMove(event(180,160,3,1,viewport));
assert.equal(editor.tx,previous+60,'middle drag on bare frame must pan');
editor.frameUp(event(180,160,3,1,viewport));
assert.equal(editor.viewportCapturedPointer,null);

const focusX=325,focusY=230;
const worldX=(focusX-editor.tx)/editor.scale,worldY=(focusY-editor.ty)/editor.scale;
editor.wheel({...event(focusX,focusY),deltaY:-125});
assert(Math.abs((focusX-editor.tx)/editor.scale-worldX)<1e-7,'wheel zoom horizontal focus drift');
assert(Math.abs((focusY-editor.ty)/editor.scale-worldY)<1e-7,'wheel zoom vertical focus drift');

for(let j=0;j<61;j++){
 editor.down(event(80,210,10+j));
 for(let i=1;i<=85;i++)editor.move(event(80+i*2.4,210+17*Math.sin(i*.16+j),10+j));
 editor.up(event(284,210,10+j));
}
assert(editor.strokes.length<=72);
assert(editor.strokes.every(s=>s.p.length<=45));
assert(editor.strokes.reduce((sum,s)=>sum+s.p.length,0)<=1600,'total network limit exceeded');
assert.deepEqual(simplifyPoints([[0,0],[1,2],[2,0],[3,2],[4,0]],3)[0],[0,0]);
assert.deepEqual(simplifyPoints([[0,0],[1,2],[2,0],[3,2],[4,0]],3).at(-1),[4,0]);
editor.dispose();
assert(!canvas.events.has('pointerdown'),'editor leaked pointer handlers');
console.log('PASS: 540-point uninterrupted stroke, middle-button pan, frame drag, cursor-centric wheel zoom, 62 strokes within PocketNet budgets');
