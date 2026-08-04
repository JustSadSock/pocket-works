import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { DEFAULT_STATE, buildExportPayload, buildMarkdownReport, createId, normalizeState } from './core.js';
import { CHECKIN_SCORES, EPISODE_SCORES, TECHNIQUES } from './protocols.js';
import { checkinForm, episodeForm, exportScreen, journal, productForm, techniques, today, e, scoreFields } from './screens.js';

installMobileRuntime();
const store=createVersionedStore({namespace:'pocket-works:tempo',version:1,defaults:DEFAULT_STATE,validate:v=>v&&typeof v==='object'&&!Array.isArray(v)});
let state=normalizeState(store.getAll()),tab='today',cursor=new Date(),selectedDate=null,activeSession=null,timerId=null,pendingDelete=null;
cursor.setDate(1);store.replace(state);
const screen=document.querySelector('#screen'),modal=document.querySelector('#modal'),modalTitle=document.querySelector('#modal-title'),modalBody=document.querySelector('#modal-body'),confirm=document.querySelector('#confirm'),toast=document.querySelector('#toast');

function persist(){state=normalizeState(state);store.replace(state);render()}
function notify(text){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1900)}
function open(title,html){modalTitle.textContent=title;modalBody.innerHTML=html;modal.showModal()}
function close(){if(modal.open)modal.close();clearInterval(timerId)}
function range(){return document.querySelector('input[name="range"]:checked')?.value||'30d'}
function report(){return buildMarkdownReport(state,{range:range(),includeNotes:Boolean(document.querySelector('#include-notes')?.checked)})}
function render(){
 document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
 if(tab==='today')screen.innerHTML=today(state);
 if(tab==='journal')screen.innerHTML=journal(state,cursor,selectedDate);
 if(tab==='techniques')screen.innerHTML=techniques(state);
 if(tab==='export')screen.innerHTML=exportScreen(buildMarkdownReport(state,{range:'30d',includeNotes:false}));
}
function formNum(fd,name,fallback=3){const v=fd.get(name);return v==null||v===''?fallback:Number(v)}
function iso(value){const d=new Date(value);return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString()}
function saveEntry(form){
 const fd=new FormData(form),kind=form.dataset.kind,now=new Date().toISOString();
 if(kind==='episode')state.episodes.unshift({id:createId('episode'),createdAt:now,occurredAt:iso(fd.get('occurredAt')),type:fd.get('type')||'mixed',durationBand:fd.get('durationBand')||'none',exactSeconds:null,...Object.fromEntries(EPISODE_SCORES.map(([k])=>[k,formNum(fd,k)])),context:fd.getAll('context'),techniqueId:fd.get('techniqueId')||null,productId:fd.get('productId')||null,notes:fd.get('notes')||''});
 if(kind==='checkin')state.checkIns.unshift({id:createId('checkin'),createdAt:now,occurredAt:iso(fd.get('occurredAt')),...Object.fromEntries(CHECKIN_SCORES.map(([k])=>[k,formNum(fd,k)])),morningErection:formNum(fd,'morningErection',0),notes:fd.get('notes')||''});
 if(kind==='product')state.products.push({id:createId('product'),createdAt:now,name:fd.get('name')||'',activeIngredients:fd.get('activeIngredients')||'',concentration:fd.get('concentration')||'',labelDose:fd.get('labelDose')||'',labelWait:fd.get('labelWait')||'',labelledForPenileUse:true,notes:''});
 persist();close();notify(kind==='product'?'Карточка сохранена':'Запись сохранена локально');
}
function techniqueIntro(id){
 const t=TECHNIQUES.find(x=>x.id===id);if(!t)return;
 const products=t.topical?`<label class="field"><span>Средство</span><select id="session-product"><option value="">Выбери карточку</option>${state.products.map(p=>`<option value="${p.id}">${e(p.name)}</option>`).join('')}</select></label>`:'';
 open(t.title,`<p>${e(t.summary)}</p><ol class="steps">${t.steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol>${products}<label class="field"><span>Уверенность до</span><div class="scores">${[0,1,2,3,4,5].map(v=>`<label><input type="radio" name="confidence-before" value="${v}" ${v===3?'checked':''}><span>${v}</span></label>`).join('')}</div></label><div class="form-actions"><button class="solid" data-session-start="${t.id}">Начать сессию</button></div>`);
}
function startSession(id){
 const t=TECHNIQUES.find(x=>x.id===id);if(!t)return;
 const productId=document.querySelector('#session-product')?.value||null;
 if(t.topical&&!productId){notify('Сначала создай и выбери карточку средства');return}
 activeSession={technique:t,startedAt:new Date().toISOString(),cycles:0,confidenceBefore:Number(document.querySelector('input[name="confidence-before"]:checked')?.value||3),productId};
 if(!t.cycles)return sessionReview();sessionCycle();
}
function sessionCycle(){
 const t=activeSession.technique,n=activeSession.cycles+1;
 modalBody.innerHTML=`<p class="eyebrow">ЦИКЛ ${n} ИЗ ${t.cycles}</p><h2>${e(t.title)}</h2><p>${e(t.steps[Math.min(n,t.steps.length)-1]||t.steps[0])}</p><label class="field"><span>Пик возбуждения 0–10</span><input id="peak" type="range" min="0" max="10" value="7" oninput="this.nextElementSibling.textContent=this.value"><b>7</b></label>${t.pause?`<div class="timer"><b id="timer">${t.pause}</b><span>секунд или до снижения к 3–4/10</span></div><button class="outline" data-timer="${t.pause}">Запустить паузу</button>`:''}<div class="form-actions"><button class="solid" data-cycle-done>Цикл завершён</button><button class="outline" data-session-stop>Остановить без провала</button></div>`;
}
function sessionReview(stopped=false){
 const t=activeSession.technique;
 modalBody.innerHTML=`<p class="eyebrow">${stopped?'ОСТАНОВЛЕНО':'СЕССИЯ ЗАВЕРШЕНА'}</p><h2>Зафиксировать результат</h2><form id="session-form">${scoreFields([['control','Контроль'],['pleasure','Удовольствие'],['anxiety','Напряжение'],['confidenceAfter','Уверенность после']])}<label class="field"><span>Пик возбуждения 0–10</span><input name="peakArousal" type="number" min="0" max="10" value="7"></label>${t.topical?`${scoreFields([['numbness','Онемение'],['effect','Эффект']])}<label class="check"><input type="checkbox" name="transfer"><span>Был перенос онемения партнёрше</span></label><label class="check"><input type="checkbox" name="irritation"><span>Было жжение или раздражение</span></label>`:''}<label class="field"><span>Заметка</span><textarea name="notes" rows="3"></textarea></label><div class="form-actions"><button class="solid" type="submit">Сохранить практику</button></div></form>`;
 activeSession.stopped=stopped;
}
function saveSession(form){const fd=new FormData(form),now=new Date().toISOString();state.techniqueSessions.unshift({id:createId('technique'),techniqueId:activeSession.technique.id,createdAt:now,startedAt:activeSession.startedAt,completedAt:now,status:activeSession.stopped?'stopped':'completed',cyclesCompleted:activeSession.cycles,peakArousal:formNum(fd,'peakArousal',7),control:formNum(fd,'control'),pleasure:formNum(fd,'pleasure'),anxiety:formNum(fd,'anxiety'),confidenceBefore:activeSession.confidenceBefore,confidenceAfter:formNum(fd,'confidenceAfter'),productId:activeSession.productId,numbness:formNum(fd,'numbness',0),effect:formNum(fd,'effect',0),transferObserved:fd.get('transfer')==='on',irritationObserved:fd.get('irritation')==='on',notes:fd.get('notes')||''});activeSession=null;persist();close();notify('Практика сохранена')}
function startTimer(seconds){clearInterval(timerId);let left=seconds;const el=document.querySelector('#timer');el.textContent=left;timerId=setInterval(()=>{left-=1;el.textContent=Math.max(0,left);if(left<=0){clearInterval(timerId);notify('Пауза закончена')}} ,1000)}
function settings(){open('Настройки',`<div class="settings"><p class="warning">Все данные хранятся локально. Облака, аналитики и аккаунта здесь нет.</p><button class="danger" data-clear>Удалить все данные TEMPO</button></div>`)}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
function deleteNow(){if(!pendingDelete)return;const map={episode:'episodes',checkin:'checkIns',technique:'techniqueSessions'};const key=map[pendingDelete.kind];if(key)state[key]=state[key].filter(x=>x.id!==pendingDelete.id);pendingDelete=null;persist();notify('Запись удалена')}
async function copyText(text){if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true}const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();const ok=document.execCommand('copy');area.remove();return ok}

document.addEventListener('click',async event=>{
 const b=event.target.closest('button,[data-tab]');if(!b)return;
 if(b.dataset.tab){tab=b.dataset.tab;render();return}
 if(b.dataset.action==='episode')open('Новый эпизод',episodeForm(state));
 if(b.dataset.action==='checkin')open('Чек-ин состояния',checkinForm());
 if(b.dataset.action==='product')open('Карточка средства',productForm());
 if(b.dataset.action==='settings')settings();
 if(b.dataset.technique)techniqueIntro(b.dataset.technique);
 if(b.dataset.sessionStart){event.preventDefault();startSession(b.dataset.sessionStart)}
 if(b.hasAttribute('data-cycle-done')){activeSession.cycles+=1;activeSession.peak=Math.max(activeSession.peak||0,Number(document.querySelector('#peak')?.value||0));activeSession.cycles>=activeSession.technique.cycles?sessionReview():sessionCycle()}
 if(b.hasAttribute('data-session-stop'))sessionReview(true);
 if(b.dataset.timer)startTimer(Number(b.dataset.timer));
 if(b.dataset.cal){cursor.setMonth(cursor.getMonth()+(b.dataset.cal==='next'?1:-1));render()}
 if(b.dataset.date){selectedDate=selectedDate===b.dataset.date?null:b.dataset.date;render()}
 if(b.dataset.deleteId){pendingDelete={kind:b.dataset.deleteKind,id:b.dataset.deleteId};confirm.showModal()}
 if(b.dataset.productDelete){state.products=state.products.filter(x=>x.id!==b.dataset.productDelete);persist()}
 if(b.dataset.clear){state=normalizeState(DEFAULT_STATE);store.reset();store.replace(state);close();render();notify('Данные TEMPO удалены')}
 if(b.dataset.export){const md=report(),payload=buildExportPayload(state,{range:range(),includeNotes:Boolean(document.querySelector('#include-notes')?.checked)});state.exportState.lastExportAt=new Date().toISOString();store.replace(state);if(b.dataset.export==='copy'){await copyText(md);notify('Markdown скопирован')}if(b.dataset.export==='md')download('tempo-report.md',md,'text/markdown');if(b.dataset.export==='json')download('tempo-report.json',JSON.stringify(payload,null,2),'application/json')}
});
document.addEventListener('submit',event=>{if(event.target.id==='entry-form'){event.preventDefault();saveEntry(event.target)}if(event.target.id==='session-form'){event.preventDefault();saveSession(event.target)}});
document.addEventListener('change',event=>{if(tab==='export'&&(event.target.name==='range'||event.target.id==='include-notes'))document.querySelector('#preview').value=report()});
modal.addEventListener('close',()=>clearInterval(timerId));
confirm.addEventListener('close',()=>{if(confirm.returnValue==='confirm')deleteNow();else pendingDelete=null});
createWorkshopMode({appName:'TEMPO',version:'1.0.0',cachePrefix: 'tempo-',storageNamespace: 'pocket-works:tempo',onReset(){state=normalizeState(DEFAULT_STATE);store.reset();render()}});
watchConnectivity(online=>document.documentElement.dataset.network=online?'online':'offline');
render();
