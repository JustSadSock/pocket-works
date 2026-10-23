// Mathematical billiards: a continuous wavefront approximated by independent point rays.
// Each indexed particle retains its launch angle. Particles NEVER collide with one another.
export const WIDTH=900, HEIGHT=540, TAU=Math.PI*2;
export const SHAPES=['rectangle','circle','stadium','triangle'];
export const LIMITS={min:256,max:8192};
const EPS=1e-6;
const triangle=[{x:450,y:30},{x:855,y:506},{x:45,y:506}];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function inside(shape,x,y,pad=0){
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 if(shape==='circle')return Math.hypot(x-450,y-270)<=232-pad;
 if(shape==='stadium')return Math.hypot(x-clamp(x,278,622),y-270)<=224-pad;
 if(shape==='triangle')return triangle.every((a,i)=>{
  const b=triangle[(i+1)%3],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);
  return ((x-a.x)*-dy+(y-a.y)*dx)/l>=pad-EPS;
 });
 return x>=26+pad&&x<=874-pad&&y>=27+pad&&y<=513-pad;
}
export function contain(shape,p,pad=6){
 let x=Number.isFinite(p?.x)?p.x:450,y=Number.isFinite(p?.y)?p.y:270;
 if(shape==='circle'){
  const dx=x-450,dy=y-270,r=Math.hypot(dx,dy),max=232-pad;
  return r>max?{x:450+dx/r*max,y:270+dy/r*max}:{x,y};
 }
 if(shape==='stadium'){
  const cx=clamp(x,278,622),dx=x-cx,dy=y-270,r=Math.hypot(dx,dy),max=224-pad;
  return r>max?{x:cx+dx/r*max,y:270+dy/r*max}:{x,y};
 }
 if(shape==='triangle'){
  // Orthogonal projection onto the intersection of three inset half-planes.
  for(let repeat=0;repeat<20;repeat++)for(let i=0;i<3;i++){
   const a=triangle[i],b=triangle[(i+1)%3],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);
   const nx=-dy/l,ny=dx/l,d=(x-a.x)*nx+(y-a.y)*ny;
   if(d<pad){x+=(pad-d)*nx;y+=(pad-d)*ny}
  }
  return {x,y};
 }
 return {x:clamp(x,26+pad,874-pad),y:clamp(y,27+pad,513-pad)};
}
const validCircle=(o)=>Number.isFinite(o?.x)&&Number.isFinite(o?.y)&&Number.isFinite(o?.r);
const validMirror=(m)=>[m?.x1,m?.y1,m?.x2,m?.y2].every(Number.isFinite);
export function sanitizeWorld(raw={}){
 const shape=SHAPES.includes(raw.shape)?raw.shape:'rectangle';
 const origin=contain(shape,raw.origin||{x:355,y:250},42);
 const circles=(Array.isArray(raw.circles)?raw.circles:[]).filter(validCircle)
  .slice(0,12).map(o=>({...contain(shape,o,37),r:clamp(o.r,12,40)}))
  .filter(o=>inside(shape,o.x,o.y,o.r+2)&&Math.hypot(o.x-origin.x,o.y-origin.y)>o.r+15);
 const mirrors=(Array.isArray(raw.mirrors)?raw.mirrors:[]).filter(validMirror).slice(0,12)
 .map(m=>{const a=contain(shape,{x:m.x1,y:m.y1},8),b=contain(shape,{x:m.x2,y:m.y2},8);return {x1:a.x,y1:a.y,x2:b.x,y2:b.y}})
 .filter(m=>Math.hypot(m.x1-m.x2,m.y1-m.y2)>24);
 return {shape,origin,circles,mirrors};
}
export function initialParticles(count,point){
 const n=Math.floor(clamp(Number(count)||2048,LIMITS.min,LIMITS.max));
 const x=new Float32Array(n),y=new Float32Array(n),dx=new Float32Array(n),dy=new Float32Array(n);
 for(let i=0;i<n;i++){const angle=TAU*i/n;x[i]=point.x;y[i]=point.y;dx[i]=Math.cos(angle);dy[i]=Math.sin(angle)}
 return {x,y,dx,dy,count:n,reflections:0};
}
function choose(best,t,nx,ny,max){
 if(t>EPS&&t<=max+EPS&&t<best.t&&Number.isFinite(t))return {t,nx,ny};
 return best;
}
function rayCircle(x,y,dx,dy,cx,cy,r,insideBoundary,best,arc){
 const px=x-cx,py=y-cy,b=px*dx+py*dy,c=px*px+py*py-r*r;
 const delta=b*b-c;if(delta<=EPS)return best;
 const root=Math.sqrt(delta),t=insideBoundary?-b+root:-b-root;
 if(t<=EPS||t>=best.t)return best;
 const hx=x+t*dx,hy=y+t*dy;
 if(arc==='left'&&hx>cx+1e-4)return best;
 if(arc==='right'&&hx<cx-1e-4)return best;
 const nx=(hx-cx)/r*(insideBoundary?-1:1),ny=(hy-cy)/r*(insideBoundary?-1:1);
 if(dx*nx+dy*ny>=-EPS)return best;
 return {t,nx,ny};
}
function segmentHit(x,y,dx,dy,ax,ay,bx,by,best,oneSided){
 const sx=bx-ax,sy=by-ay,den=dx*sy-dy*sx;
 if(Math.abs(den)<1e-9)return best;
 const px=ax-x,py=ay-y;
 const t=(px*sy-py*sx)/den,u=(px*dy-py*dx)/den;
 if(t<=EPS||t>=best.t||u<0||u>1)return best;
 const len=Math.hypot(sx,sy);
 if(len<EPS)return best;
 let nx=-sy/len,ny=sx/len;
 if(oneSided){if(dx*nx+dy*ny>=-EPS)return best}
 else if(dx*nx+dy*ny>0){nx=-nx;ny=-ny}
 return {t,nx,ny};
}
function firstHit(x,y,dx,dy,world,maxDistance){
 let best={t:maxDistance+1,nx:0,ny:0};
 const shape=world.shape;
 if(shape==='rectangle'){
  if(dx>EPS)best=choose(best,(874-x)/dx,-1,0,maxDistance);
  if(dx< -EPS)best=choose(best,(26-x)/dx,1,0,maxDistance);
  if(dy>EPS)best=choose(best,(513-y)/dy,0,-1,maxDistance);
  if(dy< -EPS)best=choose(best,(27-y)/dy,0,1,maxDistance);
 }else if(shape==='circle'){
  best=rayCircle(x,y,dx,dy,450,270,232,true,best);
 }else if(shape==='stadium'){
  if(dy>EPS){const t=(494-y)/dy;const hx=x+t*dx;if(hx>=278&&hx<=622)best=choose(best,t,0,-1,maxDistance)}
  if(dy< -EPS){const t=(46-y)/dy;const hx=x+t*dx;if(hx>=278&&hx<=622)best=choose(best,t,0,1,maxDistance)}
  best=rayCircle(x,y,dx,dy,278,270,224,true,best,'left');
  best=rayCircle(x,y,dx,dy,622,270,224,true,best,'right');
 }else if(shape==='triangle'){
  for(let i=0;i<3;i++){
   const a=triangle[i],b=triangle[(i+1)%3];
   best=segmentHit(x,y,dx,dy,a.x,a.y,b.x,b.y,best,true);
  }
 }
 for(const c of world.circles){
  best=rayCircle(x,y,dx,dy,c.x,c.y,c.r,false,best);
 }
 for(const m of world.mirrors){
  best=segmentHit(x,y,dx,dy,m.x1,m.y1,m.x2,m.y2,best,false);
 }
 return best.t<=maxDistance?best:null;
}
// A Float32 particle can land *exactly* on a wall at the end of a frame.
// In that case the next positive-time ray cast cannot see the same wall.
// Keep the point just inside and turn outgoing directions inward, including at vertices.
function stabilize(x,y,dx,dy,shape){
 const margin=.002;
 if(!inside(shape,x,y,margin)){const p=contain(shape,{x,y},margin);x=p.x;y=p.y}
 let reflections=0;
 const bounce=(nx,ny)=>{
  const dot=dx*nx+dy*ny;
  if(dot< -1e-7){dx-=2*dot*nx;dy-=2*dot*ny;reflections++}
 };
 if(shape==='rectangle'){
  if(x<=26+margin*1.2)bounce(1,0);
  if(x>=874-margin*1.2)bounce(-1,0);
  if(y<=27+margin*1.2)bounce(0,1);
  if(y>=513-margin*1.2)bounce(0,-1);
 }else if(shape==='circle'||shape==='stadium'){
  const cx=shape==='circle'?450:clamp(x,278,622),cy=270,r=shape==='circle'?232:224;
  const ox=x-cx,oy=y-cy,d=Math.hypot(ox,oy);
  if(d>=r-margin*1.2&&d>0)bounce(-ox/d,-oy/d);
 }else if(shape==='triangle'){
  for(let i=0;i<3;i++){
   const a=triangle[i],b=triangle[(i+1)%3],sx=b.x-a.x,sy=b.y-a.y,l=Math.hypot(sx,sy);
   const nx=-sy/l,ny=sx/l,side=(x-a.x)*nx+(y-a.y)*ny;
   if(side<=margin*1.2)bounce(nx,ny);
  }
 }
 return {x,y,dx,dy,reflections};
}
export function propagateRay(x,y,dx,dy,distance,world){
 const start=stabilize(x,y,dx,dy,world.shape);
 x=start.x;y=start.y;dx=start.dx;dy=start.dy;
 let count=start.reflections,remaining=distance;
 for(let i=0;i<8&&remaining>EPS;i++){
  const hit=firstHit(x,y,dx,dy,world,remaining);
  if(!hit){x+=dx*remaining;y+=dy*remaining;remaining=0;break}
  x+=dx*hit.t;y+=dy*hit.t;remaining-=hit.t;
  const product=dx*hit.nx+dy*hit.ny;
  dx-=2*product*hit.nx;dy-=2*product*hit.ny;
  const norm=Math.hypot(dx,dy)||1;dx/=norm;dy/=norm;
  const push=Math.min(.0002,remaining*.1);x+=dx*push;y+=dy*push;remaining-=push;
  count++;
 }
 if(remaining>EPS){ // Rare repeated corner hit: never allow an unbounded ray.
  x+=dx*Math.min(remaining,.01);y+=dy*Math.min(remaining,.01);
 }
 const end=stabilize(x,y,dx,dy,world.shape);
 return {...end,reflections:count+end.reflections};
}
export function advance(particles,world,distance){
 const {x,y,dx,dy,count}=particles;let hits=0;
 for(let i=0;i<count;i++){
  const result=propagateRay(x[i],y[i],dx[i],dy[i],distance,world);
  x[i]=result.x;y[i]=result.y;dx[i]=result.dx;dy[i]=result.dy;hits+=result.reflections;
 }
 particles.reflections+=hits;
 return hits;
}
