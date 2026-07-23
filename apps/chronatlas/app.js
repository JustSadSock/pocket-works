import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { ATLAS_DATA } from './atlas-data.js';

installMobileRuntime();

const STORAGE_KEY='pocket-works:chronatlas:state-v2';
const WORLD={x:0,y:0,w:1000,h:500};
const MODES={country:'СТРАНЫ',province:'ПРОВИНЦИИ',city:'ГОРОДА'};
const DEFAULTS={era:2026,mode:'country',score:0,total:0,streak:0,best:0,sound:true,seenIntro:false};
let state=loadState();
let question=null;
let locked=false;
let view={...WORLD};
const pointers=new Map();
const historicalCityCache=new Map();
const parsedPathCache=new Map();
let gesture=null;
let suppressClickUntil=0;
let audio=null;
let toastTimer=0;

const app=document.querySelector('#app');
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=(value)=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const rand=(array)=>array[Math.floor(Math.random()*array.length)];
const groupBy=(array,keyFn)=>array.reduce((map,item)=>{const key=keyFn(item);if(!map.has(key))map.set(key,[]);map.get(key).push(item);return map;},new Map());
const countryByIso3=new Map(ATLAS_DATA.countries.map(country=>[country.iso3,country]));
const countryByIso2=new Map(ATLAS_DATA.countries.map(country=>[country.iso2,country]));
const provincesByCountry=groupBy(ATLAS_DATA.provinces,province=>province.iso3);
const citiesByCountry=groupBy(ATLAS_DATA.cities,city=>city.iso2);
const LOCAL_NAMES={
  'France':'Франция','French Empire':'Французская империя','British Empire':'Британская империя',
  'Russian Empire':'Российская империя','German Empire':'Германская империя',
  'Ottoman Empire':'Османская империя','Holy Roman Empire':'Священная Римская империя',
  'Spanish Empire':'Испанская империя','Portuguese Empire':'Португальская империя',
  'Mughal Empire':'Империя Великих Моголов','Ming Chinese Empire':'Империя Мин',
  'Empire of Japan':'Японская империя','United States':'США','Italy':'Италия',
  'Spain':'Испания','Belgium':'Бельгия','Switzerland':'Швейцария'
};

function loadState(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')};}catch{return {...DEFAULTS};}}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}

function renderShell(){
  app.innerHTML=`
    <main class="atlas-shell" data-app-shell data-fullscreen-app>
      <header class="masthead" data-ui>
        <a class="library-link" href="../../" data-app-control data-native-press>← POCKET WORKS</a>
        <div class="wordmark"><b>ХРОНОАТЛАС</b><span>ПОЛИТИЧЕСКАЯ ГЕОГРАФИЯ</span></div>
        <button class="sound-button" id="soundButton" data-native-press aria-label="Звук">${state.sound?'♪':'×'}</button>
      </header>

      <section class="atlas-body">
        <aside class="folio" data-ui>
          <div class="folio-top">
            <span class="folio-number">ЛИСТ Ⅲ</span>
            <h1 id="eraTitle"></h1>
            <p id="eraNote"></p>
          </div>
          <nav class="era-tabs" aria-label="Дата карты">
            ${[1600,1914,2026].map(year=>`<button class="era-tab" data-era="${year}" data-native-press><b>${year}</b><span>${ATLAS_DATA.eras[year].title}</span></button>`).join('')}
          </nav>
          <div class="ledger">
            <span>АРХИВ</span><b>${ATLAS_DATA.meta.countryCount} стран</b>
            <b>${ATLAS_DATA.meta.provinceCount.toLocaleString('ru-RU')} провинций</b>
            <b>${ATLAS_DATA.meta.cityCount.toLocaleString('ru-RU')} городов</b>
          </div>
        </aside>

        <section class="map-desk">
          <div class="map-toolbar" data-ui>
            <nav class="mode-tabs">${Object.entries(MODES).map(([id,label])=>`<button data-mode="${id}" data-native-press>${label}</button>`).join('')}</nav>
            <label class="search"><span>⌕</span><input id="countrySearch" type="search" inputmode="search" autocomplete="off" placeholder="Найти страну…"><div class="search-results hidden" id="searchResults"></div></label>
          </div>

          <div class="map-frame" id="mapFrame" data-gesture-surface data-block-callout>
            <div class="loading-map" id="loadingMap"><i></i><span>РАЗВОРАЧИВАЕМ КАРТУ</span></div>
            <svg id="worldMap" class="world-map" viewBox="0 0 1000 500" role="img" aria-label="Интерактивная политическая карта мира">
              <defs><filter id="ink"><feTurbulence baseFrequency=".8" numOctaves="2" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".35"/></filter></defs>
              <path class="sphere" d="M18 42 Q500 -8 982 42 L982 458 Q500 508 18 458 Z"/>
              <g class="graticule" aria-hidden="true">${gridLines()}</g>
              <g id="countriesLayer"></g><g id="unitsLayer"></g><g id="citiesLayer"></g><g id="labelsLayer"></g>
            </svg>
            <div class="compass" aria-hidden="true"><b>С</b><i></i></div>
            <div class="map-scale" aria-hidden="true"><i></i><span>НАТУРАЛЬНАЯ ПРОЕКЦИЯ ЗЕМЛИ</span></div>
            <div class="gesture-hint" data-ui>ДВИГАЙ · МАСШТАБИРУЙ ДВУМЯ ПАЛЬЦАМИ</div>
            <div class="map-controls" data-ui><button data-zoom="in" data-native-press aria-label="Приблизить">＋</button><button data-zoom="out" data-native-press aria-label="Отдалить">−</button><button data-zoom="reset" data-native-press aria-label="Показать весь мир">⌂</button></div>
            <div class="map-toast" id="mapToast"></div>
          </div>

          <section class="quiz-slip" aria-live="polite">
            <div class="question-meta"><span id="questionKind"></span><b id="questionCount"></b></div>
            <div class="question-copy"><p id="questionLead"></p><h2 id="questionText"></h2></div>
            <div class="score"><span>ТОЧНОСТЬ</span><b id="scoreValue">—</b><span>СЕРИЯ</span><b id="streakValue">${state.streak}</b></div>
            <button class="next-button hidden" id="nextButton" data-native-press>СЛЕДУЮЩАЯ →</button>
          </section>
        </section>
      </section>
    </main>
    <div class="intro ${state.seenIntro?'hidden':''}" id="intro" role="dialog" aria-modal="true">
      <div class="intro-map" aria-hidden="true"></div>
      <div class="intro-sheet">
        <span>КАРТОГРАФИЧЕСКИЙ КАБИНЕТ № 03</span>
        <h2>Границы — это<br><em>временная краска.</em></h2>
        <p>Три настоящих политических среза, тысячи провинций и минимум десять ключевых городов для каждого полноценного государства. Ответы находятся только на карте.</p>
        <button id="startButton" data-native-press>РАЗВЕРНУТЬ АТЛАС</button>
        <a href="../../" data-app-control>Вернуться в Pocket Works</a>
      </div>
    </div>`;
  bindUI();
  setEra(state.era,false);
  requestAnimationFrame(()=>$('#loadingMap')?.classList.add('done'));
}

function gridLines(){
  const vertical=Array.from({length:11},(_,i)=>`<path d="M${45+i*91} 28 Q${500+(i-5)*12} 250 ${45+i*91} 472"/>`).join('');
  const horizontal=Array.from({length:7},(_,i)=>`<path d="M22 ${58+i*64} Q500 ${42+i*69} 978 ${58+i*64}"/>`).join('');
  return vertical+horizontal;
}

function bindUI(){
  $$('[data-era]').forEach(button=>button.addEventListener('click',()=>setEra(Number(button.dataset.era))));
  $$('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  $$('[data-zoom]').forEach(button=>button.addEventListener('click',()=>zoom(button.dataset.zoom)));
  $('#nextButton').addEventListener('click',nextQuestion);
  $('#soundButton').addEventListener('click',toggleSound);
  $('#startButton')?.addEventListener('click',()=>{state.seenIntro=true;saveState();$('#intro').classList.add('leaving');setTimeout(()=>$('#intro').remove(),360);tone(true);});
  $('#countrySearch').addEventListener('input',searchCountries);
  $('#countrySearch').addEventListener('keydown',event=>{if(event.key==='Escape'){event.currentTarget.value='';$('#searchResults').classList.add('hidden');event.currentTarget.blur();}});
  bindMapGestures();
}

function setEra(year,ask=true){
  state.era=year;saveState();view={...WORLD};updateView();
  $$('[data-era]').forEach(button=>button.classList.toggle('active',Number(button.dataset.era)===year));
  const era=ATLAS_DATA.eras[year];$('#eraTitle').textContent=year;$('#eraNote').textContent=era.note;
  updateModeLabels();renderMap();if(ask)paperFlip();nextQuestion();
}

function setMode(mode){
  state.mode=mode;saveState();locked=false;
  view={...WORLD};updateView();
  $$('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));
  renderMap();nextQuestion();
}

function updateModeLabels(){
  const provinceButton=$('[data-mode="province"]');
  if(provinceButton)provinceButton.textContent=state.era===2026?'ПРОВИНЦИИ':'ОБЛАСТИ';
}

function renderMap(){
  const modern=state.era===2026;
  $('#countriesLayer').innerHTML=ATLAS_DATA.countries.map(country=>`<path class="country ${modern?'interactive':''}" data-country="${country.iso3}" d="${country.path}" style="--fill:${country.color}"/>`).join('');
  if(modern&&state.mode==='province'){
    $('#unitsLayer').innerHTML=ATLAS_DATA.provinces.map(unit=>`<path class="unit province interactive" data-unit="${unit.id}" data-country="${unit.iso3}" d="${unit.path}"/>`).join('');
  }else if(!modern){
    $('#countriesLayer').innerHTML='';
    $('#unitsLayer').innerHTML=ATLAS_DATA.eras[state.era].units.map(unit=>`<path class="unit history interactive" data-unit="${unit.id}" d="${unit.path}" style="--fill:${unit.color}"/>`).join('');
  }else $('#unitsLayer').innerHTML='';
  $('#citiesLayer').innerHTML='';$('#labelsLayer').innerHTML='';
  $$('.interactive').forEach(node=>node.addEventListener('click',mapClick));
  $$('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===state.mode));
  if(!modern)renderHistoricalLabels();
}

function nextQuestion(){
  locked=false;clearMarks();$('#nextButton').classList.add('hidden');
  const era=ATLAS_DATA.eras[state.era];
  if(state.mode==='country'){
    if(state.era===2026){
      const candidates=ATLAS_DATA.countries.filter(country=>country.cities>=10&&country.path.length>24);
      const target=rand(candidates);question={mode:'country',target:target.iso3,label:target.name,country:target};
      setQuestion('НАЙДИ СТРАНУ',target.name,'Нажми на её территорию');
    }else{
      const groups=groupBy(era.units,unit=>unit.polity);
      const candidates=[...groups].filter(([polity,units])=>isNamed(polity)&&units.some(unit=>unit.path.length>35));
      const [polity,units]=rand(candidates);question={mode:'country',target:polity,label:displayName(polity),units};
      setQuestion(`ДЕРЖАВА · ${state.era}`,displayName(polity),'Нажми на любую её территорию');
    }
    $('#citiesLayer').innerHTML='';
  }else if(state.mode==='province'){
    if(state.era===2026){
      const country=rand(ATLAS_DATA.countries.filter(item=>(provincesByCountry.get(item.iso3)?.length||0)>=2));
      const target=rand(provincesByCountry.get(country.iso3));question={mode:'province',target:target.id,label:target.name,country};
      setQuestion(country.name.toUpperCase(),target.name,`Найди ${target.type.toLowerCase()} на карте`);focusCountry(country.iso3,.82);
    }else{
      const candidates=era.units.filter(unit=>isNamed(unit.name)&&isNamed(unit.polity)&&unit.name!==unit.polity&&unit.path.length>20);
      const target=rand(candidates.length?candidates:era.units);question={mode:'province',target:target.id,label:displayName(target.name),polity:target.polity};
      setQuestion(displayName(target.polity).toUpperCase(),displayName(target.name),'Найди владение или историческую область');focusUnit(target.id,.76);
    }
    $('#citiesLayer').innerHTML='';
  }else{
    if(state.era===2026){
      const country=rand(ATLAS_DATA.countries.filter(item=>(citiesByCountry.get(item.iso2)?.length||0)>=10));
      const cities=(citiesByCountry.get(country.iso2)||[]).slice(0,10);const target=rand(cities);
      question={mode:'city',target:target.id,label:target.name,country,cities};
      setQuestion(country.name.toUpperCase(),target.name,'Нажми на точку города');renderCities(cities);focusCountry(country.iso3,.78);
    }else{
      const groups=groupBy(era.units.filter(unit=>isNamed(unit.polity)),unit=>unit.polity);
      const likely=[...groups].filter(([,units])=>units.some(unit=>unit.path.length>120));
      let choice=null;
      for(const entry of shuffle(likely)){
        const cities=citiesForHistoricalPolity(entry[0],entry[1]);
        if(cities.length>=4){choice=[entry[0],cities];break;}
      }
      if(!choice){
        state.mode='country';saveState();updateModeLabels();renderMap();toast('Для этой карты доступны державы и области');nextQuestion();return;
      }
      const [polity,allCities]=choice;
      const cities=[...allCities].sort((a,b)=>Number(b.capital)-Number(a.capital)||b.pop-a.pop).slice(0,10);const target=rand(cities);
      question={mode:'city',target:target.id,label:target.name,polity,cities};
      setQuestion(`${displayName(polity).toUpperCase()} · ${state.era}`,target.name,'Нажми на точку города');renderCities(cities);focusHistoricalPolity(polity);
    }
  }
}

function setQuestion(kind,text,lead){
  $('#questionKind').textContent=kind;$('#questionText').textContent=text;$('#questionLead').textContent=lead;
  $('#questionCount').textContent=`ВОПРОС ${String(state.total+1).padStart(3,'0')}`;updateScore();
}

function renderCities(cities){
  $('#citiesLayer').innerHTML=cities.map(city=>`<g class="city interactive" data-city="${city.id}" transform="translate(${city.x} ${city.y})"><circle class="city-hit" r="12"/><circle r="5.2"/><circle class="city-core" r="1.7"/><text x="7" y="-5">${esc(city.name)}</text></g>`).join('');
  $$('.city').forEach(node=>node.addEventListener('click',mapClick));
}

function renderHistoricalLabels(){
  const groups=groupBy(ATLAS_DATA.eras[state.era].units.filter(unit=>isNamed(unit.polity)),unit=>unit.polity);
  const labels=[...groups].map(([polity,units])=>{
    const anchor=[...units].sort((a,b)=>b.path.length-a.path.length)[0];
    return {polity,anchor,size:units.reduce((sum,unit)=>sum+unit.path.length,0)};
  }).filter(item=>item.anchor.path.length>180||item.size>520)
    .sort((a,b)=>Number(b.polity==='France')-Number(a.polity==='France')||b.size-a.size).slice(0,34);
  $('#labelsLayer').innerHTML=labels.map(({polity,anchor})=>`<text class="historical-label" x="${anchor.cx}" y="${anchor.cy}">${esc(displayName(polity))}</text>`).join('');
}

function mapClick(event){
  event.stopPropagation();if(locked)return;
  const node=event.currentTarget;let correct=false,answer='';
  if(question.mode==='city'){
    const id=node.dataset.city;if(!id){toast('Нужна точка города, а не вся страна');return;}
    const city=ATLAS_DATA.cities.find(item=>item.id===id);answer=city?.name||'';correct=id===question.target;
    node.classList.add(correct?'correct':'wrong');const target=$(`[data-city="${question.target}"]`);target?.classList.add('correct','reveal');
  }else if(state.era===2026&&question.mode==='country'){
    const iso3=node.dataset.country;const country=countryByIso3.get(iso3);answer=country?.name||'';correct=iso3===question.target;
    node.classList.add(correct?'correct':'wrong');$(`[data-country="${question.target}"]`)?.classList.add('correct');
  }else{
    const id=node.dataset.unit;if(!id){toast('Выбери область внутри карты');return;}
    const unit=state.era===2026?ATLAS_DATA.provinces.find(item=>item.id===id):ATLAS_DATA.eras[state.era].units.find(item=>item.id===id);
    answer=question.mode==='country'?unit?.polity:unit?.name;
    correct=question.mode==='country'?unit?.polity===question.target:id===question.target;
    node.classList.add(correct?'correct':'wrong');
    if(question.mode==='country')$$('[data-unit]').filter(el=>{const u=ATLAS_DATA.eras[state.era].units.find(item=>item.id===el.dataset.unit);return u?.polity===question.target;}).forEach(el=>el.classList.add('correct'));
    else $(`[data-unit="${question.target}"]`)?.classList.add('correct');
  }
  finish(correct,answer);
}

function finish(correct,answer){
  locked=true;state.total+=1;if(correct){state.score+=1;state.streak+=1;state.best=Math.max(state.best,state.streak);}else state.streak=0;saveState();updateScore();tone(correct);
  if(navigator.vibrate)navigator.vibrate(correct?18:[24,40,24]);
  $('#questionLead').textContent=correct?(state.streak>=3?`ТОЧНО · СЕРИЯ ${state.streak}`:'ВЕРНО'):`НЕ ТУДА · ${answer||'другая область'}`;
  $('#questionText').textContent=correct?question.label:`Правильно: ${question.label}`;$('#nextButton').classList.remove('hidden');
  if(correct&&question.country)showCountryLabel(question.country);
}

function showCountryLabel(country){
  const cities=(citiesByCountry.get(country.iso2)||[]).slice(0,10);
  $('#labelsLayer').innerHTML=`<g class="country-callout" transform="translate(${country.cx} ${country.cy})"><rect x="-68" y="-24" width="136" height="42" rx="2"/><text y="-7">${esc(country.name)}</text><text class="small" y="8">${country.provinces} пров. · ${cities.length} городов</text></g>`;
}

function updateScore(){
  $('#scoreValue').textContent=state.total?`${Math.round(state.score/state.total*100)}%`:'—';$('#streakValue').textContent=state.streak;
}

function clearMarks(){
  $$('.correct,.wrong,.reveal').forEach(node=>node.classList.remove('correct','wrong','reveal'));
  if(state.era===2026)$('#labelsLayer').innerHTML='';else renderHistoricalLabels();
}
function toast(text){const node=$('#mapToast');node.textContent=text;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),1700);}
function toggleSound(){state.sound=!state.sound;saveState();$('#soundButton').textContent=state.sound?'♪':'×';if(state.sound)tone(true,430);}
function tone(correct,frequency){if(!state.sound)return;try{audio ||= new AudioContext();const osc=audio.createOscillator(),gain=audio.createGain();osc.type=correct?'sine':'triangle';osc.frequency.setValueAtTime(frequency||(correct?510:150),audio.currentTime);if(correct)osc.frequency.exponentialRampToValueAtTime((frequency||510)*1.25,audio.currentTime+.09);gain.gain.setValueAtTime(.0001,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.04,audio.currentTime+.012);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.15);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+.16);}catch{}}

function searchCountries(event){
  const input=event.currentTarget;const query=input.value.trim().toLocaleLowerCase('ru');const results=$('#searchResults');
  if(query.length<2){results.classList.add('hidden');return;}
  const matches=ATLAS_DATA.countries.filter(country=>country.name.toLocaleLowerCase('ru').includes(query)||country.nameEn.toLowerCase().includes(query)).slice(0,7);
  results.innerHTML=matches.length?matches.map(country=>`<button data-find="${country.iso3}"><b>${esc(country.name)}</b><span>${country.provinces} провинций · ${country.cities} городов</span></button>`).join(''):'<p>Ничего не нашли</p>';
  results.classList.remove('hidden');$$('[data-find]',results).forEach(button=>button.addEventListener('click',()=>{const country=countryByIso3.get(button.dataset.find);input.value=country.name;results.classList.add('hidden');if(state.era!==2026)setEra(2026);requestAnimationFrame(()=>{focusCountry(country.iso3,.72);showCountryLabel(country);toast(`${country.name}: ${country.provinces} провинций, ${country.cities} городов`);});}));
}

function focusCountry(iso3,padding=.8){
  const node=$(`[data-country="${iso3}"]`);if(!node)return;focusBBox(node.getBBox(),padding);
}
function focusUnit(id,padding=.75){const node=$(`[data-unit="${id}"]`);if(node)focusBBox(node.getBBox(),padding);}
function focusHistoricalPolity(polity){
  const ids=new Set(ATLAS_DATA.eras[state.era].units.filter(unit=>unit.polity===polity).map(unit=>unit.id));
  const boxes=$$('[data-unit]').filter(node=>ids.has(node.dataset.unit)).map(node=>node.getBBox());
  if(!boxes.length)return;const x=Math.min(...boxes.map(box=>box.x)),y=Math.min(...boxes.map(box=>box.y)),right=Math.max(...boxes.map(box=>box.x+box.width)),bottom=Math.max(...boxes.map(box=>box.y+box.height));focusBBox({x,y,width:right-x,height:bottom-y},.78);
}
function focusBBox(box,padding){
  const targetW=Math.min(1000,Math.max(90,box.width/Math.max(.2,padding)*2.1));const targetH=Math.min(500,Math.max(70,box.height/Math.max(.2,padding)*2.1));
  const ratio=2;view.w=Math.max(targetW,targetH*ratio);view.h=view.w/ratio;view.x=clamp(box.x+box.width/2-view.w/2,0,1000-view.w);view.y=clamp(box.y+box.height/2-view.h/2,0,500-view.h);updateView();
}
function zoom(action,center){
  if(action==='reset'){view={...WORLD};updateView();return;}
  const factor=action==='in'?.7:1.42;const w=clamp(view.w*factor,75,1000),h=w/2;const cx=center?.x??view.x+view.w/2,cy=center?.y??view.y+view.h/2;view={x:clamp(cx-w/2,0,1000-w),y:clamp(cy-h/2,0,500-h),w,h};updateView();
}
function updateView(){$('#worldMap')?.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function bindMapGestures(){
  const frame=$('#mapFrame');
  const point=event=>({x:event.clientX,y:event.clientY});
  const begin=()=>{
    const active=[...pointers.values()];
    if(active.length===1){
      gesture={kind:'pan',startView:{...view},start:{...active[0]},moved:false};
    }else if(active.length>=2){
      const [a,b]=active;const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const rect=frame.getBoundingClientRect();
      gesture={kind:'pinch',startView:{...view},distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center,
        world:{x:view.x+(center.x-rect.left)/rect.width*view.w,y:view.y+(center.y-rect.top)/rect.height*view.h},moved:true};
      frame.classList.add('pinching');
    }
  };
  frame.addEventListener('pointerdown',event=>{
    if(event.target.closest('.map-controls,.search'))return;
    pointers.set(event.pointerId,point(event));frame.setPointerCapture?.(event.pointerId);begin();frame.classList.add('dragging');
  });
  frame.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,point(event));
    const active=[...pointers.values()];
    if(active.length>=2){
      if(gesture?.kind!=='pinch')begin();
      const [a,b]=active;const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const rect=frame.getBoundingClientRect();
      const w=clamp(gesture.startView.w*gesture.distance/distance,55,1000),h=w/2;
      view={x:clamp(gesture.world.x-(center.x-rect.left)/rect.width*w,0,1000-w),y:clamp(gesture.world.y-(center.y-rect.top)/rect.height*h,0,500-h),w,h};
      updateView();return;
    }
    if(!gesture||gesture.kind!=='pan'||!active.length)return;
    const current=active[0],dx=current.x-gesture.start.x,dy=current.y-gesture.start.y;
    if(Math.hypot(dx,dy)>7)gesture.moved=true;if(!gesture.moved)return;
    view.x=clamp(gesture.startView.x-dx*gesture.startView.w/frame.clientWidth,0,1000-view.w);
    view.y=clamp(gesture.startView.y-dy*gesture.startView.h/frame.clientHeight,0,500-view.h);updateView();
  });
  const end=event=>{
    if(!pointers.has(event.pointerId))return;
    const moved=gesture?.moved||gesture?.kind==='pinch';
    pointers.delete(event.pointerId);
    if(moved)suppressClickUntil=performance.now()+260;
    frame.classList.remove('pinching');
    if(pointers.size)begin();else{gesture=null;frame.classList.remove('dragging');}
  };
  frame.addEventListener('pointerup',end);frame.addEventListener('pointercancel',end);frame.addEventListener('lostpointercapture',end);
  frame.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  frame.addEventListener('dblclick',event=>{const rect=frame.getBoundingClientRect();zoom('in',{x:view.x+(event.clientX-rect.left)/rect.width*view.w,y:view.y+(event.clientY-rect.top)/rect.height*view.h});});
}

function citiesForHistoricalPolity(polity,units){
  const key=`${state.era}:${polity}`;if(historicalCityCache.has(key))return historicalCityCache.get(key);
  const shapes=units.flatMap(unit=>parsePath(unit.path));
  const cities=ATLAS_DATA.cities.filter(city=>shapes.some(shape=>pointInShape(city.x,city.y,shape)));
  historicalCityCache.set(key,cities);return cities;
}

function parsePath(path){
  if(parsedPathCache.has(path))return parsedPathCache.get(path);
  const tokens=path.match(/[MLZ]|-?\d+(?:\.\d+)?/gi)||[],shapes=[];let shape=null;
  for(let i=0;i<tokens.length;){
    const token=tokens[i++];
    if(token==='M'||token==='L'){
      const x=Number(tokens[i++]),y=Number(tokens[i++]);
      if(token==='M'){shape=[];shapes.push(shape);}shape?.push({x,y});
    }
  }
  parsedPathCache.set(path,shapes);return shapes;
}

function pointInShape(x,y,shape){
  if(shape.length<3)return false;
  let inside=false;
  for(let i=0,j=shape.length-1;i<shape.length;j=i++){
    const a=shape[i],b=shape[j];
    if(((a.y>y)!==(b.y>y))&&(x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x))inside=!inside;
  }
  return inside;
}

function displayName(name){return LOCAL_NAMES[name]||name;}
function isNamed(name){return Boolean(name&&name!=='Без названия'&&name!=='Unnamed');}
function shuffle(items){return [...items].sort(()=>Math.random()-.5);}

function paperFlip(){const frame=$('#mapFrame');frame.classList.remove('turning');void frame.offsetWidth;frame.classList.add('turning');}

createWorkshopMode({appName:'ХРОНОАТЛАС',version:'2.1.0',cachePrefix:'chronatlas-',storageNamespace:'pocket-works:chronatlas',onReset(){localStorage.removeItem(STORAGE_KEY);state={...DEFAULTS};renderShell();}});
window.addEventListener('appdatareset',()=>{localStorage.removeItem(STORAGE_KEY);state={...DEFAULTS};renderShell();});

renderShell();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
