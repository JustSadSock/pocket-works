// A player-run chronicle over the existing world. No invented conquest or narrative RNG.
// Campaign data is kept outside world to preserve the audited schema-4 simulation.
import {createWorld, stepYear, assertWorld, performPoliticalAction, possibleActions, chooseGoal, serializeWorld, loadWorld, recordEvent, remember} from './world.js';
import {conflictChoices,performConflictAction} from './conflicts.js';

export const CAMPAIGN_SCHEMA=1;
export const COUNTY_STARTS=['co-01','co-02','co-03'];
export const CHAPTER_END=1156;
const rank={kingdom:9,duchy:4,county:1};
const person=(w,id)=>w.people.find(p=>p.id===id)||null;
const title=(w,id)=>w.titles.find(t=>t.id===id)||null;
const held=(w,id)=>w.titles.filter(t=>t.holderId===id);
const dignity=(w,id)=>held(w,id).reduce((sum,t)=>sum+(rank[t.rank]||0),0);
const directFamily=(w,id)=>w.people.filter(p=>p.parentIds.includes(id));
function houseMembers(g){return g.world.people.filter(p=>p.alive&&p.dynastyId===g.dynastyId);}
function ancestryDistance(w,ancestorId,descendantId){
  if(ancestorId===descendantId)return 0;
  let pool=[ancestorId],visited=new Set(pool);
  for(let gen=1;gen<10&&pool.length;gen++){
    const next=[];
    for(const id of pool)for(const child of directFamily(w,id))
      if(!visited.has(child.id)){
        if(child.id===descendantId)return gen;
        visited.add(child.id);next.push(child.id);
      }
    pool=next;
  }
  return Infinity;
}
function chooseSuccessor(game,deadId){
  const w=game.world;
  const candidates=houseMembers(game);
  // Prefer a living direct descendant, then a landed house member with the
  // greatest hereditary dignity, then any remaining house member.
  candidates.sort((a,b)=>{
    const da=ancestryDistance(w,deadId,a.id),db=ancestryDistance(w,deadId,b.id);
    const ar=Number.isFinite(da)?0:1,br=Number.isFinite(db)?0:1;
    return ar-br || (ar===0?da-db:0) ||
      dignity(w,b.id)-dignity(w,a.id) ||
      a.birthYear-b.birthYear || a.id.localeCompare(b.id);
  });
  return candidates[0]??null;
}
export function assertCampaign(g){
  if(!g||g.schemaVersion!==CAMPAIGN_SCHEMA||!g.world||
    !COUNTY_STARTS.includes(g.startCountyId)||!Number.isSafeInteger(g.seed)||
    g.seed<0||g.seed>0xffffffff||!Number.isSafeInteger(g.goalYear)||
    g.goalYear<=1066||!Number.isSafeInteger(g.turns)||g.turns<0||
    !Number.isSafeInteger(g.actions)||g.actions<0||
    (g.lastActionYear!==null && (!Number.isSafeInteger(g.lastActionYear) || g.lastActionYear>g.world.year))||
    typeof g.dynastyId!=='string'||typeof g.playerId!=='string'||
    typeof g.founderId!=='string'||typeof g.finished!=='boolean')
    throw new Error('Invalid Venets campaign');
  assertWorld(g.world);
  if(!g.world.people.some(p=>p.id===g.founderId&&p.dynastyId===g.dynastyId) ||
    !g.world.people.some(p=>p.id===g.playerId&&p.dynastyId===g.dynastyId)||
    g.turns!==g.world.year-1066||g.actions>g.turns+1)
    throw new Error('Campaign history mismatch');
  return true;
}
export function campaignStarts(seed=413){
  return COUNTY_STARTS.map(id=>{
    const w=createWorld(seed),t=title(w,id),p=person(w,t.holderId);
    const duke=title(w,t.liegeId);
    return {countyId:id,name:t.name,personId:p.id,personName:p.name,dynastyId:p.dynastyId,
      duke:duke.name,realm:duke.holderId,traits:{...p.politics.traits}};
  });
}
export function startCampaign({seed=413,countyId='co-01'}={}){
  if(!COUNTY_STARTS.includes(countyId))throw new RangeError('Invalid initial county');
  const world=createWorld(seed);
  const county=title(world,countyId),founder=person(world,county.holderId);
  const liege=title(world,county.liegeId),ruler=person(world,liege.holderId);
  // Documentary conflict provides legal leverage at the first turn, and is
  // explicitly part of the generated campaign, not a hidden narrative stub.
  if(!liege.claims.some(c=>c.personId===founder.id)){
    liege.claims.push({personId:founder.id,origin:'passed-over',sourceId:ruler.id,year:world.year});
    recordEvent(world,'claim-founded','disputed-ducal-charter',{titleId:liege.id,personId:founder.id,sourceId:ruler.id});
  }
  if(!county.claims.some(c=>c.personId===ruler.id)){
    county.claims.push({personId:ruler.id,origin:'passed-over',sourceId:founder.id,year:world.year});
    recordEvent(world,'claim-founded','contested-comital-charter',{titleId:county.id,personId:ruler.id,sourceId:founder.id});
  }
  founder.politics.traits.ambition=Math.max(68,founder.politics.traits.ambition);
  remember(world,{witnessId:founder.id,otherId:ruler.id,kind:'grievance',weight:-16,cause:'disputed-charter'});
  remember(world,{witnessId:ruler.id,otherId:founder.id,kind:'grievance',weight:-12,cause:'disputed-charter'});
  recordEvent(world,'campaign-founded','contested-ducal-rights',{
    founderId:founder.id,countyId,duchyId:liege.id,rivalId:ruler.id
  });
  const g={schemaVersion:CAMPAIGN_SCHEMA,world,seed,startCountyId:countyId,
    founderId:founder.id,dynastyId:founder.dynastyId,playerId:founder.id,
    goalYear:CHAPTER_END,lastActionYear:null,turns:0,actions:0,
    successionCount:0,finished:false,chapterComplete:false,
    history:[{year:world.year,kind:'founding',personId:founder.id,
      detail:'Основание дома в '+county.name}]};
  assertCampaign(g);
  return g;
}
export function campaignChoices(g){
  assertCampaign(g);
  if(g.finished||g.chapterComplete||g.lastActionYear===g.world.year)return [];
  const actor=g.world.people.find(p=>p.id===g.playerId);
  if(actor?.alive)chooseGoal(g.world,actor);
  return [...possibleActions(g.world,g.playerId),...conflictChoices(g.world,g.playerId)]
    .sort((a,b)=>b.score-a.score||a.kind.localeCompare(b.kind));
}
export function campaignAction(g,choice){
  assertCampaign(g);
  if(g.finished||g.chapterComplete||g.lastActionYear===g.world.year)
    throw new RangeError('This year is already settled');
  if(!choice||!['marriage','gift','grant','petition','faction','join','ultimatum',
    'war','peace','blackmail','assassinate','contract'].includes(choice.kind))
    throw new RangeError('Unknown campaign action');
  const newKind=['war','peace','blackmail','assassinate','contract'].includes(choice.kind);
  const result=newKind?performConflictAction(g.world,{
    actorId:g.playerId,kind:choice.kind,targetId:choice.targetId??null,titleId:choice.titleId??null
  }):performPoliticalAction(g.world,{
    actorId:g.playerId,kind:choice.kind,targetId:choice.targetId??null,
    titleId:choice.titleId??null,factionId:choice.meta?.factionId??null
  });
  g.lastActionYear=g.world.year;
  g.actions++;
  g.history.push({year:g.world.year,kind:'choice',personId:g.playerId,
    detail:choice.kind,success:result.success});
  assertCampaign(g);
  return result;
}
export function campaignYear(g){
  assertCampaign(g);
  if(g.finished||g.chapterComplete)throw new RangeError('Chapter has ended');
  const oldYear=g.world.year,oldPlayer=g.playerId,firstEvent=g.world.events.length;
  stepYear(g.world,{excludePlayerId:oldPlayer});
  g.turns++;
  let succession=null;
  if(!person(g.world,oldPlayer)?.alive){
    const successor=chooseSuccessor(g,oldPlayer);
    if(successor){
      g.playerId=successor.id;g.successionCount++;
      succession={fromId:oldPlayer,toId:successor.id,name:successor.name};
      g.history.push({year:g.world.year,kind:'succession',personId:successor.id,
        detail:person(g.world,oldPlayer).name+' → '+successor.name});
    }else{
      g.finished=true;
      g.history.push({year:g.world.year,kind:'extinction',personId:oldPlayer,
        detail:'Не осталось живых представителей дома'});
    }
  }
  if(g.world.year>=g.goalYear){
    g.chapterComplete=true;
    g.history.push({year:g.world.year,kind:'chapter',personId:g.playerId,
      detail:'Завершена первая хроника династии'});
  }
  const events=g.world.events.slice(firstEvent);
  const playerTitles=held(g.world,g.playerId);
  const changed=events.filter(e=>e.kind==='title-transfer'&&
    (e.effect.oldHolderId===oldPlayer||e.effect.newHolderId===g.playerId||
      e.effect.oldHolderId===g.playerId));
  const changes=events.filter(e=>['death','realm-partition','political-decision','war-year','war-peace','scheme-ended',
    'claim-founded','inheritance','faction-founded','faction-ended'].includes(e.kind));
  const significant=Boolean(succession||changed.length||g.chapterComplete||g.finished||
    events.some(e=>['war-peace','scheme-ended'].includes(e.kind)&&
      (e.effect.attackerId===oldPlayer||e.effect.actorId===oldPlayer)));
  assertCampaign(g);
  return {fromYear:oldYear,year:g.world.year,succession,significant,
    relevant:changed,highlights:changes.slice(-6),titles:playerTitles.map(t=>t.id),
    finished:g.finished,chapterComplete:g.chapterComplete};
}
export function extendCampaign(g){
  assertCampaign(g);
  if(!g.chapterComplete||g.finished)throw new RangeError('No completed chapter to extend');
  g.goalYear+=50;
  g.chapterComplete=false;
  g.history.push({year:g.world.year,kind:'continuation',personId:g.playerId,
    detail:'Хроника продолжается'});
  return g;
}
export function campaignScore(g){
  assertCampaign(g);
  const dynastyTitles=g.world.titles.filter(t=>person(g.world,t.holderId)?.dynastyId===g.dynastyId);
  return {year:g.world.year,generations:g.successionCount+1,
    titles:dynastyTitles.length,duchies:dynastyTitles.filter(t=>t.rank==='duchy').length,
    crown:dynastyTitles.some(t=>t.rank==='kingdom'),
    family:g.world.people.filter(p=>p.alive&&p.dynastyId===g.dynastyId).length,
    decisions:g.actions,politicalActions:g.world.politics.stats.actions,
    importantClaims:g.world.titles.filter(t=>t.claims.some(c=>person(g.world,c.personId)?.dynastyId===g.dynastyId)).length};
}
export function serializeCampaign(g){
  assertCampaign(g);
  return JSON.stringify(g);
}
export function loadCampaign(json){
  if(typeof json!=='string'||json.length>35_000_000)throw new RangeError('Invalid campaign save');
  const g=JSON.parse(json);
  // Old campaigns are not invented; only new v0.5 campaign snapshots are valid.
  g.world=loadWorld(JSON.stringify(g.world));
  assertCampaign(g);
  return g;
}
