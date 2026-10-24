#!/usr/bin/env node
// Full production renderStrokes -> fillRegion -> Canvas2D test. No fabricated
// walls/masks: overlapping brush strokes and a multi-gesture black outline are
// painted by the very same editor functions used during gameplay.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

const editor=readFileSync(new URL('../editor.js',import.meta.url),'utf8');
const beginning=editor.indexOf('export function drawStroke(');
const ending=editor.indexOf('export async function renderArtwork(',beginning);
assert(beginning>=0&&ending>beginning,'cannot isolate the actual production raster renderer');
const dabBeginning=editor.indexOf('function dab(',0);
assert(dabBeginning>=0&&dabBeginning<beginning,'cannot isolate the actual brush nib');
const originalRenderer=editor.slice(dabBeginning,ending)
 .replaceAll('export function ','function ');
const fillCore=readFileSync(new URL('../fill-core.js',import.meta.url),'utf8')
 .replaceAll('export function ','function ');
const contours=readFileSync(new URL('../fill-contours.js',import.meta.url),'utf8')
 .replaceAll('export function ','function ');
const rasterRegion=readFileSync(new URL('../fill-raster-region.js',import.meta.url),'utf8')
 .replaceAll('export function ','function ');
assert(originalRenderer.includes('fillMatchingColorRaster({'),
 'production fillRegion must use visible-colour bucket algorithm');

const browser=await chromium.launch({headless:true});
const folder=process.env.ZAMAZKA_QA_ARTIFACT_DIR||join(tmpdir(),'zamazka-colour-fill');
mkdirSync(folder,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:850,height:610},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<!doctype html><html><meta charset="utf-8"><body style="background:#40352b">'+
  '<canvas id="actual" width="600" height="450"></canvas></body></html>');
 await page.addScriptTag({content:
  'const W=600,H=450;\n'+
  'function damagePath(ctx){ctx.beginPath();ctx.rect(0,0,W,H);ctx.closePath()}\n'+
  fillCore+'\n'+contours+'\n'+rasterRegion+'\n'+originalRenderer});
 const report=await page.evaluate(()=>{
  const canvas=document.getElementById('actual'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const zone={x:0,y:0,w:600,h:450};
  const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
  const stroke=(c,s,p,t='brush')=>({c,s,p,t});
  const rgb=(a,b)=>a.slice(0,3).every((value,i)=>Math.abs(value-b[i])<=3);
  const check=(ok,label)=>{if(!ok)throw Error(label);checks++};
  const tan=[185,171,142],black=[27,29,33],blue=[33,123,210],green=[67,198,129];
  let checks=0,slowestMs=0;
  for(const segmentCount of [1,2,3,5]){
   const strokes=[];
   // A solid tan field is constructed from MANY opaque strokes, deliberately
   // obscuring every pixel of the later fill seed in the legacy wall mask.
   for(let y=75;y<=365;y+=18)
    strokes.push(stroke('#b9ab8e',28,[[92,y],[508,y]]));
   const originalCount=strokes.length,cx=300,cy=220,r=78;
   for(let segment=0;segment<segmentCount;segment++){
    const a=segment*2*Math.PI/segmentCount-.10;
    const b=(segment+1)*2*Math.PI/segmentCount+.10;
    const points=[];
    for(let i=0;i<=48;i++){
     const rad=a+(b-a)*i/48;
     points.push([cx+Math.cos(rad)*r,cy+Math.sin(rad)*r]);
    }
    strokes.push(stroke('#1b1d21',23,points));
   }
   // The 2+/multi-gesture boundaries cannot be identified as one closed stroke.
   if(segmentCount>1)check(!enclosingContourAt(strokes,strokes.length,[cx,cy],4/3),
    'the regression must really bypass the old single-gesture outline detector');
   const cache={};
   const render=()=>{
    ctx.clearRect(0,0,W,H);
    const start=performance.now();
    renderStrokes(ctx,strokes,zone,4/3,cache);
    slowestMs=Math.max(slowestMs,performance.now()-start);
   };
   render();
   check(rgb(pixel(cx,cy),tan),'initial multi-stroke interior is not tan');
   check(rgb(pixel(440,cy),tan),'initial outside should be the same tan');
   check(rgb(pixel(cx+r,cy),black),'the boundary must be visibly black');
   const outsideBefore=pixel(440,cy),paperBefore=[232,221,198],edgeBefore=pixel(cx+r,cy);
   strokes.push(stroke('#217bd2',8,[[cx,cy]],'fill'));
   render(); // executes chronological production fillRegion, not a test stub
   for(const [x,y] of [[cx,cy],[cx-35,cy],[cx+28,cy-19],[cx,cy+35]]){
    check(rgb(pixel(x,y),blue),'recolour did not reach entire tan interior ('+segmentCount+' segments at '+x+','+y+')');
   }
   check(rgb(pixel(440,cy),outsideBefore),'changed same-colour paint outside the ring');
   check(rgb(pixel(30,30),paperBefore),'spilled onto undamaged paper');
   check(rgb(pixel(cx+r,cy),edgeBefore),'erased the black drawn contour');
   strokes.push(stroke('#43c681',8,[[cx,cy]],'fill'));
   render();
   check(rgb(pixel(cx,cy),green),'second bucket did not recolour the same area');
   check(rgb(pixel(440,cy),outsideBefore),'second bucket spilled outside');
   // Undo and replay exercise the actual incremental renderer's cache.
   strokes.pop();render();
   check(rgb(pixel(cx,cy),blue),'undo must recover the earlier bucket');
   strokes.push(stroke('#43c681',8,[[cx,cy]],'fill'));render();
   check(rgb(pixel(cx,cy),green),'redo/replay must recover the new colour');
   // Restore no bucket for full-replay integrity (same source gestures).
   strokes.splice(originalCount);
  }
  return {checks,slowestMs:Math.round(slowestMs)};
 });
 assert(report.checks>=45,'too few production-browser assertions');
 assert.deepEqual(errors,[],'real browser renderer produced uncaught errors');
 await page.screenshot({path:join(folder,'zamazka-solid-tan-black-contour.png')});
 console.log('ZAMAZKA browser real-render fill: '+report.checks+
  ' assertions, 1/2/3/5 gesture outlines, repeated recolour and undo/redo; max render '+report.slowestMs+'ms');
}finally{await browser.close()}
