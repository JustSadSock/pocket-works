import assert from 'node:assert/strict';
import {Editor} from '../editor.js';

// Exercise the actual editor compositing path: the first smudge creates one
// small damage mask, then subsequent stylus frames reuse its pixels.
const created=[];
function canvas(width=300,height=150){
 const surface={width,height,clientWidth:600};
 const context={canvas:surface,setTransform(){},drawImage(){},clearRect(){},
  fillRect(){},save(){},restore(){},beginPath(){},closePath(){},
  moveTo(){},lineTo(){},rect(){},clip(){},fill(){},
  getImageData(x,y,w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}},
  putImageData(){}};
 surface.getContext=()=>context;
 return surface;
}
const originalDocument=globalThis.document,originalWindow=globalThis.window;
const editor=Object.assign(Object.create(Editor.prototype),{
 closed:false,id:0,canvas:canvas(1500,1125),
 baseLayer:canvas(1500,1125),inkLayer:canvas(1500,1125),
 cachedRevision:0,paintRevision:0,displayRevision:0,
 displayLayer:canvas(1500,1125),
 zone:{x:105,y:90,w:80,h:55},
 working:{t:'smudge',s:15,p:[[116,113],[118,115]]}
});
try{
 globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');const result=canvas();
  created.push(result);return result;
 }};
 globalThis.window={devicePixelRatio:1,matchMedia(){return {matches:false}}};
 const image={naturalWidth:600,naturalHeight:450};
 editor.paintCachedFrame(image);
 const mask=editor.smudgeZoneMask;
 assert.ok(mask,'live smudge must generate its stencil');
 assert.ok(mask.width*mask.height<1500*1125*.02,
  'stencil must only cover small painting damage');
 assert.equal(mask.data.length,mask.width*mask.height*4);
 assert.equal(created.length,2,'first smudge creates preview surface and ROI stencil only');
 const firstPreview=editor.smudgePreviewLayer;
 for(let frame=0;frame<20;frame++){
  editor.working.p.push([120+frame*.5,116+frame*.25]);
  editor.paintCachedFrame(image);
  assert.equal(editor.smudgeZoneMask,mask,'stencil reused while pointer moves');
  assert.equal(editor.smudgePreviewLayer,firstPreview,'preview reused while pointer moves');
 }
 assert.equal(created.length,2,'twenty pointer frames must not allocate new canvases');
 editor.working={t:'smudge',s:15,p:[[118,120],[125,121]]};
 editor.paintCachedFrame(image);
 assert.equal(editor.smudgeZoneMask,mask,'a new gesture reuses the same damage stencil');
 assert.equal(created.length,2);
 console.log(JSON.stringify({scenario:'zamazka-mobile-smudge-mask',
 previewCanvases:1,maskCanvases:1,maskBytes:mask.data.length,
 previousFullMaskBytes:1500*1125*4,
 pointerFrames:20,result:'passed'}));
}finally{
 globalThis.document=originalDocument;
 globalThis.window=originalWindow;
}
