// Village jurisdictions: no abstract judges, free money or invented grain.
// Hearings require real adults, actual walking routes and their finite workday.
import {walkPath,pathEffort} from './navigation.js';
import {scheduleWork,commitWork} from './work-time.js';
const round=n=>Math.round(n*100)/100;
const person=(s,id)=>s.people.find(p=>p.id===id);
const home=(s,id)=>s.households.find(h=>h.id===id);
const occupied=(s,h)=>h&&h.members.some(id=>person(s,id)?.alive);
const people=(s,h)=>h?.members.map(id=>person(s,id)).filter(Boolean)||[];
const isAvailable=(s,p)=>p?.alive&&p.age>=16&&p.health>=30&&
 (!p.travel||p.travel.end<=s.day)&&p.hiredDay!==s.day&&
 p.combatDutyDay!==s.day&&p.dailyShift?.day!==s.day;
const needs=(s,h)=>people(s,h).filter(p=>p.alive).reduce((n,p)=>n+(p.age<4?.35:p.age<10?.55:p.age<15?.77:1)*.68,0);
const notifyEvent=(notify,type,msg,cause,subjects,facts)=>notify?.(type,msg,cause,subjects,facts);
const staff=(s,h)=>people(s,h).filter(p=>isAvailable(s,p)).sort((a,b)=>b.health-a.health||a.id-b.id);
export function courtDay(communityId,day){return day>0&&day%14===communityId%14;}
export function villageInstitutions(s){return s.institutions||{cases:[],officers:{},statistics:{}};}
function ensure(s){s.institutions??={cases:[],officers:{},statistics:{}};return s.institutions;}
function chooseSteward(s,community,notify){
 const reg=ensure(s),prior=reg.officers[community.id],current=person(s,prior?.personId);
 if(current?.alive&&current.houseId===prior.houseId&&current.age>=18)return prior;
 const manor=home(s,community.manorHouseId);
 const houses=[...s.households].filter(h=>h.communityId===community.id&&occupied(s,h));
 houses.sort((a,b)=>Number(b.id===manor?.id)-Number(a.id===manor?.id)||
  Number(b.tenure==='free')-Number(a.tenure==='free')||b.fields.length-a.fields.length||a.id-b.id);
 const candidate=houses.flatMap(h=>people(s,h).filter(p=>p.alive&&p.age>=18&&p.age<=75&&p.health>=35)
  .sort((a,b)=>b.health-a.health||a.id-b.id).slice(0,1).map(p=>({h,p})))[0];
 if(!candidate){delete reg.officers[community.id];return null;}
 const next={personId:candidate.p.id,houseId:candidate.h.id,appointedDay:s.day,
  role:candidate.h.id===manor?.id?'manorial-steward':'village-reeve'};
 reg.officers[community.id]=next;
 reg.statistics.appointments=(reg.statistics.appointments||0)+1;
 notifyEvent(notify,'steward-appointed','Община выбрала нового распорядителя',
  'Должность занимает существующий взрослый житель; преемство зависит от возраста, здоровья, дома и держания',
  [candidate.h.id,candidate.p.id],{communityId:community.id,role:next.role});
 return next;
}
function eligibleWitness(s,h,excluded){
 return staff(s,h).find(p=>!excluded.has(p.id))||null;
}
function prepare(s,p,destination){
 if(!isAvailable(s,p))return null;
 const from=home(s,p.houseId);
 if(!from)return null;
 const shift=scheduleWork(s,p,'court',destination,from);
 return shift.workHours>=1&&Number.isFinite(shift.workHours)?shift:null;
}
function attend(s,entries){
 const schedules=[],ids=new Set();
 for(const [p,destination] of entries){
  if(!p||ids.has(p.id))return false;
  ids.add(p.id);const shift=prepare(s,p,destination);
  if(!shift)return false;
  schedules.push([p,shift]);
 }
 // No participant is committed before every required person can reach court.
 for(const [p,shift] of schedules){
  commitWork(s,p,shift);p.workDays??={};
  p.workDays.court=round((p.workDays.court||0)+shift.fraction);
  s.stats.courtHours=round((s.stats.courtHours||0)+shift.workHours);
 }
 return true;
}
function record(s,c,kind,message,subjects,notify){
 notifyEvent(notify,kind,message,c.cause||'Запись общинного суда: права и реальные ресурсы проверены',
  subjects,{caseId:c.id,kind:c.kind,communityId:c.communityId,disposition:c.disposition,
   officerId:c.officerId,grainKg:c.grainKg||0,paidCoin:c.paidCoin||0,
   debts:(c.debts||[]).map(d=>({...d}))});
}
function fileLandCases(s,notify){
 const reg=ensure(s);
 for(const dispute of s.conflicts||[]){
  if(!Number.isInteger(dispute.resultDay)||dispute.courtCaseId)continue;
  const claimant=home(s,dispute.claimantId),owner=home(s,dispute.ownerId);
  if(!claimant||!owner)continue;
  const c={id:s.nextId++,kind:'land',stage:'filed',filedDay:s.day,
   communityId:claimant.communityId,claimantId:claimant.id,ownerId:owner.id,
   cell:dispute.cell,disputeId:dispute.id,conflictOutcome:dispute.outcome,
   injuredClaimants:dispute.wounded.filter(id=>dispute.claimants.includes(id)).length,
   injuredOwners:dispute.wounded.filter(id=>dispute.owners.includes(id)).length,
   deadClaimants:dispute.dead.filter(id=>dispute.claimants.includes(id)).length,
   deadOwners:dispute.dead.filter(id=>dispute.owners.includes(id)).length,
   debts:[],paidCoin:0,disposition:null,officerId:null};
  reg.cases.push(c);dispute.courtCaseId=c.id;reg.statistics.petitions=(reg.statistics.petitions||0)+1;
  record(s,c,'court-petition','Семьи потребовали разбирательства земельного спора',
   [c.claimantId,c.ownerId],notify);
 }
}
function fileReliefPetitions(s,notify){
 if(s.day<12)return;
 const reg=ensure(s);
 for(const h of s.households){
  if(!occupied(s,h)||h.shortage<9||h.grain>=needs(s,h)*6||
   h.lastReliefPetitionDay!==undefined&&s.day-h.lastReliefPetitionDay<85||
   reg.cases.some(c=>c.kind==='relief'&&c.stage==='filed'&&c.claimantId===h.id)||
   s.shipments.some(t=>t.kind==='aid'&&t.buyer===h.id))continue;
  const petitioner=people(s,h).find(p=>p.alive&&p.age>=16&&p.health>=30);
  if(!petitioner)continue;
  const c={id:s.nextId++,kind:'relief',stage:'filed',filedDay:s.day,
   communityId:h.communityId,claimantId:h.id,petitionerId:petitioner.id,
   shortageAtPetition:h.shortage,grainAtPetition:h.grain,paidCoin:0,grainKg:0,
   debts:[],disposition:null,officerId:null};
  h.lastReliefPetitionDay=s.day;
  reg.cases.push(c);reg.statistics.reliefPetitions=(reg.statistics.reliefPetitions||0)+1;
  record(s,c,'relief-petition','Голодающая семья обратилась за общинной помощью',[h.id,petitioner.id],notify);
 }
}
function pay(s,fromId,toId,amount){
 const a=home(s,fromId),b=home(s,toId);
 if(!a||!b||a.id===b.id)return 0;
 const transferred=Math.min(Math.max(0,Math.floor(a.coin)),Math.max(0,Math.floor(amount)));
 a.coin-=transferred;b.coin+=transferred;
 return transferred;
}
function ruleLand(s,c,judge,notify){
 const claimant=home(s,c.claimantId),owner=home(s,c.ownerId),property=owner?.fields.includes(c.cell);
 c.officerId=judge.id;c.heardDay=s.day;
 if(!property){c.stage='dismissed';c.disposition='ownership-changed';
  record(s,c,'court-dismissed','Суд отложил земельный иск: владелец полосы уже изменился',[c.claimantId,c.ownerId,judge.id],notify);return;}
 // Battle victory alone never changes the registered right of tenure.
 const harmedOwner=c.injuredOwners*2+c.deadOwners*8;
 const harmedClaimant=c.injuredClaimants*2+c.deadClaimants*8;
 const claims=[{payer:c.claimantId,recipient:c.ownerId,amount:harmedOwner},
  {payer:c.ownerId,recipient:c.claimantId,amount:harmedClaimant}].filter(x=>x.amount>0);
 c.debts=[];
 for(const due of claims){const paid=pay(s,due.payer,due.recipient,due.amount);
  c.paidCoin+=paid;
  if(paid<due.amount)c.debts.push({...due,remaining:due.amount-paid});
 }
 c.disposition=claims.length?'restitution':'reconciliation';
 c.stage=c.debts.length?'owed':'resolved';
 c.cause='Существующие права на поле, травмы конкретных людей и доступные монеты; исход вооружённого спора не создаёт титул';
 s.stats.courtHearings=(s.stats.courtHearings||0)+1;
 s.stats.courtPaidCoin=(s.stats.courtPaidCoin||0)+c.paidCoin;
 record(s,c,'court-verdict',claims.length?'Суд подтвердил право на землю и назначил возмещение':'Суд примирил семьи и подтвердил существующие межи',
  [c.claimantId,c.ownerId,judge.id],notify);
}
function settleDebts(s,c,judge,notify){
 const entry=c.debts.find(d=>d.remaining>0);if(!entry)return;
 const officer=person(s,judge.personId),payer=home(s,entry.payer),recipient=home(s,entry.recipient);
 const courtHome=home(s,judge.houseId);
 if(!officer||!payer||!recipient||!courtHome)return;
 const excluded=new Set([officer.id]);
 const representativeA=eligibleWitness(s,payer,excluded);if(representativeA)excluded.add(representativeA.id);
 const representativeB=eligibleWitness(s,recipient,excluded);
 if(!attend(s,[[officer,courtHome],[representativeA,courtHome],[representativeB,courtHome]]))return;
 const paid=pay(s,entry.payer,entry.recipient,Math.min(4,entry.remaining));
 entry.remaining-=paid;c.paidCoin+=paid;
 s.stats.courtPaidCoin=(s.stats.courtPaidCoin||0)+paid;
 if(c.debts.every(d=>d.remaining===0)){c.stage='resolved';c.settledDay=s.day;}
 record(s,c,'court-debt',paid?'Семьи исполнили часть судебного возмещения':'У плательщика нет монет для исполнения решения',
  [c.claimantId,c.ownerId,officer.id],notify);
}
function grantRelief(s,target,officerId,notify){
 const community=s.communities.find(v=>v.id===target.communityId);
 const donors=s.households.filter(h=>h.communityId===target.communityId&&h.id!==target.id&&occupied(s,h));
 donors.sort((a,b)=>Number(b.id===community?.manorHouseId)-Number(a.id===community?.manorHouseId)||
   b.grain-a.grain||a.id-b.id);
 for(const donor of donors){
  const familyNeed=needs(s,donor),seedReserve=Math.min(250,donor.fields.length*.0625*125*.65);
  const disposable=round(Math.max(0,donor.grain-familyNeed*240-seedReserve));
  const amount=round(Math.min(65,disposable,needs(s,target)*25));
  if(amount<5)continue;
  const path=walkPath(s,donor,target);
  if(path.length<2||path.length>48)continue;
  const carrier=staff(s,donor).find(p=>p.id!==officerId);
  if(!carrier)continue;
  const shift=prepare(s,carrier,target);
  if(!shift)continue;
  const duration=Math.max(1,Math.ceil(pathEffort(s,path)/10));
  // Reserve existing family grain once and carry a genuine shipment; no
  // material arrives at the target until the existing delivery step.
  donor.grain=round(donor.grain-amount);
  const shipment={id:s.nextId++,kind:'aid',good:'grain',amount,seller:donor.id,
   buyer:target.id,cost:0,carrierId:carrier.id,carrierHouseId:donor.id,
   haulFee:0,departure:s.day+1,day:s.day+duration+1,route:path,
   institutional:true};
  s.shipments.push(shipment);
  commitWork(s,carrier,{...shift,kind:'haul'});
  carrier.travel={from:{x:donor.x,y:donor.y},to:{x:target.x,y:target.y},
   points:path,start:s.day+1,arrival:shipment.day,end:s.day+duration*2+1};
  carrier.workDays??={};carrier.workDays.haul=round((carrier.workDays.haul||0)+shift.fraction);
  s.stats.aid=round((s.stats.aid||0)+amount);
  s.stats.courtReliefKg=round((s.stats.courtReliefKg||0)+amount);
  notifyEvent(notify,'court-relief-dispatch','По решению общины отправлен зерновой груз',
   'Перевозчик, запас зерна, рабочее время и маршрут существуют в мире; получение происходит только после доставки',
   [donor.id,target.id,carrier.id],{grainKg:amount,shipmentId:shipment.id,arrival:shipment.day});
  return {amount,donorId:donor.id,shipmentId:shipment.id,carrierId:carrier.id};
 }
 return null;
}
function ruleRelief(s,c,officer,courtHome,notify){
 const target=home(s,c.claimantId),petitioner=person(s,c.petitionerId);
 if(!target||!occupied(s,target)||!petitioner?.alive||petitioner.houseId!==target.id){
  c.stage='dismissed';c.disposition='petitioner-unavailable';return;}
 if(!attend(s,[[officer,courtHome],[petitioner,courtHome]]))return;
 c.heardDay=s.day;c.officerId=officer.id;
 s.stats.courtHearings=(s.stats.courtHearings||0)+1;
 if(target.grain>=needs(s,target)*12||target.shortage<3){
  c.stage='resolved';c.disposition='recovered';
  record(s,c,'court-relief','Семье больше не требуется экстренная помощь',[target.id,officer.id],notify);return;}
 const sent=grantRelief(s,target,officer.id,notify);
 c.stage='resolved';c.disposition=sent?'aid-dispatched':'no-spare-grain';
 c.grainKg=sent?.amount||0;c.donorId=sent?.donorId||null;
 c.shipmentId=sent?.shipmentId||null;
 c.cause=sent?'Сохранили зерно семьи-донатора сверх физического резерва; помощь прибудет по настоящему маршруту':
  'Ни у одного доступного соседнего донора не оказалось свободного запаса с перевозчиком';
 record(s,c,'court-relief',sent?'Община разрешила доставку зерна нуждающимся':'Суд выслушал просьбу о хлебе, но помощи найти не удалось',
  [target.id,officer.id,sent?.donorId].filter(Boolean),notify);
}
export function advanceInstitutions(s,notify){
 const reg=ensure(s);
 fileLandCases(s,notify);fileReliefPetitions(s,notify);
 for(const cm of s.communities){
  const official=chooseSteward(s,cm,notify);
  if(!official||!courtDay(cm.id,s.day))continue;
  const courtHome=home(s,official.houseId),judge=person(s,official.personId);
  if(!courtHome||!isAvailable(s,judge))continue;
  const docket=reg.cases.filter(c=>c.communityId===cm.id&&c.stage==='filed'&&
   s.day-c.filedDay>=2).sort((a,b)=>a.filedDay-b.filedDay||a.id-b.id);
  const item=docket[0];
  if(item){
   if(item.kind==='relief')ruleRelief(s,item,judge,courtHome,notify);
   else{
    const a=home(s,item.claimantId),b=home(s,item.ownerId);
    const avoid=new Set([judge.id]),one=eligibleWitness(s,a,avoid);
    if(one)avoid.add(one.id);
    const two=eligibleWitness(s,b,avoid);
    if(attend(s,[[judge,courtHome],[one,courtHome],[two,courtHome]]))ruleLand(s,item,judge,notify);
   }
  }else{
   const due=reg.cases.find(c=>c.communityId===cm.id&&c.stage==='owed'&&c.debts.some(d=>d.remaining>0));
   if(due)settleDebts(s,due,official,notify);
  }
 }
 // Unheard cases may remain blocked by death, terrain or shortage of adults.
 // They time out with an explicit failure, rather than magically progressing.
 for(const c of reg.cases){
  if(c.stage==='filed'&&s.day-c.filedDay>180){
   c.stage='dismissed';c.disposition='no-hearing';c.closedDay=s.day;
   record(s,c,'court-dismissed','Прошение осталось без разбирательства',
    [c.claimantId,c.ownerId].filter(Boolean),notify);
  }
  if(c.stage==='owed'&&s.day-c.heardDay>730){
   c.stage='unenforced';c.disposition='unpaid';c.closedDay=s.day;
   record(s,c,'court-unpaid','Решение суда не удалось исполнить в течение двух лет',
    [c.claimantId,c.ownerId].filter(Boolean),notify);
  }
 }
 if(reg.cases.length>170){
  let excess=reg.cases.length-170;
  reg.cases=reg.cases.filter(c=>['filed','owed'].includes(c.stage)||excess--<=0);
 }
}
export function institutionsAudit(s){
 const issues=[],reg=s.institutions;if(!reg)return issues;
 if(!Array.isArray(reg.cases)||!reg.officers||!reg.statistics)return ['Повреждён общинный реестр'];
 const ids=new Set();
 for(const c of reg.cases){
  if(!Number.isInteger(c.id)||ids.has(c.id)||!s.communities.some(x=>x.id===c.communityId)||
   !['land','relief'].includes(c.kind)||!['filed','resolved','owed','dismissed','unenforced'].includes(c.stage)||
   c.filedDay>s.day||!home(s,c.claimantId)||c.kind==='land'&&(!home(s,c.ownerId)||!Number.isInteger(c.cell))||
   !Array.isArray(c.debts)||c.debts.some(d=>!home(s,d.payer)||!home(s,d.recipient)||
    !Number.isFinite(d.amount)||d.amount<0||!Number.isFinite(d.remaining)||d.remaining<0||d.remaining>d.amount)||
   !Number.isFinite(c.paidCoin||0)||c.paidCoin<0)
   issues.push('Повреждено дело общинного суда '+c.id);
  ids.add(c.id);
 }
 for(const [key,o] of Object.entries(reg.officers)){
  if(!Number.isInteger(o.personId)||!person(s,o.personId)||!home(s,o.houseId)||
   !s.communities.some(c=>String(c.id)===key))issues.push('Неверный распорядитель '+key);
 }
 return issues;
}
