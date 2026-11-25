// Research-only fully revealed preview. Never attach this to a fogged campaign.
import {vertical,prepareTerrain} from './world-rendering-gl.mjs';
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),S=t=>{t=C(t);return t*t*(3-2*t)};
const sleep=()=>new Promise(r=>setTimeout(r,0));
export async function genesisSource(s,cam,{bounds=null,datum=null,bedPreview=false,stage=null}={}){
 if(s.mapVersion!==3||!s.autonomous)throw Error('Genesis review requires an explicitly fully revealed v3 fixture');
 const g=s.map.geography,m=s.map,r=g.detail,W=(g.width-1)/r,H=(g.height-1)/r,[x0,y0,x1,y1]=bounds||[Math.max(0,Math.floor(cam.x-36)),Math.max(0,Math.floor(cam.y-36)),Math.min(W,Math.ceil(cam.x+36)),Math.min(H,Math.ceil(cam.y+36))],cols=(x1-x0)*r+1,rows=(y1-y0)*r+1,n=cols*rows,v=new Float32Array(n*9),z=new Float32Array(n);let start=performance.now(),last=start,maxSlice=0,minH=Infinity,maxH=-Infinity;
 const at=(x,y)=>C(y,0,g.height-1)*g.width+C(x,0,g.width-1), coarse=(x,y)=>C(Math.floor(y),0,H-1)*W+C(Math.floor(x),0,W-1);
 for(let y=0;y<rows;y++){for(let x=0;x<cols;x++){const X=x0+x/r,Y=y0+y/r,j=at(x0*r+x,y0*r+y),i=y*cols+x,k=coarse(X,Y),h=stage==='before'?g.beforeErosion[j]:stage==='filled'?g.surface[j]:stage==='bed'||bedPreview||(g.config.revision==='genesis-3.2.0'||g.config.revision==='genesis-3.3.0')?g.bed[j]:g.surface[j],wet=g.rain[j],inland=stage?false:!!g.lakeWater?.[j],land=g.land[j]&&!inland,cover=land?C(.5+(g.bed[j]-.12)*12,.501,1):C(.5+(g.bed[j]-.12)*12,0,.499),waterDepth=g.lake[j],e=inland?vertical(g.surface[j]):land?vertical(h)*S((cover-.49)/.25):-.035;
 // The fine catchment is visible in the research view. Inland pond depth is
 // diagnostic, not yet a navigable lake in the simulation's coarse contract.
 const flow=g.flow[j]/(r*r),channel=stage?1:land&&flow>58?-.025:land&&flow>25?.035:1,forest=S((wet-.45)/.24)*(1-S((h-.46)/.24));v.set([X,Y,e,h,wet,m.fert[k],forest,cover,channel],i*9);z[i]=e;if(land){minH=Math.min(minH,h);maxH=Math.max(maxH,h);}
 }const t=performance.now();if(t-last>=6){maxSlice=Math.max(maxSlice,t-last);await sleep();last=performance.now();}}
 const center=datum??0;
 return {vertices:v,elevations:z,indices:new Uint32Array(0),cols,rows,detail:r,bounds:[x0,y0,x1,y1],center,stats:{ms:performance.now()-start,maxSlice:Math.max(maxSlice,performance.now()-last),minH,maxH,anchorError:0,bytes:v.byteLength+z.byteLength}};
}
export async function legacySource(s,cam,bounds){return prepareTerrain(s,cam,{detail:4,heightStyle:'smooth',textureOnly:true,boundsOverride:bounds});}
export function diagnostics(m,W,H){
 let land=0,mountain=0,hill=0,river=0,passes=0,lakes=0,up=0,terminal=0,interiorTerminal=0,resources=Array(9).fill(0);const g=m.geography;let fineUp=0,fineRivers=0,fineLakes=0,bytes=0;
 for(let i=0;i<W*H;i++){if(!m.land[i])continue;land++;mountain+=+(m.terrain[i]===4);hill+=+(m.terrain[i]===3);river+=m.river[i];passes+=m.pass[i];lakes+=+(m.lakeDepth?.[i]>.02);if(m.resource[i]>=0)resources[m.resource[i]]++;const j=m.down[i];if(j>=0){if(m.height[j]>=m.height[i])up++;}else{terminal++;if(i%W!==0&&i%W!==W-1&&i>=W&&i<W*(H-1))interiorTerminal++;}}
 if(g){for(let i=0;i<g.land.length;i++)if(g.land[i]){const j=g.down[i];if(j>=0&&g.surface[j]>=g.surface[i])fineUp++;fineRivers+=+(g.flow[i]>58*g.detail*g.detail);fineLakes+=+(g.lake[i]>.02);}bytes=Object.values(g).filter(ArrayBuffer.isView).reduce((n,v)=>n+v.byteLength,0);}
 return {land,mountain,hill,river,passes,lakes,up,terminal,interiorTerminal,resources,fineUp,fineRivers,fineLakes,bytes,chains:g?.chains.length,erosion:g?.erosion};
}
export function diagnosticCanvas(m,W,H,kind){
 const canvas=document.createElement('canvas');canvas.width=W*4;canvas.height=H*4;const c=canvas.getContext('2d'),im=c.createImageData(W,H),p=im.data,colors=[[0,0,0],[151,156,82],[60,105,55],[156,126,87],[197,191,177],[76,129,121],[184,165,105]];
 for(let i=0;i<W*H;i++){const x=i%W,y=Math.floor(i/W),h=m.height[i],j=i*4;let a=[38,72,91];if(m.land[i]){
 if(kind==='height'){const q=C((h-.12)/.65);a=[60+q*180,91+q*147,56+q*185];}
 else if(kind==='slope'){const dx=m.height[y*W+C(x+1,0,W-1)]-m.height[y*W+C(x-1,0,W-1)],dy=m.height[C(y+1,0,H-1)*W+x]-m.height[C(y-1,0,H-1)*W+x],q=C(Math.hypot(dx,dy)*4);a=[48+q*200,65+q*110,65+q*25];}
 else if(kind==='basin'){let h=Math.imul(m.basin[i]+31,2654435761)>>>0;a=[65+(h&127),70+((h>>>8)&127),80+((h>>>16)&127)];if(m.river[i])a=[44,112,173];}
 else a=colors[m.terrain[i]]||[200,0,0];}
 p.set([...a,255],j);}
 const low=document.createElement('canvas');low.width=W;low.height=H;low.getContext('2d').putImageData(im,0,0);c.imageSmoothingEnabled=false;c.drawImage(low,0,0,canvas.width,canvas.height);return canvas;
}
