import {readCombatNeural} from './agent-career.mjs';
import {showWorkbenchDialog} from './ui-navigation.mjs';
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
   <label>Режим обучения<select id="cpNeuroMethod">
    <option value="train">Обычная тренировка</option>
    <option value="league">Лига поколений · self-play</option>
    <option value="duo">Два обучающихся бойца · PPO × PPO</option>
   </select></label>
   <label id="cpNeuroOpponentLabel">Противник<select id="cpNeuroOpponent">
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
  <p id="cpNeuroDuoIntro" class="cp-neuro-league-intro" hidden>Оба бойца учатся в каждом общем бою: один лучник и один мечник. Каждые 6 матчей их замороженные модели проходят проверки друг против друга и против обычного ИИ на трёх аренах. Оба мозга сохраняются вместе.</p>
  <p id="cpNeuroLeagueIntro" class="cp-neuro-league-intro" hidden>Каждые 6 боёв — новая замороженная версия бойца. Противники чередуются: обычный ИИ, начальная нейросеть, последняя версия и архив. Проверка на трёх аренах не обучает мозг.</p>
  <p id="cpNeuroIdentity" class="cp-neuro-identity">Мозг бойца хранится отдельно от старой тактической политики.</p>
  <div class="cp-neuro-actions">
   <button id="cpNeuroTrain" class="cp-primary" type="button">Обучать бойца</button>
   <button id="cpNeuroStop" type="button" hidden>Остановить и сохранить</button>
  </div>
  <progress id="cpNeuroProgress" max="100" value="0" hidden></progress>
  <div id="cpNeuroStatus" role="status" aria-live="polite">Выберите класс и начните обучение.</div>
  <div id="cpNeuroTrainingResult" class="cp-neuro-results"></div>
  <section id="cpNeuroLeagueHistory" class="cp-neuro-league-history" hidden>
   <h3>История поколений</h3>
   <div id="cpNeuroLeaguePlot" class="cp-neuro-league-plot"></div>
   <div id="cpNeuroLeagueRows" class="cp-neuro-league-rows"></div>
   <p>Контроль: по 2 боя на каждой из трёх арен, без обновления весов. Малая выборка показывает тенденции, а не доказывает преимущество.</p>
  </section>
  <button id="cpNeuroRetry" type="button" hidden>Повторить сохранение мозга</button>
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
 let worker=null,mode=null,startedAt=0,trainedEpisodes=0,unsaved=null;
 let lastRosterSignature='',lastLeagueShown='',leagueGenerations=[];
 const status=message=>{$('cpNeuroStatus').textContent=message;};
 function showLeague(generations,roles=null){
  const rows=$('cpNeuroLeagueRows'),plot=$('cpNeuroLeaguePlot');
  rows.replaceChildren();plot.replaceChildren();
  $('cpNeuroLeagueHistory').hidden=!generations?.length;
  if(!generations?.length)return;
  for(const g of generations){
   const item=document.createElement('div');item.className='cp-neuro-league-row';
   const label=document.createElement('span');label.textContent='Поколение '+g.generation;
   const rates=roles?[g.evaluation.fixed[roles[0]].winRate,g.evaluation.fixed[roles[1]].winRate]:[g.validation.winRate];
   const value=document.createElement('strong');
   value.textContent=rates.map(pc).join(' / ');
   const meta=document.createElement('small');meta.textContent=roles?g.episodes+' боёв · PPO '+g.updatesA+' / '+g.updatesB:g.episodes+' боёв · '+g.updates+' обновлений';
   item.append(label,value,meta);rows.append(item);
   const bar=document.createElement('div');bar.className='cp-neuro-league-bar';
   bar.title='Поколение '+g.generation+': '+rates.map(pc).join(' / ');
   for(let i=0;i<rates.length;i++){
    const fill=document.createElement('span');
    fill.style.height=Math.max(3,rates[i]*100)+'%';
    if(roles)fill.style.background=i===0?'#4d9166':'#bd8f51';
    bar.append(fill);
   }
   if(roles)bar.classList.add('cp-neuro-duo-bar');
   plot.append(bar);
  }
 }
 function updateMethod(){
  const league=$('cpNeuroMethod').value==='league';
  const duo=$('cpNeuroMethod').value==='duo';
  $('cpNeuroOpponentLabel').hidden=league||duo;
  $('cpNeuroLeagueIntro').hidden=!league;
  $('cpNeuroDuoIntro').hidden=!duo;
  $('cpNeuroOpponentRow').hidden=league||duo||$('cpNeuroOpponent').value!=='saved';
  $('cpNeuroTrain').textContent=duo?'Обучать обоих':league?'Начать лигу поколений':'Обучать бойца';
 }
 function refresh(){
  const state=api.state(),careers=state.careers.filter(c=>!c.archived),active=state.active;
  $('cpNeurocombat').hidden=state.mode!=='combat';
  $('cpNeurocombat').disabled=!!(state.busy||state.pending);
  if(worker)return;
  // Do not destroy native select menus on every training progress / state sync.
  const rosterSignature=JSON.stringify(careers.map(c=>[c.id,c.name]));
  if(rosterSignature!==lastRosterSignature){
   for(const id of ['cpNeuroOpponentAgent','cpNeuroFighterA','cpNeuroFighterB']){
    const el=$(id),previous=el.value;el.replaceChildren();
    for(const c of careers){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;el.append(o);}
    if(careers.some(c=>c.id===previous))el.value=previous;
    else el.value=id==='cpNeuroFighterB'?careers.find(c=>c.id!==active?.id)?.id||active?.id||'':active?.id||'';
   }
   lastRosterSignature=rosterSignature;
  }
  $('cpNeuroIdentity').textContent=(active?.name||'Агент')+
   ' · лучник: '+(active?.combatNeural?.archer?.episodes||0)+
   ' эп. · мечник: '+(active?.combatNeural?.swordsman?.episodes||0)+' эп.';
  updateMethod();
  const role=$('cpNeuroRole').value,entry=active?.combatNeural?.[role]?.history?.at(-1),key=active?.id+'|'+role+'|'+(entry?.at||'');
  if(key!==lastLeagueShown){
   lastLeagueShown=key;
   if(entry?.coevolution?.generations)showLeague(entry.coevolution.generations,entry.coevolution.roles);
   else showLeague(entry?.league?.generations||null);
  }
 }
 function lock(locked,task){
  mode=locked?task:null;
  api.onBusy(locked);
  for(const id of ['cpNeuroRole','cpNeuroEnemyRole','cpNeuroArena','cpNeuroOpponent','cpNeuroMethod',
   'cpNeuroOpponentAgent','cpNeuroEpisodes','cpNeuroTrain','cpNeuroDuel',
   'cpNeuroFighterA','cpNeuroFighterB','cpNeuroFighterRoleA','cpNeuroFighterRoleB'])
   $(id).disabled=locked;
  $('cpNeuroClose').disabled=locked;
  $('cpNeuroStop').hidden=!locked||!['train','league','duo'].includes(task);
 }
 function release(){worker?.terminate();worker=null;lock(false);}
 $('cpNeurocombat').onclick=()=>{refresh();showWorkbenchDialog($('cpNeuroDialog'));};
 $('cpNeuroClose').onclick=()=>$('cpNeuroDialog').close();
 $('cpNeuroDialog').addEventListener('cancel',event=>{if(worker)event.preventDefault();});
 $('cpNeuroOpponent').onchange=updateMethod;
 $('cpNeuroMethod').onchange=updateMethod;
 $('cpNeuroRole').onchange=()=>{
  $('cpNeuroFighterRoleA').value=$('cpNeuroRole').value;
  refresh();
 };
 function beginWorker(task,payload){
  if(worker||api.state().busy||api.state().pending){status('Завершите предыдущую операцию.');return false;}
  if(unsaved){status('Сначала повторите сохранение предыдущего мозга, чтобы не потерять его.');return false;}
  worker=new Worker(new URL('./neural-combat-worker.mjs',import.meta.url),{type:'module'});
  lock(true,task);startedAt=Date.now();trainedEpisodes=0;
  worker.onerror=event=>{release();status('Worker остановлен: '+(event.message||'ошибка вычисления'));};
  worker.onmessage=async event=>{
   const result=event.data||{};
   if(result.type==='duo-started'){
    const base=result.baseline;
    leagueGenerations=[{generation:0,episodes:0,updatesA:0,updatesB:0,evaluation:base}];
    showLeague(leagueGenerations,[$('cpNeuroRole').value,$('cpNeuroEnemyRole').value]);
    status('Совместное обучение началось · лучник и мечник получают независимые градиенты PPO.');
   }else if(result.type==='duo-progress'){
    trainedEpisodes=result.completed;
    $('cpNeuroProgress').value=Math.round(100*result.completed/result.episodes);
    status('Оба учатся · бой '+result.completed+'/'+result.episodes+
     ' · арена '+result.arena+' · обновления '+result.updatesA+' / '+result.updatesB);
   }else if(result.type==='duo-generation'){
    const g=result.generation;
    leagueGenerations=[...leagueGenerations.filter(row=>row.generation!==g.generation),g];
    showLeague(leagueGenerations,[$('cpNeuroRole').value,$('cpNeuroEnemyRole').value]);
    status('Поколение '+g.generation+' проверено · '+g.episodes+' общих боёв, две независимые политики.');
   }else if(result.type==='league-started'){
    status('Лига началась · начальная доля побед на контрольных аренах: '+pc(result.baseline.winRate));
    leagueGenerations=[{generation:0,episodes:0,updates:0,validation:result.baseline}];showLeague(leagueGenerations);
   }else if(result.type==='league-progress'){
    trainedEpisodes=result.completed;
    $('cpNeuroProgress').value=Math.round(100*result.completed/result.episodes);
    status('Лига · бой '+result.completed+'/'+result.episodes+
     ' · поколение '+Math.ceil(result.completed/6)+
     ' · противник: '+({baseline:'обычный ИИ',initial:'начальная версия',latest:'последняя версия',archive:'архив'}[result.record.opponent])+
     ' · обновлений весов '+result.updates);
   }else if(result.type==='league-generation'){
    const g=result.generation;
    const live=[...leagueGenerations.filter(row=>row.generation!==g.generation),g];
    leagueGenerations=live;
    showLeague(live);
    status('Поколение '+g.generation+' завершено · контрольная доля побед '+pc(g.validation.winRate)+
      ' · всего '+g.episodes+' боёв.');
   }else if(result.type==='started'){
    status('Проверка до обучения: '+pc(result.baseline.winRate)+' побед на '+result.baseline.count+' боях.');
   }else if(result.type==='progress'){
    trainedEpisodes=result.completed;
    $('cpNeuroProgress').value=Math.round(100*result.completed/result.episodes);
    status('Обучение: '+result.completed+' / '+result.episodes+' боёв · побед '+result.wins+
     ' · обновлений весов '+result.updates);
   }else if(['duo-complete','duo-stopped'].includes(result.type)){
    const data=result.report,save={
     type:'duo',roleA:data.roleA,modelA:data.modelA,roleB:data.roleB,modelB:data.modelB,
     report:{episodes:data.completed,report:{seed:data.seed,generations:data.generations}}
    };
    if(data.completed){
     try{
      await api.saveNeuralDuo(save.roleA,save.modelA,save.roleB,save.modelB,save.report);
      unsaved=null;$('cpNeuroRetry').hidden=true;
      showLeague(data.generations,[data.roleA,data.roleB]);
      $('cpNeuroTrainingResult').textContent='Контроль против обычного ИИ · '+data.roleA+': '+
       pc(data.after.fixed[data.roleA].winRate)+' · '+data.roleB+': '+
       pc(data.after.fixed[data.roleB].winRate)+' · '+data.completed+' общих боёв.';
      status(data.stopped?'Остановлено. Оба мозга сохранены.':'Оба мозга и история поколений сохранены.');
     }catch(error){
      unsaved=save;$('cpNeuroRetry').hidden=false;
      status('Не удалось сохранить обоих бойцов: '+error.message+'. Повторите сохранение.');
     }
    }else status('Остановлено до первого боя. Предыдущие мозги не изменены.');
    release();refresh();
   }else if(['trained','stopped','league-complete','league-stopped'].includes(result.type)){
    const league=result.type.startsWith('league-');
    const data=league?result.report:result,validation=league?data.after:data.validation,
      baseline=data.baseline||data.initial,completed=data.completed;
    if(completed){
     const save={role:$('cpNeuroRole').value,model:data.model,
      report:{episodes:completed,winRate:validation.winRate,
       ...(league?{league:{generations:data.generations.map(g=>({
        generation:g.generation,episodes:g.episodes,updates:g.updates,validation:g.validation
       })),seed:data.seed,role:data.role}}:{})}};
     try{
      await api.saveNeural(save.role,save.model,save.report);
      unsaved=null;$('cpNeuroRetry').hidden=true;
      $('cpNeuroTrainingResult').textContent='До: '+pc(baseline.winRate)+' · после: '+pc(validation.winRate)+
       ' · контроль: '+validation.count+' боёв · урон '+validation.damage.toFixed(1)+
       ' · обновлений весов '+data.model.updates+'.';
      if(league)showLeague(data.generations);
      status(data.stopped||result.type==='stopped'?'Остановлено. Полученный опыт сохранён.':
       'Обучение завершено. Мозг сохранён.');
     }catch(e){unsaved=save;$('cpNeuroRetry').hidden=false;
      status('Не удалось сохранить модель: '+e.message+'. Повторите сохранение — обученные веса ещё в памяти.');}
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
 $('cpNeuroRetry').onclick=async()=>{
  if(!unsaved||worker)return;
  $('cpNeuroRetry').disabled=true;
  try{
   if(unsaved.type==='duo')await api.saveNeuralDuo(unsaved.roleA,unsaved.modelA,unsaved.roleB,unsaved.modelB,unsaved.report);
   else await api.saveNeural(unsaved.role,unsaved.model,unsaved.report);
   unsaved=null;$('cpNeuroRetry').hidden=true;
   status('Нейромозг успешно сохранён.');refresh();
  }catch(e){status('Сохранение снова не удалось: '+e.message);}
  finally{$('cpNeuroRetry').disabled=false;}
 };
 $('cpNeuroTrain').onclick=async()=>{
  if(worker||unsaved){if(unsaved)status('Сначала повторите сохранение предыдущего мозга.');return;}
  const active=api.state().active,role=$('cpNeuroRole').value,enemyRole=$('cpNeuroEnemyRole').value;
  try{
   const snapshot=await readCombatNeural(active,role);
   const opponent=$('cpNeuroOpponent').value;
   let enemySnapshot=null;
   if(['league','duo'].includes($('cpNeuroMethod').value)){
    if($('cpNeuroMethod').value==='duo'&&role===enemyRole)throw Error('Выберите двух разных бойцов: лучника и мечника.');
    // League opponents are generated by the worker; no external model required.
   }else if(opponent==='self'){
    if(!snapshot)throw Error('Сначала обучите бойца против обычного ИИ, затем используйте его прошлую версию.');
    enemySnapshot=snapshot;
   }else if(opponent==='saved'){
    const other=api.state().careers.find(c=>c.id===$('cpNeuroOpponentAgent').value);
    if(!other)throw Error('Не найден агент-противник');
    enemySnapshot=await readCombatNeural(other,enemyRole);
    if(!enemySnapshot)throw Error('У выбранного агента ещё нет обученного мозга этого класса.');
   }
   const league=$('cpNeuroMethod').value==='league';
   const duo=$('cpNeuroMethod').value==='duo';
   if(league||duo)enemySnapshot=null; // Archive opponents are frozen copies of this learner.
   $('cpNeuroTrainingResult').textContent='';$('cpNeuroProgress').hidden=false;$('cpNeuroProgress').value=0;
   leagueGenerations=[];if(league)showLeague(null);
   const episodes=Number($('cpNeuroEpisodes').value),arena=$('cpNeuroArena').value,
    seed=411+(active?.combatNeural?.[role]?.episodes||0)*977;
   if(duo){
    const snapshotB=await readCombatNeural(active,enemyRole);
    beginWorker('duo',{roleA:role,roleB:enemyRole,arena,episodes,seed,
     snapshotA:snapshot,snapshotB});
   }else beginWorker(league?'league':'train',{role,enemyRole,arena,episodes,seed,snapshot,enemySnapshot});
  }catch(e){status('Нельзя начать обучение: '+e.message);}
 };
 $('cpNeuroStop').onclick=()=>{if(worker&&['train','league','duo'].includes(mode))worker.postMessage({type:'stop'});};
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
