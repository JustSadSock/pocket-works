import assert from 'node:assert/strict';
import {Editor} from '../editor.js';

// Run the real editor compositor against deterministic Canvas2D surfaces.
// Repeated pointer events that add no vectors must not repaint a 1500px canvas.
let allocations=0,mainPaints=0,mainFrames=0,inkPaints=0;
function makeCanvas(main=false){
 const canvas={width:1500,height:1125,clientWidth:600};
 const ctx={canvas,globalAlpha:1,imageSmoothingEnabled:true,
  setTransform(){},save(){},restore(){},scale(){},clearRect(){if(main)mainFrames++},
  fillRect(){},beginPath(){},moveTo(){},lineTo(){},arc(){},stroke(){},fill(){},
  rect(){},closePath(){},clip(){},putImageData(){},
  drawImage(){if(main)mainPaints++;else inkPaints++},
  getImageData(x,y,width,height){
   return {width,height,data:new Uint8ClampedArray(width*height*4)};
  }};
 canvas.getContext=()=>ctx;
 return canvas;
}
const savedWindow=globalThis.window,savedDocument=globalThis.document;
const windowMock={devicePixelRatio:1,matchMedia:()=>({matches:false})};
const main=makeCanvas(true);
const editor=Object.assign(Object.create(Editor.prototype),{
 closed:false,id:1,canvas:main,zone:{x:90,y:80,w:100,h:85},
 baseLayer:makeCanvas(),inkLayer:makeCanvas(),inkCtx:makeCanvas().getContext('2d'),
 cachedRevision:0,paintRevision:0,displayRevision:-1,
 pendingInkStrokes:[],strokes:[],hasRasterInk:false,
 working:null
});
try{
 globalThis.window=windowMock;
 globalThis.document={createElement(type){
  assert.equal(type,'canvas');allocations++;return makeCanvas();
 }};
 const image={naturalWidth:600,naturalHeight:450};
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,1,'first frame must be visible');
 const initialAllocations=allocations;
 for(let i=0;i<100;i++)editor.paintCachedFrame(image);
 assert.equal(mainFrames,1,'100 identical pointer updates cannot redraw');
 assert.equal(allocations,initialAllocations,'100 identical frames cannot allocate canvases');

 editor.working={c:'#234567',s:12,t:'brush',p:[[120,120]]};
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,2,'stroke start repaints');
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,2,'unchanged stroke start does not repaint');

 editor.working.p.push([125,123]);
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,3,'a new point repaints');
 for(let i=0;i<100;i++)editor.paintCachedFrame(image);
 assert.equal(mainFrames,3,'duplicate move events cannot redraw active stroke');

 editor.working=null;editor.paintRevision++;
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,4,'commit redraws even after the live stroke ends');
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,4,'already committed frame remains unchanged');

 windowMock.devicePixelRatio=2;
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,5,'new backing resolution repaints every layer');
 assert.equal(editor.canvas.width,1800,'high-DPI backing width updated');

 editor.working={c:'#456789',s:18,t:'smudge',p:[[120,120]]};
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,6,'smudge start is visible');
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,6,'idle smudge does not redraw');
 editor.working.p.push([123,124]);
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,7,'smudge movement repaints');
 editor.working.p.push([127,128]);
 editor.paintCachedFrame(image);
 assert.equal(mainFrames,8,'next smudge point repaints');

 console.log(JSON.stringify({scenario:'zamazka-idle-frame-elision',
 avoidedDuplicateFrames:202,actualFrameComposites:mainFrames,finalBacking:editor.canvas.width,
 result:'passed'}));
}finally{
 globalThis.window=savedWindow;
 globalThis.document=savedDocument;
}
