// Explicit geographic contours. Immutable authority; no decorative flooding.
import {lakeBasins} from './genesis-waters.mjs';
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),L=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=C(t);return t*t*(3-2*t)};
const clock=()=>globalThis.performance?.now?.()??Date.now();
function cubic(a,b,c,d,t){const u=(c-a)*.5,v=(d-b)*.5;return C((2*t*t*t-3*t*t+1)*b+(t*t*t-2*t*t+t)*u+(-2*t*t*t+3*t*t)*c+(t*t*t-t*t)*v,Math.min(b,c),Math.max(b,c));}
// Scalar fields use physical bed, not a second interpolation of binary water.
// An inland component must have a represented seed; the only allowed visual
// extension is within half a coarse cell of an existing represented fine node.
export function contourField(m){
 const g=m.geography,r=g.detail,w=g.width,h=g.height,W=(w-1)/r,H=(h-1)/r,basins=lakeBasins(g);
 const at=(x,y)=>C(y,0,h-1)*w+C(x,0,w-1);
 const scalar=(X,Y,get)=>{const x=Math.floor(X),y=Math.floor(Y),u=X-x,v=Y-y;return L(L(get(at(x,y)),get(at(x+1,y)),u),L(get(at(x,y+1)),get(at(x+1,y+1)),u),v);};
 const bed=(X,Y)=>{const x=Math.floor(X),y=Math.floor(Y),u=X-x,v=Y-y,rr=k=>cubic(g.bed[at(x-1,k)],g.bed[at(x,k)],g.bed[at(x+1,k)],g.bed[at(x+2,k)],u);return cubic(rr(y-1),rr(y),rr(y+1),rr(y+2),v);};
 function sample(X,Y){
 const fx=X*r,fy=Y*r,x=Math.floor(fx),y=Math.floor(fy),z=bed(fx,fy),coast=scalar(fx,fy,i=>g.land[i]?Math.max(.0001,g.bed[i]-.12):Math.min(-.0001,g.bed[i]-.12));
 let id=0,best=Infinity;for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){const j=at(x+dx,y+dy),label=basins.labels[j],d=(fx-x-dx)**2+(fy-y-dy)**2;if(label&&d<best){id=label;best=d;}}
 let distance=Infinity,level=id?basins.levels[id]:0,physical=-1,limit=-1;
 if(id){const range=Math.ceil(r*.5)+1;for(let dy=-range;dy<=range;dy++)for(let dx=-range;dx<=range;dx++){const j=at(x+dx,y+dy);if(g.lakeWater[j]&&basins.labels[j]===id)distance=Math.min(distance,Math.hypot(fx-x-dx,fy-y-dy)/r);}
 physical=level-z;limit=(.5-distance)*.08;
 }
 const lake=id?Math.min(physical,limit,coast): -1;
 return {bed:z,coast,lake,level,id,physical,limit,distance,coarseLand:!!m.land[C(Math.floor(Y),0,H-1)*W+C(Math.floor(X),0,W-1)]};
 }
 return {sample,basins,bed,W,H};
}
// Clip a triangle on its scalar zero line. Interpolated crossings are exact
// shared-edge intersections, independent of screen pixels and material LOD.
export function clipWet(tri){
 const out=[];for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],aw=a.v>0,bw=b.v>0;if(aw)out.push(a);if(aw!==bw){const t=a.v/(a.v-b.v);out.push({x:L(a.x,b.x,t),y:L(a.y,b.y,t),z:L(a.z,b.z,t),v:0,depth:0});}}
 return out;
}
export function contourColor(kind,depth,grade=0){const q=smooth(depth/(kind===1?.035:.052)),rock=smooth(grade/.12),shallow=kind===1?[85-rock*22,108-rock*16,110-rock*11]:[99-rock*23,119-rock*19,110-rock*10],deep=kind===1?[38,65,83]:[44,72,80];return deep.map((v,i)=>L(shallow[i],v,q));}
export async function buildContours(m,bounds,{detail=8,vertical,yieldRow=async()=>{},diagnostic=false}={}){
 const f=contourField(m),[x0,y0,x1,y1]=bounds,w=(x1-x0)*detail+1,h=(y1-y0)*detail+1,n=w*h,sea=new Float32Array(n),lake=new Float32Array(n),bed=new Float32Array(n),ids=new Int32Array(n),levels=new Float32Array(n),coarse=new Uint8Array(n),stats={sea:0,lake:0,shoreSegments:0,axisSegments:0,coarseMismatch:0,lakeOutside:0,coarseLakeDry:0,physicalLimited:0,extensionLimited:0,diagonalSaddles:0},begin=clock();let last=begin,maxSlice=0;
 const pause=async()=>{const t=clock();if(t-last>6){maxSlice=Math.max(maxSlice,t-last);await yieldRow();last=clock();}};
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,p=f.sample(x0+x/detail,y0+y/detail);sea[i]=-p.coast;lake[i]=p.lake;bed[i]=p.bed;ids[i]=p.id;levels[i]=p.level;coarse[i]=+p.coarseLand;stats.coarseMismatch+=+(p.coarseLand===(p.coast<0||p.lake>0));stats.lakeOutside+=+(p.coarseLand&&p.lake>0);stats.coarseLakeDry+=+(!p.coarseLand&&p.coast>=0&&p.lake<=0);if(p.id&&p.physical>0){stats.physicalLimited+=+(p.physical<=p.limit);stats.extensionLimited+=+(p.limit<p.physical);}}await pause();}
 // Packed non-indexed vertices: xyz + rgb. Interior water uses larger blocks;
 // every boundary is clipped at full contour resolution. Shared edges match.
 const chunks=[],tile=16*detail;
 for(let ty=0;ty<h-1;ty+=tile)for(let tx=0;tx<w-1;tx+=tile){const X=Math.min(w-1,tx+tile),Y=Math.min(h-1,ty+tile),data=[];let zmin=Infinity,zmax=-Infinity;
 const point=(x,y,kind,id)=>{const i=y*w+x,level=kind===1?.12:levels[i],v=kind===1?sea[i]:ids[i]===id?lake[i]:-Math.max(.001,Math.abs(lake[i]));return {x:x0+x/detail,y:y0+y/detail,z:vertical(level)+.018,v,depth:Math.max(0,level-bed[i])};};
 function emit(poly,kind){if(poly.length<3)return;const edge=poly.filter(p=>p.v===0);if(edge.length===2){stats.shoreSegments++;stats.axisSegments+=+(Math.abs(edge[0].x-edge[1].x)<1e-6||Math.abs(edge[0].y-edge[1].y)<1e-6);}
 for(let i=1;i+1<poly.length;i++){for(const p of [poly[0],poly[i],poly[i+1]]){const color=diagnostic?(kind===1?[68,106,143]:[82,137,150]):contourColor(kind,p.depth);data.push(p.x,p.y,p.z,...color.map(c=>c/255));zmin=Math.min(zmin,p.z);zmax=Math.max(zmax,p.z);}stats[kind===1?'sea':'lake']++;}}
 function block(x,y,step,kind){const corners=[y*w+x,y*w+x+step,(y+step)*w+x+step,(y+step)*w+x],field=kind===1?sea:lake;let id=kind===1?0:ids[corners.find(i=>field[i]>0)??corners[0]];
 if(step>1){let wet=0,dry=0,lo=Infinity,hi=-Infinity;for(let j=y;j<=y+step;j++)for(let i=x;i<=x+step;i++){const k=j*w+i,yes=field[k]>0&&(kind===1||ids[k]===id);if(yes){wet++;const d=(kind===1?.12:levels[k])-bed[k];lo=Math.min(lo,d);hi=Math.max(hi,d);}else dry++;}
 if(!wet)return;if(dry||hi-lo>.025){const s=step/2;for(const dy of [0,s])for(const dx of [0,s])block(x+dx,y+dy,s,kind);return;}}
 const p=[point(x,y,kind,id),point(x+step,y,kind,id),point(x+step,y+step,kind,id),point(x,y+step,kind,id)];
 if(kind===2&&step===1){const allIds=new Set(corners.filter(i=>lake[i]>0).map(i=>ids[i]));if(allIds.size>1){for(const k of allIds){const a=[point(x,y,kind,k),point(x+1,y,kind,k),point(x+1,y+1,kind,k),point(x,y+1,kind,k)],z=vertical(f.basins.levels[k])+.018;for(const v of a)v.z=z;emit(clipWet([a[0],a[1],a[2]]),kind);emit(clipWet([a[0],a[2],a[3]]),kind);}return;}for(const v of p)v.z=vertical(f.basins.levels[id]??0)+.018;}
 const wet=p.map(a=>a.v>0),saddle=wet[0]===wet[2]&&wet[1]===wet[3]&&wet[0]!==wet[1];let diag=true;
 if(saddle){stats.diagonalSaddles++;const center=(p[0].v+p[1].v+p[2].v+p[3].v)/4;diag=(center>0)===wet[0];}
 emit(clipWet(diag?[p[0],p[1],p[2]]:[p[0],p[1],p[3]]),kind);emit(clipWet(diag?[p[0],p[2],p[3]]:[p[1],p[2],p[3]]),kind);}
 for(let y=ty;y<Y;y+=4)for(let x=tx;x<X;x+=4){let step=Math.min(4,X-x,Y-y);if(step===4){block(x,y,4,1);block(x,y,4,2);}else for(let j=y;j<Math.min(y+4,Y);j++)for(let i=x;i<Math.min(x+4,X);i++){block(i,j,1,1);block(i,j,1,2);}}
 if(data.length)chunks.push({vertices:Float32Array.from(data),x0:x0+tx/detail,y0:y0+ty/detail,x1:x0+X/detail,y1:y0+Y/detail,zmin,zmax});await pause();}
 return {chunks,stats:{...stats,detail,ms:clock()-begin,maxSlice:Math.max(maxSlice,clock()-last),bytes:chunks.reduce((n,c)=>n+c.vertices.byteLength,0)}};
}
