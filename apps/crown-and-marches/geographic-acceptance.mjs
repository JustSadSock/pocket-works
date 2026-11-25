// Acceptance-only adapter. A single canonical world domain makes selection,
// watershed propagation and finite filtering independent of viewport requests.
// No streaming system and no campaign hook. The expensive world snapshot is
// intentionally measured before considering this as a production solution.
import {snapshot} from './geographic-synthesis.mjs';
import {model} from './geography-review.mjs';
const MAX_BYTES=48*1024*1024,cache=new Map();
let resident=0;
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
export function clearAcceptanceCache(){cache.clear();resident=0;}
export async function canonicalSnapshot(s,cam){
 const m=model(s),begin=performance.now(),snap=await snapshot(s,{...cam,x:m.width/2,y:m.height/2},{bounds:[0,0,m.width,m.height]});
 // Datum is camera-independent. Only known data appears in the snapshot.
 snap.base.center=0;
 const t=performance.now(),parts=[];for(const key of ['z','weight','kind','anchor','channels','flow'])parts.push(await hash(snap.input[key]));
 snap.contentKey=[m.width,m.height,snap.input.res,...parts].join(':');
 snap.hashMs=performance.now()-t;snap.snapshotMs=performance.now()-begin;return snap;
}
export async function canonicalHeight(snap,library,approach,mode,{bypass=false}={}){
 const start=performance.now(),key=[snap.contentKey,approach,mode,...library.map(d=>d.metadata.sampleSha256)].join(':');let entry=cache.get(key),hit=!!entry&&!bypass,transferMs=0;
 if(hit){cache.delete(key);cache.set(key,entry);}
 else{
 const worker=new Worker(new URL('./geographic-synthesis-worker.mjs',import.meta.url),{type:'module'});try{entry=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Canonical worker timeout')),180000);worker.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};const t=performance.now();worker.postMessage({input:snap.input,library,approach,mode});transferMs=performance.now()-t;});}finally{worker.terminate();}
 if(entry.stats.protectedChanges||mode==='strict'&&entry.stats.maxAnchor!==0)throw Error('Canonical protection failed');
 if(!bypass&&entry.result.byteLength<=MAX_BYTES){while(resident+entry.result.byteLength>MAX_BYTES&&cache.size){const k=cache.keys().next().value;resident-=cache.get(k).result.byteLength;cache.delete(k);}cache.set(key,entry);resident+=entry.result.byteLength;}
 }
 return {z:entry.result,stats:{...entry.stats,cacheHit:hit,requestMs:performance.now()-start,transferMs,cacheBytes:resident,cacheEntries:cache.size,geometryBytes:entry.result.byteLength,inputBytes:Object.values(snap.input).reduce((n,v)=>n+(ArrayBuffer.isView(v)?v.byteLength:0),0),libraryBytes:library.reduce((n,d)=>n+d.metres.byteLength,0)}};
}
export function cropCanonical(snap,output,bounds){
 const b=snap.base,res=b.detail,[x0,y0,x1,y1]=bounds,[ox,oy,ex,ey]=b.bounds;
 if(x0<ox||y0<oy||x1>ex||y1>ey||x1<=x0||y1<=y0)throw Error('Invalid crop');
 const cols=(x1-x0)*res+1,rows=(y1-y0)*res+1,v=new Float32Array(cols*rows*9),z=new Float32Array(cols*rows),X=(x0-ox)*res,Y=(y0-oy)*res;
 for(let y=0;y<rows;y++){const i=(Y+y)*b.cols+X,j=y*cols;v.set(b.vertices.subarray(i*9,(i+cols)*9),j*9);z.set(output.z.subarray(i,i+cols),j);for(let x=0;x<cols;x++)v[(j+x)*9+2]=z[j+x];}
 return {...b,bounds,cols,rows,vertices:v,elevations:z,stats:{...b.stats,...output.stats,ms:output.stats.requestMs,bytes:v.byteLength+z.byteLength}};
}
// Compare global coordinates and both sides of all tile boundaries. Exclude
// halo for baked shadows (maximum ray length 7.4 cells).
export function compareOverlap(a,b,A,B,margin=0){
 const r=a.detail;if(r!==b.detail)throw Error('Resolution mismatch');
 const x0=Math.max(a.bounds[0],b.bounds[0])+margin,y0=Math.max(a.bounds[1],b.bounds[1])+margin,x1=Math.min(a.bounds[2],b.bounds[2])-margin,y1=Math.min(a.bounds[3],b.bounds[3])-margin;
 if(x1<x0||y1<y0)throw Error('Empty overlap');
 let count=0,changed=0,max=0,peakMismatch=0;
 const at=(s,x,y)=>Math.round((y-s.bounds[1])*r)*s.cols+Math.round((x-s.bounds[0])*r);
 const peak=(s,z,i)=>i%s.cols>0&&i%s.cols<s.cols-1&&i>=s.cols&&i<z.length-s.cols&&[i-1,i+1,i-s.cols,i+s.cols,i-s.cols-1,i-s.cols+1,i+s.cols-1,i+s.cols+1].every(j=>z[i]>z[j]);
 for(let Y=Math.round(y0*r);Y<=Math.round(y1*r);Y++)for(let X=Math.round(x0*r);X<=Math.round(x1*r);X++){const i=at(a,X/r,Y/r),j=at(b,X/r,Y/r);if(i<0||j<0||i>=A.length||j>=B.length)continue;const d=Math.abs(A[i]-B[j]);count++;changed+=+(d>1e-6);max=Math.max(max,d);if(X>x0*r&&X<x1*r&&Y>y0*r&&Y<y1*r)peakMismatch+=+(peak(a,A,i)!==peak(b,B,j));}
 return {count,changed,max,peakMismatch};
}
export function compareBytes(a,b){if(a.length!==b.length)throw Error('Array size mismatch');let count=0;for(let i=0;i<a.length;i++)count+=+(a[i]!==b[i]);return count;}
export function slopeAudit(source,base){
 const {cols:w,rows:h,detail:r,elevations:z,bounds}=source,a=base.elevations,top=[];let steepened=0,changed=0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,s=q=>Math.hypot(q[i+1]-q[i-1],q[i+w]-q[i-w])*r*.5,before=s(a),after=s(z),delta=after-before;if(Math.abs(delta)>1e-6)changed++;if(after>3&&delta>2)steepened++;if(top.length<12||delta>top.at(-1).delta){top.push({x:bounds[0]+x/r,y:bounds[1]+y/r,before,after,delta,heightDelta:z[i]-a[i]});top.sort((a,b)=>b.delta-a.delta);if(top.length>12)top.pop();}}
 return {steepened,changed,top};
}
