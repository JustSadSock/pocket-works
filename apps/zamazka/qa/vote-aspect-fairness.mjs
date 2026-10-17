import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fitGalleryArtwork} from '../gallery-proportions.js';
import {mountExhibitFrames} from '../exhibition-ui.js';
import {setArtworkFrame} from '../artworks.js';
import {floodFillRaster} from '../fill-core.js';

const ratios=[.52,.74,1,1.43,2.12];
let experiments=0;
for(const [w,h] of [[176,320],[240,430],[335,475],[150,260],[375,540]]){
 const fitted=fitGalleryArtwork(ratios.map(r=>({ratio:r,maxWidth:w,maxHeight:h})));
 assert.equal(fitted.length,5);
 for(let j=0;j<ratios.length;j++){
  const f=fitted[j];
  assert(Math.abs(f.width/f.height-ratios[j])<1e-10,'art aspect changed: '+ratios[j]);
  assert(f.width<=w+.001&&f.height<=h+.001,'art exceeded cell');
  assert(f.area>0);
  experiments++;
 }
}

// Run the real voting gallery fitter against IMG and canvas interchangeably.
// The canvas's bitmap is ALWAYS 600x450, regardless of the real source ratio.
const makeStyle=()=>{
 const vars=new Map();
 return {width:'',height:'',aspectRatio:'',setProperty(n,v){vars.set(n,v)},getPropertyValue(n){return vars.get(n)||''}};
};
function stageSet(editIndex,viewport=[280,460]){
 const gallery={clientWidth:viewport[0]*5,clientHeight:viewport[1]};
 const nodes=ratios.map((r,i)=>{
  const modified=i===editIndex;
  const art={tagName:modified?'CANVAS':'IMG',
   naturalWidth:modified?undefined:r*1000,naturalHeight:modified?undefined:1000,
   width:modified?600:undefined,height:modified?450:undefined,
   style:makeStyle(),addEventListener(){},removeEventListener(){}};
  const rim={style:makeStyle(),querySelector(s){return art}};
  art.closest=()=>rim;
  if(modified)setArtworkFrame(art,{naturalWidth:r*1000,naturalHeight:1000});
  const stage={isConnected:true,clientWidth:viewport[0],clientHeight:viewport[1]-16,
   parentElement:{clientHeight:viewport[1]},
   closest(){return gallery},
   querySelector(s){
    if(s==='.zam-exhibit-rim')return rim;
    if(s==='.zam-exhibit-plaque')return {offsetHeight:40};
    if(s==='.stake-actions,.stake-locked')return {offsetHeight:42};
    return null;
   }};
  return {rim,art,stage};
 });
 return {gallery,nodes};
}
const old={
 requestAnimationFrame:globalThis.requestAnimationFrame,
 cancelAnimationFrame:globalThis.cancelAnimationFrame,
 ResizeObserver:globalThis.ResizeObserver,
 MutationObserver:globalThis.MutationObserver
};
let rafId=0;const rafs=new Map();
globalThis.requestAnimationFrame=fn=>{const id=++rafId;rafs.set(id,fn);return id};
globalThis.cancelAnimationFrame=id=>rafs.delete(id);
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.MutationObserver=class{observe(){}disconnect(){}};
const flush=()=>{const work=[...rafs.values()];rafs.clear();for(const fn of work)fn()};
const fit=scene=>{
 const root={querySelectorAll(){return scene.nodes.map(n=>n.stage)}};
 const fitter=mountExhibitFrames(root);
 flush();
 const result=scene.nodes.map(n=>({
  width:parseFloat(n.rim.style.width),
  height:parseFloat(n.rim.style.height),
  chrome:parseFloat(n.rim.style.getPropertyValue('--frame-width')),
  artWidth:parseFloat(n.art.style.width),
  artHeight:parseFloat(n.art.style.height),
  ratio:Number(n.rim.style.getPropertyValue('--art-aspect'))
 }));
 fitter.dispose();return result;
};
try{
 for(const viewport of [[220,440],[290,520],[360,630]]){
  const allOriginal=fit(stageSet(-1,viewport));
  for(let modified=0;modified<5;modified++){
   const candidate=fit(stageSet(modified,viewport));
   for(let i=0;i<5;i++){
    for(const key of ['width','height','artWidth','artHeight','ratio']){
     assert(Math.abs(candidate[i][key]-allOriginal[i][key])<1e-6,
      'FORGERY LEAK: changing slot '+modified+' from IMG to 600x450 CANVAS changes '+key+' in slot '+i);
    }
    assert(Math.abs(candidate[i].artWidth/candidate[i].artHeight-ratios[i])<1e-10,
     'voting canvas or original silently stretched');
   }
   experiments++;
  }
 }
}finally{
 for(const [name,value] of Object.entries(old))if(value===undefined)delete globalThis[name];else globalThis[name]=value;
}

// The late CSS cascade must override the 4:3 intrinsic canvas and old
// auto-height declarations for both normal and restored works.
const css=readFileSync(new URL('../visual-critique-146.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../exhibition-ui.js',import.meta.url),'utf8');
assert(css.includes('#screen>.expert-phase .stake-frame.zam-exhibit-rim>img,') &&
 css.includes('#screen>.expert-phase .stake-frame.zam-exhibit-rim>canvas{'));
assert.match(css,/height:100%!important;[\s\S]*?object-fit:fill!important/);
assert(app.includes('fitGalleryArtwork(cells)'),'preview shares a sizing rule with the vote');
assert(ui.includes('fitGalleryArtwork(cells)'),'all voting cards are sized together');
assert(app.includes("const canvas=screen.querySelector('#examinedCanvas')") &&
 app.includes('canvas.classList.add(\'is-ready\')'),
 'edited candidate becomes visible only after genuine restoration rendering');
assert(app.includes('candidate-underlay') && css.includes('canvas.candidate-art.is-ready'),
 'show identical original until edited canvas has decoded successfully');

// A new colour must replace both a previously filled canvas and prepainted
// pigment without turning coloured pixels into new walls.
const W=210,H=150,n=W*H;
const walls=new Uint8ClampedArray(n*4),zone=new Uint8ClampedArray(n*4),output=new Uint8ClampedArray(n*4);
for(let i=0;i<n;i++){zone[i*4+3]=255;output.set([140,24,65,255],i*4)}
for(let y=0;y<H;y++)walls[(y*W+W/2)*4+3]=255;
for(let i=0;i<32;i++){
 const left=i%2===0,colour=[(i*31)%256,(i*59)%256,(i*97)%256],point=[left?20:170,60];
 const other=[left?170:20,60],keep=Array.from(output.subarray((other[1]*W+other[0])*4,(other[1]*W+other[0])*4+3));
 const changed=new Uint8Array(n);
 const filled=floodFillRaster({width:W,height:H,walls,zone,output,point,color:colour,changed});
 assert(filled>15000,'opaque previously-painted region should still fill');
 for(const y of [12,75,140])for(const x of (left?[3,30,83]:[114,169,204]))
  assert.deepEqual(Array.from(output.subarray((y*W+x)*4,(y*W+x)*4+3)),colour);
 assert.deepEqual(Array.from(output.subarray((other[1]*W+other[0])*4,(other[1]*W+other[0])*4+3)),keep);
 experiments++;
}
console.log('ZAMAZKA aspect/fill fairness: '+experiments+' checks; five IMG/CANVAS substitutions × 3 display sizes; 32 precoloured bucket cycles OK');
