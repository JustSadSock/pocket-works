#!/usr/bin/env node
// Real browser raster audit of the production bucket and contour compositor.
// Saves Playwright captures to ZAMAZKA_QA_ARTIFACT_DIR when provided.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

const dir=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-fill-playwright');
mkdirSync(dir,{recursive:true});
const fillSource=readFileSync(new URL('../fill-core.js',import.meta.url),'utf8').replaceAll('export function ','function ');
const editorSource=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
const section=editorSource.slice(editorSource.indexOf('export function preservePaintContours('),editorSource.indexOf('function fillRegion('));
assert(section.includes('useWallPigment'));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:980,height:720},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#302c28;color:#f8edd8;font:14px system-ui;padding:18px}
  header{font:25px Georgia,serif;padding-bottom:12px}
  section{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  article{background:#514337;border:6px ridge #967552;padding:9px}
  h2{font:16px Georgia,serif;margin:0 0 7px}
  canvas{width:100%;display:block;background:#e8ddc6;border:1px solid #281f18}
  footer{font:12px system-ui;margin-top:9px;opacity:.8}
  </style><header>ЗАМАЗКА — диагностика заливки</header>
  <section><article><h2>Первый цвет · зелёный</h2><canvas id="left" width="400" height="250"></canvas></article>
  <article><h2>Повторная заливка · синий</h2><canvas id="right" width="400" height="250"></canvas></article></section>
  <footer>Две независимые области · сохранённый контур · повторное окрашивание</footer>`);
 await page.addScriptTag({content:fillSource+'\n'+section.replace('export function','function')});
 for(const kind of ['curved','thin','nested','edge','diagonal','crossing']){
  const result=await page.evaluate(kind=>{
   const W=400,H=250,at=(x,y)=>(y*W+x)*4,wall=document.createElement('canvas'),wc=wall.getContext('2d');
   wall.width=W;wall.height=H;
   wc.lineJoin='round';wc.lineCap='round';wc.strokeStyle='#413126';
   wc.lineWidth=kind==='thin'?2.5:kind==='crossing'?9:5;
   wc.beginPath();
   if(kind==='curved'){wc.moveTo(208,-10);wc.bezierCurveTo(176,65,230,150,202,260)}
   if(kind==='thin'){wc.moveTo(207,-10);for(let y=0;y<265;y+=6)wc.lineTo(207+8*Math.sin(y/16),y)}
   if(kind==='nested'){wc.rect(112,54,170,130);wc.moveTo(200,54);wc.lineTo(200,184)}
   if(kind==='edge'){wc.moveTo(207,0);wc.bezierCurveTo(203,60,212,190,207,260)}
   if(kind==='diagonal'){wc.moveTo(130,-10);wc.lineTo(280,260)}
   if(kind==='crossing'){wc.moveTo(204,-10);wc.lineTo(204,260);wc.moveTo(155,130);wc.lineTo(250,130)}
   wc.stroke();
   const walls=wc.getImageData(0,0,W,H),zone=new Uint8ClampedArray(W*H*4);
   for(let i=3;i<zone.length;i+=4)zone[i]=255;
   if(kind==='edge')for(let y=0;y<H;y++)for(let x=0;x<15;x++)zone[at(x,y)+3]=x<8?0:90;
   const colors=[[39,146,126],[43,91,191]];
   const data=[];
   for(let panel=0;panel<2;panel++){
    const c=document.querySelector(panel?'#right':'#left'),ctx=c.getContext('2d');
    ctx.fillStyle='#e8ddc6';ctx.fillRect(0,0,W,H);ctx.drawImage(wall,0,0);
    const pixels=ctx.getImageData(0,0,W,H),before=new Uint8ClampedArray(pixels.data),changed=new Uint8Array(W*H);
    const point=kind==='nested'?[155,100]:[50,122];
    const first=floodFillRaster({width:W,height:H,walls,zone,output:pixels,changed,
      point,color:colors[0]});
    if(!first)throw Error('No basin filled: '+kind);
    preservePaintContours(pixels.data,before,walls.data,changed,true);
    if(panel){
      // The blue frame truly repaints the same already-green basin.
      const beforeBlue=new Uint8ClampedArray(pixels.data),changedBlue=new Uint8Array(W*H);
      const recoloured=floodFillRaster({width:W,height:H,walls,zone,output:pixels,
        changed:changedBlue,point,color:colors[1]});
      if(recoloured!==first)throw Error('Recolour changed reachable basin: '+kind);
      preservePaintContours(pixels.data,beforeBlue,walls.data,changedBlue,true);
    }
    ctx.putImageData(pixels,0,0);
    data.push({first,touched:changed.reduce((a,b)=>a+b,0),other:changed[122*W+355]});
   }
   return data;
  },kind);
  assert.equal(result.length,2);
  assert(result.every(r=>r.first>100));
  if(kind!=='nested')assert(result.every(r=>r.other===0),'fill escaped opposite basin');
  await page.screenshot({path:join(dir,'zamazka-fill-'+kind+'.png'),fullPage:false});
 }
 assert.deepEqual(errors,[],'Playwright raster audit must not log JavaScript errors');
 console.log('ZAMAZKA Playwright: 6 production raster contour screenshots captured in '+dir);
}finally{await browser.close()}
