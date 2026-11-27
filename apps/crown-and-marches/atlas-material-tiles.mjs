// Exact material cache dependencies. Prefer immutable geography tile identities
// when the source is backed by Genesis scale tiles; otherwise keep compact
// native-byte snapshots. No hash is ever sufficient to authorize a cache hit.
import {SpatialLRU,materialSourceIdentity} from './genesis-contours.mjs';
const light=[-.62,-.49],len=Math.hypot(...light),REVISION=3;
export const materialHalo=(res,extra=0)=>Math.ceil(7.4*res*Math.max(...light.map(Math.abs))/len)+1+extra;
export class MaterialTileCache extends SpatialLRU{
 constructor({size=64,extra=0,limit=16*1024*1024}={}){super(limit);if(![32,64,128].includes(size)||![0,8].includes(extra)||limit>16*1024*1024||limit<=0)throw Error('Invalid material tile budget');this.size=size;this.extra=extra;}
}
export function materialTiles(source,size,halo,visible=null){
 const {cols:w,rows:h,detail:r,bounds}=source,rx=bounds[0]*r,ry=bounds[1]*r,aligned=Math.abs(rx-Math.round(rx))<1e-9&&Math.abs(ry-Math.round(ry))<1e-9,ox=Math.round(rx),oy=Math.round(ry),out=[];
 for(let y=0;y<h;){const gy=oy+y,y1=Math.min(h,y+size-((gy%size+size)%size));for(let x=0;x<w;){const gx=ox+x,x1=Math.min(w,x+size-((gx%size+size)%size)),interior=aligned&&x>=halo&&y>=halo&&x1+halo<=w&&y1+halo<=h&&x1-x===size&&y1-y===size;
 const needed=!visible||gx<visible[2]*r&&gx+x1-x>visible[0]*r&&gy<visible[3]*r&&gy+y1-y>visible[1]*r;out.push({x,y,x1,y1,gx,gy,interior,needed});x=x1;}y=y1;}
 return out.sort((a,b)=>Number(b.needed)-Number(a.needed));
}
const asTyped=(a,name)=>{if(ArrayBuffer.isView(a)&&!(a instanceof DataView))return a;if(Array.isArray(a))return Float64Array.from(a);throw Error('Missing or unsupported material dependency '+name);};
function dependencyFields(source,t,halo){
 const {cols:w,rows:h}=source,{x,y,x1,y1}=t,fields=[];let total=0;
 const add=(name,raw,channels,rect)=>{if(raw==null)return;const view=asTyped(raw,name),[x0,y0,x2,y2]=rect;if(view.length!==w*h*channels)throw Error('Invalid material dependency shape '+name);if(x0<0||y0<0||x2>w||y2>h||x2<x0||y2<y0)throw Error('Material dependency outside source '+name);const rowBytes=(x2-x0)*channels*view.BYTES_PER_ELEMENT,bytes=rowBytes*(y2-y0);fields.push({name,view,channels,x0,y0,x2,y2,rowBytes,start:total,end:total+bytes});total+=bytes;};
 add('elevation-halo',source.elevations,1,[x-halo,y-halo,x1+halo,y1+halo]);
 add('vertices',source.vertices,9,[x,y,x1,y1]);
 add('normalField',source.normalField,3,[x,y,x1,y1]);
 add('water.kind',source.water?.kind,1,[x,y,x1,y1]);
 add('water.depth',source.water?.depth,1,[x,y,x1,y1]);
 add('water.shore',source.water?.shore,1,[x,y,x1,y1]);
 add('ink',source.ink,1,[x,y,x1,y1]);
 return {fields,total};
}
export function materialDependencySignature(source){
 const type=a=>a?[(a.constructor?.name??'array'),a.BYTES_PER_ELEMENT??8].join(':'):'none';
 return ['material-v'+REVISION,type(source.elevations),type(source.vertices),type(source.normalField),type(source.water?.kind),type(source.water?.depth),type(source.water?.shore),type(source.ink)].join('/');
}
export function materialDependencies(source,t,halo){
 const {x,y,x1,y1}=t,r=source.detail,ox=Math.round(source.bounds[0]*r),oy=Math.round(source.bounds[1]*r);if(x<halo||y<halo||x1+halo>source.cols||y1+halo>source.rows)return null;const rect=[(ox+x-halo)/r,(oy+y-halo)/r,(ox+x1+halo-1)/r,(oy+y1+halo-1)/r],identity=materialSourceIdentity(source,rect);
 if(identity){const bytes=new Uint8Array(identity.buffer,identity.byteOffset,identity.byteLength);return {mode:'source-tile-identity',bytes,layout:[],tokenCount:(identity.length-2)/6};}
 if(x<halo||y<halo||x1+halo>source.cols||y1+halo>source.rows)return null;
 const l=dependencyFields(source,t,halo),bytes=new Uint8Array(l.total),layout=[];
 for(const f of l.fields){let at=f.start;for(let y=f.y0;y<f.y2;y++){const first=((y*source.cols+f.x0)*f.channels)*f.view.BYTES_PER_ELEMENT,part=new Uint8Array(f.view.buffer,f.view.byteOffset+first,f.rowBytes);bytes.set(part,at);at+=f.rowBytes;}layout.push({name:f.name,start:f.start,end:f.end});}
 return {mode:'native-bytes',bytes,layout,tokenCount:0};
}
const raw=a=>a?.bytes??a;
export function equalMaterialDependencies(a,b){if(!a||!b||a.mode!==b.mode)return false;const x=raw(a),y=raw(b);if(!x||!y||x.length!==y.length)return false;for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true;}
export function materialDependencyDifferences(a,b,layout){const x=raw(a),y=raw(b),out={};if(!x||!y||x.length!==y.length)return {length:1};for(const f of layout??[]){let count=0;for(let i=f.start;i<f.end;i++)if(x[i]!==y[i])count++;if(count)out[f.name]=count;}if(!Object.keys(out).length&&!equalMaterialDependencies(a,b))out.sourceTileIdentity=x.length;return out;}
export async function bakeMaterialTiles({source,cache,visible,pixels,detailMask,shade,budget,check,onTile=()=>{}}){
 const start=performance.now(),halo=materialHalo(source.detail,cache.extra),tiles=materialTiles(source,cache.size,halo,visible),w=source.cols,signature=materialDependencySignature(source),stats={size:cache.size,halo,hits:0,misses:0,keyHits:0,keyMisses:0,dependencyRejects:0,dependencyRejectFields:{},boundaryTiles:0,interiorTiles:0,cacheableTiles:0,dependencyModes:{'source-tile-identity':0,'native-bytes':0},sourceTileTokens:0,recomputed:0,reused:0,neededTiles:tiles.filter(t=>t.needed).length,firstNeededMs:null,neededCompleteMs:null,dependencyMs:0,dependencyBuildMs:0,dependencyCompareMs:0,copyMs:0,shadeMs:0,yieldMs:0,yieldChecks:0,cooperativeYields:0,maxSliceMs:0,yieldMode:budget.mode??'unknown',dependencyBytes:0,identityDependencyBytes:0,nativeDependencyBytes:0,pixelBytes:0,maskBytes:0,metadataBytesEstimated:0,cacheEntries:0,cacheBytes:0,peakCacheBytes:cache.bytes,cacheLimit:cache.limit,cacheAccounting:'exact immutable-source identity tokens or native typed-array snapshots + RGBA outputs + 1024-byte/key metadata estimate'};
 let needed=stats.neededTiles;
 const cooperativeYield=async()=>{const began=performance.now(),did=await budget.yield();stats.yieldMs+=performance.now()-began;stats.yieldChecks++;if(did)stats.cooperativeYields++;stats.maxSliceMs=Math.max(stats.maxSliceMs,budget.max);check();};
 for(const t of tiles){check();const tw=t.x1-t.x,th=t.y1-t.y,n=tw*th,depStart=performance.now(),dep=t.interior?materialDependencies(source,t,halo):null;stats.dependencyBuildMs+=performance.now()-depStart;
 if(dep){stats.cacheableTiles++;stats.interiorTiles++;stats.dependencyModes[dep.mode]=(stats.dependencyModes[dep.mode]??0)+1;stats.sourceTileTokens+=dep.tokenCount??0;}else stats.boundaryTiles++;
 const key=[signature,dep?.mode??'uncacheable',source.detail,+!!source.identity,+!!source.polish,t.gx,t.gy,tw,th,halo].join(':'),lookupStart=performance.now(),hit=dep?cache.get(key):null;let validHit=false;if(dep){if(hit){stats.keyHits++;const compareStart=performance.now();validHit=equalMaterialDependencies(hit.deps,dep);stats.dependencyCompareMs+=performance.now()-compareStart;if(!validHit){stats.dependencyRejects++;const diff=materialDependencyDifferences(hit.deps,dep,dep.layout);for(const [field,count] of Object.entries(diff))stats.dependencyRejectFields[field]=(stats.dependencyRejectFields[field]??0)+1;}}else stats.keyMisses++;}stats.dependencyMs+=performance.now()-depStart;
 const copy=(buf,out)=>{if(!buf||!out)return;for(let j=0;j<th;j++){const dst=((t.y+j)*w+t.x)*4;out.set(buf.subarray(j*tw*4,(j+1)*tw*4),dst);}};
 if(validHit){const began=performance.now();copy(hit.pixels,pixels);copy(hit.mask,detailMask);stats.copyMs+=performance.now()-began;stats.hits++;stats.reused+=n;}
 else{if(dep)stats.misses++;const began=performance.now();for(let y=t.y;y<t.y1;y++){for(let x=t.x;x<t.x1;x++)shade(x,y);await cooperativeYield();}stats.shadeMs+=performance.now()-began;stats.recomputed+=n;
 if(dep){const grab=out=>{if(!out)return null;const buf=new Uint8Array(n*4);for(let j=0;j<th;j++){const src=((t.y+j)*w+t.x)*4;buf.set(out.subarray(src,src+tw*4),j*tw*4);}return buf;},p=grab(pixels),mask=grab(detailMask),metadataBytes=1024+key.length*2+dep.layout.length*24;cache.put(key,{deps:dep,mode:dep.mode,tokenCount:dep.tokenCount??0,pixels:p,mask,metadataBytes},dep.bytes.byteLength+p.byteLength+(mask?.byteLength??0)+metadataBytes);stats.peakCacheBytes=Math.max(stats.peakCacheBytes,cache.bytes);}}
 if(t.needed){if(stats.firstNeededMs===null)stats.firstNeededMs=performance.now()-start;if(--needed===0)stats.neededCompleteMs=performance.now()-start;}onTile({needed:t.needed,hit:validHit,gx:t.gx,gy:t.gy,elapsedMs:performance.now()-start,cacheBytes:cache.bytes});await cooperativeYield();
 }
 for(const [key,item] of cache.items){const v=item.value;stats.dependencyBytes+=v.deps?.bytes?.byteLength??0;if(v.mode==='source-tile-identity')stats.identityDependencyBytes+=v.deps?.bytes?.byteLength??0;else stats.nativeDependencyBytes+=v.deps?.bytes?.byteLength??0;stats.sourceTileTokens+=0;stats.pixelBytes+=v.pixels?.byteLength??0;stats.maskBytes+=v.mask?.byteLength??0;stats.metadataBytesEstimated+=v.metadataBytes??(1024+key.length*2);}
 stats.cacheEntries=cache.items.size;stats.cacheBytes=cache.bytes;stats.verificationShare=stats.cacheBytes?stats.dependencyBytes/stats.cacheBytes:0;stats.totalMs=performance.now()-start;stats.shadeWorkMs=Math.max(0,stats.shadeMs-stats.yieldMs);stats.evictions=cache.evictions;return stats;
}
