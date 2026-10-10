import {PROVINCES,FACTIONS,EDICTS,LAWS,DIPLOMACY,PETITIONS,newGame,validState,governmentName,enactEdict,enactLaw,foreignAction,choosePetition,endTurn,scoreState,warnings} from './core-v2.js';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
installMobileRuntime();
const SAVE_KEY='pocket-works:doctrina:atlas:v2';
const root=document.getElementById('app');
const safe=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function restore(){try{const v=JSON.parse(localStorage.getItem(SAVE_KEY));return validState(v)?v:null;}catch{return null;}}
const saved=restore();
let state=saved||newGame('crown',1348),chosen='capital',page='council',modal=saved?(state.phase==='finished'?'end':null):'start',notice='',soundContext;
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{notify('Не удалось сохранить — хранилище заполнено.');}}
function notify(message){notice=message;const el=document.querySelector('.toast');if(el){el.textContent=message;el.classList.add('show');}}
function ping(f=420){if(state.flags?.sound===false)return;try{const Audio=window.AudioContext||window.webkitAudioContext;soundContext ||=new Audio();const o=soundContext.createOscillator(),g=soundContext.createGain();o.type='triangle';o.frequency.value=f;g.gain.value=.035;g.gain.exponentialRampToValueAtTime(.0001,soundContext.currentTime+.13);o.connect(g);g.connect(soundContext.destination);o.start();o.stop(soundContext.currentTime+.14);}catch{}}
function act(result){if(!result.ok){ping(170);notify(result.message);return;}ping(420);save();if(state.phase==='finished')modal='end';else if(state.petition)modal='petition';render();notify(result.message);}
const date=()=>['Весна','Лето','Осень','Зима'][(state.turn-1)%4]+' '+(1348+Math.floor((state.turn-1)/4));

function map(){
 const regions=PROVINCES.map((p,i)=>{
  const d=state.provinces[i],risk=d.unrest>58?'risk':'',active=p.id===chosen?'active':'';
  return `<g tabindex="0" role="button" aria-label="${safe(p.name)}. Верность ${d.loyalty}, смута ${d.unrest}" data-region="${p.id}" class="region ${risk} ${active}">
   <path d="${p.path}" /><circle class="town" cx="${p.x}" cy="${p.y-12}" r="${p.id==='capital'?7:4}"/>
   <text x="${p.x}" y="${p.y+8}" class="place" text-anchor="middle">${p.short}</text>
   ${d.unrest>58?`<circle class="alarm-dot" cx="${p.x+20}" cy="${p.y-15}" r="6"/><text class="alarm-letter" x="${p.x+20}" y="${p.y-12}" text-anchor="middle">!</text>`:''}
  </g>`;
 }).join('');
 return `<svg viewBox="0 0 400 426" class="land-map" role="group" aria-label="Политическая карта семи земель">
 <defs><pattern id="hatch" width="13" height="13" patternUnits="userSpaceOnUse"><path d="M0 13 L13 0" stroke="#76664b" stroke-width=".5" opacity=".12"/></pattern></defs>
 <path class="map-leaf" d="M8 16 Q190 -3 386 10 L394 407 Q192 430 7 408Z"/>
 <path class="map-grid" d="M40 0V426 M100 0V426 M160 0V426 M220 0V426 M280 0V426 M340 0V426 M0 60H400 M0 120H400 M0 180H400 M0 240H400 M0 300H400 M0 360H400"/>
 ${regions}
 <g class="rivers"><path d="M212 -6 C239 52 241 115 214 161 S246 270 276 327 S306 391 331 443"/><path d="M214 161 C171 175 155 232 135 274"/></g>
 <g class="routes"><path d="M134 76 Q169 135 221 214 Q248 265 279 327"/><path d="M84 180 Q150 231 221 214 T329 193"/><path d="M118 325 Q163 289 221 214 Q252 169 249 105"/></g>
 <path class="mountain" d="M13 256 l12 -18 12 18 m-7 12 l14 -21 12 18 M62 356 l11 -16 11 16 m4 9 l13 -19 13 18 M335 66 l10 -19 13 21"/>
 <text class="map-foot" x="18" y="405">TABULA SEPTEM TERRARUM • MCCCXLVIII</text>
 <g class="compass" transform="translate(353 389)"><circle r="19"/><path d="M0 -27 L5 -5 0 -12 -5 -5Z M0 27 L5 5 0 12 -5 5Z M-27 0 L-5 -5 -12 0 -5 5Z M27 0 L5 -5 12 0 5 5Z"/><text x="0" y="-31" text-anchor="middle">N</text></g>
 <path d="M8 16 Q190 -3 386 10 L394 407 Q192 430 7 408Z" fill="url(#hatch)" pointer-events="none"/>
 </svg>`;
}
function factions(){return FACTIONS.map(f=>{const v=state.factions[f.id];return `<div class="faction"><span class="emblem">${f.sign}</span><div class="faction-label">${f.name}<small>${f.aim}</small></div><div class="meter"><i style="width:${v}%"></i></div><b class="${v<30?'red':''}">${v}</b></div>`;}).join('');}
function council(){
 const alert=warnings(state);
 return `<div class="section-rule"><b>Ⅰ · ВЕЛИКИЙ СОВЕТ</b><span>ГОСУДАРСТВЕННЫЕ ДЕЛА</span></div>
 <div class="political-summary"><div><small>СОСТОЯНИЕ ДЕРЖАВЫ</small><strong>${state.stability>70?'Прочный порядок':state.stability>40?'Хрупкое равновесие':'Государство на грани'}</strong></div><div class="rating">${scoreState(state)}</div></div>
 ${alert.length?`<div class="dispatches">${alert.map(a=>`<p><span>!</span> ${safe(a)}</p>`).join('')}</div>`:`<p class="quiet">На столе нет срочных донесений.</p>`}
 <div class="subrule">ВЛИЯНИЕ СОСЛОВИЙ <small>ПОДДЕРЖКА / 100</small></div>${factions()}
 <div class="subrule">ГОСУДАРСТВЕННЫЕ ГРАМОТЫ <small>${state.laws.length} ИЗ ${LAWS.length}</small></div>
 ${LAWS.map(l=>{const active=state.laws.includes(l.id),need=l.requires.find(k=>!state.laws.includes(k));
 return `<button class="law ${active?'adopted':''}" data-law="${l.id}" ${active?'disabled':''}>
 <div><strong>${l.name}</strong><p>${l.desc}</p><small>${l.effects}</small>${need?`<small class="red">Необходим закон «${LAWS.find(x=>x.id===need).name}»</small>`:''}</div>
 <span>${active?'ПРИНЯТ':'−'+l.cost+' ✣'}</span></button>`;}).join('')}`;
}
