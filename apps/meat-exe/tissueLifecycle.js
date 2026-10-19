// MEAT.EXE v1.9.2: intact membranes actively seal superficial wounds.
// A ruptured gate never regrows. No navigation/collision state is created here.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const TISSUE_MAX=100;
export const TISSUE_SEAL_DELAY=5.5;
export const TISSUE_SEAL_RATE=5.5;
export const MAX_DAMAGED_TISSUES=120;
export function tissueHit(tissue,amount){
 if(!tissue||!Number.isFinite(amount)||amount<=0||tissue.hp<=0)return false;
 tissue.hp=clamp(tissue.hp-amount,0,TISSUE_MAX);
 tissue.sealDelay=TISSUE_SEAL_DELAY;
 return tissue.hp===0;
}
export function tissueTick(tissue,dt){
 if(!tissue||tissue.hp<=0||tissue.hp>=TISSUE_MAX)return false;
 const step=clamp(Number.isFinite(dt)?dt:0,0,.1);
 if(!step)return false;
 let active=step;
 if(tissue.sealDelay>0){
  const waiting=Math.min(step,tissue.sealDelay);
  tissue.sealDelay=Math.max(0,tissue.sealDelay-waiting);
  if(tissue.sealDelay<1e-8)tissue.sealDelay=0;
  active=Math.max(0,step-waiting);
 }
 if(active<1e-8)return false;
 tissue.hp=Math.min(TISSUE_MAX,tissue.hp+TISSUE_SEAL_RATE*active);
 return true;
}
export function sanitizeTissueDamage(entries,wave){
 if(!Array.isArray(entries))return [];
 const seen=new Set(),out=[];
 for(const entry of entries.slice(-MAX_DAMAGED_TISSUES*2)){
  if(!entry||typeof entry.id!=='string'||
     !/^[1-5]:-?\d+,-?\d+$/.test(entry.id)||
     !entry.id.startsWith(wave+':')||
     !Number.isFinite(entry.hp)||entry.hp<=0||entry.hp>=TISSUE_MAX)continue;
  if(seen.has(entry.id))continue;
  seen.add(entry.id);
  out.push({id:entry.id,hp:clamp(entry.hp,1,TISSUE_MAX-1),
    sealDelay:clamp(Number.isFinite(entry.sealDelay)?entry.sealDelay:0,0,TISSUE_SEAL_DELAY)});
 }
 return out.slice(-MAX_DAMAGED_TISSUES);
}
export function livingMembraneSignature(tissues){
 const arr=Array.isArray(tissues)?tissues:[];
 return {injured:arr.filter(t=>t.hp>0&&t.hp<TISSUE_MAX).length,
  sealing:arr.filter(t=>t.hp>0&&t.hp<TISSUE_MAX&&(t.sealDelay||0)<=0).length,
  opened:arr.filter(t=>t.hp<=0).length};
}
