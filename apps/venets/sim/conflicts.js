// VЕНЕЦ 0.7 - bounded, deterministic feudal conflict layer.
// Contracts, schemes and wars use real legal titles, resources and kinship.
// No separate battle RNG or "victory animation" that is not in the ledger.
import {randomInt} from './random.js';
import {recordEvent,transfer,changeTitleHolder} from './transactions.js';
import {die,titlesOf} from './dynasty.js';
import {opinion,remember} from './politics.js';

const person=(w,id)=>w.people.find(p=>p.id===id);
const title=(w,id)=>w.titles.find(t=>t.id===id);
const county=(w,id)=>w.provinces.find(p=>p.id===id);
const adult=(w,p)=>p?.alive&&w.year-p.birthYear>=18;
const holdings=(w,id)=>titlesOf(w,id).filter(t=>t.rank==='county');
const claimant=(w,p,t)=>t?.holderId!==p.id&&t?.claims.some(c=>c.personId===p.id);
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const ownProvince=(w,id)=>holdings(w,id).map(t=>t.provinceId).filter(Boolean).sort();
const goalProvince=(w,t)=>{
  if(t.rank==='county')return t.provinceId;
  const v=w.titles.filter(x=>x.rank==='county'&&x.liegeId===t.id);
  return (v.find(x=>x.holderId===t.holderId)||v[0])?.provinceId||null;
};
function route(w,from,to){
  const prev=new Map([[from,null]]),queue=[from];
  while(queue.length){
    const at=queue.shift();
    if(at===to)break;
    for(const n of county(w,at)?.neighbors||[]){
      if(!prev.has(n)){prev.set(n,at);queue.push(n)}
    }
  }
  if(!prev.has(to))return null;
  const back=[];for(let current=to;current!==null;current=prev.get(current))back.push(current);
  return back.reverse();
}
function pledge(w,actorId){
  return w.conflicts.contracts.filter(c=>c.beneficiaryId===actorId&&c.untilYear>w.year&&
    person(w,c.patronId)?.alive).reduce((sum,c)=>sum+Math.min(5,holdings(w,c.patronId).length*3),0);
}
function armed(w,p){
  return Math.min(36,holdings(w,p.id).length*7+
    (titlesOf(w,p.id).some(t=>t.rank==='duchy')?8:0)+
    Math.min(9,Math.floor(p.treasury.grain/10))+pledge(w,p.id));
}
function candidate(w,p,kind,targetId,titleId,score,reasons,meta={}){
  return {kind,actorId:p.id,targetId,targetId,titleId,score,reasons,meta};
}
function last(p,kind){return p.politics.lastActions[kind]??-999}
export function ensureConflicts(w){
  if(!w.conflicts)w.conflicts={nextId:1,wars:[],schemes:[],contracts:[],
    stats:{wars:0,decided:0,contracts:0,plots:0,assassinations:0}};
  return w.conflicts;
}
export function conflictChoices(w,actorId){
  const state=ensureConflicts(w),p=person(w,actorId);
  if(!adult(w,p))return [];
  const active=state.wars.some(x=>x.attackerId===p.id||x.defenderId===p.id);
  const claims=w.titles.filter(t=>claimant(w,p,t)&&t.rank!=='kingdom')
    .sort((a,b)=>a.rank===b.rank?a.id.localeCompare(b.id):a.rank==='duchy'?-1:1);
  const actions=[];
  const first=claims[0];
  const target=first?person(w,first.holderId):null;
  const canFund=p.treasury.coin>=10&&p.treasury.grain>=14;
  if(first&&target?.alive&&canFund&&!active&&state.wars.length<2&&
    w.year-last(p,'war')>=10&&ownProvince(w,p.id).length){
    const staging=ownProvince(w,p.id)[0],objective=goalProvince(w,first);
    if(objective&&route(w,staging,objective))
      actions.push(candidate(w,p,'war',target.id,first.id,
        55+p.politics.traits.ambition/4-p.politics.traits.caution/5,
        ['written-claim','levy-funded'],{from:staging,to:objective,levy:armed(w,p)}));
  }
  if(first&&target?.alive&&!state.schemes.some(s=>s.actorId===p.id)&&
    p.treasury.coin>=8&&w.year-last(p,'blackmail')>=9)
    actions.push(candidate(w,p,'blackmail',target.id,first.id,
      46+p.politics.traits.ambition/3+p.politics.traits.diplomacy/7,
      ['written-claim','spies-paid'],{cost:8}));
  if(first&&target?.alive&&!state.schemes.some(s=>s.actorId===p.id)&&
    p.treasury.coin>=14&&w.year-last(p,'assassinate')>=14&&
    p.politics.traits.caution<72)
    actions.push(candidate(w,p,'assassinate',target.id,first.id,
      28+p.politics.traits.ambition/3-p.politics.traits.caution/5,
      ['dynastic-rivalry','high-risk'],{cost:14}));
  if(!active&&w.year-last(p,'contract')>=5&&p.treasury.coin>=8){
    const supporters=w.people.filter(q=>adult(w,q)&&q.id!==p.id&&
      holdings(w,q.id).length&&q.id!==target?.id&&
      !state.contracts.some(c=>c.beneficiaryId===p.id&&c.patronId===q.id&&c.untilYear>w.year))
      .sort((a,b)=>(a.dynastyId===p.dynastyId?-1:0)-(b.dynastyId===p.dynastyId?-1:0)
        ||b.politics.traits.loyalty-a.politics.traits.loyalty||a.id.localeCompare(b.id)).slice(0,2);
    for(const q of supporters)
      actions.push(candidate(w,p,'contract',q.id,null,35+
        (q.dynastyId===p.dynastyId?24:0)+p.politics.traits.diplomacy/5,
        ['service-for-silver','finite-oath'],{cost:8,until:w.year+6}));
  }
  // A war always resolves by peace, retreat or loss. Offer a negotiated exit.
  const ownWar=state.wars.find(x=>x.attackerId===p.id);
  if(ownWar)actions.push(candidate(w,p,'peace',ownWar.defenderId,ownWar.titleId,65,
    ['cease-hostilities','renounce-current-siege'],{warId:ownWar.id}));
  return actions.sort((a,b)=>b.score-a.score||a.kind.localeCompare(b.kind));
}
function cost(w,p,amount,cause){
  transfer(w,{good:'coin',from:'person:'+p.id,amount,cause});
}
function resolveWar(w,war,outcome,cause){
  const state=ensureConflicts(w),t=title(w,war.titleId);
  if(outcome==='victory'&&t?.holderId!==war.attackerId&&person(w,war.attackerId)?.alive)
    changeTitleHolder(w,{titleId:t.id,newHolderId:war.attackerId,cause:'military-settlement:'+war.id});
  recordEvent(w,'war-peace',cause,{warId:war.id,titleId:war.titleId,
    attackerId:war.attackerId,defenderId:war.defenderId,outcome,
    casualties:war.casualties,yearStarted:war.startedYear});
  state.wars=state.wars.filter(x=>x.id!==war.id);
  state.stats.decided++;
}
function execute(w,choice){
  const state=ensureConflicts(w),p=person(w,choice.actorId),q=person(w,choice.targetId);
  const kind=choice.kind,cause='conflict:'+kind+':'+p.id;
  let success=true,detail=null;
  if(kind==='contract'){
    const accepted=q.alive&&(q.dynastyId===p.dynastyId||
      opinion(w,q.id,p.id)+q.politics.traits.loyalty>=84);
    if(accepted){
      cost(w,p,choice.meta.cost,'contract-retainer:'+p.id);
      transfer(w,{good:'coin',to:'person:'+q.id,amount:choice.meta.cost,cause:'contract-retainer:'+p.id});
      const c={id:'vo-'+state.nextId++,beneficiaryId:p.id,patronId:q.id,
        startYear:w.year,untilYear:choice.meta.until};
      state.contracts.push(c);state.stats.contracts++;detail=c.id;
      remember(w,{witnessId:q.id,otherId:p.id,kind:'favor',weight:12,cause});
    }else{
      success=false;
      remember(w,{witnessId:q.id,otherId:p.id,kind:'refusal',weight:-6,cause});
    }
  }else if(kind==='war'){
    const id='wa-'+state.nextId++,from=choice.meta.from,to=choice.meta.to;
    // Both parties pay the first actual mobilization cost; unsupported or bankrupt
    // defenders deploy only what they can fund. No free perpetual armies.
    cost(w,p,10,'levy-raised:'+id);
    transfer(w,{good:'grain',from:'person:'+p.id,amount:14,cause:'levy-provisions:'+id});
    const defense=Math.min(armed(w,q),Math.floor(q.treasury.coin/2)+Math.floor(q.treasury.grain/3));
    const attacker=Math.max(6,armed(w,p));
    const war={id,attackerId:p.id,defenderId:q.id,titleId:choice.titleId,
      locationId:from,objectiveId:to,attackerTroops:attacker,defenderTroops:defense,
      siege:0,years:0,casualties:0,startedYear:w.year};
    state.wars.push(war);state.stats.wars++;detail=id;
    recordEvent(w,'war-declared','written-claim-and-paid-levy',{warId:id,
      titleId:war.titleId,attackerId:p.id,defenderId:q.id,from,to,
      troops:attacker,defenders:defense});
  }else if(kind==='blackmail'||kind==='assassinate'){
    cost(w,p,choice.meta.cost,'agents-hired:'+kind+':'+p.id);
    const s={id:'sc-'+state.nextId++,kind,actorId:p.id,targetId:q.id,titleId:choice.titleId,
      progress:0,years:0,startYear:w.year};
    state.schemes.push(s);state.stats.plots++;detail=s.id;
    recordEvent(w,'scheme-started',cause,{schemeId:s.id,actorId:p.id,targetId:q.id,
      titleId:s.titleId,kind,cost:choice.meta.cost});
  }else if(kind==='peace'){
    const war=state.wars.find(war=>war.id===choice.meta.warId);
    if(!war||war.attackerId!==p.id)throw new RangeError('War no longer exists');
    resolveWar(w,war,'retreat','peace-signed-by-attacker');detail=war.id;
  }else throw new RangeError('Unknown conflict action');
  p.politics.lastActions[kind]=w.year;
  recordEvent(w,'conflict-decision',cause,{kind,actorId:p.id,targetId:q.id,
    titleId:choice.titleId,success,detail});
  return {kind,success,detail};
}
export function performConflictAction(w,command){
  const options=conflictChoices(w,command.actorId);
  const a=options.find(c=>c.kind===command.kind&&
    (c.targetId??null)===(command.targetId??null)&&
    (c.titleId??null)===(command.titleId??null));
  if(!a)throw new RangeError('Conflict action not available');
  return execute(w,a);
}
function battleYear(w,war){
  const state=ensureConflicts(w),p=person(w,war.attackerId);
  const t=title(w,war.titleId);
  if(!p?.alive||!t){resolveWar(w,war,'withdrawal','claimant-dead');return}
  if(t.holderId===p.id){resolveWar(w,war,'victory','claim-already-settled');return}
  const defender=person(w,t.holderId);
  war.defenderId=defender.id;
  war.objectiveId=goalProvince(w,t)||war.objectiveId;
  war.years++;
  const upkeep=Math.min(p.treasury.grain,Math.max(2,Math.ceil(war.attackerTroops/5)));
  if(upkeep)transfer(w,{good:'grain',from:'person:'+p.id,amount:upkeep,cause:'campaign-supply:'+war.id});
  const pay=Math.min(p.treasury.coin,2);
  if(pay)transfer(w,{good:'coin',from:'person:'+p.id,amount:pay,cause:'campaign-pay:'+war.id});
  const shortage=upkeep<Math.ceil(war.attackerTroops/5)||pay<2;
  if(shortage)war.attackerTroops=Math.max(0,war.attackerTroops-3);
  const routeNow=route(w,war.locationId,war.objectiveId);
  if(routeNow?.length>1)war.locationId=routeNow[1];
  else{
    const hill=county(w,war.objectiveId)?.terrain==='hills'?2:0;
    const aLoss=Math.min(war.attackerTroops,Math.max(1,Math.floor(war.defenderTroops/7)+hill));
    const dLoss=Math.min(war.defenderTroops,Math.max(1,Math.floor(war.attackerTroops/5)));
    war.attackerTroops-=aLoss;war.defenderTroops-=dLoss;
    war.casualties+=aLoss+dLoss;
    if(war.attackerTroops>war.defenderTroops)war.siege++;
    else war.siege=Math.max(0,war.siege-1);
  }
  recordEvent(w,'war-year','paid-supply-march-siege',{warId:war.id,locationId:war.locationId,
    titleId:war.titleId,attackerId:p.id,defenderId:war.defenderId,
    troops:war.attackerTroops,defenders:war.defenderTroops,siege:war.siege,shortage});
  if(war.siege>=3&&war.attackerTroops>0)resolveWar(w,war,'victory','fortress-surrender');
  else if(war.attackerTroops<3||war.years>=8)resolveWar(w,war,'defeat','exhausted-or-eight-year-limit');
}
function schemeYear(w,s){
  const state=ensureConflicts(w),p=person(w,s.actorId),q=person(w,s.targetId);
  const t=title(w,s.titleId);
  if(!p?.alive||!q?.alive||!t||t.holderId===p.id){
    state.schemes=state.schemes.filter(o=>o.id!==s.id);
    recordEvent(w,'scheme-ended','targets-unavailable',{schemeId:s.id,outcome:'lapsed',actorId:s.actorId});
    return;
  }
  s.years++;
  s.progress+=Math.max(9,12+Math.floor(p.politics.traits.diplomacy/7)+
    Math.floor(p.politics.traits.ambition/12)-Math.floor(q.politics.traits.caution/10));
  if(s.progress<100&&s.years<6)return;
  state.schemes=state.schemes.filter(o=>o.id!==s.id);
  const chance=s.kind==='assassinate'?Math.max(18,Math.min(62,
    30+p.politics.traits.diplomacy/3-q.politics.traits.caution/4)):
    Math.max(25,Math.min(80,47+p.politics.traits.diplomacy/3-q.politics.traits.caution/5));
  const success=randomInt(w,100)<chance;
  if(success){
    if(s.kind==='assassinate'){
      die(w,{personId:q.id,cause:'discovered-assassination:'+s.id});
      state.stats.assassinations++;
    }else if(claimant(w,p,t)&&q.id===t.holderId){
      changeTitleHolder(w,{titleId:t.id,newHolderId:p.id,cause:'sealed-blackmail:'+s.id});
    }
  }else{
    remember(w,{witnessId:q.id,otherId:p.id,kind:'grievance',weight:-24,cause:'scheme-exposed:'+s.id});
  }
  recordEvent(w,'scheme-ended','scheme-tested-against-counterintel',{schemeId:s.id,
    kind:s.kind,actorId:p.id,targetId:q.id,titleId:t.id,success,progress:s.progress});
}
export function conflictYear(w,{excludePlayerId=null}={}){
  const state=ensureConflicts(w);
  state.contracts=state.contracts.filter(c=>c.untilYear>w.year&&
    person(w,c.beneficiaryId)?.alive&&person(w,c.patronId)?.alive);
  for(const war of [...state.wars])battleYear(w,war);
  for(const s of [...state.schemes])schemeYear(w,s);
  // Bounded autonomous activity. NPCs observe exactly the same legal eligibility.
  const excluded=new Set([excludePlayerId].filter(Boolean));
  const active=w.people.filter(p=>adult(w,p)&&!excluded.has(p.id)&&
    (holdings(w,p.id).length||w.titles.some(t=>claimant(w,p,t)))).sort((a,b)=>a.id.localeCompare(b.id));
  let used=0;
  for(const p of active){
    if(used>=2)break;
    const choices=conflictChoices(w,p.id);
    const best=choices.find(c=>c.score>=76&&c.kind!=='peace');
    if(best){
      execute(w,best);used++;
    }
  }
}
export function assertConflicts(w){
  if(!w.conflicts)return true; // v0.6 saves can migrate without losing anything.
  const s=w.conflicts;
  if(!safe(s.nextId)||!Array.isArray(s.wars)||!Array.isArray(s.schemes)||
    !Array.isArray(s.contracts)||!s.stats||s.wars.length>2)throw Error('Invalid conflict registry');
  const ids=new Set();
  for(const obj of [...s.wars,...s.schemes,...s.contracts]){
    if(!obj.id||ids.has(obj.id)){throw Error('Duplicate conflict id')}
    ids.add(obj.id);
  }
  for(const war of s.wars){
    if(!person(w,war.attackerId)?.alive||!person(w,war.defenderId)?.alive||
      !title(w,war.titleId)||!county(w,war.locationId)||!county(w,war.objectiveId)||
      ![war.attackerTroops,war.defenderTroops,war.casualties,war.siege,war.years].every(safe)||
      war.years>8)throw Error('Invalid war state');
  }
  for(const scheme of s.schemes){
    if(!person(w,scheme.actorId)?.alive||!person(w,scheme.targetId)?.alive||
      !title(w,scheme.titleId)||!['blackmail','assassinate'].includes(scheme.kind)||
      !safe(scheme.progress)||!safe(scheme.years)||scheme.years>6)
      throw Error('Invalid scheme state');
  }
  for(const c of s.contracts){
    if(!person(w,c.beneficiaryId)?.alive||!person(w,c.patronId)?.alive||
      !safe(c.startYear)||!safe(c.untilYear)||c.untilYear<=w.year)
      throw Error('Invalid oath');
  }
  if(!Object.values(s.stats).every(safe))throw Error('Invalid conflict statistics');
  return true;
}
