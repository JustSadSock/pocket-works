// One permanent simulation viewport. All controls are either in the dock or deliberate dialogs.
import {packCareer,unpackCareer,savePackageFile,readPackageFile} from './agent-portability.mjs';
import {readBrain} from './agent-career.mjs';
import {validPolicy} from './combat-core.mjs';
import './agent-cockpit-shell.mjs';
const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('ru-RU');
export function mountAgentCockpit(api){
 const menus=['cpSetupDialog','cpProfileDialog','cpDuelDialog'];
 const closeAll=()=>{for(const id of menus){const dlg=$(id);if(dlg.open)dlg.close();}};
 for(const button of document.querySelectorAll('[data-cp-close]'))button.onclick=()=>$(button.dataset.cpClose).close();
 let fightWorker=null,fighting=false,lastMode=null,postBusy=false;
 const setStatus=(text)=>{$('cpState').textContent=text;api.notify(text);};
 function state(){return api.state();}
 function profileOptions(){
  const {careers,active}=state();
  for(const id of ['cpAgent','cpProfileAgent','cpDuelA','cpDuelB']){
   const select=$(id),previous=select.value;select.replaceChildren();
   for(const c of careers){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;select.append(o);}
   if(careers.some(c=>c.id===previous))select.value=previous;
   else select.value=id==='cpDuelB'&&careers.length>1?careers.find(c=>c.id!==active?.id)?.id||careers[0]?.id:active?.id||'';
  }
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
  for(const h of history){const item=document.createElement('div');const strong=document.createElement('strong');strong.textContent=new Date(h.at).toLocaleDateString('ru-RU')+' · '+({grid:'Мир',combat:'Бой',race:'Гонка',perekos:'Магия'}[h.domain]||h.domain);
   const span=document.createElement('span');span.textContent=h.label;item.append(strong,span);$('cpHistory').append(item);}
 }
 function redraw(){
  const v=state();if(!v.active)return;
  profileOptions();
  const current=v.mode,setting=v.config[current],variant=$('hubVariant').selectedOptions[0]?.textContent||'Сцена';
  $('cpGoal').textContent=variant;
  $('cpBatchLabel').textContent=fmt($('hubBatch').value)+' '+setting.units;
  $('cpTrainLabel').textContent=v.active.branches[current].sessions?'Продолжить обучение':'Обучить агента';
  $('cpStop').hidden=!v.busy;$('cpTrain').hidden=v.busy;
  const locked=v.busy||v.pending||fighting;
  for(const id of ['cpAgent','cpProfile','cpSetup','cpTest','cpDuel','cpExpert','cpTrain','cpDetails'])$(id).disabled=locked;
  for(const button of document.querySelectorAll('[data-cp-mode]')){
   button.classList.toggle('cp-selected',button.dataset.cpMode===current);button.disabled=locked;
  }
  $('cpAgent').value=v.active.id;
  $('cpState').textContent=v.busy?$('hubProgressText').textContent:v.lastEval||v.active.branches[current].history.at(-1)?.label||'Выберите задачу и начните обучение.';
  $('cpBar').hidden=!v.busy;
  if(v.busy)$('cpBarFill').style.width=$('hubProgressFill').style.width;
  $('cpScenario').replaceChildren();
  for(const [value,text] of setting.variants){const o=document.createElement('option');o.value=value;o.textContent=text;$('cpScenario').append(o);}
  $('cpScenario').value=$('hubVariant').value;
  $('cpBatch').replaceChildren();
  for(const n of setting.counts){const o=document.createElement('option');o.value=String(n);o.textContent=fmt(n)+' '+setting.units;$('cpBatch').append(o);}
  $('cpBatch').value=$('hubBatch').value;
  $('cpSetupHelp').textContent=current==='grid'?'Эпизод — одна попытка пройти мир. Повторное обучение продолжит изученную Q-таблицу.':
   current==='combat'?'Поколение — серия боёв. Агент сохраняет только выбранные изменения тактики.':
   current==='race'?'Кандидат — новый вариант управления настоящим автомобилем.':
   'Поколение — боевые раунды против соперников и контрольная оценка.';
 }
 for(const el of document.querySelectorAll('[data-cp-mode]'))el.onclick=()=>document.querySelector('[data-world-mode="'+el.dataset.cpMode+'"]')?.click();
 $('cpAgent').onchange=e=>void api.switchAgent(e.target.value);
 $('cpTrain').onclick=()=>$('hubTrain').click();
 $('cpStop').onclick=()=>$('hubStop').click();
 $('cpTest').onclick=()=>$('hubTest').click();
 $('cpExpert').onclick=()=>{closeAll();api.expert();};
 $('cpSetup').onclick=()=>{$('cpSetupDialog').showModal();};
 $('cpScenario').onchange=e=>{api.updateChoice('variant',e.target.value);$('cpGoal').textContent=e.target.selectedOptions[0]?.textContent||'Сцена';};
 $('cpBatch').onchange=e=>api.updateChoice('batch',e.target.value);
 $('cpEditWorld').onclick=()=>{closeAll();api.expert();};
 $('cpProfile').onclick=()=>{drawProfile();$('cpProfileStatus').textContent='';$('cpProfileDialog').showModal();};
 $('cpDetails').onclick=()=>{drawProfile();$('cpProfileStatus').textContent='';$('cpProfileDialog').showModal();};
 $('cpProfileAgent').onchange=e=>{void api.switchAgent(e.target.value).then(()=>{drawProfile();redraw();});};
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
  profileOptions();$('cpDuelResult').replaceChildren();
  const enough=state().careers.length>=2;
  $('cpFight').disabled=!enough;
  $('cpDuelInfo').textContent=enough?'Два настоящих боя со сменой сторон. Используются боевые навыки выбранных персонажей.':
   'Создайте второго агента через профиль, затем обучите обоих в режиме «Бой».';
  $('cpDuelDialog').showModal();
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
   setStatus(a.name+' '+result.points[0]+' : '+result.points[1]+' '+b.name+' · просмотр боя');
  }catch(e){$('cpDuelResult').textContent='Бой: '+e.message;}
  finally{fighting=false;$('cpFight').disabled=false;redraw();}
 };
 const team=document.createElement('label');team.htmlFor='cpDuelTeam';team.textContent='Формат';
 const select=document.createElement('select');select.id='cpDuelTeam';
 for(const [value,text] of [['1','1 на 1'],['2','2 на 2']]){const opt=document.createElement('option');opt.value=value;opt.textContent=text;select.append(opt);}
 team.append(select);$('cpDuelArena').closest('label').after(team);
 window.addEventListener('petri:mode',()=>queueMicrotask(redraw));
 window.addEventListener('petri:progress',()=>queueMicrotask(redraw));
 window.addEventListener('petri:finished',()=>queueMicrotask(redraw));
 window.addEventListener('petri:evaluated',()=>queueMicrotask(redraw));
 window.addEventListener('petri:error',()=>queueMicrotask(redraw));
 window.addEventListener('petri:cockpit-sync',redraw);
 redraw();
 return {redraw,closeAll};
}