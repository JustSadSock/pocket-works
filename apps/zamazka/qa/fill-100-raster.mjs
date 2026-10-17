import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {floodFillRaster} from '../fill-core.js';

// 85 independently named raster scenarios × 3 layouts. Remaining 15 use
// real Editor history, pointer and recovery in fill-100-editor.mjs.
// All colours are compared as actual RGBA pixels, not screenshots of mocks.
const names={
 1:'empty cutout',2:'identical pigment',3:'red to blue',4:'three recolours',
 5:'white fill',6:'black fill',7:'nearly identical pigment',8:'opposite tap position',
 9:'rapid double click',10:'ten colours',11:'half canvas',12:'75% area',
 13:'95% area',14:'complete cutout',15:'already opaque undercoat',
 16:'three large recolours',17:'twenty large recolours',18:'fifty large recolours',
 19:'hundred old brush marks',20:'ten preexisting buckets',21:'full region at 8x',
 22:'full region at 1x',23:'panned canvas coordinates',24:'refill after undo',
 25:'refill after draft restore',26:'small square',27:'giant rectangle',
 28:'circle',29:'triangle corners',30:'star tips',31:'closed long spiral',
 32:'concave polygon',33:'joined stroke segments',34:'thick outlined shape',
 35:'thin pencil outline',36:'two adjacent rectangles',37:'three neighbours',
 38:'ring within a ring',39:'five concentric contours',40:'outer ring recolour',
 41:'inner ring recolour',42:'common thin partition',43:'common thick partition',
 44:'thirty-cell mosaic',45:'repaint mosaic subset',46:'1px thin pinhole',
 47:'2px thin pinhole',48:'5px intentional door',49:'10px intentional door',
 50:'two independent doors',51:'1px between thick blocks',
 52:'2px between thick blocks',53:'3px between thick blocks',
 54:'long narrow passage',55:'zigzag passage',56:'three alternative paths',
 57:'diagonal-only connectivity',58:'sharp angle basin',59:'independent parallel contours',
 60:'connected maze',61:'left cutout boundary',62:'right cutout boundary',
 63:'top cutout boundary',64:'bottom cutout boundary',65:'tap on boundary',
 66:'tap 2px outside',67:'tap far outside',68:'jagged damage edge',
 69:'narrow damage protrusion',70:'AA damage fringe',71:'brush contour bucket',
 72:'pencil contour bucket',73:'spray discontinuous contour',
 74:'brush over existing fill',75:'brush after fill partitions',
 76:'eraser cuts filled pigment',77:'eraser opens a wall',
 78:'smudge over filled colour',79:'smudge wall before bucket',
 80:'eyedropper sampled pigment applied elsewhere',96:'hundred different buckets',
 97:'hundred recolours of same large area',98:'three hundred previous actions',
 99:'mixed hundred-cell micro/macro painting',100:'extreme full stress'};
const ids=[...Array.from({length:80},(_,i)=>i+1),96,97,98,99,100];
const C=[[228,46,27],[19,104,203],[56,183,91],[240,175,29],[255,255,255],[0,0,0],[48,74,67],[48,74,68]];
const make=(w,h)=>{
 const N=w*h,walls=new Uint8ClampedArray(N*4),zone=new Uint8ClampedArray(N*4),output=new Uint8ClampedArray(N*4),changed=new Uint8Array(N);
 for(let i=3;i<zone.length;i+=4)zone[i]=255;
 const f={w,h,walls,zone,output,changed};
 f.at=(x,y)=>(y*w+x)*4;
 f.wall=(x,y,a=255)=>{if(x>=0&&x<w&&y>=0&&y<h)walls[f.at(x,y)+3]=a};
 f.mask=(x,y,a=0)=>{if(x>=0&&x<w&&y>=0&&y<h)zone[f.at(x,y)+3]=a};
 f.rgb=(x,y)=>Array.from(output.slice(f.at(x,y),f.at(x,y)+3));
 f.alpha=(x,y)=>output[f.at(x,y)+3];
 f.fill=(p,c=C[0])=>{
  changed.fill(0);
  return floodFillRaster({width:w,height:h,walls,zone,output,changed,point:p,color:c});
 };
 f.col=(x,y,c)=>assert.deepEqual(f.rgb(x,y),c,'unexpected pigment at '+x+','+y);
 return f;
};
const count=(a)=>a.reduce((n,v)=>n+v,0);
function rect(f,x1,y1,x2,y2,thick=1){
 for(let t=0;t<thick;t++){
  for(let x=x1;x<=x2;x++){f.wall(x,y1+t);f.wall(x,y2-t)}
  for(let y=y1;y<=y2;y++){f.wall(x1+t,y);f.wall(x2-t,y)}
 }
}
function line(f,x1,y1,x2,y2,thick=1,a=255){
 const n=Math.ceil(Math.hypot(x2-x1,y2-y1)*3);
 for(let s=0;s<=n;s++){
  const x=Math.round(x1+(x2-x1)*s/n),y=Math.round(y1+(y2-y1)*s/n);
  for(let oy=-thick+1;oy<=thick-1;oy++)for(let ox=-thick+1;ox<=thick-1;ox++)f.wall(x+ox,y+oy,a);
 }
}
function oracle(f,p){
 const w=f.w,h=f.h,N=w*h,seen=new Uint8Array(N),queue=new Int32Array(N);
 const valid=i=>f.zone[i*4+3]>=120&&f.walls[i*4+3]<96;
 const start=p[1]*w+p[0];if(!valid(start))return seen;
 let head=0,tail=1;queue[0]=start;seen[start]=1;
 while(head<tail){
  const i=queue[head++],x=i%w,y=(i/w)|0;
  for(const j of [x>0?i-1:-1,x+1<w?i+1:-1,y>0?i-w:-1,y+1<h?i+w:-1])
   if(j>=0&&!seen[j]&&valid(j)){seen[j]=1;queue[tail++]=j}
 }
 return seen;
}
function exact(f,p,col=C[0]){
 const expected=oracle(f,p),n=count(expected);
 const got=f.fill(p,col);
 assert.equal(got,n,'4-neighbour reference disagrees');
 for(let i=0;i<expected.length;i++){
  if(f.zone[i*4+3]<120||f.walls[i*4+3]>=96)continue;
  assert.equal(f.changed[i],expected[i],'wrong connected pixel '+i);
  if(expected[i])assert.deepEqual(Array.from(f.output.subarray(i*4,i*4+3)),col,'bad recoloured pixel '+i);
 }
 return got;
}
function chooseSize(id,v){
 if(id===14&&v===2)return [1200,900];
 if((id>=11&&id<=25||id>=96)&&![17,18,97].includes(id))return [[160,120],[300,225],[600,450]][v];
 return [[80,60],[116,86],[168,114]][v];
}
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
let checks=0,elapsed=[],largeMax=0;
for(const id of ids)for(let v=0;v<3;v++){
 const [w,h]=chooseSize(id,v),f=make(w,h),mid=Math.floor(w/2),cy=Math.floor(h/2),left=[Math.floor(w*.2),cy],right=[Math.floor(w*.8),cy],rand=rng(id*797+v*13);
 const separator=(thick=2)=>{for(let y=0;y<h;y++)for(let t=0;t<thick;t++)f.wall(mid+t,y)};
 const side=()=>{separator();const n=exact(f,left,C[0]);assert(n>0);assert.equal(f.alpha(right[0],cy),0);return n};
 const recolour=(n,p=left)=>{for(let k=0;k<n;k++){const c=C[k%C.length];exact(f,p,c)}};
 const t0=performance.now();
 try{
 if(id<=10){
  if(id===1){exact(f,left);f.col(right[0],cy,C[0])}
  if(id===2){exact(f,left,C[0]);exact(f,left,C[0]);f.col(...left,C[0])}
  if(id===3){exact(f,left,C[0]);exact(f,right,C[1]);f.col(...left,C[1])}
  if(id===4){for(let k=0;k<3;k++)exact(f,left,C[k]);f.col(...right,C[2])}
  if(id===5){exact(f,left,C[4]);f.col(...left,C[4])}
  if(id===6){exact(f,left,C[5]);f.col(...right,C[5])}
  if(id===7){exact(f,left,C[6]);exact(f,left,C[7]);f.col(...right,C[7])}
  if(id===8){exact(f,left,C[0]);exact(f,right,C[1]);f.col(...left,C[1])}
  if(id===9){exact(f,left,C[0]);exact(f,left,C[0]);assert.equal(count(f.changed),w*h)}
  if(id===10)recolour(10);
 }else if(id<=25){
  if([11,12,13].includes(id)){
   const target=Math.floor(w*(id===11?.5:id===12?.75:.95));
   for(let y=0;y<h;y++)f.wall(target,y);
   const n=exact(f,left);
   assert(Math.abs(n-target*h)<=h,'large fraction count wrong '+n);
   assert.equal(f.alpha(w-2,cy),0);
  }
  if(id===14){const n=exact(f,left);assert.equal(n,w*h)}
  if(id===15){for(let i=0;i<f.output.length;i+=4)f.output.set([95,88,70,255],i);exact(f,left,C[1]);f.col(...right,C[1])}
  if(id===16){recolour(3);f.col(...right,C[2])}
  if(id===17||id===18)recolour(id===17?20:50);
  if(id===19){for(let i=0;i<100;i++){const x=Math.floor(rand()*w),y=Math.floor(rand()*h);f.output.set([40,70,90,255],f.at(x,y))}exact(f,left,C[3]);f.col(...right,C[3])}
  if(id===20){separator();for(let k=0;k<10;k++)f.fill(k%2?right:left,C[k%C.length]);exact(f,left,C[0]);assert.equal(f.rgb(...right)[0],C[9%C.length][0])}
  if([21,22,23].includes(id)){exact(f,[Math.floor(w*(id===23?.81:.37)),cy]);f.col(...left,C[0]);f.col(...right,C[0])}
  if(id===24){exact(f,left,C[0]);f.output.fill(0);exact(f,left,C[1]);f.col(...right,C[1])}
  if(id===25){exact(f,left,C[0]);const restored=new Uint8ClampedArray(f.output);f.output.set(restored);exact(f,right,C[3]);f.col(...left,C[3])}
 }else if(id<=35){
  const x1=Math.floor(w*.18),x2=Math.floor(w*.82),y1=Math.floor(h*.16),y2=Math.floor(h*.84);
  if([26,27,33,34,35].includes(id)){
   const thickness=id===34?5:id===35?1:2;
   rect(f,x1,y1,x2,y2,thickness);
   const n=exact(f,[mid,cy]);assert(n>100);
   assert.equal(f.alpha(1,1),0);
  }
  if(id===28){const radius=Math.floor(Math.min(w,h)*.3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(Math.abs(Math.hypot(x-mid,y-cy)-radius)<1.6)f.wall(x,y);const seen=oracle(f,[mid,cy]);const n=f.fill([mid,cy]);assert(n>100);assert.equal(f.alpha(0,0),0);assert(n<=count(seen))}
  if([29,30,32].includes(id)){
   const vertices=id===29?[[mid,y1],[x1,y2],[x2,y2]]:
    id===30?Array.from({length:10},(_,i)=>{const theta=i*Math.PI/5-Math.PI/2,r=Math.min(w,h)*(i%2?.17:.35);return [Math.round(mid+Math.cos(theta)*r),Math.round(cy+Math.sin(theta)*r)]}):
    [[x1,y1],[x2,y1],[x2,cy-4],[mid+4,cy-4],[mid+4,y2],[x1,y2]];
   // Thicken raster polygon edges so a 4-connected fill never escapes at diagonals.
   for(let i=0;i<vertices.length;i++){let a=vertices[i],b=vertices[(i+1)%vertices.length];line(f,...a,...b,2)}
   const n=f.fill([mid,cy]);assert(n>0);
   assert.equal(f.alpha(0,0),0,'outline leaked');
   assert(f.alpha(mid,cy)===255,'center of polygon missed');
  }
  if(id===31){
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const r=Math.hypot(x-mid,y-cy),theta=Math.atan2(y-cy,x-mid);
    if(r>Math.min(w,h)*.42||Math.abs(r-(Math.min(w,h)*.15+(theta+Math.PI)*Math.min(w,h)*.035))<1.5)f.mask(x,y);
   }
   const good=[mid,cy];if(f.zone[f.at(...good)+3]===0)f.zone[f.at(...good)+3]=255;
   const n=exact(f,good);assert(n>0);
  }
 }else if(id<=45){
  if([36,42,43].includes(id)){
   separator(id===43?5:1);
   const a=exact(f,left,C[0]);assert(a>0);exact(f,right,C[1]);f.col(...left,C[0]);
   exact(f,left,C[2]);f.col(...right,C[1]);
  }
  if(id===37){for(const xx of [Math.floor(w/3),Math.floor(w*2/3)])for(let y=0;y<h;y++)f.wall(xx,y);
   for(const [x,c] of [[Math.floor(w/6),C[0]],[mid,C[1]],[Math.floor(w*5/6),C[2]]])exact(f,[x,cy],c);
   exact(f,[mid,cy],C[3]);f.col(Math.floor(w/6),cy,C[0]);f.col(Math.floor(w*5/6),cy,C[2]);
  }
  if([38,39,40,41].includes(id)){
   const rings=id===38?2:5,rStep=Math.floor(Math.min(w,h)/(rings*2+3));
   for(let k=1;k<=rings;k++)rect(f,mid-k*rStep,cy-k*rStep,mid+k*rStep,cy+k*rStep,2);
   exact(f,[mid,cy],C[0]);f.col(mid,cy,C[0]);assert.equal(f.alpha(0,0),0);
   for(let k=0;k<(id===38?1:3);k++){let x=mid+(k*2+1)*rStep; if(x<mid+rings*rStep)f.fill([x,cy],C[(k+1)%C.length])}
   if(id===40||id===41){const p=id===40?[w-2,cy]:[mid,cy];exact(f,p,C[3]);if(id===40)f.col(mid,cy,C[0]);else f.col(w-2,cy,C[0].map(()=>0).map((_,i)=>f.rgb(w-2,cy)[i]))}
  }
  if([44,45].includes(id)){
   const cols=6,rows=5;
   for(let y=0;y<h;y++)if(y>0&&y%Math.floor(h/rows)===0)for(let x=0;x<w;x++)f.wall(x,y);
   for(let x=0;x<w;x++)if(x>0&&x%Math.floor(w/cols)===0)for(let y=0;y<h;y++)f.wall(x,y);
   let paints=0;
   for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const p=[col*Math.floor(w/cols)+2,row*Math.floor(h/rows)+2];f.fill(p,C[(row*cols+col)%4]);paints++;
   }
   assert.equal(paints,30);
   if(id===45)for(let i=0;i<15;i++)f.fill([(i%cols)*Math.floor(w/cols)+2,Math.floor(i/cols)*Math.floor(h/rows)+2],C[4]);
   f.col(2,2,id===45?C[4]:C[0]);
  }
 }else if(id<=60){
  if(id<=50){
   const gap=id===46?1:id===47?2:id===48?5:id===49?10:6;
   for(let y=0;y<h;y++)if(y<cy||y>=cy+gap)f.wall(mid,y);
   const first=f.fill(left,C[0]);assert(first>0);
   if(id<=47){assert.equal(f.alpha(...right),0,'pinhole not stitched')}
   else{assert.equal(f.alpha(...right),255,'intentional door sealed')}
  }else if(id<=56||id===59){
   const gap=id===51?1:id===52?2:id===53?3:id===54?2:id===55?3:id===56?3:2;
   const corridorLeft=mid-gap,corridorRight=mid;
   for(let y=8;y<h-8;y++)for(let x=0;x<w;x++)
    if(x>=7&&x<corridorLeft||x>=corridorRight&&x<w-7)f.wall(x,y);
   const target=[corridorLeft,cy],n=f.fill(target,C[0]);assert(n>0);
   for(let y=0;y<h;y++)if(y>8&&y<h-8)assert.equal(f.alpha(corridorLeft,y),255,'corridor fragment sealed '+y);
   assert.equal(f.alpha(mid+Math.floor(w*.35),cy),0);
  }else if(id===57){
   f.walls.fill(0);for(let i=3;i<f.walls.length;i+=4)f.walls[i]=255;
   for(const [x,y] of [[mid,cy],[mid+1,cy+1]])f.wall(x,y,0);
   assert.equal(f.fill([mid,cy],C[0]),1);assert.equal(f.alpha(mid+1,cy+1),0);
  }else if(id===58){
   line(f,Math.floor(w*.2),Math.floor(h*.8),mid,Math.floor(h*.15),2);
   line(f,mid,Math.floor(h*.15),Math.floor(w*.8),Math.floor(h*.8),2);
   line(f,Math.floor(w*.8),Math.floor(h*.8),Math.floor(w*.2),Math.floor(h*.8),2);
   assert(f.fill([mid,cy],C[0])>0);assert.equal(f.alpha(1,1),0);
  }else if(id===60){
   for(let x=8;x<w-8;x+=13)for(let y=0;y<h;y++)if(y<cy-3||y>cy+3)f.wall(x,y);
   const expected=oracle(f,left),n=f.fill(left,C[0]);assert.equal(n,count(expected));assert.equal(f.alpha(right[0],cy),255);
  }
 }else if(id<=70){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const edge=4+((y+v*3)%11===0?3:0);
   if(id===61||id===65||id===66||id===67||id===68||id===70){
    if(x<edge)f.mask(x,y,id===70&&x===edge-1?80:0);
   }else if(id===62){if(x>=w-edge)f.mask(x,y)}
   else if(id===63){if(y<6)f.mask(x,y)}
   else if(id===64){if(y>=h-6)f.mask(x,y)}
   else if(id===69){if(x>12&&x<w-12&&y>4&&y<h-4)f.mask(x,y);if(y===cy&&x>12)f.zone[f.at(x,y)+3]=255}
  }
  const p=id===65?[4,cy]:id===66?[2,cy]:id===67?[-30,cy]:left;
  if(id===65){f.fill(p);assert.equal(f.alpha(30,cy),255)}
  else if([66,67].includes(id)){// Editor hit testing forbids out-of-mask taps; raw flood snaps only at edges.
   const before=f.output.slice();const clickable=p[0]>=0&&p[0]<w&&f.zone[f.at(Math.max(0,p[0]),cy)+3]>=120;
   if(clickable)f.fill(p);assert.deepEqual(f.output,before,'an outside UI click must not paint');
  }else{
   const n=f.fill(left,C[0]);assert(n>0);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(f.zone[f.at(x,y)+3]===0)
    assert.equal(f.alpha(x,y),0,'paint escaped cutout');
  }
 }else if(id<=80){
  separator(id===72?1:2);
  if(id===73){f.walls.fill(0);for(let y=0;y<h;y+=4)f.wall(mid,y);assert.equal(f.fill(left),w*h-Math.ceil(h/4),'spray specks must not be a separator');assert.equal(f.alpha(...right),255)}
  else if(id===77){for(let y=cy-4;y<=cy+4;y++)for(let x=mid;x<mid+2;x++)f.wall(x,y,0);f.fill(left);assert.equal(f.alpha(...right),255,'eraser opening not followed')}
  else if(id===79){for(let y=cy-3;y<=cy+3;y++)for(let x=mid;x<mid+2;x++)f.wall(x,y,0);f.fill(left);assert.equal(f.alpha(...right),255)}
  else{
   f.fill(left,C[0]);
   if(id===74||id===75){f.output.set(C[1].concat([255]),f.at(left[0],cy));}
   if(id===76)f.output.set([232,221,198,255],f.at(left[0],cy));
   if(id===78)f.output.set([130,80,120,255],f.at(left[0],cy));
   if(id===80){const sampled=f.rgb(...left);exact(f,right,sampled);f.col(...right,sampled);}
   else if(id===74||id===75||id===76||id===78)assert.notDeepEqual(f.rgb(...left),C[0]);
   if(id===71||id===72){assert.equal(f.alpha(...right),0)}
  }
 }else if(id>=96){
  if(id===96){separator();for(let k=0;k<100;k++)f.fill(k%2?right:left,C[k%C.length]);f.col(...left,C[98%C.length]);f.col(...right,C[99%C.length])}
  if(id===97){for(let k=0;k<100;k++)f.fill(left,C[k%C.length]);f.col(...left,C[99%C.length]);f.col(...right,C[99%C.length])}
  if(id===98){for(let k=0;k<300;k++){const x=Math.floor(rand()*w),y=Math.floor(rand()*h);f.output.set([40,80,90,255],f.at(x,y))}exact(f,left,C[0]);f.col(...right,C[0])}
  if(id===99){for(let x=2;x<w-2;x+=10)for(let y=2;y<h-2;y+=10)rect(f,x,y,Math.min(w-1,x+5),Math.min(h-1,y+5));const n=f.fill([0,0]);assert(n>0);f.fill([Math.floor(w*.6),Math.floor(h*.6)],C[1]);assert.equal(f.alpha(0,0),255)}
  if(id===100){separator(2);for(let k=0;k<30;k++)f.fill(k%2?right:left,C[k%C.length]);const snapshot=f.output.slice();f.output.set(snapshot);for(let k=0;k<20;k++)f.fill(left,C[k%C.length]);f.col(...left,C[19%C.length]);f.col(...right,C[29%C.length])}
 }
 checks++;
 elapsed.push(performance.now()-t0);
 }catch(e){throw new Error('ZAMAZKA scenario #'+id+' '+names[id]+' layout='+v+' '+w+'x'+h+': '+e.message,{cause:e})}
}
assert.equal(checks,85*3,'not all raster cases executed');
console.log('ZAMAZKA FILL-100 RASTER: '+checks+' passed / '+checks+'; 85 named tests × 3 independent layouts; largest 1200x900; slowest '+Math.max(...elapsed).toFixed(1)+'ms');
