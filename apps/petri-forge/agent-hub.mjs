import './agent-hub-shell.mjs';
import {DOMAINS,KINDS,TITLES,listCareers,createCareer,readBrain,writeBrain,recordTraining,renameCareer,eraseCareer,writeCareer} from './agent-career.mjs';
import {listModels,loadModel} from './model-store.mjs';

const $=id=>document.getElementById(id),runtime=()=>window.PetriForgeRuntime||{};
const LAST='pocket-works:petri-forge:career-last-v1';
async function migratePreviousAutosaves(c){
 const legacy={grid:'autosave',combat:'combat-autosave',race:'race-autosave',perekos:'perekos-autosave'};
 let restored=0;
 for(const domain of DOMAINS){
  try{
   const saved=await loadModel(legacy[domain]);
   if(!saved||saved.kind!==KINDS[domain]||!saved.snapshot)continue;
   await writeBrain(c,domain,saved.snapshot);
   c.branches[domain].imported=true;
   c.branches[domain].history.push({at:Date.now(),units:0,outcome:'imported',
     label:'Восстановлен мозг из предыдущей версии PetriForge. Можно продолжать обучение.',before:null,after:null});
   restored++;
  }catch{/* Damaged legacy saves must not prevent first launch. */}
 }
 if(restored)await writeCareer(c);
 return restored;
}
const cfg={
 grid:{info:'Находит путь к цели на клеточной карте. За попытки получает награды и штрафы и запоминает полезные действия.',units:'эпизодов',counts:[100,400,1000,3000],variants:[['corridor','Первый маршрут'],['maze','Лабиринт'],['hazards','Опасная территория'],['rewards','Сбор наград'],['switchback','Обход барьеров'],['rooms','Комнаты'],['custom','Мой нарисованный мир']],first:'corridor'},
 combat:{info:'Учится побеждать в настоящих боях: выбирает дистанцию, оборону, способность и маршрут. Одно поколение — несколько боёв.',units:'поколений',counts:[8,16,32,64],variants:[['open','Чистое поле'],['cover','Укрытия'],['hazards','Опасная арена']],first:'cover'},
 race:{info:'Водит настоящую машину «Шпильки». Каждый кандидат испытывает изменённую стратегию руля, газа и тормоза.',units:'кандидатов',counts:[4,8,16,24],variants:[['41','Трасса 41'],['73','Трасса 73'],['107','Трасса 107']],first:'41'},
 perekos:{info:'Учится управлять магом: прицел, уклонения, защитные умения и руны. Соперники постепенно усложняются.',units:'поколений',counts:[2,4,8,12],variants:[['balanced','Постепенно сложнее'],['offense','Атака и добивание'],['competitive','Сильные соперники']],first:'balanced'}
};
let mode='grid',active=null,careers=[],busy=false,pending=false,advanced=false,lastEval='',chain=Promise.resolve();
const skillStrip=document.createElement('div');skillStrip.id='hubSkillStrip';skillStrip.className='hub-skillstrip';document.querySelector('#agentHub .hub-top').append(skillStrip);
const fmt=n=>Number(n||0).toLocaleString('ru-RU');
const notify=s=>$('hubSaveState').textContent=s;
function lock(){
 for(const id of ['hubTrain','hubTest','hubReplay','hubAgents','hubManage','hubVariant','hubBatch','hubEdit','hubTools'])$(id).disabled=busy||pending;
 for(const b of document.querySelectorAll('[data-world-mode]'))b.disabled=busy||pending;
 for(const chip of skillStrip.children)chip.disabled=busy||pending;
 $('hubTrain').hidden=busy;$('hubStop').hidden=!busy;$('hubProgressWrap').hidden=!busy;
}
function profiles(){
 const select=$('hubAgents');select.replaceChildren();
 for(const c of careers){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;select.append(o);}
 if(active)select.value=active.id;
}
function refresh(){
 if(!active)return;
 skillStrip.replaceChildren();
 for(const domain of DOMAINS){
  const button=document.createElement('button');button.type='button';button.className='hub-skill-chip';
  button.classList.toggle('current',domain===mode);button.disabled=busy||pending;
  const name=document.createElement('span');name.textContent={grid:'Миры',combat:'Бой',race:'Гонки',perekos:'Магия'}[domain];
  const value=document.createElement('strong');const branch=active.branches[domain];
  value.textContent=branch.sessions?String(branch.sessions):branch.imported?'✓':'–';
  button.append(name,value);button.title='Перейти к навыкам: '+TITLES[domain];
  button.onclick=()=>{if(!busy&&!pending)document.querySelector('[data-world-mode="'+domain+'"]')?.click();};
  skillStrip.append(button);
 }

 const b=active.branches[mode],x=cfg[mode];
 $('hubWorldTitle').textContent=TITLES[mode];
 $('hubModeIndex').textContent=String(DOMAINS.indexOf(mode)+1).padStart(2,'0')+' / 04';
 $('hubDescription').textContent=x.info;
 $('hubRuns').textContent=fmt(b.sessions);
 $('hubExperience').textContent=fmt(b.units)+' '+x.units;
 $('hubLifetime').textContent='Всего '+DOMAINS.reduce((n,d)=>n+active.branches[d].sessions,0)+' тренировок · '+(b.trainedAt?'последняя '+new Date(b.trainedAt).toLocaleDateString('ru-RU'):'здесь ещё не тренировался');
 $('hubTrainText').textContent=b.sessions||b.imported?'Продолжить обучение':'Начать обучение';
 $('hubTrainSub').textContent=b.sessions||b.imported?'Тот же мозг, новые навыки':'Первое занятие этого агента';
 $('hubLesson').textContent=x.units==='эпизодов'?'Каждый эпизод — отдельная попытка дойти до цели. Опыт и знания накапливаются.':
  mode==='race'?'Кандидат — ещё один способ вести автомобиль. Новое занятие продолжит улучшать этого водителя.':
  'Модель сравнивает стратегии и сохраняет удачные. Следующее занятие продолжит с текущих навыков.';
 $('hubResult').textContent=lastEval||b.history.at(-1)?.label||'Здесь появятся результаты первой тренировки. Начните занятие выше.';
 $('hubHistory').replaceChildren();
 for(const h of b.history.slice(-3).reverse()){
  const d=document.createElement('div');d.className='hub-history-entry';
  const title=document.createElement('strong'),body=document.createElement('span');
  title.textContent=new Date(h.at).toLocaleDateString('ru-RU')+' · +'+fmt(h.units)+' '+x.units;
  body.textContent=h.label;d.append(title,body);$('hubHistory').append(d);
 }
 $('hubExplanation').textContent=mode==='grid'?'Проверка запускает этого же агента на других вариантах карты, не изменяя его мозг.':
 mode==='combat'?'Проверка проводит настоящий поединок. Можно наблюдать движения, умения и последствия решений.':
 mode==='race'?'Контрольный заезд не учит машину. Для просмотра предыдущей записи используйте ползунок под трассой.':
 'Контрольный матч покажет реальные попадания, руны, счёт и ничьи. Повтор доступен после матча.';
}
function choices(){
 const x=cfg[mode],select=$('hubVariant'),batch=$('hubBatch');select.replaceChildren();batch.replaceChildren();
 for(const [val,label] of x.variants){const o=document.createElement('option');o.value=val;o.textContent=label;select.append(o);}
 for(const n of x.counts){const o=document.createElement('option');o.value=String(n);o.textContent=fmt(n)+' '+x.units;batch.append(o);}
 select.value=x.first;batch.value=String(x.counts[1]);
}
function choices(){
 const data=cfg[mode],select=$('hubVariant'),batch=$('hubBatch');select.replaceChildren();batch.replaceChildren();
 for(const [value,label] of data.variants){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
 for(const n of data.counts){const option=document.createElement('option');option.value=String(n);option.textContent=fmt(n)+' '+data.units;batch.append(option);}
 select.value=data.first;batch.value=String(data.counts[1]||data.counts[0]);
}
async function persist(c,domain){
 const r=runtime()[domain];if(!r||r.isBusy?.())return;
 const snapshot=await r.getModel();if(snapshot)await writeBrain(c,domain,snapshot);
}
async function restore(c,domain){
 const r=runtime()[domain];if(!r)throw Error('Игровой движок пока не готов');
 const snapshot=await readBrain(c,domain);
 await r.setModel(snapshot);
 notify(snapshot?'Загружен мозг '+c.name+' · '+TITLES[domain]:'Для '+TITLES[domain]+' создан чистый мозг');
}
function advancedMode(value){
 advanced=value;document.body.classList.toggle('hub-advanced',value);
 for(const [key,id] of Object.entries({grid:'labPanel',combat:'combatPanel',race:'racePanel',perekos:'perekosPanel'})){
  const pane=$(id);pane.hidden=!(value&&key===mode);
  if(value&&key===mode&&!pane.querySelector('.hub-back')){
   const back=document.createElement('button');back.className='hub-back btn-primary';back.textContent='← Вернуться к обучению';
   back.onclick=()=>advancedMode(false);pane.prepend(back);
  }
 }
}
async function changeMode(next){
 if(!DOMAINS.includes(next)||!active||busy)return;
 if(next!==mode){
  pending=true;lock();
  const from=mode;
  try{await persist(active,from);mode=next;await restore(active,next);}
  catch(e){notify('Ошибка среды: '+e.message);}
  finally{pending=false;}
 }
 advancedMode(false);lastEval='';choices();refresh();lock();
}
function ask(action,title,value){
 return new Promise(resolve=>{
  const dlg=$('hubDialog'),input=$('hubDialogName');
  $('hubDialogTitle').textContent=title;$('hubDialogConfirm').textContent=action==='new'?'Создать':'Переименовать';
  input.value=value||'';
  const close=()=>{dlg.removeEventListener('close',close);resolve(dlg.returnValue==='confirm'&&input.value.trim()?input.value.trim():null);};
  dlg.addEventListener('close',close);dlg.showModal();input.focus();input.select();
 });
}
async function switchAgent(id){
 if(!id||busy||pending||id===active?.id)return;
 const next=careers.find(c=>c.id===id);if(!next)return;
 pending=true;lock();
 try{if(active)await persist(active,mode);active=next;localStorage.setItem(LAST,next.id);await restore(next,mode);lastEval='';profiles();refresh();}
 catch(e){notify('Ошибка агента: '+e.message);}
 finally{pending=false;lock();}
}
async function create(){
 const name=await ask('new','Создать своего агента','Искра '+(careers.length+1));if(!name)return;
 pending=true;lock();
 try{if(active)await persist(active,mode);
  const c=await createCareer(name);careers.unshift(c);active=c;localStorage.setItem(LAST,c.id);
  await restore(c,mode);lastEval='';profiles();refresh();notify(name+' создан. Можно приступать к обучению.');
 }catch(e){notify('Не удалось создать: '+e.message);}
 finally{pending=false;lock();}
}
async function importOld(){
 const items=(await listModels()).filter(x=>x.kind===KINDS[mode]&&!x.id.startsWith('career-v1:'));
 if(!items.length){notify('В этой лаборатории нет прежних сохранений');return;}
 const dlg=document.createElement('dialog'),label=document.createElement('p'),select=document.createElement('select');
 dlg.className='hub-manage-dialog';label.textContent='Выберите прежний мозг '+TITLES[mode]+', чтобы привязать его к агенту '+active.name+':';
 for(const record of items){const o=document.createElement('option');o.value=record.id;o.textContent=record.name;select.append(o);}
 const go=document.createElement('button'),cancel=document.createElement('button');
 go.className='btn-primary';go.textContent='Привязать мозг';cancel.textContent='Отмена';
 dlg.append(label,select,go,cancel);document.body.append(dlg);
 const close=()=>{dlg.close();dlg.remove();};cancel.onclick=close;dlg.addEventListener('cancel',()=>dlg.remove(),{once:true});
 go.onclick=async()=>{
  pending=true;lock();
  try{
   const row=await loadModel(select.value);
   if(!row||row.kind!==KINDS[mode])throw Error('Сохранение повреждено');
   await runtime()[mode].setModel(row.snapshot);await writeBrain(active,mode,row.snapshot);
   notify('Прежний мозг «'+row.name+'» привязан к '+active.name);close();
  }catch(e){notify('Ошибка загрузки: '+e.message);}
  finally{pending=false;lock();}
 };
 dlg.showModal();
}
async function manage(){
 if(busy||pending)return;
 const d=document.createElement('dialog');d.className='hub-manage-dialog';
 const title=document.createElement('div');title.className='hub-dialog-title';title.textContent=active.name;
 const actions=[['+ Новый агент','new'],['Переименовать','rename'],['Взять мозг из старых сохранений','import'],['Удалить агента и все его навыки','delete']];
 d.append(title);
 for(const [label,key] of actions){
  const btn=document.createElement('button');btn.textContent=label;btn.dataset.action=key;
  if(key==='delete')btn.className='hub-danger';
  btn.onclick=async()=>{
   d.close();d.remove();
   try{
    if(key==='new')await create();
    if(key==='import')await importOld();
    if(key==='rename'){
     const name=await ask('rename','Имя агента',active.name);
     if(name){active=await renameCareer(active,name);careers=careers.map(c=>c.id===active.id?active:c);profiles();refresh();notify('Имя обновлено');}
    }
    if(key==='delete'){
     if(!confirm('Удалить «'+active.name+'» со всеми мозгами и историей? Отменить это нельзя.'))return;
     pending=true;lock();await eraseCareer(active);careers=careers.filter(c=>c.id!==active.id);
     if(!careers.length)careers.push(await createCareer('Искра'));
     active=careers[0];localStorage.setItem(LAST,active.id);await restore(active,mode);profiles();refresh();notify('Агент удалён');
    }
   }catch(e){notify('Ошибка: '+e.message);}
   finally{pending=false;lock();}
  };
  d.append(btn);
 }
 const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>{d.close();d.remove();};
 d.append(close);document.body.append(d);d.addEventListener('cancel',()=>d.remove(),{once:true});d.showModal();
}
$('hubAgents').onchange=e=>void switchAgent(e.target.value);
$('hubManage').onclick=()=>void manage();
$('hubEdit').onclick=()=>advancedMode(true);
$('hubTools').onclick=()=>advancedMode(true);
$('hubBatch').onchange=refresh;
$('hubVariant').onchange=()=>notify('Испытание выбрано. Нажмите «Обучить», чтобы применить настройки.');
$('hubTrain').onclick=()=>{
 if(busy||pending||!active)return;
 const r=runtime()[mode];if(!r){notify('Среда загружается');return;}
 if(r.isReady&&!r.isReady()){notify('Движок Шпильки ещё подключается');return;}
 try{
  r.batch(Number($('hubBatch').value));r.configure($('hubVariant').value);
  if(r.train()===false)throw Error('Среда пока не готова');
  busy=true;lastEval='';$('hubProgressFill').style.width='0%';$('hubProgressPercent').textContent='0%';
  $('hubProgressText').textContent='Обучаем '+active.name+'…';lock();
 }catch(e){busy=false;lock();notify('Не удалось начать: '+e.message);}
};
$('hubStop').onclick=()=>{try{runtime()[mode]?.stop();$('hubProgressText').textContent='Останавливаем занятие…';}catch(e){notify(e.message);}};
$('hubTest').onclick=()=>{
 if(busy||pending)return;
 try{const r=runtime()[mode];
  if(r.isReady&&!r.isReady())throw Error('Сначала дождитесь загрузки физики');
  if(r.test()===false)throw Error('Проверка недоступна');
  notify('Контрольное испытание запущено');
 }catch(e){notify(e.message);}
};
$('hubReplay').onclick=()=>{
 if(busy||pending)return;
 try{runtime()[mode]?.replay();notify('Запись показана на игровом поле');}
 catch(e){notify('Повтор: '+e.message);}
};
window.addEventListener('petri:mode',e=>{
 const next=e.detail?.mode;if(!DOMAINS.includes(next))return;
 chain=chain.then(()=>changeMode(next)).catch(err=>notify('Ошибка переключения: '+err.message));
});
window.addEventListener('petri:progress',e=>{
 const data=e.detail;if(!active||data?.mode!==mode)return;
 busy=true;lock();
 const percent=data.total?Math.min(100,Math.round(100*data.done/data.total)):0;
 $('hubProgressFill').style.width=percent+'%';$('hubProgressPercent').textContent=percent+'%';
 $('hubProgressText').textContent=data.text||'Идёт тренировка…';
});
window.addEventListener('petri:finished',e=>{
 const data=e.detail;if(!data||!active||!DOMAINS.includes(data.mode))return;
 const owner=active;
 chain=chain.then(async()=>{
  try{
   const newer=await recordTraining(owner,data.mode,data.snapshot,data.report);
   careers=careers.map(c=>c.id===owner.id?newer:c);if(active?.id===owner.id)active=newer;
   busy=false;lock();refresh();notify('Автоматически сохранено: '+newer.name+' · '+TITLES[data.mode]);
  }catch(err){busy=false;lock();notify('Ошибка сохранения: '+err.message);}
 });
});
window.addEventListener('petri:evaluated',e=>{
 if(e.detail?.mode!==mode)return;lastEval=e.detail.text||'';refresh();
});
window.addEventListener('petri:ready',e=>{
 if(e.detail?.mode==='race'&&mode==='race'){notify('Движок Шпильки подключён. Можно тренироваться.');lock();}
});
window.addEventListener('petri:error',e=>{busy=false;lock();notify('Ошибка: '+(e.detail?.message||'тренировка прервана'));});
window.addEventListener('pagehide',()=>{if(active&&!busy&&!pending)void persist(active,mode);});
async function start(){
 pending=true;lock();
 try{
  careers=await listCareers();
  if(!careers.length){
   const first=await createCareer('Искра');await migratePreviousAutosaves(first);careers=[first];
  }
  active=careers.find(c=>c.id===localStorage.getItem(LAST))||careers[0];
  await restore(active,mode);profiles();choices();refresh();
 }catch(e){notify('Не удалось открыть агентов: '+e.message);}
 finally{pending=false;lock();}
}
void start();
window.PetriForgeAgentHub=()=>({agent:active?.name,id:active?.id,mode,busy,advanced,profiles:careers.length,sessions:active?.branches?.[mode]?.sessions||0});