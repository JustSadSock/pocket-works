// MEAT.EXE v1.9.1: persistent physical damage memory, version-independent.
// Ledger is bounded and deterministic across replay, save/load and scene resets.
export const MAX_SCARS=96;
export const SCAR_TYPES=Object.freeze(['blood','rupture','burn']);
const valid=n=>Number.isFinite(n)&&Math.abs(n)<9999;
const quantize=n=>Math.round(n*4)/4;
export function sanitizeScars(input){
 if(!Array.isArray(input))return [];
 const result=[],seen=new Set();
 for(const entry of input.slice(-MAX_SCARS*3)){
   if(!entry||!Number.isInteger(entry.wave)||entry.wave<1||entry.wave>5||
     !valid(entry.x)||!valid(entry.z)||!SCAR_TYPES.includes(entry.kind))continue;
   const x=quantize(entry.x),z=quantize(entry.z);
   const key=entry.wave+':'+x+','+z+':'+entry.kind;
   if(seen.has(key))continue;
   seen.add(key);
   result.push({wave:entry.wave,x,z,kind:entry.kind});
 }
 return result.slice(-MAX_SCARS);
}
export function addScar(ledger,wave,x,z,kind){
 const list=sanitizeScars(ledger);
 if(!Number.isInteger(wave)||wave<1||wave>5||!valid(x)||!valid(z)||
   !SCAR_TYPES.includes(kind))return list;
 const entry={wave,x:quantize(x),z:quantize(z),kind};
 const previous=list.findIndex(s=>s.wave===wave&&s.x===entry.x&&s.z===entry.z&&s.kind===kind);
 if(previous>=0)list.splice(previous,1);
 list.push(entry);
 return list.slice(-MAX_SCARS);
}
export function scarSignature(ledger,wave){
 const selected=sanitizeScars(ledger).filter(s=>s.wave===wave);
 const counts={blood:0,rupture:0,burn:0};
 for(const s of selected)counts[s.kind]++;
 return {wave,count:selected.length,...counts};
}

export function deathPose(type,elapsed,duration=0.8){
 const t=Math.max(0,Math.min(1,(Number.isFinite(elapsed)?elapsed:0)/
   Math.max(.001,Number.isFinite(duration)?duration:.8)));
 const collapse=Math.pow(t,1.35);
 const heavy=['ossuary','brute','warden'].includes(type);
 return {
  complete:t>=1,
  fall:collapse*(heavy?.23:.30),
  pitch:collapse*(type==='synapse'?1.10:.58),
  yaw:collapse*.54,
  roll:collapse*(heavy?.88:1.32),
  horizontal:1-collapse*.80,
  vertical:1-collapse*.63
 };
}
