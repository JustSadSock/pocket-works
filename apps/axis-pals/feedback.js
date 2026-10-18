// ОСИ v1.3 / motion-linked FX. Never touches game state or network messages.
// At most two translucent axis impulses and two contact effects are visible at once.
export const FX_DURATION=390;
export const FX_BUDGET=Object.freeze({axisImpulses:2,contactBursts:2,marksPerBurst:3});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const axisOf=m=>m?.dx?'x':m?.dy?'y':null;
export function effectPhase(m,now,reduced=false){
 if(!m||reduced||!Number.isFinite(now))return null;
 const elapsed=Math.max(0,now-m.at);
 if(!Number.isFinite(m.at)||elapsed>=FX_DURATION)return null;
 const t=elapsed/FX_DURATION;
 return {t,axis:axisOf(m),energy:(1-t)*(1-t),contact:clamp((elapsed-55)/195),elapsed};
}
export function contactDescriptor(m,index){
 if(!m||!m.from?.[index]||!m.to?.[index]||index<0||index>1)return null;
 const from=m.from[index],to=m.to[index];
 const moved=from.x!==to.x||from.y!==to.y;
 const blocked=Boolean(m.blocked?.[index]);
 return {x:to.x+.5,y:to.y+.5,blocked,moved,dx:m.dx||0,dy:m.dy||0,index};
}
export function getFxPlan(m,now,reduced=false){
 const phase=effectPhase(m,now,reduced);
 if(!phase||!phase.axis)return {phase:null,impulses:[],contacts:[]};
 const items=[0,1].map(i=>contactDescriptor(m,i)).filter(Boolean);
 return {
  phase,
  impulses:items.slice(0,FX_BUDGET.axisImpulses),
  contacts:items.filter(x=>x.moved||x.blocked).slice(0,FX_BUDGET.contactBursts)
 };
}
function segment(ctx,x1,y1,x2,y2,color,width){
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function circle(ctx,x,y,r,color){
 ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
 ctx.fillStyle=color;ctx.fill();
}
const hues=['#4fb5a2','#eb8664'];
export function drawAxisImpulse(ctx,motion,size,now,reduced=false){
 const {phase,impulses}=getFxPlan(motion,now,reduced);
 if(!phase)return;
 ctx.save();ctx.lineCap='round';
 for(const p of impulses){
  const a=motion.from[p.index],b=motion.to[p.index];
  const cx=(a.x+.5)*size,cy=(a.y+.5)*size;
  const dx=motion.dx||0,dy=motion.dy||0;
  const length=p.blocked?.42:.9;
  const start=phase.t*.14,run=length*phase.t;
  const x1=cx+dx*(start-.14)*size,y1=cy+dy*(start-.14)*size;
  const x2=cx+dx*run*size,y2=cy+dy*run*size;
  // A single satin-colored impulse moves along the issuing axis, not a persistent laser.
  ctx.globalAlpha=.24*phase.energy;
  segment(ctx,x1,y1,x2,y2,hues[p.index],size*.17);
  ctx.globalAlpha=.66*phase.energy;
  segment(ctx,x1,y1,x2,y2,'#f8f5dd',size*.037);
  if(!p.blocked){
   const tipX=(b.x+.5)*size,tipY=(b.y+.5)*size;
   ctx.globalAlpha=.45*phase.energy;
   circle(ctx,tipX,tipY,size*.075,hues[p.index]);
  }
 }
 ctx.restore();
}
export function drawContactEffects(ctx,motion,size,now,reduced=false){
 const {phase,contacts}=getFxPlan(motion,now,reduced);
 if(!phase||phase.elapsed<60)return;
 ctx.save();ctx.lineCap='round';
 for(const p of contacts){
  const dx=p.dx,dy=p.dy,fade=clamp((phase.elapsed-60)/255);
  const alpha=(1-fade)*(1-fade);
  if(alpha<=0)continue;
  const cx=p.x*size,cy=p.y*size;
  // Short cream-colored dust scuffs behind the moving wheels.
  if(p.moved){
   ctx.globalAlpha=.48*alpha;
   for(let k=0;k<FX_BUDGET.marksPerBurst;k++){
    const spread=(k-1)*size*.12;
    const travel=fade*size*.12;
    const x=cx-dx*size*(.29+travel/size)+dy*spread;
    const y=cy-dy*size*(.29+travel/size)-dx*spread;
    circle(ctx,x,y,size*(.03+fade*.02),'#f5e8c9');
   }
  }
  // A muted amber mechanical clink at the leading wall; never flash the whole board.
  if(p.blocked){
   ctx.globalAlpha=.69*alpha;
   const fx=cx+dx*size*.37,fy=cy+dy*size*.37;
   const vx=dy,vy=-dx;
   for(let k=0;k<FX_BUDGET.marksPerBurst;k++){
    const off=(k-1)*size*.1;
    const px=fx+vx*off,py=fy+vy*off;
    segment(ctx,px,py,px+(dx+vx*(k-1)*.6)*size*.066,
      py+(dy+vy*(k-1)*.6)*size*.066,'#f8d79b',Math.max(1,size*.025));
   }
  }
 }
 ctx.restore();
}
