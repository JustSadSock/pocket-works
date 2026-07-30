import { HEROES, HERO_BY_ID, TEAM_UPS, ROLE_TARGETS, TIERS } from './data.js';
import { LOADOUTS_BY_HERO, LOADOUT_BY_ID } from './loadouts.js';

const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number(n)||0));
const tierWeight={'S+':12,S:9,A:5,B:0,C:-5,D:-10};
const roleIndex={Vanguard:0,Duelist:1,Strategist:2};
const roles=['Vanguard','Duelist','Strategist'];

export function heroRating(hero,prefs={}){
  const tier=prefs.tiers?.[hero.id]||hero.tier;
  const personal=prefs.scores?.[hero.id]??hero.power;
  const confidence=prefs.confidence?.[hero.id]??50;
  const favorite=prefs.favorites?.includes(hero.id)?4:0;
  return clamp(hero.power*.42+personal*.43+confidence*.11+(tierWeight[tier]||0)+favorite,0,110);
}
export function roleCounts(ids){
  const counts={Vanguard:0,Duelist:0,Strategist:0,Flex:0};
  for(const id of ids.filter(Boolean)){const hero=HERO_BY_ID[id];if(!hero)continue;if(hero.role==='Flex')counts.Flex++;else counts[hero.role]++;}
  return counts;
}
export function allocateFlex(counts,size=6){
  const out={...counts};const target=ROLE_TARGETS[Math.max(1,Math.min(6,size))]||ROLE_TARGETS[6];
  for(let i=0;i<counts.Flex;i++){const need=roles.map((role,index)=>({role,need:target[index]-out[role]})).sort((a,b)=>b.need-a.need)[0].role;out[need]++;}
  return out;
}
export function activeLinks(ids){const set=new Set(ids.filter(Boolean));return TEAM_UPS.filter(link=>link.members.every(id=>set.has(id)));}
export function teamTags(ids){const counts={};for(const id of ids.filter(Boolean))for(const tag of HERO_BY_ID[id]?.tags||[])counts[tag]=(counts[tag]||0)+1;return counts;}
const coverage=(tags,keys)=>clamp(keys.reduce((sum,key)=>sum+Math.min(2,tags[key]||0)*18,0));

export function recommendLoadouts(ids,choices={}){
  const picked=ids.filter(Boolean);const set=new Set(picked);const tags=teamTags(picked);
  const missing=new Set(['frontline','sustain','control','mobility','burst','poke'].filter(tag=>!tags[tag]));
  return picked.map(heroId=>{
    const options=(LOADOUTS_BY_HERO[heroId]||[]).map(option=>{
      const partnerPresent=set.has(option.partner);
      const partnerAvailable=Boolean(HERO_BY_ID[option.partner]);
      const missingHelp=option.tags.filter(tag=>missing.has(tag)).length*5;
      const styleFit=option.tags.reduce((sum,tag)=>sum+Math.min(2,tags[tag]||0)*2.5,0);
      const score=option.priority+(partnerPresent?30:0)+(partnerAvailable?0:-7)+missingHelp+styleFit;
      return{...option,partnerPresent,partnerAvailable,score};
    }).sort((a,b)=>b.score-a.score);
    const recommended=options[0]||null;
    const selected=options.find(option=>option.id===choices[heroId])||recommended;
    return{heroId,options,recommended,selected};
  });
}
function loadoutMetrics(ids,choices={}){
  const recs=recommendLoadouts(ids,choices);let score=0,enhanced=0;
  for(const item of recs){if(!item.selected)continue;score+=item.selected.score; if(item.selected.partnerPresent)enhanced++;}
  return{recommendations:recs,enhanced,score:recs.length?clamp(score/recs.length):0};
}

function fullAnalysis(ids,prefs={},choices={}){
  const picked=ids.filter(Boolean),size=Math.max(1,ids.length||6),counts=allocateFlex(roleCounts(picked),size),target=ROLE_TARGETS[size]||ROLE_TARGETS[6],tags=teamTags(picked),links=activeLinks(picked),loadouts=loadoutMetrics(picked,choices);
  const official=links.filter(x=>x.type==='official'),tactical=links.filter(x=>x.type==='tactical');
  const rating=picked.length?picked.reduce((sum,id)=>sum+heroRating(HERO_BY_ID[id],prefs),0)/picked.length:0;
  const roleDiff=Math.abs(counts.Vanguard-target[0])+Math.abs(counts.Duelist-target[1])+Math.abs(counts.Strategist-target[2]);
  const frontline=coverage(tags,['frontline','shield','brawl']);
  const sustain=coverage(tags,['sustain','burst-heal','save','self-sustain']);
  const pressure=coverage(tags,['burst','poke','pick','sustain-damage','anti-tank']);
  const control=coverage(tags,['control','area-control','disrupt','wall','setup']);
  const mobility=coverage(tags,['mobility','dive','flight','stealth']);
  const synergy=clamp(official.length*18+tactical.length*11+loadouts.enhanced*12+Math.min(16,Object.values(tags).filter(v=>v>=2).length*3));
  const balance=clamp(100-roleDiff*23-Math.max(0,target[2]-counts.Strategist)*12-Math.max(0,target[0]-counts.Vanguard)*8);
  const completeness=picked.length/size;
  const overall=clamp((rating*.29+balance*.22+synergy*.18+sustain*.08+frontline*.07+pressure*.07+control*.04+mobility*.03+loadouts.score*.02)*(.58+completeness*.42));
  const warnings=[];
  if(picked.length<size)warnings.push(`Открытых слотов: ${size-picked.length}`);
  if(counts.Strategist<target[2])warnings.push('мало лечения');
  if(counts.Vanguard<target[0])warnings.push('тонкий фронтлайн');
  if(!tags.control&&!tags['area-control'])warnings.push('мало контроля');
  if((tags.dive||0)>=3&&(tags.sustain||0)<1)warnings.push('dive без поддержки лечения');
  if((tags.poke||0)>=3&&(tags.frontline||0)<1)warnings.push('poke без пространства');
  return{mode:'full',counts,target,tags,links,official,tactical,rating,balance,synergy,frontline,sustain,pressure,control,mobility,overall,warnings,loadouts,randomSlots:0,requiredRoles:{Vanguard:0,Duelist:0,Strategist:0},flexibility:balance,unfixable:0};
}

export function partyRolePlan(ids,partySize=Math.min(6,ids.length||2)){
  const picked=ids.slice(0,partySize).filter(Boolean);const counts=allocateFlex(roleCounts(picked),6);const target=ROLE_TARGETS[6];
  const requiredRoles=Object.fromEntries(roles.map((role,index)=>[role,Math.max(0,target[index]-counts[role])]));
  const remaining=6-picked.length;const totalRequired=Object.values(requiredRoles).reduce((a,b)=>a+b,0);const unfixable=Math.max(0,totalRequired-remaining);
  const overages=roles.map((role,index)=>Math.max(0,counts[role]-target[index]));
  const flexibility=clamp(100-unfixable*34-overages.reduce((a,b)=>a+b,0)*12);
  return{picked,counts,target,requiredRoles,remaining,randomSlots:6-partySize,controlledOpen:Math.max(0,partySize-picked.length),unfixable,flexibility,feasible:unfixable===0};
}
function partyAnalysis(ids,prefs={},partySize=2,choices={}){
  const plan=partyRolePlan(ids,partySize),picked=plan.picked,tags=teamTags(picked),links=activeLinks(picked),loadouts=loadoutMetrics(picked,choices),rating=picked.length?picked.reduce((sum,id)=>sum+heroRating(HERO_BY_ID[id],prefs),0)/picked.length:0;
  const directSynergy=clamp(links.filter(x=>x.type==='tactical').length*20+links.filter(x=>x.type==='official').length*16+loadouts.enhanced*18+Object.values(tags).filter(v=>v>=2).length*4);
  const toolkit=clamp((coverage(tags,['sustain','save','self-sustain'])+coverage(tags,['control','area-control','disrupt'])+coverage(tags,['mobility','dive','flight'])+coverage(tags,['burst','poke','pick']))/4);
  const overall=clamp(rating*.36+plan.flexibility*.28+directSynergy*.22+toolkit*.10+loadouts.score*.04);
  const warnings=[];
  if(plan.unfixable)warnings.push(`оставшихся ${plan.remaining} мест уже не хватает исправить перекос ролей`);
  else if(picked.length) {
    const need=roles.filter(role=>plan.requiredRoles[role]).map(role=>`${plan.requiredRoles[role]} ${role}`).join(' · ');
    if(need)warnings.push(`остальной команде желательно закрыть: ${need}`);
  }
  if(picked.length<partySize)warnings.push(`в вашей пати свободно: ${partySize-picked.length}`);
  return{mode:'party',counts:plan.counts,target:plan.target,tags,links,official:links.filter(x=>x.type==='official'),tactical:links.filter(x=>x.type==='tactical'),rating,balance:plan.flexibility,synergy:directSynergy,frontline:coverage(tags,['frontline','shield','brawl']),sustain:coverage(tags,['sustain','burst-heal','save','self-sustain']),pressure:coverage(tags,['burst','poke','pick','sustain-damage','anti-tank']),control:coverage(tags,['control','area-control','disrupt','wall','setup']),mobility:coverage(tags,['mobility','dive','flight','stealth']),overall,warnings,loadouts,randomSlots:plan.randomSlots,requiredRoles:plan.requiredRoles,flexibility:plan.flexibility,unfixable:plan.unfixable,controlledOpen:plan.controlledOpen};
}
export function analyzeTeam(ids,prefs={},options={}){const mode=options.mode||'full';return mode==='party'?partyAnalysis(ids,prefs,options.partySize||2,options.loadoutChoices||{}):fullAnalysis(ids,prefs,options.loadoutChoices||{});}

function roleNeedScore(hero,ids,size,mode='full',partySize=size){
  if(mode==='party'){
    const before=partyRolePlan(ids,partySize),draft=[...ids];let slot=draft.slice(0,partySize).findIndex(id=>!id);if(slot<0)slot=Math.min(partySize-1,draft.length-1);draft[slot]=hero.id;const after=partyRolePlan(draft,partySize);return (after.flexibility-before.flexibility)*1.1+(after.unfixable? -30:8);
  }
  const counts=allocateFlex(roleCounts(ids),size),target=ROLE_TARGETS[size]||ROLE_TARGETS[6];if(hero.role==='Flex')return 14;const index=roleIndex[hero.role],current=counts[hero.role],need=target[index]-current;return need>0?24+need*6:current>target[index]?-14:2;
}
function diversityScore(hero,ids){const tags=teamTags(ids),strategic=['frontline','sustain','burst','poke','control','mobility','anti-dive','save'];let score=0;for(const tag of hero.tags){if(strategic.includes(tag)&&!tags[tag])score+=3.5;if(tags[tag]===1)score+=1.2;}return Math.min(16,score);}
function loadoutConnectionScore(heroId,ids){const set=new Set((Array.isArray(ids)?ids:[...ids]).filter(Boolean));let score=0,reasons=[];
  for(const option of LOADOUTS_BY_HERO[heroId]||[])if(set.has(option.partner)){score+=18;reasons.push(`усиливается с ${HERO_BY_ID[option.partner]?.name||option.partner}`);}
  for(const ally of set)for(const option of LOADOUTS_BY_HERO[ally]||[])if(option.partner===heroId){score+=20;reasons.push(`включает ${option.name} у ${HERO_BY_ID[ally].name}`);}
  return{score,reasons};
}
export function recommendHeroes(ids,prefs={},options={}){
  const {limit=8,size=ids.length||6,role=null,mode='full',partySize=size}=options,selected=new Set((mode==='party'?ids.slice(0,partySize):ids).filter(Boolean));
  return HEROES.filter(hero=>!selected.has(hero.id)&&(!role||hero.role===role||hero.role==='Flex')).map(hero=>{
    const links=TEAM_UPS.filter(link=>link.members.includes(hero.id)&&link.members.every(id=>id===hero.id||selected.has(id)));const official=links.filter(x=>x.type==='official').length,tactical=links.filter(x=>x.type==='tactical').length,reasons=[];
    const roleNeed=roleNeedScore(hero,ids,size,mode,partySize);if(mode==='full'&&roleNeed>=20)reasons.push(`закрывает роль ${hero.role}`);if(mode==='party'&&roleNeed>=5)reasons.push('сохраняет гибкость для случайных союзников');
    if(official)reasons.push(`${official} готовая Team-Up связка`);if(tactical)reasons.push(`${tactical} тактическая связка`);
    const loadout=loadoutConnectionScore(hero.id,selected);reasons.push(...loadout.reasons.slice(0,1));const diversity=diversityScore(hero,[...selected]);if(diversity>=7)reasons.push('добавляет недостающие инструменты');
    const score=heroRating(hero,prefs)+roleNeed+official*16+tactical*10+loadout.score+diversity;
    return{hero,score,links,reasons:reasons.slice(0,3)};
  }).sort((a,b)=>b.score-a.score||a.hero.order-b.hero.order).slice(0,limit);
}
export function autoComplete(ids,locks=[],prefs={},options={}){
  const result=Array.from({length:6},(_,i)=>ids[i]||null),limit=options.mode==='party'?(options.partySize||2):6;
  for(let i=0;i<limit;i++){if(result[i]||locks[i])continue;result[i]=recommendHeroes(result,prefs,{limit:1,size:6,mode:options.mode||'full',partySize:options.partySize||limit})[0]?.hero.id||null;}
  if(options.mode==='party')for(let i=limit;i<6;i++)result[i]=null;return result;
}
export function optimizeTeam(ids,locks=[],prefs={},options={}){
  const limit=options.mode==='party'?(options.partySize||2):6,result=Array.from({length:6},(_,i)=>i<limit&&locks[i]?ids[i]:null);
  for(let i=0;i<limit;i++){if(result[i])continue;result[i]=recommendHeroes(result,prefs,{limit:1,size:6,mode:options.mode||'full',partySize:options.partySize||limit})[0]?.hero.id||null;}
  return result;
}
export function tierGroups(prefs={}){const groups=Object.fromEntries(TIERS.map(tier=>[tier,[]]));for(const hero of HEROES)(groups[prefs.tiers?.[hero.id]||hero.tier]||=[]).push(hero);for(const tier of Object.keys(groups))groups[tier].sort((a,b)=>heroRating(b,prefs)-heroRating(a,prefs));return groups;}
export function exportPayload(state){return{schema:'rival-forge/2',exportedAt:new Date().toISOString(),plannerMode:state.plannerMode,partySize:state.partySize,team:state.team,locks:state.locks,loadoutChoices:state.loadoutChoices,prefs:state.prefs,savedTeams:state.savedTeams};}
export function normalizeImported(payload){
  if(!payload||!['rival-forge/1','rival-forge/2'].includes(payload.schema))throw new Error('Неподдерживаемый файл');
  const legacySize=Math.max(1,Math.min(6,Number(payload.teamSize)||6)),plannerMode=payload.schema==='rival-forge/2'&&payload.plannerMode==='party'?'party':'full',partySize=Math.max(1,Math.min(6,Number(payload.partySize)||(plannerMode==='party'?legacySize:2)));
  const team=Array.from({length:6},(_,i)=>HERO_BY_ID[payload.team?.[i]]?payload.team[i]:null),locks=Array.from({length:6},(_,i)=>Boolean(payload.locks?.[i]));
  const rawPrefs=payload.prefs&&typeof payload.prefs==='object'?payload.prefs:{};const validMap=(source,mapper=v=>v)=>Object.fromEntries(Object.entries(source&&typeof source==='object'?source:{}).filter(([id])=>HERO_BY_ID[id]).map(([id,value])=>[id,mapper(value)]));
  const prefs={tiers:Object.fromEntries(Object.entries(rawPrefs.tiers&&typeof rawPrefs.tiers==='object'?rawPrefs.tiers:{}).filter(([id,value])=>HERO_BY_ID[id]&&TIERS.includes(value))),scores:validMap(rawPrefs.scores,v=>clamp(v)),confidence:validMap(rawPrefs.confidence,v=>clamp(v)),notes:validMap(rawPrefs.notes,v=>String(v??'').slice(0,1200)),favorites:Array.isArray(rawPrefs.favorites)?[...new Set(rawPrefs.favorites.filter(id=>HERO_BY_ID[id]))]:[]};
  const loadoutChoices=Object.fromEntries(Object.entries(payload.loadoutChoices&&typeof payload.loadoutChoices==='object'?payload.loadoutChoices:{}).filter(([hero,id])=>HERO_BY_ID[hero]&&LOADOUT_BY_ID[id]?.hero===hero));
  const savedTeams=(Array.isArray(payload.savedTeams)?payload.savedTeams:[]).slice(0,40).map((saved,index)=>({id:String(saved?.id||`imported-${index}`),name:String(saved?.name||`Imported team ${index+1}`).slice(0,60),plannerMode:saved?.plannerMode==='party'?'party':'full',partySize:Math.max(1,Math.min(6,Number(saved?.partySize)||2)),team:Array.from({length:6},(_,i)=>HERO_BY_ID[saved?.team?.[i]]?saved.team[i]:null),locks:Array.from({length:6},(_,i)=>Boolean(saved?.locks?.[i])),loadoutChoices:Object.fromEntries(Object.entries(saved?.loadoutChoices||{}).filter(([hero,id])=>HERO_BY_ID[hero]&&LOADOUT_BY_ID[id]?.hero===hero)),score:clamp(saved?.score),updated:Number(saved?.updated)||Date.now()}));
  return{plannerMode,partySize,team,locks,loadoutChoices,prefs,savedTeams};
}
