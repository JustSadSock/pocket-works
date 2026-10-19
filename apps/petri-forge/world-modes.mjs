import './mode-shell.mjs';
import {openPerekosLab,pausePerekosLab} from './perekos-lab.mjs';
import {CW,CH,ARENAS,SKILLS,makePolicy,validPolicy,arenaWalls} from './combat-core.mjs';
import {mountCombatEditor} from './combat-editor.mjs';
import {listModels,loadModel,saveModel,deleteModel} from './model-store.mjs';

const $=id=>document.getElementById(id);
const status=text=>{const el=$('modeStatus');if(el)el.textContent=text;};
const combatWorker=new Worker(new URL('./combat-worker.mjs',import.meta.url),{type:'module'});
const combatDefaults=[['bolt','dash','mine'],['bolt','shield','heal']];
let battlePolicy=makePolicy('aggressive',17),battleBusy=false,battleReplay=null,battleCursor=0,battleTimer=null;
let racePolicy=null,raceReady=false,raceBusy=false,raceReplay=null;
let raceReplayTimer=null,raceReplayCursor=0;
let combatReplayRequested=false,raceReplayRequested=false;
const framesInterval=95;
const raceBridge='petri-shpilka-v1';
const editor=mountCombatEditor({panel:document.getElementById('combatPanel'),canvas:document.getElementById('battleCanvas'),notify:status,onChange:()=>{
  stopPlayback();battleReplay=null;$('battlePlay').disabled=true;$('battleSeek').disabled=true;
  $('battleSummary').textContent='Правила изменены. Проведите новый бой или запустите обучение.';
  editor.paintPreview();
}});
function notifyError(e){status('Ошибка: '+String(e.message||e));}
function sceneConfig(){
 const loadouts=[0,1].map(i=>[...document.querySelectorAll('[data-side="'+i+'"] input:checked')].map(el=>el.value));
 if(loadouts.some(l=>!l.length))throw Error('У каждой стороны должна быть хотя бы одна способность');
 return {arena:$('battleArena').value,teamSize:Number($('battleTeamSize').value),ownLoadout:loadouts[0],enemyLoadout:loadouts[1],rules:editor.getRules()};
}
function sendCombat(type,payload={}){combatWorker.postMessage({type,payload});}
const fmt=x=>Number.isFinite(x)?Number(x).toFixed(1):'—';
function setBattleBusy(value){
 battleBusy=value;
 for(const id of ['battleTrain','battleTest','battleTournament','battleReset','battleSave','battleLoad','battleDelete','battleArena','battleTeamSize','battleSeed','battleIterations'])$(id).disabled=value;
 for(const box of document.querySelectorAll('#combatPanel input[type=checkbox]'))box.disabled=value;
 $('battleStop').disabled=!value;
 editor.setBusy(value);
}
function drawCombat(frame){
 const canvas=$('battleCanvas'),ctx=canvas.getContext('2d');
 if(!ctx||!frame)return;
 ctx.clearRect(0,0,CW,CH);
 ctx.fillStyle='#202b25';ctx.fillRect(0,0,CW,CH);
 ctx.fillStyle='#26372c';
 for(let y=0;y<CH;y+=40)for(let x=0;x<CW;x+=40)if((x+y)/40%2===0)ctx.fillRect(x,y,38,38);
 const walls=frame.walls||arenaWalls($('battleArena').value,Math.round(frame.time*30));
 for(const z of frame.zones||[]){
  ctx.fillStyle='rgba(220,99,61,.25)';ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ed9973';ctx.lineWidth=2;ctx.setLineDash([7,6]);ctx.stroke();ctx.setLineDash([]);
 }
 if(frame.point){
  ctx.fillStyle='rgba(155,215,161,.18)';ctx.beginPath();ctx.arc(frame.point.x,frame.point.y,frame.point.r,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#bbdf93';ctx.lineWidth=3;ctx.stroke();
 }
 ctx.fillStyle='#667a6a';ctx.strokeStyle='#111a18';ctx.lineWidth=5;
 for(const w of walls){ctx.fillRect(w.x+7,w.y+8,w.w,w.h);ctx.strokeRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#97a894';ctx.fillRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#667a6a';}
 for(const m of frame.mines){
  ctx.strokeStyle=m.team?'#ec9365':'#9cc6e5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(m.x,m.y,29,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=m.team?'#df8259':'#88bbd8';ctx.beginPath();ctx.arc(m.x,m.y,7,0,Math.PI*2);ctx.fill();
 }
 for(const shot of frame.shots){
  ctx.fillStyle=shot.team?'#ffba78':'#b7e8ff';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=15;
  ctx.beginPath();ctx.arc(shot.x,shot.y,5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
 }
 for(const a of frame.agents){
  ctx.globalAlpha=a.alive?1:.24;ctx.save();ctx.translate(a.x,a.y);
  ctx.fillStyle='#0e1713aa';ctx.beginPath();ctx.ellipse(3,13,20,10,0,0,Math.PI*2);ctx.fill();
  ctx.rotate(a.face);
  ctx.fillStyle=a.team?'#cc825e':'#82b5bc';ctx.strokeStyle=a.team?'#ffbd8a':'#d0f3ed';
  ctx.lineWidth=3;ctx.fillRect(-13,-13,26,26);ctx.strokeRect(-13,-13,26,26);
  ctx.fillStyle='#273c39';ctx.fillRect(-4,-8,17,16);
  ctx.fillStyle='#d8e8c8';ctx.fillRect(0,-5,6,10);
  ctx.fillStyle='#435d51';ctx.fillRect(-23,-18,11,10);ctx.fillRect(-23,8,11,10);
  ctx.fillStyle='#c9d8b4';ctx.fillRect(8,-6,21,11);ctx.restore();
  if(a.shield>0){ctx.strokeStyle=a.team?'#ffe0ab':'#8ce1d1';ctx.lineWidth=3;ctx.globalAlpha=.35+.5*Math.min(1,a.shield/60);ctx.beginPath();ctx.arc(a.x,a.y,24,0,Math.PI*2);ctx.stroke();}
  ctx.globalAlpha=1;
  ctx.fillStyle='#0d1814';ctx.fillRect(a.x-23,a.y-33,46,5);
  ctx.fillStyle=a.team?'#e99c6b':'#b6dfb2';ctx.fillRect(a.x-22,a.y-32,44*Math.max(0,a.hp)/(a.maxHp||120),3);
  ctx.textAlign='center';ctx.font='bold 10px system-ui';ctx.fillStyle='#e3e8da';ctx.fillText('#'+(a.id+1),a.x,a.y-39);
 }
 if(frame.events?.length){
  for(const e of frame.events)if(['impact','down','mine-hit'].includes(e.kind)){
   ctx.strokeStyle=e.kind==='down'?'#ebd8a8':'#f3cc90';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.kind==='down'?28:14,0,Math.PI*2);ctx.stroke();
  }
 }
 ctx.strokeStyle='#809985';ctx.lineWidth=5;ctx.strokeRect(2,2,CW-4,CH-4);
 $('battleClock').textContent=fmt(frame.time)+' с';
 const left=frame.agents.filter(a=>a.team===0).reduce((n,a)=>n+a.hp,0);
 const right=frame.agents.filter(a=>a.team===1).reduce((n,a)=>n+a.hp,0);
 $('battleHealth').textContent=Math.round(left)+' : '+Math.round(right)+(frame.point?' · захват '+frame.objectives.map(x=>Math.floor(x)).join(':'):'');
}
function stopPlayback(){if(battleTimer){clearInterval(battleTimer);battleTimer=null;}$('battlePlay').textContent='▶ Смотреть';}
function displayReplay(replay){
 stopPlayback();battleReplay=replay;battleCursor=0;
 const frames=replay?.frames||[];
 $('battleSeek').max=String(Math.max(0,frames.length-1));
 $('battleSeek').value='0';$('battleSeek').disabled=frames.length===0;
 $('battlePlay').disabled=frames.length===0;
 $('battleSummary').textContent=frames.length?'Победа: '+(replay.summary.winner===-1?'ничья':'команда '+(replay.summary.winner+1))+' · '+replay.summary.seconds+' с · '+(replay.summary.mode==='control'?'контроль '+replay.summary.objectives.map(x=>x.toFixed(0)).join(' : '):'урон '+replay.summary.damage.map(x=>x.toFixed(0)).join(' : ')):'Нет записи';
 if(frames.length)drawCombat(frames[0]);
}
function seekBattle(frame){
 if(!battleReplay)return;
 battleCursor=Math.max(0,Math.min(battleReplay.frames.length-1,frame));
 $('battleSeek').value=String(battleCursor);drawCombat(battleReplay.frames[battleCursor]);
}
$('battlePlay').onclick=()=>{
 if(battleTimer){stopPlayback();return;}
 if(!battleReplay?.frames.length)return;
 if(battleCursor>=battleReplay.frames.length-1)seekBattle(0);
 $('battlePlay').textContent='Ⅱ Пауза';
 battleTimer=setInterval(()=>{
  if(battleCursor>=battleReplay.frames.length-1){stopPlayback();return;}
  seekBattle(battleCursor+1);
 },framesInterval);
};
$('battleSeek').oninput=e=>{stopPlayback();seekBattle(Number(e.target.value));};
for(let team=0;team<2;team++){
 const root=$('battleSkills'+team);
 for(const [id,entry] of Object.entries(SKILLS)){
  const label=document.createElement('label');label.className='skill-chip';
  const input=document.createElement('input');input.type='checkbox';input.name='skill'+team;input.value=id;input.checked=combatDefaults[team].includes(id);
  label.dataset.side=String(team);
  input.onchange=()=>{
   if(input.checked&&root.querySelectorAll('input:checked').length>4){input.checked=false;status('Не больше четырёх способностей на бойца');}
   if(root.querySelectorAll('input:checked').length===0){input.checked=true;status('Нужна хотя бы одна способность');}
  };
  label.append(input,document.createTextNode(entry.label));root.append(label);
 }
}
const updateEval=(old,newer)=>{
 $('battleScore').textContent='Побед: '+Math.round((newer?.winRate||0)*100)+'%';
 $('battleValidation').textContent='Контрольная серия: '+Math.round((old?.winRate||0)*100)+'% → '+Math.round((newer?.winRate||0)*100)+'%. Урон: '+fmt(newer?.damage)+'.';
};
combatWorker.onmessage=async event=>{
 const d=event.data||{};
 try{
  if(d.type==='combat-started'){setBattleBusy(true);status('Обучение бойцов начато');window.dispatchEvent(new CustomEvent('petri:progress',{detail:{mode:'combat',busy:true,text:'Бойцы тренируют тактику'}}));}
  else if(d.type==='combat-progress'){
   $('battleProgress').style.width=(100*d.iteration/d.total)+'%';
   $('battleGenerations').textContent=d.iteration+' / '+d.total;
   $('battleAccepted').textContent=String(d.accepted);
   $('battleFitness').textContent=fmt(d.current?.score);
   window.dispatchEvent(new CustomEvent('petri:progress',{detail:{mode:'combat',busy:true,done:d.iteration,total:d.total,text:'Поколение '+d.iteration+' из '+d.total}}));
  }else if(d.type==='combat-trained'||d.type==='combat-stopped'){
   setBattleBusy(false);battlePolicy=d.policy;
   if(d.type==='combat-trained'){updateEval(d.baseline,d.validation);displayReplay(d.replay);}
   status(d.type==='combat-trained'?'Боевой мозг обучен':'Обучение остановлено');
   await persistPolicy('combat-autosave','Автосохранение боя','combat-policy',battlePolicy);
   window.dispatchEvent(new CustomEvent('petri:finished',{detail:{mode:'combat',snapshot:battlePolicy,
    report:{units:d.history?.at(-1)?.episode||d.iteration||0,before:d.baseline?.winRate??null,after:d.validation?.winRate??null,
      outcome:d.type==='combat-stopped'?'stopped':'completed',label:d.type==='combat-stopped'?'Тренировка остановлена. Текущие навыки сохранены.':
      'Контрольные бои: '+Math.round(100*(d.baseline?.winRate||0))+'% → '+Math.round(100*(d.validation?.winRate||0))+'% побед'}}}));
  }else if(d.type==='combat-tested'){
   battlePolicy=d.policy;updateEval(null,d.validation);displayReplay(d.replay);if(combatReplayRequested){combatReplayRequested=false;$('battlePlay').click();}status('Испытание завершено');window.dispatchEvent(new CustomEvent('petri:evaluated',{detail:{mode:'combat',text:$('battleSummary').textContent}}));
  }else if(d.type==='combat-tournament'){
   $('battleLeaderboard').replaceChildren();
   for(const item of d.table){
    const row=document.createElement('div');row.className='leader-row';
    row.textContent=item.style+' · '+item.wins+'/'+item.total+' побед · разница урона '+item.damageMargin;
    $('battleLeaderboard').append(row);
   }
   status('Турнир завершён');
  }else if(d.type==='combat-set-done'){battlePolicy=d.policy;status('Боевой мозг загружен');}
  else if(d.type==='combat-error'){setBattleBusy(false);status('Ошибка боя: '+d.message);window.dispatchEvent(new CustomEvent('petri:error',{detail:{mode:'combat',message:d.message}}));}
 }catch(e){notifyError(e);}
};
combatWorker.addEventListener('error',()=>{setBattleBusy(false);status('Ошибка боевого Worker');window.dispatchEvent(new CustomEvent('petri:error',{detail:{mode:'combat',message:'Боевой вычислительный модуль не отвечает'}}));});
$('battleTrain').onclick=()=>{
 try{
  stopPlayback();const config=sceneConfig();
  const iterations=Number($('battleIterations').value),seed=Number($('battleSeed').value);
  setBattleBusy(true);$('battleProgress').style.width='0%';
  sendCombat('combat-train',{config,iterations,seed});
  status('Отбор стратегий в реальных боях...');
 }catch(e){notifyError(e);}
};
$('battleStop').onclick=()=>sendCombat('combat-stop');
$('battleTest').onclick=()=>{try{sendCombat('combat-test',{config:sceneConfig(),seed:Number($('battleSeed').value)});status('Бой запущен');}catch(e){notifyError(e);}};
$('battleTournament').onclick=()=>{try{sendCombat('combat-tournament',{config:sceneConfig(),seed:Number($('battleSeed').value)});status('12 боёв на каждого соперника...');}catch(e){notifyError(e);}};
$('battleReset').onclick=()=>sendCombat('combat-reset',{style:'aggressive',seed:17});
async function persistPolicy(id,name,kind,snapshot){
 await saveModel({id,name,kind,snapshot,states:kind==='combat-policy'?8:9});
 await refreshLibraries();
}
function newId(prefix){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);}
async function refreshLibraries(){
 try{
  const records=await listModels();
  for(const [selector,kind] of [['battleModels','combat-policy'],['raceModels','shpilka-evo']]){
   const s=$(selector),previous=s.value;s.replaceChildren();
   const matching=records.filter(r=>r.kind===kind&&!r.id.startsWith('career-v1:'));
   if(!matching.length){const option=document.createElement('option');option.value='';option.textContent='Мозги ещё не сохранены';s.append(option);}
   for(const item of matching){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;s.append(option);}
   if(matching.some(r=>r.id===previous))s.value=previous;
  }
 }catch(e){notifyError(e);}
}
$('battleSave').onclick=async()=>{
 try{const id=newId('combat'),name=$('battleName').value.trim()||'Боевой агент';await persistPolicy(id,name,'combat-policy',battlePolicy);$('battleModels').value=id;status('Боевой мозг сохранён');}
 catch(e){notifyError(e);}
};
$('battleLoad').onclick=async()=>{
 try{
  const obj=await loadModel($('battleModels').value);
  if(!validPolicy(obj?.snapshot))throw Error('Сохранённый мозг повреждён');
  sendCombat('combat-set',{policy:obj.snapshot});battlePolicy=obj.snapshot;status('Загружаю мозг');
 }catch(e){notifyError(e);}
};
$('battleDelete').onclick=async()=>{
 const id=$('battleModels').value;if(!id)return;
 if(!confirm('Удалить сохранённого боевого агента?'))return;
 try{await deleteModel(id);await refreshLibraries();status('Мозг удалён');}catch(e){notifyError(e);}
};

const frame=$('raceFrame');
const raceReconnect=document.createElement('button');
raceReconnect.id='raceReconnect';raceReconnect.className='btn-outline full-width';
raceReconnect.textContent='Переподключить гоночный движок';
$('raceConnect').after(raceReconnect);
let raceConnectTimer=null;
function connectRace(){
 if(raceBusy)return;
 raceReady=false;raceLock(false);
 $('raceConnect').textContent='Подключение физики Шпильки...';
 frame.src='../shpilka/?petri=1&boot='+Date.now();
 if(raceConnectTimer)clearTimeout(raceConnectTimer);
 raceConnectTimer=setTimeout(()=>{
  if(!raceReady){$('raceConnect').textContent='Не удалось подключить Шпильку';status('Движок недоступен — используйте повторное подключение');}
 },20000);
}
raceReconnect.onclick=connectRace;
function raceCommand(type,payload={}){
 if(!raceReady||!frame.contentWindow){status('Движок Шпильки ещё не подключён');return false;}
 frame.contentWindow.postMessage({bridge:raceBridge,type,payload},location.origin);return true;
}
function raceLock(v){
 raceBusy=v;
 for(const id of ['raceTrain','raceTest','raceSave','raceLoad','raceDelete','raceReset','raceIterations','raceSeed'])$(id).disabled=v||(!raceReady&&id!=='raceIterations'&&id!=='raceSeed');
 $('raceStop').disabled=!v;
}
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.bridge!==raceBridge)return;
 const d=event.data;
 try{
  if(d.type==='ready'){
   raceReady=true;const defaultBrain=d.policy;
   if(racePolicy&&Array.isArray(racePolicy))raceCommand('load',{policy:racePolicy});
   else racePolicy=defaultBrain;
   raceLock(false);
   window.dispatchEvent(new CustomEvent('petri:ready',{detail:{mode:'race'}}));
   if(raceConnectTimer){clearTimeout(raceConnectTimer);raceConnectTimer=null;}
   $('raceConnect').textContent='Физика ШПИЛЬКИ · подключена';
   status('Настоящий гоночный движок готов');
  }else if(d.type==='started'){raceLock(true);$('raceProgress').style.width='0%';status('Гонщик обучается на трассах Шпильки');}
  else if(d.type==='progress'){
   $('raceProgress').style.width=(100*d.complete/d.total)+'%';
   $('raceGenerations').textContent=d.complete+' / '+d.total;
   $('raceAccepted').textContent=String(d.accepted);
   $('raceFitness').textContent=fmt(d.bestFitness);
   window.dispatchEvent(new CustomEvent('petri:progress',{detail:{mode:'race',busy:true,done:d.complete,total:d.total,text:'Испытано '+d.complete+' из '+d.total+' улучшений'}}));
   racePolicy=d.policy;
  }else if(d.type==='trained'){
   raceLock(false);racePolicy=d.policy;raceReplay=d.replay;
   $('raceReport').textContent='Контрольная физическая серия · начальная '+fmt(d.baseline?.score)+' → обученная '+fmt(d.validation?.score)+' очков. Прогресс на незнакомых seed: '+fmt(d.validation?.progress)+'.';
   updateRaceReplay(d.replay);status('Обучение гонщика завершено');
   await persistPolicy('race-autosave','Автосохранение гонщика','shpilka-evo',racePolicy);
   window.dispatchEvent(new CustomEvent('petri:finished',{detail:{mode:'race',snapshot:racePolicy,
    report:{units:d.complete||0,before:d.baseline?.score??null,after:d.validation?.score??null,
      outcome:'completed',label:'Контрольный заезд: '+fmt(d.baseline?.score)+' → '+fmt(d.validation?.score)+' баллов'}}}));
  }else if(d.type==='stopped'){
   raceLock(false);racePolicy=d.policy;
   await persistPolicy('race-autosave','Автосохранение гонщика','shpilka-evo',racePolicy);
   window.dispatchEvent(new CustomEvent('petri:finished',{detail:{mode:'race',snapshot:racePolicy,
      report:{units:d.complete||0,outcome:'stopped',label:'Тренировка остановлена · '+(d.complete||0)+' испытаний'}}}));
   status('Обучение гонщика остановлено');
  }else if(d.type==='tested'){
   raceReplay=d.result;updateRaceReplay(d.result);if(raceReplayRequested){raceReplayRequested=false;playRaceReplay();}
   $('raceReport').textContent='Проверка · пройдено '+fmt(d.result.progress)+' м; кругов '+d.result.laps+'; вне дороги '+d.result.offroad+' шагов.';
   status('Проверка на гоночной трассе завершена');window.dispatchEvent(new CustomEvent('petri:evaluated',{detail:{mode:'race',text:$('raceReport').textContent}}));
  }else if(d.type==='loaded'){racePolicy=d.policy;status('Гоночная модель загружена');}
  else if(d.type==='previewed'){$('raceFrameCount').textContent=(Number(d.frame)+1)+' / '+d.total;}
  else if(d.type==='error'){raceLock(false);status('Шпилька: '+d.message);window.dispatchEvent(new CustomEvent('petri:error',{detail:{mode:'race',message:d.message}}));}
 }catch(e){notifyError(e);}
});
function stopRacePlayback(){if(raceReplayTimer!==null){clearInterval(raceReplayTimer);raceReplayTimer=null;}}
function playRaceReplay(){
 if(!raceReplay?.trace?.length){$('raceTest').click();return;}
 if(raceReplayTimer!==null){stopRacePlayback();return;}
 if(raceReplayCursor>=raceReplay.trace.length-1)raceReplayCursor=0;
 const step=()=>{
  if(!raceReady||raceBusy||raceReplayCursor>=raceReplay.trace.length){stopRacePlayback();return;}
  raceCommand('preview',{frame:raceReplayCursor});
  $('raceSeek').value=String(raceReplayCursor);
  raceReplayCursor++;
 };
 step();raceReplayTimer=setInterval(step,125);
}
function updateRaceReplay(replay){
 stopRacePlayback();raceReplayCursor=0;
 const max=Math.max(0,(replay?.trace?.length||0)-1);
 $('raceSeek').disabled=max===0;$('raceSeek').max=String(max);$('raceSeek').value='0';
 $('raceFrameCount').textContent= max?('1 / '+(max+1)):'Нет записи';
 if(max)raceCommand('preview',{frame:0});
}
$('raceSeek').oninput=e=>{stopRacePlayback();raceReplayCursor=Number(e.target.value);raceCommand('preview',{frame:raceReplayCursor});};
$('raceTrain').onclick=()=>{if(raceCommand('train',{iterations:Number($('raceIterations').value),seed:Number($('raceSeed').value),policy:racePolicy})){raceLock(true);status('Гонщик тренируется...');}};
$('raceStop').onclick=()=>raceCommand('stop');
$('raceTest').onclick=()=>raceCommand('test',{seed:Number($('raceSeed').value)+150001});
$('raceReset').onclick=()=>raceCommand('reset');
$('raceSave').onclick=async()=>{
 if(!racePolicy){status('Сначала загрузите модель');return;}
 try{const id=newId('race'),name=$('raceName').value.trim()||'Гонщик';await persistPolicy(id,name,'shpilka-evo',racePolicy);$('raceModels').value=id;status('Гонщик сохранён');}catch(e){notifyError(e);}
};
$('raceLoad').onclick=async()=>{
 try{const obj=await loadModel($('raceModels').value);if(obj?.kind!=='shpilka-evo'||!Array.isArray(obj.snapshot)||obj.snapshot.length!==9||!obj.snapshot.every(x=>Number.isFinite(x)&&Math.abs(x)<=2))throw Error('Некорректная гоночная модель');if(raceCommand('load',{policy:obj.snapshot}))racePolicy=obj.snapshot;}catch(e){notifyError(e);}
};
$('raceDelete').onclick=async()=>{const id=$('raceModels').value;if(!id)return;if(!confirm('Удалить сохранённого гонщика?'))return;try{await deleteModel(id);await refreshLibraries();status('Гонщик удалён');}catch(e){notifyError(e);}};
frame.addEventListener('error',()=>{$('raceConnect').textContent='Ошибка загрузки Шпильки';status('Не удалось открыть гоночный движок');});
function openMode(mode){
 if(mode!=='race')stopRacePlayback();
 const grid=mode==='grid',combat=mode==='combat',race=mode==='race';
 for(const [id,show] of [['worldPanel',grid],['labPanel',grid],['combatWorld',combat],['combatPanel',combat],['raceWorld',race],['racePanel',race],['perekosWorld',mode==='perekos'],['perekosPanel',mode==='perekos']])$(id).hidden=!show;
 for(const button of document.querySelectorAll('[data-world-mode]')){button.classList.toggle('selected',button.dataset.worldMode===mode);button.setAttribute('aria-pressed',String(button.dataset.worldMode===mode));}
 if(!grid&&$('playPause').textContent.includes('Пауза'))$('playPause').click();
 if(combat&&!battleReplay&&!editor.isEditing()&&!document.body.classList.contains('hub-on'))sendCombat('combat-test',{config:sceneConfig(),seed:41});
 if(mode==='perekos')openPerekosLab();else pausePerekosLab();
 window.dispatchEvent(new CustomEvent('petri:mode',{detail:{mode}}));
 if(race&&!frame.src.includes('petri=1')){
  $('raceConnect').textContent='Подключение физики Шпильки...';
  connectRace();
 }
}
for(const b of document.querySelectorAll('[data-world-mode]'))b.onclick=()=>openMode(b.dataset.worldMode);
openMode('grid');raceLock(false);
void refreshLibraries();

window.PetriForgeRuntime=window.PetriForgeRuntime||{};
window.PetriForgeRuntime.combat={
 showExternalDuel:replay=>{if(battleBusy)throw Error('Боевая арена сейчас обучается');displayReplay(replay);return true;},
 getModel:async()=>structuredClone(battlePolicy),
 setModel:async snapshot=>{if(battleBusy)throw Error('Идёт тренировка');battlePolicy=snapshot&&validPolicy(snapshot)?structuredClone(snapshot):makePolicy('aggressive',17);sendCombat('combat-set',{policy:battlePolicy});},
 train:()=>{if(battleBusy)return false;$('battleTrain').click();return true;},
 test:()=>{if(battleBusy)return false;$('battleTest').click();return true;},
 stop:()=>{$('battleStop').click();},
 replay:()=>{if(battleReplay)$('battlePlay').click();else{combatReplayRequested=true;$('battleTest').click();}},
 isBusy:()=>battleBusy,hasReplay:()=>!!battleReplay,
 configure:variant=>{$('battleArena').value=variant||'cover';},
 batch:count=>{$('battleIterations').value=String(count);}
};
window.PetriForgeRuntime.race={
 getModel:async()=>racePolicy?racePolicy.slice():null,
 setModel:async snapshot=>{if(raceBusy)throw Error('Идёт тренировка');racePolicy=Array.isArray(snapshot)?snapshot.slice():[.95,.72,.95,.9,.7,.65,.75,.65,.7];if(raceReady)raceCommand('load',{policy:racePolicy});},
 train:()=>{if(!raceReady||raceBusy)return false;$('raceTrain').click();return true;},
 test:()=>{if(!raceReady||raceBusy)return false;$('raceTest').click();return true;},
 stop:()=>{$('raceStop').click();},
 replay:()=>{if(raceReplay?.trace?.length)playRaceReplay();else{raceReplayRequested=true;$('raceTest').click();}},
 isBusy:()=>raceBusy,isReady:()=>raceReady,hasReplay:()=>!!raceReplay?.trace?.length,
 configure:seed=>{$('raceSeed').value=String(seed||41);},
 batch:count=>{$('raceIterations').value=String(count);}
};
