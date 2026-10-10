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

function province(){
 const p=PROVINCES.find(p=>p.id===chosen),d=state.provinces.find(x=>x.id===chosen);
 return `<div class="section-rule"><b>Ⅱ · ВЛАДЕНИЯ КОРОНЫ</b><span>ПРИКАЗЫ И ПОДАТИ</span></div>
 <div class="province-heading"><div class="roman-number">${String(PROVINCES.indexOf(p)+1).padStart(2,'0')}</div><div><small>${p.kind} · ${p.resource}</small><h2>${p.name}</h2></div><span class="region-flower">✥</span></div>
 <div class="measures"><div>ВЕРНОСТЬ<strong>${d.loyalty}</strong></div><div>СМУТА<strong class="${d.unrest>55?'red':''}">${d.unrest}</strong></div><div>ДОСТАТОК<strong>${d.wealth}</strong></div><div>СТЕНЫ<strong>${d.fort}/5</strong></div></div>
 <div class="subrule">УКАЗЫ В ${p.name.toUpperCase()} <small>1 ПЕЧАТЬ</small></div>
 ${EDICTS.map(d=>`<button class="edict" data-edict="${d.id}"><span class="edict-symbol">✣</span><div><strong>${d.name}</strong><p>${d.detail}</p></div><span>${d.tag}</span></button>`).join('')}`;
}
function diplomacy(){
 return `<div class="section-rule"><b>Ⅲ · ВНЕШНИЕ ДВОРЫ</b><span>ПОСОЛЬСКАЯ ПАЛАТА</span></div>
 <p class="intro-note">Отношения ниже −55 грозят нападением. Укрепления и численность дружины определяют исход набега.</p>
 ${DIPLOMACY.map(d=>{const value=state.diplomacy[d.id];return `<article class="foreign">
 <div class="foreign-header"><span class="foreign-icon">${d.id==='sea'?'≋':d.id==='west'?'✥':'✦'}</span><div><small>${d.motto}</small><strong>${d.name}</strong></div><b class="${value<0?'red':''}">${value>0?'+':''}${value}</b></div>
 <div class="relation"><i style="width:${(value+100)/2}%"></i></div>
 <div class="foreign-actions"><button data-foreign="${d.id}" data-kind="envoy">Посольство <small>−8</small></button><button data-foreign="${d.id}" data-kind="tribute">Дары <small>−18</small></button><button data-foreign="${d.id}" data-kind="threat">Угроза</button></div></article>`;}).join('')}`;
}
function chronicle(){
 return `<div class="section-rule"><b>Ⅳ · ЛЕТОПИСЬ</b><span>${state.log.length} ЗАПИСЕЙ</span></div>
 <div class="annals">${state.log.map(n=>`<article class="annal ${n.type}"><small>ЛЕТО ${1348+Math.floor((n.turn-1)/4)} · ${['I','II','III','IV'][(n.turn-1)%4]}</small><p>${safe(n.text)}</p></article>`).join('')}</div>`;
}
const pane=()=>page==='province'?province():page==='diplomacy'?diplomacy():page==='chronicle'?chronicle():council();
function popup(){
 if(modal==='start')return `<div class="veil"><section class="dialog start" role="dialog" aria-modal="true"><div class="initial-mark">✣</div><small class="eyebrow">ДОКТРИНА · КНИГА ПЕРВАЯ</small><h1>Семь земель.<br><em>Одна печать.</em></h1>
 <p>1348 год. Прежняя держава распалась. Выберите основу новой власти и удержите престол двадцать четыре сезона.</p>
 <div class="charters">
 <button data-start="crown"><b>01 <span>Корона Ардена</span></b><small>Сбалансированная власть, казна и войско.</small><em>ЗНАТЬ · ПРЕСТОЛ</em></button>
 <button data-start="league"><b>02 <span>Союз Семи Градов</span></b><small>Торговля и богатые города, но слабый центр.</small><em>ГИЛЬДИИ · СЕРЕБРО</em></button>
 <button data-start="abbey"><b>03 <span>Священная марка</span></b><small>Сильное духовенство и полные житницы, мало воинов.</small><em>ВЕРА · ХЛЕБ</em></button></div><a class="exit-link" href="../../">← В POCKET WORKS</a>
 </section></div>`;
 if(modal==='petition'||state.petition){const e=PETITIONS[state.petition?.id];if(!e)return '';
 return `<div class="veil"><section class="dialog petition" role="dialog" aria-modal="true"><small class="eyebrow">ПРОШЕНИЕ ВЕЛИКОМУ СОВЕТУ</small><span class="wax">✣</span><h2>${e.title}</h2><p>${e.body}</p>
 <button class="dialog-action primary" data-petition="0"><b>ПОДПИСАТЬ</b><span>${e.a.name}</span></button>
 <button class="dialog-action" data-petition="1"><b>ОТКАЗАТЬ</b><span>${e.b.name}</span></button>
 <small class="dialog-foot">Выбор навсегда войдёт в летопись правления.</small></section></div>`;}
 if(modal==='end')return `<div class="veil"><section class="dialog ending" role="dialog" aria-modal="true"><small class="eyebrow">ПОСЛЕДНЯЯ СТРАНИЦА</small><div class="end-score">${scoreState(state)}</div><h2>Правление окончено</h2><p>${state.summary}</p><button class="dialog-action primary" data-close>ЧИТАТЬ ЛЕТОПИСЬ</button><button class="dialog-action" data-reset>НОВАЯ ДИНАСТИЯ</button></section></div>`;
 if(modal==='reset')return `<div class="veil"><section class="dialog" role="dialog" aria-modal="true"><small class="eyebrow">СЛОМАТЬ ПЕЧАТЬ</small><h2>Начать заново?</h2><p>Нынешняя кампания будет заменена. Архив старой ДОКТРИНЫ 0.1 не удаляется.</p><button class="dialog-action primary" data-confirm-reset>НОВАЯ КАМПАНИЯ</button><button class="dialog-action" data-close>ОТМЕНА</button></section></div>`;
 if(modal==='help')return `<div class="veil"><section class="dialog" role="dialog" aria-modal="true"><small class="eyebrow">ПОСОБИЕ ПРАВИТЕЛЯ</small><h2>Две печати на сезон</h2><p>Нажимайте на землю, чтобы издать местный указ. В Совете принимайте законы, а во внешних дворах отправляйте посольства. Каждое действие расходует одну печать.</p><p>Завершите сезон, чтобы получить доход, содержать войско и узнать об угрозах. Следите за хлебом, легитимностью, смутой, поддержкой сословий и летописью решений.</p><button class="dialog-action primary" data-close>ПОНЯТНО</button></section></div>`;
 if(modal==='settings')return `<div class="veil"><section class="dialog" role="dialog" aria-modal="true"><small class="eyebrow">ПАЛАТА ПИСЦА</small><h2>Настройки</h2><button class="dialog-action" data-sound>${state.flags?.sound===false?'ВКЛЮЧИТЬ ЗВУК':'ВЫКЛЮЧИТЬ ЗВУК'}</button><button class="dialog-action" data-help>ПРАВИЛА ИГРЫ</button><button class="dialog-action" data-reset>НОВАЯ КАМПАНИЯ</button><button class="dialog-action primary" data-close>К КАРТЕ</button></section></div>`;
 return '';
}

function render(){
 const scroll=root.querySelector('#pane-scroll')?.scrollTop||0;
 const ld=(name,value,alert=false)=>`<div class="ledger-cell ${alert?'bad':''}"><small>${name}</small><strong>${value}</strong></div>`;
 root.innerHTML=`<main class="doctrina-shell">
 <header class="mast"><a class="back" href="../../" aria-label="Pocket Works">‹</a><span class="brand-seal">D</span><div class="mast-copy"><small>ДОКТРИНА Ⅱ · ГОСУДАРСТВЕННЫЙ АТЛАС</small><strong>${governmentName(state)}</strong></div><button class="settings" data-settings aria-label="Настройки">☷</button></header>
 <div class="ledger">${ld('СЕРЕБРО',state.treasury,state.treasury<22)}${ld('ЗЕРНО',state.grain,state.grain<24)}${ld('ЗАКОННОСТЬ',state.legitimacy+'%',state.legitimacy<30)}${ld('ВОЙСКО',state.army)}</div>
 <section class="atlas"><div class="atlas-top"><span>АТЛАС ВЛАДЕНИЙ <small>• ${date().toUpperCase()}</small></span><button data-help aria-label="Правила игры">?</button></div><div class="map-container">${map()}</div>
 <div class="atlas-key"><span><i></i> КОРОННЫЕ ЗЕМЛИ</span><span><i class="danger"></i> СМУТА</span><span>7 ОБЛАСТЕЙ</span></div></section>
 <section class="desk"><nav class="tab-bar" aria-label="Управление государством">
 ${[['council','Ⅰ','СОВЕТ'],['province','Ⅱ','ЗЕМЛИ'],['diplomacy','Ⅲ','ДВОРЫ'],['chronicle','Ⅳ','ЛЕТОПИСЬ']].map(item=>`<button data-tab="${item[0]}" class="${page===item[0]?'on':''}"><span>${item[1]}</span>${item[2]}</button>`).join('')}</nav>
 <div class="pane-scroll" id="pane-scroll">${pane()}</div>
 <footer class="desk-footer"><div class="seals"><small>ПЕЧАТИ</small><span>${[0,1].map(i=>`<i class="${i<state.ap?'ready':''}">✣</i>`).join('')}</span></div><button class="advance" data-next ${state.phase==='finished'?'disabled':''}>${state.phase==='finished'?'ПРАВЛЕНИЕ ОКОНЧЕНО':'ЗАВЕРШИТЬ СЕЗОН'} <b>→</b></button></footer>
 </section><div role="status" class="toast ${notice?'show':''}">${safe(notice)}</div>${popup()}</main>`;
 const box=root.querySelector('#pane-scroll');if(box)box.scrollTop=scroll;
 window.__AI_TEST_STATE__={app:'doctrina',version:'2.0.0',turn:state.turn,phase:state.phase,selected:chosen,tab:page,treasury:state.treasury,grain:state.grain,ap:state.ap,petition:!!state.petition,score:scoreState(state),laws:state.laws.length};
}
root.addEventListener('click',event=>{
 const t=event.target.closest('[data-start],[data-region],[data-tab],[data-law],[data-edict],[data-foreign],[data-petition],[data-next],[data-settings],[data-sound],[data-help],[data-close],[data-reset],[data-confirm-reset]');
 if(!t)return;
 if(t.dataset.start){state=newGame(t.dataset.start,Date.now());chosen='capital';page='council';modal=null;save();ping();render();notify('Власть учреждена. Подпишите первый указ.');return;}
 if(t.dataset.region){chosen=t.dataset.region;page='province';ping(260);render();return;}
 if(t.dataset.tab){page=t.dataset.tab;ping(290);render();return;}
 if(t.dataset.law){act(enactLaw(state,t.dataset.law));return;}
 if(t.dataset.edict){act(enactEdict(state,chosen,t.dataset.edict));return;}
 if(t.dataset.foreign){act(foreignAction(state,t.dataset.foreign,t.dataset.kind));return;}
 if(t.hasAttribute('data-petition')){const result=choosePetition(state,Number(t.dataset.petition));modal=null;act(result);return;}
 if(t.hasAttribute('data-next')){act(endTurn(state));return;}
 if(t.hasAttribute('data-settings'))modal='settings';
 else if(t.hasAttribute('data-sound')){state.flags ||= {};state.flags.sound=!state.flags.sound;save();}
 else if(t.hasAttribute('data-help'))modal='help';
 else if(t.hasAttribute('data-reset'))modal='reset';
 else if(t.hasAttribute('data-confirm-reset')){try{localStorage.removeItem(SAVE_KEY);}catch{}state=newGame('crown',1348);page='council';chosen='capital';modal='start';notice='';}
 else if(t.hasAttribute('data-close'))modal=null;
 render();
});
root.addEventListener('keydown',event=>{
 const r=event.target.closest('[data-region]');
 if(r&&(event.key==='Enter'||event.key===' ')){event.preventDefault();r.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
 if(event.key==='Escape'&&modal&&modal!=='start'&&!state.petition){modal=null;render();}
});
window.addEventListener('pagehide',()=>{if(modal!=='start')save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&modal!=='start')save();});
render();
