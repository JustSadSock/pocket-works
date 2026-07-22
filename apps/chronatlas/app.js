import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { ERAS, REGIONS, CITIES, CAPITALS, POLITY_COLORS, FACTS, ownerAt } from './data.js';

installMobileRuntime();

const STORAGE_KEY='pocket-works:chronatlas:state';
const MODES={
  territory:{label:'Державы',hint:'Нажми на любую территорию этой державы.'},
  region:{label:'Регионы',hint:'Найди выделенный историко-географический регион.'},
  city:{label:'Города',hint:'Нажми на точку города. Подпись появится после ответа.'},
  capital:{label:'Столицы',hint:'Выбери город, который был столицей в эту эпоху.'}
};
const defaults={visited:false,era:4,mode:'territory',sound:true,progress:{},streak:0,bestStreak:0};
let state=loadState();
let question=null;
let locked=false;
let questionNumber=0;
let lastTarget='';
let toastTimer=0;
let audioContext=null;
let viewBox={x:0,y:35,w:1000,h:460};
let drag=null;

const app=document.querySelector('#app');

function loadState(){
  try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return {...defaults,...raw,progress:raw.progress||{}};}catch{return {...defaults};}
}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
const escapeHtml=(value)=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const regionById=(id)=>REGIONS.find(region=>region.id===id);
const cityById=(id)=>CITIES.find(city=>city.id===id);
const eraProgress=()=>state.progress[state.era]||{correct:0,total:0,best:0};
const mastery=()=>{const p=eraProgress();return p.total?Math.min(100,Math.round((p.correct/p.total)*70+Math.min(p.total,30))):0;};
const rand=(items)=>items[Math.floor(Math.random()*items.length)];

function renderShell(){
  app.innerHTML=`
    <section class="atlas" aria-label="Хроноатлас">
      <header class="topbar" data-ui>
        <a class="back" href="../../" data-app-control data-native-press aria-label="Назад в Pocket Works">←</a>
        <div class="brand"><strong>ХРОНОАТЛАС</strong><span>КАРТА ВРЕМЕНИ</span></div>
        <div class="top-stats">
          <div class="stat"><b id="scoreStat">0 / 0</b><small>ТОЧНОСТЬ</small></div>
          <div class="stat"><b id="streakStat">${state.streak}</b><small>СЕРИЯ</small></div>
          <button class="icon-button" id="soundButton" data-native-press aria-label="Переключить звук"><span class="sound-state">${state.sound?'♪':'×'}</span></button>
          <button class="icon-button" id="settingsButton" data-native-press aria-label="Настройки">⚙</button>
        </div>
      </header>
      <aside class="rail" data-ui>
        <p class="rail-label">ЛИНИЯ ВРЕМЕНИ</p>
        <div class="eras">${ERAS.map((era,index)=>`<button class="era ${index===state.era?'active':''}" data-era="${index}" data-native-press><b>${era.label}</b><span>${era.title}</span></button>`).join('')}</div>
        <div class="rail-foot"><div class="mastery-track"><div class="mastery-fill"></div></div><p><span id="masteryText">0%</span> ОСВОЕНО<br>В ЭТОЙ ЭПОХЕ</p></div>
      </aside>
      <section class="workspace">
        <div class="map-column">
          <nav class="mode-strip" aria-label="Режим заданий" data-ui>${Object.entries(MODES).map(([id,mode])=>`<button class="mode ${id===state.mode?'active':''}" data-mode="${id}" data-native-press>${mode.label}</button>`).join('')}</nav>
          <div class="map-wrap" id="mapWrap" data-gesture-surface data-block-callout>
            <svg class="world-map" id="worldMap" viewBox="0 35 1000 460" role="img" aria-label="Интерактивная карта мира">
              <text class="ocean-label" x="295" y="185">АТЛАНТИКА</text><text class="ocean-label" x="698" y="390">ИНДИЙСКИЙ ОКЕАН</text>
              <g id="regionsLayer"></g><g id="labelsLayer"></g><g id="citiesLayer"></g>
            </svg>
            <div class="map-tools" data-ui><button class="zoom-button" data-zoom="in" data-native-press aria-label="Приблизить">＋</button><button class="zoom-button" data-zoom="out" data-native-press aria-label="Отдалить">−</button><button class="zoom-button" data-zoom="reset" data-native-press aria-label="Показать весь мир">⌂</button></div>
            <div class="map-note">Тяни карту · двойное нажатие приближает</div><div class="map-toast" id="mapToast"></div>
          </div>
        </div>
        <aside class="quiz" aria-live="polite">
          <p class="era-kicker" id="eraKicker"></p><h2 class="era-title" id="eraTitle"></h2><p class="era-note" id="eraNote"></p><div class="divider"></div>
          <div class="question-index"><span id="modeLabel"></span><span id="questionCount"></span></div>
          <h3 class="question" id="questionText"></h3><p class="hint" id="hintText"></p>
          <div class="feedback hidden" id="feedback"><div class="feedback-card" id="feedbackCard"><b id="feedbackTitle"></b><p id="feedbackText"></p></div><button class="next" id="nextButton" data-native-press>СЛЕДУЮЩАЯ ТОЧКА →</button></div>
        </aside>
      </section>
    </section>
    <div class="settings hidden" id="settings" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
      <div class="settings-panel"><div class="settings-head"><h2 id="settingsTitle">Настройки атласа</h2><button class="icon-button" id="closeSettings" data-native-press aria-label="Закрыть">×</button></div>
      <div class="settings-row"><div><b>Звуки карты</b><br><small>Тихие сигналы ответа</small></div><button id="settingsSound" data-native-press>${state.sound?'ВКЛ':'ВЫКЛ'}</button></div>
      <div class="settings-row"><div><b>Прогресс</b><br><small id="totalProgress"></small></div></div>
      <button class="danger" id="resetProgress" data-native-press>СБРОСИТЬ ПРОГРЕСС</button></div>
    </div>`;
  bindUI();
  renderEra();
  if(!state.visited)renderOnboarding();else nextQuestion();
}

function renderOnboarding(){
  const layer=REGIONS.map((region,i)=>`<polygon points="${region.points}" fill="${Object.values(POLITY_COLORS)[i%18]}" stroke="#233f46" stroke-width="2"/>`).join('');
  app.insertAdjacentHTML('beforeend',`<section class="onboarding" id="onboarding">
    <div class="onboard-map"><svg viewBox="0 35 1000 460" aria-hidden="true"><g opacity=".82">${layer}</g><path class="route-line" d="M145 230 C310 80 485 300 610 210 S820 120 925 200"/></svg></div>
    <div class="onboard-copy"><span class="eyebrow">ПОЛИТИЧЕСКАЯ ГЕОГРАФИЯ · 2500 ЛЕТ</span><h1>Мир меняет<span>границы.</span></h1><p>Не угадывай ответы в списке. Ищи державы, регионы и города там, где они действительно находились — на карте.</p><div class="onboard-actions"><button class="start" id="startButton" data-native-press>РАЗВЕРНУТЬ АТЛАС</button><a href="../../" data-app-control>В Pocket Works</a></div><div class="mini-legend">8 ЭПОХ · 44 РЕГИОНА · 73 ГОРОДА · ОФЛАЙН</div></div></section>`);
  document.querySelector('#startButton').addEventListener('click',()=>{state.visited=true;saveState();playTone(true);document.querySelector('#onboarding').remove();nextQuestion();});
}

function bindUI(){
  document.querySelectorAll('[data-era]').forEach(button=>button.addEventListener('click',()=>setEra(Number(button.dataset.era))));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  document.querySelector('#nextButton').addEventListener('click',nextQuestion);
  document.querySelector('#soundButton').addEventListener('click',toggleSound);
  document.querySelector('#settingsButton').addEventListener('click',openSettings);
  document.querySelector('#closeSettings').addEventListener('click',closeSettings);
  document.querySelector('#settings').addEventListener('click',event=>{if(event.target.id==='settings')closeSettings();});
  document.querySelector('#settingsSound').addEventListener('click',toggleSound);
  document.querySelector('#resetProgress').addEventListener('click',resetProgress);
  document.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>zoomMap(button.dataset.zoom)));
  bindMapGestures();
}

function renderEra(){
  const era=ERAS[state.era];
  document.querySelector('#eraKicker').textContent=era.year<0?`${Math.abs(era.year)} ГОД ДО Н. Э.`:`${era.year} ГОД`;
  document.querySelector('#eraTitle').textContent=era.title;
  document.querySelector('#eraNote').textContent=era.note;
  document.querySelectorAll('[data-era]').forEach((button,index)=>button.classList.toggle('active',index===state.era));
  document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===state.mode));
  renderMap();updateStats();
}

function renderMap(){
  const regionLayer=document.querySelector('#regionsLayer');
  regionLayer.innerHTML=REGIONS.map(region=>{const owner=ownerAt(region.id,state.era);return `<polygon class="region" tabindex="0" role="button" aria-label="${escapeHtml(region.name)}" data-region="${region.id}" points="${region.points}" fill="${POLITY_COLORS[owner]||'#8b8170'}"><title>${escapeHtml(region.name)} — ${escapeHtml(owner)}</title></polygon>`;}).join('');
  regionLayer.querySelectorAll('.region').forEach(node=>{node.addEventListener('click',()=>answerRegion(node.dataset.region));node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();answerRegion(node.dataset.region);}});});
  renderLabels();
  const active=CITIES.filter(city=>city.from<=state.era);
  const citiesLayer=document.querySelector('#citiesLayer');
  citiesLayer.innerHTML=active.map(city=>`<g class="city" tabindex="0" role="button" aria-label="${escapeHtml(city.name)}" data-city="${city.id}" transform="translate(${city.x} ${city.y})"><circle class="city-hit" r="13"/><circle class="city-core" r="3.4"/><text class="city-name" x="7" y="-7">${escapeHtml(city.name)}</text></g>`).join('');
  citiesLayer.querySelectorAll('.city').forEach(node=>{node.addEventListener('click',event=>{event.stopPropagation();answerCity(node.dataset.city);});node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();answerCity(node.dataset.city);}});});
}

function renderLabels(){
  const groups=new Map();
  REGIONS.forEach(region=>{const owner=ownerAt(region.id,state.era);const pts=region.points.split(' ').map(pair=>pair.split(',').map(Number));const center={x:pts.reduce((a,p)=>a+p[0],0)/pts.length,y:pts.reduce((a,p)=>a+p[1],0)/pts.length};const group=groups.get(owner)||[];group.push(center);groups.set(owner,group);});
  const labels=[...groups.entries()].filter(([owner,points])=>points.length>1&&owner!=='Независимые народы').map(([owner,points])=>{const x=points.reduce((a,p)=>a+p.x,0)/points.length;const y=points.reduce((a,p)=>a+p.y,0)/points.length;const short=owner.replace(/ \(.+\)/,'').replace('Колониальные владения ','').replace(' империя','');return `<text class="map-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${escapeHtml(short.toUpperCase())}</text>`;});
  document.querySelector('#labelsLayer').innerHTML=labels.join('');
}

function setEra(index){
  if(index===state.era)return;state.era=index;state.streak=0;saveState();question=null;locked=false;questionNumber=0;viewBox={x:0,y:35,w:1000,h:460};renderEra();updateViewBox();nextQuestion();playTone(true,260);if(innerWidth<900)document.querySelector(`[data-era="${index}"]`).scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
}
function setMode(mode){if(mode===state.mode)return;state.mode=mode;state.streak=0;saveState();questionNumber=0;renderEra();nextQuestion();}

function nextQuestion(){
  locked=false;questionNumber+=1;
  document.querySelector('#feedback').classList.add('hidden');
  document.querySelectorAll('.correct,.wrong,.dim,.reveal,.target').forEach(node=>node.classList.remove('correct','wrong','dim','reveal','target'));
  const mode=state.mode;
  if(mode==='territory'){
    const owners=[...new Set(REGIONS.map(region=>ownerAt(region.id,state.era)))].filter(owner=>owner!=='Независимые народы');
    let target=rand(owners.filter(owner=>owner!==lastTarget));question={mode,target};
    setQuestion(`Найди державу <em>${escapeHtml(target)}</em>`);
  }else if(mode==='region'){
    const target=rand(REGIONS.filter(region=>region.id!==lastTarget));question={mode,target:target.id,label:target.name};
    setQuestion(`Где находится <em>${escapeHtml(target.name)}</em>?`);
  }else if(mode==='city'){
    const candidates=CITIES.filter(city=>city.from<=state.era&&city.id!==lastTarget);const target=rand(candidates);question={mode,target:target.id,label:target.name};
    setQuestion(`Покажи город <em>${escapeHtml(target.name)}</em>`);
  }else{
    const candidates=CAPITALS.filter(item=>item.era===state.era&&item.city!==lastTarget);const target=rand(candidates);question={mode,target:target.city,label:cityById(target.city)?.name,polity:target.polity};
    setQuestion(`Выбери столицу: <em>${escapeHtml(target.polity)}</em>`);
  }
  lastTarget=question.target;
  document.querySelector('#questionCount').textContent=`ТОЧКА ${String(questionNumber).padStart(2,'0')}`;
}

function setQuestion(html){document.querySelector('#modeLabel').textContent=MODES[state.mode].label.toUpperCase();document.querySelector('#questionText').innerHTML=html;document.querySelector('#hintText').textContent=MODES[state.mode].hint;}

function answerRegion(regionId){
  if(locked)return;
  if(question.mode==='city'||question.mode==='capital'){showToast(`${regionById(regionId).name}: нажимай на точку города`);return;}
  const owner=ownerAt(regionId,state.era);const correct=question.mode==='territory'?owner===question.target:regionId===question.target;
  const correctIds=question.mode==='territory'?REGIONS.filter(region=>ownerAt(region.id,state.era)===question.target).map(region=>region.id):[question.target];
  finishAnswer(correct,{clickedRegion:regionId,correctRegions:correctIds,answerLabel:question.mode==='territory'?owner:regionById(regionId).name});
}

function answerCity(cityId){
  if(locked)return;
  if(question.mode==='territory'||question.mode==='region'){const city=cityById(cityId);showToast(`${city.name} · ${ownerAt(city.region,state.era)}`);return;}
  finishAnswer(cityId===question.target,{clickedCity:cityId,correctCity:question.target,answerLabel:cityById(cityId).name});
}

function finishAnswer(correct,details){
  locked=true;
  const progress=state.progress[state.era]||{correct:0,total:0,best:0};progress.total+=1;
  if(correct){progress.correct+=1;state.streak+=1;state.bestStreak=Math.max(state.bestStreak,state.streak);progress.best=Math.max(progress.best,state.streak);}else state.streak=0;
  state.progress[state.era]=progress;saveState();updateStats();playTone(correct);if(navigator.vibrate)navigator.vibrate(correct?18:[28,40,28]);
  document.querySelectorAll('.region').forEach(node=>{if(details.correctRegions?.includes(node.dataset.region))node.classList.add('correct');else if(details.clickedRegion===node.dataset.region&&!correct)node.classList.add('wrong');if(!correct&&details.correctRegions&&!details.correctRegions.includes(node.dataset.region))node.classList.add('dim');});
  document.querySelectorAll('.city').forEach(node=>{if(node.dataset.city===details.correctCity)node.classList.add('correct','reveal');else if(node.dataset.city===details.clickedCity&&!correct)node.classList.add('wrong','reveal');});
  const targetOwner=question.mode==='territory'?question.target:question.mode==='region'?ownerAt(question.target,state.era):question.mode==='city'?ownerAt(cityById(question.target).region,state.era):question.polity;
  const targetLabel=question.mode==='territory'?question.target:question.mode==='region'?question.label:question.label;
  showFeedback(correct,targetLabel,details.answerLabel,targetOwner);
}

function showFeedback(correct,targetLabel,answerLabel,targetOwner){
  const box=document.querySelector('#feedback');const card=document.querySelector('#feedbackCard');box.classList.remove('hidden');card.className=`feedback-card ${correct?'success':'error'}`;
  document.querySelector('#feedbackTitle').textContent=correct?(state.streak>=3?`ТОЧНО · СЕРИЯ ${state.streak}`:'ВЕРНО'):'НЕ ТУДА';
  const fact=FACTS[targetOwner];
  document.querySelector('#feedbackText').textContent=correct?(fact||`${targetLabel} отмечено на карте эпохи.`):`Ты выбрал: ${answerLabel}. Правильный ответ — ${targetLabel}.${fact?' '+fact:''}`;
}

function updateStats(){const p=eraProgress();document.querySelector('#scoreStat').textContent=p.total?`${Math.round(p.correct/p.total*100)}%`:'0 / 0';document.querySelector('#streakStat').textContent=state.streak;document.querySelector('.mastery-fill').style.width=`${mastery()}%`;document.querySelector('#masteryText').textContent=`${mastery()}%`;}

function showToast(text){const toast=document.querySelector('#mapToast');toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1500);}
function toggleSound(){state.sound=!state.sound;saveState();document.querySelectorAll('.sound-state').forEach(node=>node.textContent=state.sound?'♪':'×');const settingsButton=document.querySelector('#settingsSound');if(settingsButton)settingsButton.textContent=state.sound?'ВКЛ':'ВЫКЛ';if(state.sound)playTone(true,420);}
function playTone(correct,frequency){if(!state.sound)return;try{audioContext ||= new AudioContext();const osc=audioContext.createOscillator();const gain=audioContext.createGain();osc.type=correct?'sine':'triangle';osc.frequency.setValueAtTime(frequency||(correct?520:170),audioContext.currentTime);if(correct)osc.frequency.exponentialRampToValueAtTime((frequency||520)*1.35,audioContext.currentTime+.09);gain.gain.setValueAtTime(.0001,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.055,audioContext.currentTime+.01);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+.14);osc.connect(gain).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.15);}catch{}}

function openSettings(){const total=Object.values(state.progress).reduce((sum,p)=>sum+p.total,0);document.querySelector('#totalProgress').textContent=`${total} ответов · лучшая серия ${state.bestStreak}`;document.querySelector('#settings').classList.remove('hidden');}
function closeSettings(){document.querySelector('#settings').classList.add('hidden');document.querySelector('#resetProgress').textContent='СБРОСИТЬ ПРОГРЕСС';document.querySelector('#resetProgress').dataset.confirm='';}
function resetProgress(event){const button=event.currentTarget;if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='НАЖМИ ЕЩЁ РАЗ ДЛЯ СБРОСА';return;}state.progress={};state.streak=0;state.bestStreak=0;saveState();updateStats();closeSettings();showToast('Прогресс сброшен');}

function updateViewBox(){document.querySelector('#worldMap').setAttribute('viewBox',`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);}
function zoomMap(action,center){
  if(action==='reset'){viewBox={x:0,y:35,w:1000,h:460};updateViewBox();return;}
  const factor=action==='in'?.72:1.38;const newW=Math.max(280,Math.min(1000,viewBox.w*factor));const newH=newW*.46;const cx=center?.x??viewBox.x+viewBox.w/2;const cy=center?.y??viewBox.y+viewBox.h/2;viewBox.x=Math.max(0,Math.min(1000-newW,cx-newW/2));viewBox.y=Math.max(35,Math.min(495-newH,cy-newH/2));viewBox.w=newW;viewBox.h=newH;updateViewBox();}
function bindMapGestures(){
  const wrap=document.querySelector('#mapWrap');let lastTap=0;
  wrap.addEventListener('pointerdown',event=>{if(event.target.closest('.map-tools')||event.target.closest('.city'))return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,vx:viewBox.x,vy:viewBox.y,moved:false};wrap.setPointerCapture(event.pointerId);wrap.classList.add('dragging');});
  wrap.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(!drag.moved)return;const sx=viewBox.w/wrap.clientWidth,sy=viewBox.h/wrap.clientHeight;viewBox.x=Math.max(0,Math.min(1000-viewBox.w,drag.vx-dx*sx));viewBox.y=Math.max(35,Math.min(495-viewBox.h,drag.vy-dy*sy));updateViewBox();});
  const end=event=>{if(!drag||drag.id!==event.pointerId)return;const moved=drag.moved;drag=null;wrap.classList.remove('dragging');if(moved){event.preventDefault();event.stopPropagation();}};
  wrap.addEventListener('pointerup',end,true);wrap.addEventListener('pointercancel',end,true);
  wrap.addEventListener('dblclick',event=>{const rect=wrap.getBoundingClientRect();const center={x:viewBox.x+(event.clientX-rect.left)/rect.width*viewBox.w,y:viewBox.y+(event.clientY-rect.top)/rect.height*viewBox.h};zoomMap('in',center);});
  wrap.addEventListener('touchend',()=>{const now=Date.now();if(now-lastTap<280)zoomMap('in');lastTap=now;},{passive:true});
}

createWorkshopMode({appName:'ХРОНОАТЛАС',version:'1.0.0',cachePrefix:'chronatlas-',storageNamespace:'pocket-works:chronatlas',onReset(){localStorage.removeItem(STORAGE_KEY);state={...defaults};renderShell();}});
window.addEventListener('appdatareset',()=>{localStorage.removeItem(STORAGE_KEY);state={...defaults};renderShell();});

setTimeout(renderShell,420);
