import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { HERO_BY_ID, ROLE_ORDER } from './data.js';

installMobileRuntime();
export const STORAGE_KEY='pocket-works:rival-forge:v4';
const LEGACY_KEYS=['pocket-works:rival-forge:v3','pocket-works:rival-forge:v2','pocket-works:rival-forge:v1'];
export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>[...r.querySelectorAll(s)];
export const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
export const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

const DEFAULT_PLAYERS=[
  {id:'ilya',name:'Илья',color:'#9d65ff',primaryRole:'Duelist',backupRole:'Vanguard',style:'aggressive',heroSkill:{'mister-fantastic':88,'peni-parker':82,'magneto':76},blocked:[]},
  {id:'yasya',name:'Яся',color:'#2dbf9f',primaryRole:'Strategist',backupRole:'Duelist',style:'supportive',heroSkill:{'invisible-woman':92},blocked:[]}
];
const DEFAULT_CONTEXT={mode:'competitive',mapId:'any',side:'neutral',intent:'stable'};
export const defaults={activeView:'builder',plannerMode:'party',partySize:2,team:['mister-fantastic','invisible-woman',null,null,null,null],locks:[true,true,false,false,false,false],loadoutChoices:{'mister-fantastic':'fantastic-amplifier','invisible-woman':'first-family'},prefs:{tiers:{},scores:{},confidence:{},notes:{},favorites:[]},players:structuredClone(DEFAULT_PLAYERS),playerAssignments:['ilya','yasya',null,null,null,null],variants:[],recommendationSlot:1,matchContext:structuredClone(DEFAULT_CONTEXT),enemyTeam:[null,null,null,null,null,null],matchHistory:[],savedTeams:[],sound:true,heroRole:'All',heroSearch:'',favoriteOnly:false,tierRole:'all',tierSort:'rating',linkType:'all',linkSearch:''};

const validRole=value=>ROLE_ORDER.includes(value)?value:'Duelist';
const validStyle=value=>['aggressive','supportive','tactical','mobile','steady'].includes(value)?value:'steady';
const validContext=raw=>({mode:['competitive','quick','custom'].includes(raw?.mode)?raw.mode:'competitive',mapId:String(raw?.mapId||'any').slice(0,60),side:['attack','defense','neutral'].includes(raw?.side)?raw.side:'neutral',intent:['aggressive','stable','experimental'].includes(raw?.intent)?raw.intent:'stable'});
function cleanPlayers(source){
  const seen=new Set();
  const list=(Array.isArray(source)?source:[]).slice(0,8).map((raw,index)=>{
    let id=String(raw?.id||`player-${index+1}`).replace(/[^a-z0-9_-]/gi,'').slice(0,40)||`player-${index+1}`;
    while(seen.has(id))id=`${id}-${index+1}`;seen.add(id);
    const heroSkill=Object.fromEntries(Object.entries(raw?.heroSkill&&typeof raw.heroSkill==='object'?raw.heroSkill:{}).filter(([hero])=>HERO_BY_ID[hero]).map(([hero,value])=>[hero,clamp(value)]));
    const blocked=Array.isArray(raw?.blocked)?[...new Set(raw.blocked.filter(hero=>HERO_BY_ID[hero]))]:[];
    return{id,name:String(raw?.name||`Игрок ${index+1}`).trim().slice(0,32)||`Игрок ${index+1}`,color:/^#[0-9a-f]{6}$/i.test(raw?.color||'')?raw.color:['#9d65ff','#2dbf9f','#ff6b4a','#f2bd31','#77a9ff','#ff4f8b'][index%6],primaryRole:validRole(raw?.primaryRole),backupRole:validRole(raw?.backupRole),style:validStyle(raw?.style),heroSkill,blocked};
  });
  return list.length?list:structuredClone(DEFAULT_PLAYERS);
}
const cleanTeam=source=>Array.from({length:6},(_,i)=>HERO_BY_ID[source?.[i]]?source[i]:null);
const cleanAssignments=(source,players)=>{const ids=new Set(players.map(player=>player.id));return Array.from({length:6},(_,i)=>ids.has(source?.[i])?source[i]:null);};
const cleanEnemy=source=>cleanTeam(source);
function cleanHistory(source,players){
  const ids=new Set(players.map(player=>player.id));
  return(Array.isArray(source)?source:[]).slice(0,160).map((raw,index)=>({id:String(raw?.id||`match-${index}`).slice(0,70),playedAt:Number(raw?.playedAt)||Date.now(),result:['win','loss','draw'].includes(raw?.result)?raw.result:'loss',mode:['competitive','quick','custom'].includes(raw?.mode)?raw.mode:'competitive',mapId:String(raw?.mapId||'any').slice(0,60),side:['attack','defense','neutral'].includes(raw?.side)?raw.side:'neutral',intent:['aggressive','stable','experimental'].includes(raw?.intent)?raw.intent:'stable',team:cleanTeam(raw?.team),playerAssignments:Array.from({length:6},(_,i)=>ids.has(raw?.playerAssignments?.[i])?raw.playerAssignments[i]:null),loadoutChoices:raw?.loadoutChoices&&typeof raw.loadoutChoices==='object'?raw.loadoutChoices:{},enemyTeam:cleanEnemy(raw?.enemyTeam),comfort:clamp(raw?.comfort,1,5),missing:String(raw?.missing||'').slice(0,120),notes:String(raw?.notes||'').slice(0,500)}));
}
function cleanVariants(source,players){
  return(Array.isArray(source)?source:[]).slice(0,16).map((raw,index)=>({id:String(raw?.id||`variant-${index}`).slice(0,60),name:String(raw?.name||`Вариант ${index+1}`).trim().slice(0,50),team:cleanTeam(raw?.team),locks:Array.from({length:6},(_,i)=>Boolean(raw?.locks?.[i])),playerAssignments:cleanAssignments(raw?.playerAssignments,players),loadoutChoices:raw?.loadoutChoices&&typeof raw.loadoutChoices==='object'?raw.loadoutChoices:{},matchContext:validContext(raw?.matchContext),enemyTeam:cleanEnemy(raw?.enemyTeam),score:clamp(raw?.score),updated:Number(raw?.updated)||Date.now()}));
}
function loadState(){
  try{
    let stored=localStorage.getItem(STORAGE_KEY);if(!stored)for(const key of LEGACY_KEYS){stored=localStorage.getItem(key);if(stored)break;}
    const raw=JSON.parse(stored||'null');if(!raw)return structuredClone(defaults);
    const inferred=raw.plannerMode||(Number(raw.teamSize)===6&&raw.team?.filter(Boolean).length>2?'full':'party');
    const partySize=Math.max(1,Math.min(6,Number(raw.partySize)||Math.min(Number(raw.teamSize)||2,6)));
    const players=cleanPlayers(raw.players),playerIds=new Set(players.map(player=>player.id));
    const assignments=Array.from({length:6},(_,i)=>playerIds.has(raw.playerAssignments?.[i])?raw.playerAssignments[i]:(i<players.length?players[i].id:null));
    return{...structuredClone(defaults),...raw,plannerMode:inferred==='full'?'full':'party',partySize,team:cleanTeam(raw.team),locks:Array.from({length:6},(_,i)=>Boolean(raw.locks?.[i])),loadoutChoices:raw.loadoutChoices||{},prefs:{tiers:raw.prefs?.tiers||{},scores:raw.prefs?.scores||{},confidence:raw.prefs?.confidence||{},notes:raw.prefs?.notes||{},favorites:Array.isArray(raw.prefs?.favorites)?raw.prefs.favorites.filter(id=>HERO_BY_ID[id]):[]},players,playerAssignments:assignments,variants:cleanVariants(raw.variants,players),recommendationSlot:Math.max(0,Math.min(5,Number(raw.recommendationSlot)||0)),matchContext:validContext(raw.matchContext),enemyTeam:cleanEnemy(raw.enemyTeam),matchHistory:cleanHistory(raw.matchHistory,players),savedTeams:Array.isArray(raw.savedTeams)?raw.savedTeams.slice(0,40):[]};
  }catch{return structuredClone(defaults);}
}
export const box={state:loadState(),activeSheet:null};
export const activeLimit=()=>box.state.plannerMode==='full'?6:box.state.partySize;
export const activeIds=()=>box.state.team.slice(0,activeLimit());
export const playerById=id=>box.state.players.find(player=>player.id===id)||null;
export const assignedPlayer=index=>playerById(box.state.playerAssignments[index]);
export const targetSlot=()=>{const limit=activeLimit(),preferred=Math.max(0,Math.min(limit-1,Number(box.state.recommendationSlot)||0));if(!box.state.team[preferred])return preferred;const empty=box.state.team.slice(0,limit).findIndex(id=>!id);if(empty>=0)return empty;const unlocked=box.state.locks.slice(0,limit).findIndex(value=>!value);return unlocked>=0?unlocked:preferred;};
export const planOptions=()=>({mode:box.state.plannerMode,partySize:box.state.partySize,loadoutChoices:box.state.loadoutChoices,players:box.state.players,playerAssignments:box.state.playerAssignments,matchContext:box.state.matchContext,enemyTeam:box.state.enemyTeam,matchHistory:box.state.matchHistory});
export function replaceState(next){box.state=next;}
export function saveState(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(box.state));}catch(error){toast(`Не удалось сохранить: ${error.message}`,'bad');}}
export function haptic(pattern=8){navigator.vibrate?.(pattern);}
let toastTimer=0,audioContext=null;
export function clickSound(tone='tap'){if(!box.state.sound)return;try{audioContext||=new(window.AudioContext||window.webkitAudioContext)();const o=audioContext.createOscillator(),g=audioContext.createGain(),now=audioContext.currentTime;o.type=tone==='good'?'sine':tone==='bad'?'sawtooth':'triangle';o.frequency.setValueAtTime(tone==='good'?520:tone==='bad'?110:250,now);o.frequency.exponentialRampToValueAtTime(tone==='good'?760:tone==='bad'?72:310,now+.07);g.gain.setValueAtTime(.035,now);g.gain.exponentialRampToValueAtTime(.0001,now+.09);o.connect(g).connect(audioContext.destination);o.start(now);o.stop(now+.1);}catch{}}
export function toast(message,tone=''){const node=$('#toast');node.textContent=message;node.className=`toast show ${tone}`.trim();clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.className='toast',2200);}
function initials(name){return name.split(/\s+/).map(w=>w[0]).join('').slice(0,3).toUpperCase();}
function fallbackPortrait(hero){const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#f3efe4"/><path d="M0 300 150 80l80 130L400 20v380H0Z" fill="${hero.color}" opacity=".72"/><circle cx="200" cy="170" r="92" fill="#141518" opacity=".14"/><text x="200" y="220" text-anchor="middle" font-family="system-ui" font-size="100" font-weight="900" fill="#141518">${esc(initials(hero.name))}</text></svg>`;return`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;}
export function portrait(hero,className='',extra=''){return`<img class="${className}" src="${hero.portrait}" alt="${esc(hero.name)}" data-hero-image="${hero.id}" ${extra}>`;}
export function wireImageFallbacks(root=document){$$('img[data-hero-image]',root).forEach(image=>{if(image.dataset.fallbackBound)return;image.dataset.fallbackBound='1';image.addEventListener('error',()=>{if(image.dataset.fallbackApplied)return;image.dataset.fallbackApplied='1';image.src=fallbackPortrait(HERO_BY_ID[image.dataset.heroImage]);});});}
export function roleLabel(hero){return hero.role==='Flex'?hero.roles.join(' · '):hero.role;}
export function roleTabs(active,dataset='role'){return['All',...ROLE_ORDER].map(role=>`<button class="${active===role?'active':''}" data-${dataset}="${role}">${role==='All'?'Все':role}</button>`).join('');}
export function openSheet(id){closeSheet(false);const sheet=$(`#${id}`);if(!sheet)return;box.activeSheet=id;sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');$('#scrim').classList.add('open');document.body.classList.add('sheet-open');}
export function closeSheet(sound=true){if(!box.activeSheet)return;const sheet=$(`#${box.activeSheet}`);sheet?.classList.remove('open');sheet?.setAttribute('aria-hidden','true');$('#scrim').classList.remove('open');document.body.classList.remove('sheet-open');box.activeSheet=null;if(sound)clickSound();}
export function setView(view,persist=true){if(!['builder','heroes','tiers','links'].includes(view))view='builder';box.state.activeView=view;$$('.view').forEach(node=>node.classList.toggle('active',node.dataset.view===view));$$('.bottom-nav button').forEach(button=>button.classList.toggle('active',button.dataset.nav===view));if(persist)saveState();window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
