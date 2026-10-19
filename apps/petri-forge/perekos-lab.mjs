import './perekos-shell.mjs';
import {createPerekosPolicy,validatePerekosPolicy,tacticalTransfer,MAGE_CHOICES} from './perekos-policy.mjs';
import {listModels,loadModel,saveModel,deleteModel} from './model-store.mjs';
import {WALLS} from '../perekos/core.mjs';

const $=id=>document.getElementById(id);
const canvas=$('pkCanvas'),ctx=canvas.getContext('2d');
const focusBox=document.createElement('div');
focusBox.className='pk-curriculum-choices';
focusBox.innerHTML='<div class="split"><label class="stack">Программа обучения <select id="pkCurriculum"><option value="balanced">От простого к сложному</option><option value="offense">Атака и добивание</option><option value="competitive">Сильные соперники</option></select></label><label class="stack">Контрольный соперник <select id="pkRivalStyle"><option value="native">Игровой ИИ</option><option value="aggressive">Агрессивный</option><option value="evasive">Уклоняющийся</option><option value="defensive">Защитный</option><option value="dummy">Неподвижный</option><option value="charger">Преследователь</option></select></label></div>';
$('pkGenerations').closest('.split').after(focusBox);
const metricsBox=document.createElement('div');metricsBox.className='pk-quality-panel';
metricsBox.innerHTML='<div class="section-label">КАЧЕСТВО ОБУЧЕНИЯ · КОНТРОЛЬНЫЕ SEED</div><canvas id="pkLearningChart" width="380" height="125" aria-label="График оценки и принятия политик"></canvas><div class="pk-quality-score"><span id="pkRoundStats">Раунды: нет данных</span><span id="pkMatchStats">Матчи: нет данных</span></div><small id="pkLeagueSize">Архив противников: 1</small>';
$('pkValidation').before(metricsBox);
const compareButton=document.createElement('button');compareButton.id='pkCompareTransfer';compareButton.className='btn-outline full-width';compareButton.textContent='Сравнить до переноса';$('pkTransfer').before(compareButton);

const worker=new Worker(new URL('./perekos-worker-v06.mjs',import.meta.url),{type:'module'});
let policy=createPerekosPolicy(41),busy=false,training=false,replay=null,cursor=0,timer=null,openCount=0,learningHistory=[];
let autoplayNextReplay=false;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=n=>Number.isFinite(n)?Number(n).toFixed(1):'—';
function notify(message){$('pkStatus').textContent=message;const footer=$('modeStatus');if(footer)footer.textContent=message;}
for(const id of ['pkMage','pkEnemy']){
 for(const item of MAGE_CHOICES){const option=document.createElement('option');option.value=item.id;option.textContent=item.name+' · '+({fire:'Жар',storm:'Ток',stone:'Камень'}[item.school]);$(id).append(option);}
}
$('pkMage').value='kindle';$('pkEnemy').value='pebble';
function settings(){
 const mage=$('pkMage').value,opponent=$('pkEnemy').value;
 if(!MAGE_CHOICES.some(m=>m.id===mage)||!MAGE_CHOICES.some(m=>m.id===opponent))throw Error('Недопустимый маг');
 return {mage,opponent,curriculum:$('pkCurriculum').value,seed:(Number($('pkSeed').value)>>>0)||41};
}
function send(type,payload={}){worker.postMessage({type,payload});}
function lock(value,isTraining=false){
 busy=value;training=isTraining;
 for(const id of ['pkTrain','pkTest','pkTournament','pkReset','pkSave','pkLoad','pkDelete','pkExport','pkImport','pkTransfer','pkMage','pkEnemy','pkSeed','pkGenerations','pkCurriculum','pkRivalStyle','pkCompareTransfer'])$(id).disabled=value;
 $('pkStop').disabled=!isTraining;
}
function drawLearning(){
 const c=$('pkLearningChart'),g=c.getContext('2d'),w=c.width,h=c.height;g.clearRect(0,0,w,h);
 g.fillStyle='#18282f';g.fillRect(0,0,w,h);
 g.strokeStyle='#3c5962';g.lineWidth=1;
 for(const y of [22,60,99]){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
 if(!learningHistory.length){g.fillStyle='#adbec7';g.font='12px system-ui';g.fillText('Обучите агента, чтобы увидеть эволюцию',16,69);return;}
 const values=learningHistory.map(x=>x.fitness),lo=Math.min(...values,-5),hi=Math.max(...values,5),span=Math.max(1,hi-lo);
 g.beginPath();
 learningHistory.forEach((p,i)=>{const x=14+i*(w-28)/Math.max(1,learningHistory.length-1),y=10+(h-24)*(1-(p.fitness-lo)/span);if(i===0)g.moveTo(x,y);else g.lineTo(x,y);});
 g.strokeStyle='#b5dfbb';g.lineWidth=3;g.lineJoin='round';g.stroke();
 learningHistory.forEach((p,i)=>{const x=14+i*(w-28)/Math.max(1,learningHistory.length-1),y=10+(h-24)*(1-(p.fitness-lo)/span);g.fillStyle='#d7efd0';g.beginPath();g.arc(x,y,3,0,Math.PI*2);g.fill();});
}
function stopPlayback(){
 if(timer!==null){clearInterval(timer);timer=null;}
 $('pkPlay').textContent='▶ Воспроизвести';
}
function school(id){return ['kindle','cinder'].includes(id)?'fire':['wire','coil'].includes(id)?'storm':'stone';}
function paintFrame(frame){
 if(!frame)return;
 const W=400,H=620;
 ctx.clearRect(0,0,W,H);
 const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#292b31');bg.addColorStop(.55,'#262e36');bg.addColorStop(1,'#282b31');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 // Mineral slabs: the geometry is a functional compass for real movement.
 for(let y=0;y<H;y+=38)for(let x=0;x<W;x+=38){
  ctx.strokeStyle=(x+y)%76===0?'#43505a':'#364048';ctx.lineWidth=1;ctx.strokeRect(x+2,y+2,33,33);
 }
 ctx.fillStyle='#111b23';ctx.strokeStyle='#73818a';ctx.lineWidth=3;
 for(const w of WALLS){ctx.fillRect(w.x+6,w.y+7,w.w,w.h);ctx.fillStyle='#46575f';ctx.fillRect(w.x,w.y,w.w,w.h);ctx.strokeRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#111b23';}
 for(const b of frame.barriers||[]){ctx.fillStyle='#a8bcb8';ctx.globalAlpha=.6;ctx.beginPath();ctx.arc(b.x,b.y,b.r||14,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
 for(const m of frame.mines||[]){ctx.strokeStyle=m.owner===0?'#e6b676':'#ab86d4';ctx.lineWidth=2;ctx.beginPath();ctx.arc(m.x,m.y,m.r||15,0,Math.PI*2);ctx.stroke();}
 for(const p of frame.shots||[]){
  const color=p.owner===0?'#ffb66d':'#8bddf4';
  ctx.shadowColor=color;ctx.shadowBlur=15;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,clamp(p.r||4,3,13),0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle=color;ctx.globalAlpha=.45;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-p.vx*.03,p.y-p.vy*.03);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.globalAlpha=1;
 }
 for(const fx of frame.fx||[]){
  if(!Number.isFinite(fx.x)||!Number.isFinite(fx.y))continue;
  ctx.strokeStyle=fx.k==='hit'?'#f4db97':'#b5dfde';ctx.globalAlpha=.5;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(fx.x,fx.y,11,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
 }
 for(const a of frame.actors){
  const col=school(a.mageId)==='fire'?'#dd915f':school(a.mageId)==='storm'?'#86c6e0':'#c1ba97';
  const x=a.x,y=a.y;
  ctx.fillStyle='#121821ae';ctx.beginPath();ctx.ellipse(x+4,y+15,18,8,0,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.translate(x,y);ctx.rotate(a.face);
  ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.fillStyle='#29333b';ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(12,-6);ctx.lineTo(23,0);ctx.lineTo(12,6);ctx.closePath();ctx.fill();
  ctx.fillStyle='#d6e6e0';ctx.fillRect(-6,-4,9,8);ctx.restore();
  if(a.shield>0){ctx.strokeStyle='#b9d8e5';ctx.lineWidth=2;ctx.globalAlpha=clamp(a.shield/75,.2,.8);ctx.beginPath();ctx.arc(x,y,22,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
  ctx.fillStyle='#0e171c';ctx.fillRect(x-25,y-29,50,5);
  ctx.fillStyle=a.id===0?'#c8dca7':'#dc8f7b';ctx.fillRect(x-24,y-28,48*clamp(a.hp/100,0,1),3);
  ctx.textAlign='center';ctx.font='bold 10px system-ui';ctx.fillStyle='#f1e8dd';ctx.fillText(a.id===0?'УЧЕНИК':'ПРОТИВНИК',x,y-35);
 }
 const first=frame.actors[0];
 if(frame.decision&&first){
  const aim=frame.decision.aim;ctx.strokeStyle='#f0d59c';ctx.setLineDash([5,6]);ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(first.x,first.y);ctx.lineTo(aim.x,aim.y);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#fff1b8';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(aim.x,aim.y,8,0,Math.PI*2);ctx.stroke();
 }
 if(frame.remaining<10){
  const radius=Math.max(80,80+15*frame.remaining);
  ctx.strokeStyle='#ca7c75';ctx.lineWidth=4;ctx.globalAlpha=.6;ctx.beginPath();ctx.arc(200,310,radius,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
 }
 ctx.strokeStyle='#869c9e';ctx.lineWidth=3;ctx.strokeRect(2,2,W-4,H-4);
 $('pkScore').textContent=frame.score.join(' : ');
 $('pkRound').textContent='Раунд '+frame.round+' · '+frame.phase;
 $('pkClock').textContent=fmt(frame.remaining)+' с';
 $('pkFrameCount').textContent=(cursor+1)+' / '+(replay?.frames?.length||1);
 const decision=frame.decision;
 $('pkTelemetry').textContent='HP: '+frame.actors.map(a=>Math.round(a.hp)).join(' / ')+' · перегрев '+Math.round(first.heat)+' · '+(decision?'цель '+decision.meta?.distance+' px · '+(decision.attack?'атака ':'')+(decision.shield?'щит ':'')+(decision.dash?'рывок ':'')+(decision.meta?.danger?'угроза снаряда':'манёвр'):'сборка рун');
 $('pkRunes').replaceChildren();
 for(const id of first.runes||[]){const chip=document.createElement('span');chip.className='pk-rune';chip.textContent=id;$('pkRunes').append(chip);}
}
function paintIdle(){
 ctx.fillStyle='#242e33';ctx.fillRect(0,0,400,620);
 for(const w of WALLS){ctx.fillStyle='#647a80';ctx.fillRect(w.x,w.y,w.w,w.h);}
 ctx.fillStyle='#d9e4db';ctx.textAlign='center';ctx.font='bold 18px system-ui';ctx.fillText('ПОЛИГОН ПЕРЕКОСА',200,294);
 ctx.font='12px system-ui';ctx.fillStyle='#a9c7cb';ctx.fillText('Сыграйте бой или обучите агента',200,322);
}
function showReplay(next){
 stopPlayback();replay=next;cursor=0;const frames=next?.frames||[];
 $('pkSeek').max=String(Math.max(0,frames.length-1));$('pkSeek').value='0';
 $('pkSeek').disabled=frames.length===0;$('pkPlay').disabled=frames.length===0;
 $('pkOutcome').textContent=next.finished?'ИТОГ '+(next.winner===0?'ПОБЕДА':next.winner===1?'ПОРАЖЕНИЕ':'НИЧЬЯ'):'ЛИМИТ ВРЕМЕНИ · НЕ ЗАВЕРШЁН';
 if(frames.length)paintFrame(frames[0]);else window.PetriForgeRuntime=window.PetriForgeRuntime||{};
window.PetriForgeRuntime.perekos={
 getModel:async()=>structuredClone(policy),
 setModel:async snapshot=>{
  if(busy)throw Error('Завершите обучение перед сменой мага');
  policy=snapshot&&validatePerekosPolicy(snapshot)?structuredClone(snapshot):createPerekosPolicy(41);
  send('perekos-load',{policy});
 },
 train:()=>{if(busy)return false;$('pkTrain').click();return true;},
 test:()=>{if(busy)return false;$('pkTest').click();return true;},
 stop:()=>{$('pkStop').click();},
 replay:()=>{if(replay?.frames?.length)$('pkPlay').click();else{autoplayNextReplay=true;$('pkTest').click();}},
 isBusy:()=>busy,hasReplay:()=>!!replay?.frames?.length,
 configure:variant=>{$('pkCurriculum').value=variant||'balanced';},
 batch:count=>{$('pkGenerations').value=String(count);}
};
paintIdle();drawLearning();
}
function seek(n){
 if(!replay?.frames.length)return;
 cursor=clamp(Math.floor(n),0,replay.frames.length-1);$('pkSeek').value=String(cursor);paintFrame(replay.frames[cursor]);
}
$('pkPlay').onclick=()=>{
 if(timer!==null){stopPlayback();return;}
 if(!replay?.frames?.length)return;
 if(cursor>=replay.frames.length-1)seek(0);
 $('pkPlay').textContent='Ⅱ Пауза';
 const ms=Math.round(400/Number($('pkSpeed').value||3));
 timer=setInterval(()=>{
  if(cursor>=replay.frames.length-1){stopPlayback();return;}
  seek(cursor+1);
 },ms);
};
$('pkSpeed').onchange=()=>{if(timer!==null){stopPlayback();$('pkPlay').click();}};
$('pkSeek').oninput=e=>{stopPlayback();seek(Number(e.target.value));};
async function refreshModels(){
 try{
  const all=await listModels();
  for(const [id,kind] of [['pkModels','perekos-policy'],['pkTransferModels','combat-policy']]){
   const select=$(id),old=select.value;select.replaceChildren();
   const list=all.filter(x=>x.kind===kind);
   if(!list.length){const option=document.createElement('option');option.value='';option.textContent='Нет сохранённых моделей';select.append(option);}
   for(const item of list){const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.name;select.append(opt);}
   if(list.some(x=>x.id===old))select.value=old;
  }
 }catch(e){notify('Библиотека: '+e.message);}
}
async function store(name='Автосохранение',id='perekos-autosave'){
 if(!validatePerekosPolicy(policy))throw Error('Модель повреждена');
 await saveModel({id,name,kind:'perekos-policy',snapshot:policy,states:policy.weights.length});
 await refreshModels();
}
worker.onmessage=async event=>{
 const d=event.data||{};
 try{
  if(d.type==='perekos-started'){lock(true,true);learningHistory=[];drawLearning();notify('Тренировка: '+(d.curriculum==='balanced'?'от простого к сложному':d.curriculum==='offense'?'атака':'сильные соперники'));window.dispatchEvent(new CustomEvent('petri:progress',{detail:{mode:'perekos',busy:true,text:'Учится выбирать руны и сражаться'}}));}
  else if(d.type==='perekos-progress'){
   $('pkComplete').textContent=d.complete+' / '+d.total;
   $('pkAccepted').textContent=String(d.accepted);
   $('pkFitness').textContent=fmt(d.fitness);
   $('pkProgress').style.width=Math.round(100*d.complete/d.total)+'%';
   learningHistory=d.history||[];drawLearning();
   $('pkRoundStats').textContent='Тренировочные победы в раундах: '+Math.round(100*d.roundWinRate)+'%';
   $('pkLeagueSize').textContent='Текущая пара: '+d.rival+' · разница нанесённого урона '+fmt(d.damageMargin);
   window.dispatchEvent(new CustomEvent('petri:progress',{detail:{mode:'perekos',busy:true,done:d.complete,total:d.total,text:'Бой '+d.complete+' из '+d.total+' поколений'}}));
  }else if(d.type==='perekos-trained'){
   lock(false);policy=d.policy;
   $('pkValidation').textContent='Независимая проверка: '+fmt(d.roundBaseline.fitness)+' → '+fmt(d.roundValidation.fitness)+' очков на раундах. '+(d.rolledBack?'Кандидат ухудшил контрольную оценку — восстановлен исходный мозг.':'Контрольная серия завершена.') ;
   $('pkRoundStats').textContent='Раунды: '+d.roundValidation.roundWins+' побед · '+d.roundValidation.roundLosses+' поражений · '+d.roundValidation.roundDraws+' ничьих; урон '+fmt(d.roundValidation.damageMargin);
   $('pkMatchStats').textContent='Полные матчи: '+d.validation.matchWins+'/'+d.validation.count+' побед, завершено '+Math.round(d.validation.finishRate*100)+'%';
   $('pkLeagueSize').textContent='Архив политик: '+d.leagueSize+' · принятые мутации: '+d.accepted;
   showReplay(d.replay);await store();notify(d.rolledBack?'Контроль обнаружил регрессию; исходный мозг восстановлен':'Обучение завершено. Принято изменений: '+d.accepted);
   window.dispatchEvent(new CustomEvent('petri:finished',{detail:{mode:'perekos',snapshot:policy,
    report:{units:d.history?.length||0,before:d.roundBaseline?.fitness??null,after:d.roundValidation?.fitness??null,
     outcome:d.rolledBack?'reverted':'completed',label:(d.rolledBack?'Откат: контроль обнаружил ухудшение. ':'')+'Раунды: '+d.roundValidation.roundWins+' побед / '+d.roundValidation.roundDraws+' ничьих. Полные матчи: '+d.validation.matchWins+' из '+d.validation.count}}}));
  }else if(d.type==='perekos-stopped'){
   lock(false);policy=d.policy;await store();notify('Тренировка остановлена после '+d.complete+' поколений');
   window.dispatchEvent(new CustomEvent('petri:finished',{detail:{mode:'perekos',snapshot:policy,
     report:{units:d.complete||0,outcome:'stopped',label:'Остановлено после '+d.complete+' поколений'}}}));
  }else if(d.type==='perekos-tested'){
   lock(false);policy=d.policy;showReplay(d.replay);if(autoplayNextReplay){autoplayNextReplay=false;$('pkPlay').click();}
   $('pkValidation').textContent='Контрольный матч: '+d.replay.rounds+' раундов, счёт '+d.replay.score+', руны '+(d.replay.draft.join(' · ')||'нет')+'. '+(d.replay.finished?'Матч завершён.':'Достигнут лимит симуляции.'); 
   $('pkMatchStats').textContent='Матч: '+(d.replay.won?'победа':d.replay.finished?'поражение':'незавершён')+' · нанесено '+fmt(d.replay.dealt)+' · получено '+fmt(d.replay.received);
   notify('Контрольный бой завершён');window.dispatchEvent(new CustomEvent('petri:evaluated',{detail:{mode:'perekos',text:$('pkValidation').textContent}}));
  }else if(d.type==='perekos-tournament'){
   lock(false);$('pkTourney').replaceChildren();
   for(const x of d.table){const row=document.createElement('div');row.className='leader-row';row.textContent=x.style+' · раунды: '+x.wins+' побед, '+x.losses+' поражений, '+x.draws+' ничьих · урон '+fmt(x.damageMargin);$('pkTourney').append(row);}
   notify('Турнир завершён');
  }else if(d.type==='perekos-compared'){
   lock(false);$('pkTransferInfo').textContent='Сравнение на одинаковых контрольных раундах: ваш мозг '+fmt(d.mine.fitness)+' очков / урон '+fmt(d.mine.damageMargin)+'; переносимый '+fmt(d.other.fitness)+' очков / урон '+fmt(d.other.damageMargin)+'. Это не подтверждает преимущество в полных матчах.';
   notify('Сравнение переноса завершено');
  }else if(d.type==='perekos-loaded'){lock(false);policy=d.policy;notify('Мозг загружен');}
  else if(d.type==='perekos-error'){lock(false);notify('Ошибка: '+d.message);window.dispatchEvent(new CustomEvent('petri:error',{detail:{mode:'perekos',message:d.message}}));}
 }catch(e){lock(false);notify('Ошибка сохранения: '+e.message);}
};
worker.addEventListener('error',e=>{lock(false);notify('Ошибка вычислительного Worker: '+e.message);window.dispatchEvent(new CustomEvent('petri:error',{detail:{mode:'perekos',message:e.message}}));});
$('pkTrain').onclick=()=>{try{const cfg=settings();stopPlayback();lock(true,true);$('pkProgress').style.width='0%';send('perekos-train',{...cfg,generations:Number($('pkGenerations').value),policy});notify('Идёт обучение на реальных матчах...');}catch(e){lock(false);notify(e.message);}};
$('pkStop').onclick=()=>send('perekos-stop');
$('pkTest').onclick=()=>{try{lock(true);send('perekos-test',{...settings(),rivalStyle:$('pkRivalStyle').value,policy});notify('Запущен реальный матч...');}catch(e){lock(false);notify(e.message);}};
$('pkTournament').onclick=()=>{try{lock(true);send('perekos-tournament',settings());notify('Проверяем четыре стратегии...');}catch(e){lock(false);notify(e.message);}};
$('pkReset').onclick=()=>{stopPlayback();send('perekos-reset');$('pkValidation').textContent='Создан чистый мозг. Проверьте или обучите его.';};
$('pkSave').onclick=async()=>{try{const name=$('pkName').value.trim()||'Боевой маг',id='perekos-'+Date.now().toString(36);await store(name,id);$('pkModels').value=id;notify('Модель сохранена: '+name);}catch(e){notify(e.message);}};
$('pkLoad').onclick=async()=>{try{const file=await loadModel($('pkModels').value);if(!validatePerekosPolicy(file?.snapshot))throw Error('Мозг повреждён');send('perekos-load',{policy:file.snapshot});$('pkName').value=file.name;}catch(e){notify(e.message);}};
$('pkDelete').onclick=async()=>{const id=$('pkModels').value;if(!id)return;if(!confirm('Удалить выбранный мозг Перекоса?'))return;try{await deleteModel(id);await refreshModels();notify('Мозг удалён');}catch(e){notify(e.message);}};
$('pkCompareTransfer').onclick=async()=>{
 try{
  const file=await loadModel($('pkTransferModels').value);
  if(file?.kind!=='combat-policy')throw Error('Выберите мозг Combat Forge');
  const other=tacticalTransfer(file.snapshot);
  lock(true);send('perekos-compare',{...settings(),other});notify('Сравниваем на одинаковых контрольных раундах...');
 }catch(e){lock(false);notify('Сравнение: '+e.message);}
};
$('pkTransfer').onclick=async()=>{
 try{const file=await loadModel($('pkTransferModels').value);if(file?.kind!=='combat-policy')throw Error('Выберите модель Combat Forge');
  const transferred=tacticalTransfer(file.snapshot);send('perekos-load',{policy:transferred});
  $('pkTransferInfo').textContent='Параметры перенесены эвристически из «'+file.name+'». Оцените результат контрольным боем и сравните с новым мозгом.';
 }catch(e){notify('Перенос: '+e.message);}
};
$('pkExport').onclick=()=>{
 try{const blob=new Blob([JSON.stringify({format:'petriforge-perekos',version:1,policy},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='perekos-brain.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Мозг экспортирован');}
 catch(e){notify(e.message);}
};
$('pkImport').onchange=async e=>{
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 if(file.size>12000){notify('Файл слишком большой');return;}
 try{const data=JSON.parse(await file.text());if(data?.format!=='petriforge-perekos'||data.version!==1||!validatePerekosPolicy(data.policy))throw Error('Недопустимый формат');
  send('perekos-load',{policy:data.policy});notify('Импортирован мозг Перекоса');
 }catch(error){notify('Ошибка импорта: '+error.message);}
};
export function openPerekosLab(){
 openCount++;
 if(!replay&&!busy){paintIdle();if(!document.body.classList.contains('hub-on'))$('pkTest').click();}
 if(openCount===1)void refreshModels();
}
export function pausePerekosLab(){stopPlayback();}
window.petriForgePerekosDiagnostics=()=>({ready:true,busy,training,cursor,frames:replay?.frames.length||0,policySource:policy.source,score:replay?.score,finished:replay?.finished});
paintIdle();
