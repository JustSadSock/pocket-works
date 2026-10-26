import {readCombatNeural} from './agent-career.mjs';
const $=id=>document.getElementById(id);
const pc=v=>(100*v).toFixed(0)+'%';
export function mountNeuralCombat(api){
 const root=document.getElementById('agentHub');
 root.querySelector('.cockpit-main').insertAdjacentHTML('beforeend',
  '<button id="cpNeurocombat" class="cockpit-secondary cp-neuro-entry" type="button">Нейробой · PPO ↗</button>');
 root.insertAdjacentHTML('beforeend',`
 <dialog id="cpNeuroDialog" class="cp-dialog cp-neuro-dialog" aria-label="Нейробой">
  <div class="cp-dialog-head"><h2>Нейробой</h2><button id="cpNeuroClose" type="button" aria-label="Закрыть">×</button></div>
  <p class="cp-neuro-lead">Лучник и мечник учатся на настоящей физике боевой арены. Нейросеть сама выбирает момент атаки, сближение, отступление и обход.</p>
  <div class="cp-neuro-grid">
   <label>Кого обучаем<select id="cpNeuroRole">
    <option value="archer">Лучник · дальний бой</option><option value="swordsman">Мечник · ближний бой</option>
   </select></label>
   <label>Против кого<select id="cpNeuroEnemyRole">
    <option value="swordsman">Мечник</option><option value="archer">Лучник</option>
   </select></label>
   <label>Место обучения<select id="cpNeuroArena">
    <option value="open">Открытая арена</option><option value="cover" selected>Укрытия</option>
    <option value="hazards">Ловушки</option>
   </select></label>
   <label>Противник<select id="cpNeuroOpponent">
    <option value="baseline">Обычный боевой ИИ</option>
    <option value="self">Сохранённая версия себя</option>
    <option value="saved">Нейросеть другого агента</option>
   </select></label>
   <label id="cpNeuroOpponentRow" hidden>Агент-противник<select id="cpNeuroOpponentAgent"></select></label>
   <label>Длительность<select id="cpNeuroEpisodes">
    <option value="6">6 · проба</option><option value="12" selected>12 · короткая</option>
    <option value="30">30 · обычная</option><option value="60">60 · длительная</option>
   </select></label>
  </div>
  <p id="cpNeuroIdentity" class="cp-neuro-identity">Мозг бойца хранится отдельно от старой тактической политики.</p>
  <div class="cp-neuro-actions">
   <button id="cpNeuroTrain" class="cp-primary" type="button">Обучать бойца</button>
   <button id="cpNeuroStop" type="button" hidden>Остановить и сохранить</button>
  </div>
  <progress id="cpNeuroProgress" max="100" value="0" hidden></progress>
  <div id="cpNeuroStatus" role="status" aria-live="polite">Выберите класс и начните обучение.</div>
  <div id="cpNeuroTrainingResult" class="cp-neuro-results"></div>
  <section class="cp-neuro-duel">
   <h3>Контрольный поединок · обучение выключено</h3>
   <p>Столкните сохранённые нейросети на одной арене. Четыре настоящих боя с обменом сторон.</p>
   <div class="cp-neuro-duel-fields">
    <label>Первый боец<select id="cpNeuroFighterA"></select></label>
    <label>Класс<select id="cpNeuroFighterRoleA">
     <option value="archer">Лучник</option><option value="swordsman">Мечник</option>
    </select></label>
    <label>Второй боец<select id="cpNeuroFighterB"></select></label>
    <label>Класс<select id="cpNeuroFighterRoleB">
     <option value="swordsman">Мечник</option><option value="archer">Лучник</option>
    </select></label>
   </div>
   <button id="cpNeuroDuel" type="button">Начать поединок</button>
   <div id="cpNeuroDuelResult" aria-live="polite"></div>
  </section>
  <p class="cp-neuro-note">Обучение PPO происходит в браузере. Класс определяет доступное оружие; заранее запрограммированной боевой тактики у нейросети нет. Результат отдельной тренировки не гарантирует победу.</p>
 </dialog>`);
 let worker=null,mode=null,startedAt=0,trainedEpisodes=0;
 const status=message=>{$('cpNeuroStatus').textContent=message;};
 function refresh(){
  const state=api.state(),careers=state.careers.filter(c=>!c.archived),active=state.active;
  $('cpNeurocombat').hidden=state.mode!=='combat';
  $('cpNeurocombat').disabled=!!(state.busy||state.pending);
  if(worker)return;
  for(const id of ['cpNeuroOpponentAgent','cpNeuroFighterA','cpNeuroFighterB']){
   const el=$(id),previous=el.value;el.replaceChildren();
   for(const c of careers){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;el.append(o);}
   if(careers.some(c=>c.id===previous))el.value=previous;
   else el.value=id==='cpNeuroFighterB'?careers.find(c=>c.id!==active?.id)?.id||active?.id||'':active?.id||'';
  }
  $('cpNeuroIdentity').textContent=(active?.name||'Агент')+
   ' · лучник: '+(active?.combatNeural?.archer?.episodes||0)+
   ' эп. · мечник: '+(active?.combatNeural?.swordsman?.episodes||0)+' эп.';
  $('cpNeuroOpponentRow').hidden=$('cpNeuroOpponent').value!=='saved';
 }
 function lock(locked,task){
  mode=locked?task:null;
  api.onBusy(locked);
  for(const id of ['cpNeuroRole','cpNeuroEnemyRole','cpNeuroArena','cpNeuroOpponent',
   'cpNeuroOpponentAgent','cpNeuroEpisodes','cpNeuroTrain','cpNeuroDuel',
   'cpNeuroFighterA','cpNeuroFighterB','cpNeuroFighterRoleA','cpNeuroFighterRoleB'])
   $(id).disabled=locked;
  $('cpNeuroClose').disabled=locked;
  $('cpNeuroStop').hidden=!locked||task!=='train';
 }
 function release(){worker?.terminate();worker=null;lock(false);}
 $('cpNeurocombat').onclick=()=>{refresh();$('cpNeuroDialog').showModal();};
 $('cpNeuroClose').onclick=()=>$('cpNeuroDialog').close();
 $('cpNeuroDialog').addEventListener('cancel',event=>{if(worker)event.preventDefault();});
 $('cpNeuroOpponent').onchange=refresh;
 $('cpNeuroRole').onchange=()=>{
  $('cpNeuroFighterRoleA').value=$('cpNeuroRole').value;
  refresh();
 };
 function beginWorker(task,payload){
  if(worker||api.state().busy||api.state().pending){status('Завершите предыдущую операцию.');return false;}
  worker=new Worker(new URL('./neural-combat-worker.mjs',import.meta.url),{type:'module'});
  lock(true,task);startedAt=Date.now();trainedEpisodes=0;
  worker.onerror=event=>{release();status('Worker остановлен: '+(event.message||'ошибка вычисления'));};
  worker.onmessage=async event=>{
   const result=event.data||{};
   if(result.type==='started'){
    status('Проверка до обучения: '+pc(result.baseline.winRate)+' побед на '+result.baseline.count+' боях.');
   }else if(result.type==='progress'){
    trainedEpisodes=result.completed;
    $('cpNeuroProgress').value=Math.round(100*result.completed/result.episodes);
    status('Обучение: '+result.completed+' / '+result.episodes+' боёв · побед '+result.wins+
     ' · обновлений весов '+result.updates);
   }else if(result.type==='trained'||result.type==='stopped'){
    if(result.completed){
     try{
      await api.saveNeural($('cpNeuroRole').value,result.model,{
       episodes:result.completed,winRate:result.validation.winRate
      });
      const panel=$('cpNeuroTrainingResult');
      panel.textContent='До: '+pc(result.baseline.winRate)+' · после: '+pc(result.validation.winRate)+
       ' · контроль: '+result.validation.count+' боёв · урон '+result.validation.damage.toFixed(1)+
       ' · обновлений весов '+result.model.updates+'.';
      status(result.type==='trained'?'Обучение завершено. Мозг сохранён.':'Остановлено. Полученный опыт сохранён.');
     }catch(e){status('Не удалось сохранить модель: '+e.message+'. Повторите обучение или экспортируйте позже.');}
    }else status('Остановлено до первого боя. Старый мозг не изменён.');
    release();refresh();
   }else if(result.type==='duel'){
    release();
    const match=result.match;
    $('cpNeuroDuelResult').textContent='Счёт '+match.points.join(' : ')+
     (match.winner<0?' · ничья':match.winner===0?' · победил первый боец':' · победил второй боец')+
     ' · '+match.matches.length+' боя.';
    status('Поединок завершён. Показывается повтор первого боя на настоящей арене.');
    $('cpNeuroDialog').close();
    try{api.replay(match);}catch(e){status('Повтор недоступен: '+e.message);}
   }else if(result.type==='error'){release();status('Нейробой: '+result.message);}
  };
  worker.postMessage({type:task,payload});
  return true;
 }
 $('cpNeuroTrain').onclick=async()=>{
  if(worker)return;
  const active=api.state().active,role=$('cpNeuroRole').value,enemyRole=$('cpNeuroEnemyRole').value;
  try{
   const snapshot=await readCombatNeural(active,role);
   const opponent=$('cpNeuroOpponent').value;
   let enemySnapshot=null;
   if(opponent==='self'){
    if(!snapshot)throw Error('Сначала обучите бойца против обычного ИИ, затем используйте его прошлую версию.');
    enemySnapshot=snapshot;
   }else if(opponent==='saved'){
    const other=api.state().careers.find(c=>c.id===$('cpNeuroOpponentAgent').value);
    if(!other)throw Error('Не найден агент-противник');
    enemySnapshot=await readCombatNeural(other,enemyRole);
    if(!enemySnapshot)throw Error('У выбранного агента ещё нет обученного мозга этого класса.');
   }
   $('cpNeuroTrainingResult').textContent='';$('cpNeuroProgress').hidden=false;$('cpNeuroProgress').value=0;
   beginWorker('train',{role,enemyRole,arena:$('cpNeuroArena').value,
    episodes:Number($('cpNeuroEpisodes').value),seed:411,snapshot,enemySnapshot});
  }catch(e){status('Нельзя начать обучение: '+e.message);}
 };
 $('cpNeuroStop').onclick=()=>{if(worker&&mode==='train')worker.postMessage({type:'stop'});};
 $('cpNeuroDuel').onclick=async()=>{
  if(worker)return;
  const state=api.state(),a=state.careers.find(c=>c.id===$('cpNeuroFighterA').value),
    b=state.careers.find(c=>c.id===$('cpNeuroFighterB').value),
    roleA=$('cpNeuroFighterRoleA').value,roleB=$('cpNeuroFighterRoleB').value;
  try{
   if(!a||!b)throw Error('Выберите двух бойцов');
   if(a.id===b.id&&roleA===roleB)throw Error('Выберите разных агентов или разные классы.');
   const [brainA,brainB]=await Promise.all([readCombatNeural(a,roleA),readCombatNeural(b,roleB)]);
   if(!brainA||!brainB)throw Error('Сначала обучите обоих выбранных бойцов.');
   $('cpNeuroDuelResult').textContent='Проходят четыре контрольных боя…';
   beginWorker('duel',{a:brainA,b:brainB,roleA,roleB,arena:$('cpNeuroArena').value,seed:707,legs:4});
  }catch(e){$('cpNeuroDuelResult').textContent='Поединок: '+e.message;}
 };
 return {refresh,isBusy:()=>!!worker};
}
