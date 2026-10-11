import { createWorkshopMode } from '../../shared/workshop-mode.js';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {TINCTURES,DIVISIONS,CHARGES,HOUSES,REGIONS,CASES} from './data.js';
import {isValidArms,armsDescription,signature,shieldSvg} from './heraldry.js';
installMobileRuntime();
const $=id=>document.getElementById(id);
const KEY='pocket-works:gerbovnik:campaign:v1',V=1;
const CLAMP=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
const tabs={case:'caseView',book:'bookView',map:'mapView',forge:'forgeView',history:'historyView'};
const nums=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
let audio,toastHandle,lastClue=-1,draft;
function initial(){
 return {v:V,caseIndex:0,peace:66,law:55,favor:48,owners:REGIONS.map(x=>x.owner),houses:HOUSES.map(h=>({...h,arms:{...h.arms},prestige:10,loyalty:65})),chronicle:[],seen:[false,false],chosen:-1,selectedHouse:0,forgeHouse:0,selectedRegion:4,tab:'case',sound:false,grants:{},done:false,ending:null};
}
function load(){
 try{
  const v=JSON.parse(localStorage.getItem(KEY));
  if(!v||v.v!==V||!Number.isInteger(v.caseIndex)||v.caseIndex<0||v.caseIndex>CASES.length||!Number.isFinite(v.peace)||!Number.isFinite(v.law)||!Number.isFinite(v.favor)||!Array.isArray(v.owners)||v.owners.length!==REGIONS.length||!v.owners.every(n=>Number.isInteger(n)&&n>=0&&n<HOUSES.length)||!Array.isArray(v.houses)||v.houses.length!==HOUSES.length||!v.houses.every(h=>isValidArms(h?.arms).ok)||!Array.isArray(v.seen)||v.seen.length!==2||!Array.isArray(v.chronicle)||v.chronicle.length>200)return initial();
  return {...initial(),...v,peace:CLAMP(v.peace),law:CLAMP(v.law),favor:CLAMP(v.favor),chosen:Number.isInteger(v.chosen)&&v.chosen>=-1&&v.chosen<3?v.chosen:-1,selectedHouse:CLAMP(Math.floor(v.selectedHouse||0),0,9),forgeHouse:CLAMP(Math.floor(v.forgeHouse||0),0,9),selectedRegion:CLAMP(Math.floor(v.selectedRegion||0),0,9),tab:Object.hasOwn(tabs,v.tab)?v.tab:'case',grants:typeof v.grants==='object'&&v.grants?v.grants:{},done:!!v.done};
 }catch{return initial()}
}
let state=load();
function store(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{toast('Хранилище устройства недоступно — прогресс может не сохраниться.')}}
function sound(kind='tap'){
 if(!state.sound)return;
 try{
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  audio||=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});
  const t=audio.currentTime,osc=audio.createOscillator(),g=audio.createGain();
  osc.type=kind==='seal'?'triangle':'sine';
  osc.frequency.setValueAtTime(kind==='seal'?110:kind==='invalid'?175:490,t);
  osc.frequency.exponentialRampToValueAtTime(kind==='seal'?72:kind==='invalid'?121:315,t+(kind==='seal'?.23:.08));
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.045,t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+(kind==='seal'?.3:.13));
  osc.connect(g).connect(audio.destination);osc.start(t);osc.stop(t+(kind==='seal'?.31:.15));
 }catch{}
}
function toast(msg){const x=$('toast');x.textContent=msg;x.classList.add('visible');clearTimeout(toastHandle);toastHandle=setTimeout(()=>x.classList.remove('visible'),2800)}
function setTab(tab){
 if(!Object.hasOwn(tabs,tab))return;
 state.tab=tab;
 for(const [key,id] of Object.entries(tabs))$(id).hidden=key!==tab;
 document.querySelectorAll('[data-tab]').forEach(b=>{const yes=b.dataset.tab===tab;b.classList.toggle('active',yes);b.setAttribute('aria-current',yes?'page':'false')});
 $('yearLabel').textContent=state.done?'CHRONICA · FINIS':'ANNO DOMINI · '+CASES[state.caseIndex].year;
 $('caseCounter').textContent=state.done?'КНИГА ЗАКРЫТА':`ДЕЛО ${nums[state.caseIndex]} / XII`;
 store();
}
function percent(id,value){$(id).style.width=CLAMP(value)+'%'}
function renderStats(){
 $('peaceValue').textContent=state.peace;$('lawValue').textContent=state.law;
 percent('peaceFill',state.peace);percent('lawFill',state.law);$('favorValue').textContent=state.favor;percent('favorFill',state.favor);
}
function renderCase(){
 renderStats();const section=$('caseView');
 section.classList.toggle('completed',state.done);
 const ending=document.getElementById('endingPanel');if(ending)ending.remove();
 if(state.done){
  $('caseEyebrow').textContent='SIGILLVM FINALE';
  $('caseTitle').textContent=state.ending?.title||'Книга закрыта';
  $('caseStory').textContent=state.ending?.text||'Все решения внесены в реестр.';
  const p=document.createElement('div');p.id='endingPanel';p.className='ending-panel';
  p.innerHTML=`<span>FINIS CHRONICAE</span><p>Подтверждено грамот: ${state.chronicle.filter(x=>x.type==='case').length} из XII. Власть короны: ${state.favor}/100.</p><button id="endingChronicle" type="button">ПРОЧИТАТЬ ЛЕТОПИСЬ →</button><button id="endingReset" type="button">НОВАЯ ПАРТИЯ</button>`;
  section.append(p);
  return;
 }
 const c=CASES[state.caseIndex],a=state.houses[c.claimants[0]],b=state.houses[c.claimants[1]],owner=state.houses[state.owners[c.region]];
 $('caseEyebrow').textContent=c.latin;
 $('caseTitle').textContent=c.title;
 $('caseStory').textContent=c.story+` Сейчас владеет: ${owner.short.toLowerCase()}.`;
 $('claimantArmsA').innerHTML=shieldSvg(a.arms);$('claimantArmsB').innerHTML=shieldSvg(b.arms);
 $('claimantNameA').textContent=a.short;$('claimantNameB').textContent=b.short;
 $('claimantRoleA').textContent=c.roles[0];$('claimantRoleB').textContent=c.roles[1];
 $('provinceName').textContent=REGIONS[c.region].name.toUpperCase();
 for(let i=0;i<2;i++){
  $('clueTitle'+i).textContent=c.clues[i][0];
  $('clueMark'+i).textContent=state.seen[i]?'Прочитано':'Исследовать';
  document.querySelector('[data-clue="'+i+'"]').classList.toggle('inspected',!!state.seen[i]);
 }
 $('clueCount').textContent=state.seen.filter(Boolean).length+' / 2 УЛИКИ';
 $('clueBody').textContent=lastClue>=0&&state.seen[lastClue]?c.clues[lastClue][1]:state.seen.every(Boolean)?'Свидетельства изучены. Теперь выбери, чьё право ты признаешь.':'Изучи оба свидетельства, прежде чем вынести решение.';
 $('options').innerHTML=c.options.map((o,i)=>`<button type="button" class="verdict-option ${state.chosen===i?'chosen':''}" data-option="${i}" aria-pressed="${state.chosen===i}"><span class="vote-mark">${state.chosen===i?'✥':nums[i]}</span><span><strong>${o.label}</strong><small>${o.why}</small></span></button>`).join('');
 $('sealBtn').disabled=state.chosen<0;
 $('sealHint').textContent=state.chosen<0?'Выбери вердикт':state.seen.every(Boolean)?'Грамота готова к печати':'Не все улики изучены';
}
function renderBook(){
 $('houseList').innerHTML=state.houses.map((h,i)=>`<button type="button" class="house-tile ${i===state.selectedHouse?'selected':''}" data-house="${i}">${shieldSvg(h.arms)}<span><strong>${h.short}</strong><small>${state.owners.filter(x=>x===i).length} влад. · авторитет ${h.prestige}</small></span></button>`).join('');
 const h=state.houses[state.selectedHouse];$('houseDetail').innerHTML=`${shieldSvg(h.arms)}<div><small>DOMVS · ${String(state.selectedHouse+1).padStart(2,'0')}</small><h3>${h.name}</h3><p><em>«${h.motto}»</em></p><p>${h.description}</p><small>${armsDescription(h.arms)}</small></div><button type="button" data-edit="${state.selectedHouse}">ОТКРЫТЬ ЩИТ В МАСТЕРСКОЙ →</button>`;
}
function renderMap(){
 let base=`<defs><pattern id="mapsand" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M2 3h2M9 11h3" stroke="#9e9b7f" stroke-width=".8" opacity=".3"/></pattern><linearGradient id="water"><stop stop-color="#7c9d9c"/><stop offset="1" stop-color="#4f7887"/></linearGradient></defs><rect width="330" height="378" fill="#8c948c"/><rect width="330" height="378" fill="url(#mapsand)"/><path d="M7 0Q45 26 32 78T9 179T23 300T8 378" stroke="#4c7c81" stroke-width="15" fill="none" opacity=".6"/><path d="M312 4Q287 84 318 161T315 282T330 378" stroke="#598e8c" stroke-width="19" fill="none" opacity=".5"/>`;
 for(let i=0;i<REGIONS.length;i++){
  const r=REGIONS[i],h=state.houses[state.owners[i]],fill=TINCTURES[h.arms.field].hex,stroke=i===state.selectedRegion?'#fff2c7':'#ebd3a2';
  base+=`<path data-region="${i}" tabindex="0" role="button" aria-label="${r.name}, владение ${h.name}" d="${r.path}" fill="${fill}" fill-opacity=".91" style="stroke:${stroke};stroke-width:${i===state.selectedRegion?4:1.8}px"/><text x="${r.x}" y="${r.y}" text-anchor="middle">${h.short}</text>`;
 }
 base+=`<path d="M57 38 119 23 188 29 264 48 281 108 291 171 297 240 267 307 210 346 144 354 101 328 94 297 33 273 23 219 32 165 53 102Z" fill="none" stroke="#d8b98a" stroke-width="3"/><path d="M39 24v23m-11-11h22" stroke="#e6d7af" stroke-width="2"/><text x="33" y="21" font-size="12">N</text><text x="167" y="368" font-size="9" text-anchor="middle">REGNVM ELLARI · ANNO ${state.done?1309:CASES[state.caseIndex].year}</text>`;
 $('realmMap').innerHTML=base;
 const rg=REGIONS[state.selectedRegion];const holder=state.houses[state.owners[state.selectedRegion]];
 $('regionDetail').textContent=rg.name+' · '+holder.name+'. '+holder.description;
}
function renderHistory(){
 if(state.chronicle.length===0){$('historyList').innerHTML='<div class="history-empty">Пока нет ни одной скреплённой грамоты. Первое дело ждёт в королевской канцелярии.</div>';return}
 $('historyList').innerHTML=state.chronicle.slice().reverse().map(x=>`<article class="history-entry"><span>${x.year}</span><div><strong>${x.title}</strong><p>${x.text}</p></div></article>`).join('');
}
function editHouse(i){state.forgeHouse=i;draft={...state.houses[i].arms};setTab('forge');renderForge();$('forgeView').scrollTop=0}
function currentRule(){
 const rule=isValidArms(draft);
 if(!rule.ok)return rule;
 const duplicate=state.houses.some((h,i)=>i!==state.forgeHouse&&signature(h.arms)===signature(draft));
 return duplicate?{ok:false,reason:'Такой щит уже принадлежит другому роду.'}:rule;
}
function choices(container,items,selected,attr){
 $(container).innerHTML=items.map(([id,label])=>`<button type="button" data-editor="${attr}" data-value="${id}" class="${selected===id?'active':''}" aria-pressed="${selected===id}">${label}</button>`).join('');
}
function tones(container,selected,attr){
 $(container).innerHTML=Object.entries(TINCTURES).map(([id,t])=>`<button type="button" data-editor="${attr}" data-value="${id}" class="${selected===id?'active':''}" style="background:${t.hex}" aria-label="${t.name}" aria-pressed="${selected===id}"><span>${id==='argent'?'Ag':id==='or'?'Au':t.name.slice(0,3)}</span></button>`).join('');
}
function renderForge(){
 if(!draft)draft={...state.houses[state.forgeHouse].arms};
 $('houseSelect').innerHTML=state.houses.map((h,i)=>`<option value="${i}" ${i===state.forgeHouse?'selected':''}>${h.name}</option>`).join('');
 $('forgeShield').innerHTML=shieldSvg(draft);
 $('blazonText').textContent=armsDescription(draft);
 const rule=currentRule();
 $('armsRule').textContent=rule.ok?'✧ '+rule.reason:'⚠ '+rule.reason;
 $('armsRule').classList.toggle('bad',!rule.ok);
 choices('divisionPicker',Object.entries(DIVISIONS),draft.division,'division');
 choices('chargePicker',Object.entries(CHARGES),draft.charge,'charge');
 tones('fieldPicker',draft.field,'field');tones('chargeTonePicker',draft.chargeTone,'chargeTone');
 $('registerArms').disabled=!rule.ok||signature(state.houses[state.forgeHouse].arms)===signature(draft);
}
function render(){
 renderCase();renderBook();renderMap();renderHistory();renderForge();setTab(state.tab);
 $('soundBtn').innerHTML=state.sound?'♫<small>ON</small>':'♫<small>OFF</small>'; $('soundBtn').setAttribute('aria-label',state.sound?'Выключить звук':'Включить звук');
}
function selectOption(i){
 if(state.done)return;
 state.chosen=i;store();sound();renderCase();
}
function examine(i){
 if(state.done)return;
 const first=!state.seen[i];state.seen[i]=true;lastClue=i;
 store();sound(first?'seal':'tap');renderCase();
}
let onPrimary=null,onSecondary=null;
function modal({kicker,title,text,stats='',primary='ПРОДОЛЖИТЬ',secondary=null,action,other=null}){
 $('modalKicker').textContent=kicker;$('modalTitle').textContent=title;$('modalText').textContent=text;$('modalStats').textContent=stats;
 $('modalPrimary').textContent=primary;$('modalSecondary').hidden=!secondary;$('modalSecondary').textContent=secondary||'';
 onPrimary=action;onSecondary=other;$('modal').hidden=false;$('modalPrimary').focus();
}
function closeModal(){$('modal').hidden=true;onPrimary=null;onSecondary=null}
function confirmVerdict(){
 if(state.done||state.chosen<0)return;
 const c=CASES[state.caseIndex],o=c.options[state.chosen];
 const missing=state.seen.filter(x=>!x).length;
 sound();
 modal({kicker:'CARTA REGIA · ПОДТВЕРЖДЕНИЕ',title:'Скрепить королевской печатью?',text:`${o.label}. Земля: ${REGIONS[c.region].name}. ${missing?'Не все свидетельства изучены: поспешный суд снизит законность.':'Оба свидетельства занесены в дело.'}`,primary:'ДА, ПРИЛОЖИТЬ ПЕЧАТЬ',secondary:'ВЕРНУТЬСЯ К ДЕЛУ',action:resolveVerdict,other:closeModal});
}
function resultEnding(){
 if(state.peace<=13||state.law<=12)return {title:'Раскол королевства',text:'Вассалы отвергли реестр. Грамоты перестали защищать права, и Эллар раскололся на враждующие земли.'};
 if(state.favor>=75&&state.peace>=30&&state.law>=20)return {title:'Железная корона',text:'Земли покорны государю, но решение каждого нового спора зависит от королевской милости, а не от старого закона.'};
 if(state.favor<=22&&state.peace>=55&&state.law>=55)return {title:'Союз великих домов',text:'Сильные бароны защищают старые грамоты общим советом; королевская власть больше не правит единолично.'};
 if(state.peace>=72&&state.law>=72)return {title:'Век законных гербов',text:'Королевство вышло из смуты. Гербовник признан высшим свидетельством наследственного права.'};
 if(state.peace>=48&&state.law>=48)return {title:'Мир под старой печатью',text:'Королевство сохранилось, хотя многие бароны считают часть решений несправедливыми.'};
 return {title:'Хрупкая корона',text:'Королевство дожило до нового царствования, но каждую новую грамоту встречают подозрением.'};
}
function resolveVerdict(){
 if(state.done||state.chosen<0){closeModal();return}
 const c=CASES[state.caseIndex],o=c.options[state.chosen],awarded=state.houses[o.house],old=state.owners[c.region],year=c.year,missing=state.seen.filter(x=>!x).length,bonus=state.grants[state.caseIndex]===o.house?1:0;
 const beforePeace=state.peace,beforeLaw=state.law;
 state.owners[c.region]=o.house;
 state.peace=CLAMP(state.peace+o.law*2+o.peace+bonus-Math.max(0,missing));
 state.law=CLAMP(state.law+o.law*4+bonus-missing*3);
 state.favor=CLAMP(state.favor+o.crown);
 state.houses[o.house].prestige=CLAMP(state.houses[o.house].prestige+5,0,100);
 state.houses[o.house].loyalty=CLAMP(state.houses[o.house].loyalty+3,0,100);
 if(old!==o.house)state.houses[old].loyalty=CLAMP(state.houses[old].loyalty-6,0,100);
 const record={type:'case',year,title:c.title,text:o.result+' Новый владелец: '+awarded.name+'.'};
 state.chronicle.push(record);
 const peaceDelta=state.peace-beforePeace,lawDelta=state.law-beforeLaw;
 state.caseIndex++;state.chosen=-1;state.seen=[false,false];lastClue=-1;
 if(state.caseIndex===CASES.length||state.peace<=13||state.law<=12){state.done=true;state.ending=resultEnding();state.tab='case'}
 store();render();sound('seal');
 modal({kicker:state.done?'FINIS · ПОСЛЕДНЯЯ ПЕЧАТЬ':'SIGILLVM IMPRESSVM',title:state.done?state.ending.title:'Грамота скреплена',text:state.done?state.ending.text:o.result,stats:`Мир ${peaceDelta>=0?'+':''}${peaceDelta} · Закон ${lawDelta>=0?'+':''}${lawDelta}`,primary:state.done?'ОТКРЫТЬ ЛЕТОПИСЬ':'СЛЕДУЮЩЕЕ ДЕЛО',action:()=>{closeModal();if(state.done){setTab('history');renderHistory()}else{$('caseView').scrollTop=0;setTab('case')}}});
}
function saveArms(){
 const rule=currentRule();if(!rule.ok){sound('invalid');toast(rule.reason);return}
 if(signature(state.houses[state.forgeHouse].arms)===signature(draft)){toast('Этот герб уже записан в реестр.');return}
 const idx=state.forgeHouse,h=state.houses[idx];
 h.arms={...draft};h.prestige=CLAMP(h.prestige+1);
 if(!state.done)state.grants[state.caseIndex]=idx;
 state.chronicle.push({type:'arms',year:state.done?1309:CASES[state.caseIndex].year,title:'Новый герб · '+h.name,text:armsDescription(draft)});
 store();render();sound('seal');toast('Герб утверждён и внесён в книгу родов.');
}
function confirmReset(){
 sound();
 modal({kicker:'LIBER NOVVS',title:'Переписать гербовник?',text:'Все наследственные решения, история владений и созданные гербы этой партии будут утрачены.',primary:'НАЧАТЬ НОВУЮ ИСТОРИЮ',secondary:'ОСТАВИТЬ ХРОНИКУ',action:()=>{const keep=state.sound;state=initial();state.sound=keep;draft={...state.houses[0].arms};lastClue=-1;store();closeModal();render();$('caseView').scrollTop=0;toast('Новая хроника открыта.')},other:closeModal});
}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{sound();setTab(b.dataset.tab)}));
document.querySelectorAll('[data-clue]').forEach(b=>b.addEventListener('click',()=>examine(Number(b.dataset.clue))));
$('options').addEventListener('click',e=>{const b=e.target.closest('[data-option]');if(b)selectOption(Number(b.dataset.option))});
document.querySelectorAll('[data-claimant]').forEach(b=>b.addEventListener('click',()=>{if(state.done)return;const c=CASES[state.caseIndex];const house=c.claimants[Number(b.dataset.claimant)];const option=c.options.findIndex(o=>o.house===house);if(option>=0)selectOption(option)}));
$('sealBtn').addEventListener('click',confirmVerdict);
$('modalPrimary').addEventListener('click',()=>{if(onPrimary)onPrimary()});
$('modalSecondary').addEventListener('click',()=>{if(onSecondary)onSecondary()});
$('soundBtn').addEventListener('click',()=>{state.sound=!state.sound;store();sound();render()});
$('houseList').addEventListener('click',e=>{const b=e.target.closest('[data-house]');if(!b)return;state.selectedHouse=Number(b.dataset.house);sound();store();renderBook();});
$('houseDetail').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)editHouse(Number(b.dataset.edit))});
$('houseSelect').addEventListener('change',e=>{state.forgeHouse=Number(e.target.value);draft={...state.houses[state.forgeHouse].arms};store();renderForge();sound()});
for(const id of ['divisionPicker','fieldPicker','chargePicker','chargeTonePicker']){
 $(id).addEventListener('click',e=>{const b=e.target.closest('[data-editor]');if(!b)return;draft[b.dataset.editor]=b.dataset.value;renderForge();sound()});
}
$('registerArms').addEventListener('click',saveArms);
$('realmMap').addEventListener('click',e=>{const x=e.target.closest('[data-region]');if(!x)return;state.selectedRegion=Number(x.dataset.region);store();renderMap();sound()});
$('realmMap').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const x=e.target.closest('[data-region]');if(x){e.preventDefault();state.selectedRegion=Number(x.dataset.region);store();renderMap()}}});
$('resetBtn').addEventListener('click',confirmReset);
$('caseView').addEventListener('click',e=>{if(e.target.closest('#endingChronicle')){setTab('history');renderHistory()}if(e.target.closest('#endingReset'))confirmReset()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&audio?.state==='running')audio.suspend().catch(()=>{})});
draft={...state.houses[state.forgeHouse].arms};render();

createWorkshopMode({ appName: 'ГЕРБОВНИК', version: '1.0.0', cachePrefix: 'gerbovnik-', storageNamespace: 'pocket-works:gerbovnik', onReset: () => { state=initial();draft={...state.houses[0].arms};lastClue=-1;store();closeModal();render(); } });
