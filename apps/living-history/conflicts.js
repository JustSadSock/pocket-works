// Living History: local armed disputes made only of existing adults and
// physically owned field strips. No spawned troops, teleporting resources,
// fictional losses, or separate combat-time economy.
import {walkingSteps} from './navigation.js';
import {scheduleWork,commitWork} from './work-time.js';

const SIDE=160,WOOD_PER_STAFF=2;
const rnd=n=>Math.round(n*100)/100;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const xy=i=>({x:i%SIDE,y:Math.floor(i/SIDE)});
const draw=(seed,day,id,salt=0)=>{
 let n=Math.imul((seed^salt)|0,1597334677)^Math.imul(day+89,3812015801)^Math.imul(id+21,1103515245);
 n=Math.imul(n^(n>>>16),2246822519);
 return ((n^(n>>>13))>>>0)/4294967296;
};
const ready=p=>p.alive&&p.sex==='m'&&p.age>=16&&p.age<=62&&p.health>=38&&
 (!p.travel||p.travel.end<=p.worldDay)&&!p.hiredDayActive;
const roster=(s,h)=>h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p&&ready({...p,worldDay:s.day,hiredDayActive:p.hiredDay===s.day})&&p.dailyShift?.day!==s.day)
 .sort((a,b)=>b.health-a.health||a.id-b.id);
const byId=(s,id)=>s.households.find(h=>h.id===id);
const citizen=(s,id)=>s.people.find(p=>p.id===id);
function betweenFields(s,h){
 const title=new Int32Array(SIDE*SIDE);
 for(const owner of s.households)for(const i of owner.fields)if(i>=0&&i<title.length)title[i]=owner.id;
 const nearest=[];
 for(const cell of h.fields){
  const {x,y}=xy(cell);
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
   if(Math.abs(dx)+Math.abs(dy)>4)continue;
   const nx=x+dx,ny=y+dy;if(nx<1||nx>=SIDE-1||ny<1||ny>=SIDE-1)continue;
   const site=ny*SIDE+nx,id=title[site];
   if(!id||id===h.id)continue;
   const owner=byId(s,id);
   if(!owner||owner.communityId!==h.communityId||owner.fields.length<=h.fields.length*1.7)continue;
   nearest.push({claimant:h,owner,cell:site,distance:Math.abs(dx)+Math.abs(dy)});
  }
 }
 nearest.sort((a,b)=>a.distance-b.distance||b.owner.fields.length-a.owner.fields.length||a.cell-b.cell);
 return nearest[0]||null;
}
export function fieldGrievances(s){
 const options=[];
 for(const h of s.households){
  if(h.fields.length<5||h.fields.length>75||h.lastArmedDisputeDay!==undefined&&s.day-h.lastArmedDisputeDay<365)continue;
  if(!roster(s,h).length)continue;
  const border=betweenFields(s,h);if(!border||!roster(s,border.owner).length)continue;
  const scarcity=clamp((85-h.fields.length)/85,0,1);
  const hunger=clamp((h.shortage||0)/35,0,1);
  const claim=clamp(scarcity*.72+hunger*.45,0,1);
  const road=walkingSteps(s,h,xy(border.cell));
  if(road<0||road>42)continue;
  const chance=clamp(.08+claim*.29,0,.43);
  options.push({...border,claim,road,chance});
 }
 options.sort((a,b)=>b.claim-a.claim||a.road-b.road||a.claimant.id-b.claimant.id);
 return options;
}
function kit(s,h,count){
 const stock=h.wood||0,owned=Math.max(0,h.staves||0);
 const shortage=Math.max(0,count-owned);
 if(stock<shortage*WOOD_PER_STAFF)return false;
 if(shortage){
  h.wood=rnd(h.wood-shortage*WOOD_PER_STAFF);
  h.staves=owned+shortage;
  h.staveWood=rnd((h.staveWood||0)+shortage*WOOD_PER_STAFF);
  s.stats.staveWoodMade=rnd((s.stats.staveWoodMade||0)+shortage*WOOD_PER_STAFF);
 }
 return true;
}
export function beginLandDispute(s,claimId,ownerId,cell,notify){
 s.conflicts??=[];
 const claimant=byId(s,claimId),owner=byId(s,ownerId);
 if(!claimant||!owner||claimant.id===owner.id||claimant.communityId!==owner.communityId||
  !owner.fields.includes(cell)||claimant.fields.length>=owner.fields.length||s.terrain[cell]!==0)return null;
 if(s.conflicts.some(c=>c.stage==='mobilizing'&&(c.claimantId===claimId||c.ownerId===ownerId||c.claimantId===ownerId||c.ownerId===claimId)))return null;
 const as=roster(s,claimant).slice(0,2),bs=roster(s,owner).slice(0,2);
 if(!as.length||!bs.length||
  claimant.wood<Math.max(0,as.length-(claimant.staves||0))*WOOD_PER_STAFF||
  owner.wood<Math.max(0,bs.length-(owner.staves||0))*WOOD_PER_STAFF)return null;
 const spot=xy(cell);
 for(const p of [...as,...bs]){
  const home=byId(s,p.houseId);
  const q=scheduleWork(s,p,'guard',spot,home);
  if(q.workHours<=0||!Number.isFinite(q.workHours))return null;
 }
 kit(s,claimant,as.length);kit(s,owner,bs.length);
 const c={id:s.nextId++,stage:'mobilizing',startDay:s.day,meetDay:s.day+1,endDay:null,
  claimantId:claimId,ownerId,cell,claimants:as.map(p=>p.id),owners:bs.map(p=>p.id),
  outcome:null,wounded:[],dead:[],compensationCoin:0};
 s.conflicts.push(c);
 claimant.lastArmedDisputeDay=s.day;owner.lastArmedDisputeDay=s.day;
 s.stats.armedDisputes=(s.stats.armedDisputes||0)+1;
 notify?.('armed-dispute',`У полосы общинной пашни назревает вооружённый спор`,
  'Соседние семьи оспаривают право пользования полем; вышли реальные взрослые жители с деревянными посохами',
  [claimId,ownerId,...c.claimants,...c.owners],{cell,people:as.length+bs.length,woodSpent:(as.length+bs.length)*WOOD_PER_STAFF});
 return c;
}
function patrol(s,c){
 const site=xy(c.cell);
 for(const id of [...c.claimants,...c.owners]){
  const p=citizen(s,id);if(!p?.alive||p.travel&&p.travel.end>s.day||p.dailyShift?.day===s.day)continue;
  const h=byId(s,p.houseId),q=scheduleWork(s,p,'guard',site,h);
  if(q.workHours<=0||!Number.isFinite(q.workHours))continue;
  commitWork(s,p,q);
  p.combatDutyDay=s.day;
  p.workDays??={};p.workDays.guard=rnd((p.workDays.guard||0)+q.fraction);
  s.stats.guardHours=rnd((s.stats.guardHours||0)+q.workHours);
 }
}
function strength(s,ids){
 let power=0;for(const id of ids){const p=citizen(s,id);if(!p?.alive||p.combatDutyDay!==s.day)continue;
  power+=clamp(p.health/85,.25,1.15)*(1+Math.min(.2,(p.skill?.wood||0)*.12));}
 return power;
}
function wound(s,c,people,threat,side,notify){
 for(const id of people){
  const p=citizen(s,id);if(!p?.alive||p.combatDutyDay!==s.day)continue;
  const r=draw(s.seed,s.day,p.randomKey??p.id,side?0x75c9:0x5a7d);
  if(r>=threat)continue;
  const lost=Math.round(6+draw(s.seed,s.day,p.id,0x27bd)*25);
  p.health=clamp(p.health-lost,0,100);
  c.wounded.push(p.id);
  p.lifeLog??=[];p.lifeLog.push({day:s.day,type:'battle-wound',text:`Получил рану в споре о полосе пашни: здоровье −${lost}`});
  if(p.lifeLog.length>240)p.lifeLog.splice(1,p.lifeLog.length-240);
  // A genuinely severe and rare injury causes a death in the existing
  // biological lifeCycle. The latter marks it as combat, not starvation.
  if(p.health<12&&draw(s.seed,s.day,p.id,0x8a31)<.12){
   p.health=0;p.combatFatalDay=s.day;c.dead.push(p.id);
  }
 }
}
function resolve(s,c,notify){
 const left=strength(s,c.claimants),right=strength(s,c.owners);
 const attacker=byId(s,c.claimantId),defender=byId(s,c.ownerId);
 const bias=draw(s.seed,s.day,c.cell,0x117a)*.32-.16;
 if(!left||!right){
  c.outcome='dispersed';
 }else{
  const pressure=left/(left+right)+bias;
  c.outcome=pressure>.53?'claimant':'owner';
  wound(s,c,c.claimants,clamp(.18+right/(left+right)*.22,.1,.44),0,notify);
  wound(s,c,c.owners,clamp(.18+left/(left+right)*.22,.1,.44),1,notify);
  // Agreed compensation is a REAL transfer between existing treasuries.
  // Title stays put until a separate lawful land reform or lease transaction.
  const winner=c.outcome==='claimant'?attacker:defender;
  const loser=c.outcome==='claimant'?defender:attacker;
  const payment=Math.min(Math.floor(Math.max(0,loser.coin)),3);
  loser.coin-=payment;winner.coin+=payment;
  c.compensationCoin=payment;
  s.stats.disputeCompensations=(s.stats.disputeCompensations||0)+payment;
 }
 c.stage='resolved';c.endDay=s.day;s.stats.armedDisputesResolved=(s.stats.armedDisputesResolved||0)+1;
 s.stats.battleWounds=(s.stats.battleWounds||0)+c.wounded.length;
 notify?.('armed-clash',c.outcome==='dispersed'?'Участники земельного спора разошлись':
  `Вооружённая стычка на общинной пашне: ранено ${c.wounded.length}`,
  'Схватка обычных жителей, действительные раны и денежная компенсация. Права на поле не изменились',
  [c.claimantId,c.ownerId,...c.claimants,...c.owners],
  {cell:c.cell,outcome:c.outcome,wounded:c.wounded.length,dead:c.dead.length,compensationCoin:c.compensationCoin});
}
export function advanceLocalConflicts(s,notify){
 s.conflicts??=[];
 // Each event is fully resolved or cancelled; old entries remain inspectable
 // until 90 recent disputes, without uncontrolled battlefield object growth.
 for(const c of s.conflicts)if(c.stage==='mobilizing'){
  patrol(s,c);
  if(s.day>=c.meetDay)resolve(s,c,notify);
 }
 if(s.day%365!==315||s.day<365)return;
 const candidates=fieldGrievances(s);
 const used=new Set();let started=0;
 for(const c of candidates){
  if(started>=2)break;
  if(used.has(c.claimant.communityId))continue;
  const lottery=draw(s.seed,Math.floor(s.day/365),c.claimant.id^c.owner.id,0xf892);
  if(lottery>c.chance)continue;
  const fight=beginLandDispute(s,c.claimant.id,c.owner.id,c.cell,notify);
  if(fight){used.add(c.claimant.communityId);started++;patrol(s,fight);}
 }
 if(s.conflicts.length>90)s.conflicts.splice(0,s.conflicts.length-90);
}
export function conflictAudit(s){
 const issues=[];
 for(const h of s.households){
  const staves=h.staves||0,stock=h.staveWood||0;
  if(!Number.isInteger(staves)||staves<0||Math.abs(stock-staves*WOOD_PER_STAFF)>.011)
   issues.push('Неверный запас деревянного оружия '+h.id);
 }
 for(const c of s.conflicts||[]){
  if(!['mobilizing','resolved'].includes(c.stage)||!Number.isInteger(c.cell)||c.cell<0||c.cell>=SIDE*SIDE||
   !byId(s,c.claimantId)||!byId(s,c.ownerId)||c.meetDay<c.startDay||
   !Array.isArray(c.claimants)||!Array.isArray(c.owners)||c.claimants.some(id=>!citizen(s,id))||
   c.owners.some(id=>!citizen(s,id)))
   issues.push('Повреждён земельный конфликт '+c.id);
 }
 return issues;
}
