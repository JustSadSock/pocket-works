// Shared orthographic projection and safe chart coverage. No hidden data.
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function chartInk(known,W,H,X,Y){
 const x=Math.floor(X),y=Math.floor(Y);if(x<0||x>=W||y<0||y>=H||!known[y*W+x])return 0;
 let d=1;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const a=x+dx,b=y+dy;if(a<0||a>=W||b<0||b>=H||known[b*W+a])continue;d=Math.min(d,Math.hypot(Math.max(a-X,0,X-a-1),Math.max(b-Y,0,Y-b-1)));}
 // Inward fade only; never extrapolate a hidden cell. Irregularity derives
 // from world coordinates, not from unknown terrain.
 const edge=.42+.075*Math.sin(X*15+Y*9)+.05*Math.sin(Y*21-X*7),t=C(d/edge);return t*t*(3-2*t);
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
