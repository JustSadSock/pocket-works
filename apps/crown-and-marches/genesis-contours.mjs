// Explicit geographic contours. Immutable authority; no decorative flooding.
import {lakeBasins,naturalWatersSource} from './genesis-waters.mjs';
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),L=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=C(t);return t*t*(3-2*t)};
const clock=()=>globalThis.performance?.now?.()??Date.now();
function cubic(a,b,c,d,t){const u=(c-a)*.5,v=(d-b)*.5;return C((2*t*t*t-3*t*t+1)*b+(t*t*t-2*t*t+t)*u+(-2*t*t*t+3*t*t)*c+(t*t*t-t*t)*v,Math.min(b,c),Math.max(b,c));}
// Scalar fields use physical bed, not a second interpolation of binary water.
// An inland component must have a represented seed; the only allowed visual
// extension is within half a coarse cell of an existing represented fine node.
export function contourField(m){
 const g=m.geography,r=g.detail,w=g.width,h=g.height,W=(w-1)/r,H=(h-1)/r,basins=g.lakeId?{labels:g.lakeId,levels:g.lakeLevels}:lakeBasins(g);
 const at=(x,y)=>C(y,0,h-1)*w+C(x,0,w-1);
 const scalar=(X,Y,get)=>{const x=Math.floor(X),y=Math.floor(Y),u=X-x,v=Y-y;return L(L(get(at(x,y)),get(at(x+1,y)),u),L(get(at(x,y+1)),get(at(x+1,y+1)),u),v);};
 const bed=(X,Y)=>{const x=Math.floor(X),y=Math.floor(Y),u=X-x,v=Y-y,rr=k=>cubic(g.bed[at(x-1,k)],g.bed[at(x,k)],g.bed[at(x+1,k)],g.bed[at(x+2,k)],u);return cubic(rr(y-1),rr(y),rr(y+1),rr(y+2),v);};
 function sample(X,Y){
 const fx=X*r,fy=Y*r,x=Math.floor(fx),y=Math.floor(fy),z=bed(fx,fy),coast=scalar(fx,fy,i=>g.land[i]?Math.max(.0001,g.bed[i]-.12):Math.min(-.0001,g.bed[i]-.12));
 let id=0,best=Infinity;for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){const j=at(x+dx,y+dy),label=basins.labels[j],d=(fx-x-dx)**2+(fy-y-dy)**2;if(label&&d<best){id=label;best=d;}}
 let distance=Infinity,level=id?basins.levels[id]:0,physical=-1,limit=-1;
 if(g.lakeId){if(id){physical=level-z;const support=scalar(fx,fy,i=>{const d=level-g.bed[i];return g.lakeId[i]===id?Math.max(.000001,d):Math.min(-.000001,d);});const lake=Math.min(physical,support,coast);return {bed:z,coast,lake,level,id,physical,limit:Infinity,distance:0,coarseLand:!!m.land[C(Math.floor(Y),0,H-1)*W+C(Math.floor(X),0,W-1)]};}return {bed:z,coast,lake:-1,level:0,id:0,physical:-1,limit:Infinity,distance:Infinity,coarseLand:!!m.land[C(Math.floor(Y),0,H-1)*W+C(Math.floor(X),0,W-1)]};}
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
 const out=[];for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],aw=a.v>0,bw=b.v>0;if(aw)out.push(a);if(aw!==bw){const t=a.v/(a.v-b.v);out.push({x:L(a.x,b.x,t),y:L(a.y,b.y,t),z:L(a.z,b.z,t),v:0,depth:0,grade:L(a.grade??0,b.grade??0,t)});}}
 return out;
}
export function contourColor(kind,depth,grade=0){const q=smooth(depth/(kind===1?.035:.052)),rock=smooth(grade/.12),shallow=kind===1?[85-rock*22,108-rock*16,110-rock*11]:[99-rock*23,119-rock*19,110-rock*10],deep=kind===1?[38,65,83]:[44,72,80];return deep.map((v,i)=>L(shallow[i],v,q));}
export async function buildContours(m,bounds,{detail=8,vertical,yieldRow=async()=>{},diagnostic=false,allow=null}={}){
 const f=contourField(m),[x0,y0,x1,y1]=bounds,w=(x1-x0)*detail+1,h=(y1-y0)*detail+1,n=w*h,sea=new Float32Array(n),lake=new Float32Array(n),bed=new Float32Array(n),ids=new Int32Array(n),levels=new Float32Array(n),coarse=new Uint8Array(n),permitted=allow?new Uint8Array(n):null,stats={sea:0,lake:0,shoreSegments:0,axisSegments:0,coarseMismatch:0,lakeOutside:0,coarseLakeDry:0,coarseBoundaryEdges:0,fineBoundaryEdges:0,lakeMaskBoundaryEdges:0,physicalLimited:0,extensionLimited:0,diagonalSaddles:0},begin=clock();let last=begin,maxSlice=0;
 const g=m.geography,scan=(a,w,h)=>{let edges=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x+1<w&&a[i]!==a[i+1])edges++;if(y+1<h&&a[i]!==a[i+w])edges++;}return edges;};if(!allow){stats.coarseBoundaryEdges=scan(m.land,f.W,f.H);stats.fineBoundaryEdges=scan(g.land,g.width,g.height);stats.lakeMaskBoundaryEdges=scan(g.lakeWater,g.width,g.height);}
 const pause=async()=>{const t=clock();if(t-last>6){maxSlice=Math.max(maxSlice,t-last);await yieldRow();last=clock();}};
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=y*w+x,X=x0+x/detail,Y=y0+y/detail;if(allow&&!allow(X,Y)){sea[i]=lake[i]=-1;continue;}if(permitted)permitted[i]=1;const p=f.sample(X,Y);sea[i]=-p.coast;lake[i]=p.lake;bed[i]=p.bed;ids[i]=p.id;levels[i]=p.level;coarse[i]=+p.coarseLand;stats.coarseMismatch+=+(p.coarseLand===(p.coast<0||p.lake>0));stats.lakeOutside+=+(p.coarseLand&&p.lake>0);stats.coarseLakeDry+=+(!p.coarseLand&&p.coast>=0&&p.lake<=0);if(p.id&&p.physical>0){stats.physicalLimited+=+(p.physical<=p.limit);stats.extensionLimited+=+(p.limit<p.physical);}}await pause();}
 // Packed non-indexed vertices: xyz + rgb. Interior water uses larger blocks;
 // every boundary is clipped at full contour resolution. Shared edges match.
 const chunks=[],tile=16*detail;
 for(let ty=0;ty<h-1;ty+=tile)for(let tx=0;tx<w-1;tx+=tile){const X=Math.min(w-1,tx+tile),Y=Math.min(h-1,ty+tile),data=[];let zmin=Infinity,zmax=-Infinity;
 const point=(x,y,kind,id)=>{const i=y*w+x,level=kind===1?.12:levels[i],v=kind===1?sea[i]:ids[i]===id?lake[i]:-Math.max(.001,Math.abs(lake[i]));return {x:x0+x/detail,y:y0+y/detail,z:vertical(level)+.018,v,depth:Math.max(0,level-bed[i]),grade:Math.hypot(bed[y*w+Math.min(w-1,x+1)]-bed[y*w+Math.max(0,x-1)],bed[Math.min(h-1,y+1)*w+x]-bed[Math.max(0,y-1)*w+x])*detail*.5};};
 function emit(poly,kind){if(poly.length<3)return;const edge=poly.filter(p=>p.v===0);if(edge.length===2){stats.shoreSegments++;stats.axisSegments+=+(Math.abs(edge[0].x-edge[1].x)<1e-6||Math.abs(edge[0].y-edge[1].y)<1e-6);}
 for(let i=1;i+1<poly.length;i++){for(const p of [poly[0],poly[i],poly[i+1]]){const color=diagnostic?(kind===1?[68,106,143]:[82,137,150]):contourColor(kind,p.depth,p.grade);data.push(p.x,p.y,p.z,...color.map(c=>c/255));zmin=Math.min(zmin,p.z);zmax=Math.max(zmax,p.z);}stats[kind===1?'sea':'lake']++;}}
 function block(x,y,step,kind){if(permitted){let unsafe=false;for(let j=y;j<=y+step&&!unsafe;j++)for(let i=x;i<=x+step;i++)if(!permitted[j*w+i]){unsafe=true;break;}if(unsafe){if(step>1){const s=step/2;for(const dy of [0,s])for(const dx of [0,s])block(x+dx,y+dy,s,kind);}return;}}const corners=[y*w+x,y*w+x+step,(y+step)*w+x+step,(y+step)*w+x],field=kind===1?sea:lake;let id=kind===1?0:ids[corners.find(i=>field[i]>0)??corners[0]];if(kind===2&&step>1&&!id){for(let j=y;j<=y+step&&!id;j++)for(let i=x;i<=x+step&&!id;i++)if(lake[j*w+i]>0)id=ids[j*w+i];}
 if(step>1){let wet=0,dry=0,lo=Infinity,hi=-Infinity;for(let j=y;j<=y+step;j++)for(let i=x;i<=x+step;i++){const k=j*w+i,yes=field[k]>0&&(kind===1||ids[k]===id);if(yes){wet++;const d=(kind===1?.12:levels[k])-bed[k];lo=Math.min(lo,d);hi=Math.max(hi,d);}else dry++;}
 if(!wet)return;if(dry||hi-lo>.025){const s=step/2;for(const dy of [0,s])for(const dx of [0,s])block(x+dx,y+dy,s,kind);return;}}
 const p=[point(x,y,kind,id),point(x+step,y,kind,id),point(x+step,y+step,kind,id),point(x,y+step,kind,id)];if(kind===2&&id)for(const v of p)v.z=vertical(f.basins.levels[id])+.018;
 if(kind===2&&step===1){const allIds=new Set(corners.filter(i=>lake[i]>0).map(i=>ids[i]));if(allIds.size>1){for(const k of allIds){const a=[point(x,y,kind,k),point(x+1,y,kind,k),point(x+1,y+1,kind,k),point(x,y+1,kind,k)],z=vertical(f.basins.levels[k])+.018;for(const v of a)v.z=z;emit(clipWet([a[0],a[1],a[2]]),kind);emit(clipWet([a[0],a[2],a[3]]),kind);}return;}for(const v of p)v.z=vertical(f.basins.levels[id]??0)+.018;}
 const wet=p.map(a=>a.v>0),saddle=wet[0]===wet[2]&&wet[1]===wet[3]&&wet[0]!==wet[1];let diag=true;
 if(saddle){stats.diagonalSaddles++;const center=(p[0].v+p[1].v+p[2].v+p[3].v)/4;diag=(center>0)===wet[0];}
 emit(clipWet(diag?[p[0],p[1],p[2]]:[p[0],p[1],p[3]]),kind);emit(clipWet(diag?[p[0],p[2],p[3]]:[p[1],p[2],p[3]]),kind);}
 for(let y=ty;y<Y;y+=4)for(let x=tx;x<X;x+=4){let step=Math.min(4,X-x,Y-y);if(step===4){block(x,y,4,1);block(x,y,4,2);}else for(let j=y;j<Math.min(y+4,Y);j++)for(let i=x;i<Math.min(x+4,X);i++){block(i,j,1,1);block(i,j,1,2);}}
 if(data.length)chunks.push({vertices:Float32Array.from(data),x0:x0+tx/detail,y0:y0+ty/detail,x1:x0+X/detail,y1:y0+Y/detail,zmin,zmax});await pause();}
 return {chunks,stats:{...stats,detail,ms:clock()-begin,maxSlice:Math.max(maxSlice,clock()-last),bytes:chunks.reduce((n,c)=>n+c.vertices.byteLength,0)}};
}

// Independent terrain material samples and contour geometry. Only explicit
// revealed fixtures may read fine geography; partial maps take the existing
// charted-only source through the caller's fallback, never this cache.
const bakedCache=new WeakMap();
export class SpatialLRU {
 constructor(limit=32*1024*1024){this.limit=limit;this.bytes=0;this.items=new Map();}
 get(k){const a=this.items.get(k);if(a){this.items.delete(k);this.items.set(k,a);}return a?.value;}
 put(k,value,bytes){const old=this.items.get(k);if(old)this.bytes-=old.bytes;this.items.delete(k);if(bytes>this.limit)return value;this.items.set(k,{value,bytes});this.bytes+=bytes;while(this.bytes>this.limit){const key=this.items.keys().next().value;this.bytes-=this.items.get(key).bytes;this.items.delete(key);}return value;}
 clear(){this.items.clear();this.bytes=0;}
}
export async function contourSource(s,cam,{bounds,detail=8,contourDetail=8,vertical,yieldRow=async()=>{},diagnostic=false}={}){
 if(s.mapVersion!==3||!s.autonomous||(s.discovery&&!s.discovery.fullMap&&!s.autonomous))throw Error('Explicit revealed v3 required for contour source');
 const m=s.map,g=m.geography,cache=bakedCache.get(g)??new SpatialLRU();bakedCache.set(g,cache);const key=[...bounds,detail,contourDetail,diagnostic].join(':');const hit=cache.get(key);if(hit)return {...hit,stats:{...hit.stats,cacheHit:true,cacheBytes:cache.bytes}};
 const source=await naturalWatersSource(s,cam,{bounds,detail,vertical,yieldRow}),field=contourField(m),[x0,y0]=bounds,begin=clock();
 // Keep a physical terrain bed underneath the independent clipped water.
 // Lake surface and ocean plane are not baked into terrain or materials.
 for(let y=0;y<source.rows;y++){for(let x=0;x<source.cols;x++){const i=y*source.cols+x,o=i*9,X=x0+x/detail,Y=y0+y/detail,p=field.sample(X,Y),wet=p.coast<0||p.lake>0,z=p.coast<0?-(Math.max(0,.12-p.bed)*3.1+.025):vertical(p.bed);
 source.vertices[o+2]=z;source.vertices[o+3]=p.bed;source.vertices[o+7]=1;source.elevations[i]=z;source.water.kind[i]=0;source.water.depth[i]=0;source.water.shore[i]=Math.max(.00001,Math.min(Math.abs(p.coast),Math.abs(p.lake)));if(wet)source.vertices[o+8]=1;else source.vertices[o+8]=Math.max(.016,source.vertices[o+8]);
 }if(y%8===0)await yieldRow();}
 source.contours=await buildContours(m,bounds,{detail:contourDetail,vertical,yieldRow,diagnostic});const rivers=riverRibbons(g,bounds,{vertical,threshold:contourDetail<=4?58:25});source.contours.chunks.push(...rivers.chunks);source.contours.stats.rivers=rivers.stats;source.contours.stats.bytes+=rivers.stats.bytes;source.diagnostic=diagnostic;
 source.stats={...source.stats,ms:source.stats.ms+clock()-begin,contours:source.contours.stats,bytes:source.stats.bytes+source.contours.stats.bytes,cacheHit:false};cache.put(key,source,source.stats.bytes);source.stats.cacheBytes=cache.bytes;return source;
}
export function clearContourCache(g){bakedCache.get(g)?.clear();bakedCache.delete(g);}

// Geometry is world-space and independent of the terrain mesh LOD.
// Edge endpoint and width are shared by every adjacent ribbon.
export function riverRibbons(g,bounds,{vertical,threshold=25,allow=null}={}){
 const [x0,y0,x1,y1]=bounds,r=g.detail,w=g.width,h=g.height,tiles=new Map(),allowed=i=>i>=0&&(!allow||allow((i%w)/r,Math.floor(i/w)/r)),valid=i=>allowed(i)&&g.land[i]&&!g.lakeWater?.[i]&&g.flow[i]/(r*r)>=threshold;
 const node=i=>({x:(i%w)/r,y:Math.floor(i/w)/r,z:vertical(g.lakeWater?.[i]?(g.lakeId?g.lakeLevels[g.lakeId[i]]:g.surface[i]):g.bed[i])+.035,w:C(.018+.024*Math.log2(Math.max(12,g.flow[i]/(r*r))/12),.018,.165)});
 const incoming=i=>{const x=i%w,y=Math.floor(i/w),a=[];for(let Y=Math.max(0,y-1);Y<=Math.min(h-1,y+1);Y++)for(let X=Math.max(0,x-1);X<=Math.min(w-1,x+1);X++){const j=Y*w+X;if(valid(j)&&g.down[j]===i)a.push(j);}return a;};
 let edges=0,triangles=0;
 for(let y=Math.max(0,Math.floor((y0-1)*r));y<=Math.min(h-1,Math.ceil((y1+1)*r));y++)for(let x=Math.max(0,Math.floor((x0-1)*r));x<=Math.min(w-1,Math.ceil((x1+1)*r));x++){
 const i=y*w+x;if(!valid(i))continue;const j=g.down[i];if(!allowed(j))continue;
 const a=node(i),b=node(j),inc=incoming(i),next=g.down[j],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;
 const prev=inc.length===1?node(inc[0]):null,post=valid(j)&&next>=0&&incoming(j).length===1?node(next):null;
 const tx=prev?(b.x-prev.x)*.5:dx,ty=prev?(b.y-prev.y)*.5:dy,ux=post?(post.x-a.x)*.5:dx,uy=post?(post.y-a.y)*.5:dy;
 const bend=((Math.imul(i+1,2654435761)>>>0)/4294967295-.5)*.12/r;
 const points=[];for(let k=0;k<=4;k++){const t=k/4,t2=t*t,t3=t2*t,A=2*t3-3*t2+1,B=t3-2*t2+t,D=-2*t3+3*t2,E=t3-t2;
 points.push({x:A*a.x+B*tx+D*b.x+E*ux-dy/len*Math.sin(Math.PI*t)**2*bend,y:A*a.y+B*ty+D*b.y+E*uy+dx/len*Math.sin(Math.PI*t)**2*bend,z:L(a.z,b.z,t),w:L(a.w,b.w,t)});}
 const key=Math.floor(x/r/16)+':'+Math.floor(y/r/16),tile=tiles.get(key)??{data:[],x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity,zmin:Infinity,zmax:-Infinity};tiles.set(key,tile);
 const emit=p=>{tile.data.push(p.x,p.y,p.z,.22,.35,.40);tile.x0=Math.min(tile.x0,p.x);tile.x1=Math.max(tile.x1,p.x);tile.y0=Math.min(tile.y0,p.y);tile.y1=Math.max(tile.y1,p.y);tile.zmin=Math.min(tile.zmin,p.z);tile.zmax=Math.max(tile.zmax,p.z);};
 const pairs=points.map((p,k)=>{const before=points[Math.max(0,k-1)],after=points[Math.min(4,k+1)],x=after.x-before.x,y=after.y-before.y,d=Math.hypot(x,y)||1;return [{x:p.x-y/d*p.w,y:p.y+x/d*p.w,z:p.z},{x:p.x+y/d*p.w,y:p.y-x/d*p.w,z:p.z}];});
 for(let k=1;k<pairs.length;k++){const [a,b]=pairs[k-1],[c,d]=pairs[k];for(const p of [a,b,c,b,d,c])emit(p);triangles+=2;}
 // A small junction disk covers meeting ribbons without widening the whole stream.
 if(inc.length!==1){for(let k=0;k<8;k++){emit(a);for(const t of [k,k+1])emit({x:a.x+Math.cos(t*Math.PI/4)*a.w,y:a.y+Math.sin(t*Math.PI/4)*a.w,z:a.z});triangles++;}}
 edges++;
 }
 const chunks=[...tiles.values()].map(({data,...b})=>({...b,vertices:Float32Array.from(data)}));return {chunks,stats:{edges,triangles,bytes:chunks.reduce((n,c)=>n+c.vertices.byteLength,0)}};
}
export function connectedLakePairs(g){
 if(g.lakeNetwork){const r=g.detail,w=g.width;return g.lakeNetwork.links.map(p=>{const a={x:(p.fromNode%w)/r,y:Math.floor(p.fromNode/w)/r},b={x:(p.toNode%w)/r,y:Math.floor(p.toNode/w)/r};return {...p,a,b,distance:Math.hypot(a.x-b.x,a.y-b.y)};});}
 const b=lakeBasins(g),r=g.detail,w=g.width,pairs=[],seen=new Set();
 for(let i=0;i<g.land.length;i++){if(!g.lakeWater[i])continue;const id=b.labels[i],j=g.down[i];if(!id||j<0||b.labels[j]===id)continue;let p=j;for(let k=0;k<r*96&&p>=0&&g.land[p];k++){const to=b.labels[p];if(to===id)break;if(to&&to!==id&&g.lakeWater[p]){const key=id+':'+to;if(!seen.has(key)){seen.add(key);const a={x:(i%w)/r,y:Math.floor(i/w)/r},z={x:(p%w)/r,y:Math.floor(p/w)/r};pairs.push({from:id,to,fromNode:i,toNode:p,steps:k+1,distance:Math.hypot(a.x-z.x,a.y-z.y),a,b:z});}break;}p=g.down[p];}}
 return pairs;
}

// Fine geography is read only inside a charted halo covering the cubic
// interpolation stencil and each ribbon endpoint. Fog boundary uses the
// previous known-cell source. No full-world contour cache or global audit.
export async function chartedContourSource(s,source,known,{contourDetail=8,vertical,yieldRow=async()=>{}}={}){
 const m=s.map,g=m.geography,r=g.detail,W=(g.width-1)/r,H=(g.height-1)/r,[x0,y0]=source.bounds,n=source.cols*source.rows,field=contourField(m);
 const allow=(X,Y)=>{for(let y=Math.max(0,Math.floor(Y-1));y<=Math.min(H-1,Math.floor(Y+1));y++)for(let x=Math.max(0,Math.floor(X-1));x<=Math.min(W-1,Math.floor(X+1));x++)if(!known[y*W+x])return false;return true;};
 const water={kind:new Uint8Array(n),depth:new Float32Array(n),shore:new Float32Array(n)};let refined=0;
 for(let y=0;y<source.rows;y++){for(let x=0;x<source.cols;x++){const i=y*source.cols+x,o=i*9,X=x0+x/source.detail,Y=y0+y/source.detail;
 if(!allow(X,Y)){if(source.vertices[o+8]<=1.5){water.kind[i]=+(source.vertices[o+7]<.5);water.depth[i]=Math.max(0,.12-source.vertices[o+3]);water.shore[i]=Math.abs(source.vertices[o+7]-.5)*.1;}continue;}
 const p=field.sample(X,Y),wet=p.coast<0||p.lake>0,z=p.coast<0?-(Math.max(0,.12-p.bed)*3.1+.025):vertical(p.bed);
 source.vertices[o+2]=source.elevations[i]=z;source.vertices[o+3]=p.bed;source.vertices[o+7]=1;source.vertices[o+8]=wet?1:Math.max(.016,source.vertices[o+8]);water.shore[i]=Math.max(.00001,Math.min(Math.abs(p.coast),Math.abs(p.lake)));refined++;
 }if(y%8===0)await yieldRow();}
 source.water=water;source.contours=await buildContours(m,source.bounds,{detail:contourDetail,vertical,yieldRow,allow});
 const ribbons=riverRibbons(g,source.bounds,{vertical,threshold:contourDetail<=4?58:25,allow});source.contours.chunks.push(...ribbons.chunks);source.contours.stats.bytes+=ribbons.stats.bytes;source.contours.stats.rivers=ribbons.stats;
 source.stats={...source.stats,chartedFine:true,refined,coarseFallbackSamples:n-refined,contours:source.contours.stats,bytes:source.stats.bytes+water.kind.byteLength+water.depth.byteLength+water.shore.byteLength+source.contours.stats.bytes};return source;
}
