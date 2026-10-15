import assert from 'node:assert/strict';
import {floodFillRaster} from '../fill-core.js';

// Each shape is a pair of separate contours and a thin paintable basin.
// Compare the bucket against ordinary 4-neighbour raster connectivity.
let generated=0,validClosed=0,masked=0,recolours=0,pinholes=0;
const A=[172,42,67],B=[35,142,207],w=95,h=91;
function fixture(seed,mode){
 const wall=new Uint8ClampedArray(w*h*4),zone=new Uint8ClampedArray(w*h*4),eligible=[],outside=[];
 const type=seed%7,cx=47.5,cy=45.5,r=11+(seed*13%21),gap=3+(seed*7%8),
  thick=[.55,.7,.9,1.1][(seed*31)%4],ratio=[1,1.1,1.28,1.45][Math.floor(seed/4)%4];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=x+.5-cx,dy=y+.5-cy,theta=Math.atan2(dy,dx);
  const d=type<4?Math.hypot(dx/ratio,dy*ratio):
   type===4?Math.max(Math.abs(dx/ratio),Math.abs(dy*ratio)):
   type===5?Math.abs(dx/ratio)+Math.abs(dy*ratio):
    Math.hypot(dx/ratio,dy*ratio)+1.7*Math.sin(theta*7+seed/11);
  const i=y*w+x,p=i*4;
  if(Math.abs(d-r)<=thick||Math.abs(d-r-gap)<=thick)wall[p+3]=255;
  let alpha=255;
  if(mode===1&&(x<7||x>88||y<5||y>85))alpha=0;
  if(mode===2&&Math.hypot(dx/1.19,dy/1.08)>37)alpha=0;
  if(mode===3&&Math.abs(dx)+Math.abs(dy)>61)alpha=0;
  if(mode===4&&(x<5+Math.floor(y/12)||x>88-Math.floor(y/14)))alpha=0;
  if(mode===5&&x<6+(y%7===0?2:0))alpha=0;
  if(mode===5&&x===6+(y%7===0?2:0))alpha=84;
  zone[p+3]=alpha;
  if(alpha>=120&&d>r+thick+.25&&d<r+gap-thick-.25)eligible.push(i);
  if(alpha>=120&&d>r+gap+thick+2)outside.push(i);
 }
 return {wall,zone,eligible,outside};
}
function connected(walls,zone,seed){
 const visited=new Uint8Array(w*h),queue=new Int32Array(w*h);
 const allowed=i=>zone[i*4+3]>=120&&walls[i*4+3]<96;
 if(!allowed(seed))return visited;
 let head=0,tail=1;queue[0]=seed;visited[seed]=1;
 while(head<tail){
  const i=queue[head++],x=i%w,y=(i/w)|0;
  if(x>0&&!visited[i-1]&&allowed(i-1)){visited[i-1]=1;queue[tail++]=i-1}
  if(x<w-1&&!visited[i+1]&&allowed(i+1)){visited[i+1]=1;queue[tail++]=i+1}
  if(y>0&&!visited[i-w]&&allowed(i-w)){visited[i-w]=1;queue[tail++]=i-w}
  if(y<h-1&&!visited[i+w]&&allowed(i+w)){visited[i+w]=1;queue[tail++]=i+w}
 }
 return visited;
}
for(let mode=0;mode<6;mode++)for(let seed=0;seed<700;seed++){
 const f=fixture(seed,mode);generated++;
 if(f.eligible.length<15)continue;
 const target=f.eligible[Math.floor(f.eligible.length/3)],point=[target%w,Math.floor(target/w)];
 const reachable=connected(f.wall,f.zone,target);
 const expected=f.eligible.filter(i=>reachable[i]);
 // Exclude raster sketches which are genuinely open due to insufficient
 // pixel coverage, not broken by bucket segmentation.
 if(expected.length/f.eligible.length<.9||f.outside.some(i=>reachable[i]))continue;
 validClosed++;if(mode)masked++;
 const output=new Uint8ClampedArray(w*h*4),changed=new Uint8Array(w*h);
 let n=floodFillRaster({width:w,height:h,walls:f.wall,zone:f.zone,output,changed,point,color:A});
 assert(n>0,'empty fill despite connected area, seed='+seed+' mode='+mode);
 const missed=expected.filter(i=>output[i*4+3]!==255).length;
 assert(missed<=Math.floor(expected.length*.05),
  'partial fill: seed='+seed+' mode='+mode+' missed='+missed+'/'+expected.length);
 assert(!f.outside.some(i=>output[i*4+3]&&!reachable[i]),
  'bucket crossed a closed contour, seed='+seed+' mode='+mode);
 n=floodFillRaster({width:w,height:h,walls:f.wall,zone:f.zone,output,
  changed:new Uint8Array(w*h),point,color:B});
 assert(n>0,'recolour produced no result, seed='+seed+' mode='+mode);
 recolours++;
 const stale=expected.filter(i=>output[i*4]!==B[0]).length;
 assert(stale<=Math.floor(expected.length*.05),
  'recolour only reached part of shape, seed='+seed+' mode='+mode+' stale='+stale);
 const untouched=f.outside.find(i=>!reachable[i]);
 if(untouched!==undefined)assert.equal(output[untouched*4+3],0,'other basin overwritten');
}
for(const orientation of ['horizontal','vertical'])for(const gap of [1,2])
 for(const alpha of [96,128,192,255])for(const length of [45,70,110]){
 const rw=orientation==='horizontal'?length:41,rh=orientation==='horizontal'?41:length;
 const walls=new Uint8ClampedArray(rw*rh*4),zone=new Uint8ClampedArray(rw*rh*4),
  output=new Uint8ClampedArray(rw*rh*4);
 for(let i=3;i<zone.length;i+=4)zone[i]=255;
 const m=orientation==='horizontal'?Math.floor(rh/2):Math.floor(rw/2);
 const missing=Math.floor(length/2);
 for(let n=0;n<length;n++){
  if(n>=missing&&n<missing+gap)continue;
  const x=orientation==='horizontal'?n:m,y=orientation==='horizontal'?m:n;
  walls[(y*rw+x)*4+3]=alpha;
 }
 const point=orientation==='horizontal'?[Math.floor(rw/2),5]:[5,Math.floor(rh/2)];
 floodFillRaster({width:rw,height:rh,walls,zone,output,point,color:A});
 const opposite=orientation==='horizontal'?(rh-6)*rw+Math.floor(rw/2):
   Math.floor(rh/2)*rw+rw-6;
 assert.equal(output[opposite*4+3],0,
  'gap '+gap+' '+orientation+' alpha '+alpha+' unexpectedly leaked');
 pinholes++;
}
assert(validClosed>=1900,'too few connected layouts '+validClosed);
assert(masked>=1400,'too few masked layouts '+masked);
console.log('ZAMAZKA: '+generated+' layouts, '+validClosed+' closed basins, '+
 recolours+' recolours, '+masked+' mask variants, '+pinholes+' real pinholes passed');
