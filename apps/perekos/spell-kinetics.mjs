// PEREKOS / Tangible spell silhouettes, v0.12
// A single renderer replaces the three overlaid legacy projectile renderers.
// Every projectile comes from state.shots. Every impact is a confirmed FX id.
// Never alter simulation, collision radius, damage or packet data.
const PI=Math.PI,TAU=2*PI;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const palette={
 fire:['#fff0bc','#eb9d65','#954c38','#4f322d'],
 storm:['#efffe3','#a4ded6','#5c9693','#31545c'],
 stone:['#e9e4bf','#acbc9c','#6d826f','#344b41']
};
export const MAX_KINETIC_SHOTS=24;
export const MAX_CONTACTS=18;
export const SHAPE_FAMILIES=Object.freeze({
 orb:Object.freeze({name:'furnace',weight:.95,tail:20,scale:1}),
 flame:Object.freeze({name:'comet',weight:.8,tail:28,scale:.95}),
 bolt:Object.freeze({name:'needle',weight:.4,tail:29,scale:.65}),
 arc:Object.freeze({name:'fork',weight:.56,tail:35,scale:.8}),
 rock:Object.freeze({name:'boulder',weight:1.8,tail:12,scale:1.45}),
 wave:Object.freeze({name:'crescent',weight:1.55,tail:15,scale:1.4}),
 echo:Object.freeze({name:'ghost',weight:.55,tail:16,scale:.68})
});
const styleFor=q=>q?.style==='echo'||q?.clone?'echo':SHAPE_FAMILIES[q?.style]?q.style:'orb';
export function spellSilhouette(q){
 const id=styleFor(q),family=SHAPE_FAMILIES[id],element=palette[q?.element]?q.element:'fire';
 return {style:id,element,mass:family.weight,trail:family.tail,scale:family.scale,form:family.name};
}
function fill(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.ceil(w)),Math.max(1,Math.ceil(h)))}
function drawPath(c,p,co,width=2,close=false){
 c.strokeStyle=co;c.lineWidth=width;c.lineJoin='bevel';c.beginPath();
 c.moveTo(p[0][0],p[0][1]);
 for(let i=1;i<p.length;i++)c.lineTo(p[i][0],p[i][1]);
 if(close)c.closePath();c.stroke();
}
function polygon(c,points,col){
 c.fillStyle=col;c.beginPath();c.moveTo(points[0][0],points[0][1]);
 for(let i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);
 c.closePath();c.fill();
}
function arc(c,x,y,r,col,width=2,start=0,end=TAU){
 c.strokeStyle=col;c.lineWidth=width;c.beginPath();c.arc(x,y,r,start,end);c.stroke();
}
function seeded(a,b){let h=Math.imul((a|0)+0x45d9f3b,b+1);h^=h>>>16;h=Math.imul(h,0x27d4eb2d);return(h>>>0)/4294967296}
function rectifiable(q){
 return finite(q?.x)&&finite(q?.y)&&finite(q?.vx)&&finite(q?.vy)
  &&Math.hypot(q.vx,q.vy)>1&&Math.abs(q.x)<1200&&Math.abs(q.y)<1400;
}
export function drawKineticProjectiles(ctx,state,time=0,{reduced=false}={}){
 if(!ctx||state?.phase!=='fight'||!Array.isArray(state.shots))return 0;
 let painted=0;
 // Prefer recent list ordering exactly as submitted by the simulation;
 // don't sort or mutate it, even in dense rune builds.
 for(const q of state.shots){
  if(painted>=MAX_KINETIC_SHOTS)break;
  if(!rectifiable(q))continue;
  painted++;
  const id=styleFor(q),part=SHAPE_FAMILIES[id],tones=palette[q.element]||palette.fire;
  const speed=Math.hypot(q.vx,q.vy),angle=Math.atan2(q.vy,q.vx);
  const r=clamp(finite(q.r)?q.r:5,2,16),s=part.scale*clamp(r/5,.65,1.75);
  const tick=reduced?0:time,phase=tick*(id==='bolt'||id==='arc'?32:9)+(q.owner||0)*1.7;
  ctx.save();ctx.translate(Math.round(q.x),Math.round(q.y));ctx.rotate(angle);
  // Shadow at a fixed floor-light offset, not a second glowing projectile.
  ctx.globalAlpha=.28;
  if(id==='rock'||id==='wave'){
   polygon(ctx,[[-8,7],[2,10],[12,6],[2,3]],'#0a1d1b');
  }
  ctx.globalAlpha=1;
  ctx.scale(s,s);
  // The projectile is directional; the line behind never extends forward
  // of its actual position. It cannot be confused with a danger telegraph.
  const tail=part.tail*clamp(speed/260,.78,1.4);
  ctx.globalAlpha=reduced?.56:.74;
  if(id==='rock'){
   for(let j=0;j<3;j++)fill(ctx,-tail*(.3+j*.24),-3+(j%2)*5,5-j,3,tones[j%3]);
  }else if(id==='wave'){
   drawPath(ctx,[[-tail,7],[-tail*.7,4],[-tail*.4,1]],tones[2],3);
   drawPath(ctx,[[-tail,-7],[-tail*.7,-4],[-tail*.4,-1]],tones[1],2);
  }else if(id==='arc'){
   for(const sign of [-1,1]){
    drawPath(ctx,[[-tail,sign*5],[-tail*.68,sign*8],[-tail*.41,sign*3],[-7,sign*6]],tones[1],2);
   }
  }else if(id==='bolt'){
   drawPath(ctx,[[-tail,0],[-tail*.65,-4],[-tail*.45,2],[-7,0]],tones[0],2);
   drawPath(ctx,[[-tail*.75,3],[-tail*.42,6],[-11,2]],tones[2],1.5);
  }else if(id==='flame'){
   polygon(ctx,[[-tail,-4],[-tail*.65,-7],[-tail*.36,-3],[-9,-5],[-7,6],[-tail*.65,5]],tones[2]);
   fill(ctx,-tail*.45+Math.sin(phase)*2,-2,8,4,tones[1]);
  }else if(id==='echo'){
   drawPath(ctx,[[-tail,-5],[-tail*.45,0],[-tail,5]],tones[1],1.5);
  }else{
   polygon(ctx,[[-tail,-3],[-tail*.65,-4],[-tail*.3,-2],[-6,-4],[-6,5],[-tail*.4,2]],tones[2]);
  }
  ctx.globalAlpha=1;
  switch(id){
   case 'orb':
    polygon(ctx,[[-6,-5],[3,-8],[9,-3],[10,4],[2,8],[-7,4]],tones[2]);
    polygon(ctx,[[-3,-5],[4,-5],[7,-1],[6,4],[0,5],[-4,2]],tones[1]);
    polygon(ctx,[[0,-4],[5,-2],[6,2],[0,4],[-2,0]],tones[0]);
    break;
   case 'flame':
    polygon(ctx,[[-9,0],[-3,-7],[2,-9],[5,-4],[9,-2],[11,3],[4,9],[-3,6]],tones[1]);
    polygon(ctx,[[-4,0],[0,-5],[6,-3],[9,2],[1,6]],tones[0]);
    if(!reduced)fill(ctx,-5+Math.sin(phase)*2,-10,3,3,tones[0]);
    break;
   case 'bolt':
    polygon(ctx,[[12,0],[0,-3],[-7,-2],[-7,2],[0,3]],tones[1]);
    fill(ctx,-3,-1,14,3,tones[0]);
    break;
   case 'arc':{
    polygon(ctx,[[12,0],[3,-5],[-5,-3],[-5,3],[3,5]],tones[2]);
    drawPath(ctx,[[-7,-3],[0,-7],[9,-4],[14,0],[8,3],[-1,6],[-7,3]],tones[0],2);
    if(!reduced){const wob=Math.sin(phase)*2;
     drawPath(ctx,[[0,-5],[2+wob,-11],[8,-10]],tones[1],1.5)}
    break;
   }
   case 'rock':
    polygon(ctx,[[-11,-5],[-6,-10],[5,-9],[11,-2],[7,7],[-5,9],[-12,4]],tones[3]);
    polygon(ctx,[[-10,-7],[-4,-12],[5,-8],[8,-3],[3,4],[-7,5]],tones[2]);
    polygon(ctx,[[-7,-8],[-1,-10],[5,-6],[1,-2],[-6,0]],tones[1]);
    drawPath(ctx,[[-3,-2],[1,2],[-2,7]],tones[3],1.8);
    break;
   case 'wave':
    drawPath(ctx,[[-6,-11],[2,-10],[10,-6],[13,0],[10,6],[2,10],[-6,11]],tones[3],6);
    drawPath(ctx,[[-8,-12],[4,-11],[12,-5],[15,0],[12,5],[4,11],[-8,12]],tones[1],4);
    drawPath(ctx,[[-8,-12],[4,-11],[12,-5]],tones[0],2);
    break;
   case 'echo':
    arc(ctx,0,0,6,tones[1],2,-PI*.8,PI*.75);
    polygon(ctx,[[-3,-3],[4,-3],[7,0],[3,4],[-4,3]],tones[0]);
    break;
  }
  // Fine core without a giant halo preserves true collision geometry.
  if(id==='orb'||id==='flame')fill(ctx,2,-1,3,3,tones[0]);
  ctx.restore();
 }
 return painted;
}
function impactStyle(k){
 const id=k.startsWith('impact_')?k.slice(7):'';
 return id==='orb'||id==='flame'||id==='bolt'||id==='arc'||id==='rock'||id==='wave'||id==='echo'?id:null;
}
export class ContactTheater{
 constructor(){this.round=-1;this.serial=0;this.ticks=-1;this.contacts=[]}
 reset(){this.round=-1;this.serial=0;this.ticks=-1;this.contacts=[]}
 ingest(state,reduced=false){
  if(!state||!Array.isArray(state.fx))return;
  if(state.round!==this.round||finite(state.serial)&&state.serial<this.serial||
     finite(state.ticks)&&state.ticks<this.ticks-3){
   this.reset();this.round=state.round;
  }
  if(finite(state.ticks))this.ticks=state.ticks;
  for(const e of state.fx){
   if(!finite(e.id)||e.id<=this.serial||!finite(e.x)||!finite(e.y))continue;
   const style=impactStyle(e.k||'');
   if(!style)continue; // no invented contact from moving shots or hidden actions
   this.contacts.push({id:e.id,x:e.x,y:e.y,style,age:0,
    life:reduced?.19:style==='rock'||style==='wave'?.52:.31});
  }
  this.serial=Math.max(this.serial,finite(state.serial)?state.serial:0);
  if(this.contacts.length>MAX_CONTACTS)this.contacts.splice(0,this.contacts.length-MAX_CONTACTS);
 }
 advance(dt){
  const d=clamp(finite(dt)?dt:0,0,.05);
  for(const c of this.contacts)c.age+=d;
  this.contacts=this.contacts.filter(x=>x.age<x.life);
 }
 draw(ctx,reduced=false){
  if(!ctx)return;
  for(const c of this.contacts){
   const t=clamp(c.age/c.life,0,1),fade=1-t,reach=8+27*(1-(1-t)**2),heavy=c.style==='rock'||c.style==='wave';
   ctx.save();ctx.translate(c.x,c.y);ctx.globalAlpha=.72*fade;
   const tint=heavy?palette.stone:c.style==='bolt'||c.style==='arc'?palette.storm:palette.fire;
   if(c.style==='wave'){
    for(const sign of [-1,1])
     drawPath(ctx,[[-reach*.65,sign*reach*.65],[0,sign*reach*.37],
      [reach*.8,sign*reach*.55]],tint[1],3);
    drawPath(ctx,[[-reach,0],[0,-reach*.1],[reach,0]],tint[2],2);
   }else if(c.style==='rock'){
    for(let i=0;i<(reduced?3:6);i++){
     const a=TAU*i/6+seeded(c.id,i)*.3,d=reach*(.65+seeded(c.id+9,i)*.35);
     polygon(ctx,[[Math.cos(a)*d,Math.sin(a)*d*.8],
      [Math.cos(a)*d+5+i%2,Math.sin(a)*d*.8-3],
      [Math.cos(a)*d-3,Math.sin(a)*d*.8-6]],tint[(i+1)%3]);
    }
    drawPath(ctx,[[-reach*.8,4],[-4,0],[5,8],[reach*.65,3]],tint[3],3);
   }else if(c.style==='arc'||c.style==='bolt'){
    for(let i=0;i<(reduced?2:4);i++){
     const a=i*TAU/4+c.id*.16,dx=Math.cos(a)*reach,dy=Math.sin(a)*reach;
     drawPath(ctx,[[0,0],[dx*.55+dy*.19,dy*.55-dx*.19],[dx,dy]],tint[i%2],2);
    }
   }else if(c.style==='flame'){
    for(let i=0;i<(reduced?3:5);i++){
     const a=(i+.25)*TAU/5,dx=Math.cos(a)*reach*.77,dy=Math.sin(a)*reach*.6;
     polygon(ctx,[[dx,dy],[dx+3,dy-8],[dx+8,dy-3]],tint[i%3]);
    }
   }else if(c.style==='echo'){
    arc(ctx,0,0,reach*.65,tint[1],1.6,-PI*.8,PI*.65);
   }else{
    arc(ctx,0,0,reach*.68,tint[1],2,-PI*.65,PI*.75);
    arc(ctx,0,0,reach*.43,tint[0],1.7,PI*.2,PI*1.3);
   }
   ctx.restore();
  }
 }
}
