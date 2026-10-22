// Prediction of the end-of-round economy for the player's *known* items.
// Upkeep is reserved before income. If maintenance can't be paid, the item
// contributes neither income nor upkeep. Special one-shot effects are separate.
export const ECONOMY_KEYS=['gold','crystals','parts'];
const capped=n=>Math.max(0,Math.min(9999,Math.trunc(Number(n)||0)));
export function expense(negative,wallet){
 if(!negative)return {gold:0,crystals:0,parts:0};
 const cost={gold:0,crystals:0,parts:0};
 if(negative.type==='goldPercent')cost.gold=Math.floor((wallet.gold||0)*negative.value/100);
 else if(ECONOMY_KEYS.includes(negative.type))cost[negative.type]=negative.value;
 return cost;
}
export function forecastEconomy(resources,items){
 const start=Object.fromEntries(ECONOMY_KEYS.map(k=>[k,capped(resources?.[k])]));
 const available={...start},active=[],inactive=[];
 // All upkeep is reserved from the wallet before any income is generated.
 for(const item of items||[]){
  const need=expense(item.negative,available);
  const missing=ECONOMY_KEYS.filter(k=>available[k]<need[k]);
  if(missing.length){inactive.push({id:item.id,missing,cost:need});continue;}
  for(const key of ECONOMY_KEYS)available[key]-=need[key];
  active.push(item);
 }
 const after={...available};
 for(const item of active){
  const gain=item.positive;
  if(!gain)continue;
  if(ECONOMY_KEYS.includes(gain.type))after[gain.type]=capped(after[gain.type]+gain.value);
  // Server goldPercent is applied as a percent deduction regardless of sign.
  else if(gain.type==='goldPercent')after.gold=capped(after.gold-Math.floor(after.gold*gain.value/100));
 }
 const delta=Object.fromEntries(ECONOMY_KEYS.map(k=>[k,after[k]-start[k]]));
 return {start,after,delta,activeIds:active.map(x=>x.id),inactive,remainingMaintenanceWallet:available};
}
