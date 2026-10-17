// ВЕНЕЦ 0.4: explainable, deterministic goal-driven political agents.
// No network LLM, no war simulation. Every accepted action changes legal state,
// money, relationships or a persistent coalition; ignored choices aren't emitted.
import { randomInt } from './random.js';
import { recordEvent, transfer, changeTitleHolder } from './transactions.js';
import { findPerson, titlesOf, marry, ancestors, isAlive } from './dynasty.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const adult=(world,p)=>p?.alive && world.year-p.birthYear>=18;
const rank={county:1,duchy:3,kingdom:6};
const power=(world,id)=>titlesOf(world,id).reduce((s,t)=>s+(rank[t.rank]||0),0);
const ordered=(a,b)=>a.id.localeCompare(b.id);
const memoryTypes=new Set(['favor','grievance','marriage','grant','petition','faction','refusal','concession']);
export function initializePoliticalPerson(world,person) {
  if(person.politics)return person.politics;
  person.politics={
    traits:{
      ambition:15+randomInt(world,86),
      loyalty:15+randomInt(world,86),
      caution:15+randomInt(world,86),
      diplomacy:15+randomInt(world,86)
    },
    goal:{kind:'secure-house',targetId:null,titleId:null,since:world.year},
    opinions:{},
    memories:[],
    lastActions:{}
  };
  return person.politics;
}
export function initializePolitics(world,{migration=false}={}) {
  world.politics={nextFactionId:1,factions:[],stats:{
    actions:0,gifts:0,marriages:0,grants:0,petitions:0,coalitions:0,
    joins:0,ultimatums:0,concessions:0,refusals:0
  }};
  world.schemaVersion=4;
  for(const person of world.people)initializePoliticalPerson(world,person);
  if(migration)recordEvent(world,'migration','schema-v3-to-v4',{
    people:world.people.length,politicalBaseline:world.year,retroactiveRelations:false
  });
  return world;
}
export function opinion(world,fromId,toId){
  const from=findPerson(world,fromId);
  if(!from||!findPerson(world,toId))return 0;
  return from.politics?.opinions[toId]??0;
}
export function remember(world,{witnessId,otherId,kind,weight,cause}){
  if(world.experiment?.memory===false)return 0;
  const witness=findPerson(world,witnessId);
  if(!witness?.alive||!findPerson(world,otherId)||witnessId===otherId||!memoryTypes.has(kind)||
      !Number.isSafeInteger(weight)||weight < -50||weight>50||!cause)
    throw new RangeError('Invalid relationship memory');
  const state=witness.politics;
  const amount=clamp((state.opinions[otherId]??0)+weight,-100,100);
  state.opinions[otherId]=amount;
  state.memories.push({year:world.year,otherId,kind,weight,cause});
  if(state.memories.length>12)state.memories.splice(0,state.memories.length-12);
  // Bound living political attention. Persist named memories; prune only neutral ties.
  const keys=Object.keys(state.opinions);
  if(keys.length>20){
    const removable=keys.filter(id=>!state.memories.some(m=>m.otherId===id))
      .sort((a,b)=>Math.abs(state.opinions[a])-Math.abs(state.opinions[b])||a.localeCompare(b));
    for(const id of removable.slice(0,keys.length-20))delete state.opinions[id];
  }
  return amount;
}
const claimFor=(world,p)=>world.titles.filter(t=>t.holderId!==p.id&&
  t.claims.some(c=>c.personId===p.id)).sort((a,b)=>(rank[b.rank]||0)-(rank[a.rank]||0)||ordered(a,b));
function directLiege(world,person){
  const held=titlesOf(world,person.id).sort((a,b)=>(rank[b.rank]||0)-(rank[a.rank]||0));
  if(!held.length)return null;
  const parent=world.titles.find(t=>t.id===held[0].liegeId);
  return parent?findPerson(world,parent.holderId):null;
}
export function chooseGoal(world,person){
  if(world.experiment?.goals===false)return person.politics.goal;
  if(!person.alive)return person.politics.goal;
  const t=person.politics.traits,held=titlesOf(world,person.id);
  const disputed=claimFor(world,person);
  let kind='secure-house',targetId=null,titleId=null;
  if(disputed.length && t.ambition>=48) {
    kind='secure-claim';titleId=disputed[0].id;targetId=findPerson(world,disputed[0].holderId)?.id??null;
  } else if(held.length && directLiege(world,person) && (t.loyalty<44||opinion(world,person.id,directLiege(world,person).id)<-25)){
    kind='political-leverage';targetId=directLiege(world,person).id;
  } else if(!held.length && (t.ambition>=61||person.parentIds.some(id=>id&&titlesOf(world,id).length))){
    kind='gain-land';
  } else if(held.length && t.loyalty>=62) {
    kind='stabilize-realm';
  } else if(!person.spouseId && world.year-person.birthYear>=18)kind='seek-marriage';
  else kind='secure-house';
  const old=person.politics.goal;
  if(old.kind!==kind||old.targetId!==targetId||old.titleId!==titleId){
    person.politics.goal={kind,targetId,titleId,since:world.year};
    recordEvent(world,'goal-changed','reassessed-political-interest',{
      personId:person.id,previous:old.kind,goal:kind,targetId,titleId
    });
  }
  return person.politics.goal;
}
function cooldown(world,person,kind,span){
  const last=person.politics.lastActions[kind];
  return last===undefined||world.year-last>=span;
}
function candidate(world,actor,kind,targetId,titleId,score,reasons=[],meta={}){
  return {kind,actorId:actor.id,targetId:targetId??null,titleId:titleId??null,
    score:Math.round(score),reasons,meta};
}
const validMarriage=(w,a,b)=>{
  if(!adult(w,a)||!adult(w,b)||a.spouseId||b.spouseId||a.sex===b.sex||
    Math.abs(a.birthYear-b.birthYear)>18)return false;
  const aa=ancestors(w,a.id,2),bb=ancestors(w,b.id,2);
  return !aa.has(b.id)&&!bb.has(a.id)&&![...aa].some(id=>bb.has(id));
};
function factionEligible(w,f,p){
  return adult(w,p)&&p.id!==w.titles.find(t=>t.id===f.titleId)?.holderId&&
    !f.members.includes(p.id)&&!w.politics.factions.some(g=>g.members.includes(p.id))&&
    (power(w,p.id)>0 || claimFor(w,p).some(t=>t.id===f.titleId));
}
export function possibleActions(world,personId){
  const p=findPerson(world,personId);
  if(!adult(world,p))return [];
  const traits=p.politics.traits,goal=p.politics.goal,held=titlesOf(world,p.id);
  const actions=[],politics=world.politics;
  const named=(key,value)=>key+'='+value;
  if(!p.spouseId && cooldown(world,p,'marriage',2) && world.year-p.birthYear<=53) {
    const targets=world.people.filter(q=>validMarriage(world,p,q)&&
      (titlesOf(world,q.id).length||q.parentIds.some(id=>id&&titlesOf(world,id).length)))
      .sort((a,b)=>((a.dynastyId===p.dynastyId?1:0)-(b.dynastyId===p.dynastyId?1:0))||
        opinion(world,p.id,b.id)-opinion(world,p.id,a.id)||ordered(a,b)).slice(0,4);
    for(const target of targets){
      const acceptance=45+Math.floor(target.politics.traits.diplomacy/8)+
        Math.floor(target.politics.traits.loyalty/9)+opinion(world,target.id,p.id)/3;
      if(acceptance<48)continue;
      actions.push(candidate(world,p,'marriage',target.id,null,
        35+traits.diplomacy/4+traits.ambition/8+(goal.kind==='seek-marriage'?22:0)+
        (p.dynastyId===target.dynastyId?-12:8),
        ['unmarried','dynastic-link',named('partner-consent',Math.floor(acceptance))]));
    }
  }
  if(cooldown(world,p,'gift',6)&&p.treasury.coin>=14) {
    const other=world.people.filter(q=>q.alive&&q.id!==p.id&&
      (power(world,q.id)>0||q.id===p.spouseId)).sort((a,b)=>{
        const va=(a.id===goal.targetId?12:0)+
          (a.id===directLiege(world,p)?.id?6:0)-opinion(world,p.id,a.id)/5;
        const vb=(b.id===goal.targetId?12:0)+
          (b.id===directLiege(world,p)?.id?6:0)-opinion(world,p.id,b.id)/5;
        return vb-va||ordered(a,b);
      })[0];
    if(other && other.treasury.coin<1_000_000){
      const amount=Math.min(12,Math.max(5,Math.floor(p.treasury.coin/5)));
      actions.push(candidate(world,p,'gift',other.id,null,
        29+traits.diplomacy/4+traits.loyalty/7-traits.ambition/8+
        (goal.targetId===other.id?15:0)+Math.max(0,-opinion(world,p.id,other.id))/3,
        ['gift-affordable','improve-relationship'],{amount}));
    }
  }
  if(cooldown(world,p,'grant',7) && held.filter(t=>t.rank==='county').length>=2){
    const recipients=world.people.filter(q=>adult(world,q)&&q.id!==p.id &&
      q.dynastyId===p.dynastyId&&power(world,q.id)===0&&
      (q.parentIds.includes(p.id)||q.parentIds.some(id=>p.parentIds.includes(id)&&id)))
      .sort((a,b)=>b.politics.traits.loyalty-a.politics.traits.loyalty||ordered(a,b));
    if(recipients.length){
      const county=held.filter(t=>t.rank==='county').sort(ordered).at(-1);
      actions.push(candidate(world,p,'grant',recipients[0].id,county.id,
        34+traits.loyalty/3-traits.ambition/6+
        (goal.kind==='stabilize-realm'?14:0),['family-appanage','spare-county']));
    }
  }
  const contested=claimFor(world,p);
  if(contested.length && cooldown(world,p,'petition',7)) {
    const title=contested[0],owner=findPerson(world,title.holderId);
    const liegeTitle=world.titles.find(t=>t.id===title.liegeId);
    if(owner && (owner.id===directLiege(world,p)?.id ||
      (liegeTitle && liegeTitle.holderId===owner.id))){
      actions.push(candidate(world,p,'petition',owner.id,title.id,
        39+traits.ambition/2-traits.caution/5+(goal.kind==='secure-claim'?12:0),
        ['documented-claim','feudal-petition']));
    }
  }
  const membersOf=politics.factions.find(f=>f.members.includes(p.id));
  if(!membersOf && cooldown(world,p,'faction',8)){
    const claim=contested.find(t=>t.rank!=='county'||power(world,p.id)>0);
    if(claim && traits.ambition>=42){
      actions.push(candidate(world,p,'faction',claim.holderId,claim.id,
        31+traits.ambition/2-traits.caution/3+(goal.kind==='secure-claim'?12:0),
        ['living-claimant','political-opposition'],{claimantId:p.id}));
    }
  }
  for(const f of politics.factions){
    if(factionEligible(world,f,p)&&cooldown(world,p,'join',5)){
      const opponent=findPerson(world,world.titles.find(t=>t.id===f.titleId).holderId);
      const affinity=opinion(world,p.id,f.claimantId);
      const anger=opponent?-opinion(world,p.id,opponent.id):0;
      actions.push(candidate(world,p,'join',f.leaderId,f.titleId,
        25+traits.ambition/3+(100-traits.loyalty)/6-traits.caution/7+
        affinity/3+anger/4+(goal.kind==='political-leverage'?11:0),
        ['active-faction','political-affinity'],{factionId:f.id}));
    }
    if(f.leaderId===p.id&&cooldown(world,p,'ultimatum',4) &&
      world.year-f.createdYear>=1&&f.members.length>=2){
      const ruler=findPerson(world,world.titles.find(t=>t.id===f.titleId)?.holderId);
      const membersPower=f.members.reduce((s,id)=>s+power(world,id),0);
      const ownerPower=ruler?power(world,ruler.id):0;
      if(ruler?.alive&&f.claimantId!==ruler.id&&isAlive(world,f.claimantId)){
        actions.push(candidate(world,p,'ultimatum',ruler.id,f.titleId,
          35+traits.ambition/2-traits.caution/5+
          Math.min(30,membersPower*6)+(goal.kind==='secure-claim'?12:0),
          ['coalition',named('pledged-power',membersPower),named('ruler-power',ownerPower)],
          {factionId:f.id,power:membersPower}));
      }
    }
  }
  return actions.sort((a,b)=>b.score-a.score||a.kind.localeCompare(b.kind)||String(a.targetId).localeCompare(String(b.targetId)));
}
function retireFaction(w,f,reason){
  w.politics.factions=w.politics.factions.filter(o=>o.id!==f.id);
  recordEvent(w,'faction-ended',reason,{factionId:f.id,titleId:f.titleId,claimantId:f.claimantId});
}
function cleanFactions(w){
  for(const f of [...w.politics.factions]){
    const title=w.titles.find(t=>t.id===f.titleId);
    const claimant=findPerson(w,f.claimantId);
    const leader=findPerson(w,f.leaderId);
    if(!title||!claimant?.alive||title.holderId===claimant.id||w.year-f.createdYear>=18) {
      retireFaction(w,f,'coalition-expired-or-demand-met');continue;
    }
    f.members=f.members.filter(id=>adult(w,findPerson(w,id)));
    if(!f.members.length){retireFaction(w,f,'no-living-backers');continue;}
    if(!leader?.alive||!f.members.includes(f.leaderId)) f.leaderId=f.members[0];
  }
}
function execute(w,a){
  const actor=findPerson(w,a.actorId),target=findPerson(w,a.targetId);
  if(!actor?.alive)return null;
  const cause='political:'+a.kind+':'+actor.id;
  let outcome={kind:a.kind,actorId:actor.id,targetId:a.targetId,titleId:a.titleId,success:false};
  if(a.kind==='marriage'){
    if(!validMarriage(w,actor,target))return null;
    marry(w,{personAId:actor.id,personBId:target.id,cause:'politically-consented-marriage:'+actor.id});
    remember(w,{witnessId:actor.id,otherId:target.id,kind:'marriage',weight:20,cause});
    remember(w,{witnessId:target.id,otherId:actor.id,kind:'marriage',weight:20,cause});
    outcome.success=true;w.politics.stats.marriages++;
  } else if(a.kind==='gift') {
    const amount=Math.min(a.meta.amount,actor.treasury.coin);
    if(!target?.alive||amount<5)return null;
    transfer(w,{good:'coin',from:'person:'+actor.id,to:'person:'+target.id,amount,cause:'diplomatic-gift:'+actor.id});
    remember(w,{witnessId:target.id,otherId:actor.id,kind:'favor',weight:18,cause});
    remember(w,{witnessId:actor.id,otherId:target.id,kind:'favor',weight:8,cause});
    outcome={...outcome,success:true,amount};w.politics.stats.gifts++;
  } else if(a.kind==='grant'){
    const title=w.titles.find(t=>t.id===a.titleId);
    if(!title||title.holderId!==actor.id||!target?.alive||titlesOf(w,actor.id).filter(t=>t.rank==='county').length<2)return null;
    changeTitleHolder(w,{titleId:title.id,newHolderId:target.id,cause:'dynastic-appanage:'+actor.id});
    remember(w,{witnessId:target.id,otherId:actor.id,kind:'grant',weight:28,cause});
    outcome.success=true;w.politics.stats.grants++;
  } else if(a.kind==='petition'){
    const title=w.titles.find(t=>t.id===a.titleId);
    if(!title||!target?.alive||title.holderId!==target.id||!title.claims.some(c=>c.personId===actor.id))return null;
    const powerGap=power(w,target.id)-power(w,actor.id);
    const agree=(target.politics.traits.loyalty+target.politics.traits.caution+opinion(w,target.id,actor.id)) >
      125+15*Math.max(0,powerGap);
    if(agree){
      changeTitleHolder(w,{titleId:title.id,newHolderId:actor.id,cause:'granted-on-petition:'+actor.id});
      remember(w,{witnessId:actor.id,otherId:target.id,kind:'concession',weight:24,cause});
      outcome.success=true;w.politics.stats.concessions++;
    } else {
      remember(w,{witnessId:actor.id,otherId:target.id,kind:'grievance',weight:-19,cause});
      remember(w,{witnessId:target.id,otherId:actor.id,kind:'petition',weight:-6,cause});
      outcome.reason='claim-denied';w.politics.stats.refusals++;
    }
    w.politics.stats.petitions++;
  } else if(a.kind==='faction') {
    const title=w.titles.find(t=>t.id===a.titleId);
    if(!title||title.holderId===actor.id||!title.claims.some(c=>c.personId===actor.id)||
      w.politics.factions.some(f=>f.members.includes(actor.id)))return null;
    const id='fa-'+String(w.politics.nextFactionId++).padStart(3,'0');
    w.politics.factions.push({id,titleId:title.id,claimantId:actor.id,
      leaderId:actor.id,members:[actor.id],createdYear:w.year,refusals:0});
    recordEvent(w,'faction-founded',cause,{factionId:id,leaderId:actor.id,titleId:title.id,claimantId:actor.id});
    outcome={...outcome,success:true,factionId:id};
    w.politics.stats.coalitions++;
  } else if(a.kind==='join'){
    const f=w.politics.factions.find(f=>f.id===a.meta.factionId);
    if(!f||!factionEligible(w,f,actor))return null;
    f.members.push(actor.id);f.members.sort();
    remember(w,{witnessId:findPerson(w,f.claimantId).id,otherId:actor.id,
      kind:'faction',weight:14,cause});
    recordEvent(w,'faction-joined',cause,{factionId:f.id,memberId:actor.id});
    outcome={...outcome,success:true,factionId:f.id};w.politics.stats.joins++;
  } else if(a.kind==='ultimatum'){
    const f=w.politics.factions.find(f=>f.id===a.meta.factionId);
    const title=w.titles.find(t=>t.id===a.titleId);
    if(!f||!title||f.leaderId!==actor.id||f.members.length<2||
      !target?.alive||title.holderId!==target.id||!isAlive(w,f.claimantId))return null;
    const pledged=f.members.reduce((n,id)=>n+power(w,id),0);
    const ruler=power(w,target.id);
    // Political concession, not a simulated battle. Failure survives as grievance.
    const concede=pledged>=Math.max(3,ruler*.75) &&
      (target.politics.traits.caution+pledged*12+
        opinion(w,target.id,f.claimantId)/2 >= 85+target.politics.traits.ambition/2);
    if(concede){
      changeTitleHolder(w,{titleId:title.id,newHolderId:f.claimantId,cause:'coalition-settlement:'+f.id});
      for(const id of f.members)if(id!==target.id)
        remember(w,{witnessId:id,otherId:target.id,kind:'concession',weight:12,cause});
      outcome={...outcome,success:true,factionId:f.id,pledged,ruler};
      w.politics.stats.concessions++;
      retireFaction(w,f,'claimant-installed-by-negotiation');
    } else {
      f.refusals++;outcome={...outcome,reason:'ultimatum-rejected',factionId:f.id,pledged,ruler};
      for(const id of f.members)if(id!==target.id)
        remember(w,{witnessId:id,otherId:target.id,kind:'grievance',weight:-9,cause});
      w.politics.stats.refusals++;
    }
    w.politics.stats.ultimatums++;
  } else return null;
  actor.politics.lastActions[a.kind]=w.year;
  w.politics.stats.actions++;
  // The action explanation is inspectable and tied to concrete legal/resource deltas.
  recordEvent(w,'political-decision','agent-utility-choice',{
    actorId:actor.id,goal:actor.politics.goal.kind,kind:a.kind,
    score:a.score,reasons:a.reasons,traits:{...actor.politics.traits},
    outcome
  });
  return outcome;
}
export function politicalYear(world,{maxActions=12,excludeIds=[]}={}){
  if(!Number.isSafeInteger(maxActions)||maxActions<0||maxActions>48 || !Array.isArray(excludeIds))throw new RangeError('Invalid political action budget');
  cleanFactions(world);
  for(const person of world.people){
    if(!person.alive)continue;
    for(const id of Object.keys(person.politics.opinions)){
      const value=person.politics.opinions[id];
      person.politics.opinions[id]=Math.sign(value)*Math.max(0,Math.abs(value)-1);
      if(person.politics.opinions[id]===0&&!person.politics.memories.some(m=>m.otherId===id))delete person.politics.opinions[id];
    }
  }
  const excluded=new Set(excludeIds);
  const active=world.people.filter(p=>adult(world,p)&&!excluded.has(p.id)&&
    (titlesOf(world,p.id).length||p.parentIds.some(id=>id&&titlesOf(world,id).length)||
      claimFor(world,p).length)).sort(ordered);
  for(const person of active)chooseGoal(world,person);
  // At most one action per agent. Recompute before execution to avoid stale targets.
  const ranked=active.map(p=>possibleActions(world,p.id)[0]).filter(Boolean)
    .sort((a,b)=>b.score-a.score||a.actorId.localeCompare(b.actorId)||a.kind.localeCompare(b.kind));
  let executed=0;
  for(const action of ranked){
    if(executed>=maxActions)break;
    const current=possibleActions(world,action.actorId).find(a=>a.kind===action.kind&&
      a.targetId===action.targetId&&a.titleId===action.titleId&&
      (a.meta.factionId??null)===(action.meta.factionId??null));
    if(!current||current.score<48)continue;
    if(execute(world,current))executed++;
  }
  cleanFactions(world);
  return executed;
}

// Direct command API for tests and later player UI. Only actually available legal
// choices can be executed; the decision remains attributable in the world journal.
export function performPoliticalAction(world,{actorId,kind,targetId=null,titleId=null,factionId=null}={}){
  const actor=findPerson(world,actorId);
  if(!actor?.alive)throw new RangeError('Unknown or deceased actor');
  chooseGoal(world,actor);
  const action=possibleActions(world,actorId).find(a=>a.kind===kind&&
    a.targetId===targetId&&a.titleId===titleId&&
    (a.meta.factionId??null)===factionId);
  if(!action)throw new RangeError('Political action not available under world rules');
  const result=execute(world,action);
  if(!result)throw new Error('Candidate ceased to be legal');
  return result;
}
