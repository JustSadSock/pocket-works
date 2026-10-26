// One permanent simulation viewport. All controls are either in the dock or deliberate dialogs.
import {packCareer,unpackCareer,savePackageFile,readPackageFile} from './agent-portability.mjs';
import {readBrain,KINDS} from './agent-career.mjs';
import {validPolicy} from './combat-core.mjs';
import {mountNeuralCombat} from './neural-combat-ui.mjs';
import {mountLearningBenchmark} from './learning-benchmark-ui.mjs';
import {showWorkbenchDialog,closeWorkbenchDialogs} from './ui-navigation.mjs';
import './agent-cockpit-shell.mjs';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('ru-RU');
export function mountAgentCockpit(api){
 const menus=['cpSetupDialog','cpProfileDialog','cpDuelDialog'];
 const closeAll=()=>closeWorkbenchDialogs();
 for(const button of document.querySelectorAll('[data-cp-close]'))button.onclick=()=>$(button.dataset.cpClose).close();
 let fightWorker=null,fighting=false,lastMode=null,lastObservedAgent=null,postBusy=false;
 let libraryFilter='active',observerOpen=false,vision=false,observerTicket=0,benchmarkActive=false;
 let lastChoicesSignature='',lastDisplayedMode=null;
 const neuro=mountNeuralCombat({...api,onBusy:api.onNeuralBusy,replay:match=>{
  window.PetriForgeRuntime.combat.showExternalDuel({summary:match.matches[0].summary,frames:match.matches[0].frames});
  const play=document.getElementById('battlePlay');if(play&&!play.disabled)play.click();
 }});
 const benchmark=mountLearningBenchmark({...api,onBusyChange:active=>{benchmarkActive=active;redraw();}});
 const setStatus=(text)=>{$('cpState').textContent=text;api.notify(text);};
 function state(){return api.state();}
 let lastProfilesSignature='';
 function profileOptions(){
  const {careers:all,active}=state(),careers=all.filter(c=>!c.archived);
  const signature=JSON.stringify(careers.map(c=>[c.id,c.name]));
  if(signature!==lastProfilesSignature){
   for(const id of ['cpAgent','cpProfileAgent','cpDuelA','cpDuelB']){
    const select=$(id),previous=select.value;select.replaceChildren();
    for(const c of careers){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;select.append(o);}
    if(careers.some(c=>c.id===previous))select.value=previous;
    else select.value=id==='cpDuelB'&&careers.length>1?careers.find(c=>c.id!==active?.id)?.id||careers[0]?.id:active?.id||'';
   }
   lastProfilesSignature=signature;
  }
  // Selection follows the real loaded model, never a stale previous option.
  $('cpAgent').value=active?.id||'';
  if(!$('cpProfileDialog').open)$('cpProfileAgent').value=active?.id||'';
 }
 const modelLabels={grid:'Q-learning · таблица состояний',combat:'Эволюция · тактическая политика',race:'Эволюция · управление машиной',perekos:'Эволюция · тактика мага'};
 const modelName=(mode,career)=>mode==='grid'&&career?.algorithms?.grid==='ppo'?'Нейросеть · PPO-Clip + GAE':mode==='grid'&&career?.algorithms?.grid==='neural'?'Нейросеть · Actor–Critic (градиенты)':modelLabels[mode];
 const worldLabels={grid:'Мир',combat:'Бой',race:'Гонка',perekos:'Магия'};
 function makeButton(text,action,disabled=false){
  const button=document.createElement('button');button.type='button';button.textContent=text;
  button.disabled=disabled;button.onclick=action;return button;
 }
 function renderLibrary(){
  const v=state(),list=$('cpLibraryList');list.replaceChildren();
  const archived=libraryFilter==='archived';
  $('cpShowActive').setAttribute('aria-pressed',String(!archived));
  $('cpShowArchived').setAttribute('aria-pressed',String(archived));
  const careers=v.careers.filter(c=>!!c.archived===archived);
  if(!careers.length){
   const empty=document.createElement('p');empty.className='cp-library-empty';
   empty.textContent=archived?'Архив пуст. Сюда можно переместить агента без удаления навыков.':'Нет действующих агентов. Создайте нового или верните агента из архива.';
   list.append(empty);return;
  }
  for(const c of careers){
   const card=document.createElement('article');card.className='cp-specimen';
   if(c.id===v.active?.id)card.classList.add('cp-specimen-selected');
   card.dataset.agentId=c.id;
   const head=document.createElement('div');head.className='cp-specimen-head';
   const avatar=document.createElement('span');avatar.className='cp-specimen-mark';avatar.textContent=c.name.trim().slice(0,2).toLocaleUpperCase('ru-RU');
   const identity=document.createElement('div');identity.className='cp-specimen-identity';
   const name=document.createElement('strong');name.textContent=c.name;
   const sub=document.createElement('span');
   const trainings=Object.values(c.branches).reduce((n,b)=>n+b.sessions,0);
   sub.textContent=trainings+' тренировок'+(c.parentId?' · потомок другого агента':'')+(c.id===v.active?.id?' · выбран':'');
   identity.append(name,sub);head.append(avatar,identity);card.append(head);
   const skills=document.createElement('div');skills.className='cp-specimen-skills';
   for(const mode of ['grid','combat','race','perekos']){
    const branch=c.branches[mode],chip=document.createElement('span');
    chip.title=worldLabels[mode]+' — '+modelLabels[mode];
    chip.textContent=worldLabels[mode]+': '+branch.sessions;
    if(branch.sessions||branch.imported)chip.classList.add('cp-skill-trained');
    skills.append(chip);
   }
   card.append(skills);
   const latest=Object.values(c.branches).flatMap(b=>b.history).sort((a,b)=>b.at-a.at)[0];
   const note=document.createElement('p');note.className='cp-specimen-note';
   note.textContent=latest?.label||'Ещё не обучался — начните с любой среды.';
   card.append(note);
   const actions=document.createElement('div');actions.className='cp-specimen-actions';
   if(!archived)actions.append(makeButton(c.id===v.active?.id?'Выбран':'Выбрать',async()=>{
    await performLibrary(async()=>{if(await api.switchAgent(c.id)===false)throw Error('Мозг агента не загрузился');drawProfile();},'Не удалось выбрать агента');
   },!!v.busy||!!v.pending||c.id===v.active?.id));
   actions.append(makeButton('Клон',async()=>{
    await performLibrary(async()=>{await api.clone(c.id);drawProfile();},'Не удалось клонировать агента');
   },!!v.busy||!!v.pending));
   actions.append(makeButton(archived?'Восстановить':'В архив',async()=>{
    await performLibrary(async()=>{await api.archive(c.id,!archived);drawProfile();},'Не удалось изменить архив');
   },!!v.busy||!!v.pending));
   card.append(actions);list.append(card);
  }
 }
 async function performLibrary(task,errorPrefix){
  $('cpLibraryStatus').textContent='Сохраняем изменения…';
  try{
   await task();redraw();
   $('cpLibraryStatus').textContent='Изменения сохранены.';
  }catch(e){$('cpLibraryStatus').textContent=errorPrefix+': '+e.message;}
 }
 async function renderObserver(){
  if(!observerOpen)return;
  const v=state(),ticket=++observerTicket,branch=v.active?.branches[v.mode];
  if(!branch)return;
  const latest=branch.history.at(-1);
  $('cpObserverPractice').textContent=latest?'Последнее занятие: '+latest.label:'В этой среде агент ещё не проходил тренировку.';
  $('cpVision').hidden=v.mode!=='grid';
  $('cpVision').setAttribute('aria-pressed',String(vision));
  $('cpObserverModel').textContent=modelName(v.mode,v.active)+' · читаем сохранённый мозг…';
  try{
   const model=await readBrain(v.active,v.mode);
   if(ticket!==observerTicket||state().active?.id!==v.active.id||state().mode!==v.mode)return;
   const neural=['neural-actor-critic','neural-ppo'].includes(model?.type);
   const size=neural?model.weights.reduce((n,layer)=>n+layer.reduce((sum,row)=>sum+row.length,0),0):v.mode==='grid'?model?.q?.length:v.mode==='race'?(Array.isArray(model)?model.length:null):model?.weights?.length;
   const label=model?(neural?size+' весов · '+(model.updates||0)+' обновлений':v.mode==='grid'?size+' изученных состояний':size+' параметров политики'):'модель ещё не сохранена';
   $('cpObserverModel').textContent=modelName(v.mode,v.active)+' · '+label;
  }catch(e){if(ticket===observerTicket)$('cpObserverModel').textContent='Не удалось прочитать сохранение: '+e.message;}
 }
 function drawProfile(){
  const {active}=state();if(!active)return;
  $('cpProfileTitle').textContent=active.name;
  $('cpSkillList').replaceChildren();$('cpHistory').replaceChildren();
  for(const [domain,label] of [['grid','Изучение мира'],['combat','Сражения'],['race','Гонки'],['perekos','Магия']]){
   const b=active.branches[domain];const div=document.createElement('div');div.className='cp-skill';
   const title=document.createElement('strong');title.textContent=label;
   const count=document.createElement('span');count.textContent=b.sessions+' тренировок · '+fmt(b.units)+' опыта';
   div.append(title,count);$('cpSkillList').append(div);
  }
  const history=Object.entries(active.branches).flatMap(([domain,b])=>b.history.map(h=>({...h,domain}))).sort((a,b)=>b.at-a.at).slice(0,10);
  if(!history.length)$('cpHistory').textContent='Этот агент ещё не тренировался.';
  renderLibrary();
  for(const h of history){const item=document.createElement('div');const strong=document.createElement('strong');strong.textContent=new Date(h.at).toLocaleDateString('ru-RU')+' · '+({grid:'Мир',combat:'Бой',race:'Гонка',perekos:'Магия'}[h.domain]||h.domain);
   const span=document.createElement('span');span.textContent=h.label;item.append(strong,span);$('cpHistory').append(item);}
 }
 function redraw(){
  const v=state();if(!v.active)return;
  profileOptions();
  const current=v.mode,setting=v.config[current],variant=$('hubVariant').selectedOptions[0]?.textContent||'Сцена';
  if(lastDisplayedMode!==null&&lastDisplayedMode!==current){
   $('agentHub').scrollTop=0;
   observerOpen=false;$('cpObserver').hidden=true;
   $('cpInspect').setAttribute('aria-expanded','false');
   $('cpInspect').textContent='Наблюдение · открыть';
  }
  lastDisplayedMode=current;
  $('cpGoal').textContent=variant;
  benchmark.update();
  neuro.refresh();
  $('cpTrainingCount').textContent=v.active.branches[current].sessions+' '+(v.active.branches[current].sessions===1?'тренировка':'тренировок');
  $('cpLastResult').textContent=v.active.branches[current].history.at(-1)?.label||'Пока без опыта. Нажмите «Обучить», чтобы агент начал учиться.';
  $('cpBatchLabel').textContent=fmt($('hubBatch').value)+' '+setting.units;
  $('cpTrainLabel').textContent=v.active.branches[current].sessions?'Продолжить обучение':'Обучить агента';
  $('cpStop').hidden=!v.busy;$('cpTrain').hidden=v.busy;
  const locked=v.busy||v.pending||fighting||benchmarkActive;
  $('cpAlgorithmRow').hidden=current!=='grid';
  $('cpDuel').hidden=current!=='combat';
  $('cpBenchmark').hidden=current!=='grid';
  $('cpNeurocombat').hidden=current!=='combat';
  $('cpAlgorithm').value=v.active.algorithms?.grid||'qlearning';
  $('cpAlgorithm').disabled=locked;
  for(const id of ['cpAgent','cpProfile','cpSetup','cpTest','cpDuel','cpExpert','cpTrain','cpDetails','cpReplay','cpInspect','cpVision'])$(id).disabled=locked;
  for(const button of document.querySelectorAll('[data-cp-mode]')){
   button.classList.toggle('cp-selected',button.dataset.cpMode===current);button.disabled=locked;
  }
  $('cpAgent').value=v.active.id;
  $('cpState').textContent=benchmarkActive?'Идёт независимое сравнение алгоритмов. Пульт обучения временно заблокирован.':v.busy?$('hubProgressText').textContent:v.lastEval||v.active.branches[current].history.at(-1)?.label||'Выберите задачу и начните обучение.';
  $('cpBar').hidden=!v.busy;
  if(v.busy)$('cpBarFill').style.width=$('hubProgressFill').style.width;
  // Rebuild option nodes only when the environment changes. Replacing them on
  // every progress update collapses native mobile pickers and loses focus.
  const key=current+JSON.stringify(setting.variants)+JSON.stringify(setting.counts);
  if(key!==lastChoicesSignature){
   for(const id of ['cpScenario','cpQuickScenario','cpBatch','cpQuickBatch'])$(id).replaceChildren();
   for(const [value,text] of setting.variants)for(const id of ['cpScenario','cpQuickScenario']){
    const o=document.createElement('option');o.value=value;o.textContent=text;$(id).append(o);
   }
   for(const n of setting.counts)for(const id of ['cpBatch','cpQuickBatch']){
    const o=document.createElement('option');o.value=String(n);o.textContent=fmt(n)+' '+setting.units;$(id).append(o);
   }
   lastChoicesSignature=key;
  }
  $('cpScenario').value=$('hubVariant').value;$('cpQuickScenario').value=$('hubVariant').value;
  $('cpBatch').value=$('hubBatch').value;$('cpQuickBatch').value=$('hubBatch').value;
  if(observerOpen){$('cpObserverPractice').textContent=v.active.branches[current].history.at(-1)?.label||'В этой среде нет тренировок.';}
  $('cpSetupHelp').textContent=current==='grid'?(v.active.algorithms?.grid==='neural'?'Эпизод — одна попытка пройти мир. Actor–Critic обновляет веса нейросети по ошибке прогноза; это ещё не PPO.':v.active.algorithms?.grid==='ppo'?'PPO копит собственные действия и обновляет политику партиями с GAE, ограничением изменения стратегии и несколькими эпохами.':'Эпизод — одна попытка пройти мир. Повторное обучение продолжит изученную Q-таблицу.'):
   current==='combat'?'Поколение — серия боёв. Агент сохраняет только выбранные изменения тактики.':
   current==='race'?'Кандидат — новый вариант управления настоящим автомобилем.':
   'Поколение — боевые раунды против соперников и контрольная оценка.';
 }
 for(const el of document.querySelectorAll('[data-cp-mode]'))el.onclick=()=>document.querySelector('[data-world-mode="'+el.dataset.cpMode+'"]')?.click();
 $('cpAgent').onchange=e=>void api.switchAgent(e.target.value);
 $('cpTrain').onclick=()=>$('hubTrain').click();
 $('cpStop').onclick=()=>$('hubStop').click();
 $('cpTest').onclick=()=>$('hubTest').click();
 $('cpReplay').onclick=()=>{
  if(state().busy||state().pending)return;
  $('hubReplay').click();
 };
 $('cpInspect').onclick=()=>{
  observerOpen=!observerOpen;$('cpObserver').hidden=!observerOpen;
  $('cpInspect').setAttribute('aria-expanded',String(observerOpen));
  $('cpInspect').textContent=observerOpen?'Наблюдение · закрыть':'Наблюдение · открыть';
  if(observerOpen)void renderObserver();
 };
 $('cpVision').onclick=()=>{
  if(state().mode!=='grid')return;
  vision=!vision;
  window.PetriForgeRuntime?.grid?.setObservationOverlay?.(vision);
  $('cpVision').setAttribute('aria-pressed',String(vision));
 };
 $('cpShowActive').onclick=()=>{libraryFilter='active';renderLibrary();};
 $('cpShowArchived').onclick=()=>{libraryFilter='archived';renderLibrary();};
 $('cpExpert').onclick=()=>{closeAll();api.expert();};
 $('cpSetup').onclick=()=>{showWorkbenchDialog($('cpSetupDialog'));};
 $('cpScenario').onchange=e=>{api.updateChoice('variant',e.target.value);$('cpGoal').textContent=e.target.selectedOptions[0]?.textContent||'Сцена';};
 $('cpAlgorithm').onchange=async e=>{
  const selection=e.target.value;
  $('cpAlgorithm').disabled=true;
  try{
   const ok=await api.selectAlgorithm(selection);
   if(!ok)$('cpAlgorithm').value=state().active?.algorithms?.grid||'qlearning';
  }finally{redraw();if(observerOpen)void renderObserver();}
 };
 $('cpQuickScenario').onchange=e=>api.updateChoice('variant',e.target.value);
 $('cpQuickBatch').onchange=e=>api.updateChoice('batch',e.target.value);
 $('cpGuide').onclick=()=>{
  showWorkbenchDialog($('cpSetupDialog'));
  $('cpSetupHelp').textContent='Выберите задачу и число попыток. «Обучить» улучшает сохранённый мозг. «Проверить» запускает испытание без обучения. «Бой агентов» сравнивает двух персонажей. Профиль хранит и экспортирует их опыт.';
 };
 $('cpBatch').onchange=e=>api.updateChoice('batch',e.target.value);
 $('cpEditWorld').onclick=()=>{closeAll();api.expert();};
 $('cpProfile').onclick=()=>{libraryFilter='active';drawProfile();$('cpProfileStatus').textContent='';$('cpLibraryStatus').textContent='';showWorkbenchDialog($('cpProfileDialog'));};
 $('cpDetails').onclick=()=>{libraryFilter='active';drawProfile();$('cpProfileStatus').textContent='';$('cpLibraryStatus').textContent='';showWorkbenchDialog($('cpProfileDialog'));};
 $('cpProfileAgent').onchange=e=>{void api.switchAgent(e.target.value).then(ok=>{if(ok)drawProfile();redraw();$('cpProfileAgent').value=state().active?.id||'';});};
 $('cpCreate').onclick=async()=>{closeAll();await api.create();redraw();};
 $('cpRename').onclick=async()=>{closeAll();await api.rename();redraw();};
 $('cpDelete').onclick=async()=>{closeAll();await api.delete();redraw();};
 $('cpLegacy').onclick=async()=>{closeAll();await api.legacy();redraw();};
 $('cpExport').onclick=async()=>{
  try{
   const {active}=state();if(!active||state().busy||state().pending)throw Error('Завершите обучение или проверку');
   await api.persist();const pkg=await packCareer(active);savePackageFile(pkg);
   $('cpProfileStatus').textContent='Экспортированы профиль и все четыре мозга агента.';
  }catch(e){$('cpProfileStatus').textContent='Ошибка экспорта: '+e.message;}
 };
 $('cpImport').onclick=()=>$('cpImportFile').click();
 $('cpImportFile').onchange=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{
   if(state().busy||state().pending)throw Error('Сначала завершите текущую операцию');
   const pkg=await readPackageFile(file);
   const imported=await unpackCareer(pkg);
   await api.importCareer(imported);
   $('cpProfileStatus').textContent='Агент успешно импортирован вместе с тренировками.';
   drawProfile();redraw();
  }catch(err){$('cpProfileStatus').textContent='Ошибка импорта: '+err.message;}
 };
 $('cpDuel').onclick=()=>{
  if(state().busy||state().pending)return;
  profileOptions();
  const enough=state().careers.filter(c=>!c.archived).length>=2;
  $('cpFight').disabled=!enough;
  $('cpDuelInfo').textContent=enough?'Два настоящих боя со сменой сторон. Используются боевые навыки выбранных персонажей.':
   'Создайте второго агента через профиль, затем обучите обоих в режиме «Бой».';
  showWorkbenchDialog($('cpDuelDialog'));
 };
 $('cpFight').onclick=async()=>{
  if(fighting||state().busy||state().pending)return;
  const v=state(),a=v.careers.find(c=>c.id===$('cpDuelA').value),b=v.careers.find(c=>c.id===$('cpDuelB').value);
  if(!a||!b||a.id===b.id){$('cpDuelResult').textContent='Выберите двух разных агентов.';return;}
  fighting=true;$('cpFight').disabled=true;$('cpDuelResult').textContent='Бой на настоящем игровом движке…';
  try{
   // Current unsaved active combat brain may be newer than the database snapshot.
   if(v.mode==='combat')await api.persist();
   const pa=await readBrain(a,'combat'),pb=await readBrain(b,'combat');
   if(!validPolicy(pa)||!validPolicy(pb))throw Error('Сначала обучите обоих агентов в режиме «Бой».');
   if(fightWorker)fightWorker.terminate();
   fightWorker=new Worker(new URL('./agent-duel-worker.mjs',import.meta.url),{type:'module'});
   const result=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{fightWorker.terminate();reject(Error('Бой превысил лимит времени'));},45000);
    fightWorker.onmessage=event=>{
     clearTimeout(timeout);const d=event.data;
     if(d.type==='duel-error')reject(Error(d.message));else resolve(d);
    };
    fightWorker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message||'Ошибка Worker'));};
    fightWorker.postMessage({a:pa,b:pb,arena:$('cpDuelArena').value,seed:41,teamSize:Number($('cpDuelTeam').value)||1});
   });
   const info=document.createElement('div');const lead=document.createElement('strong');
   lead.textContent=result.winner<0?'Ничья между агентами':(result.winner===0?a.name:b.name)+' побеждает';
   const record=document.createElement('p');record.textContent='Счёт '+result.points.join(' : ')+' · '+result.legs.map((leg,i)=>'бой '+(i+1)+': '+(leg.winner<0?'ничья':leg.winner===0?a.name:b.name)).join(', ');
   info.append(lead,record);$('cpDuelResult').replaceChildren(info);
   closeAll();
   if(v.mode!=='combat')document.querySelector('[data-world-mode="combat"]')?.click();
   // Navigation is asynchronous because it loads this agent's personal combat brain.
   await api.whenMode('combat');
   window.PetriForgeRuntime.combat.showExternalDuel({summary:result.legs[0].summary,frames:result.legs[0].frames});
   const canvasButton=document.querySelector('#battlePlay');if(canvasButton&&!canvasButton.disabled)canvasButton.click();
   api.setEvaluation(a.name+' '+result.points[0]+' : '+result.points[1]+' '+b.name+' · идёт повтор боя');
  }catch(e){$('cpDuelResult').textContent='Бой: '+e.message;}
  finally{fighting=false;$('cpFight').disabled=false;redraw();}
 };

 window.addEventListener('petri:mode',()=>queueMicrotask(redraw));
 window.addEventListener('petri:ui-reset',()=>{observerOpen=false;$('cpObserver').hidden=true;$('cpInspect').setAttribute('aria-expanded','false');$('cpInspect').textContent='Наблюдение · открыть';});
 window.addEventListener('petri:progress',()=>queueMicrotask(redraw));
 window.addEventListener('petri:finished',()=>{queueMicrotask(redraw);if(observerOpen)void renderObserver();});
 window.addEventListener('petri:evaluated',()=>queueMicrotask(redraw));
 window.addEventListener('petri:error',()=>queueMicrotask(redraw));
 window.addEventListener('petri:cockpit-sync',()=>{redraw();const current=state();if(observerOpen&&(lastMode!==current.mode||lastObservedAgent!==current.active?.id)){lastMode=current.mode;lastObservedAgent=current.active?.id;void renderObserver();}});
 redraw();
 return {redraw,closeAll,selectAlgorithm:api.selectAlgorithm};
}