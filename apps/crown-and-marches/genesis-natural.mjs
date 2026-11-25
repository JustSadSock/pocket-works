// Genesis 3.2 only. Existing revisions are frozen. The two candidates share
// the same coast, incision, climate, classification and hydrology pipeline.
export const NATURAL_REVISION='genesis-3.2.0';
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)};
function random(seed){let a=2166136261;for(const c of String(seed))a=Math.imul(a^c.charCodeAt(0),16777619);return ()=>{a=(Math.imul(a,1664525)+1013904223)>>>0;return a/4294967296;};}
const refs=['alpine','carpathian','gorge','foothills','low-ridge','rolling','coastal'];
// Frozen, self-contained 250 m DEM exemplars. Quantization to integer metres
// is explicit; the original source hashes and attribution travel with the save.
export function validateExemplars(data){
 if(!Array.isArray(data)||data.length!==7)throw Error('Field synthesis requires seven frozen DEM exemplars');
 return data.map((d,i)=>{if(d.id!==refs[i]||d.size!==193||typeof d.data!=='string'||d.data.length!==Math.ceil(193*193*2/3)*4||!d.metadata?.sampleSha256||!d.metadata?.attribution)throw Error('Invalid DEM exemplar '+i);return d;});
}
export function packExemplars(library){return refs.map(id=>{const d=library.find(x=>x.id===id);if(!d||d.size!==385)throw Error('Missing reference '+id);const N=193,a=new Uint8Array(N*N*2),view=new DataView(a.buffer);for(let y=0;y<N;y++)for(let x=0;x<N;x++)view.setInt16((y*N+x)*2,Math.round(d.metres[y*2*d.size+x*2]),true);let text='';for(let i=0;i<a.length;i+=8192)text+=String.fromCharCode(...a.subarray(i,i+8192));return {id,size:N,data:btoa(text),metadata:d.metadata};});}
function decode(d){const str=atob(d.data),a=new Float32Array(d.size*d.size);let lo=Infinity,hi=-Infinity;for(let i=0;i<a.length;i++){let v=str.charCodeAt(i*2)|(str.charCodeAt(i*2+1)<<8);if(v>32767)v-=65536;a[i]=v;lo=Math.min(lo,v);hi=Math.max(hi,v);}return {...d,a,lo,hi};}
function sample(a,n,x,y){x=C(x,0,n-1);y=C(y,0,n-1);const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,X=Math.min(n-1,i+1),Y=Math.min(n-1,j+1);return L(L(a[j*n+i],a[j*n+X],u),L(a[Y*n+i],a[Y*n+X],u),v);}
function binsFor(items,pad){const bins=new Map(),tile=8;for(const p of items){const r=pad(p);for(let y=Math.floor((p.y-r)/tile);y<=Math.floor((p.y+r)/tile);y++)for(let x=Math.floor((p.x-r)/tile);x<=Math.floor((p.x+r)/tile);x++){const k=x+','+y;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(p);}}return (x,y)=>bins.get(Math.floor(x/tile)+','+Math.floor(y/tile))||[];}
function centers(seed,W,H,land,coast,rng){const a=[];for(let y=7;y<H-7;y+=6)for(let x=7;x<W-7;x+=6){const i=y*W+x;if(land[i]&&coast[i]>3)a.push({x,y,score:coast[i]*.4+rng()*16});}a.sort((a,b)=>b.score-a.score);const out=[];for(const p of a){if(out.length>=Math.max(2,Math.round(W*H/3700)))break;if(out.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<25))continue;out.push(p);}return out;}
function branch(rng,x,y,angle,len,width,amp,depth,profile){
 const peaks=[{t:-1,h:0}],count=3+Math.floor(rng()*4);for(let i=0;i<count;i++)peaks.push({t:-.82+(i+rng()*.65)*1.64/count,h:amp*(.52+rng()*.48),w:width*(.62+rng()*.73)});peaks.push({t:1,h:0});
 return {x,y,angle,len,width,amp,depth,profile,bend:(rng()-.5)*len*.42,bend2:(rng()-.5)*len*.20,peaks};
}
function crest(p,t){return p.bend*Math.sin(t*Math.PI*.65)+p.bend2*(1-t*t);}
function envelope(p,t){let i=1;while(i<p.peaks.length-1&&p.peaks[i].t<t)i++;const a=p.peaks[i-1],b=p.peaks[i],u=S((t-a.t)/(b.t-a.t));return {h:L(a.h,b.h,u),w:L(a.w??p.width,b.w??p.width,u)};}
function evaluate(p,x,y){const dx=x-p.x,dy=y-p.y,co=Math.cos(p.angle),si=Math.sin(p.angle),u=(dx*co+dy*si)/p.len;if(Math.abs(u)>=1)return 0;const v=-dx*si+dy*co-crest(p,u),e=envelope(p,u),r=Math.abs(v)/(e.w*(v<0?.78:1.17));if(r>3.5)return 0;
 // No cusp at the crest and no repeating periodic folding. Regional
 // cross sections range from rounded domes to steep alpine shoulders.
 const a=p.profile===0?1.65:p.profile===1?1.1:.72;
 return e.h*(.74*Math.exp(-r*r*a)+.26*Math.exp(-r*r*.24))*S((3.5-r)/.7);
}
function naturalRanges(seed,W,H,land,coast){
 const rng=random(seed+':natural'),salt=Math.floor(rng()*2**31),chains=[],branches=[];
 for(const c of centers(seed,W,H,land,coast,rng)){const i=c.y*W+c.x,profile=coast[i]>14?(rng()<.55?1:0):2,amp=(profile===1?.42:profile===0?.29:.20)+rng()*.19,p=branch(rng,c.x,c.y,rng()*Math.PI*2,19+rng()*16,3.3+rng()*3.4,amp,0,profile);chains.push(p);branches.push(p);
 for(let k=0;k<4;k++){const t=-.65+k*.40+(rng()-.5)*.20,e=envelope(p,t),co=Math.cos(p.angle),si=Math.sin(p.angle),X=p.x+co*t*p.len-si*crest(p,t),Y=p.y+si*t*p.len+co*crest(p,t),side=k%2?1:-1,theta=p.angle+side*(.6+rng()*.85),len=5+rng()*8,q=branch(rng,X+Math.cos(theta)*len*.45,Y+Math.sin(theta)*len*.45,theta,len,p.width*(.38+rng()*.22),e.h*.82,1,profile);branches.push(q);
 const t2=.20+rng()*.35,angle=theta-side*(.50+rng()*.55),length=3+rng()*4;branches.push(branch(rng,q.x+Math.cos(theta)*len*t2+Math.cos(angle)*length*.30,q.y+Math.sin(theta)*len*t2+Math.sin(angle)*length*.30,angle,length,q.width*.67,q.amp*.56,2,profile));}
 }
 const near=binsFor(branches,p=>p.len+Math.abs(p.bend)+Math.abs(p.bend2)+p.width*5);
 return {salt,chains,field(x,y){let sum=0;for(const p of near(x,y)){const a=evaluate(p,x,y);sum+=a**5;}const uplift=Math.pow(sum,.2);return {uplift,foot:uplift*.06};}};
}
function geographicField(seed,W,H,land,coast,exemplars){
 const rng=random(seed+':field'),salt=Math.floor(rng()*2**31),library=exemplars.map(decode),regions=[];
 // Entire 48 km landscapes, not details inserted into pre-existing mountains.
 // Nonperiodic staggered centers, orientation and anisotropic scale are seeded.
 for(let y=-8;y<H+24;y+=27)for(let x=-8;x<W+24;x+=27){const X=x+(rng()-.5)*10,Y=y+(rng()-.5)*10,i=C(Math.round(Y),0,H-1)*W+C(Math.round(X),0,W-1),inland=coast[i],pool=inland>15?[0,1,2,3]:inland>6?[1,2,3,4,5]:[4,5,6],d=library[pool[Math.floor(rng()*pool.length)]],angle=rng()*Math.PI*2,scale=.82+rng()*.38;
 const amplitude=d.id==='alpine'?.54:d.id==='carpathian'?.36:d.id==='gorge'?.31:d.id==='foothills'?.38:d.id==='low-ridge'?.23:d.id==='rolling'?.15:.24;
 regions.push({x:X,y:Y,d,angle,scale,stretch:.88+rng()*.24,amplitude});}
 const near=binsFor(regions,()=>43);
 return {salt,chains:regions.map(({d,...p})=>({...p,source:d.id})),field(x,y){let sum=0,weight=0;for(const p of near(x,y)){const dx=x-p.x,dy=y-p.y,co=Math.cos(p.angle),si=Math.sin(p.angle),u=(dx*co+dy*si)/p.scale,v=(-dx*si+dy*co)/(p.scale*p.stretch),radius=Math.hypot(u,v)/24;if(radius>=1)continue;const w=(1-radius*radius)**2,h=sample(p.d.a,p.d.size,96+u*4,96+v*4),base=p.d.id==='coastal'?0:p.d.lo,span=Math.max(600,p.d.hi-base);sum+=C((h-base)/span)*p.amplitude*w;weight+=w;}return {uplift:weight?sum/weight:0,foot:0};}};
}
export function naturalGeology(seed,W,H,land,coast,config){return config.approach==='natural'?naturalRanges(seed,W,H,land,coast):geographicField(seed,W,H,land,coast,config.exemplars);}
