import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMuseumMotion,galleryWindow} from '../museum-motion.js';

// No browser packages needed: use real carousel logic and a deterministic
// layout/DOM harness to assert reassignments happen BEFORE the animation ends.
const count=19,arts=Array.from({length:count},(_,i)=>({title:'Original '+i,artist:'Painter '+i,date:'1688'}));
const order=Array.from({length:count},(_,i)=>i);
let timers=[],frameChanges=0;
const saved={};
function fakeElement(tag){
 const attrs={};
 const classes=new Set();
 const style=new Map();
 const img={dataset:{},complete:true,naturalWidth:800,naturalHeight:1000,
  addEventListener(name,fn){this['on'+name]=fn},
  set src(src){this._src=src;frameChanges++},
  get src(){return this._src}};
 const title={textContent:''},artist={textContent:''};
 return {tagName:tag.toUpperCase(),dataset:{},style:{
  setProperty(k,v){style.set(k,v)},removeProperty(k){style.delete(k)},
  getPropertyValue(k){return style.get(k)}
 },clientWidth:480,clientHeight:520,children:[],tabIndex:-1,
  classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)}},
  setAttribute(k,v){attrs[k]=v},getAttribute(k){return attrs[k]},
  addEventListener(k,fn){(this.events||=(new Map())).set(k,fn)},
  removeEventListener(k){this.events?.delete(k)},
  append(el){this.children.push(el)},
  querySelector(sel){if(sel==='img')return img;
   if(sel.includes('strong'))return title;
   if(sel.includes('span'))return artist;return null},
  set innerHTML(x){this._html=x},
  get innerHTML(){return this._html},
  get offsetWidth(){return 480}
 };
}
const old={document:globalThis.document,matchMedia:globalThis.matchMedia,
 window:globalThis.window,ResizeObserver:globalThis.ResizeObserver,
 requestAnimationFrame:globalThis.requestAnimationFrame,
 setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
const callbacks=new Map();
globalThis.document={createElement:fakeElement};
globalThis.matchMedia=()=>({matches:false});
globalThis.window={addEventListener(){},removeEventListener(){}};
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=fn=>{fn();return 1};
globalThis.setTimeout=fn=>{const id=timers.length+1;timers.push([id,fn]);return id};
globalThis.clearTimeout=id=>{timers=timers.filter(x=>x[0]!==id)};
const stage=fakeElement('section'),seen=[];
const flush=()=>{const pending=timers.slice();timers=[];for(const [,fn] of pending)fn()};
try{
 const motion=createMuseumMotion(stage,{order,url:id=>'painting/'+id,arts,
  onCenter(id,position){seen.push([id,position])}});
 assert.equal(stage.children.length,7,'preload 7 frames, not just the visible 3');
 assert.deepEqual(galleryWindow(order,0).map(x=>x.id),[17,18,0,1,2]);
 const frames=()=>new Map(stage.children.map(el=>[Number(el.dataset.slot),el]));
 const current=()=>{
  for(const slot of [-3,-2,-1,0,1,2,3]){
   const el=frames().get(slot);
   assert(el,'missing frame in slot '+slot);
   const idx=(motion.getCenter()+slot+count)%count;
   assert.equal(el.querySelector('img').dataset.artId,String(idx),
    'stale painting at slot '+slot);
   assert.equal(el.querySelector('.museum-slide-label strong').textContent,'Original '+idx);
  }
 };
 current();
 // One click changes the logical center and all art slots in SAME tick.
 // It must never update the incoming painting after the 285ms timeout.
 for(let cycle=0;cycle<44;cycle++){
  const oldImages=frameChanges,centerBefore=motion.getCenter();
  motion.shift(cycle%7===0?-1:1);
  current();
  assert.equal(frameChanges-oldImages,1,'shift reloads more than one offscreen painting');
  assert.equal(stage.dataset.galleryAnimating,'true');
  const focused=frames().get(0);
  assert.equal(focused.querySelector('img').dataset.artId,String(motion.getCenter()));
  assert.notEqual(motion.getCenter(),centerBefore);
  // A second click mid-flight never creates an unbounded timer queue.
  motion.shift(1);assert.equal(timers.length,1);
  flush();assert.equal(stage.dataset.galleryAnimating,undefined);
 }
 assert.equal(seen.length,45,'center updates immediately after each movement');
 motion.dispose();
 assert.equal(timers.length,0,'dispose removes pending transitions');
 console.log('ZAMAZKA gallery: 44 immediate changes, seven recycled frames, no late image swaps, bounded animation and dispose OK');
}finally{
 for(const [k,v] of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v;
}

// Audit the LAST loaded CSS cascade, not an obsolete earlier style file.
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../visual-critique-146.css',import.meta.url),'utf8');
assert(index.lastIndexOf('visual-critique-146.css')>index.indexOf('museum-afterhours-home.css'),
 'review CSS must win against the older museum stage clipping rules');
assert.match(css,/\.screen:has\(>\.museum-home\)[\s\S]*?overflow:visible!important/);
assert.match(css,/\.museum-slide\[data-slot="-3"\]/);
assert.match(css,/\.museum-slide\[data-slot="3"\]/);
assert.match(css,/\.museum-display\{[\s\S]*?pointer-events:auto!important/, 'gallery-wide mouse wheel and swipe must remain usable');
assert.match(css,/\.museum-stage\{[\s\S]*?pointer-events:auto!important/, 'empty gallery space must receive wheel navigation');
assert.match(css,/#screen>\.passage-entry \.passage-heading[\s\S]*?border-bottom:0!important/);
assert.match(css,/#screen>\.passage-preparing\{\s*background:#263e33!important;background-image:none!important/);
assert.match(css,/#screen>\.exhibition-lobby>\.lobby-attendance/);
console.log('ZAMAZKA scene CSS: gallery frame overflow, clean admission, lowered roster and green preparation backdrop OK');
