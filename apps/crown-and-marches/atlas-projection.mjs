// Shared orthographic projection and safe chart coverage. No hidden data.
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function chartInk(known,W,H,X,Y,identity=false){
 const x=Math.floor(X),y=Math.floor(Y);if(x<0||x>=W||y<0||y>=H||!known[y*W+x])return 0;
 let d=identity?2:1,radius=identity?2:1;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const a=x+dx,b=y+dy;if(a<0||a>=W||b<0||b>=H||known[b*W+a])continue;d=Math.min(d,Math.hypot(Math.max(a-X,0,X-a-1),Math.max(b-Y,0,Y-b-1)));}
 // Inward fade only; never extrapolate a hidden cell. Irregularity derives
 // from world coordinates, not from unknown terrain.
 const edge=identity?1.08+.25*Math.sin(X*2.7+Y*1.9)+.11*Math.sin(Y*9-X*7):.64+.13*Math.sin(X*7+Y*5)+.08*Math.sin(Y*17-X*11),t=C(d/edge);return t*t*(3-2*t);
}
export function meshHeight(terrain,lod,X,Y){
 const l=terrain.lods[lod];if(!l)return 0;const [a,b,c,d]=terrain.bounds;if(X<a||Y<b||X>c||Y>d)return 0;
 const u=C((X-a)/(c-a)*(l.cols-1),0,l.cols-1),v=C((Y-b)/(d-b)*(l.rows-1),0,l.rows-1),x=Math.min(l.cols-2,Math.floor(u)),y=Math.min(l.rows-2,Math.floor(v)),i=u-x,j=v-y,z=(X,Y)=>l.vertices[(Y*l.cols+X)*3+2],p=z(x,y),q=z(x+1,y),r=z(x+1,y+1),s=z(x,y+1);
 // Same diagonal and interpolation as Baked Terrain indices.
 return i>=j?p+(q-p)*i+(r-q)*j:p+(r-s)*i+(s-p)*j;
}
export function atlasProjection({centerY,datum=0,tilt=0,height=()=>0}){
 const cs=Math.sqrt(1-tilt*tilt),project=(x,y)=>[x,centerY+(y-centerY)*cs-(height(x,y)-datum)*tilt];
 const unproject=(x,y)=>{if(!tilt)return [x,y];let target=centerY+(y-centerY)/cs,lo=target-30,hi=target+30;for(let k=0;k<24;k++){const mid=(lo+hi)/2;if(project(x,mid)[1]<y)lo=mid;else hi=mid;}return [x,(lo+hi)/2];};return {project,unproject,cs};
}
// Canvas world-space path adapter. Markers and text remain screen-space;
// infrastructure and political paths use the same mesh as the GPU.
export function projectedContext(ctx,project){
 const point=(x,y)=>project(x,y),quad=(x,y,u,v)=>[...point(x,y),...point(u,v)];
 return new Proxy(ctx,{get(t,k){if(k==='moveTo'||k==='lineTo'||k==='translate')return (x,y)=>t[k](...point(x,y));if(k==='quadraticCurveTo')return (x,y,u,v)=>t[k](...quad(x,y,u,v));if(k==='fillRect'||k==='strokeRect')return (x,y,w,h)=>{t.beginPath();for(const [i,p] of [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].entries())t[i?'lineTo':'moveTo'](...point(...p));t.closePath();t[k==='fillRect'?'fill':'stroke']();};if(k==='arc'||k==='ellipse')return (x,y,...rest)=>t[k](...point(x,y),...rest);const v=t[k];return typeof v==='function'?v.bind(t):v;},set(t,k,v){t[k]=v;return true;}});
}

// The projected mesh can fold on steep slopes; invert each triangle section
// at the requested x and select the same foremost surface as the depth test.
export function pickProjectedMesh(terrain,lod,{centerY,datum=0,tilt=0},X,Y){
 const l=terrain.lods[lod];if(!l||!tilt)return [X,Y];const [a,b,c,d]=terrain.bounds,cs=Math.sqrt(1-tilt*tilt);
 if(X<a||X>c)return [X,centerY+(Y-centerY)/cs];
 const u=C((X-a)/(c-a)*(l.cols-1),0,l.cols-1),ix=Math.min(l.cols-2,Math.floor(u)),frac=u-ix,dy=(d-b)/(l.rows-1),height=y=>meshHeight(terrain,lod,X,y),project=y=>centerY+(y-centerY)*cs-(height(y)-datum)*tilt;
 let best=null,depth=-Infinity;const guess=centerY+(Y-centerY)/cs;const maxZ=terrain.stats?.maxZ??20,minZ=terrain.stats?.minZ??-20,span=Math.max(25,Math.abs(maxZ-datum)*tilt/cs,Math.abs(minZ-datum)*tilt/cs);
 const start=Math.max(0,Math.floor((guess-span-b)/dy)),end=Math.min(l.rows-2,Math.ceil((guess+span-b)/dy));
 for(let row=start;row<=end;row++){const points=[b+row*dy,b+(row+frac)*dy,b+(row+1)*dy];for(let k=1;k<3;k++){const y0=points[k-1],y1=points[k];if(y1-y0<1e-9)continue;const p0=project(y0),p1=project(y1);if(Y<Math.min(p0,p1)-1e-7||Y>Math.max(p0,p1)+1e-7)continue;const y=Math.abs(p1-p0)<1e-9?y1:y0+(y1-y0)*C((Y-p0)/(p1-p0));const z=(y-centerY)*tilt+(height(y)-datum)*cs;if(z>depth){depth=z;best=y;}}}
 return [X,best??guess];
}

// The same independent water and ribbon triangles used by the GPU also
// provide the top visible surface for fleet markers and pointer rays.
const waterTiles=new WeakMap();
function waterIndex(terrain){
 let index=waterTiles.get(terrain);if(index)return index;index=new Map();
 for(const chunk of terrain.contours?.chunks??[]){const a=chunk.vertices;for(let i=0;i<a.length;i+=18){const x0=Math.floor(Math.min(a[i],a[i+6],a[i+12])/4),x1=Math.floor(Math.max(a[i],a[i+6],a[i+12])/4),y0=Math.floor(Math.min(a[i+1],a[i+7],a[i+13])/4),y1=Math.floor(Math.max(a[i+1],a[i+7],a[i+13])/4);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const key=x+':'+y;let list=index.get(key);if(!list)index.set(key,list=[]);list.push([a,i]);}}}
 waterTiles.set(terrain,index);return index;
}
function barycentric(x,y,a,b,c){const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-12)return null;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d,w=1-u-v;return Math.min(u,v,w)<-1e-7?null:[u,v,w];}
const tri=(a,i)=>[[a[i],a[i+1],a[i+2]],[a[i+6],a[i+7],a[i+8]],[a[i+12],a[i+13],a[i+14]]];
export function atlasSurfaceHeight(terrain,lod,x,y){let z=meshHeight(terrain,lod,x,y);for(const [a,i] of waterIndex(terrain).get(Math.floor(x/4)+':'+Math.floor(y/4))??[]){const t=tri(a,i),weights=barycentric(x,y,...t);if(weights)z=Math.max(z,weights.reduce((n,w,j)=>n+w*t[j][2],0));}return z;}
export function pickAtlasSurface(terrain,lod,cfg,x,y){
 const base=pickProjectedMesh(terrain,lod,cfg,x,y);if(!cfg.tilt)return base;const {centerY,tilt,datum=0}=cfg,cs=Math.sqrt(1-tilt*tilt),depth=(Y,z)=>(Y-centerY)*tilt+(z-datum)*cs;
 let best=base[1],front=depth(best,meshHeight(terrain,lod,x,best));const guess=centerY+(y-centerY)/cs,index=waterIndex(terrain),seen=new Map();
 for(let ty=Math.floor((guess-25)/4);ty<=Math.floor((guess+25)/4);ty++)for(const [a,i] of index.get(Math.floor(x/4)+':'+ty)??[]){let offsets=seen.get(a);if(!offsets)seen.set(a,offsets=new Set());if(offsets.has(i))continue;offsets.add(i);const t=tri(a,i),projected=t.map(p=>[p[0],centerY+(p[1]-centerY)*cs-(p[2]-datum)*tilt]),weights=barycentric(x,y,...projected);if(!weights)continue;const Y=weights.reduce((n,w,j)=>n+w*t[j][1],0),z=weights.reduce((n,w,j)=>n+w*t[j][2],0),d=depth(Y,z);if(d>=front){front=d;best=Y;}}
 return [x,best];
}
