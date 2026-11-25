// Isolated art studies. A reconstructed height field, not a modified simulation.
import {livingLand} from './landscape-surface.mjs';
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)},mix=(a,b,t)=>a.map((v,i)=>L(v,b[i],t));
function hash(x,y){let n=Math.imul(x+631,374761393)^Math.imul(y+289,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=S(x-i),v=S(y-j);return L(L(hash(i,j),hash(i+1,j),u),L(hash(i,j+1),hash(i+1,j+1),u),v);}
const cubic=(a,b,c,d,t)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
function base(m,x,y){const u=x-.5,v=y-.5,i=Math.floor(u),j=Math.floor(v),p=u-i,q=v-j,mid=m.sample(x,y,'height');if(mid===null)return null;const rows=[];let lo=mid,hi=mid;for(let a=-1;a<=2;a++){const r=[];for(let b=-1;b<=2;b++){const id=m.at(i+b,j+a),h=id>=0&&m.known[id]?m.m.height[id]:mid;r.push(h);lo=Math.min(lo,h);hi=Math.max(hi,h);}rows.push(cubic(...r,p));}return {z:C(cubic(...rows,q),lo,hi),lo,hi};}
export function reconstruct(m,x,y,kind='ridges'){
 const v=base(m,x,y);if(!v)return 0;const z=v.z,i=m.at(Math.floor(x),Math.floor(y));if(i<0||!m.known[i]||!m.m.land[i])return z;
 const ridge=m.sample(x,y,'ridge')??.35,gate=S((z-.34)/.15),range=v.hi-v.lo;
 // A sub-cell relief residual, zero at the exact simulation sample. Mountain
 // microgeometry is limited by the local height envelope, not arbitrary peaks.
 const dx=x-(Math.floor(x)+.5),dy=y-(Math.floor(y)+.5),anchored=S(Math.min(1,Math.hypot(dx,dy)*3.1));
 const a=x+.38*(noise(x*.8,y*.8)-.5),b=y+.38*(noise(x*.8+61,y*.8-22)-.5);
 let detail=0;
 if(kind==='ridges'){
  const r=(u,v)=>1-Math.abs(2*noise(u,v)-1);
  const r1=r(a*2.5,b*2.5),r2=r(a*5.4+13,b*5.4-9),r3=r(a*11.2-7,b*11.2+15);
  detail=(r1*r1-.39)*.58+(r2*r2-.39)*.29+(r3*r3-.39)*.13;
 }else{
  // Rock gullies follow a local downhill axis derived from known heights.
  const gx=(m.sample(x+.6,y,'height')??z)-(m.sample(x-.6,y,'height')??z),gy=(m.sample(x,y+.6,'height')??z)-(m.sample(x,y-.6,'height')??z),len=Math.hypot(gx,gy)||1,along=(a*gx+b*gy)/len,across=(-a*gy+b*gx)/len;
  const g=1-Math.abs(2*noise(across*4.2,along*.95)-1),f=1-Math.abs(2*noise(across*10.8+8,along*2.6)-1);
  detail=(g*g-.40)*.72+(f*f-.40)*.28;
 }
 const amplitude=Math.min(.105,range*.58)*gate*(.68+.32*ridge)*anchored;
 return C(z+detail*amplitude,v.lo,v.hi);
}
const pause=()=>new Promise(r=>setTimeout(r,0));
export async function prepareUrbanSurface(m,bounds,res,political,owners,kind='ridges',network=[]){
 const [x0,y0,x1,y1]=bounds,w=(x1-x0)*res,h=(y1-y0)*res,n=w*h,a=document.createElement('canvas');a.width=w;a.height=h;const c=a.getContext('2d'),im=c.createImageData(w,h),d=im.data;
 const start=performance.now();let last=start,maxSlice=0,compute=0;const yieldIf=async()=>{const now=performance.now();if(now-last>=6){maxSlice=Math.max(maxSlice,now-last);compute+=now-last;await pause();last=performance.now();}};
 const H=new Float32Array(n),Z=new Float32Array(n),land=new Float32Array(n),wet=new Float32Array(n),fert=new Float32Array(n),temp=new Float32Array(n),forest=new Float32Array(n),valley=new Float32Array(n);
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,wx=x0+(x+.5)/res,wy=y0+(y+.5)/res,l=livingLand(m,wx,wy);land[i]=l??-1;if(l===null)continue;H[i]=reconstruct(m,wx,wy,kind);Z[i]=m.sample(wx,wy,'height')??0;wet[i]=m.sample(wx,wy,'moisture')??.5;fert[i]=m.sample(wx,wy,'fert')??.5;temp[i]=m.sample(wx,wy,'temperature')??.5;forest[i]=m.sample(wx,wy,'forest')??0;}await yieldIf();}
 // A distance field from the actual visible river graph: wet banks and
 // alluvial soils form a continuous part of the terrain, not a second river.
 for(const e of network){const band=Math.min(.48,.12+e.width*2.6);for(const p of e.points){if(p[0]<x0-band||p[0]>x1+band||p[1]<y0-band||p[1]>y1+band)continue;const X=(p[0]-x0)*res-.5,Y=(p[1]-y0)*res-.5,b=band*res;for(let y=Math.max(0,Math.floor(Y-b));y<=Math.min(h-1,Math.ceil(Y+b));y++)for(let x=Math.max(0,Math.floor(X-b));x<=Math.min(w-1,Math.ceil(X+b));x++){const i=y*w+x;if(land[i]>.5)valley[i]=Math.max(valley[i],S(1-Math.hypot(x-X,y-Y)/b));}}await yieldIf();}
 const get=(x,y,z)=>{x=C(x,0,w-1);y=C(y,0,h-1);const i=y*w+x;return land[i]>=0?H[i]:z;};
 const step=Math.max(1,Math.round(res*.24)),wide=Math.max(step+1,Math.round(res*.90));
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,k=i*4,z=H[i],base=Z[i],l=land[i],wx=x0+(x+.5)/res,wy=y0+(y+.5)/res;let col=[222,211,181];if(l>=0){
 const dx=(get(x+step,y,z)-get(x-step,y,z))*res/(2*step),dy=(get(x,y+step,z)-get(x,y-step,z))*res/(2*step),bx=(get(x+wide,y,z)-get(x-wide,y,z))*res/(2*wide),by=(get(x,y+wide,z)-get(x,y-wide,z))*res/(2*wide);
 const gx=(dx*.84+bx*.16)*35,gy=(dy*.84+by*.16)*35,norm=Math.hypot(gx,gy,1),sun=(gx*.61+gy*.53+.59)/norm,slope=Math.hypot(gx,gy),alpine=S((base-.36)/.20);
 let horizon=0;for(const k of [1,3,6,10,16]){const n=Math.max(1,Math.round(k*res*.10));horizon=Math.max(horizon,(get(x-n,y-n,z)-z)/(n/res*Math.SQRT2)*35);}
 const cast=S((horizon-.67)/1.35)*.30*alpine,ambient=L(.79,.53,alpine),lit=C(ambient+Math.max(0,sun)*(.33+.32*alpine)-cast,.30,1.23);
 const broad=noise(wx*.38+11,wy*.38),medium=noise(wx*1.8+9,wy*1.8-14),fine=noise(wx*6.2,wy*6.2),stone=S((base-.41)/.15)*S(slope/1.6);
 let ground=mix([176,160,104],[105,143,83],C(wet[i]*.57+fert[i]*.30+broad*.13));ground=mix(ground,[91,116,65],S(forest[i])*.67);ground=mix(ground,[139,128,96],S((base-.36)/.17));ground=mix(ground,[194,185,160],stone);ground=mix(ground,[231,226,212],S((base-.60)/.17)*(.65+.35*(1-temp[i])));ground=mix(ground,[112,145,91],valley[i]*.38*(1-alpine*.6));
 const texture=(broad-.5)*10+(medium-.5)*12+(fine-.5)*(4+stone*9);ground=ground.map(v=>v*lit+texture);
 const depth=S(l/.48),wave=(noise(wx*.65+18,wy*2.1)-.5)*7+(noise(wx*2,wy*8)-.5)*3,water=mix([37,76,95],[114,160,153],depth).map(v=>v+wave);
 col=mix(water,ground,S((l-.484)/.035));col=mix(col,[203,190,149],(1-S(Math.abs(l-.50)/.024))*.50);
 if(political&&l>.56){const f=m.own[m.at(Math.floor(wx),Math.floor(wy))];if(f>=0&&owners[f])col=mix(col,owners[f],.07);}
 }d[k]=col[0];d[k+1]=col[1];d[k+2]=col[2];d[k+3]=255;}await yieldIf();}
 c.putImageData(im,0,0);maxSlice=Math.max(maxSlice,performance.now()-last);compute+=performance.now()-last;return {canvas:a,ms:performance.now()-start,compute,maxSlice,kind};
}
export function inspectDrainage(m){
 const exits=[],counts={boundary:0,interior:0,invalidNeighbor:0,hidden:0},N=m.known.length,W=m.width,H=m.height;
 for(let i=0;i<N;i++){if(!m.known[i]||!m.m.river[i])continue;const j=m.m.down[i],x=i%W,y=Math.floor(i/W);if(j<0){const boundary=x===0||x===W-1||y===0||y===H-1;counts[boundary?'boundary':'interior']++;exits.push({i,x,y,flow:m.m.flow[i],height:m.m.height[i],kind:boundary?'world-boundary-outlet':'interior-terminal'});}else if(j>=N||Math.abs(j%W-x)>1||Math.abs(Math.floor(j/W)-y)>1)counts.invalidNeighbor++;else if(!m.known[j])counts.hidden++;}
 return {counts,exits};
}
