import { HERO_BY_ID } from './data.js';
import { LOADOUT_BY_ID } from './loadouts.js';
import { normalizeImported as normalizeBase } from './core.js';

const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
const context=raw=>({mode:['competitive','quick','custom'].includes(raw?.mode)?raw.mode:'competitive',mapId:String(raw?.mapId||'any').slice(0,60),side:['attack','defense','neutral'].includes(raw?.side)?raw.side:'neutral',intent:['aggressive','stable','experimental'].includes(raw?.intent)?raw.intent:'stable'});
const team=source=>Array.from({length:6},(_,index)=>HERO_BY_ID[source?.[index]]?source[index]:null);
const loadouts=source=>Object.fromEntries(Object.entries(source&&typeof source==='object'?source:{}).filter(([hero,id])=>HERO_BY_ID[hero]&&LOADOUT_BY_ID[id]?.hero===hero));
const assignments=(source,playerIds)=>Array.from({length:6},(_,index)=>playerIds.has(source?.[index])?source[index]:null);
const attachVariantContext=(normalized,raw)=>({...normalized,matchContext:context(raw?.matchContext),enemyTeam:team(raw?.enemyTeam)});

export function exportPayload(state){return{schema:'rival-forge/4',exportedAt:new Date().toISOString(),plannerMode:state.plannerMode,partySize:state.partySize,team:state.team,locks:state.locks,loadoutChoices:state.loadoutChoices,prefs:state.prefs,players:state.players,playerAssignments:state.playerAssignments,variants:state.variants,matchContext:state.matchContext,enemyTeam:state.enemyTeam,matchHistory:state.matchHistory,savedTeams:state.savedTeams};}
export function normalizeImported(payload){
  if(!payload||!['rival-forge/1','rival-forge/2','rival-forge/3','rival-forge/4'].includes(payload.schema))throw new Error('Неподдерживаемый файл');
  const base=normalizeBase(payload.schema==='rival-forge/4'?{...payload,schema:'rival-forge/3'}:payload),players=base.players||[],playerIds=new Set(players.map(player=>player.id));
  const variants=(base.variants||[]).map((item,index)=>attachVariantContext(item,payload.variants?.[index]));
  const savedTeams=(base.savedTeams||[]).map((item,index)=>{const raw=payload.savedTeams?.[index];return{...attachVariantContext(item,raw),variants:(item.variants||[]).map((variant,variantIndex)=>attachVariantContext(variant,raw?.variants?.[variantIndex]))};});
  const matchHistory=(Array.isArray(payload.matchHistory)?payload.matchHistory:[]).slice(0,160).map((raw,index)=>({id:String(raw?.id||`match-${index}`).slice(0,70),playedAt:Number(raw?.playedAt)||Date.now(),result:['win','loss','draw'].includes(raw?.result)?raw.result:'loss',mode:['competitive','quick','custom'].includes(raw?.mode)?raw.mode:'competitive',mapId:String(raw?.mapId||'any').slice(0,60),side:['attack','defense','neutral'].includes(raw?.side)?raw.side:'neutral',intent:['aggressive','stable','experimental'].includes(raw?.intent)?raw.intent:'stable',team:team(raw?.team),playerAssignments:assignments(raw?.playerAssignments,playerIds),loadoutChoices:loadouts(raw?.loadoutChoices),enemyTeam:team(raw?.enemyTeam),comfort:clamp(raw?.comfort,1,5),missing:String(raw?.missing||'').slice(0,120),notes:String(raw?.notes||'').slice(0,500)}));
  return{...base,variants,savedTeams,matchContext:context(payload.matchContext),enemyTeam:team(payload.enemyTeam),matchHistory};
}
