import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./app.js', import.meta.url),'utf8')
 .replace(/^import .*;\r?\n/,'').replace('installMobileRuntime();','');

function createHarness(saved={}) {
 const elements=new Map(), raf=[], events={};
 const context={
  beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},
  fillRect(){},arc(){},ellipse(){},save(){},restore(){},translate(){},rotate(){},
  drawImage(){},fillText(){},putImageData(){},
  createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};}
 };
 const get=id=>{
  if(!elements.has(id)){
   const el={
    id,hidden:false,textContent:'',firstChild:{textContent:''},style:{},events:{},
    classList:{add(){},remove(){}},setAttribute(){},
    addEventListener(name,listener){this.events[name]=listener;},
    getBoundingClientRect(){return {left:0,top:0,width:390,height:844};},
    setPointerCapture(){},
    getContext(){return context;}
   };
   elements.set(id,el);
  }
  return elements.get(id);
 };
 const document={
  getElementById:get,
  createElement(){return {width:0,height:0,getContext:()=>context};},
  addEventListener(name,listener){events[name]=listener;},hidden:false
 };
 const window={addEventListener(name,listener){events[name]=listener;}};
 const localStorage={
  getItem:key=>saved[key]??null,
  setItem:(key,value)=>{saved[key]=value;},
  removeItem:key=>{delete saved[key];}
 };
 const create=new Function('document','window','matchMedia','localStorage','requestAnimationFrame','performance','setTimeout','clearTimeout','installMobileRuntime',
   source+'\nreturn {getState:()=>state,getMode:()=>mode,getTargets:()=>targets,applyStep,showModal};');
 const api=create(document,window,()=>({matches:false}),localStorage,fn=>raf.push(fn),
  {now:()=>0},()=>0,()=>{},()=>{});
 const click=id=>get(id).events.click();
 return {api,get,click,raf,saved};
}

test('start, step, persistence, pause, resume, death, restart, victory',()=>{
 const h=createHarness();
 assert.equal(h.api.getMode(),'intro');
 h.click('primary');
 assert.equal(h.api.getMode(),'playing');
 assert.equal(h.get('hud').hidden,false);
 h.raf.shift()(16);
 const target=h.api.getTargets()[1];
 assert.ok(target.active);
 const height=Math.round(360*844/390);
 const cx=target.x*390/360, cy=(target.y-15)*844/height;
 h.get('scene').events.pointerdown({pointerId:3,clientX:cx,clientY:cy,preventDefault(){}});
 h.get('scene').events.pointerup({pointerId:3,clientX:cx,clientY:cy});
 h.raf.shift()(800);
 assert.equal(h.api.getState().step,1);
 assert.equal(h.api.getState().heat,11);
 assert.ok(h.saved['pocket-works:palomnik:expedition:v1']);
 h.click('pause');
 assert.equal(h.api.getMode(),'paused');
 h.click('secondary');
 assert.equal(h.api.getMode(),'confirm');
 h.click('primary');
 assert.equal(h.api.getMode(),'paused');
 h.click('primary');
 assert.equal(h.api.getMode(),'playing');
 h.api.applyStep({row:1,kind:'void'});
 h.api.applyStep({row:1,kind:'void'});
 h.api.applyStep({row:1,kind:'void'});
 assert.equal(h.api.getMode(),'dead');
 assert.equal(h.get('modal').hidden,false);
 h.click('primary');
 assert.equal(h.api.getState().step,0);
 assert.equal(h.api.getMode(),'playing');
 for(let i=0;i<21;i++)h.api.applyStep({row:1,kind:'ember'});
 assert.equal(h.api.getMode(),'win');
 assert.equal(h.api.getState().step,21);
 assert.equal(h.saved['pocket-works:palomnik:expedition:v1'],undefined);
 h.click('primary');
 assert.equal(h.api.getState().step,0);
});

test('reload offers saved expedition',()=>{
 const previous={step:5,row:0,heat:6,hull:2,seed:8871,finished:false};
 const saved={'pocket-works:palomnik:expedition:v1':JSON.stringify(previous)};
 const h=createHarness(saved);
 assert.equal(h.api.getMode(),'intro');
 assert.match(h.get('primary').firstChild.textContent,/ПРОДОЛЖИТЬ/);
 h.click('primary');
 assert.equal(h.api.getState().step,5);
 assert.equal(h.api.getState().row,0);
});