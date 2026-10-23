import assert from 'node:assert/strict';
import {Editor} from '../editor.js';

// This checks actual Editor.paintCachedFrame behaviour with a minimal Canvas2D
// backing store, not a regexp against implementation text.
let allocated=0,composited=0;
const noop=()=>{};
function mockContext(isComposed=false){
 return {setTransform:noop,clearRect:noop,fillRect:noop,beginPath:noop,
  rect:noop,moveTo:noop,lineTo:noop,closePath:noop,clip:noop,save:noop,
  restore:noop,arc:noop,stroke:noop,fill:noop,scale:noop,
  drawImage(){if(isComposed)composited++}};
}
function mockCanvas(isComposed=false){
 const context=mockContext(isComposed);
 return {width:1500,height:1125,clientWidth:600,
  getContext(){return context}};
}
const originalDocument=globalThis.document;
const main=mockCanvas();
const editor=Object.assign(Object.create(Editor.prototype),{
 closed:false,canvas:main,zone:{x:30,y:30,w:300,h:260},
 baseLayer:mockCanvas(),inkLayer:mockCanvas(),inkCtx:mockContext(),
 cachedRevision:0,paintRevision:0,displayRevision:-1,strokes:[],
 pendingInkStrokes:[],working:null,hasRasterInk:false
});
try{
 globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');
  allocated++;
  return mockCanvas(true);
 }};
 const image={width:600,height:450,naturalWidth:600,naturalHeight:450};
 editor.paintCachedFrame(image);
 const initial=editor.displayLayer;
 assert.ok(initial,'first composed canvas created');
 assert.equal(allocated,1);
 assert.equal(composited,2,'base and ink drawn once');
 for(let rev=1;rev<=60;rev++){
  editor.paintRevision=rev;
  editor.paintCachedFrame(image);
  assert.equal(editor.displayLayer,initial,'same backing canvas reused after every brush revision');
 }
 assert.equal(allocated,1,'60 committed revisions do not allocate 60 large canvases');
 assert.equal(composited,122,'each revision composites base and ink exactly once');
 for(let i=0;i<120;i++)editor.paintCachedFrame(image);
 assert.equal(composited,122,'pointer frames reuse committed composite without repaint');
 editor.displayLayer.width=1;
 editor.paintCachedFrame(image);
 assert.equal(allocated,2,'resizing a buffer triggers necessary allocation');
 assert.notEqual(editor.displayLayer,initial);
 console.log(JSON.stringify({scenario:'zamazka-frame-reuse',committedRevisions:60,
  pointerFrames:120,canvasAllocations:allocated,result:'passed'}));
}finally{globalThis.document=originalDocument}
