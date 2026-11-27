// Review-only exact material cache. The monolithic source, texture layout,
 // shading equations, mipmaps and mesh remain unchanged. Cache only fully
 // aligned interior cores; boundary/clamped samples always use Original.
import {SpatialLRU} from './genesis-contours.mjs';
const light=[-.62,-.49],len=Math.hypot(...light);
export const materialHalo=(res,extra=0)=>Math.ceil(7.4*res*Math.max(...light.map(Math.abs))/len)+1+extra;
export class MaterialTileCache extends SpatialLRU{
 constructor({size=64,extra=0,limit=16*1024*1024}={}){super(limit);if(![32,64,128].includes(size)||![0,8].includes(extra)||limit>16*1024*1024||limit<=0)throw Error('Invalid material tile budget');this.size=size;this.extra=extra;}
}
export function materialTiles(source,size,halo,visible=null){
 const {cols:w,rows:h,detail:r,bounds}=source,ox=Math.round(bounds[0]*r),oy=Math.round(bounds[1]*r),out=[];
 for(let y=0;y<h;){const gy=oy+y,y1=Math.min(h,y+size-((gy%size+size)%size));for(let x=0;x<w;){const gx=ox+x,x1=Math.min(w,x+size-((gx%size+size)%size)),interior=x>=halo&&y>=halo&&x1+halo<=w&&y1+halo<=h&&x1-x===size&&y1-y===size;
 const needed=!visible||gx<visible[2]*r&&gx+x1-x>visible[0]*r&&gy<visible[3]*r&&gy+y1-y>visible[1]*r;out.push({x,y,x1,y1,gx,gy,interior,needed});x=x1;}y=y1;}
 return out.sort((a,b)=>Number(b.needed)-Number(a.needed));
}
// Exact equality of every shading input, including elevation dependencies and
// floating point interpolation fractions in the original local coordinates.
// This is intentionally conservative: no hash collision can authorize a hit.
export function materialDependencies(source,t,halo){
 const {cols:w,detail:r,vertices:v,elevations:z,normalField:n,water,ink}=source,{x,y,x1,y1}=t,steps=r<=2?[.7,2.8,5.6]:[.35,.7,1.2,1.9,2.8,4,5.6,7.4],values=[];
 for(let yy=y-halo;yy<y1+halo;yy++)for(let xx=x-halo;xx<x1+halo;xx++)values.push(z[yy*w+xx]);
 for(let yy=y;yy<y1;yy++)for(let xx=x;xx<x1;xx++){const k=yy*w+xx;for(let i=0;i<9;i++)values.push(v[k*9+i]);if(n)for(let i=0;i<3;i++)values.push(n[k*3+i]);if(water)values.push(water.kind[k],water.depth[k],water.shore[k]);if(ink)values.push(ink[k]);}
 for(const [lo,hi,d] of [[x,x1,light[0]],[y,y1,light[1]]])for(let i=lo;i<hi;i++)for(const step of steps){const p=i+d/len*step*r,base=Math.floor(p);values.push(base-i,p-base);}
 return Float64Array.from(values);
}
export function equalMaterialDependencies(a,b){if(!a||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))return false;return true;}
export async function bakeMaterialTiles({source,cache,visible,pixels,detailMask,shade,budget,check,onTile=()=>{}}){
 const start=performance.now(),halo=materialHalo(source.detail,cache.extra),tiles=materialTiles(source,cache.size,halo,visible),w=source.cols,stats={size:cache.size,halo,hits:0,misses:0,boundaryTiles:0,recomputed:0,reused:0,neededTiles:tiles.filter(t=>t.needed).length,firstNeededMs:null,neededCompleteMs:null,dependencyMs:0,copyMs:0,shadeMs:0,cacheBytes:0,cacheLimit:cache.limit};
 let needed=stats.neededTiles;
 for(const t of tiles){check();const tw=t.x1-t.x,th=t.y1-t.y,n=tw*th,key=[source.detail,+!!source.normalField,+!!source.ink,+!!source.water,+!!source.identity,+!!source.polish,t.gx,t.gy,tw,th,halo].join(':'),at=performance.now(),deps=t.interior?materialDependencies(source,t,halo):null,hit=deps?cache.get(key):null;stats.dependencyMs+=performance.now()-at;
 const copy=(buf,out)=>{if(!buf||!out)return;for(let j=0;j<th;j++){const dst=((t.y+j)*w+t.x)*4;out.set(buf.subarray(j*tw*4,(j+1)*tw*4),dst);}};
 if(hit&&equalMaterialDependencies(hit.deps,deps)){const began=performance.now();copy(hit.pixels,pixels);copy(hit.mask,detailMask);stats.copyMs+=performance.now()-began;stats.hits++;stats.reused+=n;}
 else{if(t.interior)stats.misses++;else stats.boundaryTiles++;const began=performance.now();for(let y=t.y;y<t.y1;y++){for(let x=t.x;x<t.x1;x++)shade(x,y);await budget.yield();check();}stats.shadeMs+=performance.now()-began;stats.recomputed+=n;if(deps){const grab=out=>{if(!out)return null;const buf=new Uint8Array(n*4);for(let j=0;j<th;j++){const src=((t.y+j)*w+t.x)*4;buf.set(out.subarray(src,src+tw*4),j*tw*4);}return buf;},p=grab(pixels),mask=grab(detailMask);cache.put(key,{deps,pixels:p,mask},deps.byteLength+p.byteLength+(mask?.byteLength??0));}}
 if(t.needed){if(stats.firstNeededMs===null)stats.firstNeededMs=performance.now()-start;if(--needed===0)stats.neededCompleteMs=performance.now()-start;}stats.cacheBytes=cache.bytes;onTile({needed:t.needed,hit:!!hit&&equalMaterialDependencies(hit.deps,deps),gx:t.gx,gy:t.gy,elapsedMs:performance.now()-start,cacheBytes:cache.bytes});await budget.yield();
 }
 return {...stats,totalMs:performance.now()-start,evictions:cache.evictions};
}
