// Pure geography synthesis. Input contains only charted terrain and protected
// visible infrastructure; no simulation object or hidden geographic values.
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)};
const at=(a,w,h,x,y)=>a[C(y,0,h-1)*w+C(x,0,w-1)];
function sample(a,w,h,x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j;return L(L(at(a,w,h,i,j),at(a,w,h,i+1,j),u),L(at(a,w,h,i,j+1),at(a,w,h,i+1,j+1),u),v);}
function hash(x,y){let n=Math.imul(x+731,374761393)^Math.imul(y+541,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function blur(a,w,h,r){const b=new Float32Array(a.length),c=new Float32Array(a.length);for(let y=0;y<h;y++){let sum=0;for(let i=-r;i<=r;i++)sum+=at(a,w,h,i,y);for(let x=0;x<w;x++){b[y*w+x]=sum/(2*r+1);sum+=at(a,w,h,x+r+1,y)-at(a,w,h,x-r,y);}}for(let x=0;x<w;x++){let sum=0;for(let i=-r;i<=r;i++)sum+=at(b,w,h,x,i);for(let y=0;y<h;y++){c[y*w+x]=sum/(2*r+1);sum+=at(b,w,h,x,y+r+1)-at(b,w,h,x,y-r);}}return c;}
function descriptors(a,w,h,x,y,r){const p=[];let sum=0;for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const v=sample(a,w,h,x+i*r/2,y+j*r/2);p.push(v);sum+=v;}const mean=sum/p.length,sd=Math.sqrt(p.reduce((s,v)=>s+(v-mean)**2,0)/p.length)||.0001;return {p:p.map(v=>(v-mean)/sd),sd,mean};}
function patchSynthesis(input,library){
 const {w,h,res,z,weight,kind,origin}=input,n=w*h,out=new Float32Array(n),sum=new Float32Array(n),catalog=[];
 // Candidate footprints span 12 or 20 km, not individual game cells.
 // Extract two bands of real terrain (trend-free elevation and local relief).
 for(const d of library){const a=Float32Array.from(d.metres,v=>v/1000*2.5),N=d.size,coarse=blur(a,N,N,Math.round(d.detail*3));for(const R of [6,10])for(let y=R+2;y<=48-R-2;y+=8)for(let x=R+2;x<=48-R-2;x+=8){const desc=descriptors(a,N,N,x*d.detail,y*d.detail,R*d.detail);if(desc.sd<.04)continue;catalog.push({id:d.id,a,coarse,N,res:d.detail,x,y,R,desc});}}
 const used=new Map(),chosen={},stride=7,worldX=origin[0],worldY=origin[1];
 for(let gy=Math.floor((worldY-10)/stride);gy*stride<=worldY+(h-1)/res+10;gy++)for(let gx=Math.floor((worldX-10)/stride);gx*stride<=worldX+(w-1)/res+10;gx++){
 const X=gx*stride+(hash(gx,gy)-.5)*3-worldX,Y=gy*stride+(hash(gy,gx+91)-.5)*3-worldY,px=X*res,py=Y*res;
 if(px<0||py<0||px>w-1||py>h-1)continue;const k=Math.round(py)*w+Math.round(px);if(weight[k]<.05)continue;
 const high=kind[k]===4,descs={6:descriptors(z,w,h,px,py,6*res),10:descriptors(z,w,h,px,py,10*res)};let best=null,score=Infinity;
 for(const p of catalog){if(high&&['rolling','coastal'].includes(p.id))continue;if(!high&&p.id==='alpine')continue;const desc=descs[p.R];for(let r=0;r<4;r++){let cost=0;for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const u=r===0?i:r===1?-j:r===2?-i:j,v=r===0?j:r===1?i:r===2?-j:-i;cost+=(desc.p[(j+2)*5+i+2]-p.desc.p[(v+2)*5+u+2])**2;}cost=cost/25+Math.abs(Math.log((p.desc.sd+.1)/(desc.sd+.1)))*.22+(used.get(p)||0)*.65+(high&&p.id==='alpine'?0:.07);if(cost<score){score=cost;best={p,r};}}}
 if(!best)continue;const {p,r}=best;used.set(p,(used.get(p)||0)+1);chosen[p.id]=(chosen[p.id]||0)+1;const R=p.R,ratio=p.res/res;
 for(let y=Math.max(0,Math.floor(py-R*res));y<=Math.min(h-1,Math.ceil(py+R*res));y++)for(let x=Math.max(0,Math.floor(px-R*res));x<=Math.min(w-1,Math.ceil(px+R*res));x++){const dx=(x-px)/res,dy=(y-py)/res,d=Math.hypot(dx,dy)/R;if(d>=1)continue;const u=r===0?dx:r===1?-dy:r===2?-dx:dy,v=r===0?dy:r===1?dx:r===2?-dy:-dx,ix=(p.x+u)*p.res,iy=(p.y+v)*p.res,k=y*w+x,ww=(1+Math.cos(Math.PI*d))*.5;const detail=sample(p.a,p.N,p.N,ix,iy)-sample(p.coarse,p.N,p.N,ix,iy);out[k]+=detail*ww;sum[k]+=ww;}
 }
 for(let i=0;i<n;i++)out[i]=sum[i]>1e-5?out[i]/sum[i]:0;
 return {raw:out,diagnostics:{patches:Object.values(chosen).reduce((a,b)=>a+b,0),regions:chosen,unique:used.size,catalog:catalog.length}};
}
function structural(input,library){
 const {w,h,res,z,weight,channels,flow}=input,n=w*h,dist=new Float32Array(n).fill(Infinity),label=new Int32Array(n).fill(-1),floor=new Float32Array(n),heap=[];
 const push=(i,d)=>{let k=heap.length;heap.push([i,d]);while(k){const p=(k-1)>>1;if(heap[p][1]<=d)break;heap[k]=heap[p];k=p;}heap[k]=[i,d];};
 const pop=()=>{const a=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let j=k*2+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=last[1])break;heap[k]=heap[j];k=j;}heap[k]=last;}return a;};
 // Flood outward from the existing valley network. The resulting distance
 // transform defines entire interfluves and watershed saddles, not rock props.
 let seeds=0;for(let i=0;i<n;i++)if(channels[i]&&weight[i]>=0){dist[i]=0;label[i]=i;floor[i]=z[i];push(i,0);seeds++;}
 while(heap.length){const [i,d]=pop();if(d>dist[i]+1e-5)continue;const x=i%w,y=Math.floor(i/w);for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){const X=x+dx,Y=y+dy,j=Y*w+X;if(X<0||X>=w||Y<0||Y>=h||weight[j]<0)continue;const next=input.canonical?Math.fround(d+Math.hypot(dx,dy)/res):d+Math.hypot(dx,dy)/res;if(next>=dist[j])continue;dist[j]=next;label[j]=label[i];floor[j]=floor[i];push(j,next);}}
 const out=new Float32Array(n),distanceField=Float32Array.from(dist,v=>Number.isFinite(v)?v:0),smoothFloor=blur(floor,w,h,Math.round(res*.65)),smoothDistance=blur(distanceField,w,h,Math.round(res*.22));
 // Real reference determines slope scale from median central-gradient.
 const exemplars=library.filter(d=>['alpine','carpathian','gorge'].includes(d.id));let slope=0,count=0;
 for(const d of exemplars)for(let y=8;y<d.size-8;y+=8)for(let x=8;x<d.size-8;x+=8){const a=d.metres,N=d.size,dx=(a[y*N+x+4]-a[y*N+x-4])/1000*2.5,dy=(a[(y+4)*N+x]-a[(y-4)*N+x])/1000*2.5;slope+=Math.hypot(dx,dy);count++;}slope=C(slope/Math.max(1,count),.22,1.7);
 // The nearest-valley cross section has a concave toe, steep flank and
 // convex crest. Distance to competing branches forms whole connected ridges.
 let divides=0;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(weight[i]<=0||label[i]<0)continue;const d=smoothDistance[i],height=smoothFloor[i]+slope*(1.15*d+.52*d*d/(1+d)),target=L(z[i],height,.72);out[i]=target-z[i];if(d>1&&d>=smoothDistance[i-1]&&d>=smoothDistance[i+1]||d>1&&d>=smoothDistance[i-w]&&d>=smoothDistance[i+w])divides++;}
 // Preserve broad mountain envelope, while retaining valley cross sections.
 const broad=blur(out,w,h,res*4);for(let i=0;i<n;i++)out[i]-=broad[i]*.8;
 return {raw:out,diagnostics:{valleySeeds:seeds,divideSamples:divides,referenceSlope:slope}};
}
export function synthesize(input,library,approach,mode){
 const start=performance.now(),{w,h,res,z,weight,kind,anchor,origin}=input,n=w*h,gen=approach==='patch'?patchSynthesis(input,library):structural(input,library),raw=gen.raw,result=z.slice();
 const broad=blur(raw,w,h,res*5);for(let i=0;i<n;i++)raw[i]=(raw[i]-broad[i]*(approach==='patch'?.45:.25))*(weight[i]>0?weight[i]:0);
 let maxAnchor=0,maxError=0,rmse=0,protectedChanges=0,maxSlopeDelta=0,count=0,changed=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(weight[i]<=0)continue;let value=raw[i];
 if(mode==='strict'){const ax=Math.floor((x-res/2)/res)*res+res/2,ay=Math.floor((y-res/2)/res)*res+res/2,u=(x-ax)/res,v=(y-ay)/res;value-=L(L(at(raw,w,h,ax,ay),at(raw,w,h,ax+res,ay),u),L(at(raw,w,h,ax,ay+res),at(raw,w,h,ax+res,ay+res),u),v);if(anchor[i])value=0;}
 const max=kind[i]===4?1.7:kind[i]===3?.65:.12,delta=C(value,-max,max)*weight[i];result[i]=Math.max(.015,z[i]+delta);if(mode==='strict'&&anchor[i])result[i]=z[i];}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,d=result[i]-z[i];if(weight[i]<=0&&d!==0)protectedChanges++;if(weight[i]<0)continue;if(anchor[i])maxAnchor=Math.max(maxAnchor,Math.abs(d));maxError=Math.max(maxError,Math.abs(d));rmse+=d*d;count++;if(Math.abs(d)>1e-5)changed++;if(x&&y&&x<w-1&&y<h-1&&weight[i]>0){const s=a=>Math.hypot(a[i+1]-a[i-1],a[i+w]-a[i-w])*res/2;maxSlopeDelta=Math.max(maxSlopeDelta,Math.abs(s(result)-s(z)));}}
 const diffs=Float32Array.from(result,(v,i)=>v-z[i]),macro=blur(diffs,w,h,res*4);let maxMacro=0,protectedCount=0;for(let i=0;i<n;i++){if(weight[i]<=0)protectedCount++;else maxMacro=Math.max(maxMacro,Math.abs(macro[i]));}return {result,stats:{approach,mode,maxAnchor,maxError,maxMacro,protectedCount,rmse:Math.sqrt(rmse/Math.max(1,count)),protectedChanges,changed,maxSlopeDelta,workerMs:performance.now()-start,...gen.diagnostics}};
}
if(typeof self!=='undefined'&&typeof document==='undefined'&&typeof self.postMessage==='function')self.onmessage=e=>{try{const {input,library,approach,mode}=e.data,out=synthesize(input,library,approach,mode);self.postMessage(out,[out.result.buffer]);}catch(error){self.postMessage({error:String(error.stack||error)});}};
