// Living Atlas visual candidate. No writes to physical or gameplay geography.
import {watersMaterial} from './genesis-waters.mjs';
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)},mix=(a,b,t)=>a.map((v,i)=>L(v,b[i],C(t)));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function reachRibbons(g,bounds,{vertical,threshold=25,allow=null,overview=false,continuous=false,identity=false}={}){
 const [x0,y0,x1,y1]=bounds,r=g.detail,w=g.width,h=g.height,tiles=new Map(),nodes=new Map(),edges=new Map(),incoming=new Map(),pad=3;
 const allowed=i=>i>=0&&i<w*h&&(!allow||allow(i%w/r,Math.floor(i/w)/r));
 const wet=i=>!!g.lakeWater?.[i]||!g.land[i],flow=i=>g.flow[i]/(r*r);
 const get=i=>{let p=nodes.get(i);if(p)return p;const x=i%w/r,y=Math.floor(i/w)/r,bed=g.bed[i],level=g.lakeId?.[i]?g.lakeLevels[g.lakeId[i]]:!g.land[i]?.12:bed;p={i,x,y,bed,z:vertical(level)+.028,q:flow(i)};nodes.set(i,p);return p;};
 const width=q=>continuous?C(.012+.012*Math.log2(Math.max(25,q)/25),.012,.087):C(.013+.014*Math.log2(Math.max(25,q)/25),.013,.105);
 for(let y=Math.max(0,Math.floor((y0-pad)*r));y<=Math.min(h-1,Math.ceil((y1+pad)*r));y++)for(let x=Math.max(0,Math.floor((x0-pad)*r));x<=Math.min(w-1,Math.ceil((x1+pad)*r));x++){
 const i=y*w+x;if(!allowed(i)||!g.land[i]||flow(i)<threshold)continue;const j=g.down[i];if(!allowed(j)||i===j||wet(i)&&wet(j))continue;edges.set(i,j);const inc=incoming.get(j)??[];inc.push(i);incoming.set(j,inc);get(i);get(j);}
 const paths=[],used=new Set(),start=i=>wet(i)||(incoming.get(i)?.length??0)!==1;
 function trace(i){const ids=[i];while(edges.has(i)&&!used.has(i)){used.add(i);i=edges.get(i);ids.push(i);if(start(i))break;}if(ids.length>1)paths.push(ids);}
 for(const i of edges.keys())if(start(i))trace(i);for(const i of edges.keys())if(!used.has(i))trace(i);
 const bedAt=(x,y)=>{const fx=C(x*r,0,w-1),fy=C(y*r,0,h-1),a=Math.floor(fx),b=Math.floor(fy),u=fx-a,v=fy-b,X=Math.min(w-1,a+1),Y=Math.min(h-1,b+1);return L(L(g.bed[b*w+a],g.bed[b*w+X],u),L(g.bed[Y*w+a],g.bed[Y*w+X],u),v);};
 let triangles=0,drawnEdges=0,shifted=0,maxShift=0,junctions=0,curvedSamples=0,mouthSections=0;
 function tileFor(p){const key=Math.floor(p.x/16)+':'+Math.floor(p.y/16);let t=tiles.get(key);if(!t){t={data:[],x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity,zmin:Infinity,zmax:-Infinity};tiles.set(key,t);}return t;}
 function emit(t,p,color){t.data.push(p.x,p.y,p.z,...color);t.x0=Math.min(t.x0,p.x);t.x1=Math.max(t.x1,p.x);t.y0=Math.min(t.y0,p.y);t.y1=Math.max(t.y1,p.y);t.zmin=Math.min(t.zmin,p.z);t.zmax=Math.max(t.zmax,p.z);}
 function tri(t,a,b,c,color){for(const p of [a,b,c])emit(t,p,p.color??color);triangles++;}
 const color=[.19,.32,.37],bank=[.24,.35,.34],inBounds=p=>p.x>=x0-.7&&p.x<=x1+.7&&p.y>=y0-.7&&p.y<=y1+.7;
 for(const ids of paths){
 const raw=ids.map(get),pts=raw.map(p=>({...p}));
 // Filter entire reach; the displacement is bounded by the fine cell and
 // rejected when the actual valley bed rises. No invented sinusoidal bends.
 for(let k=2;k<raw.length-2;k++){const p=raw[k],a=raw[k-1],b=raw[k+1],u=raw[k-2],v=raw[k+2];if(wet(p.i))continue;const grade=Math.abs(a.bed-b.bed)/Math.max(.001,dist(a,b)),flat=1-S(grade/.12),x=(u.x+4*a.x+6*p.x+4*b.x+v.x)/16,y=(u.y+4*a.y+6*p.y+4*b.y+v.y)/16,d=Math.hypot(x-p.x,y-p.y),f=Math.min(1,.42/r/Math.max(d,1e-6))*flat,xx=L(p.x,x,f),yy=L(p.y,y,f);if((!allow||allow(xx,yy))&&bedAt(xx,yy)<=p.bed+.004){pts[k].x=xx;pts[k].y=yy;shifted+=+(f*d>1e-6);maxShift=Math.max(maxShift,f*d);}}
 let samples=[{...pts[0],water:wet(pts[0].i),edge:0}];
 for(let k=1;k<pts.length;k++){const a=pts[k-1],b=pts[k],p=pts[Math.max(0,k-2)],n=pts[Math.min(pts.length-1,k+1)],t=.5,A=2*t*t*t-3*t*t+1,B=t*t*t-2*t*t+t,D=-2*t*t*t+3*t*t,E=t*t*t-t*t,x=A*a.x+B*(b.x-p.x)*.5+D*b.x+E*(n.x-a.x)*.5,y=A*a.y+B*(b.y-p.y)*.5+D*b.y+E*(n.y-a.y)*.5,lx=L(a.x,b.x,t),ly=L(a.y,b.y,t),safe=(!allow||allow(x,y))&&Math.hypot(x-lx,y-ly)<=.2/r&&bedAt(x,y)<=L(a.bed,b.bed,t)+.004,X=safe?x:lx,Y=safe?y:ly;
 samples.push({i:a.i,x:X,y:Y,z:Math.max(L(a.z,b.z,t),vertical(bedAt(X,Y))+.028),q:L(a.q,b.q,t),water:false,edge:k});samples.push({...b,water:wet(b.i),edge:k});}
 if(identity&&!overview){ // Round corners with quadratic sections inside the actual valley corridor.
 const rounded=[samples[0]],point=(a,b,t)=>({ ...b,x:L(a.x,b.x,t),y:L(a.y,b.y,t),z:L(a.z,b.z,t),q:L(a.q,b.q,t),water:false});
 for(let k=1;k<samples.length-1;k++){const a=samples[k-1],p=samples[k],b=samples[k+1];if(p.water){rounded.push(p);continue;}const u=point(p,a,.40),w=point(p,b,.40),curve=[];let valid=true;for(let j=0;j<=4;j++){const t=j/4,X=(1-t)**2*u.x+2*t*(1-t)*p.x+t*t*w.x,Y=(1-t)**2*u.y+2*t*(1-t)*p.y+t*t*w.y;if((allow&&!allow(X,Y))||Math.hypot(X-p.x,Y-p.y)>.42/r||bedAt(X,Y)>bedAt(p.x,p.y)+.004){valid=false;break;}curve.push({...p,x:X,y:Y,z:Math.max(p.z,vertical(bedAt(X,Y))+.028),q:L(u.q,w.q,t)});}if(valid){rounded.push(...curve);curvedSamples+=curve.length;}else rounded.push(p);}
 rounded.push(samples.at(-1));samples=rounded;}
 const sections=[];for(let k=0;k<samples.length;k++){const p=samples[k],a=samples[Math.max(0,k-1)],b=samples[Math.min(samples.length-1,k+1)],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;const ux=p.x-a.x,uy=p.y-a.y,vx=b.x-p.x,vy=b.y-p.y,turn=C((ux*vy-uy*vx)/Math.max(1e-6,Math.hypot(ux,uy)*Math.hypot(vx,vy)),-1,1),end=samples.at(-1),estuary=identity&&end.water&&!g.land[end.i]?1-S(dist(p,end)/(.5+width(end.q)*5)):0;sections.push({p,nx:-dy/len,ny:dx/len,width:width(p.q)*(1+estuary*.55),turn,estuary});if(estuary>.01)mouthSections++;}
 // Shared cross sections are reused by adjacent quads, so reach turns have
 // no independent edge normals. Junction disks cover divergent tributaries.
 const pair=(s,expand=1)=>[-1,1].map(side=>{const taper=s.p.water?(continuous?.86:.72):1;const bend=identity?1+side*s.turn*.15:1;let x=s.p.x+side*s.nx*s.width*expand*taper*bend,y=s.p.y+side*s.ny*s.width*expand*taper*bend;if(continuous&&allow&&!allow(x,y)){x=s.p.x;y=s.p.y;}const z=s.p.water?s.p.z-.018:identity&&expand>1?vertical(bedAt(x,y))+.012:Math.max(s.p.z,vertical(bedAt(x,y))+(continuous&&expand>1?.010:.028));if(!continuous)return {x,y,z,...(s.p.water?{color:g.land[s.p.i]?[.31,.44,.45]:[.25,.37,.40]}:{})};const moisture=g.rain?.[s.p.i]??.5,patch=noise(s.p.x*1.5,s.p.y*1.5),riverTint=.035*(patch-.5),bankTone=mix([.45,.40,.29],[.26,.39,.26],S((moisture-.25)/.5));const edgeTone=identity?mix([.24,.39,.40],[.36,.47,.42],S((moisture-.25)/.5)):color.map(v=>v+riverTint);return {x,y,z,color:s.p.water?(g.land[s.p.i]?[.31,.44,.45]:[.25,.37,.40]):expand>1?bankTone:edgeTone};});
 for(let k=1;k<sections.length;k++){const a=sections[k-1],b=sections[k];if(!inBounds(a.p)&&!inBounds(b.p)||overview&&Math.max(a.p.q,b.p.q)<58)continue;const tile=tileFor(a.p),[p,q]=pair(a),[u,v]=pair(b);if(identity&&!overview){const center=s=>({...s.p,z:s.p.water?s.p.z-.018:s.p.z+.003,color:mix([.17,.29,.35],[.27,.40,.43],s.estuary)}),m=center(a),n=center(b);tri(tile,p,m,u,color);tri(tile,m,n,u,color);tri(tile,m,q,n,color);tri(tile,q,v,n,color);}else{tri(tile,p,q,u,color);tri(tile,q,v,u,color);}if(k%2===1)drawnEdges++;if(!overview){const [ap,aq]=pair(a,identity?1.65:1.28),[bu,bv]=pair(b,identity?1.65:1.28);tri(tile,ap,p,bu,bank);tri(tile,p,u,bu,bank);tri(tile,q,aq,v,bank);tri(tile,aq,bv,v,bank);}}
 for(const k of [0,sections.length-1]){const s=sections[k],p=s.p;if(!inBounds(p)||wet(p.i)||overview&&p.q<58)continue;const t=tileFor(p),radius=s.width;for(let j=0;j<8;j++){const ring=i=>{let x=p.x+Math.cos(i*Math.PI/4)*radius,y=p.y+Math.sin(i*Math.PI/4)*radius;if(identity&&allow&&!allow(x,y)){x=p.x;y=p.y;}return {x,y,z:Math.max(p.z,vertical(bedAt(x,y))+.028)};};tri(t,p,ring(j),ring(j+1),color);}junctions++;}
 }
 const chunks=[...tiles.values()].map(({data,...b})=>({...b,vertices:Float32Array.from(data)}));return {chunks,stats:{edges:drawnEdges,reaches:paths.length,triangles,shifted,maxShift,junctions,curvedSamples,mouthSections,bytes:chunks.reduce((n,c)=>n+c.vertices.byteLength,0)}};
}
function hash(x,y){let n=Math.imul(x+397,374761393)^Math.imul(y-581,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=S(x-i),v=S(y-j);return L(L(hash(i,j),hash(i+1,j),u),L(hash(i,j+1),hash(i+1,j+1),u),v);}
export function atlasMaterial(p,water){
 let base=watersMaterial(p,water);if(water.kind)return base;
 const {x,y,H,wet,fert,forest,slope,nx,ny,curvature,river,continuous}=p,high=S((H-.35)/.24),rock=S((slope-.14)/.44),talus=S((slope-.04)/.27)*(1-rock)*high,stand=S((forest-.18)/.55)*(1-high),patch=S((noise(x*.58,y*.58)-.22)/.6),strata=continuous?S((noise(x*3.2+H*12,y*3.2-H*9)-.15)/.7):.5+.5*Math.sin(H*132+noise(x*.38,y*.38)*3+(-ny*x+nx*y)*.7);
 base=mix(base,mix([86,83,78],[179,169,153],strata),rock*.46);
 base=mix(base,mix([133,119,99],[181,164,136],patch),talus*.38);
 base=mix(base,mix([49,78,56],[92,119,75],patch),stand*.38);const canopy=noise(x*3.1+19,y*3.1-6),edge=S((forest-.25+(patch-.5)*.22)/.4);base=mix(base,mix([45,70,49],[101,124,77],canopy),edge*(1-high)*(1-rock)*.22);
 const moist=S((wet-.45)/.35)*(1-high)*(1-rock),flood=1-S(Math.max(0,river)/.24);base=mix(base,[77,107,68],moist*flood*.34);
 const shore=1-S(water.shore/.035),sand=(1-rock)*(1-S((wet-.36)/.36)),cliff=S((slope-.16)/.36);
 base=mix(base,mix(mix([119,127,96],[185,163,120],sand),[132,124,113],cliff),shore*.58);
 return base;
}
