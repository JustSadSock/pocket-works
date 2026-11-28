import test from 'node:test';
import assert from 'node:assert/strict';
import {Camera} from './render.mjs';
import {viewportFramebufferRect} from './world-rendering-baked.mjs';

const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-8, label+': '+a+' !== '+b);
const area=b=>Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1]);

test('Camera.layout owns symmetric and asymmetric canvas viewport geometry',()=>{
 const cases=[
  {width:1280,height:800,insets:{left:160,right:160,top:80,bottom:80},dpr:1},
  {width:1280,height:800,insets:{left:104.859375,right:398,top:60,bottom:59},dpr:1},
  {width:1024,height:768,insets:{left:84,right:276,top:52,bottom:44},dpr:1.25},
  {width:390,height:844,insets:{left:0,right:0,top:88,bottom:224},dpr:2}
 ];
 for(const [index,c] of cases.entries()){
  const cam=new Camera(192,128);cam.x=86.5;cam.y=53.25;cam.zoom=2.1;cam.insets=c.insets;
  const v=cam.layout(c.width,c.height);
  assert.equal(v.coordinateSpace,'canvas-css');assert.equal(v.origin,'top-left');
  assert.equal(v.width,c.width-v.left-v.right);assert.equal(v.height,c.height-v.top-v.bottom);
  assert.equal(v.rightEdge,c.width-v.right);assert.equal(v.bottomEdge,c.height-v.bottom);
  close(cam.point(cam.x,cam.y)[0],v.centerX,'camera x center '+index);
  close(cam.point(cam.x,cam.y)[1],v.centerY,'camera y center '+index);
  const bounds=cam.visibleBounds(),corners=[[v.left,v.top],[v.rightEdge,v.top],[v.left,v.bottomEdge],[v.rightEdge,v.bottomEdge]].map(p=>cam.screen(...p));
  close(bounds[0],Math.min(...corners.map(p=>p[0])),'left world edge '+index);
  close(bounds[1],Math.min(...corners.map(p=>p[1])),'top world edge '+index);
  close(bounds[2],Math.max(...corners.map(p=>p[0])),'right world edge '+index);
  close(bounds[3],Math.max(...corners.map(p=>p[1])),'bottom world edge '+index);
  const cw=Math.round(c.width*c.dpr),ch=Math.round(c.height*c.dpr),fb=viewportFramebufferRect(cw,ch,{...v,pixelRatio:c.dpr}),left=Math.round(v.left*c.dpr),right=Math.round(v.rightEdge*c.dpr),top=Math.round(v.top*c.dpr),bottom=Math.round(v.bottomEdge*c.dpr);
  assert.deepEqual([fb.x,fb.y,fb.width,fb.height],[left,ch-bottom,right-left,bottom-top],'framebuffer viewport '+index);
  assert.ok(area(bounds)>0);
 }
});

test('visible geographic bounds contain all four projected viewport corners and both height extremes',()=>{
 const cam=new Camera(192,128);cam.x=86.5;cam.y=53.25;cam.zoom=2.4;cam.insets={left:112,right:344,top:64,bottom:88};const v=cam.layout(1440,900),tilt=.28,minZ=-.035,maxZ=18.5,datum=0,cs=Math.sqrt(1-tilt*tilt),bounds=cam.visibleBounds({tilt,minZ,maxZ,datum});
 for(const x of [v.left,v.rightEdge])for(const y of [v.top,v.bottomEdge])for(const z of [minZ,maxZ]){
  const wx=(x-cam.ox)/cam.s,wy=cam.y+((y-v.centerY)/cam.s+(z-datum)*tilt)/cs;
  assert.ok(wx>=bounds[0]-1e-8&&wx<=bounds[2]+1e-8,'viewport x edge escaped bounds');
  assert.ok(wy>=bounds[1]-1e-8&&wy<=bounds[3]+1e-8,'viewport y edge escaped bounds');
 }
 const full=cam.visibleBounds({tilt,minZ,maxZ,datum,rect:{left:0,top:0,right:1440,bottom:900}});
 assert.ok(area(bounds)<area(full),'preparation bounds must exclude UI-covered canvas area');
});

test('pan, zoom anchoring and viewport resize preserve the canonical camera center',()=>{
 const cam=new Camera(192,128);cam.x=86.5;cam.y=53.25;cam.zoom=2;cam.insets={left:100,right:300,top:50,bottom:70};let v=cam.layout(1280,800);
 cam.pan(160,-92);v=cam.layout(1280,800);close(cam.point(cam.x,cam.y)[0],v.centerX,'pan center x');close(cam.point(cam.x,cam.y)[1],v.centerY,'pan center y');
 const px=v.left+v.width*.27,py=v.top+v.height*.73,before=cam.screen(px,py);cam.zoomAt(1.35,px,py,1280,800);v=cam.layout(1280,800);const after=cam.screen(px,py);close(after[0],before[0],'zoom anchor x');close(after[1],before[1],'zoom anchor y');
 cam.insets={left:0,right:240,top:96,bottom:180};v=cam.layout(900,700);assert.equal(v.width,660);assert.equal(v.height,424);close(cam.point(cam.x,cam.y)[0],v.centerX,'resized center x');close(cam.point(cam.x,cam.y)[1],v.centerY,'resized center y');
});

test('full-canvas and tiny but non-empty viewports remain bounded',()=>{
 const cam=new Camera(100,80);let v=cam.layout(800,600);assert.equal(v.width,800);assert.equal(v.height,600);
 cam.insets={left:799,right:900,top:599,bottom:900};v=cam.layout(800,600);assert.equal(v.width,1);assert.equal(v.height,1);assert.ok(v.rightEdge<=800&&v.bottomEdge<=600);
 const fb=viewportFramebufferRect(800,600,{...v,pixelRatio:1});assert.deepEqual([fb.width,fb.height],[1,1]);
});
