export const WIDTH = 900;
export const HEIGHT = 540;
export const BALL_RADIUS = 10;
export const WALL = 31;
export const TICK = 1 / 120;
export const MAX_TIME = 13;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TRI = [{x:450,y:30},{x:859,y:498},{x:41,y:498}];

export function validPoint(shape, point, margin = BALL_RADIUS) {
  const { x, y } = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (shape === 'circle') return Math.hypot(x-450,y-270) < 224-margin;
  if (shape === 'stadium') return Math.hypot(x-clamp(x,281,619),y-270) < 220-margin;
  if (shape === 'triangle') return TRI.every((a,i)=>{
    const b=TRI[(i+1)%3], dx=b.x-a.x,dy=b.y-a.y, l=Math.hypot(dx,dy);
    return ((x-a.x)*(-dy)+(y-a.y)*dx)/l >= margin;
  });
  return x >= WALL+margin && x <= WIDTH-WALL-margin && y >= WALL+margin && y <= HEIGHT-WALL-margin;
}

export function constrainPoint(shape, point, margin = BALL_RADIUS) {
  const p={x:clamp(Number(point.x)||450,0,WIDTH),y:clamp(Number(point.y)||270,0,HEIGHT)};
  if (shape === 'rectangle') {p.x=clamp(p.x,WALL+margin,WIDTH-WALL-margin);p.y=clamp(p.y,WALL+margin,HEIGHT-WALL-margin);return p}
  if (shape === 'circle') {
    const dx=p.x-450,dy=p.y-270,d=Math.hypot(dx,dy),r=224-margin;
    if(d>r){p.x=450+dx/d*r;p.y=270+dy/d*r}
    return p;
  }
  if(shape==='stadium'){
    const cx=clamp(p.x,281,619),dx=p.x-cx,dy=p.y-270,d=Math.hypot(dx,dy),r=220-margin;
    if(d>r){p.x=cx+dx/d*r;p.y=270+dy/d*r}
    return p;
  }
  for(let k=0;k<4;k++) for(let i=0;i<3;i++){
    const a=TRI[i],b=TRI[(i+1)%3],ex=b.x-a.x,ey=b.y-a.y,len=Math.hypot(ex,ey),nx=-ey/len,ny=ex/len;
    const dot=(p.x-a.x)*nx+(p.y-a.y)*ny;
    if(dot<margin){p.x+=(margin-dot)*nx;p.y+=(margin-dot)*ny}
  }
  return p;
}

export function shotVelocity(angle, power) {
  const speed=clamp(power,10,100)*8.1;
  return {vx:Math.cos(angle*Math.PI/180)*speed,vy:Math.sin(angle*Math.PI/180)*speed};
}

export function createBall(x,y,vx=0,vy=0) { return {x,y,vx,vy}; }

export function stepBall(ball, world, dt = TICK) {
  const b={...ball}, gravity=clamp(Number(world.gravity)||0,-900,900),
    restitution=clamp(Number(world.restitution) || 0.98,0.45,1),
    friction=clamp(Number(world.friction)||0,0,4),radius=BALL_RADIUS;
  b.vy+=gravity*dt;
  const drag=Math.exp(-friction*dt);b.vx*=drag;b.vy*=drag;
  b.x+=b.vx*dt;b.y+=b.vy*dt;
  let bounces=0,impact=0;
  function bounce(nx,ny){
    const into=b.vx*nx+b.vy*ny;
    if(into < -0.0001){
      impact=Math.max(impact,-into);
      b.vx-=(1+restitution)*into*nx;b.vy-=(1+restitution)*into*ny;
      bounces++;
    }
  }
  const shape=world.shape||'rectangle';
  if(shape==='rectangle'){
    const left=WALL+radius,right=WIDTH-WALL-radius,top=WALL+radius,bottom=HEIGHT-WALL-radius;
    if(b.x<left){b.x=left;bounce(1,0)}
    if(b.x>right){b.x=right;bounce(-1,0)}
    if(b.y<top){b.y=top;bounce(0,1)}
    if(b.y>bottom){b.y=bottom;bounce(0,-1)}
  }else if(shape==='circle'||shape==='stadium'){
    const cx=shape==='circle'?450:clamp(b.x,281,619),cy=270,
      dx=b.x-cx,dy=b.y-cy,d=Math.hypot(dx,dy),limit=(shape==='circle'?224:220)-radius;
    if(d>limit){
      const nx=-(dx/(d||1)),ny=-(dy/(d||1));
      b.x=cx-nx*limit;b.y=cy-ny*limit;bounce(nx,ny);
    }
  }else if(shape==='triangle'){
    for(let k=0;k<2;k++)for(let i=0;i<3;i++){
      const a=TRI[i],end=TRI[(i+1)%3],ex=end.x-a.x,ey=end.y-a.y,l=Math.hypot(ex,ey),nx=-ey/l,ny=ex/l;
      const signed=(b.x-a.x)*nx+(b.y-a.y)*ny;
      if(signed<radius){b.x+=(radius-signed)*nx;b.y+=(radius-signed)*ny;bounce(nx,ny)}
    }
  }
  for(const mirror of world.segments||[]){
    const ex=mirror.x2-mirror.x1,ey=mirror.y2-mirror.y1,l2=ex*ex+ey*ey;
    if(l2<1)continue;
    const t=clamp(((b.x-mirror.x1)*ex+(b.y-mirror.y1)*ey)/l2,0,1);
    const qx=mirror.x1+t*ex,qy=mirror.y1+t*ey,dx=b.x-qx,dy=b.y-qy,d=Math.hypot(dx,dy);
    const needed=radius+5;
    if(d<needed){
      const nx=d>0.0001?dx/d:-ey/Math.sqrt(l2),ny=d>0.0001?dy/d:ex/Math.sqrt(l2);
      b.x+=nx*(needed-d);b.y+=ny*(needed-d);bounce(nx,ny);
    }
  }
  for(const bumper of world.bumpers||[]){
    const dx=b.x-bumper.x,dy=b.y-bumper.y,d=Math.hypot(dx,dy),needed=radius+22;
    if(d<needed){
      const nx=d>0.0001?dx/d:1,ny=d>0.0001?dy/d:0;
      b.x+=nx*(needed-d);b.y+=ny*(needed-d);bounce(nx,ny);
    }
  }
  if(!Number.isFinite(b.x+b.y+b.vx+b.vy)){b.x=450;b.y=270;b.vx=0;b.vy=0}
  const target=world.target;
  const sensor=Boolean(target && dist(b,target)<=BALL_RADIUS+18);
  return {ball:b,bounces,impact,sensor};
}

export function traceShot(world, angle, power, options={}) {
  const start=constrainPoint(world.shape||'rectangle',world.origin||{x:160,y:270});
  const velocity=shotVelocity(angle,power);let ball=createBall(start.x,start.y,velocity.vx,velocity.vy);
  const path=[{x:ball.x,y:ball.y,collision:false}],hits=[],maxTime=options.maxTime||MAX_TIME;
  let bounces=0,length=0,time=0,hit=false;
  const steps=Math.ceil(maxTime/TICK);
  for(let i=0;i<steps;i++){
    const prev=ball,step=stepBall(ball,world,TICK);ball=step.ball;time=(i+1)*TICK;
    length+=dist(prev,ball);bounces+=step.bounces;
    if(step.bounces) hits.push({x:ball.x,y:ball.y,n:step.bounces});
    if(i%7===0||step.bounces) path.push({x:ball.x,y:ball.y,collision:step.bounces>0});
    if(step.sensor && bounces>=(world.requiredBounces||0)){hit=true;path.push({x:ball.x,y:ball.y,collision:false});break}
    if(time>0.45&&Math.hypot(ball.vx,ball.vy)<7)break;
  }
  if(!hit)path.push({x:ball.x,y:ball.y,collision:false});
  return {path,hits,bounces,time,length,hit,end:ball};
}

export const ARENAS=['rectangle','circle','stadium','triangle'];
export function safeWorld(data) {
  const shape=ARENAS.includes(data?.shape)?data.shape:'rectangle';
  const coords=obj=>obj&&Number.isFinite(obj.x)&&Number.isFinite(obj.y)&&obj.x>=0&&obj.x<=WIDTH&&obj.y>=0&&obj.y<=HEIGHT;
  const origin=constrainPoint(shape,coords(data?.origin)?data.origin:{x:175,y:270});
  const target=constrainPoint(shape,coords(data?.target)?data.target:{x:725,y:270},28);
  const bumpers=(Array.isArray(data?.bumpers)?data.bumpers:[]).filter(coords).slice(0,25).map(({x,y})=>({x,y}));
  const segments=(Array.isArray(data?.segments)?data.segments:[]).filter(s=>s&&Number.isFinite(s.x1)&&Number.isFinite(s.y1)&&Number.isFinite(s.x2)&&Number.isFinite(s.y2)&&Math.hypot(s.x1-s.x2,s.y1-s.y2)>10&&[s.x1,s.y1,s.x2,s.y2].every(n=>n>=0&&n<=900)).slice(0,25).map(({x1,y1,x2,y2})=>({x1,y1,x2,y2}));
  return {shape,origin,target,bumpers,segments,gravity:clamp(Number(data?.gravity)||0,0,500),friction:clamp(Number(data?.friction)||0.01,0,1),restitution:clamp(Number(data?.restitution)||0.98,0.55,1),requiredBounces:0};
}
