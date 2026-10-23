// Mathematical billiards: point rays launched radially from a common source.
// Positions remain angle-ordered; rays freely cross and never collide with each other.
export const WIDTH=900,HEIGHT=540,TAU=2*Math.PI;
export const SHAPES=['rectangle','circle','stadium','triangle','ellipse','diamond','pentagon','hexagon','octagon','star','custom'];
const PI=Math.PI,EPS=1e-6,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const TRI=[{x:450,y:30},{x:855,y:506},{x:45,y:506}];
const CUSTOM_DEFAULT=[{x:150,y:132},{x:454,y:48},{x:759,y:132},{x:778,y:416},{x:474,y:492},{x:135,y:410}];
const polygonArea=pts=>pts.reduce((sum,p,i)=>sum+p.x*pts[(i+1)%pts.length].y-pts[(i+1)%pts.length].x*p.y,0)/2;
function regular(n,rx=383,ry=230,offset=-PI/2){
 return Array.from({length:n},(_,i)=>({x:450+rx*Math.cos(offset+i*TAU/n),y:270+ry*Math.sin(offset+i*TAU/n)}));
}
const polygons={
 triangle:TRI,diamond:[{x:450,y:30},{x:855,y:270},{x:450,y:510},{x:45,y:270}],
 pentagon:regular(5),hexagon:regular(6),octagon:regular(8),
 star:Array.from({length:10},(_,i)=>({x:450+(i%2?203:382)*Math.cos(-PI/2+i*PI/5),y:270+(i%2?119:229)*Math.sin(-PI/2+i*PI/5)}))
};
function cross(ax,ay,bx,by){return ax*by-ay*bx}
function intersects(a,b,c,d){
 const abx=b.x-a.x,aby=b.y-a.y,cdx=d.x-c.x,cdy=d.y-c.y;
 const den=cross(abx,aby,cdx,cdy);
 if(Math.abs(den)<1e-8)return false;
 const px=c.x-a.x,py=c.y-a.y,u=cross(px,py,cdx,cdy)/den,v=cross(px,py,abx,aby)/den;
 return u>1e-5&&u<1-1e-5&&v>1e-5&&v<1-1e-5;
}
export function validatePolygon(input){
 if(!Array.isArray(input)||input.length<3||input.length>16)return {ok:false,reason:'Нужно от 3 до 16 точек.'};
 const pts=input.map(p=>({x:Number(p?.x),y:Number(p?.y)}));
 if(pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<36||p.x>864||p.y<36||p.y>504))return {ok:false,reason:'Точки должны находиться внутри рабочей области.'};
 for(let i=0;i<pts.length;i++){
  const a=pts[i],b=pts[(i+1)%pts.length];
  if(Math.hypot(a.x-b.x,a.y-b.y)<26)return {ok:false,reason:'Соседние углы слишком близко.'};
  for(let j=i+1;j<pts.length;j++){
   if(j===i+1||(i===0&&j===pts.length-1))continue;
   if(intersects(a,b,pts[j],pts[(j+1)%pts.length]))return {ok:false,reason:'Стенки поля не должны пересекаться.'};
  }
 }
 if(Math.abs(polygonArea(pts))<17000)return {ok:false,reason:'Поле слишком маленькое.'};
 if(Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x))<120||Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y))<120)return {ok:false,reason:'Увеличь поле по ширине и высоте.'};
 if(polygonArea(pts)<0)pts.reverse();
 return {ok:true,points:pts};
}
export function shapePolygon(shape,vertices){
 if(shape==='custom')return validatePolygon(vertices).ok?validatePolygon(vertices).points:CUSTOM_DEFAULT.map(p=>({...p}));
 return polygons[shape]||null;
}
export function edgesOf(pts){
 return pts.map((a,i)=>{const b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);return {x1:a.x,y1:a.y,x2:b.x,y2:b.y,dx,dy,nx:-dy/l,ny:dx/l,l}});
}
function inPolygon(pts,x,y){
 let inside=false;
 for(let i=0,j=pts.length-1;i<pts.length;j=i++){
  const a=pts[i],b=pts[j];
  if(((a.y>y)!==(b.y>y))&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
function sideDistance(pts,x,y){
 let best=Infinity;
 for(let i=0;i<pts.length;i++){
  const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
  const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/l2,0,1);
  best=Math.min(best,Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy)));
 }
 return best;
}
export function inside(shape,x,y,pad=0,vertices=null){
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 if(shape==='circle')return Math.hypot(x-450,y-270)<=232-pad+EPS;
 if(shape==='stadium')return Math.hypot(x-clamp(x,278,622),y-270)<=224-pad+EPS;
 if(shape==='ellipse')return Math.hypot((x-450)/386,(y-270)/232)<=1-pad/232+EPS;
 const poly=shapePolygon(shape,vertices);
 if(poly){
  if(!inPolygon(poly,x,y))return pad<0&&sideDistance(poly,x,y)<Math.abs(pad)+EPS;
  return pad<=0||sideDistance(poly,x,y)>=pad-EPS;
 }
 return x>=26+pad-EPS&&x<=874-pad+EPS&&y>=27+pad-EPS&&y<=513-pad+EPS;
}
function safeAnchor(shape,vertices,pad=2){
 const trial=[{x:450,y:270}];
 for(let y=80;y<=460;y+=24)for(let x=90;x<=810;x+=24)trial.push({x,y});
 let chosen=null,score=-1;
 for(const q of trial){
  if(!inside(shape,q.x,q.y,pad,vertices))continue;
  const poly=shapePolygon(shape,vertices),d=poly?sideDistance(poly,q.x,q.y):Math.min(q.x-26,874-q.x,q.y-27,513-q.y);
  if(d>score){chosen=q;score=d}
 }
 return chosen||{x:450,y:270};
}
export function contain(shape,p,pad=6,vertices=null){
 const x=Number.isFinite(p?.x)?p.x:450,y=Number.isFinite(p?.y)?p.y:270;
 if(shape==='rectangle')return {x:clamp(x,26+pad,874-pad),y:clamp(y,27+pad,513-pad)};
 if(shape==='circle'||shape==='stadium'){
  const cx=shape==='circle'?450:clamp(x,278,622),cy=270,max=(shape==='circle'?232:224)-pad;
  const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy);
  return d>max?{x:cx+dx/d*max,y:cy+dy/d*max}:{x,y};
 }
 if(shape==='ellipse'){
  const dx=x-450,dy=y-270,n=Math.hypot(dx/(386-pad),dy/(232-pad));
  return n>1?{x:450+dx/n,y:270+dy/n}:{x,y};
 }
 if(inside(shape,x,y,pad,vertices))return {x,y};
 const anchor=safeAnchor(shape,vertices,pad+1);
 // Convex polygons converge to the nearest position on the interior segment.
 // For concave polygons, this bisection deliberately chooses the component
 // containing a verified interior anchor.
 let lo=0,hi=1;
 for(let i=0;i<30;i++){
  const t=(lo+hi)/2,px=anchor.x+(x-anchor.x)*t,py=anchor.y+(y-anchor.y)*t;
  if(inside(shape,px,py,pad,vertices))lo=t;else hi=t;
 }
 return {x:anchor.x+(x-anchor.x)*lo,y:anchor.y+(y-anchor.y)*lo};
}
const validCircle=o=>Number.isFinite(o?.x)&&Number.isFinite(o?.y)&&Number.isFinite(o?.r);
const validMirror=m=>[m?.x1,m?.y1,m?.x2,m?.y2].every(Number.isFinite);
export function sanitizeWorld(raw={}){
 const shape=SHAPES.includes(raw.shape)?raw.shape:'rectangle';
 const vertices=shape==='custom'?(validatePolygon(raw.vertices).ok?validatePolygon(raw.vertices).points:CUSTOM_DEFAULT.map(p=>({...p}))):null;
 const poly=shapePolygon(shape,vertices);
 const origin=contain(shape,raw.origin||{x:355,y:250},20,vertices);
 const circles=(Array.isArray(raw.circles)?raw.circles:[]).filter(validCircle).slice(0,12).map(o=>({...contain(shape,o,Math.max(12,o.r)+6,vertices),r:clamp(o.r,12,40)}))
  .filter(o=>inside(shape,o.x,o.y,o.r+3,vertices)&&Math.hypot(o.x-origin.x,o.y-origin.y)>o.r+15);
 const mirrors=(Array.isArray(raw.mirrors)?raw.mirrors:[]).filter(validMirror).slice(0,12)
  .map(m=>{const a=contain(shape,{x:m.x1,y:m.y1},10,vertices),b=contain(shape,{x:m.x2,y:m.y2},10,vertices);return {x1:a.x,y1:a.y,x2:b.x,y2:b.y}})
  .filter(m=>Math.hypot(m.x1-m.x2,m.y1-m.y2)>24);
 const result={shape,origin,circles,mirrors};
 if(vertices)result.vertices=vertices;
 Object.defineProperty(result,'polygon',{value:poly,enumerable:false,writable:false});
 Object.defineProperty(result,'edges',{value:poly?edgesOf(poly):[],enumerable:false,writable:false});
 return result;
}
export function initialParticles(count,origin){
 const n=Math.min(8192,Math.max(256,Math.floor(Number(count)||2048)));
 const x=new Float32Array(n),y=new Float32Array(n),dx=new Float32Array(n),dy=new Float32Array(n);
 for(let i=0;i<n;i++){const a=TAU*i/n;x[i]=origin.x;y[i]=origin.y;dx[i]=Math.cos(a);dy[i]=Math.sin(a)}
 return {x,y,dx,dy,count:n,reflections:0};
}
function hitCircle(x,y,dx,dy,cx,cy,r,interior,best,arc='all'){
 const px=x-cx,py=y-cy,b=px*dx+py*dy,c=px*px+py*py-r*r,delta=b*b-c;
 if(delta<=0)return best;
 const root=Math.sqrt(delta),t=interior?-b+root:-b-root;
 if(t<=EPS||t>=best.t)return best;
 const hx=x+dx*t,hy=y+dy*t;
 if(arc==='left'&&hx>cx+1e-3)return best;
 if(arc==='right'&&hx<cx-1e-3)return best;
 let nx=(hx-cx)/r,ny=(hy-cy)/r;
 if(interior){nx=-nx;ny=-ny}
 if(dx*nx+dy*ny>=-EPS)return best;
 return {t,nx,ny};
}
function hitSegment(x,y,dx,dy,e,best,oneSide){
 const den=dx*e.dy-dy*e.dx;
 if(Math.abs(den)<1e-10)return best;
 const px=e.x1-x,py=e.y1-y,t=(px*e.dy-py*e.dx)/den,u=(px*dy-py*dx)/den;
 if(t<=EPS||t>=best.t||u<0||u>1)return best;
 let nx=e.nx,ny=e.ny;
 if(!oneSide&&dx*nx+dy*ny>0){nx=-nx;ny=-ny}
 if(dx*nx+dy*ny>=-EPS)return best;
 return {t,nx,ny};
}
function firstHit(x,y,dx,dy,world,distance){
 let best={t:distance+1,nx:0,ny:0};
 const shape=world.shape;
 const wall=(t,nx,ny)=>{if(t>EPS&&t<best.t)best={t,nx,ny}};
 if(shape==='rectangle'){
  if(dx>EPS)wall((874-x)/dx,-1,0);else if(dx< -EPS)wall((26-x)/dx,1,0);
  if(dy>EPS)wall((513-y)/dy,0,-1);else if(dy< -EPS)wall((27-y)/dy,0,1);
 }else if(shape==='circle')best=hitCircle(x,y,dx,dy,450,270,232,true,best);
 else if(shape==='ellipse'){
  const rx=386,ry=232,px=(x-450)/rx,py=(y-270)/ry,ax=dx/rx,ay=dy/ry,A=ax*ax+ay*ay,B=px*ax+py*ay,C=px*px+py*py-1,D=B*B-A*C;
  if(D>=0&&A>EPS*EPS){const t=(-B+Math.sqrt(D))/A;if(t>EPS&&t<best.t){const hx=x+dx*t,hy=y+dy*t,nx=-(hx-450)/(rx*rx),ny=-(hy-270)/(ry*ry),l=Math.hypot(nx,ny);if(dx*nx+dy*ny<0)best={t,nx:nx/l,ny:ny/l}}}
 }else if(shape==='stadium'){
  if(dy>EPS){const t=(494-y)/dy,hx=x+dx*t;if(hx>=278&&hx<=622)wall(t,0,-1)}
  if(dy< -EPS){const t=(46-y)/dy,hx=x+dx*t;if(hx>=278&&hx<=622)wall(t,0,1)}
  best=hitCircle(x,y,dx,dy,278,270,224,true,best,'left');
  best=hitCircle(x,y,dx,dy,622,270,224,true,best,'right');
 }else for(const e of world.edges)best=hitSegment(x,y,dx,dy,e,best,true);
 for(const c of world.circles)best=hitCircle(x,y,dx,dy,c.x,c.y,c.r,false,best);
 for(const m of world.mirrors){
  const ex=m.x2-m.x1,ey=m.y2-m.y1,l=Math.hypot(ex,ey);
  best=hitSegment(x,y,dx,dy,{x1:m.x1,y1:m.y1,dx:ex,dy:ey,nx:-ey/l,ny:ex/l},best,false);
 }
 return best.t<=distance+EPS?best:null;
}
function stabilize(x,y,dx,dy,world){
 const shape=world.shape,margin=.004;
 const within=world.polygon ? inPolygon(world.polygon,x,y) : inside(shape,x,y,margin,world.vertices);
 if(!within){const q=contain(shape,{x,y},margin,world.vertices);x=q.x;y=q.y}
 let reflections=0;
 const bounce=(nx,ny)=>{const dot=dx*nx+dy*ny;if(dot< -1e-7){dx-=2*dot*nx;dy-=2*dot*ny;reflections++}};
 if(shape==='rectangle'){
  if(x<=26+margin*1.5)bounce(1,0);if(x>=874-margin*1.5)bounce(-1,0);
  if(y<=27+margin*1.5)bounce(0,1);if(y>=513-margin*1.5)bounce(0,-1);
 }else if(shape==='circle'||shape==='stadium'){
  const cx=shape==='circle'?450:clamp(x,278,622),cy=270,r=shape==='circle'?232:224,d=Math.hypot(x-cx,y-cy);
  if(d>=r-margin*1.5&&d>0)bounce((cx-x)/d,(cy-y)/d);
 }else if(shape==='ellipse'){
  const dx1=x-450,dy1=y-270,l=Math.hypot(dx1/386,dy1/232);
  if(l>=1-margin/232){
   const nx=-dx1/(386*386),ny=-dy1/(232*232),m=Math.hypot(nx,ny);
   if(m>0)bounce(nx/m,ny/m);
  }
 }else{
  for(const e of world.edges){
   const t=clamp(((x-e.x1)*e.dx+(y-e.y1)*e.dy)/(e.l*e.l),0,1),ox=x-e.x1-t*e.dx,oy=y-e.y1-t*e.dy;
   if(ox*ox+oy*oy<margin*margin*3.24)bounce(e.nx,e.ny);
  }
 }
 return {x,y,dx,dy,reflections};
}
export function propagateRay(x,y,dx,dy,distance,world){
 const start=stabilize(x,y,dx,dy,world);
 x=start.x;y=start.y;dx=start.dx;dy=start.dy;
 let count=start.reflections,remaining=distance;
 for(let i=0;i<9&&remaining>EPS;i++){
  const hit=firstHit(x,y,dx,dy,world,remaining);
  if(!hit){x+=dx*remaining;y+=dy*remaining;remaining=0;break}
  x+=dx*hit.t;y+=dy*hit.t;remaining=Math.max(0,remaining-hit.t);
  const projection=dx*hit.nx+dy*hit.ny;
  dx-=2*projection*hit.nx;dy-=2*projection*hit.ny;
  const norm=Math.hypot(dx,dy)||1;dx/=norm;dy/=norm;
  const push=Math.min(.001,remaining*.1);x+=dx*push;y+=dy*push;remaining-=push;count++;
 }
 if(remaining>EPS){x+=dx*Math.min(.01,remaining);y+=dy*Math.min(.01,remaining)}
 const end=stabilize(x,y,dx,dy,world);
 return {...end,reflections:count+end.reflections};
}
export function advance(particles,world,distance){
 const {x,y,dx,dy,count}=particles;let hits=0;
 for(let i=0;i<count;i++){
  const r=propagateRay(x[i],y[i],dx[i],dy[i],distance,world);
  x[i]=r.x;y[i]=r.y;dx[i]=r.dx;dy[i]=r.dy;hits+=r.reflections;
 }
 particles.reflections+=hits;
 return hits;
}
