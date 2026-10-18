import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import './reader.js';
import {installUIInspector, INSPECTOR_SCREENS} from './dev-inspector.js';
import {renderAtlas,renderGenealogy,shieldSvg} from './atlas.js';
import {atlasOwnerSnapshot,transferHighlights} from './atlas-core.js';
import {memoryImpact} from './sim/politics.js';
import {campaignLegacy,campaignChronicleText} from './sim/legacy.js';
import {changeTitleHolder} from './sim/transactions.js';
import {createWorld} from './sim/world.js';
import {campaignStarts,startCampaign,campaignChoices,campaignAction,campaignYear,
  campaignScore,extendCampaign,serializeCampaign,loadCampaign} from './sim/campaign.js';
installMobileRuntime();
const PREVIEW_ID=new URLSearchParams(location.search).get('venets-preview');
const IS_PREVIEW=PREVIEW_ID!==null;

const by=id=>document.getElementById(id);
const screens={loading:by('loading-screen'),menu:by('menu-screen'),game:by('game-screen'),
  ending:by('ending-screen'),docs:by('docs-screen')};
const SHADES=['#686f55','#885d4b','#77785f','#596e74','#8b7b57'];
const TITLES={marriage:'Заключить династический брак',gift:'Отправить дипломатический дар',
  grant:'Пожаловать графство',contract:'Служебная грамота',war:'Объявить войну',
  peace:'Заключить мир',blackmail:'Собрать компромат',assassinate:'Организовать покушение',petition:'Потребовать признания права',
  faction:'Создать фракцию претендента',join:'Поддержать претендента',
  ultimatum:'Предъявить ультиматум'};
const REASONS={
  'unmarried':'Свободны для брака','dynastic-link':'Связь двух домов',
  'gift-affordable':'Есть средства','improve-relationship':'Улучшить отношения',
  'family-appanage':'Надел родственнику','spare-county':'Есть свободное графство',
  'documented-claim':'Подтверждённое право','feudal-petition':'Требование по праву',
  'living-claimant':'Претендент жив','political-opposition':'Политическая оппозиция',
  'active-faction':'Действующая фракция','political-affinity':'Общие интересы',
  'coalition':'Союз сторонников',
  'written-claim':'Документированная претензия','levy-funded':'Оплаченная дружина',
  'spies-paid':'Оплаченные агенты','dynastic-rivalry':'Династический соперник',
  'high-risk':'Высокий риск разоблачения','service-for-silver':'Военная поддержка за серебро',
  'finite-oath':'Присяга на ограниченный срок','cease-hostilities':'Прекращение войны',
  'renounce-current-siege':'Отказ от текущей осады',
  'past-refusal':'Прежний отказ','remembered-injustice':'Помнит несправедливость',
  'partner-consent':'Согласие партнёра',
  'pledged-power':'Сила сторонников','ruler-power':'Сила правителя'
};
const reasonLabel=reason=>{
  const [key,value]=String(reason).split('=');
  const word=REASONS[key]||key;
  return value===undefined?word:word+': '+value;
};
const ICONS={marriage:'✦',gift:'◇',grant:'♜',petition:'§',faction:'⚑',join:'✧',ultimatum:'!',
  contract:'♜',war:'⚔',peace:'◌',blackmail:'⌕',assassinate:'✧'}; // compact navigation glyphs, not real coat-of-arms
const GOALS={'secure-claim':'Вернуть спорный титул','political-leverage':'Ослабить сюзерена',
  'gain-land':'Получить владение','stabilize-realm':'Укрепить мир','seek-marriage':'Создать союзный дом',
  'secure-house':'Защитить род'};
let game=null,saved=null,backupRaw=null,selectedCounty='co-01',selectedProvince='pr-01',panel='lands',filter='house';
let screen='loading',autoSpeed=0,autoHandle=null,saveQueue=Promise.resolve();
let storage='indexeddb',database=null,actionPending=null,busy=false,toastHandle=null;
let atlasView='atlas',familyFocus=null,atlasChanges=[],atlasRegion=0,selectedSize=12,showAllChoices=false;
let startRank='county',startRegion=0;
const houseColor=(w,id)=>{
  const p=w.people.find(p=>p.id===id);
  const index=w.dynasties.findIndex(h=>h.id===p?.dynastyId);
  return SHADES[Math.max(index,0)%SHADES.length];
};
const pname=(w,id)=>w.people.find(p=>p.id===id)?.name||'Неизвестный';
const tname=(w,id)=>w.titles.find(t=>t.id===id)?.name||'Неизвестный титул';
const titleHolder=(w,id)=>w.titles.find(t=>t.id===id)?.holderId;
const house=(w,id)=>w.dynasties.find(d=>d.id===id)?.name||'Дом';
const children=(w,id)=>w.people.filter(p=>p.parentIds.includes(id));
function label(element,text){element.textContent=text;return element}
function element(tag,cls='',text=''){
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(text)n.textContent=text;
  return n;
}
function notify(message){
  const n=by('notice');n.textContent=message;n.hidden=false;
  if(toastHandle)clearTimeout(toastHandle);
  // Inspector screenshots must remain stable without affecting the real session.
  if(!IS_PREVIEW)toastHandle=setTimeout(()=>{n.hidden=true},4300);
}
function screenTo(name){
  screen=name;
  for(const [key,node] of Object.entries(screens))node.hidden=key!==name;
  by('back-menu').hidden=name==='menu'||name==='loading';
}
function openDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB'in window)){reject(Error('IndexedDB unsupported'));return}
    const request=indexedDB.open('venets-campaigns',1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('saves'))db.createObjectStore('saves')};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('IndexedDB unavailable'));
    request.onblocked=()=>reject(Error('Another tab blocks saves'));
  });
}
function dbRead(key='active'){
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('saves','readonly');
    const request=tx.objectStore('saves').get(key);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>reject(request.error||Error('Save read error'));
  });
}
function dbWrite(data,{rotate=true}={}){
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('saves','readwrite'),store=tx.objectStore('saves');
    let old=null;
    const prior=store.get('active');
    prior.onsuccess=()=>{
      old=prior.result||null;
      if(rotate&&old&&old!==data)store.put(old,'backup');
      store.put(data,'active');
    };
    tx.oncomplete=()=>resolve(old);
    tx.onerror=()=>reject(tx.error||Error('Save write failed'));
    tx.onabort=()=>reject(tx.error||Error('Save aborted'));
  });
}
async function initializeStorage(){
  try{
    database=await openDB();storage='indexeddb';
    return {active:await dbRead('active'),backup:await dbRead('backup')};
  }catch(e){
    database=null;storage='localstorage';
    try{return {active:localStorage.getItem('venets:campaign:v1'),
      backup:localStorage.getItem('venets:campaign:backup:v1')}}
    catch{
      storage='memory';
      notify('Хранилище недоступно. Прогресс не сохранится после закрытия вкладки.');
      return {active:null,backup:null};
    }
  }
}
async function writeSave(data,{rotate=true}={}){
  if(storage==='indexeddb'&&database)return dbWrite(data,{rotate});
  if(storage==='localstorage'){
    const old=localStorage.getItem('venets:campaign:v1');
    if(rotate&&old&&old!==data)localStorage.setItem('venets:campaign:backup:v1',old);
    localStorage.setItem('venets:campaign:v1',data);
    return old;
  }
  throw Error('Нет постоянного хранилища');
}
function validBackup(raw){
  if(typeof raw!=='string'||!raw)return null;
  try{loadCampaign(raw);return raw}catch{return null}
}

function saveGame(){
  if(IS_PREVIEW||!game)return;
  let data;
  try{data=serializeCampaign(game)}catch(e){notify('Сохранение остановлено: '+e.message);return}
  by('save-status').textContent='Сохраняем…';
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const previous=await writeSave(data);
    if(previous&&previous!==data)backupRaw=validBackup(previous);
    saved=data;
    by('save-status').textContent='Сохранено';
  }).catch(e=>{
    by('save-status').textContent='Не сохранено';
    notify('Ошибка сохранения: '+e.message+'. Проверьте свободное место в браузере.');
  });
}
function saveMenu(){
  by('restore-backup').hidden=!backupRaw;
  by('resume').hidden=!(saved||game);
  if(game){
    label(by('resume-summary'),String(game.world.year)+' год · '+pname(game.world,game.playerId));
  }else if(saved){
    try{const data=loadCampaign(saved);
      label(by('resume-summary'),data.world.year+' год · '+pname(data.world,data.playerId));
    }catch(e){saved=null;by('resume').hidden=true;notify('Старое сохранение повреждено. Можно начать новую хронику.')}
  }
}
// The starting map uses exactly the same feudal registry as live campaigns.
function buildStarts(){
  const seed=Number(by('seed-input').value);
  const valid=Number.isSafeInteger(seed)&&seed>=0&&seed<=0xffffffff;
  by('begin').disabled=!valid;
  if(!valid){
    by('starts').replaceChildren(element('p','start-error','Укажите целый номер мира от 0 до 4294967295.'));
    by('start-map').replaceChildren();
    return;
  }
  let w;
  try{w=createWorld(seed,{size:selectedSize})}
  catch(e){by('begin').disabled=true;by('starts').textContent=e.message;return}
  const available=w.titles.filter(t=>t.rank===startRank);
  if(!available.some(t=>t.id===selectedCounty))selectedCounty=available[0].id;
  const chosen=w.titles.find(t=>t.id===selectedCounty),person=w.people.find(p=>p.id===chosen.holderId);
  const lord=chosen.liegeId?w.titles.find(t=>t.id===chosen.liegeId):null;
  const overlord=lord?w.people.find(p=>p.id===lord.holderId):null;
  const vassals=w.titles.filter(t=>t.liegeId===chosen.id).length;
  const counties=w.titles.filter(t=>t.rank==='county'&&(
    t.id===chosen.id||t.liegeId===chosen.id||
    w.titles.find(d=>d.id===t.liegeId)?.liegeId===chosen.id));
  const representative=w.provinces.find(p=>p.titleId===counties[0]?.id);
  if(!counties.some(t=>t.provinceId===selectedProvince))selectedProvince=representative?.id||w.provinces[0].id;
  const details=element('div','start-ruler');
  const seal=element('span','start-ruler-seal');seal.append(shieldSvg(person.dynastyId));
  const copy=element('div','start-ruler-copy');
  copy.append(element('span','start-ruler-rank',
    ({county:'ГРАФ',duchy:'ГЕРЦОГ',kingdom:'КОРОЛЬ'})[startRank]),
    element('h3','',person.name),
    element('p','',chosen.name),
    element('small','',lord?'Сюзерен: '+overlord.name+' · '+lord.name:
      'Независимый государь Междуречья'));
  details.append(seal,copy);
  if(vassals)details.append(element('span','start-vassal-count',vassals+' васс.'));
  by('starts').replaceChildren(details);
  for(const button of document.querySelectorAll('[data-start-rank]')){
    const active=button.dataset.startRank===startRank;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  const expanded=w.provinces.length===48;
  by('start-region-controls').hidden=!expanded;
  if(expanded)label(by('start-region-label'),['I','II','III','IV'][startRegion]+' / IV');
  const oldMap=by('start-map').querySelector('.atlas-canvas');
  const horizontal=oldMap?.scrollLeft||0;
  const map=renderAtlas(w,{selectedId:selectedProvince,selectedTitleId:chosen.id,
    region:startRegion,rank:startRank,onSelect:(provinceId,titleId)=>{
      selectedCounty=titleId;selectedProvince=provinceId;
      buildStarts();
    }});
  by('start-map').replaceChildren(map);
  map.scrollLeft=horizontal;
}
function menu(){
  if(game)selectedSize=game.world.provinces.length;
  for(const b of document.querySelectorAll('[data-world-size]')){
    const selected=Number(b.dataset.worldSize)===selectedSize;
    b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
  }
  pause();screenTo('menu');saveMenu();buildStarts();
}
function play(){
  if(!game){menu();return}
  pause();screenTo('game');by('game-screen').dataset.activePanel=panel;
  renderGame();
}
function resume(){
  if(!game&&saved){try{game=loadCampaign(saved)}catch(e){notify('Не удалось открыть сохранение: '+e.message);saved=null;menu();return}}
  if(!game){menu();return}
  if(game.finished||game.chapterComplete){pause();renderEnding();screenTo('ending')}
  else play();
}
function begin(){
  const seed=Number(by('seed-input').value);
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff){notify('Номер мира должен быть целым положительным числом или нулём.');return}
  try{
    game=startCampaign({seed,countyId:selectedCounty,size:selectedSize});
    const seat=game.world.titles.find(t=>t.id===selectedCounty);
    const firstCounty=game.world.titles.find(t=>t.rank==='county'&&(
      t.id===seat.id||t.liegeId===seat.id||
      game.world.titles.find(d=>d.id===t.liegeId)?.liegeId===seat.id));
    selectedProvince=seat.provinceId||firstCounty?.provinceId||game.world.provinces[0].id;
    atlasRegion=game.world.provinces.length===48?
      regionFor(game.world.provinces.find(p=>p.id===selectedProvince)):0;
    panel='lands';filter='house';atlasView='atlas';familyFocus=null;atlasChanges=[];showAllChoices=false;saveGame();play();
  }catch(e){notify('Не удалось создать мир: '+e.message)}
}
function showNewConfirmation(){
  if(!game&&!saved){begin();return}
  const dialog=by('new-dialog');
  dialog.returnValue='';
  dialog.showModal();
}
by('new-dialog').addEventListener('close',()=>{
  if(by('new-dialog').returnValue==='confirm'){pause();begin()}
});
function pause(){
  autoSpeed=0;if(autoHandle){clearInterval(autoHandle);autoHandle=null}
  for(const b of document.querySelectorAll('[data-speed]')){
    const selected=Number(b.dataset.speed)===0;
    b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
  }
}
function setSpeed(speed){
  pause();
  if(!game||game.finished||game.chapterComplete)return;
  autoSpeed=speed;
  for(const b of document.querySelectorAll('[data-speed]')){
    const selected=Number(b.dataset.speed)===speed;
    b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
  }
  if(speed>0){
    const ms=({1:1800,2:900,4:390})[speed];
    autoHandle=setInterval(()=>{
      if(screen!=='game'||document.hidden){pause();return}
      nextYear();
    },ms);
  }
}
function nextYear(){
  if(busy||!game||game.finished||game.chapterComplete)return;
  busy=true;
  try{
    const previousOwners=atlasOwnerSnapshot(game.world);
    const result=campaignYear(game);
    atlasChanges=transferHighlights(previousOwners,game.world);
    showAllChoices=false;
    saveGame();
    if(result.finished||result.chapterComplete){pause();renderEnding();screenTo('ending')}
    else{
      renderGame();
      if(result.succession){pause();notify('Наследование: теперь вы играете за '+result.succession.name)}
      else if(result.significant){pause();notify('Важное событие в вашем владении. Время остановлено.')}
    }
  }catch(e){pause();notify('Год не завершён: '+e.message);console.error(e)}
  finally{busy=false}
}
function actionTitle(action,w){
  const who=action.targetId?pname(w,action.targetId):'';
  const land=action.titleId?' · '+tname(w,action.titleId):'';
  return TITLES[action.kind]+(who?' — '+who:'')+land;
}
function actionDetail(a,w){
  const traits={gift:'Передаёт деньги и повышает доверие. Повторение ограничено.',
    marriage:'Оба человека должны быть свободны, совершеннолетни и не состоять в близком родстве.',
    grant:'Графство перейдёт другому владельцу навсегда; его право будет записано в историю.',
    petition:'Обладатель титула может согласиться с требованием или отказать. Отказ запомнят.',
    faction:'Создаёт постоянное политическое объединение претендента. Сторонники могут присоединиться.',
    join:'Вы войдёте в политическую коалицию и будете поддерживать другого претендента.',
    ultimatum:'Политическое давление может привести к уступке земли или ещё большей вражде. Это не война.',
    contract:'8 монет за шестилетнюю службу. Договор приносит поддержку при мобилизации.',
    war:'Подтверждённая претензия; 10 монет и 14 зерна за сбор дружины. Марш, снабжение и осада идут по годам.',
    peace:'Прекратить войну, не получив спорный титул.',
    blackmail:'8 монет за тайное расследование. Шанс добиться передачи титула; при разоблачении отношения портятся.',
    assassinate:'14 монет за рискованное покушение. Смерть противника запускает обычное наследование.'};
  let text=traits[a.kind]||'';
  if(a.kind==='gift')text+=' Цена: '+a.meta.amount+' монет.';
  return text+' Основания: '+a.reasons.map(reasonLabel).join(' · ')+'.';
}
function renderConflictStatus(){
  const node=by('conflict-strip');
  const w=game.world,s=w.conflicts;
  const active=s?.wars.filter(war=>war.attackerId===game.playerId||war.defenderId===game.playerId)||[];
  const plots=s?.schemes.filter(x=>x.actorId===game.playerId)||[];
  const contracts=s?.contracts.filter(x=>x.beneficiaryId===game.playerId)||[];
  const bits=[];
  for(const war of active)bits.push('Война: '+tname(w,war.titleId)+' · '+war.attackerTroops+
    ' бойцов · осада '+war.siege+'/3');
  for(const plot of plots)bits.push((plot.kind==='assassinate'?'Покушение':'Интрига')+
    ' · '+Math.min(100,plot.progress)+'%');
  if(contracts.length)bits.push('Присяги: '+contracts.length);
  node.hidden=!bits.length;
  node.replaceChildren(...bits.map(str=>element('span','',str)));
}
function renderCouncil(){
  const w=game.world,p=w.people.find(p=>p.id===game.playerId);
  const inherited=w.titles.filter(t=>t.holderId===p.id);
  const claim=w.titles.find(t=>t.claims.some(c=>c.personId===p.id) && t.holderId!==p.id);
  const story=claim?
    'Ваше право: '+claim.name+'. Держатель — '+pname(w,claim.holderId)+'.':
    (inherited.length?
      'Дом '+house(w,game.dynastyId)+' удерживает '+inherited.length+' '+(inherited.length===1?'титул.':'титулов.'):
      'Ваш дом лишился земель, но ещё жив. Сохраните претензии и ищите сторонников.');
  const remembered=claim?memoryImpact(w,p.id,claim.holderId):{value:0,source:null};
  label(by('story'),story+(remembered.value<=-5&&remembered.source?
    ' Помнит обиду · '+remembered.source.year+' г.':''));
  renderConflictStatus();
  const actions=campaignChoices(game);
  const container=by('actions'),frag=document.createDocumentFragment();
  if(!actions.length){
    frag.append(element('p','action-intro',game.lastActionYear===w.year?
      'Решение принято. Продолжить →':w.year-p.birthYear<18?
      'До совершеннолетия решения недоступны.':'Нет решений. Продолжить →'));
  }else{
    const featured=actions.slice(0,3);
    // Hostilities must not be hidden in the extra-actions drawer.
    for(const a of actions)if(['peace','war'].includes(a.kind)&&
      !featured.some(v=>v.kind===a.kind&&v.targetId===a.targetId&&v.titleId===a.titleId))
      featured.push(a);
    const rest=actions.filter(a=>!featured.includes(a));
    const chosen=showAllChoices?[...featured,...rest]:featured;
    for(const a of chosen){
      const b=element('button','action-choice');b.type='button';b.dataset.actionKind=a.kind;
      const sign=element('span','action-sign',ICONS[a.kind]);
      const info=element('span','action-copy');
      info.append(element('strong','',TITLES[a.kind]),element('small','',
        (a.targetId?pname(w,a.targetId):'Династическое решение')+
        (a.titleId?' · '+tname(w,a.titleId):'')+
        (a.reasons.includes('remembered-injustice')?' · Помнит обиду':'')+
        (a.reasons.includes('past-refusal')?' · Не доверяет':'')+
        (a.kind==='gift'?' · '+a.meta.amount+' монет':'')));
      b.append(sign,info,element('span','action-arrow','→'));
      b.addEventListener('click',()=>askAction(a));
      frag.append(b);
    }
    if(rest.length){
      const more=element('button','more-actions',showAllChoices?
        'Свернуть решения ↑':'Ещё решения · '+rest.length+' ↓');
      more.type='button';more.setAttribute('aria-expanded',String(showAllChoices));
      more.addEventListener('click',()=>{showAllChoices=!showAllChoices;renderCouncil()});
      frag.append(more);
    }
  }
  container.replaceChildren(frag);
}
function askAction(a){
  if(!game||screen!=='game')return;
  actionPending=a;
  label(by('confirm-title'),TITLES[a.kind]);
  label(by('confirm-text'),actionTitle(a,game.world)+'. '+actionDetail(a,game.world));
  const dlg=by('confirm-dialog');dlg.returnValue='';dlg.showModal();
  pause();
}
by('confirm-dialog').addEventListener('close',()=>{
  if(by('confirm-dialog').returnValue!=='confirm'||!actionPending){actionPending=null;return}
  const a=actionPending;actionPending=null;
  try{
    const previousOwners=atlasOwnerSnapshot(game.world);
    const outcome=campaignAction(game,a);
    atlasChanges=transferHighlights(previousOwners,game.world);
    showAllChoices=false;
    saveGame();
    const msg=outcome.success?'Решение исполнено. Последствия внесены в летопись.':
      'Получен отказ. Обиды и требования сохранены.';
    const pane=by('last-action');
    pane.replaceChildren(element('strong','',outcome.success?'Решение принято':'Ваша просьба отклонена'),
      element('span','',msg));
    pane.hidden=false;
    renderGame();
    notify(msg);
  }catch(e){notify('Решение больше недоступно: '+e.message);renderGame()}
});
function selectAtlasView(view){
  atlasView=view==='family'?'family':'atlas';
  by('atlas-stage').hidden=atlasView!=='atlas';
  by('genealogy-stage').hidden=atlasView!=='family';
  by('province-info').hidden=atlasView!=='atlas';
  by('region-controls').hidden=atlasView!=='atlas'||game?.world.provinces.length!==48;
  for(const button of document.querySelectorAll('[data-atlas-view]')){
    const active=button.dataset.atlasView===atlasView;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  }
}
function renderFamilyPanel(){
  const w=game.world,subject=w.people.find(p=>p.id===familyFocus);
  if(!subject)familyFocus=game.playerId;
  const chosen=w.people.find(p=>p.id===familyFocus);
  label(by('genealogy-subject'),chosen.name);
  by('genealogy-return').hidden=chosen.id===game.playerId;
  by('genealogy-tree').replaceChildren(renderGenealogy(w,chosen.id,{onPerson:id=>{
    familyFocus=id;renderFamilyPanel();
  }}));
}
function regionFor(p){return (p.x>=4?1:0)+(p.y>=3?2:0)}
function moveRegion(offset){
  if(!game||game.world.provinces.length!==48)return;
  atlasRegion=(atlasRegion+offset+4)%4;
  const first=game.world.provinces.find(p=>regionFor(p)===atlasRegion);
  if(first)selectedProvince=first.id;
  renderProvinces();
}
function renderProvinces(){
  const w=game.world;
  const province=w.provinces.find(p=>p.id===selectedProvince)||w.provinces[0];
  selectedProvince=province.id;
  const expanded=w.provinces.length===48;
  by('region-controls').hidden=!expanded||atlasView==='family';
  if(expanded)label(by('region-label'),['I','II','III','IV'][atlasRegion]+' / IV');
  const oldMap=by('province-grid').querySelector('.atlas-canvas');
  const oldScroll=oldMap?.scrollLeft||0;
  const rendered=renderAtlas(w,{selectedId:selectedProvince,changes:atlasChanges,region:atlasRegion,onSelect:id=>{
    selectedProvince=id;renderProvinces();
  }});
  by('province-grid').replaceChildren(rendered);
  rendered.scrollLeft=oldScroll;
  const county=w.titles.find(t=>t.id===province.titleId);
  const ruler=w.people.find(p=>p.id===county.holderId);
  const duke=w.titles.find(t=>t.id===county.liegeId);
  const isOurs=ruler.dynastyId===game.dynastyId;
  const claims=county.claims.filter(c=>w.people.some(p=>p.id===c.personId&&p.alive)).length;
  const detail=by('province-info');
  const group=element('div','atlas-selected');
  const shield=shieldSvg(ruler.dynastyId);
  const info=element('div','atlas-selected-text');
  info.append(element('h3','',province.name),element('p','',ruler.name+' · '+(duke?'герцог '+pname(w,duke.holderId):'коронное владение')));
  const meta=element('div','atlas-selected-meta');
  meta.append(element('span','',isOurs?'Ваш дом':'Чужой дом'),
    element('span','',claims?claims+' притяз.':'Без споров'));
  group.append(shield,info,meta);
  detail.replaceChildren(group);
  const ribbon=by('atlas-transfer');
  const affected=atlasChanges.map(id=>{
    const county=w.titles.find(t=>t.provinceId===id);
    return county?.name?.replace(/^Графство /,'');
  }).filter(Boolean);
  ribbon.hidden=!affected.length;
  if(affected.length)ribbon.textContent='Титул перешёл другому владельцу: '+affected.join(', ');
  if(!familyFocus||!w.people.some(p=>p.id===familyFocus))familyFocus=game.playerId;
  renderFamilyPanel();
  selectAtlasView(atlasView);
}
function eventHeadline(e,w){
  const x=e.effect||{};
  const name=id=>pname(w,id);
  switch(e.kind){
    case 'war-declared':return ['Подняты хоругви: '+tname(w,x.titleId),name(x.attackerId)+' против '+name(x.defenderId)];
    case 'war-year':return ['Поход за '+tname(w,x.titleId),'Дружина: '+x.troops+' · осада '+x.siege+'/3'];
    case 'war-peace':return ['Мир: '+tname(w,x.titleId),x.outcome==='victory'?'Победа претендента':x.outcome==='retreat'?'Отступление': 'Поражение'];
    case 'scheme-started':return ['Начата тайная операция',name(x.actorId)+' → '+name(x.targetId)];
    case 'scheme-ended':return ['Интрига завершена',x.success?'Успех':'Без результата'];
    case 'conflict-decision':return [name(x.actorId)+': '+(TITLES[x.kind]||x.kind),x.success?'Решение принято':'Получен отказ'];
    case 'campaign-founded':return ['Начало правления','Оспаривается власть герцога'];
    case 'death':return ['Умер '+name(x.personId),'Возраст: '+(x.age??'—')];
    case 'birth':return ['Родился '+name(x.personId),'Дом пополнился наследником'];
    case 'marriage':return ['Свадьба: '+name(x.personAId)+' и '+name(x.personBId),'Связаны два семейства'];
    case 'title-transfer':return [tname(w,x.titleId)+' меняет владельца',name(x.oldHolderId)+' → '+name(x.newHolderId)];
    case 'realm-partition':return ['Раздел владений','Несколько титулов перешли разным наследникам'];
    case 'inheritance':return ['Открыто наследство '+name(x.deceasedId),'Преемник: '+name(x.heirId)];
    case 'faction-founded':return ['Создана фракция','Претензия на '+tname(w,x.titleId)];
    case 'faction-ended':return ['Фракция распущена','Политическое требование изменилось'];
    case 'political-decision':return [name(x.actorId)+': '+(TITLES[x.kind]||x.kind),
      x.outcome?.success?'Успешно · '+(x.reasons||[]).map(reasonLabel).join(', '):'Отказ · '+(x.reasons||[]).join(', ')];
    case 'claim-founded':return ['Возникла претензия на '+tname(w,x.titleId),name(x.personId)];
    case 'shortage':return ['Недостаток зерна в '+(w.provinces.find(p=>p.id===x.provinceId)?.name||'провинции'),'Недостаёт '+x.missing];
    default:return [e.kind,e.cause];
  }
}
function eventAboutHouse(e,w){
  const x=e.effect||{},ids=[x.personId,x.actorId,x.oldHolderId,x.newHolderId,
    x.deceasedId,x.heirId,x.personAId,x.personBId,x.claimantId,x.attackerId,x.defenderId,x.targetId].filter(Boolean);
  if(ids.some(id=>w.people.find(p=>p.id===id)?.dynastyId===game.dynastyId))return true;
  if(x.titleId){
    const t=w.titles.find(t=>t.id===x.titleId);
    return w.people.find(p=>p.id===t?.holderId)?.dynastyId===game.dynastyId;
  }
  return false;
}
function renderChronicle(){
  const w=game.world,types=new Set(['campaign-founded','death','birth','marriage','inheritance',
    'title-transfer','realm-partition','faction-founded','faction-ended',
    'political-decision','claim-founded','shortage',
    'war-declared','war-year','war-peace','scheme-started','scheme-ended','conflict-decision']);
  let events=w.events.filter(e=>types.has(e.kind));
  if(filter==='house')events=events.filter(e=>eventAboutHouse(e,w)||e.kind==='campaign-founded');
  if(filter==='politics')events=events.filter(e=>['political-decision','faction-founded',
    'faction-ended','claim-founded','title-transfer','war-declared','war-year','war-peace',
    'scheme-started','scheme-ended','conflict-decision'].includes(e.kind));
  events=events.slice(-75).reverse();
  const fragment=document.createDocumentFragment();
  if(!events.length)fragment.append(element('p','subnote','Пока нет событий. Время продолжает идти.'));
  for(const e of events){
    const [head,desc]=eventHeadline(e,w);
    const row=element('div','entry'),group=element('div');
    group.append(element('strong','',head),element('p','',desc));
    row.append(element('time','',String(e.year)),group);
    fragment.append(row);
  }
  by('history-list').replaceChildren(fragment);
  for(const button of document.querySelectorAll('[data-filter]')){
    const active=button.dataset.filter===filter;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
}
function renderGame(){
  if(!game)return;
  const w=game.world,p=w.people.find(p=>p.id===game.playerId);
  const owned=w.titles.filter(t=>t.holderId===p.id).sort((a,b)=>
    ({kingdom:3,duchy:2,county:1})[b.rank]-({kingdom:3,duchy:2,county:1})[a.rank]);
  by('ruler-seal').style.setProperty('--house',houseColor(w,p.id));
  by('ruler-seal').replaceChildren(shieldSvg(p.dynastyId));
  label(by('ruler-name'),p.name.split(' ')[0]);
  label(by('ruler-rank'),(owned[0]?.name||'БЕЗЗЕМЕЛЬНЫЙ ПРЕТЕНДЕНТ').toLocaleUpperCase('ru-RU'));
  label(by('ruler-subtitle'),house(w,game.dynastyId)+' · '+(w.year-p.birthYear)+' лет');
  label(by('year-count'),String(w.year));
  label(by('coin-count'),String(p.treasury.coin));
  renderCouncil();renderProvinces();renderChronicle();
  by('game-screen').dataset.activePanel=panel;
  for(const button of document.querySelectorAll('[data-panel]')){
    const active=button.dataset.panel===panel;button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  if(game.lastActionYear!==w.year)by('last-action').hidden=true;
}
function renderEnding(){
  if(!game)return;
  const result=campaignLegacy(game),score=result.stats;
  const title=result.title;
  label(by('ending-title'),title);
  label(by('ending-eyebrow'),(game.finished?'ПОСЛЕДНЯЯ СТРАНИЦА':'ЗАВЕРШЕНИЕ ГЛАВЫ')+' · '+result.year);
  label(by('ending-note'),result.summary);
  label(by('ending-house'),'Дом '+result.house+' · '+result.start+'–'+result.year);
  by('ending-herald').replaceChildren(shieldSvg(result.herald));
  const metrics=[
    [String(score.generations),'поколения'],
    [String(score.holdings),'титулы'],
    [String(score.transfers),'переходы земель'],
    [String(score.victories),'победы в войнах'],
    [String(score.decisions),'ваши решения'],
    [String(score.family),'живые наследники']
  ];
  const fragment=document.createDocumentFragment();
  for(const [value,name] of metrics){
    const div=element('div','ending-measure');
    div.append(element('strong','',value),element('span','',name));
    fragment.append(div);
  }
  by('ending-stats').replaceChildren(fragment);
  const entries=document.createDocumentFragment();
  for(const e of result.timeline){
    const li=element('li','ending-event');
    const year=element('time','',String(e.year));
    const content=element('div','ending-event-copy');
    content.append(element('strong','',e.heading),element('span','',e.detail));
    li.append(year,content);entries.append(li);
  }
  by('ending-timeline').replaceChildren(entries);
  by('continue-legacy').hidden=game.finished;
  by('ending-screen').dataset.outcome=result.id;
}
function exportChronicle(){
  if(!game)return;
  const content=campaignChronicleText(game);
  const file=new Blob([content],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');
  link.href=url;link.download='venets-'+game.seed+'-'+game.world.year+'.txt';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}

function closeGameToMenu(){pause();saveGame();menu()}
by('restore-backup').addEventListener('click',()=>{
  if(!backupRaw)return;
  pause();by('restore-dialog').returnValue='';by('restore-dialog').showModal();
});
by('restore-dialog').addEventListener('close',async()=>{
  if(by('restore-dialog').returnValue!=='confirm'||!backupRaw)return;
  pause();by('restore-backup').disabled=true;
  try{
    await saveQueue; // never race a pending auto-save of the newer campaign
    const prior=validBackup(backupRaw);
    if(!prior)throw Error('Резервная запись повреждена');
    const restored=loadCampaign(prior);
    await writeSave(prior,{rotate:false}); // preserve checkpoint, never overwrite it with corrupted active
    saved=prior;game=restored;panel='lands';atlasView='atlas';familyFocus=null;
    selectedProvince='pr-'+game.startCountyId.slice(-2);atlasRegion=0;
    notify('Резервная хроника восстановлена');
    resume();
  }catch(e){notify('Не удалось восстановить: '+e.message)}
  finally{by('restore-backup').disabled=false}
});
document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>setSpeed(Number(b.dataset.speed))));
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{panel=b.dataset.panel;by('game-screen').dataset.activePanel=panel;
  for(const n of document.querySelectorAll('[data-panel]')){const selected=n.dataset.panel===panel;n.classList.toggle('active',selected);n.setAttribute('aria-pressed',String(selected))}
}));
document.querySelectorAll('[data-atlas-view]').forEach(button=>button.addEventListener('click',()=>selectAtlasView(button.dataset.atlasView)));
by('region-prev').addEventListener('click',()=>moveRegion(-1));
by('region-next').addEventListener('click',()=>moveRegion(1));
document.querySelectorAll('[data-start-rank]').forEach(button=>button.addEventListener('click',()=>{
  startRank=button.dataset.startRank;buildStarts();
}));
by('start-region-prev').addEventListener('click',()=>{
  startRegion=(startRegion+3)%4;buildStarts();
});
by('start-region-next').addEventListener('click',()=>{
  startRegion=(startRegion+1)%4;buildStarts();
});
document.querySelectorAll('[data-world-size]').forEach(button=>button.addEventListener('click',()=>{
  selectedSize=Number(button.dataset.worldSize);startRegion=0;
  for(const b of document.querySelectorAll('[data-world-size]')){
    const selected=Number(b.dataset.worldSize)===selectedSize;
    b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
  }
  buildStarts();
}));
by('genealogy-return').addEventListener('click',()=>{familyFocus=game?.playerId; if(game)renderFamilyPanel()});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;renderChronicle()}));
by('next-year').addEventListener('click',nextYear);
by('back-menu').addEventListener('click',()=>{if(screen==='docs'){menu()}else closeGameToMenu()});
by('open-docs').addEventListener('click',()=>{pause();screenTo('docs')});
by('close-docs').addEventListener('click',menu);
by('resume').addEventListener('click',resume);
by('begin').addEventListener('click',showNewConfirmation);
by('ending-new').addEventListener('click',()=>{pause();menu()});
by('download-chronicle').addEventListener('click',exportChronicle);
by('continue-legacy').addEventListener('click',()=>{
  try{extendCampaign(game);saveGame();play()}catch(e){notify(e.message)}
});
by('seed-input').addEventListener('change',buildStarts);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
window.addEventListener('pagehide',()=>{pause()});
// Inspector frame uses the *real renderers and state transitions* in an isolated
// deterministic sandbox. Preview routes never access the player's IndexedDB or
// campaign localStorage; only the parent window owns the debug menu.
function initPreview(id){
  if(!INSPECTOR_SCREENS.some(item=>item.id===id))throw Error('Неизвестный экран: '+id);
  selectedCounty='co-01';
  selectedSize=12;atlasRegion=0;
  selectedProvince='pr-01';
  atlasChanges=[];
  familyFocus=null;
  atlasView='atlas';
  panel='council';
  filter='house';
  if(id==='loading'){screenTo('loading');return}
  if(id==='menu'||id==='invalid-seed'){menu();
    if(id==='invalid-seed'){by('seed-input').value='-12';buildStarts()}
    return;
  }
  // No persistency, no reconstruction of the user's actual game:
  // each preview gets a new seeded political world.
  game=startCampaign({seed:413,countyId:'co-01',size:id==='expanded-atlas'?48:12});
  if(id==='menu-resume'){menu();return}
  if(id==='docs'){screenTo('docs');return}
  if(id==='ending'||id==='ending-crown'){
    if(id==='ending-crown'){
      const crown=game.world.titles.find(t=>t.rank==='kingdom');
      changeTitleHolder(game.world,{titleId:crown.id,newHolderId:game.playerId,
        cause:'inspector-demonstration-legal-coronation'});
    }
    game.goalYear=1067;
    campaignYear(game); // real turn resolves the short testing chapter
    renderEnding();screenTo('ending');return;
  }
  if(id==='war'){
    const order=campaignChoices(game).find(a=>a.kind==='war');
    if(!order)throw Error('No legal war in inspection seed');
    campaignAction(game,order);panel='lands';
  }
  if(id==='lands'||id==='atlas'||id==='expanded-atlas')panel='lands';
  if(id==='genealogy'){panel='lands';atlasView='family'}
  if(id==='title-transfer'){
    panel='lands';
    const before=atlasOwnerSnapshot(game.world);
    for(let i=0;i<12;i++){campaignYear(game); if(transferHighlights(before,game.world).length)break}
    atlasChanges=transferHighlights(before,game.world);
  }
  if(id==='history')panel='history';
  play();
  if(id==='confirm'){
    const action=campaignChoices(game).find(a=>a.kind==='petition')||campaignChoices(game)[0];
    if(!action)throw Error('Нет допустимого действия для предпросмотра');
    askAction(action);
  }
  if(id==='decision'){
    const action=campaignChoices(game).find(a=>a.kind==='petition')||campaignChoices(game)[0];
    if(!action)throw Error('Нет допустимого действия для предпросмотра');
    const result=campaignAction(game,action);
    renderGame();
    const pane=by('last-action');
    pane.replaceChildren(element('strong','',result.success?'Решение принято':'Прошение отклонено'),
      element('span','',result.success?
        'Юридический результат записан в титульную историю.':
        'Владелец отказал. Претензия сохранилась, отношения ухудшились.'));
    pane.hidden=false;
  }
  if(id==='notice')notify('Династическое событие: наследственные права изменились. Время остановлено.');
  if(id==='restart'){const dialog=by('new-dialog');dialog.returnValue='';dialog.showModal()}
}
if(IS_PREVIEW){
  // A physical-key shortcut still works after the preview iframe gains focus.
  window.addEventListener('keydown',event=>{
    if(event.code==='Backquote'&&!event.repeat){
      event.preventDefault();
      window.parent?.postMessage({type:'venets-inspector-toggle'},location.origin);
    }
  },true);
  try{initPreview(PREVIEW_ID)}
  catch(error){screenTo('loading');notify('Не удалось открыть тестовый экран: '+error.message);console.error(error)}
}else{
  installUIInspector();
  // Storage is read exactly once on the real app only.
  (async()=>{
    try{
      const {active,backup}=await initializeStorage();
      backupRaw=validBackup(backup);
      if(active){
        try{const restored=loadCampaign(active);saved=active;game=restored}
        catch(e){
          saved=null;game=null;
          notify(backupRaw?'Основная хроника повреждена. Можно восстановить резервную.':
            'Не удалось прочитать хронику: '+e.message);
        }
      }
      menu();
    }catch(e){menu();notify('Ошибка запуска: '+e.message)}
  })();
}
