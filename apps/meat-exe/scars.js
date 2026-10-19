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
