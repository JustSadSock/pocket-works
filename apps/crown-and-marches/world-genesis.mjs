import {aggregateHydrology,HYDRO_REVISION} from './genesis-hydrology.mjs';
// World Genesis v3. Pure, deterministic, opt-in. No campaign systems here.
// The v1 continental mask supplies coastline topology only, not mountain heights.
export const GENESIS_REVISION='genesis-3.0.0';
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),L=(a,b,t)=>a+(b-a)*t,S=x=>{x=C(x);return x*x*(3-2*x)};
function random(seed){let a=2166136261;for(const c of String(seed))a=Math.imul(a^c.charCodeAt(0),16777619);return ()=>{a=(Math.imul(a,1664525)+1013904223)>>>0;return a/4294967296;};}
function hash(seed,x,y){let v=seed^Math.imul(x+517,374761393)^Math.imul(y+281,668265263);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967296;}
function noise(seed,x,y,scale){x/=scale;y/=scale;const i=Math.floor(x),j=Math.floor(y),a=S(x-i),b=S(y-j);return L(L(hash(seed,i,j),hash(seed,i+1,j),a),L(hash(seed,i,j+1),hash(seed,i+1,j+1),a),b);}
const D=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
function distanceField(mask,w,h){const d=new Float32Array(w*h).fill(1e6);for(let i=0;i<d.length;i++)if(!mask[i])d[i]=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y)d[i]=Math.min(d[i],d[i-w]+1);if(x&&y)d[i]=Math.min(d[i],d[i-w-1]+1.4142);if(x+1<w&&y)d[i]=Math.min(d[i],d[i-w+1]+1.4142);}for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(x+1<w)d[i]=Math.min(d[i],d[i+1]+1);if(y+1<h)d[i]=Math.min(d[i],d[i+w]+1);if(x+1<w&&y+1<h)d[i]=Math.min(d[i],d[i+w+1]+1.4142);if(x&&y+1<h)d[i]=Math.min(d[i],d[i+w-1]+1.4142);}return d;}
function sample(a,w,h,x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,at=(x,y)=>a[C(y,0,h-1)*w+C(x,0,w-1)];return L(L(at(i,j),at(i+1,j),u),L(at(i,j+1),at(i+1,j+1),u),v);}
function segment(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=C(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1));return {d:Math.hypot(x-a.x-dx*t,y-a.y-dy*t),t};}
function geology(seed,w,h,land,coast,approach){
 const rng=random(seed+':'+approach),salt=Math.floor(rng()*2**31),chains=[],segments=[],candidates=[];
 for(let y=8;y<h-8;y+=5)for(let x=8;x<w-8;x+=5){const i=y*w+x;if(land[i]&&coast[i]>5)candidates.push({x,y,score:coast[i]*.55+rng()*15});}
 candidates.sort((a,b)=>b.score-a.score);
 const desired=Math.max(2,Math.round(w*h/3600));
 for(const p of candidates){if(chains.length>=desired)break;if(chains.some(c=>Math.hypot(p.x-c.x,p.y-c.y)<21))continue;
 const angle=rng()*Math.PI*2,len=18+rng()*25,width=3.5+rng()*4,amp=.30+rng()*.35,turn=(rng()-.5)*1.0,points=[];
 for(let k=-3;k<=3;k++){const t=k/3,x=p.x+Math.cos(angle)*len*t-Math.sin(angle)*Math.sin(t*2.2)*len*turn*.30,y=p.y+Math.sin(angle)*len*t+Math.cos(angle)*Math.sin(t*2.2)*len*turn*.30;points.push({x,y,h:amp*(.57+.43*Math.cos(t*1.25))*(.76+rng()*.24)});}
 const chain={...p,angle,len,width,amp,points};chains.push(chain);
 for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k];segments.push({a,b,width,kind:0});if(approach==='structure'&&k<points.length-1){for(const side of [-1,1]){const theta=angle+side*(.66+rng()*.65),length=5+rng()*10,c={x:b.x+Math.cos(theta)*length*.53,y:b.y+Math.sin(theta)*length*.53,h:b.h*(.61+rng()*.17)},d={x:c.x+Math.cos(theta+side*.3)*length*.47,y:c.y+Math.sin(theta+side*.3)*length*.47,h:.035+rng()*.045};segments.push({a:b,b:c,width:width*.60,kind:1},{a:c,b:d,width:width*.43,kind:1});}}}
 }
 // World-coordinate spatial bins avoid a per-sample scan of every chain.
 const bins=new Map(),tile=8;
 for(const e of segments){const pad=e.width*(approach==='tectonic'?4:3);for(let y=Math.floor((Math.min(e.a.y,e.b.y)-pad)/tile);y<=Math.floor((Math.max(e.a.y,e.b.y)+pad)/tile);y++)for(let x=Math.floor((Math.min(e.a.x,e.b.x)-pad)/tile);x<=Math.floor((Math.max(e.a.x,e.b.x)+pad)/tile);x++){const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(e);}}
 const field=(x,y)=>{let uplift=0,foot=0;for(const e of bins.get(Math.floor(x/tile)+','+Math.floor(y/tile))||[]){const {d,t}=segment(x,y,e.a,e.b),amp=L(e.a.h,e.b.h,t),r=d/e.width;
 if(approach==='tectonic'){// Broad deformation belts with asymmetric fold trains.
 const across=(x-e.a.x)*(e.b.y-e.a.y)-(y-e.a.y)*(e.b.x-e.a.x),sign=Math.sign(across),belt=Math.exp(-r*r*.28),fold=.64+.36*Math.cos(d*1.9+sign*.6+noise(salt,x,y,9)*2);uplift=Math.max(uplift,amp*belt*fold);foot=Math.max(foot,amp*belt*.16);}
 else{// Continuous interlocking ridge and spur envelopes; narrow crest,
 // concave foot slopes and broad support shared by the entire range.
 const profile=Math.exp(-r*1.45)*.71+Math.exp(-r*r*.24)*.29;uplift=Math.max(uplift,amp*profile);foot=Math.max(foot,amp*Math.exp(-r*r*.18)*.12);}
 }return {uplift,foot};};
 return {field,chains,segments,salt};
}
// Priority flood: stable tie-breaking by index, strict downhill outlets.
// Depressions are measured before filling; the filled surface routes runoff.
function drainage(height,land,w,h,rain=null){
 const n=w*h,filled=height.slice(),down=new Int32Array(n).fill(-1),basin=new Int32Array(n).fill(-1),order=new Int32Array(n),seen=new Uint8Array(n),heap=new Int32Array(n);let size=0,count=0;
 const less=(a,b)=>filled[a]<filled[b]||filled[a]===filled[b]&&a<b;
 const push=i=>{let k=size++;while(k){const p=(k-1)>>1,j=heap[p];if(!less(i,j))break;heap[k]=j;k=p;}heap[k]=i;};
 const pop=()=>{const i=heap[0],v=heap[--size];if(size){let k=0;while(k*2+1<size){let j=k*2+1;if(j+1<size&&less(heap[j+1],heap[j]))j++;if(!less(heap[j],v))break;heap[k]=heap[j];k=j;}heap[k]=v;}return i;};
 for(let i=0;i<n;i++)if(!land[i]||i%w===0||i%w===w-1||i<w||i>=n-w){seen[i]=1;basin[i]=i;push(i);}
 while(size){const i=pop();order[count++]=i;const x=i%w,y=(i/w)|0;for(const [dx,dy] of D){const X=x+dx,Y=y+dy,j=Y*w+X;if(X<0||Y<0||X>=w||Y>=h||seen[j])continue;seen[j]=1;filled[j]=Math.max(height[j],filled[i]+.000002);down[j]=i;basin[j]=basin[i];push(j);}}
 const flow=new Float32Array(n),lake=new Float32Array(n);
 for(let k=0;k<count;k++){const i=order[k];if(!land[i])continue;lake[i]=Math.max(0,filled[i]-height[i]);flow[i]=rain?(.4+rain[i]*1.2):1;const x=i%w,y=(i/w)|0;let best=down[i],grade=0;for(const [dx,dy] of D){const X=x+dx,Y=y+dy,j=Y*w+X;if(X<0||Y<0||X>=w||Y>=h||filled[j]>=filled[i])continue;const g=(filled[i]-filled[j])/Math.hypot(dx,dy);if(g>grade){grade=g;best=j;}}down[i]=best;if(best>=0)basin[i]=basin[best];}
 for(let k=count-1;k>=0;k--){const i=order[k];if(land[i]&&down[i]>=0)flow[down[i]]+=flow[i];}
 return {filled,down,basin,flow,lake,order};
}
function landmass(land,w,h){const out=new Int32Array(land.length),seen=new Uint8Array(land.length);for(let i=0;i<land.length;i++){if(!land[i]||seen[i])continue;const q=[i];seen[i]=1;for(let k=0;k<q.length;k++){const j=q[k],x=j%w,y=(j/w)|0;for(const [dx,dy] of D.slice(0,4)){const X=x+dx,Y=y+dy,t=Y*w+X;if(X<0||Y<0||X>=w||Y>=h||!land[t]||seen[t])continue;seen[t]=1;q.push(t);}}for(const j of q)out[j]=q.length;}return out;}
export function genesisOptions(options={}){const approach=options.approach??'structure',detail=options.detail??4;if(!['tectonic','structure'].includes(approach)||![2,4,8].includes(detail)||options.revision&&![GENESIS_REVISION,HYDRO_REVISION].includes(options.revision))throw Error('Unsupported Geography v3 parameters');return {revision:options.revision||GENESIS_REVISION,approach,detail};}
export function generateGenesis(seed,W,H,continental,options={}){
 const config=genesisOptions(options),{approach,detail:r}=config,n=W*H,land=continental.land.slice(),coastal=distanceField(land,W,H),oceanDistance=distanceField(Uint8Array.from(land,v=>1-v),W,H),g=geology(seed,W,H,land,coastal,approach),salt=g.salt,w=W*r+1,h=H*r+1,N=w*h,high=new Float32Array(N),mask=new Uint8Array(N),rain=new Float32Array(N),uplift=new Float32Array(N);
 const signed=Float32Array.from(land,(v,i)=>v?coastal[i]-.5:.5-oceanDistance[i]);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,X=x/r,Y=y/r,d=sample(signed,W,H,X-.5,Y-.5);mask[i]=+(d>0);if(!mask[i]){high[i]=.12-Math.min(.16,Math.abs(d)*.025);continue;}const coast=S(d/5),geo=g.field(X,Y),plain=.12+coast*(.045+.10*noise(salt^29,X,Y,23)+.035*noise(salt^81,X,Y,6)),hill=geo.uplift;uplift[i]=hill;high[i]=plain+coast*(hill+geo.foot)+coast*hill*.075*(noise(salt^70,X,Y,1.8)-.5);}
 // Orographic precipitation: prevailing west wind loses moisture on ascent.
 for(let y=0;y<h;y++){let vapor=.78,previous=.12;for(let x=0;x<w;x++){const i=y*w+x,z=high[i];if(!mask[i])vapor=.93;else{const rise=Math.max(0,z-previous),fall=Math.max(0,previous-z),precip=Math.min(vapor,.015/r+rise*1.9);rain[i]=C(.16+vapor*.53+precip*r*.8-fall*.35);vapor=C(vapor-precip+.004/r,.14,.93);}previous=z;}}
 // One drainage-driven incision pass and two conservative talus passes.
 // Incision follows connected catchments, not stochastic displacement.
 let hyd=drainage(high,mask,w,h,rain),erosion=new Float32Array(N),removed=0,deposited=0;
 for(let i=0;i<N;i++){const j=hyd.down[i];if(!mask[i]||j<0||!mask[j]||high[i]<.16)continue;const slope=Math.max(0,(hyd.filled[i]-hyd.filled[j])*r),area=hyd.flow[i]/(r*r),cut=Math.min(.085,Math.max(0,Math.log1p(area)-.5)*Math.sqrt(slope)*.032,high[i]-.135);if(cut<=0)continue;erosion[i]-=cut;erosion[j]+=cut*.22;removed+=cut;deposited+=cut*.22;}
 for(let i=0;i<N;i++)high[i]+=erosion[i];
 for(let pass=0;pass<2;pass++){erosion.fill(0);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!mask[i])continue;let j=-1,drop=0;for(const k of [i-1,i+1,i-w,i+w])if(mask[k]&&high[i]-high[k]>drop){drop=high[i]-high[k];j=k;}if(j>=0){const move=Math.max(0,drop-.115/r)*.19;erosion[i]-=move;erosion[j]+=move;}}for(let i=0;i<N;i++)high[i]+=erosion[i];}
 hyd=drainage(high,mask,w,h,rain);
 // Standing water is represented by the filled water surface; preserve
 // separate bed height and lake depth for research. Sea remains the same coast.
 const height=new Float32Array(n),moisture=new Float32Array(n),temperature=new Float32Array(n),fert=new Float32Array(n),terrain=new Uint8Array(n),resource=new Int8Array(n).fill(-1),ridge=new Float32Array(n),pass=new Uint8Array(n),delta=new Uint8Array(n),coast=new Uint8Array(n),relief=new Float32Array(n),lakeDepth=new Float32Array(n);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;let sum=0,wet=0,up=0,lo=Infinity,hi=-Infinity,lake=0;for(let dy=0;dy<r;dy++)for(let dx=0;dx<r;dx++){const j=(y*r+dy)*w+x*r+dx;sum+=hyd.filled[j];wet+=rain[j];up+=uplift[j];lo=Math.min(lo,high[j]);hi=Math.max(hi,high[j]);lake+=hyd.lake[j];}height[i]=land[i]?Math.max(.12001,sum/(r*r)):Math.min(.1199,sum/(r*r));moisture[i]=wet/(r*r);ridge[i]=up/(r*r);relief[i]=hi-lo;lakeDepth[i]=lake/(r*r);}
 const coarse=drainage(height,land,W,H,moisture);height.set(coarse.filled);const {down,flow,basin}=coarse,river=new Uint8Array(n);
 for(let i=0;i<n;i++){if(!land[i]){down[i]=-1;continue;}const x=i%W,y=(i/W)|0,e=height[i],wet=moisture[i],lat=Math.abs(y-H/2)/(H/2);temperature[i]=C(1-lat*.70-e*.67);coast[i]=+(coastal[i]<1.5);river[i]=+(flow[i]>58);delta[i]=+(coast[i]&&flow[i]>85);const valley=river[i]||relief[i]<.055;fert[i]=C(.32+wet*.40+temperature[i]*.20-e*.46+(valley?.14:0)+(delta[i]?.11:0),.05,1);terrain[i]=e>.55?4:e>.40?3:wet>.72&&e<.27&&valley?5:wet>.52?2:fert[i]>.44?1:6;const vein=noise(salt^185,x,y,4),v=noise(salt^930,x,y,9);resource[i]=e>.36||ridge[i]>.24?(vein>.55?3:vein<.34?4:2):coast[i]&&v>.63?6:coast[i]||river[i]&&v>.72?5:terrain[i]===2?1:terrain[i]===6?(v>.54?7:8):fert[i]>.44?0:7;}
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(terrain[i]!==3)continue;const saddle=height[i-W]>height[i]+.035&&height[i+W]>height[i]+.035||height[i-1]>height[i]+.035&&height[i+1]>height[i]+.035;pass[i]=+(saddle&&relief[i]<.14);}
 const result={height,land,moisture,fert,terrain,resource,river,down,flow,basin,temperature,ridge,pass,delta,coast,landmass:landmass(land,W,H),relief,lakeDepth,geography:{config,width:w,height:h,detail:r,bed:high,surface:hyd.filled,land:mask,flow:hyd.flow,down:hyd.down,basin:hyd.basin,lake:hyd.lake,rain,chains:g.chains,erosion:{removed,deposited}}};return config.revision===HYDRO_REVISION?aggregateHydrology(result,W,H):result;
}
