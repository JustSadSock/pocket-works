import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawStroke,smudgeStroke,Editor} from '../editor.js';
import {normalizeArchiveEntry,ARCHIVE_EDITION,artworkAspect} from '../artworks.js';

const W=600,H=450,at=(x,y)=>(y*W+x)*4;
function raster(original){
 const pixels=new Uint8ClampedArray(original);
 const context={
  canvas:{width:W,height:H},
  getImageData(x,y,width,height){
   const data=new Uint8ClampedArray(width*height*4);
   for(let row=0;row<height;row++)
    data.set(pixels.subarray(at(x,y+row),at(x+width,y+row)),row*width*4);
   return {width,height,data};
  },
  putImageData(image,x,y){
   for(let row=0;row<image.height;row++)
    pixels.set(image.data.subarray(row*image.width*4,(row+1)*image.width*4),at(x,y+row));
  }
 };
 return {pixels,context};
}
// A white out-of-cutout pixel must NEVER bleed into the blue restoration,
// even when the brush points towards the cutout edge on a tall artwork.
const original=new Uint8ClampedArray(W*H*4),zone=new Uint8ClampedArray(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const i=at(x,y),inside=x<300;
 original.set(inside?[30,80,120,255]:[255,255,255,255],i);
 if(inside)zone[i+3]=255;
}
const swipe={t:'smudge',s:34,p:[[299,220],[295,220],[288,220]]};
for(const aspect of [.5,4/3,2.5]){
 const test=raster(original);
 smudgeStroke(test.context,swipe,0,false,zone,aspect);
 for(const x of [282,290,295,298]){
  assert.deepEqual(Array.from(test.pixels.slice(at(x,220),at(x,220)+3)),[30,80,120],
   'smudge never draws white cutout pigment inside, artwork aspect '+aspect+' x='+x);
 }
 assert.deepEqual(Array.from(test.pixels.slice(at(302,220),at(302,220)+3)),[255,255,255],
  'smudge never writes to the area outside the damage contour');
}
// A source inside the mask is still mixed normally. No inert brush.
const mix=new Uint8ClampedArray(original);
for(let y=180;y<=260;y++)for(let x=245;x<=255;x++)mix.set([220,20,50,255],at(x,y));
const combined=raster(mix);
smudgeStroke(combined.context,{t:'smudge',s:30,p:[[253,220],[260,220],[266,220]]},0,false,zone,.5);
assert.notDeepEqual(Array.from(combined.pixels.slice(at(262,220),at(262,220)+3)),[30,80,120],
 'valid source paint is actively mixed even for a portrait canvas');
// Recorded vector coordinates are invariant even when the displayed portrait
// must use a different x-scale to make the nib round.
for(const aspect of [.45,.6,4/3,2.8]){
 const calls=[];
 const ctx={
  save(){},restore(){},scale(x,y){calls.push(['scale',x,y])},
  beginPath(){},moveTo(x,y){calls.push(['move',x,y])},lineTo(x,y){calls.push(['line',x,y])},
  stroke(){},arc(x,y,r){calls.push(['arc',x,y,r])},fill(){},
  set globalAlpha(v){},set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set lineCap(v){},set lineJoin(v){}
 };
 drawStroke(ctx,{t:'brush',s:10,c:'#123456',p:[[100,125],[275,290]]},aspect);
 const correction=(W/H)/aspect;
 assert.ok(Math.abs(calls[0][1]-correction)<1e-9);
 assert.ok(Math.abs(calls.find(c=>c[0]==='move')[1]*correction-100)<1e-9,
  'portrait projection must not displace historical vector coordinates');
 assert.ok(Math.abs(calls.find(c=>c[0]==='line')[1]*correction-275)<1e-9);
 assert.ok(Math.abs(correction*aspect/(W/H)-1)<1e-9,
  'on-screen brush width and height must match across aspect ratios');
}
// The actual stage, rather than a stale CSS 4:3 max-width, bounds a tall or wide picture.
const style={props:{},setProperty(k,v){this.props[k]=v},get width(){return this.props.width||''},get height(){return this.props.height||''}};
const stage={clientWidth:318,clientHeight:620},editor=Object.assign(Object.create(Editor.prototype),{
 root:{querySelector:()=>stage},viewport:{style}
});
assert.equal(editor.fitViewport(.5),true);
assert.ok(Number.parseFloat(style.width)<=stage.clientWidth);
assert.ok(Number.parseFloat(style.height)<=stage.clientHeight);
assert.ok(Math.abs(Number.parseFloat(style.width)/Number.parseFloat(style.height)-.5)<.001);
stage.clientWidth=1000;stage.clientHeight=315;
assert.equal(editor.fitViewport(3),true);
assert.ok(Number.parseFloat(style.width)<=stage.clientWidth);
assert.ok(Number.parseFloat(style.height)<=stage.clientHeight);
assert.ok(Math.abs(Number.parseFloat(style.width)/Number.parseFloat(style.height)-3)<.001);
// Migration must keep the original line geometry, pigment and seed byte-for-byte.
// Past saves don't include aspect metadata; never reinterpret their positions.
const old={art:8,edition:2,variation:123456,time:1600000000,
 strokes:[{c:'#125099',s:9,t:'brush',p:[[12,34],[100,210],[490,70]]}]};
const before=JSON.stringify(old.strokes);
const migrated=normalizeArchiveEntry(old);
assert.equal(migrated.edition,ARCHIVE_EDITION);
assert.equal(migrated.variation,old.variation);
assert.equal(JSON.stringify(migrated.strokes),before,'old archive vector coordinates remain unchanged');
assert.equal(artworkAspect({naturalWidth:500,naturalHeight:1000}),.5);
const restoredFrames=[];
const geometryContext={drawImage(...args){restoredFrames.push(args)}};
const {drawArtwork,setArtworkFrame}=await import('../artworks.js');
const portrait={naturalWidth:800,naturalHeight:1600};
drawArtwork(geometryContext,portrait,1,true);
assert.deepEqual(restoredFrames[0].slice(5),[187.5,0,225,450],
 'legacy portrait uses centered 4:3 letterbox without rewriting old coordinates');
const fake={style:{aspectRatio:'',setProperty(){}},closest(){return {style:{setProperty(){}}}}};
assert.equal(setArtworkFrame(fake,portrait,true),4/3,'legacy archive can recover the historic 4:3 frame');
assert.equal(setArtworkFrame(fake,portrait,false),.5,'current archive remains natural aspect by default');
const viewer=readFileSync(new URL('../round-review.js',import.meta.url),'utf8');
assert.match(viewer,/data-archive-geometry/,'archive includes manual compatibility format switch');
assert.match(viewer,/paintArchivePair\(\)\.then\(draw\)/,
 'archive aspect toggle re-renders the saved strokes and original together');

const editorSource=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
assert.match(editorSource,/renderStrokes\(paint,strokes\|\|\[\],z,legacyFrame\?W\/H:artworkAspect\(image\)\)/,
 'archive/reveal replays all strokes with aspect correction');
assert.match(editorSource,/renderStrokes\(this\.inkCtx,this\.strokes,this\.zone,artworkAspect\(img\)\)/,
 'live editor and archived render use the same aspect correction');

// Exercise the real archive viewer event flow, not only presence of the button.
const rendered=[];
const listeners=new Map();
const element=()=>({addEventListener(){},removeEventListener(){},style:{setProperty(){}},
 getBoundingClientRect(){return {left:0,top:0,width:360,height:220}},clientWidth:360,clientHeight:220,focus(){}});
const pane=element(),image=element(),range=Object.assign(element(),{value:'50'}),meter=element();
const canvases={ '#roundViewWindow':pane,'#roundViewImage':image,'#roundCompare':range,
 '#roundZoom':meter,'#roundRestoration':element(),'#roundOriginal':element(),
 '[data-round-close]':element() };
const dialog={classList:{add(){},remove(){}},innerHTML:'',
 querySelector(selector){return canvases[selector]||null},
 addEventListener(name,handler){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(handler)},
 removeEventListener(){}};
const windowStub={addEventListener(){},removeEventListener(){}};
const documentStub={activeElement:{tagName:'BUTTON'}};
const viewerApi=Function('window','document',viewer.replace(/^import .*;\s*$/gm,'').replaceAll('export function','function')+
 ';return {openRoundViewer,closeRoundViewer};')(windowStub,documentStub);
const archival={art:1,variation:27,strokes:[{t:'brush',c:'#124578',s:5,p:[[12,32],[100,340]]}],
 name:'Историческая работа',votes:{}};
viewerApi.openRoundViewer({index:0,view:{phase:'archive',gallery:[archival],selected:[]},
 dialog,renderArtwork:(...args)=>{rendered.push(args);return Promise.resolve();},
 arts:{1:{title:'Портрет',artist:'Автор',date:'1900'}},esc:s=>s,closeDialog(){}});
assert.ok(dialog.innerHTML.includes('data-archive-geometry'),'real archive viewer exposes recovery control');
assert.equal(rendered.length,2);
assert.equal(rendered[0][6],false,'natural projection initially selected');
const geometry={textContent:'',setAttribute(){}};
const click={target:{closest(selector){return selector==='[data-archive-geometry]'?geometry:null}}};
listeners.get('click')[0](click);
assert.equal(rendered.length,4,'legacy switch repaints BOTH the restoration and original');
assert.equal(rendered[2][6],true,'legacy 4:3 aspect is passed into the renderer');
assert.equal(rendered[2][3],archival.strokes,'archive vectors are reused rather than modified');
listeners.get('click')[0](click);
assert.equal(rendered[4][6],false,'return to the natural aspect remains reversible');
viewerApi.closeRoundViewer();

console.log('ZAMAZKA: portrait/panorama aspect, stable archive vectors and no smudge edge contamination OK');
