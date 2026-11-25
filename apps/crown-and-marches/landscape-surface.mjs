import {W,H,xx,yy,idx,clamp} from './world.mjs';
const lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)},rnd=(x,y)=>{let n=Math.imul(x+853,374761393)^Math.imul(y+123,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),a=smooth(x-i),b=smooth(y-j);return lerp(lerp(rnd(i,j),rnd(i+1,j),a),lerp(rnd(i,j+1),rnd(i+1,j+1),a),b);}
const cubic=(a,b,c,d,t)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
// Bicubic reconstruction of the existing elevation field. No invented peaks:
 // clamp interpolated heights to the surrounding surveyed samples.
function height(m,x,y){const u=x-.5,v=y-.5,i=Math.floor(u),j=Math.floor(v),p=u-i,q=v-j,base=m.sample(x,y,'height');if(base===null)return null;let lo=Infinity,hi=-Infinity;const a=[];for(let dy=-1;dy<=2;dy++){const row=[];for(let dx=-1;dx<=2;dx++){const id=m.at(i+dx,j+dy),n=id>=0&&m.known[id]?m.m.height[id]:base;row.push(n);lo=Math.min(lo,n);hi=Math.max(hi,n);}a.push(cubic(...row,p));}return clamp(cubic(...a,q),lo,hi);}
export function livingLand(m,x,y){const i=m.at(Math.floor(x),Math.floor(y));if(i<0||!m.known[i])return null;const l=m.sample(x,y,'land');if(l===null)return null;return clamp(l+(noise(x*1.6+9,y*1.6)-.5)*.20,0,1);}
const palette=[[164,166,107],[118,145,100],[77,115,79],[155,135,108],[216,203,177],[240,233,211]];
const mix=(a,b,t)=>a.map((v,k)=>lerp(v,b[k],t));
const pause=()=>new Promise(r=>setTimeout(r,0));
// Yield between small stripes. Snapshot sampled values, not hidden world data.
export async function prepareLivingSurface(m,bounds,res,political,paletteByOwner){
 const [x0,y0,x1,y1]=bounds,a=document.createElement('canvas');a.width=(x1-x0)*res;a.height=(y1-y0)*res;const q=a.getContext('2d'),im=q.createImageData(a.width,a.height),d=im.data,w=a.width,h=a.height,n=w*h;
 const start=performance.now();let maxSlice=0,compute=0,last=performance.now();const yieldIf=async()=>{const now=performance.now();if(now-last>=7){maxSlice=Math.max(maxSlice,now-last);compute+=now-last;await pause();last=performance.now();}};
 const heights=new Float32Array(n),land=new Float32Array(n),wet=new Float32Array(n),fert=new Float32Array(n),temp=new Float32Array(n),forest=new Float32Array(n);
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,wx=x0+(x+.5)/res,wy=y0+(y+.5)/res,l=livingLand(m,wx,wy);land[i]=l??-1;if(l===null)continue;heights[i]=height(m,wx,wy)??0;wet[i]=m.sample(wx,wy,'moisture')??.5;fert[i]=m.sample(wx,wy,'fert')??.5;temp[i]=m.sample(wx,wy,'temperature')??.5;forest[i]=m.sample(wx,wy,'forest')??0;}await yieldIf();}
 const get=(x,y,fallback)=>{x=clamp(x,0,w-1);y=clamp(y,0,h-1);const i=y*w+x;return land[i]>=0?heights[i]:fallback;};
 // Broad-slope normals and a small directional horizon shadow. Texture
 // follows actual elevation and moisture; random fine detail is suppressed.
 const step=Math.max(1,Math.round(res*.72)),big=Math.max(step+1,Math.round(res*2.2));
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,k=i*4,wx=x0+(x+.5)/res,wy=y0+(y+.5)/res,l=land[i],z=heights[i];let col=[222,211,181];if(l>=0){
 const dx=(get(x+step,y,z)-get(x-step,y,z))*res/(2*step),dy=(get(x,y+step,z)-get(x,y-step,z))*res/(2*step),bx=(get(x+big,y,z)-get(x-big,y,z))*res/(2*big),by=(get(x,y+big,z)-get(x,y-big,z))*res/(2*big),gx=(dx*.72+bx*.28)*38,gy=(dy*.72+by*.28)*38;
 const n=Math.hypot(gx,gy,1),sun=(gx*.58+gy*.48+.66)/n,contrast=clamp((sun-.66)*.70,-.43,.32),slope=Math.hypot(gx,gy),shadow=Math.max(0,get(x-big,y-big,z)-z-.026);
 let ground=mix(palette[0],palette[1],smooth(wet[i]*.62+fert[i]*.38));ground=mix(ground,palette[2],smooth(forest[i])*.72);ground=mix(ground,palette[3],smooth((z-.34)/.17));ground=mix(ground,palette[4],smooth((z-.46)/.17)*smooth(slope*.7));ground=mix(ground,palette[5],smooth((z-.62)/.13)*(.75+.25*(1-temp[i])));
 const tex=(noise(wx*2.3,wy*2.3)-.5)*3;ground=ground.map(v=>v*(1+contrast-Math.min(.15,shadow*1.8))+tex);
 const depth=smooth(l/.48),wave=(noise(wx*.65+18,wy*1.8)-.5)*5;let water=mix([34,72,92],[103,150,147],depth);water=water.map(v=>v+wave);col=mix(water,ground,smooth((l-.47)/.065));const shore=1-smooth(Math.abs(l-.50)/.035);col=mix(col,[211,197,157],shore*.56);
 if(political&&l>.56){const f=m.own[m.at(Math.floor(wx),Math.floor(wy))];if(f>=0&&paletteByOwner[f])col=mix(col,paletteByOwner[f],.085);}
 }d[k]=col[0];d[k+1]=col[1];d[k+2]=col[2];d[k+3]=255;}await yieldIf();}
 q.putImageData(im,0,0);maxSlice=Math.max(maxSlice,performance.now()-last);compute+=performance.now()-last;return {canvas:a,ms:performance.now()-start,compute,maxSlice};
}
export function riverAudit(m){const indegree=new Int16Array(W*H);let edges=0,mouths=0,invalid=0,nonDescending=0,parallel=0,unknown=0;for(let i=0;i<m.known.length;i++){if(!m.known[i]||!m.m.river[i])continue;const j=m.m.down[i];if(j<0){invalid++;continue;}if(!m.known[j]){unknown++;continue;}edges++;if(!m.m.land[j])mouths++;else if(m.m.height[j]>=m.m.height[i])nonDescending++;if(Math.abs(xx(i)-xx(j))>1||Math.abs(yy(i)-yy(j))>1)invalid++;indegree[j]++;for(const k of [i+1,i+W]){if(k>=m.known.length||!m.known[k]||!m.m.river[k])continue;const q=m.m.down[k];if(q>=0&&m.known[q]&&xx(j)-xx(i)===xx(q)-xx(k)&&yy(j)-yy(i)===yy(q)-yy(k))parallel++;}}return {edges,mouths,invalid,nonDescending,parallel,unknown,confluences:Array.from(indegree).filter(n=>n>1).length};}
export function livingRivers(m){
 const incoming=new Map(),edges=[],center=i=>[xx(i)+.5,yy(i)+.5];for(let i=0;i<m.known.length;i++){if(!m.known[i]||!m.m.river[i])continue;const j=m.m.down[i];if(j<0||!m.known[j])continue;edges.push([i,j]);const p=incoming.get(j);if(p===undefined||m.m.flow[i]>m.m.flow[p])incoming.set(j,i);}
 const node=i=>{const [x,y]=center(i);if(m.s.bridge?.[i]||!m.m.land[i])return [x,y];const dx=(rnd(i,17)-.5)*.16,dy=(rnd(i,31)-.5)*.16;return livingLand(m,x+dx,y+dy)>.62?[x+dx,y+dy]:[x,y];};
 const out=[];
 for(const [i,j] of edges){const a=node(i),b=node(j),pre=incoming.get(i),post=m.m.down[j],p=pre!==undefined?node(pre):[2*a[0]-b[0],2*a[1]-b[1]],n=post>=0&&m.known[post]?node(post):[2*b[0]-a[0],2*b[1]-a[1]],dx=b[0]-a[0],dy=b[1]-a[1],bend=(rnd(i,j)-.5)*.24,points=[],mouth=!m.m.land[j];
 const u=[a[0]+(b[0]-p[0])*.18-dy*bend,a[1]+(b[1]-p[1])*.18+dx*bend],v=[b[0]-(n[0]-a[0])*.18-dy*bend,b[1]-(n[1]-a[1])*.18+dx*bend];
 let failed=false;for(let k=0;k<=20;k++){const t=k/20,z=1-t,x=z*z*z*a[0]+3*z*z*t*u[0]+3*z*t*t*v[0]+t*t*t*b[0],y=z*z*z*a[1]+3*z*z*t*u[1]+3*z*t*t*v[1]+t*t*t*b[1],l=livingLand(m,x,y);if(l===null||l<.50){if(!mouth){failed=true;break;}if(points.length){const prev=points.at(-1);let lo=0,hi=1;for(let r=0;r<12;r++){const f=(lo+hi)/2;if((livingLand(m,lerp(prev[0],x,f),lerp(prev[1],y,f))??0)>=.50)lo=f;else hi=f;}points.push([lerp(prev[0],x,lo),lerp(prev[1],y,lo)]);}break;}points.push([x,y]);}
 // Preserve the actual known graph rather than inventing a detour; report
 // clipped segments to reviewers if no admissible curve can be formed.
 if(failed){points.length=0;for(let k=0;k<=20;k++){const t=k/20,x=lerp(a[0],b[0],t),y=lerp(a[1],b[1],t);if((livingLand(m,x,y)??0)<.50)break;points.push([x,y]);}}
 if(points.length>1)out.push({i,j,points,width:clamp(Math.sqrt(m.m.flow?.[i]||60)*.0032,.020,.115),mouth,clipped:!mouth&&Math.hypot(points.at(-1)[0]-b[0],points.at(-1)[1]-b[1])>.03});}
 return out;
}
