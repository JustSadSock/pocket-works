import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { HERO_BY_ID, ROLE_ORDER } from './data.js';

installMobileRuntime();
export const STORAGE_KEY='pocket-works:rival-forge:v2';
const LEGACY_KEY='pocket-works:rival-forge:v1';
export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>[...r.querySelectorAll(s)];
export const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
export const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export const defaults={activeView:'builder',plannerMode:'party',partySize:2,team:['mister-fantastic','invisible-woman',null,null,null,null],locks:[true,true,false,false,false,false],loadoutChoices:{'mister-fantastic':'fantastic-amplifier','invisible-woman':'first-family'},prefs:{tiers:{},scores:{},confidence:{},notes:{},favorites:[]},savedTeams:[],sound:true,heroRole:'All',heroSearch:'',favoriteOnly:false,tierRole:'all',tierSort:'rating',linkType:'all',linkSearch:''};
function loadState(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_KEY)||'null');
    if(!raw)return structuredClone(defaults);
    const inferred=raw.plannerMode||(Number(raw.teamSize)===6&&raw.team?.filter(Boolean).length>2?'full':'party');
    const partySize=Math.max(1,Math.min(6,Number(raw.partySize)||Math.min(Number(raw.teamSize)||2,6)));
    return{...structuredClone(defaults),...raw,plannerMode:inferred==='full'?'full':'party',partySize,team:Array.from({length:6},(_,i)=>HERO_BY_ID[raw.team?.[i]]?raw.team[i]:null),locks:Array.from({length:6},(_,i)=>Boolean(raw.locks?.[i])),loadoutChoices:raw.loadoutChoices||{},prefs:{tiers:raw.prefs?.tiers||{},scores:raw.prefs?.scores||{},confidence:raw.prefs?.confidence||{},notes:raw.prefs?.notes||{},favorites:Array.isArray(raw.prefs?.favorites)?raw.prefs.favorites.filter(id=>HERO_BY_ID[id]):[]},savedTeams:Array.isArray(raw.savedTeams)?raw.savedTeams.slice(0,40):[]};
  }catch{return structuredClone(defaults);}
}
export const box={state:loadState(),activeSheet:null};
export const activeLimit=()=>box.state.plannerMode==='full'?6:box.state.partySize;
export const activeIds=()=>box.state.team.slice(0,activeLimit());
export const planOptions=()=>({mode:box.state.plannerMode,partySize:box.state.partySize,loadoutChoices:box.state.loadoutChoices});
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
