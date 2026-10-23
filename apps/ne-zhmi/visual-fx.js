// NE ZHMI! — visual-only, bounded effects. No randomness in the physics state.
// Spawn is event-driven; particles live in world coordinates and never travel
// through PocketNet. This deliberately keeps clients authoritative-data-only.
export const EFFECT_PRESETS=Object.freeze({
 jump:{color:'#f1c47b',count:11,speed:2.7,life:.43,radius:.27},
 reverse:{color:'#97ced0',count:10,speed:2,life:.4,radius:.3},
 push:{color:'#d1e5a0',count:17,speed:4.3,life:.49,radius:.4},
 spring:{color:'#f1bd73',count:16,speed:3.7,life:.55,radius:.34},
 land:{color:'#e6dcbb',count:13,speed:2.2,life:.45,radius:.2},
 wall:{color:'#ffc18a',count:12,speed:2.4,life:.46,radius:.23},
 gate:{color:'#f0b979',count:9,speed:1.8,life:.39,radius:.18},
 cargo:{color:'#bee3a3',count:21,speed:3.1,life:.7,radius:.38},
 checkpoint:{color:'#f5d692',count:20,speed:2.4,life:.7,radius:.45},
 hazard:{color:'#eaa68e',count:23,speed:4.1,life:.65,radius:.5},
 respawn:{color:'#aacfc7',count:17,speed:2.7,life:.6,radius:.5},
 finish:{color:'#f7d89b',count:38,speed:4.9,life:1.15,radius:.6},
 magnet:{color:'#bea8d6',count:14,speed:1.8,life:.55,radius:.32},
 brake:{color:'#d7a48d',count:9,speed:1.5,life:.42,radius:.16},
 float:{color:'#ead18c',count:13,speed:1.6,life:.65,radius:.3}
});
const hash=(seed)=>{let h=(seed>>>0);h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return ((h^(h>>>16))>>>0)/4294967296;};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createVisualEffects({reducedMotion=false,limit=150}={}){
 const particles=[],rings=[];let serial=0;
 function clear(){particles.length=0;rings.length=0;}
 function emit(type,x,y,dir=1){
   const p=EFFECT_PRESETS[type];
   if(!p||!Number.isFinite(x)||!Number.isFinite(y))return false;
   const count=reducedMotion?Math.min(3,p.count):p.count;
   const burst=serial++;
   for(let i=0;i<count;i++){
     const theta=hash((burst+1)*1597+i*1013)*Math.PI*2;
     const speed=p.speed*(.35+.65*hash(burst*2003+i*733+5));
     const rx=(hash(i*377+burst*29)-.5)*p.radius*2;
     const ry=(hash(i*583+burst*73)-.5)*p.radius*2;
     particles.push({x:x+rx,y:y+ry,vx:Math.cos(theta)*speed*dir,vy:Math.sin(theta)*speed-1.3,
       max:p.life,life:p.life,size:.035+hash(i*419+burst*31)*.045,color:p.color});
   }
   while(particles.length>limit)particles.shift();
   if(!reducedMotion&&rings.length<15)rings.push({x,y,color:p.color,r:p.radius*.8,life:.44,max:.44});
   return true;
 }
 function advance(dt){
   const delta=clamp(Number.isFinite(dt)?dt:0,0,.08);
   for(let i=particles.length-1;i>=0;i--){
     const p=particles[i];p.life-=delta;if(p.life<=0){particles.splice(i,1);continue;}
     p.x+=p.vx*delta;p.y+=p.vy*delta;p.vy+=8*delta;p.vx*=Math.max(0,1-1.1*delta);
   }
   for(let i=rings.length-1;i>=0;i--){const p=rings[i];p.life-=delta;if(p.life<=0)rings.splice(i,1);else p.r+=3.5*delta;}
 }
 function draw(ctx,sx,sy,scale,viewportWidth){
   ctx.save();
   for(const r of rings){
     const x=sx(r.x),y=sy(r.y),size=r.r*scale;
     if(x+size<0||x-size>viewportWidth)continue;
     ctx.globalAlpha=Math.pow(r.life/r.max,2)*.68;
     ctx.strokeStyle=r.color;ctx.lineWidth=Math.max(1.5,scale*.035);
     ctx.beginPath();ctx.ellipse(x,y,size,size*.72,0,0,Math.PI*2);ctx.stroke();
   }
   for(const p of particles){
     const x=sx(p.x),y=sy(p.y),sz=Math.max(1.5,p.size*scale);
     if(x+sz<0||x-sz>viewportWidth)continue;
     ctx.globalAlpha=clamp(p.life/p.max,0,1)*.95;
     ctx.fillStyle=p.color;
     ctx.save();ctx.translate(x,y);ctx.rotate(p.vx*.07);ctx.fillRect(-sz/2,-sz/2,sz,sz*.75);ctx.restore();
   }
   ctx.restore();
 }
 return {emit,clear,advance,draw,stats:()=>({particles:particles.length,rings:rings.length,serial})};
}
