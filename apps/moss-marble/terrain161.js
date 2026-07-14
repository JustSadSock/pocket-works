import { hillHeightAt, rampHeightAt, terrainHeightAt, zoneCenter, zoneKind } from './terrain.js';

const TAU = Math.PI * 2;
const STRIDE = 11;
const lerp = (a, b, t) => a + (b - a) * t;
const C = {
  soil:[.22,.17,.10,1], wet:[.12,.17,.12,1], sand:[.72,.58,.33,1], sand2:[.88,.76,.49,1],
  moss:[.18,.38,.20,1], moss2:[.34,.53,.27,1], hill:[.38,.51,.27,1], hill2:[.55,.64,.36,1], hill3:[.21,.31,.16,1],
  wood:[.38,.25,.13,1], wood2:[.63,.45,.24,1], stone:[.39,.41,.36,1], stone2:[.62,.62,.53,1],
  iron:[.06,.13,.10,1], iron2:[.22,.31,.23,1], brass:[.58,.43,.19,1], water:[.17,.42,.42,.78], water2:[.36,.65,.60,.42], deep:[.06,.20,.20,1],
  curb:[.29,.31,.26,1], lip:[.55,.56,.47,1]
};

function noise(x,y=0,s=0){const v=Math.sin(x*12.9898+y*78.233+s*37.719)*43758.5453;return v-Math.floor(v)}
function normal(a,b,c){const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,l=Math.hypot(x,y,z)||1;return[x/l,y/l,z/l]}
class Mesh{
  constructor(){this.d=[]}
  v(p,n,c,m){this.d.push(...p,...n,...c,m)}
  tri(a,b,c,t,m,n=normal(a,b,c)){this.v(a,n,t,m);this.v(b,n,t,m);this.v(c,n,t,m)}
  quad(a,b,c,d,t,m,n=normal(a,b,c)){this.tri(a,b,c,t,m,n);this.tri(a,c,d,t,m,n)}
  fan(points,z,t,m){if(points.length<3)return;const c=center(points),cz=z(c);for(let i=0;i<points.length;i++){const j=(i+1)%points.length;this.tri([c.x,c.y,cz],[points[i].x,points[i].y,z(points[i])],[points[j].x,points[j].y,z(points[j])],t,m)}}
  array(){return new Float32Array(this.d)}
}
function center(p){return p.reduce((s,q)=>({x:s.x+q.x/p.length,y:s.y+q.y/p.length}),{x:0,y:0})}
function scaled(p,f){const c=center(p);return p.map(q=>({x:lerp(c.x,q.x,f),y:lerp(c.y,q.y,f)}))}
function bounds(z){return z.shape==='circle'?{x:z.x-z.r,y:z.y-z.r,w:z.r*2,h:z.r*2}:{x:z.x,y:z.y,w:z.w,h:z.h}}
function organic(z,seed=0,margin=0,count=28){
  if(z.shape==='poly'&&z.points?.length>=6){const c=center(z.points),b=bounds(z),f=1+margin/Math.max(24,Math.min(b.w,b.h)*.5);return z.points.map(p=>({x:lerp(c.x,p.x,f),y:lerp(c.y,p.y,f)}))}
  const b=bounds(z),cx=b.x+b.w*.5,cy=b.y+b.h*.5,rx=b.w*.5+margin,ry=b.h*.5+margin,p=z.shape==='circle'?2:4.2;
  return Array.from({length:count},(_,i)=>{const a=i/count*TAU,ca=Math.cos(a),sa=Math.sin(a),w=1+(noise(i,seed,13)-.5)*.045;return{x:cx+Math.sign(ca)*Math.pow(Math.abs(ca),2/p)*rx*w,y:cy+Math.sign(sa)*Math.pow(Math.abs(sa),2/p)*ry*w}})
}
function ellipse(cx,cy,rx,ry,k=1,n=32,s=0){return Array.from({length:n},(_,i)=>{const a=i/n*TAU,w=1+(noise(i,s,31)-.5)*.025*k;return{x:cx+Math.cos(a)*rx*k*w,y:cy+Math.sin(a)*ry*k*w}})}
function roundRect(z,r=16,n=4){const x0=z.x,y0=z.y,x1=z.x+z.w,y1=z.y+z.h,R=Math.min(r,z.w*.25,z.h*.25),cs=[[x1-R,y0+R,-Math.PI/2],[x1-R,y1-R,0],[x0+R,y1-R,Math.PI/2],[x0+R,y0+R,Math.PI]];const p=[];for(const[cx,cy,a0]of cs)for(let i=0;i<=n;i++){const a=a0+i/n*Math.PI/2;p.push({x:cx+Math.cos(a)*R,y:cy+Math.sin(a)*R})}return p}
function ring(m,o,i,oz,iz,t,mat){const n=Math.min(o.length,i.length),Z=(v,p)=>typeof v==='function'?v(p):v;for(let k=0;k<n;k++){const j=(k+1)%n;m.quad([o[k].x,o[k].y,Z(oz,o[k])],[o[j].x,o[j].y,Z(oz,o[j])],[i[j].x,i[j].y,Z(iz,i[j])],[i[k].x,i[k].y,Z(iz,i[k])],t,mat)}}
function disc(m,x,y,z,rx,ry,t,mat,n=18,s=0){const p=Array.from({length:n},(_,i)=>{const a=i/n*TAU,w=1+(noise(i,s,41)-.5)*.14;return{x:x+Math.cos(a)*rx*w,y:y+Math.sin(a)*ry*w}});m.fan(p,()=>z,t,mat)}
function box(m,ax,ay,bx,by,w,z0,z1,t,mat=0){const dx=bx-ax,dy=by-ay,l=Math.hypot(dx,dy)||1,nx=-dy/l*w*.5,ny=dx/l*w*.5,A=[ax+nx,ay+ny],B=[ax-nx,ay-ny],C1=[bx-nx,by-ny],D=[bx+nx,by+ny],p=(q,z)=>[q[0],q[1],z];m.quad(p(A,z1),p(B,z1),p(C1,z1),p(D,z1),t,mat,[0,0,1]);m.quad(p(A,z0),p(D,z0),p(D,z1),p(A,z1),t,mat);m.quad(p(B,z0),p(B,z1),p(C1,z1),p(C1,z0),t,mat);m.quad(p(A,z0),p(A,z1),p(B,z1),p(B,z0),t,mat);m.quad(p(D,z0),p(C1,z0),p(C1,z1),p(D,z1),t,mat)}
function strip(m,a,b,w,za,zb,t,mat=0){const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,nx=-dy/l*w*.5,ny=dx/l*w*.5;m.quad([a.x+nx,a.y+ny,za],[a.x-nx,a.y-ny,za],[b.x-nx,b.y-ny,zb],[b.x+nx,b.y+ny,zb],t,mat)}

function addHill(m,z,s){
  const c=zoneCenter(z),b=bounds(z),rx=Math.max(34,b.w*.47),ry=Math.max(30,b.h*.47),base=Number(z.baseZ??0),N=32,R=8;disc(m,c.x,c.y,base+.12,rx*1.05,ry*1.05,C.wet,0,32,s);let prev=null;
  for(let r=1;r<=R;r++){const k=r/R,cur=ellipse(c.x,c.y,rx,ry,k,N,s);if(!prev){for(let i=0;i<N;i++){const j=(i+1)%N;m.tri([c.x,c.y,hillHeightAt(z,c.x,c.y)+.42],[cur[i].x,cur[i].y,hillHeightAt(z,cur[i].x,cur[i].y)+.36],[cur[j].x,cur[j].y,hillHeightAt(z,cur[j].x,cur[j].y)+.36],i%3?C.hill:C.hill2,5)}}else ring(m,cur,prev,p=>hillHeightAt(z,p.x,p.y)+.34,p=>hillHeightAt(z,p.x,p.y)+.36,r>R-2?C.hill3:r%2?C.hill:C.hill2,5);prev=cur}
  for(const k of[.34,.53,.71,.86])ring(m,ellipse(c.x,c.y,rx,ry,k+.012,N,s),ellipse(c.x,c.y,rx,ry,k-.012,N,s),p=>hillHeightAt(z,p.x,p.y)+.62,p=>hillHeightAt(z,p.x,p.y)+.62,C.hill2,5)
}
function addRamp(m,z){const stone=(z.rampMaterial||z.material)==='stone',top=stone?C.stone2:C.wood2,side=stone?C.stone:C.wood,p=roundRect(z,stone?10:17),H=q=>rampHeightAt(z,q.x,q.y)+.42;m.fan(p,H,top,0);for(let i=0;i<p.length;i++){const j=(i+1)%p.length;m.quad([p[i].x,p[i].y,.35],[p[j].x,p[j].y,.35],[p[j].x,p[j].y,H(p[j])],[p[i].x,p[i].y,H(p[i])],side,0)}const v=z.h>=z.w,N=stone?5:8;for(let i=1;i<N;i++){const k=i/N,a=v?{x:z.x+7,y:lerp(z.y+5,z.y+z.h-5,k)}:{x:lerp(z.x+5,z.x+z.w-5,k),y:z.y+7},b=v?{x:z.x+z.w-7,y:a.y}:{x:a.x,y:z.y+z.h-7};strip(m,a,b,stone?2.2:3.6,H(a)+.24,H(b)+.24,stone?C.stone:C.wood)}}
function addSand(m,z,s){const o=organic(z,s,10),i=scaled(o,.87),h=Number(z.baseZ??-6)+.28;ring(m,o,i,.24,h,C.soil,0);m.fan(i,()=>h,C.sand,8);const b=bounds(z);for(let k=0;k<12;k++){const x=b.x+b.w*(.13+noise(k,s,73)*.74),y=b.y+b.h*(.13+noise(k,s,79)*.74);disc(m,x,y,h+.12,7+noise(k,s,83)*18,3+noise(k,s,89)*8,k%3?C.sand:C.sand2,8,12,s+k)}}
function addMoss(m,z,s){const p=organic(z,s,5);m.fan(p,()=>.27,C.moss,7);const b=bounds(z);for(let k=0;k<16;k++){const x=b.x+b.w*(.1+noise(k,s,97)*.8),y=b.y+b.h*(.1+noise(k,s,101)*.8);disc(m,x,y,.36+noise(k,s,103)*.12,8+noise(k,s,107)*24,5+noise(k,s,109)*15,k%4?C.moss:C.moss2,7,14,s+k)}}
function addWater(o,t,z,s){const a=organic(z,s,10),i=scaled(a,.87);ring(o,a,i,.22,-.65,C.wet,0);o.fan(i,()=>-3.2,C.deep,0);t.fan(i,()=>.14,C.water,6);const b=bounds(z);for(let r=1;r<=6;r++){const y=b.y+b.h*r/7,x0=b.x+b.w*.1,x1=b.x+b.w*.9,d=(noise(r,s,121)-.5)*18;strip(t,{x:x0+d,y},{x:x1+d,y:y+Math.sin(r)*4},1.8,.24,.24,C.water2,6)}}
function addBridge(m,z){const h=Number(z.height??10)+.24,p=roundRect(z,10,3);m.fan(p,()=>h,C.wood2,0);for(let i=0;i<p.length;i++){const j=(i+1)%p.length;m.quad([p[i].x,p[i].y,2],[p[j].x,p[j].y,2],[p[j].x,p[j].y,h],[p[i].x,p[i].y,h],C.wood,0)}const v=z.h>=z.w;for(let i=1;i<10;i++){const k=i/10,a=v?{x:z.x+3,y:z.y+z.h*k}:{x:z.x+z.w*k,y:z.y+3},b=v?{x:z.x+z.w-3,y:a.y}:{x:a.x,y:z.y+z.h-3};strip(m,a,b,2.2,h+.18,h+.18,C.wood)}const rails=v?[[z.x,z.y,z.x,z.y+z.h],[z.x+z.w,z.y,z.x+z.w,z.y+z.h]]:[[z.x,z.y,z.x+z.w,z.y],[z.x,z.y+z.h,z.x+z.w,z.y+z.h]];for(const[ax,ay,bx,by]of rails){box(m,ax,ay,bx,by,6,h-1,h+5,C.iron,4);box(m,ax,ay,bx,by,4,h+27,h+32,C.iron2,4);const N=Math.max(2,Math.floor(Math.hypot(bx-ax,by-ay)/88));for(let i=0;i<=N;i++){const k=i/N,x=lerp(ax,bx,k),y=lerp(ay,by,k);box(m,x,y,x+.01,y+.01,7,h-1,h+32,C.iron,4)}}}
function addBoundary(m,l){const p=l.outline||[];if(p.length<3)return;const c=center(p);for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;let nx=-dy/L,ny=dx/L,mx=(a.x+b.x)*.5,my=(a.y+b.y)*.5;if((c.x-mx)*nx+(c.y-my)*ny<0){nx*=-1;ny*=-1}m.quad([a.x,a.y,.12],[b.x,b.y,.12],[b.x,b.y,16.7],[a.x,a.y,16.7],C.curb,0);m.quad([a.x,a.y,16.62],[b.x,b.y,16.62],[b.x+nx*6,b.y+ny*6,17],[a.x+nx*6,a.y+ny*6,17],C.lip,0,[0,0,1])}}
function addBases(m,l,s){for(let i=0;i<(l.obstacles||[]).length;i++){const o=l.obstacles[i],g=terrainHeightAt(l,o.x,o.y),t=o.material==='pot'||o.material==='cup'?C.wet:C.moss;disc(m,o.x,o.y+o.r*.05,g+.18,o.r*1.16,o.r*.84,t,7,24,s+i*17);for(let k=0;k<5;k++){const a=(k/5+noise(i,k,s)*.11)*TAU,r=o.r*(.8+noise(k,i,s)*.24);disc(m,o.x+Math.cos(a)*r,o.y+Math.sin(a)*r,g+.3,o.r*(.12+noise(k,s,151)*.12),o.r*(.07+noise(k,s,157)*.08),k%2?C.moss:C.moss2,7,12,s+i+k)}}}
function addWalls(m,l){for(const w of l.terrainWalls||l.walls||[]){const mat=w.material||'wood';if(mat==='glass'||mat==='iron'){const t=Math.max(8,Number(w.thickness||18)*.58);box(m,w.ax,w.ay,w.bx,w.by,t,1,11,C.iron,4);box(m,w.ax,w.ay,w.bx,w.by,Math.max(4,t*.5),39,45,C.iron2,4);const N=Math.max(2,Math.floor(Math.hypot(w.bx-w.ax,w.by-w.ay)/86));for(let i=0;i<=N;i++){const k=i/N,x=lerp(w.ax,w.bx,k),y=lerp(w.ay,w.by,k);box(m,x,y,x+.01,y+.01,t,1,45,i%2?C.iron:C.brass,4)}}else box(m,w.ax,w.ay,w.bx,w.by,Number(w.thickness||18),.5,34,mat==='brass'?C.brass:C.wood,mat==='brass'?4:0)}}
function build(l){const o=new Mesh,t=new Mesh,s=Number(l.id)||1;addBoundary(o,l);for(let i=0;i<(l.zones||[]).length;i++){const z=l.zones[i],k=zoneKind(z),S=s*43+i*109;if(k==='sand')addSand(o,z,S);else if(k==='moss')addMoss(o,z,S);else if(k==='slope')z.ramp?addRamp(o,z):addHill(o,z,S);else if(k==='water')addWater(o,t,z,S);else if(k==='bridge')addBridge(o,z)}addBases(o,l,s);addWalls(o,l);return{opaque:o.array(),transparent:t.array()}}
function gpu(gl,data){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return{buffer,count:data.length/STRIDE}}

export function installTerrain161(core,canvas){
  if(!core?.gl||!core?.program||!core?.drawMesh)return{captureLegacyDrawMesh:false,destroy(){}};
  canvas.parentElement?.classList.add('moss-terrain-depth-fixed');
  const oldEnsure=core.ensureStatic.bind(core),oldRender=core.render3D.bind(core);let key=null,meshes=null;
  const ensure=l=>{const next=l.renderId??l.id;if(meshes&&key===next)return meshes;if(meshes){core.gl.deleteBuffer(meshes.opaque.buffer);core.gl.deleteBuffer(meshes.transparent.buffer)}const b=build(l);meshes={opaque:gpu(core.gl,b.opaque),transparent:gpu(core.gl,b.transparent)};key=next;return meshes};
  core.ensureStatic=function(l){oldEnsure(l);ensure(l)};
  core.render3D=function(l,time){const gl=core.gl,a=ensure(l);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(core.program);gl.uniform2f(core.locations.viewport,core.width,core.height);gl.uniform1f(core.locations.scale,core.scale);gl.uniform2f(core.locations.offset,core.offsetX,core.offsetY);gl.uniform2f(core.locations.parallax,core.parallaxX,core.parallaxY);gl.uniform3f(core.locations.hole,l.hole.x,l.hole.y,l.hole.r*1.03);gl.uniform1f(core.locations.time,time);core.drawMesh(core.staticMeshes.opaque,false,true);core.drawMesh(a.opaque,false,true);core.drawMesh(core.staticMeshes.shadows,true,false);core.drawMesh(core.dynamicShadows,true,false);core.drawMesh(core.dynamicOpaque,false,true);core.drawMesh(core.staticMeshes.transparent,true,false);core.drawMesh(a.transparent,true,false);core.drawMesh(core.dynamicTransparent,true,false);gl.depthMask(true)};
  return{captureLegacyDrawMesh:true,destroy(){core.ensureStatic=oldEnsure;core.render3D=oldRender;if(meshes){core.gl.deleteBuffer(meshes.opaque.buffer);core.gl.deleteBuffer(meshes.transparent.buffer)}canvas.parentElement?.classList.remove('moss-terrain-depth-fixed')}};
}
