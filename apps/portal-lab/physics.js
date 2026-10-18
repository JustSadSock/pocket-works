// SI velocities and gravity, pixel positions. This is an idealized, orientable 2D seam.
export const SCALE=72, W=720, H=920, STEP=1/120;
export const dot=(ax,ay,bx,by)=>ax*bx+ay*by;
export function portalAt(site,index){
  return {...site,id:index,tx:-site.ny,ty:site.nx};
}
export function portalPairs(sim){
  const out=[];
  sim.pairSites.forEach((ids,pair)=>{
    if(ids.length===2&&ids[0]!==ids[1]&&sim.sites[ids[0]]&&sim.sites[ids[1]]){
      out.push({pair,a:portalAt(sim.sites[ids[0]],ids[0]),b:portalAt(sim.sites[ids[1]],ids[1])});
    }
  });
  return out;
}
export function makeBall(x,y,vx,vy,options={}){
  return {x,y,vx,vy,r:options.r||14,m:options.m||1,omega:0,angle:0,age:0,cool:0,history:[],alive:true,transits:0};
}
export function kinetic(b){return .5*b.m*(b.vx*b.vx+b.vy*b.vy);}
export function potential(b,gravity){return b.m*gravity*(H-b.y)/SCALE;}
export function totalEnergy(sim){return sim.balls.reduce((s,b)=>s+kinetic(b)+potential(b,sim.gravity),0)+(sim.anchorWork||0);}
function checkPortal(b,px,py,pair,sim,h){
  // +normal is the open side. The center passes the oriented plane, not an AABB trigger.
  for(const [entry,exit] of [[pair.a,pair.b],[pair.b,pair.a]]){
    const before=dot(px-entry.x,py-entry.y,entry.nx,entry.ny);
    const after=dot(b.x-entry.x,b.y-entry.y,entry.nx,entry.ny);
    if(!(before>0&&after<=0))continue;
    const t=before/(before-after);
    const hx=px+(b.x-px)*t,hy=py+(b.y-py)*t;
    const u=dot(hx-entry.x,hy-entry.y,entry.tx,entry.ty);
    if(Math.abs(u)>entry.span/2-b.r*.65)continue;
    if(dot(b.vx,b.vy,entry.nx,entry.ny)>=0)continue;
    const oldP=potential({m:b.m,y:hy},sim.gravity);
    const tangentSpeed=dot(b.vx,b.vy,entry.tx,entry.ty);
    const normalSpeed=dot(b.vx,b.vy,entry.nx,entry.ny);
    // Proper rotation of velocity: t_in -> -t_out, n_in -> -n_out.
    // This preserves v² and angular chirality. Tangential aperture coordinate reverses.
    const vx=-tangentSpeed*exit.tx-normalSpeed*exit.nx;
    const vy=-tangentSpeed*exit.ty-normalSpeed*exit.ny;
    const remainder=h*(1-t);
    b.x=exit.x-u*exit.tx+exit.nx*(b.r+2)+vx*SCALE*remainder;
    b.y=exit.y-u*exit.ty+exit.ny*(b.r+2)+vy*SCALE*remainder;
    b.vx=vx;b.vy=vy;b.cool=Math.max(.09,3*h);b.transits++;
    const newP=potential({m:b.m,y:b.y-vy*SCALE*remainder},sim.gravity);
    sim.anchorWork+=(oldP-newP); // including aperture offset; supplied by external anchors
    sim.events.push({type:'portal',pair:pair.pair,x:b.x,y:b.y,speed:Math.hypot(vx,vy)});
    return true;
  }
  return false;
}
function isAperture(b,rect,sim){
  for(const p of portalPairs(sim)){
    for(const site of [p.a,p.b]){
      if(site.wall!==rect.id)continue;
      const u=dot(b.x-site.x,b.y-site.y,site.tx,site.ty);
      const d=dot(b.x-site.x,b.y-site.y,site.nx,site.ny);
      if(Math.abs(u)<site.span/2-b.r*.65&&d>=-b.r-7&&d<=b.r+9)return true;
    }
  }
  return false;
}
function resolveWall(b,nx,ny,overlap,restitution,mu){
  if(overlap>0){b.x+=nx*overlap;b.y+=ny*overlap;}
  const vn=dot(b.vx,b.vy,nx,ny);
  if(vn>=0)return 0;
  const jn=-(1+restitution)*vn*b.m;
  b.vx+=jn*nx/b.m;b.vy+=jn*ny/b.m;
  const tx=-ny,ty=nx,r=b.r/SCALE,I=.5*b.m*r*r;
  const slip=dot(b.vx,b.vy,tx,ty)-b.omega*r;
  const jt=Math.max(-mu*jn,Math.min(mu*jn,-slip/(1/b.m+r*r/I)));
  b.vx+=jt*tx/b.m;b.vy+=jt*ty/b.m;
  b.omega-=r*jt/I;
  return Math.abs(vn);
}
function collideRect(b,rect,sim){
  if(isAperture(b,rect,sim))return;
  const qx=Math.max(rect.x,Math.min(rect.x+rect.w,b.x));
  const qy=Math.max(rect.y,Math.min(rect.y+rect.h,b.y));
  let nx=b.x-qx,ny=b.y-qy;
  const d=Math.hypot(nx,ny);
  if(d>=b.r)return;
  let penetration=b.r-d;
  if(d>1e-8){nx/=d;ny/=d;}
  else{
    const distances=[b.x-rect.x,rect.x+rect.w-b.x,b.y-rect.y,rect.y+rect.h-b.y];
    const k=distances.indexOf(Math.min(...distances));
    nx=[-1,1,0,0][k];ny=[0,0,-1,1][k];penetration=b.r+distances[k];
  }
  const impact=resolveWall(b,nx,ny,penetration,sim.restitution,sim.friction);
  if(impact>1.2&&sim.events.length<32)sim.events.push({type:'impact',x:b.x,y:b.y,speed:impact});
}
function collideBalls(a,b,sim){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),rr=a.r+b.r;
  if(d>=rr)return;
  const nx=d>1e-8?dx/d:1,ny=d>1e-8?dy/d:0,inv=1/a.m+1/b.m;
  const penetration=(rr-d)/inv;
  a.x-=nx*penetration/a.m;a.y-=ny*penetration/a.m;
  b.x+=nx*penetration/b.m;b.y+=ny*penetration/b.m;
  const vn=dot(b.vx-a.vx,b.vy-a.vy,nx,ny);
  if(vn>=0)return;
  const j=-(1+sim.restitution)*vn/inv;
  a.vx-=j*nx/a.m;a.vy-=j*ny/a.m;
  b.vx+=j*nx/b.m;b.vy+=j*ny/b.m;
}
export function advance(sim,dt){
  if(!sim.events)sim.events=[];
  const pairs=portalPairs(sim);
  let time=Math.min(.05,Math.max(0,dt));
  while(time>1e-9){
    const vmax=Math.max(1,...sim.balls.map(b=>Math.hypot(b.vx,b.vy)));
    const radius=Math.min(14,...sim.balls.map(b=>b.r));
    const h=Math.min(time,STEP,(radius*.32)/(vmax*SCALE));
    for(const b of sim.balls){
      if(!b.alive)continue;
      b.age+=h;b.cool=Math.max(0,b.cool-h);
      const speed=Math.hypot(b.vx,b.vy);
      const air=(sim.airDrag??.002)*speed;
      b.vx-=b.vx*air*h;
      b.vy+=(sim.gravity-b.vy*air)*h;
      const px=b.x,py=b.y;
      b.x+=b.vx*SCALE*h;b.y+=b.vy*SCALE*h;
      if(!b.cool)for(const p of pairs)if(checkPortal(b,px,py,p,sim,h))break;
      for(const r of sim.walls)collideRect(b,r,sim);
      b.angle+=b.omega*h;
      if(b.x< -60||b.x>W+60||b.y>H+90||b.y< -140||b.age>45)b.alive=false;
    }
    for(let i=0;i<sim.balls.length;i++)for(let j=i+1;j<sim.balls.length;j++){
      if(sim.balls[i].alive&&sim.balls[j].alive)collideBalls(sim.balls[i],sim.balls[j],sim);
    }
    time-=h;
  }
  sim.balls=sim.balls.filter(b=>b.alive);
  return sim;
}
export function simulate(sim,seconds){for(let t=0;t<seconds-1e-8;t+=STEP)advance(sim,Math.min(STEP,seconds-t));return sim;}
