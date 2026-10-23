// Shared pure continuous collision geometry. Identical source is in frozen PocketNet rules.
const GEOMETRY_EPS=1e-8;
const COLLISION_WALLS=[{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}];
export function segmentBox(x,y,dx,dy,r,b){
 const minX=b.x-r,maxX=b.x+b.w+r,minY=b.y-r,maxY=b.y+b.h+r;
 let near=-Infinity,far=Infinity,nx=0,ny=0;
 for(const [pos,delta,lo,hi,axis] of [[x,dx,minX,maxX,'x'],[y,dy,minY,maxY,'y']]){
  if(Math.abs(delta)<GEOMETRY_EPS){if(pos<lo||pos>hi)return null;continue}
  const t0=(lo-pos)/delta,t1=(hi-pos)/delta,entry=Math.min(t0,t1),exit=Math.max(t0,t1);
  if(entry>near){near=entry;nx=axis==='x'?(delta>0?-1:1):0;ny=axis==='y'?(delta>0?-1:1):0}
  far=Math.min(far,exit);
  if(near>far)return null;
 }
 if(far<0||near>1)return null;
 return {t:Math.max(0,near),nx,ny,exit:far};
}
export function segmentCircle(x,y,dx,dy,r,c){
 const vx=x-c.x,vy=y-c.y,rr=r+c.r,A=dx*dx+dy*dy,C=vx*vx+vy*vy-rr*rr;
 if(C<=0){const d=Math.hypot(vx,vy)||1;return {t:0,nx:vx/d,ny:vy/d}}
 if(A<GEOMETRY_EPS)return null;
 const B=2*(vx*dx+vy*dy),D=B*B-4*A*C;if(D<0)return null;
 const t=(-B-Math.sqrt(D))/(2*A);if(t<0||t>1)return null;
 const hx=vx+dx*t,hy=vy+dy*t,d=Math.hypot(hx,hy)||1;
 return {t,nx:hx/d,ny:hy/d,exit:(-B+Math.sqrt(D))/(2*A)};
}
export function firstCollision(s,x,y,dx,dy,r,owner,{actors=false,skipBarrier=-1}={}){
 let best=null;
 function offer(hit,type,index=-1){if(!hit||hit.t>1||hit.t<0)return;
  if(!best||hit.t<best.t-1e-7||(Math.abs(hit.t-best.t)<1e-7&&type!=='actor'&&best.type==='actor'))
    best={...hit,type,index,x:x+dx*hit.t,y:y+dy*hit.t};
 }
 const W=400,H=620;
 offer(segmentBox(x,y,dx,dy,0,{x:-10000,y:-10000,w:10019+r,h:20620}),'edge');
 offer(segmentBox(x,y,dx,dy,0,{x:381-r,y:-10000,w:10000,h:20620}),'edge');
 offer(segmentBox(x,y,dx,dy,0,{x:-10000,y:-10000,w:20400,h:10021+r}),'edge');
 offer(segmentBox(x,y,dx,dy,0,{x:-10000,y:599-r,w:20400,h:10000}),'edge');
 for(let i=0;i<COLLISION_WALLS.length;i++)offer(segmentBox(x,y,dx,dy,r,COLLISION_WALLS[i]),'wall',i);
 for(let i=0;i<(s?.barriers?.length||0);i++){
  if(i===skipBarrier)continue;
  const b=s.barriers[i];if(b.aperture&&b.owner===owner)continue;
  offer(segmentCircle(x,y,dx,dy,r,b),'barrier',i);
 }
 if(actors&&Number.isInteger(owner)&&s?.actors?.[1-owner]){
  const t=s.actors[1-owner];if(t.hp>0)offer(segmentCircle(x,y,dx,dy,r,{x:t.x,y:t.y,r:12}),'actor',1-owner);
 }
 return best;
}
export function rayCollision(s,x,y,angle,distance,r=3,owner=null){
 const dx=Math.cos(angle)*distance,dy=Math.sin(angle)*distance;
 const hit=firstCollision(s,x,y,dx,dy,r,owner);
 return {length:hit?Math.max(0,distance*hit.t):distance,hit};
}
