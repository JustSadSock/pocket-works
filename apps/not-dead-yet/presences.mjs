// NOT DEAD YET: acoustic perception and light-driven false presences.
// No violence reward loop, no NPC health. The player can make any figure disappear
// by keeping the flashlight on it; shooting is loud and draws attention instead.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const NOISE={
 step:{range:4.6,ttl:1.4},sprint:{range:8.8,ttl:2.7},
 shot:{range:24,ttl:7.2},door:{range:7.0,ttl:3.0},
 radio:{range:11.0,ttl:5.0},breaker:{range:8,ttl:3.5}
};
export function acousticEvent(x,z,time,type='step'){
 const n=NOISE[type]||NOISE.step;
 return {x,z,at:time,until:time+n.ttl,range:n.range,type}
}
export function audible(event,listener,time,visible=()=>true){
 if(!event||time>event.until||!Number.isFinite(listener.x)||!Number.isFinite(listener.z))return false;
 const dist=Math.hypot(event.x-listener.x,event.z-listener.z);
 // An unseen wall or closed door muffles rather than completely erases gunshots.
 const effective=visible(listener.x,listener.z,event.x,event.z)?event.range:event.range*.55;
 return dist<=effective
}
export function insideTorch(player,presence,world,range=12){
 const dx=presence.x-player.x,dz=presence.z-player.z,d=Math.hypot(dx,dz);
 if(d>range||d<.01||!world.visible(player.x,player.z,presence.x,presence.z))return false;
 const facing=Math.atan2(dx,-dz)-player.yaw;
 return Math.abs(Math.atan2(Math.sin(facing),Math.cos(facing)))<.36
}
export function updatePresence(e,ctx){
 const {world,player,noise,torch,time,dt}=ctx;
 e.age=(e.age||0)+dt;
 e.hit=Math.max(0,e.hit||0);
 const dist=Math.hypot(e.x-player.x,e.z-player.z);
 const illuminated=Boolean(torch&&insideTorch(player,e,world));
 e.hit=illuminated?e.hit+dt:Math.max(0,e.hit-dt*.75);
 const recognition=e.kind==='coat'?.85:1.45;
 if(e.hit>=recognition)return{resolved:true,illuminated,stressDelta:-5,near:dist<1.35};
 const heard=audible(noise,e,time,world.visible.bind(world));
 const target=heard?noise:(dist<10&&world.visible(e.x,e.z,player.x,player.z)?player:null);
 e.attention=heard?'sound':target?'sight':'none';
 if(e.kind==='figure'&&target&&!illuminated){
  e.pathTime=(e.pathTime??0)-dt;
  if(e.pathTime<=0||!e.path){e.pathTime=.50;e.path=world.findStep(e.x,e.z,target.x,target.z)}
  if(e.path){
   const dx=e.path.x-e.x,dz=e.path.z-e.z,len=Math.hypot(dx,dz);
   if(len>.08){
    const step=Math.min(len,(e.speed||.48)*dt*(heard?1.27:1));
    const nx=e.x+dx/len*step,nz=e.z+dz/len*step;
    if(world.canStand(nx,nz,.09)){e.x=nx;e.z=nz}
    else e.pathTime=0;
   }
  }
 }else if(illuminated)e.pathTime=0;
 const near=Math.hypot(e.x-player.x,e.z-player.z)<1.35;
 return{resolved:false,illuminated,near,stressDelta:near?(e.kind==='coat'?6:13)*dt:0,heard};
}
export function shouldDespawn(e,world){return e.age>=31||!world.canStand(e.x,e.z,.07)}
export function presenceCue(e,player){
 const dx=e.x-player.x,dz=e.z-player.z;
 return {pan:clamp(Math.sin(Math.atan2(dx,-dz)-player.yaw),-.8,.8),distance:Math.hypot(dx,dz)}
}
