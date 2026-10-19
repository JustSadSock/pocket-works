import {CW,CH,arenaWalls,makePolicy,validPolicy,simulateBattle} from './combat-core.mjs';
import {listModels,loadModel,saveModel,deleteModel} from './model-store.mjs';

const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rate=v=>Math.round(v*100)+'%';
export async function mountMultiWorld({pauseGrid=()=>{}}={}){
 const html=await fetch('./stations.html').then(r=>{if(!r.ok)throw Error('Нет интерфейса испытаний');return r.text();});
 const wrapper=document.createElement('div');wrapper.innerHTML=html;
 const world=$('worldPanel'),workspace=$('workspace'),lab=$('labPanel');
 for(const child of [...wrapper.children]){if(child.id==='stationPanel')workspace.append(child);else world.append(child);}
 const buttons=document.createElement('nav');buttons.className='world-modes';buttons.setAttribute('aria-label','Режимы PetriForge');
 buttons.innerHTML='<button data-world="grid" class="selected">◈ Полигон</button><button data-world="combat">⚔ Боевой комплекс</button><button data-world="race">↗ Шпилька</button>';
 world.querySelector('.section-label').after(buttons);
 const ctx=$('combatCanvas').getContext('2d'),frame=$('shpilkaFrame');
 let mode='grid',active=false,worker=null,policy=makePolicy('aggressive',17),frames=[],index=0,timer=null,speed=1;
 let raceReady=false,raceBusy=false,racePolicy=[.95,.72,.95,.9,.7,.65,.75,.65,.7],raceFrames=0;
 const notify=text=>{$('status').textContent=text;};
 const cfg=()=>({arena:$('combatArena').value,teamSize:Number($('combatTeams').value),ownLoadout:$('combatLoadoutA').value,enemyLoadout:$('combatLoadoutB').value,seed:Number($('combatSeed').value)||113,maxSeconds:32});
 function stopPlayback(){if(timer)clearInterval(timer);timer=null;}
 function showMode(next){
  if(!['grid','combat','race'].includes(next))return;
  pauseGrid();stopPlayback();mode=next;
  for(const b of buttons.querySelectorAll('button'))b.classList.toggle('selected',b.dataset.world===next);
  for(const id of ['editorBar','stage','hud'])$(id).hidden=next!=='grid';
  lab.hidden=next!=='grid';$('combatStation').hidden=next!=='combat';$('raceStation').hidden=next!=='race';
  $('stationPanel').hidden=next==='grid';$('combatControls').hidden=next!=='combat';$('raceControls').hidden=next!=='race';
  $('worldLabel').textContent=next==='grid'?'30 × 20':next==='combat'?'800 × 480 · БОЙ':'ФИЗИКА ШПИЛЬКИ';
  if(next==='combat'){ensureCombat();if(!frames.length)fight();else render(frames[index]);}
  if(next==='race')ensureRace();
 }
 buttons.addEventListener('click',e=>{const b=e.target.closest('[data-world]');if(b)showMode(b.dataset.world);});
 function render(f){
  if(!f)return;
  const arena=cfg().arena;
  ctx.clearRect(0,0,CW,CH);ctx.fillStyle='#d0cfbb';ctx.fillRect(0,0,CW,CH);
  for(let x=0;x<CW;x+=42)for(let y=0;y<CH;y+=42){
   if(((x+y)/42|0)%2){ctx.fillStyle='#c4c7ae';ctx.fillRect(x,y,40,40);}
  }
  ctx.strokeStyle='#aeb69e';ctx.setLineDash([6,11]);ctx.beginPath();ctx.moveTo(CW/2,0);ctx.lineTo(CW/2,CH);ctx.stroke();ctx.setLineDash([]);
  if(arena==='hazards'){ctx.fillStyle='rgba(199,89,55,.19)';ctx.beginPath();ctx.arc(400,240,84,0,2*Math.PI);ctx.fill();}
  for(const w of arenaWalls(arena,Math.round(f.time*30))){
   ctx.fillStyle='#9d947e';ctx.fillRect(w.x+5,w.y+7,w.w,w.h);
   ctx.fillStyle='#607268';ctx.fillRect(w.x,w.y,w.w,w.h);
  }
  for(const m of f.mines){ctx.fillStyle=m.team===0?'#4396ac':'#cc765b';ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(m.x,m.y,46,0,2*Math.PI);ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(m.x,m.y,7,0,2*Math.PI);ctx.fill();}
  for(const p of f.shots){ctx.fillStyle=p.team===0?'#2d8ba9':'#d96149';ctx.beginPath();ctx.arc(p.x,p.y,6,0,2*Math.PI);ctx.fill();}
  for(const a of f.agents){
   ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.face);ctx.fillStyle='rgba(15,30,27,.22)';ctx.beginPath();ctx.ellipse(3,7,20,13,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=!a.alive?'#737973':a.team===0?'#3686a4':'#b85b45';ctx.beginPath();ctx.roundRect(-15,-15,30,30,6);ctx.fill();ctx.fillStyle='#f2e7cf';ctx.fillRect(4,-5,17,10);
   if(a.shield>0){ctx.strokeStyle='#a7d6b3';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.stroke();}ctx.restore();
   ctx.fillStyle='#243f38';ctx.fillRect(a.x-22,a.y-32,44,5);ctx.fillStyle=a.team===0?'#3e98b0':'#cd7358';ctx.fillRect(a.x-22,a.y-32,44*clamp(a.hp/120,0,1),5);
  }
  ctx.fillStyle='#273d34';ctx.font='bold 17px system-ui';ctx.fillText('COMBAT FORGE',17,28);ctx.font='13px system-ui';ctx.fillText(f.time.toFixed(1)+' s',CW-75,28);
  $('combatCaption').textContent='Бой '+cfg().teamSize+'×'+cfg().teamSize+' · кадр '+(index+1)+'/'+frames.length+
   (f.winner===null?'':f.winner===-1?' · ничья':' · победа '+(f.winner===0?'синих':'красных'));
 }
 function play(){stopPlayback();if(!frames.length)return;timer=setInterval(()=>{index=Math.min(index+1,frames.length-1);render(frames[index]);if(index===frames.length-1)stopPlayback();},100/speed);}
 function fight(result=null){
  if(active){notify('Дождитесь окончания тренировки');return;}
  const c=cfg(),r=result||simulateBattle({arena:c.arena,teamSize:c.teamSize,seed:c.seed,maxSeconds:c.maxSeconds,
   loadouts:[c.ownLoadout,c.enemyLoadout],policies:[policy,makePolicy('balanced',c.seed+8)]},true);
  frames=r.frames;index=0;
  $('combatResult').textContent='Итог: '+(r.summary.winner===-1?'ничья':r.summary.winner===0?'победа синих':'победа красных')+
   '. Урон: '+r.summary.damage.map(v=>Math.round(v)).join(' : ')+'. '+r.summary.seconds+' с.';
  render(frames[0]);play();
 }
 function combatLocked(b){
  active=b;
  for(const id of ['combatFight','combatTrain','combatEvaluate','combatSave','combatLoad','combatDelete','combatStyle'])$(id).disabled=b;
  $('combatStop').disabled=!b;
 }
 function ensureCombat(){
  if(worker)return;
  worker=new Worker(new URL('./combat-worker.mjs',import.meta.url),{type:'module'});
  worker.onerror=e=>{combatLocked(false);notify('Ошибка боевого движка: '+e.message);};
  worker.onmessage=async({data:d})=>{
   if(d.type==='combat-started'){combatLocked(true);notify('Обучение бойцов');}
   else if(d.type==='combat-progress'){
    policy=d.best;$('combatProgress').textContent=d.iteration;$('combatAccepted').textContent=d.accepted;
    $('combatWin').textContent=rate(d.current.winRate);$('combatProgressFill').style.width=(100*d.iteration/d.total)+'%';
   }else if(d.type==='combat-trained'){
    combatLocked(false);policy=d.policy;
    $('combatResult').textContent='На контрольных боях: '+rate(d.validation.winRate)+' побед; до обучения '+rate(d.baseline.winRate)+'. Принято мутаций: '+d.accepted+'.';
    notify('Боец обучен');showBattleReplay(d.replay);await autosave('combat',policy);
   }else if(d.type==='combat-stopped'){combatLocked(false);policy=d.policy;notify('Боевая тренировка остановлена');await autosave('combat',policy);}
   else if(d.type==='combat-tested'){$('combatResult').textContent='Новые seed и соперники: '+rate(d.validation.winRate)+' побед, средний урон '+Math.round(d.validation.damage)+'.';showBattleReplay(d.replay);}
   else if(d.type==='combat-set-done'){policy=d.policy;notify('Мозг бойца загружен');}
   else if(d.type==='combat-error'){combatLocked(false);notify('Боевая ошибка: '+d.message);}
  };
 }
 function showBattleReplay(data){if(!data)return;frames=data.frames||[];index=0;render(frames[0]);play();}
 $('combatTrain').onclick=()=>{ensureCombat();if(active)return;stopPlayback();const c=cfg();combatLocked(true);
   worker.postMessage({type:'combat-train',payload:{config:c,iterations:Number($('combatIterations').value),seed:c.seed}});};
 $('combatStop').onclick=()=>worker?.postMessage({type:'combat-stop'});
 $('combatEvaluate').onclick=()=>{ensureCombat();worker.postMessage({type:'combat-test',payload:{config:cfg(),seed:cfg().seed+100000}});};
 $('combatFight').onclick=()=>fight();
 $('combatPause').onclick=()=>{if(timer){stopPlayback();$('combatPause').textContent='▶ Продолжить';}
  else {play();$('combatPause').textContent='Ⅱ Пауза';}};
 $('combatStep').onclick=()=>{stopPlayback();index=Math.min(frames.length-1,index+1);render(frames[index]);};
 $('combatSpeed').onclick=()=>{speed=speed===1?3:1;$('combatSpeed').textContent='Скорость '+speed+'×';if(timer)play();};
 $('combatStyle').onchange=()=>{if(!active){ensureCombat();worker.postMessage({type:'combat-reset',payload:{style:$('combatStyle').value,seed:cfg().seed}});}};
 for(const id of ['combatArena','combatTeams','combatLoadoutA','combatLoadoutB'])$(id).onchange=()=>{stopPlayback();fight();};
 async function refresh(){
  try{const items=await listModels();
   for(const [kind,id] of [['combat','combatLibrary'],['shpilka','raceLibrary']]){
    const select=$(id),old=select.value;select.replaceChildren();
    const matches=items.filter(x=>x.kind===kind);
    if(!matches.length)select.add(new Option('Нет сохранённых моделей',''));
    for(const m of matches)select.add(new Option(m.name,m.id));
    if(matches.some(x=>x.id===old))select.value=old;
   }
  }catch(e){notify('Библиотека: '+e.message);}
 }
 async function autosave(kind,snapshot){
  try{await saveModel({id:kind+'-autosave',name:'Автосохранение',kind,snapshot,states:kind==='combat'?8:9});await refresh();}
  catch(e){notify('Не удалось сохранить модель: '+e.message);}
 }
 async function saveNamed(kind,snapshot){
  try{const id=kind+'-'+Date.now().toString(36),name=$(kind==='combat'?'combatName':'raceName').value||'Агент';
   await saveModel({id,name,kind,snapshot,states:kind==='combat'?8:9});await refresh();
   $(kind==='combat'?'combatLibrary':'raceLibrary').value=id;notify('Модель сохранена');
  }catch(e){notify('Сохранение: '+e.message);}
 }
 async function loadNamed(kind){
  if(active||raceBusy){notify('Сначала завершите обучение');return;}
  const id=$(kind==='combat'?'combatLibrary':'raceLibrary').value;
  if(!id)return;
  try{const entry=await loadModel(id);if(!entry||entry.kind!==kind)throw Error('Модель не найдена');
   if(kind==='combat'){if(!validPolicy(entry.snapshot))throw Error('Некорректный мозг');ensureCombat();worker.postMessage({type:'combat-set',payload:{policy:entry.snapshot}});}
   else{const weights=entry.snapshot?.weights;if(!Array.isArray(weights)||weights.length!==9||weights.some(x=>!Number.isFinite(x)||x< -2||x>2))throw Error('Неверные веса');racePolicy=weights.slice();sendRace('load',{policy:racePolicy});}
   notify('Модель загружена: '+entry.name);
  }catch(e){notify('Не удалось загрузить: '+e.message);}
 }
 async function removeNamed(kind){
  const id=$(kind==='combat'?'combatLibrary':'raceLibrary').value;if(!id||!confirm('Удалить выбранный мозг?'))return;
  try{await deleteModel(id);await refresh();notify('Модель удалена');}catch(e){notify('Ошибка удаления: '+e.message);}
 }
 $('combatSave').onclick=()=>void saveNamed('combat',policy);
 $('combatLoad').onclick=()=>void loadNamed('combat');
 $('combatDelete').onclick=()=>void removeNamed('combat');
 $('raceSave').onclick=()=>void saveNamed('shpilka',{type:'shpilka-policy',version:1,weights:racePolicy});
 $('raceLoad').onclick=()=>void loadNamed('shpilka');
 $('raceDelete').onclick=()=>void removeNamed('shpilka');
 const sendRace=(type,payload={})=>{
  if(!raceReady){notify('Шпилька загружается');return;}
  frame.contentWindow?.postMessage({bridge:'petri-shpilka-v1',type,payload},location.origin);
 };
 function ensureRace(){
  if(frame.getAttribute('src'))return;
  frame.setAttribute('src','../shpilka/?petri=1');
  $('raceResults').textContent='Подключаем настоящую Шпильку…';
 }
 const lockRace=b=>{
  raceBusy=b;
  for(const id of ['raceTrain','raceEvaluate','raceSave','raceLoad','raceDelete'])$(id).disabled=b;
  $('raceStop').disabled=!b;
 };
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.bridge!=='petri-shpilka-v1')return;
  const d=event.data;
  if(d.type==='ready'){raceReady=true;racePolicy=d.policy;notify('Шпилька подключена');$('raceResults').textContent='Настоящая физика Шпильки загружена. Можно тренировать гонщика.';}
  else if(d.type==='started'){lockRace(true);notify('Обучение гонщика');}
  else if(d.type==='progress'){$('raceProgress').textContent=d.complete;$('raceAccepted').textContent=d.accepted;
   $('raceFitness').textContent=d.bestFitness.toFixed(1);$('raceProgressFill').style.width=100*d.complete/d.total+'%';racePolicy=d.policy;
  }else if(d.type==='trained'){
   lockRace(false);racePolicy=d.policy;raceFrames=d.replay?.trace?.length||0;$('raceReplay').max=Math.max(0,raceFrames-1);$('raceReplay').value=0;
   $('raceResults').textContent='Оценка на новых трассах: до '+d.baseline.score.toFixed(1)+', после '+d.validation.score.toFixed(1)+
    '. Прогресс контрольного заезда '+Math.round(d.replay.progress)+' м.';
   notify('Обучение гонщика завершено');void autosave('shpilka',{type:'shpilka-policy',version:1,weights:racePolicy});
  }else if(d.type==='stopped'){lockRace(false);racePolicy=d.policy;notify('Обучение остановлено');void autosave('shpilka',{type:'shpilka-policy',version:1,weights:racePolicy});}
  else if(d.type==='tested'){raceFrames=d.result?.trace?.length||0;$('raceReplay').max=Math.max(0,raceFrames-1);$('raceReplay').value=0;
   $('raceResults').textContent='Контрольный заезд: '+Math.round(d.result.progress)+' м, кругов '+d.result.laps+', вне дороги '+d.result.offroad+' тиков.';}
  else if(d.type==='loaded'){racePolicy=d.policy;notify('Мозг гонщика загружен');}
  else if(d.type==='error'){lockRace(false);notify('Шпилька: '+d.message);$('raceResults').textContent=d.message;}
 });
 $('raceTrain').onclick=()=>{if(!raceReady||raceBusy)return;lockRace(true);
  sendRace('train',{policy:racePolicy,seed:Number($('raceSeed').value)||41,iterations:Number($('raceIterations').value)});
 };
 $('raceStop').onclick=()=>sendRace('stop');
 $('raceEvaluate').onclick=()=>sendRace('test',{seed:(Number($('raceSeed').value)||41)+100031});
 $('raceReplay').oninput=()=>{if(raceFrames>0)sendRace('preview',{frame:Number($('raceReplay').value)});};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
 showMode('grid');void refresh();
 return {showMode};
}
