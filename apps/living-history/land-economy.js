// An explicit land decision shared by founding allotments, family claims,
// and the cadastral inspector. An open field can contain strips from different
// families: this is a title and cultivation model, not a fixed family rectangle.
export const STRIP_HECTARES=.0625;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const round=n=>Math.round(n*100)/100;
const SIDE=160;
export function parcelEconomics(s,h,cell,walkingSteps,neighboringFields=0,options={}){
 const soil=s.soil[cell]||0,forest=s.forest[cell]||0;
 const visits=options.visits??16;
 const annualKg=STRIP_HECTARES*680*(2/3)*soil/82;
 // One-way walking effort is a measured network distance (25 m/cell).
 // Historical projection only: production remains decided by actual labor
 // schedules and crop yields, not this heuristic.
 const returnHours=Math.max(0,walkingSteps)*.025*2/4;
 const yearlyTravelHours=returnHours*visits;
 const woodNeeded=24+Math.ceil(forest/90); // material and brush clearance
 const compensation=16+Math.max(0,Math.floor((soil-70)/12));
 const freeClaim=Boolean(options.founding);
 const proximity=clamp(neighboringFields,0,12);
 const income=annualKg*(options.grainPrice??1);
 const travelCost=yearlyTravelHours*.85;
 const clearingCost=forest/18*.42+(freeClaim?0:(woodNeeded-24)*.6);
 // The actual grant/claim has one-time cost; the score annualizes 15 years.
 const tenureCost=freeClaim?0:(compensation*.08+woodNeeded*.25)/15;
 const netAnnual=income-travelCost-clearingCost/15-tenureCost;
 const score=netAnnual+proximity*1.7
   -Math.max(0,walkingSteps-80)*.28
   -forest*.0038;
 return {cell,soil,forest,walkSteps:walkingSteps,commuteHours:round(returnHours),
  yearlyTravelHours:round(yearlyTravelHours),expectedAnnualKg:round(annualKg),
  clearingWorkDays:round(forest/18+12),woodNeeded,compensation,
  netAnnual:round(netAnnual),score:round(score),neighboringFields:proximity};
}
export function leaseEconomics(s,tenant,cell,walkSteps,share=.18){
 const soil=s.soil[cell]||0;
 const expected=STRIP_HECTARES*680*(2/3)*soil/82;
 const roadHours=walkSteps*.025*2/4*16;
 // No payment of phantom grain: this is a bid/preference only.
 const netKg=expected*(1-share)-roadHours*.85;
 return {cell,expectedKg:round(expected),travelHours:round(roadHours),
  expectedRentKg:round(expected*share),netKg:round(netKg),share};
}
export function landCadastre(s){
 const owners=new Int32Array(SIDE*SIDE);
 const tenants=new Int32Array(SIDE*SIDE);
 const crofts=new Int32Array(SIDE*SIDE);
 const houses=new Int32Array(SIDE*SIDE);
 const households=new Map(s.households.map(h=>[h.id,h]));
 for(const h of s.households){
  if(h.y>=0&&h.y<SIDE&&h.x>=0&&h.x<SIDE)houses[h.y*SIDE+h.x]=h.id;
  for(const cell of h.fields)if(cell>=0&&cell<owners.length)owners[cell]=h.id;
  for(const cell of h.croft||[])if(cell>=0&&cell<crofts.length)crofts[cell]=h.id;
  for(const cell of h.leaseIn||[])if(cell>=0&&cell<tenants.length)tenants[cell]=h.id;
 }
 return {owners,tenants,crofts,houses,households};
}
export function landAt(cadastre,cell){
 if(cell<0||cell>=cadastre.owners.length)return null;
 const ownerId=cadastre.owners[cell],tenantId=cadastre.tenants[cell];
 const croftId=cadastre.crofts[cell],houseId=cadastre.houses[cell];
 if(!ownerId&&!tenantId&&!croftId&&!houseId)return null;
 return {ownerId:ownerId||croftId||houseId,tenantId,kind:croftId?'croft':houseId?'home':'field',
  owner:cadastre.households.get(ownerId||croftId||houseId)||null,
  tenant:cadastre.households.get(tenantId)||null};
}
export function tenureSummary(s,cadastre,houseId){
 const h=cadastre.households.get(houseId);
 if(!h)return null;
 const cells=h.fields||[],leased=h.leaseIn||[];
 const distances=coords=>Math.abs(coords%SIDE-h.x)+Math.abs(Math.floor(coords/SIDE)-h.y);
 const area=cells.length*STRIP_HECTARES;
 return {owned:cells.length,ownedHa:round(area),rented:leased.length,
  rentedHa:round(leased.length*STRIP_HECTARES),letOut:(h.leaseOut||[]).length,
  closestCell:cells.length?cells.reduce((a,c)=>distances(c)<distances(a)?c:a):null,
  meanDistance:cells.length?round(cells.reduce((a,c)=>a+distances(c),0)/cells.length):0};
}
