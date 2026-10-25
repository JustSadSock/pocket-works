import assert from 'node:assert/strict';
import {admissionMarkup,connectionMarkup,setConnectionStep,preparingMarkup,updateArtLoad,updateReady,waitingMarkup,updateWaiting} from '../passage-ui.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&quot;'}[c]));
const common={name:'Вера',member:false,portrait:'<span class="avatar">В</span>',escapeText:esc,artURL:'./assets/art.png'};
const create=admissionMarkup({...common,creating:true});
const join=admissionMarkup({...common,creating:false,roomValue:'ABCD-1234',error:'Комната переполнена'});
assert(create.includes('type="submit"')&&create.includes('data-mode="create"'));
assert(!create.includes('id="room"')&&create.includes('data-action="join"'));
assert(join.includes('id="room"')&&join.includes('data-action="paste-invite"'));
assert(join.includes('data-mode="join"')&&join.includes('role="alert"'));
assert(join.includes('ABCD-1234')&&join.includes('Комната переполнена'));
const attack=admissionMarkup({...common,creating:false,name:'<img src=x onerror=alert(1)>',roomValue:'<script>'});
assert(!attack.includes('<script>')&&!attack.includes('<img src=x onerror=alert(1)>'));
const connection=connectionMarkup({mode:'resume',artURL:'./assets/art.png'});
assert(connection.includes('Восстанавливаем комнату'));
assert(connection.includes('class="passage-connection-seal"')&&connection.includes('<img src="./assets/art.png"'));
assert.equal((connection.match(/data-connection-step=/g)||[]).length,0,'Short loading screen must omit verbose step list');
assert(!connection.includes('>З</span>'),'Connection identity uses the portrait instead of Z');
const state=Array.from({length:4},(_,i)=>({dataset:{connectionStep:String(i)},classList:{classes:new Set(),toggle(k,v){v?this.classes.add(k):this.classes.delete(k)}}}));
const label={textContent:''};
const root={querySelectorAll:s=>s==='[data-connection-step]'?state:[],querySelector:s=>s==='#connectionDetail'?label:null};
setConnectionStep(root,2,'Соединяемся…');
assert(state[0].classList.classes.has('is-complete'));
assert(state[1].classList.classes.has('is-complete'));
assert(state[2].classList.classes.has('is-current'));
assert(!state[3].classList.classes.has('is-complete'));
assert.equal(label.textContent,'Соединяемся…');
const prep=preparingMarkup({round:3,total:8,ready:4,local:false});
assert.equal((prep.match(/class="passage-image-slot"/g)||[]).length,5);
assert(prep.includes('4 / 8')&&prep.includes('retry-art-preload'));
assert(!preparingMarkup({round:1,local:true}).includes('artReadyCount'));
const playerList=Array.from({length:8},(_,i)=>({id:'p'+i,name:i===7?'Длинное имя художника и реставратора':'Игрок '+i}));
const done=['p0','p2','p3'];
const view={round:2,deadline:0,drawingSeconds:120,done,participants:playerList};
const html=waitingMarkup({view,ass:{art:1,variation:2,strokes:[]},arts:{1:{title:'Мастерская восстановления подлинника'}},
 escapeText:esc,memberSeal:p=>'<span class="member-seal">'+esc(p.name[0])+'</span>',
 head:()=>'<div class="phase-head"></div>',artFactsHtml:()=>''});
assert(html.includes('3 / 8')&&html.includes('id="unveilRange"')&&html.includes('id="restCanvas"')&&html.includes('id="origCanvas"'));
assert.equal((html.match(/data-wait-player=/g)||[]).length,8);
assert.equal((html.match(/class="waiting-person is-ready"/g)||[]).length,3);
const meter={style:{values:{},setProperty(k,v){this.values[k]=v}},attrs:{},setAttribute(k,v){this.attrs[k]=v}};
const count={textContent:''},readyMsg={textContent:''},elements=playerList.map(p=>({dataset:{waitPlayer:p.id},
 classList:{classes:new Set(),contains(k){return this.classes.has(k)},toggle(k,v){v?this.classes.add(k):this.classes.delete(k)},add(k){this.classes.add(k)},remove(k){this.classes.delete(k)}},
 querySelector:()=>({set textContent(v){this.last=v}})}));
const ui={classList:{toggle(k,v){this[k]=v}},querySelector(s){return ({
 '#readyCount':count,'#waitingReadyTrack':meter,'#waitingStatusMessage':readyMsg
 })[s]||null},querySelectorAll:s=>s==='[data-wait-player]'?elements:[]};
updateWaiting(ui,playerList.map(p=>p.id),playerList);
assert.equal(count.textContent,'8 / 8');
assert.equal(meter.attrs['aria-valuenow'],'8');
assert.equal(meter.style.values['--passage-progress'],'100.00%');
assert(ui.classList['passage-all-ready']);
assert(readyMsg.textContent.includes('Все изображения подготовлены'),'full readiness indicates the image handoff, not premature voting');
assert(!readyMsg.textContent.includes('Переходим к экспертизе.'),'waiting room does not imply a finished ballot while images are pending');
const rootPaint={querySelector(s){
 if(s==='#artLoadTrack')return meter;
 if(s==='#artLoadCount')return count;
 if(s==='#artReadyCount')return readyMsg;
 return null;
},querySelectorAll:s=>s==='.passage-image-slot'?state.concat({classList:state[0].classList}):[]};
updateArtLoad(rootPaint,3,5);updateReady(rootPaint,5,8);
assert.equal(count.textContent,'3 / 5');
assert.equal(meter.attrs['aria-valuenow'],'3');
assert.equal(readyMsg.textContent,'5 / 8');
console.log('ZAMAZKA passage: create/join forms, paste, escaped errors, server states, 5 decoded-art slots, 8-player progress, canvas split OK');
