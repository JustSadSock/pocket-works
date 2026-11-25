// Experimental adapter. Authoritative world state is never handed to a worker.
import {prepareTerrain} from './world-rendering-gl.mjs';
import {model} from './geography-review.mjs';
import {terrainMetrics} from './terrain-art-lab.mjs';
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),S=x=>{x=C(x);return x*x*(3-2*x)};
const sleep=()=>new Promise(r=>setTimeout(r,0));
export async function snapshot(s,cam,{bounds=null}={}){
 const begin=performance.now(),base=await prepareTerrain(s,cam,{detail:8,heightStyle:'smooth',textureOnly:true,boundsOverride:bounds}),m=model(s),w=base.cols,h=base.rows,res=base.detail,n=w*h,weight=new Float32Array(n),kind=new Uint8Array(n),anchor=new Uint8Array(n),channels=new Uint8Array(n),flow=new Float32Array(n),safe=new Uint8Array(m.known.length);let last=performance.now(),maxSlice=base.stats.maxSlice;
 for(let i=0;i<safe.length;i++){if(!m.known[i])continue;const visible=m.fresh[i];safe[i]=+(m.m.pass[i]||visible&&(s.road?.[i]||s.bridge?.[i]||s.admin?.[i]>=0&&m.cities.some(c=>c.i===i)));}
 const sites=m.cities.filter(c=>m.known[c.i]).map(c=>[c.i%m.width+.5,Math.floor(c.i/m.width)+.5]);
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const k=y*w+x,o=k*9,X=base.vertices[o],Y=base.vertices[o+1],i=m.at(Math.floor(X),Math.floor(Y)),land=base.vertices[o+7],river=base.vertices[o+8];anchor[k]=+(x%res===res/2&&y%res===res/2);
 if(i<0||!m.known[i]||river>1.5){weight[k]=-1;continue;}kind[k]=m.m.terrain[i];flow[k]=m.m.flow[i];channels[k]=+(m.m.land[i]&&river<=.025);const down=m.m.down[i];if(m.m.land[i]&&m.m.flow[i]>36&&down>=0&&m.known[down]&&m.m.land[down]){const ax=i%m.width+.5,ay=Math.floor(i/m.width)+.5,bx=down%m.width+.5,by=Math.floor(down/m.width)+.5,dx=bx-ax,dy=by-ay,t=C(((X-ax)*dx+(Y-ay)*dy)/(dx*dx+dy*dy||1));if(Math.hypot(X-ax-dx*t,Y-ay-dy*t)<.09)channels[k]=1;}
 if(!m.m.land[i]){weight[k]=-1;continue;}if(safe[i]||sites.some(p=>Math.hypot(X-p[0],Y-p[1])<.8)||land<.70||river<.13)continue;
 // Hard freeze all border samples in the outer half cell and unknown
 // neighbourhoods. No imported mountain can reveal hidden land.
 let nearest=2;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const j=m.at(Math.floor(X)+dx,Math.floor(Y)+dy);if(j<0||!m.known[j]||!m.m.land[j]||safe[j]){const ax=Math.floor(X)+dx,ay=Math.floor(Y)+dy;nearest=Math.min(nearest,Math.hypot(Math.max(ax-X,0,X-ax-1),Math.max(ay-Y,0,Y-ay-1)));}}
 const strength=kind[k]===4?1:kind[k]===3?.70:0;weight[k]=strength*S(nearest/.65)*S((land-.70)/.23)*S((river-.13)/.45);
 }const now=performance.now();if(now-last>=6){maxSlice=Math.max(maxSlice,now-last);await sleep();last=performance.now();}}
 return {base,input:{w,h,res,z:base.elevations,weight,kind,anchor,channels,flow,origin:base.bounds.slice(0,2)},stats:{ms:performance.now()-begin,maxSlice:Math.max(maxSlice,performance.now()-last)}};
}
const cache=new WeakMap();
export async function makeSynthesis(snap,library,approach,mode){
 let entries=cache.get(snap);if(!entries){entries=new Map();cache.set(snap,entries);}const key=approach+':'+mode;if(entries.has(key))return {...entries.get(key),cacheHit:true};
 const start=performance.now(),worker=new Worker(new URL('./geographic-synthesis-worker.mjs',import.meta.url),{type:'module'});let messageMs=0;const result=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Synthesis worker timeout')),120000);worker.onmessage=e=>{clearTimeout(timeout);e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};const t=performance.now();worker.postMessage({input:snap.input,library,approach,mode});messageMs=performance.now()-t;}).finally(()=>worker.terminate());
 const b=snap.base,v=b.vertices.slice(),z=result.result;let last=performance.now(),maxSlice=messageMs;for(let y=0;y<b.rows;y++){for(let x=0;x<b.cols;x++){const i=y*b.cols+x;v[i*9+2]=z[i];}const n=performance.now();if(n-last>=6){maxSlice=Math.max(maxSlice,n-last);await sleep();last=performance.now();}}
 if(result.stats.protectedChanges||mode==='strict'&&result.stats.maxAnchor>1e-6)throw Error('Geographic protection failed');
 const output={...b,vertices:v,elevations:z,stats:{...b.stats,...result.stats,ms:snap.stats.ms+performance.now()-start,maxSlice:Math.max(snap.stats.maxSlice,maxSlice,performance.now()-last),messageMs,cacheHit:false}};entries.set(key,output);return output;
}
// Common 24 km square, 125 m grid. Normalization is by within-window range,
// not by unrelated global elevations. Game cells are assumed 1 km for study.
export async function commonMetrics(a,w,h,res,cx,cy){
 const size=24*8+1,out=new Float32Array(size*size),step=res/8;
 if(cx-12*res<0||cy-12*res<0||cx+12*res>=w||cy+12*res>=h)throw Error('Common metric crop outside source');
 let lo=Infinity,hi=-Infinity;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=Math.round(cy+(y-96)*step)*w+Math.round(cx+(x-96)*step),v=a[i];out[y*size+x]=v;lo=Math.min(lo,v);hi=Math.max(hi,v);}
 for(let i=0;i<out.length;i++)out[i]=(out[i]-lo)/Math.max(1e-9,hi-lo);
 const metrics=await terrainMetrics(out,size,size,.125);const ridge=new Uint8Array(out.length),valley=new Uint8Array(out.length),slopeBins=[0,0,0,0],reliefBins=[0,0,0,0];for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){const i=y*size+x,z=out[i],dx=(out[i+1]-out[i-1])*4,dy=(out[i+size]-out[i-size])*4,d=Math.hypot(dx,dy),curv=(out[i+1]+out[i-1]+out[i+size]+out[i-size]-4*z);slopeBins[d<.05?0:d<.15?1:d<.35?2:3]++;reliefBins[Math.min(3,Math.floor(z*4))]++;ridge[i]=+(curv<-.004);valley[i]=+(curv>.004);}const components=mask=>{const seen=new Uint8Array(mask.length),sizes=[];for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;const q=[i];seen[i]=1;for(let k=0;k<q.length;k++){const j=q[k],x=j%size,y=Math.floor(j/size);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const X=x+dx,Y=y+dy,t=Y*size+X;if(X<0||Y<0||X>=size||Y>=size||!mask[t]||seen[t])continue;seen[t]=1;q.push(t);}}sizes.push(q.length);}return {count:sizes.length,largest:Math.max(0,...sizes),samples:sizes.reduce((a,b)=>a+b,0)};};return {...metrics,rawRange:[lo,hi],spanKm:24,stepKm:.125,grid:size,slopeBins,reliefBins,ridges:components(ridge),valleys:components(valley),curvatureThreshold:.004};
}
