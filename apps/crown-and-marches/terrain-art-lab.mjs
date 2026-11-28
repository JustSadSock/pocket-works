// Research-only height sources; the campaign's state and geography are read-only.
import {prepareTerrain} from './world-rendering-gl.mjs';
import {model} from './geography-review.mjs';
import {loadForgeProfiles} from './terrain-forge-profiles.mjs';
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),L=(a,b,t)=>a+(b-a)*t,S=x=>{x=C(x);return x*x*(3-2*x)};
const sleep=()=>new Promise(r=>setTimeout(r,0));
function budget(){const start=performance.now();let last=start,max=0;return {async tick(){const n=performance.now();if(n-last>=6){max=Math.max(max,n-last);await sleep();last=performance.now();}},get ms(){return performance.now()-start},get max(){return Math.max(max,performance.now()-last)}};}
const distance=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=C(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);};
export function realSource(dem){
 const started=performance.now();
 const {size,detail,metres,metadata}=dem,w=size,h=size,n=w*h,vertices=new Float32Array(n*9),elevations=new Float32Array(n),min=Math.min(...metres.slice(0,1));let lo=Infinity,hi=-Infinity;
 for(const m of metres){lo=Math.min(lo,m);hi=Math.max(hi,m);}
 const cellKm=metadata.cellKm,exaggeration=metadata.exaggeration;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,H=metres[i],z=(H-lo)/1000/cellKm*exaggeration,e=H/4500,forest=1-S((H-1600)/650),fert=1-S((H-800)/1700);vertices.set([x/detail,y/detail,z,e,.55,fert,forest,1,1],i*9);elevations[i]=z;}
 return {vertices,elevations,indices:new Uint32Array(0),cols:w,rows:h,detail,bounds:[0,0,(w-1)/detail,(h-1)/detail],center:elevations[(w>>1)*w+(w>>1)],stats:{ms:performance.now()-started,maxSlice:performance.now()-started,anchorError:0,minH:lo,maxH:hi,minZ:0,maxZ:(hi-lo)/1000/cellKm*exaggeration,bytes:vertices.byteLength+elevations.byteLength,dem:true,metadata}};
}
export async function terrainMetrics(z,w,h,step){
 const timer=budget();
 let n=0,sum=0,sq=0,lo=Infinity,hi=-Infinity,peaks=0,pits=0,rough=0,slope=0,sx=0,sy=0;const angles=new Uint32Array(8),corr=[0,0,0],diff=[0,0,0],lags=[1,2,4].map(k=>Math.max(1,Math.round(k/step)));
 for(let y=1;y<h-1;y++){for(let x=1;x<w-1;x++){const i=y*w+x,v=z[i];if(!Number.isFinite(v))continue;n++;sum+=v;sq+=v*v;lo=Math.min(lo,v);hi=Math.max(hi,v);const a=z[i-1],b=z[i+1],c=z[i-w],d=z[i+w],dx=(b-a)/(2*step),dy=(d-c)/(2*step);rough+=Math.abs(a+b+c+d-4*v);slope+=Math.hypot(dx,dy);sx+=dx*dx;sy+=dy*dy;angles[((Math.floor((Math.atan2(dy,dx)+Math.PI)*4/Math.PI))%8+8)%8]++;const ns=[a,b,c,d,z[i-w-1],z[i-w+1],z[i+w-1],z[i+w+1]];if(ns.every(q=>v>q))peaks++;if(ns.every(q=>v<q))pits++;for(let j=0;j<3;j++){const k=lags[j];if(x+k<w){corr[j]++;diff[j]+=(z[i+k]-v)**2;}if(y+k<h){corr[j]++;diff[j]+=(z[i+k*w]-v)**2;}}}await timer.tick();}
 const variance=Math.max(0,sq/n-(sum/n)**2);
 return {samples:n,min:lo,max:hi,mean:sum/n,sd:Math.sqrt(variance),peaks,pits,meanSlope:slope/n,meanLaplacian:rough/n,directionalSlope:[Math.sqrt(sx/n),Math.sqrt(sy/n)],slopeDirections:[...angles],semivariance:lags.map((k,i)=>({distance:k*step,value:diff[i]/(2*corr[i]),normalized:variance?diff[i]/(2*corr[i]*variance):0}))};
}
function crestGraph(m,bounds){
 const [x0,y0,x1,y1]=bounds,pts=new Map(),edges=[],W=m.width;
 const end=i=>{for(let k=0;k<6;k++){const j=m.m.down[i];if(j<0||!m.known[j]||!m.m.land[j])break;i=j;}return i;};
 for(let y=Math.max(1,y0);y<Math.min(m.height-1,y1);y++)for(let x=Math.max(1,x0);x<Math.min(m.width-1,x1);x++){const i=m.at(x,y);if(!m.known[i]||!m.m.land[i]||m.m.height[i]<.40)continue;const h=m.m.height[i];let crest=0,watershed=0;
 for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){const a=m.at(x-dx,y-dy),b=m.at(x+dx,y+dy);if(!m.known[a]||!m.known[b])continue;if(h>=m.m.height[a]&&h>=m.m.height[b]){crest=Math.max(crest,h-(m.m.height[a]+m.m.height[b])*.5);if(end(a)!==end(b))watershed++;}}
 if(crest>.007&&watershed)pts.set(i,{p:[x+.5,y+.5],strength:C(crest/.05),h});}
 for(const [i,a] of pts){const x=i%W,y=Math.floor(i/W);for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){const j=m.at(x+dx,y+dy),b=pts.get(j);if(!b)continue;edges.push({a:a.p,b:b.p,strength:(a.strength+b.strength)*.5});}}
 const buckets=new Map();for(const e of edges)for(let y=Math.floor(Math.min(e.a[1],e.b[1])-.7);y<=Math.floor(Math.max(e.a[1],e.b[1])+.7);y++)for(let x=Math.floor(Math.min(e.a[0],e.b[0])-.7);x<=Math.floor(Math.max(e.a[0],e.b[0])+.7);x++){const k=x+','+y;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(e);}
 return {nodes:pts.size,edges:edges.length,buckets,points:[...pts.values()],lines:edges};
}
export async function reconstructTerrain(s,cam,kind){
 const base=await prepareTerrain(s,cam,{detail:8,heightStyle:'smooth',textureOnly:true}),b=budget(),w=base.cols,h=base.rows,res=base.detail,n=w*h,v=base.vertices,z=base.elevations,original=z.slice(),movable=new Uint8Array(n),fixed=new Uint8Array(n),delta=new Float32Array(n);let anchorError=0,transport=0,runoff=0,graph=null,forge=null;
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,o=i*9;fixed[i]=+(x%res===res/2&&y%res===res/2);movable[i]=+(x>0&&x<w-1&&y>0&&y<h-1&&!fixed[i]&&v[o+7]>.72&&v[o+8]>.025&&v[o+3]>.31);}await b.tick();}
 if(kind==='erosion'){
 // Closed-boundary conservative transport. Water routes along local
 // downhill gradients, carrying eroded sediment; thermal creep moves material
 // from steep slopes toward their lower neighbours. Fixed nodes are immutable.
 let water=new Float32Array(n),next=new Float32Array(n);const sediment=new Float32Array(n),nextSed=new Float32Array(n);
 for(let pass=0;pass<12;pass++){delta.fill(0);next.fill(0);nextSed.fill(0);
 for(let y=1;y<h-1;y++){for(let x=1;x<w-1;x++){const i=y*w+x;if(!movable[i])continue;const o=i*9,volume=water[i]+.018*(.4+v[o+4]),neighbors=[i-1,i+1,i-w,i+w];let target=-1,fall=0;for(const j of neighbors){const d=z[i]-z[j];if(movable[j]&&d>fall){fall=d;target=j;}}
 if(target<0){next[i]+=volume*.78;delta[i]+=sediment[i];continue;}
 const capacity=volume*fall*2.4,eroded=Math.min(.020,Math.max(0,capacity-sediment[i])*.13),deposit=Math.min(sediment[i],Math.max(0,sediment[i]-capacity)*.25),thermal=Math.max(0,fall-1.10/res)*.062;
 delta[i]+=deposit-eroded-thermal;delta[target]+=thermal;next[target]+=volume*.88;nextSed[target]+=sediment[i]+eroded-deposit;transport+=thermal+eroded;runoff+=volume;
 }await b.tick();}
 for(let i=0;i<n;i++)if(movable[i])z[i]+=delta[i];water=next;next=new Float32Array(n);sediment.set(nextSed);await b.tick();}
 // Deposit residual carried sediment. No mass is silently discarded.
 for(let i=0;i<n;i++)if(movable[i])z[i]+=sediment[i];
 }else if(kind==='watersheds'){
 const m=model(s);graph=crestGraph(m,base.bounds);
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,o=i*9;if(!movable[i])continue;const wx=v[o],wy=v[o+1],H=v[o+3],river=v[o+8],u=(wx-.5)-Math.floor(wx-.5),t=(wy-.5)-Math.floor(wy-.5),anchor=S(Math.hypot(Math.min(u,1-u),Math.min(t,1-t))*2.4);let ridge=0;
 for(const e of graph.buckets.get(Math.floor(wx)+','+Math.floor(wy))||[])ridge=Math.max(ridge,S(1-distance(wx,wy,e.a,e.b)/.38)*e.strength);
 const valley=1-S((river-.025)/.52),local=(original[i-1]+original[i+1]+original[i-w]+original[i+w])*.25,relief=Math.abs(original[i]-local);
 z[i]+=anchor*S((H-.34)/.14)*(ridge*.23-valley*.19)*C(.4+relief*8,0,1);
 }await b.tick();}
 }else if(kind==='forge'){
 const m=model(s),asset=await loadForgeProfiles();graph=crestGraph(m,base.bounds);const patches=[],bins=new Map();
 // Select real transverse crests, ordered by height. Use actual connected
 // crest directions. Keep a patch out of the known water/river corridor.
 for(const p of [...graph.points].sort((a,b)=>b.h-a.h||b.strength-a.strength)){const [x,y]=p.p,px=Math.round((x-base.bounds[0])*res),py=Math.round((y-base.bounds[1])*res);if(px<0||px>=w||py<0||py>=h)continue;const i=(py*w+px)*9;if(v[i+7]<.85||v[i+8]<.28||p.h<.43||patches.some(q=>Math.hypot(q.x-x,q.y-y)<1.25))continue;const lines=graph.lines.filter(e=>Math.hypot(e.a[0]-x,e.a[1]-y)<.01||Math.hypot(e.b[0]-x,e.b[1]-y)<.01);if(!lines.length)continue;const e=lines.sort((a,b)=>b.strength-a.strength)[0],angle=Math.atan2(e.b[1]-e.a[1],e.b[0]-e.a[0]),type=p.h>.55&&lines.length<=2?'summit':lines.length>=3?'ridge':p.strength>.6?'outcrop':'slope',radius=type==='ridge'?1.0:.78,amp=.30+.70*p.strength;
 const patch={x,y,angle,type,radius,amp};patches.push(patch);for(let Y=Math.floor(y-radius*1.6);Y<=Math.floor(y+radius*1.6);Y++)for(let X=Math.floor(x-radius*1.6);X<=Math.floor(x+radius*1.6);X++){const key=X+','+Y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(patch);}}
 const field=(x,y)=>{let h=0;for(const p of bins.get(Math.floor(x)+','+Math.floor(y))||[]){const dx=x-p.x,dy=y-p.y,co=Math.cos(p.angle),si=Math.sin(p.angle),u=(dx*co+dy*si)/p.radius,v=(-dx*si+dy*co)/(p.radius*.78);h=Math.max(h,asset.sample(p.type,u,v)*p.amp);}return h;};
 for(let y=1;y<h-1;y++){for(let x=1;x<w-1;x++){const i=y*w+x,o=i*9;if(!movable[i])continue;const X=v[o],Y=v[o+1],a=Math.floor(X-.5)+.5,c=Math.floor(Y-.5)+.5,u=X-a,t=Y-c,correction=L(L(field(a,c),field(a+1,c),u),L(field(a,c+1),field(a+1,c+1),u),t),residual=field(X,Y)-correction;
 // Exact zero residual at all simulation sample centres, and a tapered
 // exclusion of actual river beds, coasts and lowland terrain.
 z[i]+=residual*S((v[o+7]-.72)/.20)*S((v[o+8]-.025)/.22)*S((v[o+3]-.32)/.15);
 }await b.tick();}
 forge={...asset.meta,patches:patches.length,byType:Object.fromEntries([...new Set(patches.map(p=>p.type))].map(type=>[type,patches.filter(p=>p.type===type).length]))};if(!patches.length)throw Error('No geographically admissible Forge patches');
 }else throw Error('Unknown geometry candidate '+kind);
 let massChange=0,maxDisplacement=0,changed=0;for(let i=0;i<n;i++){const d=z[i]-original[i];if(fixed[i])anchorError=Math.max(anchorError,Math.abs(d));if(!movable[i]&&d!==0)throw Error('Protected visual sample changed');maxDisplacement=Math.max(maxDisplacement,Math.abs(d));massChange+=d;if(Math.abs(d)>1e-6)changed++;v[i*9+2]=z[i];}
 const geometryMs=b.ms,geometryMaxSlice=b.max;const metrics={before:await terrainMetrics(original,w,h,1/res),after:await terrainMetrics(z,w,h,1/res)};
 return {...base,stats:{...base.stats,ms:base.stats.ms+geometryMs,maxSlice:Math.max(base.stats.maxSlice,geometryMaxSlice),analysisMs:b.ms-geometryMs,geometry:kind,visualAnchorError:anchorError,transport,runoff,massChange,maxDisplacement,changed,graph:graph?{nodes:graph.nodes,edges:graph.edges}:null,forge,metrics}};
}
export async function sourceMetrics(source){const {vertices:v,cols:w,rows:h,detail}=source,cols=Math.floor((w-1)/detail),rows=Math.floor((h-1)/detail),z=new Float32Array(cols*rows);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)z[y*cols+x]=v[((y*detail+detail/2)*w+x*detail+detail/2)*9+3];const m=await terrainMetrics(z,cols,rows,1);const seen=new Uint8Array(z.length),components=[];for(let i=0;i<z.length;i++){if(seen[i]||z[i]<.55)continue;const q=[i];seen[i]=1;for(let k=0;k<q.length;k++){const j=q[k],x=j%cols,y=Math.floor(j/cols);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy,t=Y*cols+X;if(X<0||Y<0||X>=cols||Y>=rows||seen[t]||z[t]<.55)continue;seen[t]=1;q.push(t);}}components.push(q.length);}return {...m,mountainComponents:components.sort((a,b)=>b-a),grid:[cols,rows]};}
