// Renderer-only Natural Waters, immutable Genesis 3.3.
import {livingMaterial} from './genesis-living-visual.mjs';
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)},mix=(a,b,t)=>a.map((v,i)=>L(v,b[i],C(t)));
const cache=new WeakMap();
export function lakeBasins(g){
 if(cache.has(g))return cache.get(g);
 const n=g.land.length,w=g.width,h=g.height,labels=new Int32Array(n),levels=[0],queue=new Int32Array(n);
 for(let i=0;i<n;i++){if(!g.lakeWater?.[i]||labels[i])continue;const id=levels.length;let head=0,tail=1;queue[0]=i;labels[i]=id;const values=[];
 while(head<tail){const j=queue[head++],x=j%w,y=Math.floor(j/w);if(g.lakeWater[j])values.push(g.surface[j]);for(const k of [x?j-1:-1,x<w-1?j+1:-1,y?j-w:-1,y<h-1?j+w:-1])if(k>=0&&!labels[k]&&g.land[k]&&(g.lake[k]>.001||g.lakeWater[k])){labels[k]=id;queue[tail++]=k;}}
 values.sort((a,b)=>a-b);levels.push(values[Math.floor(values.length/2)]);}
 const W=(w-1)/g.detail,H=(h-1)/g.detail,cells=new Uint8Array(W*H);for(let i=0;i<n;i++)if(g.lakeWater?.[i])cells[Math.min(H-1,Math.floor(Math.floor(i/w)/g.detail))*W+Math.min(W-1,Math.floor((i%w)/g.detail))]=1;
 const result={labels,levels,cells};cache.set(g,result);return result;
}
function cubic(a,b,c,d,t){const u=(c-a)*.5,v=(d-b)*.5;return C((2*t*t*t-3*t*t+1)*b+(t*t*t-2*t*t+t)*u+(-2*t*t*t+3*t*t)*c+(t*t*t-t*t)*v,Math.min(b,c),Math.max(b,c));}
export function curvedChannels(g,bounds,detail){
 const [x0,y0,x1,y1]=bounds,r=g.detail,w=g.width,h=g.height,cols=(x1-x0)*detail+1,rows=(y1-y0)*detail+1,out=new Float32Array(cols*rows).fill(1),threshold=detail<=4?58:detail<=8?25:12;
 const valid=i=>i>=0&&g.land[i]&&!g.lakeWater?.[i]&&g.flow[i]/(r*r)>=threshold;
 const point=i=>({x:(i%w)/r,y:Math.floor(i/w)/r,w:C(.025+.035*Math.log2(Math.max(threshold,g.flow[i]/(r*r))/12),.025,.30)});
 const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,w:(a.w+b.w)/2});
 function segment(a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;if(!den)return;const e=Math.max(a.w,b.w)+.22;
 for(let y=Math.max(0,Math.floor((Math.min(a.y,b.y)-e-y0)*detail));y<=Math.min(rows-1,Math.ceil((Math.max(a.y,b.y)+e-y0)*detail));y++)for(let x=Math.max(0,Math.floor((Math.min(a.x,b.x)-e-x0)*detail));x<=Math.min(cols-1,Math.ceil((Math.max(a.x,b.x)+e-x0)*detail));x++){const X=x0+x/detail,Y=y0+y/detail,t=C(((X-a.x)*dx+(Y-a.y)*dy)/den),d=Math.hypot(X-a.x-t*dx,Y-a.y-t*dy)-L(a.w,b.w,t),k=y*cols+x;if(d<out[k])out[k]=d;}}
 for(let y=Math.max(0,Math.floor((y0-2)*r));y<=Math.min(h-1,Math.ceil((y1+2)*r));y++)for(let x=Math.max(0,Math.floor((x0-2)*r));x<=Math.min(w-1,Math.ceil((x1+2)*r));x++){const i=y*w+x,j=g.down[i];if(!valid(i)||j<0)continue;const b=point(i),end=point(j),incoming=[];
 for(let Y=Math.max(0,y-1);Y<=Math.min(h-1,y+1);Y++)for(let X=Math.max(0,x-1);X<=Math.min(w-1,x+1);X++){const k=Y*w+X;if(valid(k)&&g.down[k]===i)incoming.push(k);}
 const stop=valid(j)?mid(b,end):end;
 if(incoming.length!==1){for(const k of incoming)segment(mid(point(k),b),b);segment(b,stop);continue;}
 const start=mid(point(incoming[0]),b);let prev=start;
 for(let k=1;k<=4;k++){const t=k/4,u=1-t,p={x:u*u*start.x+2*u*t*b.x+t*t*stop.x,y:u*u*start.y+2*u*t*b.y+t*t*stop.y,w:u*u*start.w+2*u*t*b.w+t*t*stop.w};segment(prev,p);prev=p;}
 }return out;
}
export async function naturalWatersSource(s,cam,{bounds,detail=8,vertical,yieldRow=async()=>{}}={}){
 if(s.mapVersion!==3||!s.autonomous||typeof vertical!=='function'||![4,8,16].includes(detail))throw Error('Natural Waters requires revealed v3');
 const g=s.map.geography,m=s.map,r=g.detail,W=(g.width-1)/r,H=(g.height-1)/r,[x0,y0,x1,y1]=bounds,cols=(x1-x0)*detail+1,rows=(y1-y0)*detail+1,n=cols*rows,vertices=new Float32Array(n*9),elevations=new Float32Array(n),depth=new Float32Array(n),shore=new Float32Array(n),kind=new Uint8Array(n),clock=()=>globalThis.performance?.now?.()??Date.now(),begin=clock(),basins=lakeBasins(g),channels=curvedChannels(g,bounds,detail);
 let last=begin,maxSlice=0,minH=Infinity,maxH=-Infinity,sea=0,lake=0,visualLakeOutside=0,coarseLakeDry=0;
 const at=(x,y)=>C(y,0,g.height-1)*g.width+C(x,0,g.width-1);
 const bilinear=(X,Y,get)=>{const x=Math.floor(X),y=Math.floor(Y),u=X-x,v=Y-y;return L(L(get(at(x,y)),get(at(x+1,y)),u),L(get(at(x,y+1)),get(at(x+1,y+1)),u),v);};
 const sample=(a,X,Y)=>bilinear(X,Y,i=>a[i]);
 const bedAt=(X,Y)=>{const x=Math.floor(X),y=Math.floor(Y),u=X-x,v=Y-y,rr=k=>cubic(g.bed[at(x-1,k)],g.bed[at(x,k)],g.bed[at(x+1,k)],g.bed[at(x+2,k)],u);return cubic(rr(y-1),rr(y),rr(y+1),rr(y+2),v);};
 // Restrict inundation to the existing gameplay lake plus one fine sample.
 const lakeCell=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&!m.land[y*W+x]&&!!basins.cells[y*W+x];
 const coastSigned=i=>g.land[i]?Math.max(.0001,g.bed[i]-.12):Math.min(-.0001,g.bed[i]-.12);
 for(let y=0;y<rows;y++){for(let x=0;x<cols;x++){const X=x0+x/detail,Y=y0+y/detail,fx=X*r,fy=Y*r,cx=C(Math.floor(X),0,W-1),cy=C(Math.floor(Y),0,H-1),k=cy*W+cx,i=y*cols+x,bed=bedAt(fx,fy),wet=sample(g.rain,fx,fy),coast=bilinear(fx,fy,coastSigned);
 const ix=Math.floor(fx),iy=Math.floor(fy);let id=0,best=Infinity;for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){const j=at(ix+dx,iy+dy),label=basins.labels[j],d=(fx-ix-dx)**2+(fy-iy-dy)**2;if(label&&d<best){id=label;best=d;}}
 let lakeDepth=-1,level=0;const inside=lakeCell(cx,cy);
 if(id){level=basins.levels[id];let nearest=Infinity;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const a=cx+dx,b=cy+dy;if(lakeCell(a,b)===inside)continue;const d=Math.hypot(Math.max(a-X,0,X-a-1),Math.max(b-Y,0,Y-b-1));nearest=Math.min(nearest,d);}
 const signed=inside?nearest:-nearest,support=bilinear(fx,fy,j=>basins.labels[j]===id?1:0);
 lakeDepth=Math.min(level-bed,(signed+.24)*.10,(support-.22)*.15);
 }
 const isSea=coast<0,isLake=!isSea&&lakeDepth>0,water=isSea||isLake,waterLevel=isSea?.12:level;
 const margin=isSea?-coast:isLake?lakeDepth:Math.max(.00001,Math.min(coast,-lakeDepth));
 depth[i]=water?Math.max(0,waterLevel-bed):0;shore[i]=water?-margin:margin;kind[i]=isSea?1:isLake?2:0;
 if(isSea)sea++;if(isLake){lake++;visualLakeOutside+=+!inside;}if(!water&&inside)coarseLakeDry++;
 const cover=water?C(.5-margin*8,0,.499):C(.5+margin*8,.501,1);
 const h=water?waterLevel:bed,e=vertical(h),forest=S((wet-.45)/.24)*(1-S((bed-.46)/.24));
 vertices.set([X,Y,e,h,wet,m.fert[k],forest,cover,water?1:channels[i]],i*9);elevations[i]=e;if(!water){minH=Math.min(minH,h);maxH=Math.max(maxH,h);}
 }const t=clock();if(t-last>=6){maxSlice=Math.max(maxSlice,t-last);await yieldRow();last=clock();}}
 return {vertices,elevations,water:{depth,shore,kind},indices:new Uint32Array(0),cols,rows,detail,bounds,center:0,stats:{ms:clock()-begin,maxSlice:Math.max(maxSlice,clock()-last),minH,maxH,anchorError:0,bytes:vertices.byteLength+elevations.byteLength+channels.byteLength+depth.byteLength+shore.byteLength+kind.byteLength,water:{sea,lake,visualLakeOutside,coarseLakeDry,basins:basins.levels.length-1}}};
}
export function watersMaterial(p,water){
 const {x,y,wet,slope,river,nx,ny}=p,{kind,depth,shore}=water;
 if(kind){const shallow=1-S(depth/(kind===2?.075:.12)),ripples=(Math.sin(x*11+y*23)+Math.sin(x*17-y*8))*1.5;
 return mix(kind===2?[35,67,79]:[30,63,88],kind===2?[95,131,115]:[85,138,139],shallow).map(v=>v+ripples*shallow);}
 let base=livingMaterial(p),bank=1-S(Math.max(0,river)/.19),edge=1-S(shore/.023),rock=S((slope-.06)/.29),sand=(1-rock)*(1-S((wet-.30)/.48)),cliff=mix([121,115,103],[185,170,144],S((nx+ny+1)*.5));
 base=mix(base,mix(mix([105,119,86],[190,165,117],sand),cliff,rock),edge*.87);
 base=mix(base,[66,101,70],bank*(1-rock)*(.26+.30*wet));if(river<.014){const opacity=1-S((river+.008)/.022);base=mix(base,mix([44,79,91],[100,133,119],S((river+.045)/.055)),opacity);}
 return base;
}
