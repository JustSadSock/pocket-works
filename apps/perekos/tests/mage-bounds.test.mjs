import test from 'node:test';
import assert from 'node:assert/strict';
import {MAGES} from '../mages.mjs';
import {drawMage} from '../mage-art.mjs';

// A tiny Canvas2D geometry auditor: follows real nested affine transforms,
// strokes, polygons, shadows and weapon tips without needing a browser.
// Pixel-perfect appearance acceptance remains in qa/eight-direction.spec.js.
function matrixMultiply(a,b){
 return [
  a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]
 ];
}
export function measureMageGeometry(options,appearance){
 let m=[1,0,0,1,0,0],saveStack=[],points=[],all=[],depth=0;
 const point=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Nonfinite art coordinate');
  const p=[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error('Nonfinite transform');
  all.push(p);
 };
 const box=(x,y,w,h)=>{point(x,y);point(x+w,y);point(x+w,y+h);point(x,y+h)};
 const ctx=new Proxy({},{
  get(t,k){
   if(k in t)return t[k];
   if(k==='save')return()=>{saveStack.push([...m]);depth++};
   if(k==='restore')return()=>{if(!saveStack.length)throw Error('Canvas restore underflow');m=saveStack.pop();depth--};
   if(k==='translate')return(x,y)=>{m=matrixMultiply(m,[1,0,0,1,x,y])};
   if(k==='scale')return(x,y)=>{m=matrixMultiply(m,[x,0,0,y,0,0])};
   if(k==='rotate')return(a)=>{const c=Math.cos(a),s=Math.sin(a);m=matrixMultiply(m,[c,s,-s,c,0,0])};
   if(k==='beginPath')return()=>{points=[]};
   if(k==='moveTo'||k==='lineTo')return(x,y)=>{points.push([x,y])};
   if(k==='closePath')return()=>{};
   if(k==='arc')return(x,y,r,start=0,end=Math.PI*2)=>{
    for(let i=0;i<=16;i++){const a=start+(end-start)*i/16;points.push([x+Math.cos(a)*r,y+Math.sin(a)*r])}
   };
   if(k==='ellipse')return(x,y,rx,ry,rot=0,start=0,end=Math.PI*2)=>{
    for(let i=0;i<=20;i++){
     const a=start+(end-start)*i/20,xx=Math.cos(a)*rx,yy=Math.sin(a)*ry;
     points.push([x+xx*Math.cos(rot)-yy*Math.sin(rot),y+xx*Math.sin(rot)+yy*Math.cos(rot)]);
    }
   };
   if(k==='fill'||k==='stroke')return()=>{for(const p of points)point(...p)};
   if(k==='fillRect'||k==='strokeRect')return box;
   if(k==='drawImage')return(...args)=>{if(args.length>=5)box(args[1],args[2],args[3],args[4])};
   if(k==='clearRect'||k==='setLineDash')return()=>{};
   return()=>{};
  },
  set(t,k,v){t[k]=v;return true}
 });
 drawMage(ctx,appearance,options);
 assert.equal(depth,0,'unbalanced Canvas transform stack');
 assert.ok(all.length>80,'renderer did not paint enough geometry');
 return {minX:Math.min(...all.map(p=>p[0])),maxX:Math.max(...all.map(p=>p[0])),
  minY:Math.min(...all.map(p=>p[1])),maxY:Math.max(...all.map(p=>p[1])),points:all.length};
}
const animal={
 source:'guest',colors:['#546e60','#caa982','#37473f'],
 mascot:{animal:'rabbit',hat:'crown',clothes:'mantle',face:'glasses'}
};
test('new character selector renders complete boots, hats and weapons in 80x82 canvas',()=>{
 for(const mage of MAGES){
  const bounds=measureMageGeometry({x:40,y:54,scale:.95,mageId:mage.id,
    face:Math.PI/4,time:0,pose:{still:true}},animal);
  assert.ok(bounds.minX>=-1&&bounds.maxX<=81&&bounds.minY>=-1&&bounds.maxY<=83,
   mage.id+': clipped selector '+JSON.stringify(bounds));
 }
});
test('hero portrait fits all six costume silhouettes in 128x156 canvas',()=>{
 for(const mage of MAGES){
  const bounds=measureMageGeometry({x:64,y:101,scale:1.78,mageId:mage.id,
   face:Math.PI/4,time:0,pose:{still:true}},animal);
  assert.ok(bounds.minX>=-1&&bounds.maxX<=129&&bounds.minY>=-1&&bounds.maxY<=157,
   mage.id+': clipped hero '+JSON.stringify(bounds));
 }
});
test('every combat angle draws finite geometry with balanced nested transforms',()=>{
 for(const mage of MAGES)for(let sector=0;sector<8;sector++){
  const bounds=measureMageGeometry({x:200,y:310,scale:1.32,mageId:mage.id,
   face:sector*Math.PI/4,time:.35,casting:.31,pose:{windup:.4,release:.4,guard:.5}},animal);
  assert.ok(bounds.minX>=140&&bounds.maxX<=260&&bounds.minY>=235&&bounds.maxY<=375,
    mage.id+' angle '+sector+': oversized art '+JSON.stringify(bounds));
 }
});
