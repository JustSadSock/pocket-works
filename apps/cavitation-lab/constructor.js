// Editor geometry and safe interaction envelope for the weak-coupling sphere model.
// Positions and radii are expressed in reference-radius units; bubble centers are fixed.
export const MAX_BUBBLES=7;
export const MIN_BUBBLES=1;
export const RADII={min:.35,max:1.3};
export const LIMITS={minX:-15,maxX:0,minY:-6,maxY:6};
export const SPACING_FACTOR=1.22;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const round=v=>Math.round(v*100)/100;

export function layoutTemplate(name='cascade'){
 if(name==='arc')return [
  {x:-.3,y:0,s:.67},{x:-2.48,y:2.4,s:.82},{x:-5.1,y:2.05,s:.58},
  {x:-6.3,y:-.65,s:.73},{x:-4.35,y:-3.12,s:.64}
 ];
 if(name==='stagger')return [
  {x:-.3,y:0,s:.98},{x:-2.75,y:1.05,s:.68},{x:-5.24,y:-.7,s:.84},
  {x:-8.01,y:1.25,s:.55},{x:-10.4,y:-.85,s:.76}
 ];
 return [
  {x:-.3,y:0,s:1},{x:-2.65,y:0,s:.83},{x:-5.1,y:0,s:.69},
  {x:-7.45,y:0,s:.55},{x:-9.7,y:0,s:.43}
 ];
}
export function normalizeBubbles(raw){
 const base=Array.isArray(raw)&&raw.length?raw:layoutTemplate();
 return base.slice(0,MAX_BUBBLES).map((b,i)=>({
  x:round(clamp(Number.isFinite(Number(b.x))?Number(b.x):-i*2.5,LIMITS.minX,LIMITS.maxX)),
  y:round(clamp(Number.isFinite(Number(b.y))?Number(b.y):0,LIMITS.minY,LIMITS.maxY)),
  s:round(clamp(Number.isFinite(Number(b.s))?Number(b.s):.8,RADII.min,RADII.max))
 }));
}
export function layoutIssue(bubbles,standOff=1.65){
 const list=normalizeBubbles(bubbles);
 for(let i=0;i<list.length;i++){
  const b=list[i];
  if(b.x>standOff-b.s*1.12-.12)return 'Пузырёк слишком близко к стенке';
  for(let j=0;j<i;j++){
   const p=list[j];
   if(Math.hypot(b.x-p.x,b.y-p.y)<SPACING_FACTOR*(b.s+p.s))
    return 'Пузырьки пересекаются: раздвиньте их';
  }
 }
 return null;
}
export function editedBubble(bubbles,index,change,standOff){
 const next=normalizeBubbles(bubbles);
 if(index<0||index>=next.length)return {bubbles:next,error:'Пузырёк не найден'};
 next[index]={...next[index],...change};
 next.splice(index,1,next[index]); // preserve a separate data record for stable state changes
 const safe=normalizeBubbles(next),error=layoutIssue(safe,standOff);
 return error?{bubbles:normalizeBubbles(bubbles),error}:{bubbles:safe,error:null};
}
export function findNewBubble(bubbles,standOff,position){
 const existing=normalizeBubbles(bubbles);
 if(existing.length>=MAX_BUBBLES)return {bubbles:existing,error:'Предел — семь пузырьков'};
 const size=.55;
 const trial=position?{x:position.x,y:position.y,s:size}:null;
 const candidates=[trial,...Array.from({length:45},(_,i)=>{
  const row=i%5-2,col=Math.floor(i/5);
  return {x:-2.2-col*1.45,y:row*1.45,s:size};
 })].filter(Boolean);
 for(const b of candidates){
  const next=normalizeBubbles([...existing,b]);
  if(!layoutIssue(next,standOff))return {bubbles:next,error:null};
 }
 return {bubbles:existing,error:'Нет свободного места: передвиньте пузырьки'};
}
export function cascadeMetrics(solution){
 if(solution.kind==='single')return {order:[0],spreadUs:0};
 const data=solution.individualCollapseUs.map((time,index)=>({time,index}))
   .sort((a,b)=>a.time-b.time||a.index-b.index);
 return {order:data.map(x=>x.index),spreadUs:data[data.length-1].time-data[0].time};
}
