#!/usr/bin/env node
// Real Chromium Canvas2D raster geometry: 48 combinations of nested contours,
// masks, overlapping regions, thin walls, and repeated fills.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

const dir=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-topology');
mkdirSync(dir,{recursive:true});
const source=readFileSync(new URL('../fill-core.js',import.meta.url),'utf8')
 .replaceAll('export function ','function ');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1260,height:1020},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<!doctype html><meta charset="utf-8"><style>'+
  'body{margin:0;background:#2f2d2b;color:#f4e4c9;font:12px system-ui;padding:15px}'+
  'header{font:23px Georgia,serif;margin:0 0 12px}'+
  '#grid{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}'+
  'article{background:#6a5947;padding:6px;border:1px solid #b69970}'+
  'canvas{width:100%;aspect-ratio:1;display:block;background:#e8ddc6}'+
  '.caption{font:11px/1.35 system-ui;padding:5px 0 0;white-space:nowrap}'+
  '</style><header>ЗАМАЗКА · Матрица реальных заливок</header><div id="grid"></div>');
 await page.addScriptTag({content:source});
 const report=await page.evaluate(async()=>{
  const configs=[],W=180,H=180,total=W*H,cx=90,cy=90;
  const shapeNames=['круг','эллипс','квадрат','ромб','восьмиугольник','звезда','волна','перекрытие'];
  const maskNames=['цельная','эллиптическая','ромб','рваная','объединённая','узкая'];
  function makeCanvas(){const c=document.createElement('canvas');c.width=W;c.height=H;return c}
  function path(ctx,shape,r){
   ctx.beginPath();
   if(shape===0){ctx.arc(cx,cy,r,0,Math.PI*2);return}
   if(shape===1){ctx.ellipse(cx,cy,r*1.12,r*.83,0,0,Math.PI*2);return}
   if(shape===2){ctx.rect(cx-r,cy-r,r*2,r*2);return}
   const points=shape===3?4:shape===4?8:shape===5?10:shape===6?44:28;
   for(let i=0;i<points;i++){
    const a=Math.PI*2*i/points-Math.PI/2;
    let rad=r;
    if(shape===5)rad=r*(i%2?.76:1);
    if(shape===6)rad=r*(.93+.07*Math.sin(i*.93));
    if(shape===7)rad=r*(.93+.08*Math.cos(3*a));
    const x=cx+Math.cos(a)*rad,y=cy+Math.sin(a)*rad;
    i?ctx.lineTo(x,y):ctx.moveTo(x,y);
   }
   ctx.closePath();
  }
  function mask(ctx,mode){
   ctx.fillStyle='white';
   if(mode===0){ctx.fillRect(0,0,W,H);return}
   ctx.beginPath();
   if(mode===1){ctx.ellipse(cx,cy,81,74,0,0,Math.PI*2)}
   if(mode===2){
    ctx.moveTo(cx,4);ctx.lineTo(176,cy);ctx.lineTo(cx,176);ctx.lineTo(4,cy);ctx.closePath();
   }
   if(mode===3){
    ctx.moveTo(6,35);ctx.lineTo(44,9);ctx.lineTo(113,17);ctx.lineTo(169,39);
    ctx.lineTo(174,90);ctx.lineTo(150,158);ctx.lineTo(75,174);ctx.lineTo(8,129);ctx.closePath();
   }
   if(mode===4){
    ctx.ellipse(69,90,70,78,0,0,Math.PI*2);
    ctx.ellipse(111,90,70,78,0,0,Math.PI*2);
   }
   if(mode===5){
    ctx.moveTo(4,49);ctx.lineTo(57,16);ctx.lineTo(155,28);
    ctx.lineTo(176,122);ctx.lineTo(127,160);ctx.lineTo(31,147);ctx.closePath();
   }
   ctx.fill();
  }
  function oracle(walls,zone,start){
   const seen=new Uint8Array(total),q=new Int32Array(total);
   const pass=i=>zone[i*4+3]>=120&&walls[i*4+3]<96;
   if(!pass(start))return seen;
   let head=0,tail=1;q[0]=start;seen[start]=1;
   while(head<tail){
    const i=q[head++],x=i%W,y=(i/W)|0;
    if(x&&pass(i-1)&&!seen[i-1]){seen[i-1]=1;q[tail++]=i-1}
    if(x<W-1&&pass(i+1)&&!seen[i+1]){seen[i+1]=1;q[tail++]=i+1}
    if(y&&pass(i-W)&&!seen[i-W]){seen[i-W]=1;q[tail++]=i-W}
    if(y<H-1&&pass(i+W)&&!seen[i+W]){seen[i+W]=1;q[tail++]=i+W}
   }
   return seen;
  }
  let verified=0,partial=0,rendered=0,skipped=0;
  for(let maskId=0;maskId<6;maskId++)for(let shapeId=0;shapeId<8;shapeId++){
   const c=makeCanvas(),ctx=c.getContext('2d',{willReadFrequently:true});
   const wc=makeCanvas(),wctx=wc.getContext('2d',{willReadFrequently:true});
   const ac=makeCanvas(),actx=ac.getContext('2d',{willReadFrequently:true});
   const radius=48+(shapeId%3)*5,spacing=8+(maskId%3)*3;
   mask(actx,maskId);
   wctx.strokeStyle='#45342d';wctx.lineWidth=shapeId%3===0?2.2:3.4;
   wctx.lineJoin='round';wctx.lineCap='round';
   path(wctx,shapeId,radius);wctx.stroke();
   path(wctx,shapeId,radius-spacing);wctx.stroke();
   if(shapeId===7){
    // Independent overlapping loop; must not become a phantom bucket wall.
    wctx.beginPath();wctx.arc(cx+17,cy-12,23,0,Math.PI*2);wctx.stroke();
   }
   const walls=wctx.getImageData(0,0,W,H),zone=actx.getImageData(0,0,W,H),
    output=new Uint8ClampedArray(total*4);
   // Find the actual gap between two separately drawn contours.
   // Previous approximations sometimes clicked the outside background of an
   // ellipse; those 'successful' fills were not testing the narrow basin.
   let seed=-1;
   for(const [vx,vy] of [[0,-1],[1,0],[0,1],[-1,0]]){
    if(seed>=0)break;
    let state=0,channel=[];
    for(let distance=1;distance<80;distance++){
     const x=cx+vx*distance,y=cy+vy*distance,i=y*W+x;
     if(x<0||x>=W||y<0||y>=H)break;
     const onLine=walls.data[i*4+3]>=96;
     if(state===0){if(onLine)state=1}
     else if(state===1){if(!onLine){state=2;channel=[i]}}
     else if(state===2){
      if(onLine){
       const valid=channel.filter(pixel=>zone.data[pixel*4+3]>=120);
       if(valid.length>=2)seed=valid[Math.floor(valid.length/2)];
       break;
      }
      channel.push(i);
     }
    }
   }
   if(seed<0){skipped++;continue}
   const connected=oracle(walls.data,zone.data,seed);
   let expected=0;for(let i=0;i<total;i++)expected+=connected[i];
   if(expected<18||expected>total*.40){skipped++;continue}
   const point=[seed%W,Math.floor(seed/W)],changed=new Uint8Array(total);
   const count=floodFillRaster({width:W,height:H,walls,zone,output,changed,
      point,color:[56,142,115]});
   let missed=0,leaked=0;
   for(let i=0;i<total;i++){
    if(connected[i]&&output[i*4+3]!==255)missed++;
    if(!connected[i]&&output[i*4+3]&&walls.data[i*4+3]<96&&zone.data[i*4+3]>=120)leaked++;
   }
   if(leaked)throw Error('Paint escaped into a separate basin '+shapeId+'/'+maskId+': '+leaked);
   const tolerance=Math.max(2,Math.floor(expected*.03));
   if(missed>tolerance){partial++;throw Error('Partial visible basin at '+shapeId+'/'+maskId+
     ': filled '+count+', missing '+missed+'/'+expected)}
   verified++;
   // Repeat fill on identical raster, with different pigment.
   const recolour=floodFillRaster({width:W,height:H,walls,zone,output,
      changed:new Uint8Array(total),point,color:[42,87,190]});
   if(!recolour)throw Error('Recolour failed '+shapeId+'/'+maskId);
   for(let i=0;i<total;i++){
    if(connected[i]&&output[i*4]!==42)throw Error('Stale pixel after recolour '+shapeId+'/'+maskId);
   }
   ctx.fillStyle='#e8ddc6';ctx.fillRect(0,0,W,H);
   const painted=ctx.createImageData(W,H);painted.data.set(output);ctx.putImageData(painted,0,0);
   ctx.drawImage(wc,0,0);
   const article=document.createElement('article'),caption=document.createElement('div');
   caption.className='caption';caption.textContent=shapeNames[shapeId]+' · '+maskNames[maskId]+' ✓';
   article.append(c,caption);document.querySelector('#grid').append(article);
   configs.push({shapeId,maskId,expected,missing:missed});
   rendered++;
  }
  return {verified,partial,rendered,skipped,configs};
 });
 assert(report.verified>=35,'Too few actual real-canvas painted topology combinations: '+report.verified);
 assert.equal(report.partial,0,'Rendered half fills detected');
 assert.deepEqual(errors,[],'Playwright page errors');
 await page.screenshot({path:join(dir,'zamazka-real-canvas-topology-matrix.png'),fullPage:true});
 console.log('ZAMAZKA: '+report.verified+' real Canvas2D circle/nested/composite/mask variants and recolours, '+report.skipped+' tiny clipped regions omitted; screenshot saved');
}finally{await browser.close()}
