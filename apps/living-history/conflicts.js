// Living History: local armed disputes made only of existing adults and
// physically owned field strips. No spawned troops, teleporting resources,
// fictional losses, or separate combat-time economy.
import {walkingSteps,walkPath,pathEffort} from './navigation.js';
import {scheduleWork,commitWork} from './work-time.js';
import {assessFieldTactics,tacticalBreak,pursuitChance} from './battle-tactics.js';

const SIDE=160,WOOD_PER_STAFF=2,MAX_MUSTER=4;
const EXPEDITION_RATION=.68,EXPEDITION_DAYS=4,DAILY_MARCH_CELLS=64;
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
export function beginLandDispute(s,claimId,ownerId,cell,notify,options={}){
 s.conflicts??=[];
 const claimant=byId(s,claimId),owner=byId(s,ownerId);
 if(!claimant||!owner||claimant.id===owner.id||claimant.communityId!==owner.communityId||
  !owner.fields.includes(cell)||claimant.fields.length>=owner.fields.length||s.terrain[cell]!==0)return null;
 if(s.conflicts.some(c=>c.stage!=='resolved'&&(c.claimantId===claimId||c.ownerId===ownerId||c.claimantId===ownerId||c.ownerId===claimId)))return null;
 // Large musters are opt-in or arise only from severe local land pressure.
 // Every participant must be a living, available member of the actual household.
 const muster=options.muster===true;
 const expedition=muster&&options.expedition===true;
 const cap=muster?MAX_MUSTER:2;
 const as=roster(s,claimant).slice(0,cap),bs=roster(s,owner).slice(0,cap);
 if(!as.length||!bs.length||
  claimant.wood<Math.max(0,as.length-(claimant.staves||0))*WOOD_PER_STAFF||
  owner.wood<Math.max(0,bs.length-(owner.staves||0))*WOOD_PER_STAFF)return null;
 const spot=xy(cell);
 for(const p of [...as,...bs]){
  const home=byId(s,p.houseId);
  const q=scheduleWork(s,p,'guard',spot,home);
  if(q.workHours<=0||!Number.isFinite(q.workHours))return null;
 }
 const woodSpent=(Math.max(0,as.length-(claimant.staves||0))+Math.max(0,bs.length-(owner.staves||0)))*WOOD_PER_STAFF;
 // Portable grain is transferred, not minted. At least a day's ration must
 // be available after protecting three days of the family's current need.
 const need=(ids)=>ids.length*EXPEDITION_RATION;
 const load=(h,ids)=>rnd(Math.min(ids.length*EXPEDITION_RATION*EXPEDITION_DAYS,Math.max(0,(h.grain||0)-h.members.filter(id=>citizen(s,id)?.alive).length*.68*3)));
 const leftFood=expedition?load(claimant,as):0,rightFood=expedition?load(owner,bs):0;
 if(expedition&&(leftFood+1e-6<need(as)||rightFood+1e-6<need(bs)))return null;
 // All validations precede mutation of household stocks.
 if(expedition){
  for(const [h,people] of [[claimant,as],[owner,bs]])if(!people.every(p=>walkPath(s,h,spot).length>1))return null;
 }
 kit(s,claimant,as.length);kit(s,owner,bs.length);
 if(expedition){claimant.grain=rnd(claimant.grain-leftFood);owner.grain=rnd(owner.grain-rightFood);}
 const c={id:s.nextId++,stage:muster?'mustering':'mobilizing',startDay:s.day,
  rallyDay:muster?s.day+1:null,meetDay:s.day+(muster?2:1),endDay:null,
  claimantId:claimId,ownerId,cell,claimants:as.map(p=>p.id),owners:bs.map(p=>p.id),
  muster,expedition,outcome:null,wounded:[],dead:[],compensationCoin:0,
  morale:null,retreated:null,arrived:{claimants:0,owners:0},
  tactics:null,broken:null,pursued:[],
  ...(expedition?{
   supply:{claimants:{grain:leftFood,loaded:leftFood,eaten:0,returned:0},
           owners:{grain:rightFood,loaded:rightFood,eaten:0,returned:0}},
   positions:Object.fromEntries([...as,...bs].map(p=>{const h=byId(s,p.houseId);return [p.id,h.y*SIDE+h.x]})),
   campDays:0,travelDays:0,returnDays:0,aborted:null
  }:{})};
 s.conflicts.push(c);
 claimant.lastArmedDisputeDay=s.day;owner.lastArmedDisputeDay=s.day;
 s.stats.armedDisputes=(s.stats.armedDisputes||0)+1;
 notify?.('armed-dispute',muster?'Соседние семьи собирают ополчение для спора о земле':'У полосы общинной пашни назревает вооружённый спор',
  muster?'Сбор у родных дворов, затем пеший поход к спорной полосе. Участники теряют рабочее время':'Соседние семьи оспаривают право пользования полем; вышли реальные взрослые жители с деревянными посохами',
  [claimId,ownerId,...c.claimants,...c.owners],{cell,people:as.length+bs.length,woodSpent,muster,expedition,foodLoadedKg:rnd(leftFood+rightFood)});
 return c;
}
function patrol(s,c,atHome=false){
 const site=xy(c.cell);
 for(const id of [...c.claimants,...c.owners]){
  const p=citizen(s,id);
  if(!p?.alive||p.travel&&p.travel.end>s.day||p.dailyShift?.day===s.day)continue;
  const h=byId(s,p.houseId);
  if(!h)continue;
  const q=scheduleWork(s,p,'guard',atHome?{x:h.x,y:h.y}:site,h);
  if(q.workHours<=0||!Number.isFinite(q.workHours))continue;
  commitWork(s,p,q);
  p.combatDutyDay=s.day;
  p.workDays??={};p.workDays.guard=rnd((p.workDays.guard||0)+q.fraction);
  s.stats.guardHours=rnd((s.stats.guardHours||0)+q.workHours);
 }
}
// Cohesion is the measurable willingness of people who REALLY reached the
// strip; hunger, travel fatigue, illness and imbalance can produce retreat.
function readiness(s,ids){
 let power=0,moraleSum=0,arrived=0;
 for(const id of ids){
  const p=citizen(s,id);
  if(!p?.alive||p.combatDutyDay!==s.day||p.dailyShift?.day!==s.day||
   p.dailyShift.workHours<=0)continue;
  const h=byId(s,p.houseId);
  if(!h)continue;
  const fitness=clamp(p.health/85,.25,1.15);
  const fatigue=clamp(p.dailyShift.travelHours/8.5,0,1);
  const hunger=clamp((h.shortage||0)/35,0,1);
  const morale=clamp(.36+.46*fitness-.30*hunger-.26*fatigue,0,1);
  moraleSum+=morale;arrived++;
  power+=fitness*(1+Math.min(.2,(p.skill?.wood||0)*.12))*(.5+.5*morale);
 }
 return {power:rnd(power),morale:arrived?rnd(moraleSum/arrived):0,arrived};
}
function wound(s,c,people,threat,side,notify,pursuit=false){
 for(const id of people){
  const p=citizen(s,id);if(!p?.alive||p.health<=0||p.combatDutyDay!==s.day||c.wounded.includes(id))continue;
  const r=draw(s.seed,s.day,p.randomKey??p.id,pursuit?(side?0x5bbf:0x46ae):(side?0x75c9:0x5a7d));
  if(r>=threat)continue;
  const lost=Math.round((pursuit?3:6)+draw(s.seed,s.day,p.id,pursuit?0x6fa2:0x27bd)*(pursuit?15:25));
  p.health=clamp(p.health-lost,0,100);
  c.wounded.push(p.id);if(pursuit)c.pursued.push(p.id);
  p.lifeLog??=[];p.lifeLog.push({day:s.day,type:pursuit?'battle-pursuit-wound':'battle-wound',text:`${pursuit?'Ранен при преследовании':'Получил рану в споре о полосе пашни'}: здоровье −${lost}`});
  if(p.lifeLog.length>240)p.lifeLog.splice(1,p.lifeLog.length-240);
  // A genuinely severe and rare injury causes a death in the existing
  // biological lifeCycle. The latter marks it as combat, not starvation.
  if(p.health<12&&draw(s.seed,s.day,p.id,0x8a31)<.12){
   p.health=0;p.combatFatalDay=s.day;c.dead.push(p.id);
  }
 }
}
function commitFlank(s,c){
 const m=c.tactics?.flank;
 if(!m)return;
 const p=citizen(s,m.personId),q=p?.dailyShift;
 if(!p?.alive||q?.day!==s.day||q.workHours<.04){c.tactics.flank=null;return;}
 const distance=pathEffort(s,m.routeCells.map(xy));
 const extra=Math.round(distance*.025/4*10000)/10000; // one physical 25-metre maneuver at 4 km/h
 const total=q.expedition?extra:2*extra;
 if(!Number.isFinite(extra)||q.workHours<=total){c.tactics.flank=null;return;}
 q.travelHours=Math.round((q.travelHours+total)*10000)/10000;
 q.workHours=Math.round((q.workHours-total)*10000)/10000;
 q.fraction=Math.round(q.workHours/8.5*10000)/10000;
 q.arrive=Math.round((q.arrive+extra)*10000)/10000;
 if(!q.expedition)q.returnStart=Math.round((q.returnStart-extra)*10000)/10000;
 q.to=xy(m.toCell);q.routeCells=[...(q.routeCells||[]),m.toCell];
 p.x=q.to.x;p.y=q.to.y;
 if(c.expedition)c.positions[p.id]=m.toCell;
 s.stats.guardHours=rnd(Math.max(0,(s.stats.guardHours||0)-total));
 p.workDays.guard=rnd(Math.max(0,(p.workDays.guard||0)-total/8.5));
}
function resolve(s,c,notify){
 c.pursued??=[];c.broken??=null;
 const left=readiness(s,c.claimants),right=readiness(s,c.owners);
 const attacker=byId(s,c.claimantId),defender=byId(s,c.ownerId);
 c.morale={claimants:left.morale,owners:right.morale};
 c.arrived={claimants:left.arrived,owners:right.arrived};
 c.tactics=assessFieldTactics(s,c,left,right);
 commitFlank(s,c);
 const total=c.tactics.claimants.power+c.tactics.owners.power;
 const bias=draw(s.seed,s.day,c.cell,0x117a)*.32-.16;
 if(!left.power||!right.power){
  c.outcome='dispersed';
 }else{
  // Drastically outnumbered, exhausted or hungry villagers may withdraw
  // before any blows are exchanged. Retreat is not a new battle entity.
  const lRetreat=left.morale<.26||(c.tactics.advantage<.30&&left.morale<.75);
  const rRetreat=right.morale<.26||(1-c.tactics.advantage<.30&&right.morale<.75);
  c.retreated=lRetreat&&rRetreat?'both':lRetreat?'claimants':rRetreat?'owners':null;
  const pressure=c.tactics.advantage+bias;
  c.outcome=lRetreat&&rRetreat?'dispersed':lRetreat?'owner':rRetreat?'claimant':
   pressure>.53?'claimant':'owner';
  if(!c.retreated){
   const winner=c.outcome==='claimant'?'claimants':'owners';
   const loser=winner==='owners'?'claimants':'owners';
   wound(s,c,c.claimants,clamp(.18+(1-c.tactics.advantage)*.22,.1,.44),0,notify);
   wound(s,c,c.owners,clamp(.18+c.tactics.advantage*.22,.1,.44),1,notify);
   if(tacticalBreak(c.tactics,loser)){
    c.broken=loser;
    // Pursuit is a second, smaller injury opportunity for actual fleeing
    // villagers only; it cannot spawn casualties or strike a phantom unit.
    wound(s,c,c[loser],pursuitChance(c.tactics,winner,loser),
     loser==='owners'?1:0,notify,true);
    if(c.pursued.length)s.stats.pursuitWounds=(s.stats.pursuitWounds||0)+c.pursued.length;
    s.stats.brokenGroups=(s.stats.brokenGroups||0)+1;
   }
  }
  if(c.outcome!=='dispersed'){
   // A payment is a transfer of EXISTING money. No capture of legal title.
   const winner=c.outcome==='claimant'?attacker:defender;
   const loser=c.outcome==='claimant'?defender:attacker;
   const payment=Math.min(Math.floor(Math.max(0,loser.coin)),3);
   loser.coin-=payment;winner.coin+=payment;
   c.compensationCoin=payment;
   s.stats.disputeCompensations=(s.stats.disputeCompensations||0)+payment;
  }
 }
 c.stage=c.expedition?'returning':'resolved';
 c.resultDay=s.day;if(!c.expedition)c.endDay=s.day;
 s.stats.armedDisputesResolved=(s.stats.armedDisputesResolved||0)+1;
 s.stats.battleWounds=(s.stats.battleWounds||0)+c.wounded.length;
 if(c.retreated)s.stats.disputeRetreats=(s.stats.disputeRetreats||0)+1;
 const cause=c.tactics?
  `Местность: ${c.tactics.terrain.label}. ${c.tactics.claimants.formation} против ${c.tactics.owners.formation}${c.tactics.flank?' · реальный обход с фланга':''}${c.broken?' · группа потеряла строй':''}${c.pursued.length?' · раненых при преследовании: '+c.pursued.length:''}. Права на поле не изменились`:
  'Численность, здоровье и мораль прибывших жителей. Права на землю не изменились';
 notify?.('armed-clash',c.outcome==='dispersed'?'Участники земельного спора разошлись':
  c.retreated?'Участники земельного спора отступили без схватки':
  `Вооружённая стычка на общинной пашне: ранено ${c.wounded.length}`,
  cause,
  [c.claimantId,c.ownerId,...c.claimants,...c.owners],
  {cell:c.cell,outcome:c.outcome,wounded:c.wounded.length,dead:c.dead.length,
   compensationCoin:c.compensationCoin,morale:c.morale,arrived:c.arrived,retreated:c.retreated,
   tactics:c.tactics?{terrain:c.tactics.terrain.label,formation:{claimants:c.tactics.claimants.formation,owners:c.tactics.owners.formation},flankPersonId:c.tactics.flank?.personId||null,broken:c.broken,pursued:c.pursued}:null});
}
// Grain transferred into an expedition is a physical, serialised inventory.
// This is deliberately separate from the household's ordinary daily feeding.
export function expeditionGrain(s){
 return rnd((s.conflicts||[]).reduce((sum,c)=>sum+(c.supply?.claimants?.grain||0)+(c.supply?.owners?.grain||0),0));
}
function feedExpedition(s,c,side){
 const ids=side==='claimants'?c.claimants:c.owners,stock=c.supply[side];
 const present=ids.map(id=>citizen(s,id)).filter(p=>p?.alive&&(!c.expedition||c.stage!=='returning'||p.combatAwayDay===s.day));
 const required=rnd(present.length*EXPEDITION_RATION);
 const eaten=rnd(Math.min(required,stock.grain));
 stock.grain=rnd(stock.grain-eaten);stock.eaten=rnd(stock.eaten+eaten);
 s.stats.consumed=rnd((s.stats.consumed||0)+eaten);
 s.stats.expeditionGrainEaten=rnd((s.stats.expeditionGrainEaten||0)+eaten);
 const deficit=Math.max(0,required-eaten);
 if(deficit>.005){
  // Physical famine applies to the actual participants, not their
  // safely fed relatives, and is audited as an army subsistence shortage.
  s.stats.expeditionHungerDays=(s.stats.expeditionHungerDays||0)+present.length;
  for(const p of present){p.foodDebt=clamp((p.foodDebt||0)+.75*deficit/Math.max(.01,required),0,100);
   p.health=clamp(p.health-.72*deficit/Math.max(.01,required),0,100);}
 }
 return {required,eaten,deficit};
}
function campShift(s,p,from,to,path){
 const q=scheduleWork(s,p,'guard',to,from);
 if(!Number.isFinite(q.workHours)||q.workHours<=0)return false;
 // Overnight expeditions end at their real field camp, not an invented
 // return to the home yard at the end of each subday animation.
 q.expedition=true;q.returnStart=q.end=q.arrive+q.workHours;
 q.travelHours=rnd(q.travelHours/2);
 q.routeCells=path.map(pt=>pt.y*SIDE+pt.x);
 commitWork(s,p,q);
 p.combatDutyDay=s.day;p.combatAwayDay=s.day;
 p.workDays??={};p.workDays.guard=rnd((p.workDays.guard||0)+q.fraction);
 s.stats.guardHours=rnd((s.stats.guardHours||0)+q.workHours);
 return true;
}
function stepMarch(s,c,returning){
 const active=[...c.claimants,...c.owners].map(id=>citizen(s,id)).filter(p=>p?.alive);
 let moving=0,blocked=0;
 for(const p of active){
  const h=byId(s,p.houseId);if(!h)continue;
  const from=xy(c.positions[p.id]),to=returning?{x:h.x,y:h.y}:xy(c.cell);
  if(returning&&from.x===to.x&&from.y===to.y)continue;
  const path=walkPath(s,from,to);
  if(!path.length){blocked++;continue;}
  const segment=path.slice(0,DAILY_MARCH_CELLS+1);
  const end=segment[segment.length-1];
  if(!campShift(s,p,from,end,segment)){blocked++;continue;}
  c.positions[p.id]=end.y*SIDE+end.x;
  if(c.positions[p.id]!==to.y*SIDE+to.x)moving++;
 }
 for(const side of ['claimants','owners'])feedExpedition(s,c,side);
 if(returning)c.returnDays++;else c.travelDays++;
 return {moving,blocked,remaining:active.some(p=>{
  const h=byId(s,p.houseId),want=returning?h&&h.y*SIDE+h.x:c.cell;
  return want!==undefined&&c.positions[p.id]!==want;
 })};
}
function finishExpedition(s,c,notify){
 // Surplus provisions physically return to the originating household.
 for(const side of ['claimants','owners']){
  const supply=c.supply[side],home=byId(s,side==='claimants'?c.claimantId:c.ownerId);
  const leftover=supply.grain;
  home.grain=rnd(home.grain+leftover);
  supply.returned=rnd(supply.returned+leftover);supply.grain=0;
 }
 c.stage='resolved';c.endDay=s.day;
 notify?.('armed-return','Ополчение вернулось по домам',
  'Остатки походного зерна возвращены настоящим хозяйствам',
  [c.claimantId,c.ownerId],{cell:c.cell,travelDays:c.travelDays,returnDays:c.returnDays,
   foodKg:rnd(c.supply.claimants.eaten+c.supply.owners.eaten),aborted:c.aborted});
}
function abortExpedition(s,c,reason,notify){
 c.aborted=reason;c.outcome='dispersed';c.resultDay=s.day;c.stage='returning';
 s.stats.armedDisputesResolved=(s.stats.armedDisputesResolved||0)+1;
 s.stats.expeditionsAborted=(s.stats.expeditionsAborted||0)+1;
 notify?.('armed-retreat','Поход ополчения прекращён',
  reason==='food'?'Походные запасы истощились, отряд возвращается':'Нет проходимого пути, отряд ищет дорогу назад',
  [c.claimantId,c.ownerId],{cell:c.cell,reason});
}
export function advanceLocalConflicts(s,notify){
 s.conflicts??=[];
 // Each event is fully resolved or cancelled; old entries remain inspectable
 // until 90 recent disputes, without uncontrolled battlefield object growth.
 for(const c of s.conflicts){
  if(c.stage==='mustering'){
   if(s.day>=c.rallyDay){patrol(s,c,true);c.stage=c.expedition?'marching':'mobilizing';}
  }else if(c.stage==='marching'){
   // No trip can continue for free after available carried rations expire.
   const canEat=['claimants','owners'].every(side=>c.supply[side].grain+1e-6>=
     (side==='claimants'?c.claimants:c.owners).filter(id=>citizen(s,id)?.alive).length*EXPEDITION_RATION);
   if(!canEat){abortExpedition(s,c,'food',notify);continue;}
   const step=stepMarch(s,c,false);
   if(step.blocked){abortExpedition(s,c,'route',notify);continue;}
   if(!step.remaining){c.stage='encamped';c.meetDay=s.day+1;}
  }else if(c.stage==='encamped'){
   const canEat=['claimants','owners'].every(side=>c.supply[side].grain+1e-6>=
     (side==='claimants'?c.claimants:c.owners).filter(id=>citizen(s,id)?.alive).length*EXPEDITION_RATION);
   if(!canEat){abortExpedition(s,c,'food',notify);continue;}
   const step=stepMarch(s,c,false);
   if(step.blocked){abortExpedition(s,c,'route',notify);continue;}
   c.campDays++;
   if(s.day>=c.meetDay)resolve(s,c,notify);
  }else if(c.stage==='returning'){
   const step=stepMarch(s,c,true);
   // A new obstacle blocks physical return instead of teleporting troops.
   if(!step.remaining&&!step.blocked)finishExpedition(s,c,notify);
  }else if(c.stage==='mobilizing'){
   patrol(s,c);
   if(s.day>=c.meetDay)resolve(s,c,notify);
  }
 }
 if(s.day%365!==315||s.day<365)return;
 const candidates=fieldGrievances(s);
 const used=new Set();let started=0;
 for(const c of candidates){
  if(started>=2)break;
  if(used.has(c.claimant.communityId))continue;
  const lottery=draw(s.seed,Math.floor(s.day/365),c.claimant.id^c.owner.id,0xf892);
  if(lottery>c.chance)continue;
  // The most severe local shortages can motivate a longer organised muster.
  // Ordinary household scuffles retain their original one-day timetable.
  const muster=c.claim>.78&&draw(s.seed,s.day,c.claimant.id,0x719e)<.35;
  const fight=beginLandDispute(s,c.claimant.id,c.owner.id,c.cell,notify,{muster,expedition:muster});
  if(fight){used.add(c.claimant.communityId);started++;patrol(s,fight,muster);}
 }
 // Never drop a live field inventory. Only old finished history is capped.
 if(s.conflicts.length>90){
  const excess=s.conflicts.length-90;
  let removed=0;
  s.conflicts=s.conflicts.filter(c=>c.stage!=='resolved'||removed++>=excess);
 }
}
export function conflictAudit(s){
 const issues=[];
 for(const h of s.households){
  const staves=h.staves||0,stock=h.staveWood||0;
  if(!Number.isInteger(staves)||staves<0||Math.abs(stock-staves*WOOD_PER_STAFF)>.011)
   issues.push('Неверный запас деревянного оружия '+h.id);
 }
 for(const c of s.conflicts||[]){
  if(!['mustering','mobilizing','marching','encamped','returning','resolved'].includes(c.stage)||!Number.isInteger(c.cell)||c.cell<0||c.cell>=SIDE*SIDE||
   !byId(s,c.claimantId)||!byId(s,c.ownerId)||c.meetDay<c.startDay||
   !Array.isArray(c.claimants)||!Array.isArray(c.owners)||c.claimants.some(id=>!citizen(s,id))||
   c.owners.some(id=>!citizen(s,id))||
   new Set([...c.claimants,...c.owners]).size!==c.claimants.length+c.owners.length||
   c.claimants.length>(c.muster?MAX_MUSTER:2)||c.owners.length>(c.muster?MAX_MUSTER:2)||
   c.muster&&c.rallyDay!==c.startDay+1||
   c.morale&&Object.values(c.morale).some(m=>!Number.isFinite(m)||m<0||m>1)||
   c.tactics&&(!c.tactics.terrain||!['claimants','owners'].every(side=>{
    const t=c.tactics[side];return t&&Number.isInteger(t.count)&&t.count>=0&&t.count<=c[side].length&&
      Number.isFinite(t.cohesion)&&t.cohesion>=0&&t.cohesion<=1&&Number.isFinite(t.power)&&t.power>=0;
   })||c.tactics.flank&&(!c.claimants.includes(c.tactics.flank.personId)||
      c.tactics.flank.fromCell!==c.cell||Math.abs(xy(c.cell).x-xy(c.tactics.flank.toCell).x)+
      Math.abs(xy(c.cell).y-xy(c.tactics.flank.toCell).y)!==1))||
   c.broken&&!['claimants','owners'].includes(c.broken)||
   (c.pursued||[]).some(id=>!c.wounded.includes(id)||!c[c.broken||'claimants'].includes(id))||
   c.expedition&&(
    !c.supply||!c.positions||!['claimants','owners'].every(side=>{
     const q=c.supply[side],ids=side==='claimants'?c.claimants:c.owners;
     return q&&[q.grain,q.loaded,q.eaten,q.returned].every(n=>Number.isFinite(n)&&n>=0)&&
      Math.abs(q.grain+q.eaten+q.returned-q.loaded)<.04&&
      ids.every(id=>Number.isInteger(c.positions[id])&&c.positions[id]>=0&&c.positions[id]<SIDE*SIDE);
    })
   ))
   issues.push('Повреждён земельный конфликт '+c.id);
 }
 return issues;
}
