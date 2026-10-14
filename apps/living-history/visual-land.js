// Read-only map semantics; map never adds land or people to the model.
export const LAND_SIZE=160;
export function fieldAppearance(s){
 const stages=new Uint8Array(LAND_SIZE*LAND_SIZE);
 const doy=s.day%365,year=Math.floor((s.day-1)/365);
 for(const h of s.households){
  const crop=h.farmYear?.year===year?h.farmYear:null;
  const active=crop?.active||h.fields.filter((_,i)=>(i+year)%3!==0);
  const owned=new Set(active);
  const sown=crop?Math.min(active.length,Math.ceil(crop.sownArea/.0625)):0;
  const harvested=crop?Math.min(active.length,Math.floor(crop.harvestedArea/.0625)):0;
  for(const cell of h.fields)stages[cell]=1; // protected but resting/uncultivated
  for(const cell of owned)stages[cell]=2; // ploughed, pending sowing
  for(let i=0;i<sown;i++)stages[active[i]]=doy>=145?3:2; // living crop
  for(let i=0;i<harvested;i++)stages[active[i]]=4; // stubble
 }
 return stages;
}
export function personPosition(p,s,previous,progress,active=true){
 const now={x:p.x,y:p.y},from=previous?.get(p.id)||now;
 // During a day, people walk from the previous real position to their current
 // place of work. Ambient yard activity is cosmetic and stays near their home.
 const t=active?Math.max(0,Math.min(1,progress)):1;
 const ease=t*t*(3-2*t);
 let x=from.x+(now.x-from.x)*ease,y=from.y+(now.y-from.y)*ease;
 if(active){
  if(p.job==='home'){
   const h=s.households.find(h=>h.id===p.houseId);
   if(h){const a=(s.day*.71+p.id*2.4)+t*Math.PI*2;
    x=h.x+Math.sin(a)*.56;y=h.y+Math.cos(a*.77)*.42;}
  }else if(p.job==='farm'||p.job==='wood'||p.job==='herd'){
   const k=t*Math.PI*3+p.id*1.73;x+=Math.sin(k)*.2;y+=Math.cos(k)*.15;
  }
 }
 return {x,y};
}
export function cattlePosition(h,day,i){
 const grazing=day%365>=80&&day%365<=300&&Number.isInteger(h.lastPastureCell);
 const anchor=grazing?{x:h.lastPastureCell%160,y:Math.floor(h.lastPastureCell/160)}:h;
 const angle=(day*.035+h.id*1.618+i*2.14),distance=.75+(i%3)*.45;
 return {x:anchor.x+Math.cos(angle)*distance,y:anchor.y+Math.sin(angle)*distance};
}