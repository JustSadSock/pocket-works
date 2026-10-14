import assert from 'node:assert/strict';
import {floodFillRaster} from '../fill-core.js';

// Every case exercises the same pure renderer used for live editor, reveal and archive.
const make=(width,height)=>{
 const walls=new Uint8ClampedArray(width*height*4);
 const zone=new Uint8ClampedArray(width*height*4);
 const output=new Uint8ClampedArray(width*height*4);
 const at=(x,y)=>(y*width+x)*4;
 for(let i=3;i<zone.length;i+=4)zone[i]=255;
 return {width,height,walls,zone,output,at};
};
const flood=(f,x,y,color)=>floodFillRaster({...f,point:[x,y],color});
const rgb=(f,x,y)=>Array.from(f.output.slice(f.at(x,y),f.at(x,y)+3));
const untouched=(f,x,y)=>assert.equal(f.output[f.at(x,y)+3],0,'other basin must stay untouched');

{
 const f=make(50,32);
 // Two different open basins end at the damaged-mask boundary; do not merge them.
 for(let y=2;y<30;y++)for(let x=2;x<48;x++)
  f.zone[f.at(x,y)+3]=255;
 for(let y=0;y<32;y++)for(let x=0;x<50;x++)
  if(x<2||x>47||y<2||y>29)f.zone[f.at(x,y)+3]=0;
 for(let y=2;y<=29;y++)f.walls[f.at(25,y)+3]=255;
 assert.ok(flood(f,12,15,[226,42,62])>300);
 untouched(f,36,15);
 assert.ok(flood(f,36,15,[51,142,225])>300);
 assert.deepEqual(rgb(f,12,15),[226,42,62]);
 assert.deepEqual(rgb(f,36,15),[51,142,225]);
 assert.ok(flood(f,12,15,[40,195,108])>300);
 assert.deepEqual(rgb(f,36,15),[51,142,225],
  'recolouring the left basin must never overwrite the right basin');
}
{
 const f=make(48,36);
 for(let x=8;x<=35;x++){f.walls[f.at(x,7)+3]=255;f.walls[f.at(x,28)+3]=255;}
 for(let y=7;y<=28;y++){f.walls[f.at(8,y)+3]=255;f.walls[f.at(35,y)+3]=255;}
 assert.ok(flood(f,20,14,[200,80,60])>200);
 untouched(f,4,14);
 assert.ok(flood(f,4,14,[60,170,240])>100);
 assert.deepEqual(rgb(f,20,14),[200,80,60]);
}
for(const gap of [1,2]){
 const f=make(48,32);
 for(let y=0;y<32;y++)if(y<14||y>=14+gap)f.walls[f.at(24,y)+3]=255;
 flood(f,10,10,[221,80,30]);
 untouched(f,35,10);
}
{
 const f=make(20,15);
 for(let y=0;y<15;y++)f.walls[f.at(10,y)+3]=105; // thin antialiased pencil
 flood(f,4,6,[200,30,70]);
 untouched(f,15,6);
 flood(f,15,6,[70,90,230]);
 assert.deepEqual(rgb(f,4,6),[200,30,70]);
}
{
 const f=make(20,15);
 for(let y=0;y<15;y++){
  f.zone[f.at(0,y)+3]=35;f.zone[f.at(1,y)+3]=85;
  f.walls[f.at(12,y)+3]=255;
 }
 flood(f,5,8,[100,180,60]);
 assert.deepEqual(rgb(f,0,8),[100,180,60],
  'the cutout antialiasing fringe must be underpainted');
 untouched(f,16,8);
}
{
 const f=make(8,8);
 for(let i=3;i<f.walls.length;i+=4)f.walls[i]=255;
 for(const [x,y] of [[1,1],[2,2]])f.walls[f.at(x,y)+3]=0;
 assert.equal(flood(f,1,1,[200,80,40]),1,
  'automatic gap joining must not erase a genuine one-pixel pocket');
 untouched(f,2,2);
}
{
 const f=make(70,54);
 // Deterministic curved separators, with opaque brush and weaker pencil segments.
 // Path is continuous even where adjacent rows shift horizontally.
 for(let iteration=0;iteration<30;iteration++){
  f.walls.fill(0);f.output.fill(0);
  const line=y=>34+Math.round(2*Math.sin((y+iteration)/8)+Math.sin((y+iteration)/3));
  for(let y=0;y<54;y++){
   const prev=line(Math.max(0,y-1)),now=line(y);
   for(let x=Math.min(prev,now);x<=Math.max(prev,now);x++)
    f.walls[f.at(x,y)+3]=iteration%2?255:120;
  }
  flood(f,10,22,[220,60,30]);
  untouched(f,56,22);
  flood(f,56,22,[40,80,230]);
  assert.deepEqual(rgb(f,10,22),[220,60,30]);
  flood(f,10,22,[180,160,30]);
  assert.deepEqual(rgb(f,56,22),[40,80,230]);
 }
}
{
 const f=make(600,450);
 for(let y=0;y<450;y++)f.walls[f.at(300,y)+3]=255;
 assert.ok(flood(f,120,210,[64,137,195])>100000,
  'large damage areas must remain fillable');
 untouched(f,480,210);
}
assert.equal(floodFillRaster({width:0,height:10,walls:[],zone:[],output:[],point:[0,0],color:[0,0,0]}),0);
console.log('ZAMAZKA: 39 deterministic region, pinhole, seam, edge, recolour and large-raster checks OK');
