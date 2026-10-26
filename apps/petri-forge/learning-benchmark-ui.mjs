// The experiment panel is deliberately separate from career training:
// benchmarking uses fresh, temporary brains and never mutates an agent profile.
import {showWorkbenchDialog} from './ui-navigation.mjs';
const STORAGE='pocket-works:petri-forge:benchmark:last';
const NAMES={qlearning:'Q-learning',neural:'Actor–Critic',ppo:'PPO-Clip'};
const fmtRate=value=>(100*value).toFixed(1)+'%';
const fmtDelta=value=>(value>=0?'+':'')+(value*100).toFixed(1)+' п.п.';
const $=id=>document.getElementById(id);
const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b;};
export function mountLearningBenchmark(api){
 const host=document.getElementById('agentHub');
 const rail=host.querySelector('.cp-insights');
 rail.insertAdjacentHTML('beforeend',`
 <button id="cpBenchmark" class="cp-observe-toggle" type="button">Сравнить алгоритмы ↗</button>`);
 host.insertAdjacentHTML('beforeend',`
 <dialog id="cpBenchmarkDialog" class="cp-dialog cp-benchmark-dialog" aria-label="Лаборатория сравнений">
  <div class="cp-dialog-head"><h2>Сравнение обучения</h2><button id="cpBenchClose" type="button" aria-label="Закрыть">×</button></div>
  <p class="cp-bench-explain">Три новых, независимых мозга учатся на одной карте с одинаковыми стартами. Затем проверяются на одних и тех же незнакомых картах, без обучения.</p>
  <div class="cp-bench-fields">
   <label>Задача<select id="cpBenchWorld">
    <option value="corridor">Первый маршрут</option>
    <option value="maze">Запутанные коридоры</option>
    <option value="hazards">Опасная территория</option>
    <option value="rewards">Сбор ресурсов</option>
    <option value="switchback">Обход барьеров</option>
    <option value="rooms">Комнаты</option>
   </select></label>
   <label>Попыток на мозг<select id="cpBenchEpisodes">
    <option value="10">10 · быстрая проверка</option>
    <option value="40" selected>40 · обзор</option>
    <option value="100">100 · исследование</option>
    <option value="200">200 · длительно</option>
   </select></label>
   <label>Независимых повторов<select id="cpBenchRuns">
    <option value="1" selected>1 · разведка</option>
    <option value="3">3 · устойчивость результатов</option>
   </select></label>
  </div>
  <div class="cp-bench-controls"><button id="cpBenchStart" type="button" class="cp-primary">Начать сравнение</button>
   <button id="cpBenchStop" type="button" hidden>Остановить</button>
   <button id="cpBenchExport" type="button" disabled>Экспорт JSON</button></div>
  <div id="cpBenchStatus" role="status" aria-live="polite">Готов к эксперименту. Существующие агенты не изменятся.</div>
  <progress id="cpBenchProgress" max="100" value="0" hidden></progress>
  <div id="cpBenchResults" class="cp-bench-results">
   <p class="cp-bench-empty">Здесь появятся реальные результаты до и после обучения: победы, награды и скорость вычислений.</p>
  </div>
  <p class="cp-bench-caveat">Один запуск не доказывает превосходство алгоритма. Процент побед измеряется на отложенных картах; скорость зависит от устройства. У разных алгоритмов может быть разное число шагов за одинаковое число эпизодов.</p>
 </dialog>`);
 let worker=null,report=null,busy=false,progress=0;
 const setStatus=text=>{$('cpBenchStatus').textContent=text;};
 function lock(locked){
  busy=locked;
  api.onBusyChange?.(locked);
  for(const id of ['cpBenchWorld','cpBenchEpisodes','cpBenchRuns','cpBenchStart'])$(id).disabled=locked;
  $('cpBenchStop').hidden=!locked;$('cpBenchExport').disabled=locked||!report;
  $('cpBenchmark').disabled=locked&&api.state().busy;
 }
 function showReport(value){
  $('cpBenchResults').replaceChildren();
  if(!value?.completed||!value.summary)return;
  const table=document.createElement('table');
  const head=document.createElement('thead'),header=document.createElement('tr');
  for(const text of ['Алгоритм','До','После','Изменение','Награда','Шагов/с']){
   const th=document.createElement('th');th.textContent=text;header.append(th);
  }
  head.append(header);table.append(head);
  const body=document.createElement('tbody');
  for(const name of ['qlearning','neural','ppo']){
   const data=value.summary[name],row=document.createElement('tr');row.dataset.algorithm=name;
   const cells=[NAMES[name],fmtRate(data.before.winRate),fmtRate(data.after.winRate),
    fmtDelta(data.deltaWinRate),data.after.meanReward.toFixed(2),
    Math.round(data.stepsPerSecond).toLocaleString('ru-RU')];
   cells.forEach((cell,index)=>{const td=document.createElement('td');td.textContent=cell;if(index===3)td.className=data.deltaWinRate>0?'cp-bench-up':data.deltaWinRate<0?'cp-bench-down':'';row.append(td);});
   body.append(row);
   const detail=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='cp-bench-detail';
   td.textContent='Награда: '+data.before.meanReward.toFixed(2)+' → '+data.after.meanReward.toFixed(2)+
    ' · средний бюджет '+Math.round(data.meanTrainingSteps).toLocaleString('ru-RU')+' шагов'+
    ' · '+Object.entries(data.byFamily).map(([family,x])=>family+': '+fmtRate(x.initialRate)+' → '+fmtRate(x.winRate)).join(' · ');
   detail.append(td);body.append(detail);
  }
  table.append(body);$('cpBenchResults').append(table);
  const note=document.createElement('p');note.className='cp-bench-note';
  note.textContent=value.options.runs+' независимых запусков · '+value.options.episodes+
   ' эпизодов на алгоритм за запуск · '+value.runs[0].holdoutCases.length+
   ' одинаковых контрольных случаев на каждый алгоритм и запуск. Результаты не были использованы для обучения.';
  $('cpBenchResults').append(note);
 }
 function persistReport(value){
  report=value;showReport(value);$('cpBenchExport').disabled=false;
  try{localStorage.setItem(STORAGE,JSON.stringify(value));}catch{
   setStatus('Результат показан, но не сохранился в памяти браузера. Экспортируйте JSON.');
  }
 }
 function cleanWorker(){
  worker?.terminate();worker=null;lock(false);
 }
 $('cpBenchmark').onclick=()=>{showWorkbenchDialog($('cpBenchmarkDialog'));};
 $('cpBenchClose').onclick=()=>{
  if(busy){cleanWorker();setStatus('Эксперимент остановлен при закрытии окна.');}
  $('cpBenchmarkDialog').close();
 };
 $('cpBenchmarkDialog').addEventListener('close',()=>{
  if(busy){cleanWorker();setStatus('Эксперимент остановлен при закрытии окна.');}
 });
 $('cpBenchStart').onclick=()=>{
  if(busy)return;
  if(api.state().busy||api.state().pending){setStatus('Сначала завершите обучение или испытание агента.');return;}
  report=null;$('cpBenchExport').disabled=true;
  $('cpBenchResults').innerHTML='<p class="cp-bench-empty">Идёт обучение трёх свежих мозгов. Ваши сохранения не меняются.</p>';
  progress=0;$('cpBenchProgress').hidden=false;$('cpBenchProgress').value=0;
  lock(true);setStatus('Запускается независимое сравнение…');
  worker=new Worker(new URL('./learning-benchmark-worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=event=>{
   const data=event.data||{};
   if(data.type==='progress'){
    const p=data.progress;progress=Math.round(100*p.completed/p.total);
    $('cpBenchProgress').value=progress;
    setStatus(NAMES[p.algorithm]+' · повтор '+p.run+' · '+p.completed+' / '+p.total+' эпизодов');
   }else if(data.type==='partial'){
    const p=data.result;setStatus(NAMES[p.algorithm]+' · проверка на отложенных картах завершена. Продолжаем.');
   }else if(data.type==='complete'){
    cleanWorker();$('cpBenchProgress').value=100;
    persistReport(data.report);setStatus('Сравнение завершено. Все контрольные матчи проходили с замороженными мозгами.');
   }else if(data.type==='error'){
    cleanWorker();setStatus('Ошибка сравнения: '+data.message);
   }
  };
  worker.onerror=e=>{cleanWorker();setStatus('Worker сравнения остановлен: '+(e.message||'неизвестная ошибка'));};
  worker.postMessage({type:'start',options:{
   scenario:$('cpBenchWorld').value,episodes:Number($('cpBenchEpisodes').value),
   runs:Number($('cpBenchRuns').value),maxSteps:120,seed:4093
  }});
 };
 $('cpBenchStop').onclick=()=>{if(!busy)return;cleanWorker();setStatus('Сравнение остановлено. Существующие агенты не затронуты.');$('cpBenchProgress').hidden=true;};
 $('cpBenchExport').onclick=()=>{
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='petriforge-comparison-'+report.options.scenario+'.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
 };
 try{
  const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');
  if(saved?.type==='petri-forge-learning-benchmark'&&saved.completed&&saved.schema===1&&saved.summary){
   report=saved;showReport(saved);$('cpBenchExport').disabled=false;setStatus('Восстановлен последний результат сравнения.');
  }
 }catch{/* local storage can be disabled; UI remains fully usable */}
 return {update:()=>{
  $('cpBenchmark').hidden=api.state().mode!=='grid';
  $('cpBenchmark').disabled=api.state().busy||api.state().pending;
 }};
}
