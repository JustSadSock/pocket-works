import {E} from '../../engine.js';
import {TerrainTiles,renderHeight} from './terrain-tiles.js';
let cv,g;const S=Math.sin(Math.PI/3),T=Math.cos(Math.PI/3),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t,smooth=(a,b,x)=>{let t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)},hash=(x,y)=>{let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296};
let moving=false,motionKind='none',lastCam=null,policy='auto',costs={direct:0,batch:0},trials={direct:0,batch:0},drawSerial=0,terrainKey=null,zoomLevel=null,zoomUntil=0;let atlas,style='A',textures={},treeAsset={},terrainTiles=null,scene,frame=0,cam,ground,playing=false,batch=true,stats={},last=0,w,h,d,cache=new Map(),cacheBytes=0;
const cap=8*1024*1024,scaledCap=24*1024*1024;let scaledCache=new Map(),scaledBytes=0,scaleHits=0,scaleMisses=0,scaleMs=0;
let cadence=new Map(),previousDraw=null;
function resize(){g.setTransform(d,0,0,d,0,0)}
const image=url=>new Promise((ok,no)=>{let i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('Missing '+url));i.src=url});
async function setStyle(){playing=false;let t=performance.now(),meta=await fetch('/art-evidence/mixed-atlas.json').then(r=>{if(!r.ok)throw Error('Missing baked atlas');return r.json()});let pages=await Promise.all(Object.keys(meta.pages).map(i=>image('/art-evidence/page-'+i+'.png')));atlas={pages,meta,loadMs:performance.now()-t,bytes:pages.reduce((n,p)=>n+p.width*p.height*4,0)};
 for(let kind of ['grass','sparse','road','stone']){let im=await image('/art-evidence/'+kind+'.png'),c=document.createElement('canvas');textures[kind]=[];for(let n of [2,4,8,16,32,64,128,256,512]){c.width=c.height=n;let ctx=c.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,n,n);textures[kind].push({n,a:ctx.getImageData(0,0,n,n).data})}}
 for(let kind of ['tree1','tree2','tree3','bush']){let im=await image('/art-evidence/'+kind+'.png'),meta=await fetch('/art-evidence/'+kind+'.json').then(r=>r.json());treeAsset[kind]={im,meta}}
 // One pixel-exact copy per sprite; lazy extraction keeps the load path short.
 cache.clear();cacheBytes=0;return {loadMs:atlas.loadMs,bytes:atlas.bytes,tree:!!treeAsset}}
function project(x,y,z=0){let F=scene.F,t=scene.frames[0].terrain,k=cam.k,alt=renderHeight(F,t,x,y);return {x:w/2+(-y-cam.u)*k,y:h/2+(x*S-(alt+z)*T-cam.v)*k}}
function snapPoint(x,y){let F=scene.F,t=scene.frames[0].terrain,k=cam.k,z=renderHeight(F,t,x,y);return {x:Math.round(-y*k)+Math.round(w/2-cam.u*k),y:Math.round((x*S-z*T)*k)+Math.round(h/2-cam.v*k)}}
function initTerrain(s){terrainTiles?.dispose();terrainTiles=new TerrainTiles(scene.F,s.terrain,textures,treeAsset)}
async function prepareTerrain(pad=0){resize();let start=performance.now(),coarse={...cam,k:cam.k/2};let first=await terrainTiles.warm(coarse,w,h,d,0),current=await terrainTiles.warm(cam,w,h,d,pad);return {wallMs:performance.now()-start,first,current}}
function landscape(s){let ground=terrainTiles.draw(g,cam,w,h,d,performance.now()<zoomUntil?zoomLevel:null),trees=[];if(cam.k>=1.1)for(let o of terrainTiles.vegetation(cam,w,h)){let p=project(o.x,o.y),k=cam.k*o.scale,asset=treeAsset[o.kind];if(!asset)continue;let m=asset.meta,span=m.height*k;if(p.x<-span||p.x>w+span||p.y<-span||p.y>h+span)continue;trees.push({p,k,kind:o.kind});let radius=Math.max(1,span*.29);g.fillStyle='#30342142';g.beginPath();g.ellipse(p.x+span*.32,p.y+span*.13,radius,radius*.38,.35,0,7);g.fill()}
 return {trees,ground}}
function tree(t){let {p,k,kind}=t,{im,meta}=treeAsset[kind],s=k/meta.ppm;g.drawImage(im,p.x-meta.anchor[0]*s,p.y-meta.anchor[1]*s,im.width*s,im.height*s)}
// Contact uses the exact engine sector pair intersection, then a ray to the enemy sector rectangle.
function contactMap(s,F){let m=new Map(),us=s.units.filter(u=>F.alive(u)&&u.contact>0);for(let a of us){let aa=F.bodies(a),reach=F.spec(a).reach||0;for(let b of us){if(a.side===b.side||F.dist(a,b)>Math.max(F.dims(a).w,F.dims(b).w)+Math.max(F.dims(a).d,F.dims(b).d)+reach+8)continue;let bb=F.bodies(b),h=F.sectorContact(a,b,reach,aa,bb);if(!h)continue;for(let [i,j,width] of h.parts){let key=a.id+':'+i,list=m.get(key)||[];list.push({enemy:bb[j],width,depth:h.depth});m.set(key,list)}}}return m}
function nearestTo(p,b){let c=Math.cos(b.a),s=Math.sin(b.a),dx=p.x-b.x,dy=p.y-b.y,f=dx*c+dy*s,l=-dx*s+dy*c,F=clamp(f,-b.geometry.d/2,b.geometry.d/2),L=clamp(l,-b.geometry.w/2,b.geometry.w/2);return {x:b.x+F*c-L*s,y:b.y+F*s+L*c}}
function engagement(p,b,list,reach){let best=null;for(let h of list||[]){let v=nearestTo(p,h.enemy),dx=v.x-p.x,dy=v.y-p.y,d=Math.hypot(dx,dy),front=dx*Math.cos(b.a)+dy*Math.sin(b.a);if(front<-.2||d>reach+.2)continue;if(!best||d<best.d)best={d,angle:d<.001?b.a:Math.atan2(dy,dx),width:h.width}}return best}
function heading(a){return ((Math.round(a/(Math.PI/4))%8)+8)%8}
function pose(u,q,row,rows,s,seed,contact){if(u.rout)return [5,9,13,17][Math.floor(s.time*6+hash(seed,3)*4)%4];if(u.type==='archer'&&row<Math.max(1,Math.ceil(rows*.65))&&(s.shots||[]).some(a=>a.id===u.id&&Math.hypot(a.x-u.x,a.y-u.y)<40&&s.time-a.time<1.5))return [25,29,33,37][Math.floor(s.time*6+hash(seed,3)*4)%4];if((u.type==='knight'||u.type==='lightHorse'||u.type==='guard')&&u.order?.kind==='charge'&&u.v>.35)return [25,29,33,37][Math.floor(s.time*6+hash(seed,3)*4)%4];if(u.rout)return [5,9,13,17][Math.floor(s.time*6+hash(seed,3)*4)%4];if(contact&&row<Math.max(1,Math.ceil(rows*.26)))return q.pressure>1.1||u.order?.kind==='brace'||u.order?.kind==='hold'?21:[25,29,33,37][Math.floor(s.time*6+hash(seed,3)*4)%4];if(u.v>.2)return [5,9,13,17][Math.floor(s.time*6+hash(seed,3)*4)%4];return 1}
// Use exact source cropping once per atlas entry, rather than resampling the entire atlas for each soldier.
function blit(ctx,o,x=0,y=0){let e=o.e||atlas.meta.entries[o.key],s=o.scale,r=e.rect;if(!e.sprite){let c=document.createElement('canvas');c.width=r[2];c.height=r[3];c.getContext('2d').drawImage(atlas.pages[e.page],...r,0,0,r[2],r[3]);e.sprite=c}ctx.drawImage(e.sprite||atlas.pages[e.page],e.sprite?0:r[0],e.sprite?0:r[1],r[2],r[3],o.x-x-e.anchor[0]*s,o.y-y-e.anchor[1]*s,r[2]*s,r[3]*s)}
// Same atlas pixels, same projection and painter order. Bake the exact screen-size
// sample once for each sprite, DPR and scale, then issue an unscaled Canvas blit.
// Like C&M's baked material field, move repeated sampling out of composition.
function blitScaled(ctx,o){
 let e=o.e||atlas.meta.entries[o.key],s=o.scale,r=e.rect,f=s*d;
 let key=o.key+'|'+f+'|'+d,item=scaledCache.get(key);
 if(!item){
  let start=performance.now(),left=Math.floor(-e.anchor[0]*f)-1,top=Math.floor(-e.anchor[1]*f)-1,right=Math.ceil((r[2]-e.anchor[0])*f)+1,bottom=Math.ceil((r[3]-e.anchor[1])*f)+1,W=right-left,H=bottom-top;
  if(W*H*4>scaledCap/8){blit(ctx,o);return}
  let canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;let g2=canvas.getContext('2d');g2.imageSmoothingEnabled=ctx.imageSmoothingEnabled;g2.imageSmoothingQuality=ctx.imageSmoothingQuality;
  g2.drawImage(e.sprite||atlas.pages[e.page],e.sprite?0:r[0],e.sprite?0:r[1],r[2],r[3],-e.anchor[0]*f-left,-e.anchor[1]*f-top,r[2]*f,r[3]*f);
  item={canvas,left,top,bytes:W*H*4};while(scaledBytes+item.bytes>scaledCap&&scaledCache.size){let k=scaledCache.keys().next().value;scaledBytes-=scaledCache.get(k).bytes;scaledCache.delete(k)}
  scaledCache.set(key,item);scaledBytes+=item.bytes;scaleMisses++;scaleMs+=performance.now()-start;
 }else{scaledCache.delete(key);scaledCache.set(key,item);scaleHits++}
 // Device-aligned integer origin: no additional fractional filtering.
 ctx.drawImage(item.canvas,o.x+item.left/d,o.y+item.top/d,item.canvas.width/d,item.canvas.height/d);
}
function extent(o){let e=atlas.meta.entries[o.key],s=o.scale;return {l:o.x-e.anchor[0]*s,t:o.y-e.anchor[1]*s,r:o.x+(e.rect[2]-e.anchor[0])*s,b:o.y+(e.rect[3]-e.anchor[1])*s}}
function cacheRow(row){let boxes=row.map(extent),minX=Math.floor(Math.min(...boxes.map(o=>o.l))),minY=Math.floor(Math.min(...boxes.map(o=>o.t))),maxX=Math.ceil(Math.max(...boxes.map(o=>o.r))),maxY=Math.ceil(Math.max(...boxes.map(o=>o.b))),W=maxX-minX,H=maxY-minY;if(W<1||H<1||W*H*4*d*d>cap/3)return false;
 let key=d+'|'+W+'|'+H+'|'+row.map(o=>[o.key,o.x-minX,o.y-minY,o.scale].join(',')).join(';'),item=cache.get(key);
 if(item){cache.delete(key);cache.set(key,item);stats.hits++}
 else{if(moving&&(motionKind==='zoom'||stats.missMs>=1.5)){stats.bypass=(stats.bypass||0)+1;return false}let t=performance.now();stats.misses++;let c=document.createElement('canvas');c.width=Math.round(W*d);c.height=Math.round(H*d);let ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.imageSmoothingEnabled=g.imageSmoothingEnabled;ctx.imageSmoothingQuality=g.imageSmoothingQuality;for(let o of row)blit(ctx,o,minX,minY);item={c,bytes:c.width*c.height*4};while(cacheBytes+item.bytes>cap&&cache.size){let id=cache.keys().next().value;cacheBytes-=cache.get(id).bytes;cache.delete(id);stats.evictions++}cache.set(key,item);cacheBytes+=item.bytes;stats.prepBlits+=row.length;stats.missMs+=performance.now()-t}
 g.drawImage(item.c,minX,minY,W,H);stats.drawCalls++;return true}
const geometryCache=new Map();let geometryBytes=0;
function geometry(s,F){let cacheable=Object.isFrozen(s);let prior=cacheable?geometryCache.get(s):null;if(prior){geometryCache.delete(s);geometryCache.set(s,prior);return {...prior,cached:true,geometryMs:0,contactMs:0}}
 let start=performance.now(),contacts=contactMap(s,F),contactMs=performance.now()-start,result={regiments:[],contactSectors:contacts.size};
 for(let u of s.units){if(!F.alive(u)||u.pendingArrival)continue;let dim=F.dims(u),pad=Math.max(dim.w,dim.d),reg={id:u.id,side:u.side,kind:u.type==='guard'?'knight':u.type,x:u.x,y:u.y,h:renderHeight(F,s.terrain,u.x,u.y),pad,groups:[]};result.regiments.push(reg);let kind=u.type==='guard'?'knight':u.type;if(!['spear','sword','archer','knight','lightHorse'].includes(kind))throw Error('Unsupported visual troop '+u.type);let reach=F.spec(u).reach||0;
 let bodies=F.bodies(u),sectors=F.sectors(u),ns=bodies.map(b=>Math.floor(b.n)),remaining=Math.max(0,Math.round(u.n)-ns.reduce((a,b)=>a+b,0)),rank=bodies.map((b,i)=>({i,f:b.n-ns[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);for(let r=0;r<remaining&&r<rank.length;r++)ns[rank[r].i]++;
 for(let [j,b] of bodies.entries()){let q=sectors[j],n=ns[j],cols=Math.max(1,Math.min(n,Math.round(b.geometry.cols))),rows=Math.ceil(n/cols),ca=Math.cos(b.a),sa=Math.sin(b.a),loose=clamp((100-q.cohesion)/100,0,1),gap=b.geometry.gap||1.5,step=1,dir=heading(b.a);let group={n,rows:[]};reg.groups.push(group);let list=contacts.get(u.id+':'+j),frontRows=Math.ceil(rows*.26),backRows=Math.ceil(rows*.5);
 for(let row=0;row<rows;row+=step){let rowList=[],rowData={points:rowList,group:u.id+':'+j+':'+row,eligible:loose<.25&&!(q.contact>0&&row<frontRows)};group.rows.push(rowData);for(let col=0;col<cols;col+=step){let i=row*cols+col;if(i>=n)continue;let seed=u.id*931+j*143+i,dx=b.geometry.d/2-(row+.5)*b.geometry.d/rows,dy=(col+.5-cols/2)*b.geometry.w/cols;dx=clamp(dx+(hash(seed,5)-.5)*gap*loose*1.15,-b.geometry.d/2,b.geometry.d/2);dy=clamp(dy+(hash(seed,7)-.5)*gap*loose*1.35,-b.geometry.w/2,b.geometry.w/2);let point={x:b.x+dx*ca-dy*sa,y:b.y+dx*sa+dy*ca},local=row<frontRows&&list?engagement(point,b,list,reach):null;let f=pose(u,q,row,rows,s,seed,local),dir2=local?heading(b.a+clamp(Math.atan2(Math.sin(local.angle-b.a),Math.cos(local.angle-b.a)),-Math.PI/4,Math.PI/4)):dir,baseKey=[kind,u.side,dir2,f].join(':'),variantKey=baseKey+':v',rear=row===Math.floor((rows-1)/step)*step&&j===Math.floor(bodies.length/2),role=rear&&col===0?'banner':rear&&col===step?'officer':null,roleKey=[kind,u.side,dir2,1,role].join(':'),key=role&&atlas.meta.entries[roleKey]?roleKey:(row>=backRows&&atlas.meta.entries[variantKey]?variantKey:baseKey);let e=atlas.meta.entries[key],alt=renderHeight(F,s.terrain,point.x,point.y);
 rowList.push({u:-point.y,v:point.x*S-alt*T,e,key,role:role&&key===roleKey?role:null,contact:!!local,mismatch:!!local&&local.d>e.weaponForwardMetres+.2,flag:j===0&&row===0&&col===0})}
 }

 }}

 result.contactMs=contactMs;result.geometryMs=performance.now()-start-contactMs;result.cached=false;
 if(cacheable){geometryCache.set(s,result);while(geometryCache.size>26)geometryCache.delete(geometryCache.keys().next().value)}return result}

function render(s,mode='direct',environmentOnly=false){let start=performance.now();scaleHits=scaleMisses=scaleMs=0;resize();const k=cam.k,F=scene.F,groundStart=performance.now(),land=landscape(s),groundMs=performance.now()-groundStart;stats={groundMs,terrain:land.ground,sprites:0,represented:0,visible:0,drawCalls:0,hits:0,misses:0,prepBlits:0,atlasBytes:atlas.bytes,missMs:0,evictions:0,localContacts:0,contactSectors:0,proxy:0,byType:{},reachMismatch:0,atlasLoadMs:atlas.loadMs};
 let items=[],flags=[],profileStart=performance.now(),geo=environmentOnly?{regiments:[],contactSectors:0}:geometry(s,F),originX=Math.round(w/2-cam.u*k),originY=Math.round(h/2-cam.v*k),size=Math.max(4,k*6);
 stats.contactSectors=geo.contactSectors;stats.contactMs=geo.contactMs||0;stats.geometryMs=geo.geometryMs||0;stats.geometryCached=!!geo.cached;
 for(let t of land.trees)items.push({y:t.p.y,tree:t});
 for(let reg of geo.regiments){let px=w/2+(-reg.y-cam.u)*k,py=h/2+(reg.x*S-reg.h*T-cam.v)*k,pad=reg.pad*k+50;if(px<-pad||px>w+pad||py<-pad||py>h+pad)continue;stats.visible++;stats.byType[reg.kind]=(stats.byType[reg.kind]||0)+1;
 for(let group of reg.groups){stats.represented+=group.n;for(let row of group.rows){for(let pt of row.points){let x=Math.round(pt.u*k)+originX,y=Math.round(pt.v*k)+originY;if(x<-size||x>w+size||y<-size||y>h+size)continue;
 let o={x,y,scale:k/pt.e.ppm,key:pt.key,e:pt.e};items.push({y,o,group:row.group,eligible:k<12&&row.eligible});
 if(cam.mode==='A'&&pt.flag)flags.push({p:{x:px,y:py},side:reg.side,k});stats.sprites++;if(pt.role)stats[pt.role]=(stats[pt.role]||0)+1;if(pt.contact){stats.localContacts++;if(pt.mismatch)stats.reachMismatch++}
 }}}
 }
 stats.positionMs=performance.now()-profileStart-stats.geometryMs-stats.contactMs;
 if(k>=8){g.fillStyle='#292c202f';g.beginPath();for(let it of items)if(it.o){let p=it.o;g.moveTo(p.x+k*.50,p.y+k*.17);g.ellipse(p.x+k*.24,p.y+k*.17,k*.30,k*.105,.25,0,Math.PI*2)}g.fill()}let sortStart=performance.now();items.sort((a,b)=>a.y-b.y);stats.sortMs=performance.now()-sortStart;let composeStart=performance.now();for(let i=0;i<items.length;){let it=items[i];if(it.tree){tree(it.tree);i++;continue}let end=i+1;if(mode==='batch'&&it.eligible&&motionKind!=='zoom')while(end<items.length&&items[end].eligible&&items[end].group===it.group)end++;if(end===i+1){if(mode==='scaled')blitScaled(g,it.o);else blit(g,it.o);stats.drawCalls++;i++;continue}let run=items.slice(i,end).map(x=>x.o);if(!cacheRow(run))for(let o of run){blit(g,o);stats.drawCalls++}i=end}
 for(let f of flags){let {p,k}=f,ht=Math.max(5,k*1.8),wd=Math.max(4,k*.85);g.strokeStyle='#57432e';g.lineWidth=Math.max(.7,k*.075);g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x,p.y-ht);g.stroke();g.fillStyle=f.side?'#97432e':'#315776';g.beginPath();g.moveTo(p.x,p.y-ht);g.lineTo(p.x+wd,p.y-ht+ht*.12);g.lineTo(p.x+wd*.88,p.y-ht*.48);g.lineTo(p.x,p.y-ht*.58);g.fill();g.strokeStyle='#dec89a';g.lineWidth=Math.max(.6,k*.04);g.beginPath();g.moveTo(p.x+wd*.13,p.y-ht*.94);g.lineTo(p.x+wd*.77,p.y-ht*.85);g.stroke()}
 stats.composeMs=performance.now()-composeStart;stats={...stats,drawMs:performance.now()-start,cacheBytes,camera:{...cam},time:s.time,mode,motion:motionKind,scaleHits,scaleMisses,scaleMs,scaledBytes};return stats}

export async function initArt(canvas){cv=canvas;g=canvas.getContext('2d',{alpha:false});await setStyle();return {canvas:atlas.pages[0]}}
export function setArtPolicy(p){if(!['auto','direct','batch','scaled'].includes(p))throw Error('Unknown renderer policy');policy=p;previousDraw=null;costs={direct:0,batch:0};trials={direct:0,batch:0}}
function getScene(s,layout,C){
 w=layout.w;h=layout.h;d=layout.d;cam={...C};let F=E.forState(s),key=s.seed+'|'+F.W+'|'+F.H+'|'+s.terrain.kind;
 if(!scene||terrainKey!==key){terrainKey=key;scene={F,frames:[s]};geometryCache.clear();cadence.clear();previousDraw=null;scaledCache.clear();scaledBytes=0;initTerrain(s);lastCam=null;zoomLevel=null;zoomUntil=0;cache.clear();cacheBytes=0}
 else scene.frames[0]=s;
}
export async function warmArt(s,layout,C){getScene(s,layout,C);let t=performance.now();let coarse=await terrainTiles.warm({...cam,k:cam.k/2},w,h,d),detail=await terrainTiles.warm(cam,w,h,d);return {wallMs:performance.now()-t,coarse,detail}}
export function paintArt(s,layout,C){getScene(s,layout,C);let before=lastCam;motionKind=before&&Math.abs(before.k-cam.k)>1e-7?'zoom':before&&(before.x!==cam.x||before.y!==cam.y)?'pan':'none';moving=motionKind!=='none';
 if(motionKind==='zoom'){if(performance.now()>=zoomUntil)zoomLevel=terrainTiles.visible(before,w,h,d)[0]?.l;zoomUntil=performance.now()+180}
 lastCam={...cam};let now=performance.now(),bucket=motionKind+'|'+d+'|'+Math.round(Math.log2(Math.max(.1,cam.k))*2);
 // RAF-to-RAF time includes deferred Canvas raster and compositing, unlike JS submit time.
 // Ignore paused/idle frames and scene changes; learn only from adjacent active draws.
 if(previousDraw&&previousDraw.bucket===bucket){let ms=now-previousDraw.at;if(ms>=4&&ms<120){let samples=cadence.get(bucket)||{},p=samples[previousDraw.mode]||{ms:0,n:0};p.ms=p.n?p.ms*.84+ms*.16:ms;p.n++;samples[previousDraw.mode]=p;cadence.set(bucket,samples)}}
 let choices=motionKind==='zoom'?['direct','scaled']:['direct','batch','scaled'],learned=cadence.get(bucket)||{},mode=policy;
 if(policy==='auto'){
  let unknown=choices.find(m=>(learned[m]?.n||0)<3);
  mode=unknown||choices.reduce((best,m)=>learned[m].ms<learned[best].ms?m:best,choices[0]);
  if(!unknown&&drawSerial%120===37)mode=choices[(choices.indexOf(mode)+1)%choices.length];
 }
 drawSerial++;let r=render(s,mode),cost=Math.max(0,r.drawMs-r.groundMs);costs[mode]=trials[mode]?costs[mode]*.85+cost*.15:cost;trials[mode]=(trials[mode]||0)+1;
 previousDraw={at:now,bucket,mode};return {...r,policy,costs:{...costs},trials:{...trials},cadence:JSON.parse(JSON.stringify(learned)),terrainLevel:r.terrain.level,zoomHold:performance.now()<zoomUntil}}

export function pendingArt(){return (terrainTiles?.queue.size||0)+(performance.now()<zoomUntil?1:0)}
