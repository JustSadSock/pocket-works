import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { MODES,createWorld,stepWorld,inject,setRule,mutate,serialize,deserialize,cloneWorld,density } from './engine.js';
import { PALETTES,paint } from './renderer.js';
import { STUDIO_PRESETS,STUDIO_FAMILIES,studioStateNames,paintStudio,scatterStudio,studioReport } from './studio.js';
import { makeGif,makePng,saveBlob } from './exporters.js';
installMobileRuntime();
const $=id=>document.getElementById(id);
const KEY='pocket-works:kaskad-patterns:session-v1';
const RATE={sand:[1,1,2,4,8,16],ant:[4,16,64,256,1024,4096],reaction:[1,1,2,3,4,6],studio:[1,2,3,5,8,14]};
const HINTS={sand:'Коснись поля, чтобы насыпать песок',ant:'Коснись поля, чтобы выпустить муравья',reaction:'Проведи пальцем, чтобы добавить реагент',studio:'Изменяй правила и создавай начальные условия'};
const TITLE={sand:'ПЕСЧАНАЯ КУЧА',ant:'МУРАВЬИ ЛЭНГТОНА',reaction:'РЕАКЦИИ ГРЕЯ — СКОТТА',studio:'МАСТЕРСКАЯ ЗАКОНОВ'};
let mode='sand',worlds=[createWorld('sand')],modeCache={},archive=[],running=true,speed=3,palette='mineral',activeWorld=0,stageCanvases=[],stageCameras=[],paintTime=0,lastHud=0,lastFocus=null,toastTimer=0;
let editing=false,brushState=1,brushRadius=1,symmetry='none',history=[],lastHistoryAt=0;
const number=n=>new Intl.NumberFormat('ru-RU',{notation:n>=1e7?'compact':'standard',maximumFractionDigits:0}).format(Math.floor(n));
function notify(message){
  const el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('visible'),2900);
}
function load(){
  try{
    const raw=localStorage.getItem(KEY);if(!raw)return;
    const data=JSON.parse(raw);
    if(Array.isArray(data.archive))archive=data.archive.filter(s=>s&&s.id&&s.mode&&Array.isArray(s.worlds)).slice(0,8);
    if(data.modeCache&&typeof data.modeCache==='object')modeCache=data.modeCache;
    if(data.palette in PALETTES)palette=data.palette;
    if(Number.isInteger(data.speed))speed=Math.max(0,Math.min(5,data.speed));
    if(MODES[data.mode]&&Array.isArray(data.worlds)&&data.worlds.length&&data.worlds.length<=2){
      const restored=data.worlds.map(deserialize);
      if(restored.every(w=>w.mode===data.mode)){mode=data.mode;worlds=restored;}
    }
    activeWorld=Math.min(worlds.length-1,Number(data.activeWorld)||0);
    running=data.running!==false;
    editing=mode==='studio'&&data.editing===true;
    if(Array.isArray(data.history))history=data.history.filter(x=>x&&Array.isArray(x.worlds)&&x.worlds.length<=2).slice(-24);
  }catch(error){console.warn('Состояние лаборатории сброшено:',error);}
}
function persist(){
  try{
    modeCache[mode]=worlds.map(serialize);
    localStorage.setItem(KEY,JSON.stringify({mode,worlds:modeCache[mode],modeCache,palette,speed,running,activeWorld,archive,editing,history}));
  }catch(error){
    if(archive.length>1){archive=archive.slice(0,Math.max(1,Math.floor(archive.length/2)));try{localStorage.setItem(KEY,JSON.stringify({mode,worlds:worlds.map(serialize),palette,speed,running,archive}));return;}catch{}}
    console.warn('Сохранение недоступно:',error);
  }
}
function freshSeed(){try{const arr=new Uint32Array(1);crypto.getRandomValues(arr);return arr[0];}catch{return Date.now()|0;}}
function switchMode(next){
  if(!MODES[next]||next===mode)return;
  modeCache[mode]=worlds.map(serialize);
  mode=next;activeWorld=0;editing=next==='studio';if(editing)running=false;history=[];
  try{
    const saved=modeCache[next];
    worlds=Array.isArray(saved)&&saved.length?saved.map(deserialize):[createWorld(next,freshSeed())];
  }catch{worlds=[createWorld(next,freshSeed())];}
  rebuildStage();recordHistory('Начало · '+MODES[mode].label);updateUI();persist();
}
function recommendedZoom(w){
  if(w.mode==='reaction')return 1;
  let minX=w.n,maxX=-1,minY=w.n,maxY=-1;
  for(let i=0;i<w.a.length;i++){
    if(w.a[i]===0)continue;
    const x=i%w.n,y=(i/w.n)|0;
    if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;
  }
  if(w.mode==='ant')for(const ant of w.ants){
    if(ant.x<minX)minX=ant.x;if(ant.y<minY)minY=ant.y;
    if(ant.x>maxX)maxX=ant.x;if(ant.y>maxY)maxY=ant.y;
  }
  if(maxX<0)return 1;
  const span=Math.max(14,maxX-minX+1,maxY-minY+1);
  return Math.max(1,Math.min(3.2,w.n*.72/span));
}
function wrapStage(world,i){
  const panel=document.createElement('article');panel.className='world-panel';panel.dataset.world=String(i);
  const canvas=document.createElement('canvas');canvas.className=world.mode==='reaction'?'smooth':'';
  canvas.setAttribute('aria-label',world.mode==='sand'?'Поле песчаной кучи':world.mode==='ant'?'Поле муравьёв':'Поле реакции');
  const overlay=document.createElement('div');overlay.className='world-overlay';
  const letter=document.createElement('span');letter.className='world-letter';letter.textContent=worlds.length===2?(i===0?'МИР A':'МИР B'):'МИР A';
  const description=document.createElement('span');description.textContent=TITLE[world.mode];
  overlay.append(letter,description);
  const hint=document.createElement('span');hint.className='canvas-hint';hint.textContent='КАСАНИЕ · ВОЗДЕЙСТВИЕ / ЩИПОК · МАСШТАБ';
  panel.append(canvas,overlay,hint);
  const camera=bindCanvas(panel,canvas,i);
  return {panel,canvas,camera};
}
function bindCanvas(panel,canvas,index){
  const points=new Map();
  let zoom=recommendedZoom(worlds[index]),tx=0,ty=0,pinch=null,lastStroke=0,lastCell=-1,userCamera=false;
  const apply=()=>{canvas.style.transform='translate('+tx+'px,'+ty+'px) scale('+zoom+')';};
  apply();
  function brush(e){
    const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
    const w=worlds[index];if(!w)return;
    const x=Math.floor((e.clientX-rect.left)/rect.width*w.n);
    const y=Math.floor((e.clientY-rect.top)/rect.height*w.n);
    if(x<0||x>=w.n||y<0||y>=w.n)return;
    const cell=y*w.n+x,now=performance.now();
    if(lastCell===cell||now-lastStroke<(w.mode==='sand'?95:27))return;
    lastCell=cell;lastStroke=now;activeWorld=index;
    if(w.mode==='studio'&&editing){if(!paintStudio(w,x,y,brushState,brushRadius,symmetry))return;}
    else inject(w,x,y);
    updateSelection();paintAll();updateHUD();
  }
  const distance=()=>{const a=[...points.values()];return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);};
  const center=()=>{const a=[...points.values()];return{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2};};
  panel.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    panel.setPointerCapture?.(e.pointerId);
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.size===2){userCamera=true;pinch={distance:Math.max(1,distance()),center:center(),zoom,tx,ty};}
    else if(points.size===1){lastCell=-1;if(mode==='studio')recordHistory(editing?'Перед рисованием':'Воздействие');brush(e);}
  });
  panel.addEventListener('pointermove',e=>{
    if(!points.has(e.pointerId))return;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.size===2){
      if(!pinch)pinch={distance:Math.max(1,distance()),center:center(),zoom,tx,ty};
      zoom=Math.max(1,Math.min(8,pinch.zoom*distance()/pinch.distance));
      const next=center();tx=pinch.tx+(next.x-pinch.center.x);ty=pinch.ty+(next.y-pinch.center.y);
      const limit=(zoom-1)*panel.clientWidth/2;
      tx=Math.max(-limit,Math.min(limit,tx));ty=Math.max(-limit,Math.min(limit,ty));apply();
    }else if(points.size===1)brush(e);
  });
  function finish(e){points.delete(e.pointerId);if(points.size<2)pinch=null;lastCell=-1;try{panel.releasePointerCapture?.(e.pointerId);}catch{}}
  panel.addEventListener('pointerup',finish);panel.addEventListener('pointercancel',finish);panel.addEventListener('lostpointercapture',e=>{points.delete(e.pointerId);pinch=null;lastCell=-1;});
  panel.addEventListener('wheel',e=>{e.preventDefault();userCamera=true;zoom=Math.max(1,Math.min(8,zoom*(e.deltaY<0?1.2:1/1.2)));if(zoom===1){tx=0;ty=0;}apply();},{passive:false});
  return w=>{if(userCamera||points.size)return;const target=recommendedZoom(w);if(Math.abs(target-zoom)>.005){zoom+=(target-zoom)*.1;apply();}};
}
function rebuildStage(){
  const stage=$('stage'),focus=$('focusBtn'),historyButton=$('historyBtn'),tools=$('editTools');stage.replaceChildren();stage.append(focus,historyButton,tools);stage.classList.toggle('split',worlds.length===2);
  stageCanvases=[];stageCameras=[];
  worlds.forEach((world,i)=>{const view=wrapStage(world,i);stage.append(view.panel);stageCanvases.push(view.canvas);stageCameras.push(view.camera);});
  updateSelection();paintAll();
}
function updateSelection(){
  for(const panel of $('stage').querySelectorAll('.world-panel'))panel.classList.toggle('selected',worlds.length>1&&Number(panel.dataset.world)===activeWorld);
}
function paintAll(){worlds.forEach((w,i)=>{if(stageCanvases[i]){paint(stageCanvases[i],w,palette);stageCameras[i]?.(w);}});}
function updateHUD(){
  $('liveDot').classList.toggle('paused',!running);
  $('worldStatus').textContent=(worlds.length===2?'A + B':'МИР A')+' · '+(running?'РАЗВИВАЕТСЯ':'ПАУЗА');
  $('worldCount').textContent=number(worlds[activeWorld]?.ticks||0)+' шагов';
  const custom=mode==='studio'?studioReport(worlds[activeWorld]):null;
  $('worldHint').textContent=custom?'Живых '+number(custom.active)+' · состояний '+custom.diversity+'/'+worlds[activeWorld].params.states+(editing?' · рисование':''):worlds.length===2?'Выбран мир '+(activeWorld===0?'A':'B')+' · изменяй его законы':HINTS[mode];
}
function updateUI(){
  for(const button of $('modeTabs').querySelectorAll('[data-mode]')){
    const selected=button.dataset.mode===mode;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  }
  $('playSymbol').textContent=running?'Ⅱ':'▶';$('playText').textContent=running?'Пауза':'Пуск';
  $('playBtn').setAttribute('aria-label',running?'Поставить на паузу':'Запустить симуляцию');
  $('speed').value=String(speed+1);$('speedLabel').textContent='×'+RATE[mode][speed];
  $('splitText').textContent=worlds.length===2?'Сравнение':'Раздвоить';
  $('archiveCount').textContent=String(archive.length);
  $('historyCount').textContent=String(history.length);
  $('studioBtn').hidden=mode!=='studio';$('studioBtn').textContent=editing?'Наблюдать':'Рисовать';
  const showEditor=mode==='studio'&&editing;
  $('editTools').hidden=!showEditor;$('stage').classList.toggle('editing',showEditor);
  if(showEditor)refreshBrushes();
  $('paletteSwatch').style.background=PALETTES[palette].colors[4];
  updateHUD();
}
function openSheet(kicker,title,markup,wire){
  lastFocus=document.activeElement;
  $('sheetKicker').textContent=kicker;$('sheetTitle').textContent=title;
  $('sheetBody').innerHTML=markup;$('overlay').hidden=false;
  if(wire)wire($('sheetBody'));
  $('closeSheet').focus({preventScroll:true});
}
function closeSheet(){
  $('overlay').hidden=true;$('sheetBody').replaceChildren();
  if(lastFocus&&typeof lastFocus.focus==='function')lastFocus.focus({preventScroll:true});
}
function range(name,title,min,max,step,value,format){
  const text=format(value);
  return '<div class="setting"><label class="setting-top" for="law-'+name+'"><span>'+title+'</span><output id="out-'+name+'">'+text+'</output></label>'+
    '<input type="range" id="law-'+name+'" data-law="'+name+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"></div>';
}

const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function recordHistory(label='Наблюдение'){
  history.push({label,ticks:worlds[activeWorld]?.ticks||0,worlds:worlds.map(serialize),activeWorld,at:Date.now()});
  if(history.length>(mode==='reaction'?6:24))history.shift();
  $('historyCount').textContent=String(history.length);
  lastHistoryAt=performance.now();
}
function refreshBrushes(){
  if(mode!=='studio')return;
  const w=worlds[activeWorld];if(!w)return;
  const names=studioStateNames(w.params),colors=PALETTES[palette].colors;
  brushState=Math.min(brushState,names.length-1);
  $('editStates').innerHTML=names.map((name,i)=>{
    const color=w.params.family==='spread'?[colors[0],colors[2],colors[5],colors[1]][i]:colors[Math.round(i/Math.max(1,names.length-1)*5)];
    return '<button type="button" data-state="'+i+'" class="'+(brushState===i?'active':'')+'" aria-pressed="'+(brushState===i)+'"><i class="state-swatch" style="background:'+color+'"></i>'+escapeText(name)+'</button>';
  }).join('');
}
function historyDialog(){
  const w=worlds[activeWorld];let summary='';
  if(mode==='studio'){
    const stats=studioReport(w),colors=PALETTES[palette].colors;
    const names=studioStateNames(w.params);
    const segments=stats.counts.map((count,i)=>{
      const c=w.params.family==='spread'?[colors[0],colors[2],colors[5],colors[1]][i]:colors[Math.round(i/Math.max(1,stats.counts.length-1)*5)];
      return '<i title="'+escapeText(names[i])+': '+count+'" style="background:'+c+';width:'+(count/w.a.length*100).toFixed(3)+'%"></i>';
    }).join('');
    summary='<div class="studio-metrics"><div><b>'+number(stats.occupied)+'</b><small>занято клеток</small></div><div><b>'+stats.diversity+'/'+w.params.states+'</b><small>различных состояний</small></div><div><b>'+stats.entropy.toFixed(2)+'</b><small>энтропия, бит</small></div></div><div class="studio-bars">'+segments+'</div>';
  }
  const list=history.map((h,i)=>({h,i})).reverse().map(({h,i})=>
    '<div class="history-row"><div><b>'+escapeText(h.label)+'</b><small>'+number(h.ticks)+' шагов · '+h.worlds.length+' мир(а)</small></div><button type="button" data-restore="'+i+'">Вернуться</button></div>').join('');
  openSheet('ХРОНОЛОГИЯ ЭКСПЕРИМЕНТА','История и измерения',summary+'<p>Каждая отметка хранит точную конфигурацию поля и законов. Возврат отбросит более поздние отметки.</p>'+list,body=>{
    body.querySelectorAll('[data-restore]').forEach(button=>button.addEventListener('click',()=>{
      const index=Number(button.dataset.restore),entry=history[index];if(!entry)return;
      try{
        const restored=entry.worlds.map(deserialize);
        if(!restored.length||restored.some(x=>x.mode!==mode))throw Error('Режим изменился');
        worlds=restored;activeWorld=Math.min(restored.length-1,entry.activeWorld||0);history=history.slice(0,index+1);
        running=false;editing=false;rebuildStage();updateUI();persist();closeSheet();notify('Возврат к '+number(entry.ticks)+' шагам');
      }catch(error){notify('Не удалось восстановить: '+error.message);}
    }));
  });
}
function libraryDialog(){
  const choices=Object.entries(STUDIO_PRESETS).map(([id,p])=>
    '<button type="button" data-studio-preset="'+id+'" class="'+(worlds[activeWorld]?.params.name===p.name?'selected':'')+'">'+escapeText(p.name)+'<small>'+STUDIO_FAMILIES[p.family]+'</small></button>').join('');
  openSheet('БИБЛИОТЕКА ПРАВИЛ','Семь исходных миров',
    '<p>Каждый пример — работающий алгоритм. Выбирай образец, меняй его законы и рисуй свои начальные условия.</p><div class="workshop-presets">'+choices+'</div><div class="sheet-buttons"><button id="customFromHere" class="alt">Редактировать текущие законы</button></div>',body=>{
      body.querySelectorAll('[data-studio-preset]').forEach(btn=>btn.addEventListener('click',()=>presetConfirm(btn.dataset.studioPreset)));
      body.querySelector('#customFromHere').addEventListener('click',studioLaws);
    });
}
function presetConfirm(id){
  const preset=STUDIO_PRESETS[id];if(!preset)return;
  openSheet('СМЕНА ЭКСПЕРИМЕНТА','Запустить «'+preset.name+'»?',
    '<p>Начальные условия и правила выбранного мира заменятся. Его прежнее состояние останется в истории.</p><div class="sheet-buttons"><button id="applyStudioPreset">Запустить образец</button><button id="cancelStudioPreset" class="alt">Назад к примерам</button></div>',body=>{
      body.querySelector('#applyStudioPreset').addEventListener('click',()=>{
        recordHistory('Перед сменой сценария');worlds[activeWorld]=createWorld('studio',freshSeed(),id);running=false;editing=true;brushState=1;
        rebuildStage();updateUI();persist();closeSheet();notify('Образец запущен · настрой правила');
      });
      body.querySelector('#cancelStudioPreset').addEventListener('click',libraryDialog);
    });
}
function studioLaws(){
  const w=worlds[activeWorld],r=w.params;
  let html='<p>Это вычисляемые клеточные автоматы. Переключение типа закона сохраняет клетки, но меняет их смысл. Изменения видны в реальном времени.</p>';
  if(worlds.length===2)html+='<div class="setting"><label class="setting-top" for="worldChoice">Настраиваемый мир</label><select id="worldChoice"><option value="0"'+(activeWorld===0?' selected':'')+'>Мир A</option><option value="1"'+(activeWorld===1?' selected':'')+'>Мир B</option></select></div>';
  html+='<div class="setting"><label class="setting-top" for="law-family">Механика перехода</label><select id="law-family" data-law="family">'+Object.entries(STUDIO_FAMILIES).map(([id,name])=>'<option value="'+id+'"'+(r.family===id?' selected':'')+'>'+name+'</option>').join('')+'</select></div>';
  html+='<div class="setting"><label class="setting-top" for="law-neighbors">Соседи</label><select id="law-neighbors" data-law="neighbors"><option value="4"'+(r.neighbors===4?' selected':'')+'>4 · стороны</option><option value="8"'+(r.neighbors===8?' selected':'')+'>8 · стороны и диагонали</option></select></div>';
  html+='<div class="setting"><label class="setting-top" for="law-wrap">Граница поля</label><select id="law-wrap" data-law="wrap"><option value="true"'+(r.wrap?' selected':'')+'>Замкнутый мир · тор</option><option value="false"'+(!r.wrap?' selected':'')+'>Открытые края</option></select></div>';
  if(r.family!=='spread')html+=range('states','Количество состояний',r.family==='cyclic'?3:2,6,1,r.states,v=>String(v));
  if(r.family==='life')for(const [type,label] of [['birth','Рождение'],['survive','Выживание']]){
    html+='<div class="setting"><div class="setting-top">'+label+' · число живых соседей</div><div class="rules-counts" role="group" aria-label="'+label+'">';
    for(let i=0;i<=r.neighbors;i++)html+='<button type="button" class="rule-count '+(r[type].includes(i)?'selected':'')+'" data-count="'+i+'" data-count-type="'+type+'" aria-pressed="'+r[type].includes(i)+'">'+i+'</button>';
    html+='</div></div>';
  }
  if(r.family==='cyclic')html+=range('threshold','Минимум соседей следующего вида',1,r.neighbors,1,r.threshold,v=>String(v));
  if(r.family==='spread'){
    html+=range('spread','Вероятность заражения',.001,1,.001,r.spread,v=>(v*100).toFixed(1)+'%');
    html+=range('duration','Угасание активного',.001,1,.001,r.duration,v=>(v*100).toFixed(1)+'%');
    html+=range('recover','Восстановление территории',0,1,.001,r.recover,v=>(v*100).toFixed(1)+'%');
    html+=range('regrow','Появление нового ресурса',0,.08,.0005,r.regrow,v=>(v*100).toFixed(2)+'%');
  }
  html+='<div class="rule-note">Правила считаются синхронно: все клетки видят одно и то же предыдущее состояние. Можно экспериментировать и с остановленным полем.</div><div class="sheet-buttons"><button type="button" id="openStudioLibrary" class="alt">Библиотека примеров</button><button type="button" id="openStudioHistory" class="alt">Статистика и история</button></div>';
  openSheet('РЕДАКТОР ПРАВИЛ','Законы · Мир '+(activeWorld===0?'A':'B'),html,body=>{
    const choice=body.querySelector('#worldChoice');if(choice)choice.addEventListener('change',e=>{activeWorld=Number(e.target.value);updateSelection();updateHUD();studioLaws();});
    body.querySelectorAll('[data-law]').forEach(input=>{
      input.addEventListener('pointerdown',()=>recordHistory('Перед изменением закона'),{once:true});
      input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>{
        const key=input.dataset.law,old=worlds[activeWorld],applied=setRule(old,key,input.value);
        if(!applied)return;
        if(key==='family'||key==='neighbors'||key==='states'){refreshBrushes();studioLaws();}
        else if(input.tagName!=='SELECT'){
          const output=body.querySelector('#out-'+key);if(output)output.textContent=key==='threshold'?String(old.params[key]):(old.params[key]*100).toFixed(key==='regrow'?2:1)+'%';
        }
        paintAll();updateHUD();
      });
    });
    body.querySelectorAll('[data-count]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.countType,value=Number(button.dataset.count),current=worlds[activeWorld].params[key];
      recordHistory('Правило '+(key==='birth'?'рождения':'выживания'));
      const next=current.includes(value)?current.filter(n=>n!==value):[...current,value].sort((a,b)=>a-b);
      setRule(worlds[activeWorld],key,next);button.classList.toggle('selected',next.includes(value));button.setAttribute('aria-pressed',String(next.includes(value)));
      paintAll();updateHUD();
    }));
    body.querySelector('#openStudioLibrary').addEventListener('click',libraryDialog);
    body.querySelector('#openStudioHistory').addEventListener('click',historyDialog);
  });
}

function ruleDialog(){
  if(mode==='studio')return studioLaws();
  const w=worlds[activeWorld];
  let markup='<p>Изменения применяются к живой системе. '+(worlds.length>1?'Выбранный мир можно менять независимо от второго.':'Попробуй поменять один закон и посмотреть на результат.')+'</p>';
  if(worlds.length===2)markup+='<div class="setting"><label class="setting-top" for="worldChoice">Настраиваемый мир</label><select id="worldChoice"><option value="0"'+(activeWorld===0?' selected':'')+'>Мир A</option><option value="1"'+(activeWorld===1?' selected':'')+'>Мир B</option></select></div>';
  if(mode==='sand'){
    markup+=range('feed','Песчинок за цикл',10,800,10,w.params.feed,v=>number(v));
    markup+='<div class="setting"><label class="setting-top" for="law-neighbors">Направлений распределения</label><select id="law-neighbors" data-law="neighbors"><option value="4"'+(w.params.neighbors===4?' selected':'')+'>4 · стороны</option><option value="8"'+(w.params.neighbors===8?' selected':'')+'>8 · стороны и диагонали</option></select></div>';
    markup+='<div class="rule-note">Клетка обрушивается, набрав 4 либо 8 частиц, и передаёт по одной соседям. На краях частицы покидают поле.</div>';
  }else if(mode==='ant'){
    markup+='<div class="setting"><label class="setting-top" for="law-rule">Правила поворотов · L / R</label><input type="text" id="law-rule" data-law="rule" value="'+w.params.rule+'" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-describedby="ruleFeedback"><p id="ruleFeedback" class="rule-feedback">От 2 до 8 букв: L — налево, R — направо.</p></div>';
    markup+=range('ants','Количество муравьёв',1,12,1,w.ants.length,v=>String(v));
    markup+='<div class="sheet-buttons"><button type="button" data-preset="RL">Классика · RL</button><button type="button" data-preset="RLLR" class="alt">Хаос · RLLR</button><button type="button" data-preset="LLRR" class="alt">Слои · LLRR</button></div>';
  }else{
    markup+=range('feed','Питание (F)',.012,.095,.0005,w.params.feed,v=>Number(v).toFixed(4));
    markup+=range('kill','Распад (K)',.035,.077,.0005,w.params.kill,v=>Number(v).toFixed(4));
    markup+='<div class="rule-note">Два реагента диффундируют и взаимодействуют. Даже изменение F или K на тысячную может изменить весь узор.</div>';
    markup+='<div class="sheet-buttons"><button type="button" data-react="coral">Кораллы</button><button type="button" data-react="spots" class="alt">Пятна</button><button type="button" data-react="maze" class="alt">Лабиринт</button></div>';
  }
  openSheet('ЗАКОНЫ МИРА '+(activeWorld===0?'A':'B'),'Настройка · '+MODES[mode].label,markup,body=>{
    function connect(){
      const choice=body.querySelector('#worldChoice');
      if(choice)choice.addEventListener('change',e=>{activeWorld=Number(e.target.value);updateSelection();updateHUD();ruleDialog();});
      body.querySelectorAll('[data-law]').forEach(input=>{
        const name=input.dataset.law;
        const apply=e=>{
          const current=worlds[activeWorld];
          let value=e.target.value;
          if(name==='rule'){
            value=value.toUpperCase().replace(/[^RL]/g,'');
            e.target.value=value;
            const okay=/^[RL]{2,8}$/.test(value);
            body.querySelector('#ruleFeedback').textContent=okay?'Правило применяется сразу.':'Нужно 2–8 букв L или R.';
            if(!okay)return;
          }
          setRule(current,name,value);
          const output=body.querySelector('#out-'+name);
          if(output)output.textContent=name==='feed'&&mode==='reaction'?Number(current.params[name]).toFixed(4):name==='kill'?Number(current.params[name]).toFixed(4):String(current.params[name]);
          paintAll();updateHUD();
        };
        input.addEventListener(name==='rule'||input.tagName==='SELECT'?'change':'input',apply);
      });
      body.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
        setRule(worlds[activeWorld],'rule',button.dataset.preset);ruleDialog();paintAll();
      }));
      const patterns={coral:[.0545,.062],spots:[.0367,.0649],maze:[.029,.057]};
      body.querySelectorAll('[data-react]').forEach(button=>button.addEventListener('click',()=>{
        const [f,k]=patterns[button.dataset.react];setRule(worlds[activeWorld],'feed',f);setRule(worlds[activeWorld],'kill',k);
        ruleDialog();paintAll();
      }));
    }
    connect();
  });
}
function paletteDialog(){
  const choices=Object.entries(PALETTES).map(([key,v])=>
    '<button type="button" data-palette="'+key+'" class="swatch-choice '+(key===palette?'selected':'')+'"><span class="swatch-band">'+v.colors.map(c=>'<i style="background:'+c+'"></i>').join('')+'</span>'+v.label+'</button>').join('');
  openSheet('ПРОЯВЛЕНИЕ СИСТЕМЫ','Цветовая палитра','<p>Цвет меняет только визуализацию — законы мира останутся прежними.</p><div class="swatch-grid">'+choices+'</div>',body=>{
    body.querySelectorAll('[data-palette]').forEach(b=>b.addEventListener('click',()=>{palette=b.dataset.palette;paintAll();updateUI();persist();closeSheet();notify('Палитра: '+PALETTES[palette].label);}));
  });
}
function saveDiscovery(customName=''){
  try{
    paintAll();
    const thumb=stageCanvases[activeWorld]?.toDataURL('image/png')||'';
    const stamp=new Date();
    archive.unshift({id:String(Date.now())+'-'+Math.floor(Math.random()*10000),mode,title:customName.trim().slice(0,64)||MODES[mode].label+' · '+stamp.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}),ticks:worlds[activeWorld].ticks,created:stamp.toISOString(),palette,preview:thumb,worlds:worlds.map(serialize)});
    archive=archive.slice(0,8);persist();updateUI();notify('Открытие сохранено в архиве');
  }catch(error){notify('Не удалось сохранить: '+error.message);}
}
function saveScenarioDialog(){
  openSheet('СОХРАНЕНИЕ СЦЕНАРИЯ','Назови своё открытие',
    '<p>Сохраняются клетки, правила, шаги и обе ветви мира, если включено сравнение.</p><div class="setting"><label class="setting-top" for="scenarioName">Название сценария</label><input type="text" id="scenarioName" maxlength="64" value="Мой эксперимент" autocomplete="off"></div><div class="sheet-buttons"><button id="confirmSave">Сохранить в архив</button><button id="cancelSave" class="alt">Отмена</button></div>',body=>{
      const field=body.querySelector('#scenarioName');
      const save=()=>{saveDiscovery(field.value);closeSheet();};
      body.querySelector('#confirmSave').addEventListener('click',save);
      field.addEventListener('keydown',e=>{if(e.key==='Enter')save();});
      body.querySelector('#cancelSave').addEventListener('click',closeSheet);
  });
}
function galleryDialog(){
  const html=archive.length?archive.map(item=>
    '<article class="gallery-row" data-entry="'+escapeText(item.id)+'"><img src="'+escapeText(item.preview)+'" alt="Снимок сохранённой симуляции"><div><h3>'+escapeText(item.title)+'</h3><p>'+number(item.ticks)+' шагов · '+(item.worlds.length===2?'два мира':'один мир')+'</p></div><div class="gallery-actions"><button type="button" data-load="'+item.id+'">Открыть</button><button type="button" data-delete="'+item.id+'">Удалить</button></div></article>').join(''):'<div class="empty-note">Пока нет сохранённых миров.<br>Нажми «Сохранить открытие» под симуляцией.</div>';
  const importer='<div class="workshop-file"><label for="importScenario">Открыть сценарий JSON с устройства</label><input type="file" id="importScenario" accept="application/json,.json" aria-label="Импорт сценария"></div>';
  openSheet('МОИ ОТКРЫТИЯ','Архив миров',importer+html,body=>{
    body.querySelector('#importScenario').addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{
        if(file.size>2000000)throw Error('Файл больше 2 МБ');
        const data=JSON.parse(await file.text());
        if(data.format!=='kaskad-studio-scenario'||data.version!==1||!Array.isArray(data.worlds)||data.worlds.length<1||data.worlds.length>2)throw Error('Неизвестный формат');
        const restored=data.worlds.map(deserialize);
        if(restored.some(w=>w.mode!=='studio'))throw Error('Это не сценарий Мастерской');
        mode='studio';worlds=restored;activeWorld=Math.min(restored.length-1,Number(data.activeWorld)||0);running=false;editing=true;history=[];
        rebuildStage();recordHistory('Импорт сценария');updateUI();persist();closeSheet();notify('Сценарий импортирован');
      }catch(error){notify('Не удалось импортировать: '+error.message);event.target.value='';}
    });
    body.querySelectorAll('[data-load]').forEach(b=>b.addEventListener('click',()=>{
      const item=archive.find(s=>s.id===b.dataset.load);if(!item)return;
      try{mode=item.mode;worlds=item.worlds.map(deserialize);palette=item.palette in PALETTES?item.palette:palette;activeWorld=0;running=false;editing=mode==='studio';history=[];rebuildStage();recordHistory('Мир из архива');updateUI();persist();closeSheet();notify('Мир восстановлен · пауза');}catch{notify('Сохранение повреждено');}
    }));
    body.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>{
      const item=archive.find(s=>s.id===b.dataset.delete);if(!item)return;
      openSheet('ПОДТВЕРЖДЕНИЕ','Удалить открытие?','<p>Это сохранение исчезнет из архива. Текущий мир не изменится.</p><div class="sheet-buttons"><button id="yesDelete" type="button">Удалить</button><button class="alt" id="noDelete" type="button">Отмена</button></div>',area=>{
        area.querySelector('#yesDelete').addEventListener('click',()=>{archive=archive.filter(s=>s.id!==item.id);persist();updateUI();galleryDialog();notify('Удалено из архива');});
        area.querySelector('#noDelete').addEventListener('click',galleryDialog);
      });
    }));
  });
}
function splitWorld(){
  if(worlds.length===1){
    recordHistory('До раздвоения');
    worlds.push(mutate(worlds[0]));activeWorld=1;recordHistory('Мир B · мутация');rebuildStage();updateUI();persist();notify('Мир B создан с изменённым законом');return;
  }
  openSheet('РАЗДВОЕНИЕ','Какой мир оставить?','<p>Оба мира развивались независимо. Выбери один для продолжения наблюдения.</p><div class="sheet-buttons"><button id="keepA">Оставить A</button><button id="keepB">Оставить B</button><button id="stay" class="alt">Отмена</button></div>',body=>{
    for(let i=0;i<2;i++)body.querySelector(i?'#keepB':'#keepA').addEventListener('click',()=>{
      recordHistory('До объединения');worlds=[worlds[i]];activeWorld=0;recordHistory('Продолжен мир '+(i===0?'A':'B'));rebuildStage();updateUI();persist();closeSheet();notify('Наблюдение продолжается');
    });
    body.querySelector('#stay').addEventListener('click',closeSheet);
  });
}
function resetDialog(){
  openSheet('НОВАЯ ВСЕЛЕННАЯ','Начать заново?','<p>Текущее состояние заменится новым миром. Перед этим можно сохранить открытие в архив.</p><div class="sheet-buttons"><button id="freshWorld">Создать новый мир</button><button id="saveFirst" class="alt">Сначала сохранить</button><button id="cancelReset" class="alt">Отмена</button></div>',body=>{
    body.querySelector('#freshWorld').addEventListener('click',()=>{
      recordHistory('До нового мира');worlds=[createWorld(mode,freshSeed())];activeWorld=0;running=mode!=='studio';editing=mode==='studio';recordHistory('Новый мир');rebuildStage();updateUI();persist();closeSheet();notify('Запущена новая вселенная');
    });
    body.querySelector('#saveFirst').addEventListener('click',()=>{saveDiscovery();closeSheet();});
    body.querySelector('#cancelReset').addEventListener('click',closeSheet);
  });
}
function exportDialog(){
  openSheet('ЭКСПОРТ НАБЛЮДЕНИЯ','Сохранить изображение','<p>Экспортируется мир '+(activeWorld===0?'A':'B')+'. Анимация рассчитывается из копии текущего состояния и не изменяет эксперимент.</p><div class="sheet-buttons"><button type="button" id="exportPng">PNG · 1280 px</button><button type="button" id="exportGif" class="alt">GIF · 22 кадра</button></div>',body=>{
    body.querySelector('#exportPng').addEventListener('click',async()=>{
      try{const blob=await makePng(stageCanvases[activeWorld]);saveBlob(blob,'kaskad-'+mode+'.png');closeSheet();notify('PNG готов');}catch(error){notify('Ошибка экспорта: '+error.message);}
    });
    body.querySelector('#exportGif').addEventListener('click',()=>{
      const btn=body.querySelector('#exportGif');btn.disabled=true;btn.textContent='Создаю GIF…';
      setTimeout(()=>{
        try{saveBlob(makeGif(worlds[activeWorld],palette),'kaskad-'+mode+'.gif');closeSheet();notify('GIF готов · 22 кадра');}
        catch(error){btn.disabled=false;btn.textContent='GIF · повторить';notify('Ошибка GIF: '+error.message);}
      },60);
    });
  });
}
function animate(t){
  requestAnimationFrame(animate);
  if(document.hidden||!running||t-paintTime<45)return;
  paintTime=t;
  try{
    for(const w of worlds)stepWorld(w,RATE[mode][speed]);
    paintAll();
    if(t-lastHud>220){updateHUD();lastHud=t;}
  }catch(error){running=false;updateUI();notify('Симуляция остановлена: '+error.message);console.error(error);}
}
let focused=false;
function toggleFocus(value=!focused){focused=value;document.querySelector('.app-shell').classList.toggle('focus-mode',focused);$('focusLabel').textContent=focused?'Выйти':'На весь экран';$('focusBtn').setAttribute('aria-label',focused?'Вернуться к управлению':'Наблюдение на весь экран');}
$('focusBtn').addEventListener('click',()=>toggleFocus());
$('modeTabs').addEventListener('click',e=>{const button=e.target.closest('[data-mode]');if(button)switchMode(button.dataset.mode);});
$('playBtn').addEventListener('click',()=>{running=!running;updateUI();persist();});
$('stepBtn').addEventListener('click',()=>{running=false;worlds.forEach(w=>stepWorld(w,1));paintAll();updateUI();persist();});
$('speed').addEventListener('input',e=>{speed=Number(e.target.value)-1;updateUI();});
$('speed').addEventListener('change',persist);
$('splitBtn').addEventListener('click',splitWorld);
$('lawsBtn').addEventListener('click',ruleDialog);
$('paletteBtn').addEventListener('click',paletteDialog);
$('saveBtn').addEventListener('click',saveDiscovery);
$('galleryBtn').addEventListener('click',galleryDialog);
$('resetBtn').addEventListener('click',resetDialog);
$('exportBtn').addEventListener('click',exportDialog);
$('closeSheet').addEventListener('click',closeSheet);
$('backdrop').addEventListener('click',closeSheet);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('overlay').hidden)closeSheet();else if(focused)toggleFocus(false);}if(e.code==='Space'&&$('overlay').hidden&&!['INPUT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();running=!running;updateUI();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();else paintTime=0;});
window.addEventListener('pagehide',persist);
setInterval(()=>{if(!document.hidden)persist();},9000);
load();rebuildStage();updateUI();requestAnimationFrame(animate);
