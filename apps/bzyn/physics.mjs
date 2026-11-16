// Deterministic 120 Hz physics and layout. No DOM or browser dependencies.
export const WORLD={width:360,height:580,radius:14,dockX:180,dockY:509};
export const FIXED_STEP=1/120;
export const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export const magnitude=(x,y)=>Math.hypot(x,y);

const formations=[
  [[86,113],[178,157],[273,119],[166,282]],
  [[61,102],[144,118],[236,100],[303,151],[105,249],[238,284]],
  [[79,107],[178,89],[281,118],[131,206],[262,218],[84,316],[207,321]],
  [[94,102],[189,125],[273,107],[75,230],[183,254],[277,269],[148,355],[280,356]],
  [[72,92],[152,112],[247,111],[288,185],[103,224],[225,244],[67,332],[168,344]]
];
export function buildWave(index){
  const n=Math.max(1,Math.floor(index));
  const formation=formations[(n-1)%formations.length];
  const phase=Math.floor((n-1)/formations.length);
  const targets=formation.map(([x,y],i)=>({
    id:i,x:clamp(x+Math.sin((phase+1)*2.43+i*.67)*Math.min(phase*7,14),44,315),
    y:clamp(y+Math.cos(phase*1.61+i*.5)*Math.min(phase*5,10),72,382),
    r:16,hit:false,gold:(i+n)%4===0
  }));
  const bumpers=[{x:77,y:374,r:23},{x:288,y:372,r:23},{x:267,y:291,r:18}];
  if(n>=3)bumpers.push({x:54,y:282,r:16});
  return {targets,bumpers,spinner:n>=2?{x:185,y:422,r:19,range:61,speed:1.2+n*.08}:null};
}

export function rubber(distance,limit=115,elastic=.2){
  if(distance<=limit)return distance;
  return limit+(distance-limit)*elastic;
}

export function launchVector(dx,dy,releaseX=0,releaseY=0){
  const length=magnitude(dx,dy);
  if(length<18&&magnitude(releaseX,releaseY)<200)return null;
  // Displacement supplies the launch power; the last finger movement adds a modest fling.
  const factor=7.5;
  const vx=-dx*factor-releaseX*.09;
  const vy=-dy*factor-releaseY*.09;
  const speed=magnitude(vx,vy);
  if(speed<1)return null;
  const capped=clamp(speed,240,900);
  return {vx:vx/speed*capped,vy:vy/speed*capped};
}

export function capVelocity(vx,vy,max=980){
  const speed=magnitude(vx,vy);
  if(speed<=max)return {vx,vy};
  return {vx:vx/speed*max,vy:vy/speed*max};
}

export function collideDisk(ball,x,y,r,restitution=.92){
  let dx=ball.x-x,dy=ball.y-y;
  let d=magnitude(dx,dy);
  const min=ball.r+r;
  if(d>=min)return null;
  if(d<.0001){dx=0;dy=-1;d=1;}
  const nx=dx/d,ny=dy/d;
  ball.x=x+nx*min;
  ball.y=y+ny*min;
  const approach=ball.vx*nx+ball.vy*ny;
  if(approach<0){
    ball.vx-=(1+restitution)*approach*nx;
    ball.vy-=(1+restitution)*approach*ny;
  }
  return {impact:Math.max(0,-approach),nx,ny};
}

export function advanceBall(ball,dt,wave,simTime=0){
  const events=[];
  ball.vy+=68*dt;
  const drag=Math.exp(-.15*dt);
  ball.vx*=drag;ball.vy*=drag;
  ball.x+=ball.vx*dt;
  ball.y+=ball.vy*dt;
  const r=ball.r;
  if(ball.x<24+r){ball.x=24+r;ball.vx=Math.abs(ball.vx)*.89;events.push({type:'wall',x:ball.x,y:ball.y});}
  else if(ball.x>336-r){ball.x=336-r;ball.vx=-Math.abs(ball.vx)*.89;events.push({type:'wall',x:ball.x,y:ball.y});}
  if(ball.y<25+r){ball.y=25+r;ball.vy=Math.abs(ball.vy)*.87;events.push({type:'wall',x:ball.x,y:ball.y});}
  else if(ball.y>550-r){ball.y=550-r;ball.vy=-Math.abs(ball.vy)*.79;ball.vx*=.95;events.push({type:'wall',x:ball.x,y:ball.y});}
  for(const bumper of wave.bumpers){
    const hit=collideDisk(ball,bumper.x,bumper.y,bumper.r,.97);
    if(hit&&hit.impact>18){
      ball.vx+=hit.nx*29;ball.vy+=hit.ny*29;
      events.push({type:'bumper',x:bumper.x,y:bumper.y,impact:hit.impact});
    }
  }
  if(wave.spinner){
    const spinner=wave.spinner;
    spinner.x=180+Math.sin(simTime*spinner.speed)*spinner.range;
    const hit=collideDisk(ball,spinner.x,spinner.y,spinner.r,1.02);
    if(hit&&hit.impact>18){
      ball.vx+=hit.nx*70;ball.vy+=hit.ny*70;
      events.push({type:'bumper',x:spinner.x,y:spinner.y,impact:hit.impact});
    }
  }
  for(const target of wave.targets){
    if(target.hit)continue;
    const hit=collideDisk(ball,target.x,target.y,target.r,.68);
    if(hit){
      target.hit=true;
      ball.vx+=hit.nx*25;ball.vy+=hit.ny*25;
      events.push({type:'target',target,impact:hit.impact,x:target.x,y:target.y});
    }
  }
  const v=capVelocity(ball.vx,ball.vy);
  ball.vx=v.vx;ball.vy=v.vy;
  return events;
}
