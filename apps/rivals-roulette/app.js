import { installMobileRuntime } from '../../shared/mobile-runtime.js';
installMobileRuntime();

const STORAGE_KEY='pocket-works:rivals-roulette:state:v1';
const roleLabel={vanguard:'ТАНК',duelist:'ДУЭЛИСТ',strategist:'СТРАТЕГ'};
const roleColor={vanguard:'#3e7bfa',duelist:'#e33f49',strategist:'#3f9f6a'};
const heroes=[
['Adam Warlock',['strategist']],['Angela',['vanguard']],['Black Cat',['duelist']],['Black Panther',['duelist']],['Black Widow',['duelist']],['Blade',['duelist']],['Captain America',['vanguard']],['Cloak & Dagger',['strategist']],['Cyclops',['duelist']],['Daredevil',['duelist']],['Deadpool',['vanguard','duelist','strategist']],['Devil Dinosaur',['vanguard']],['Doctor Strange',['vanguard']],['Elsa Bloodstone',['duelist']],['Emma Frost',['vanguard']],['Gambit',['strategist']],['Groot',['vanguard']],['Hawkeye',['duelist']],['Hela',['duelist']],['Hulk',['vanguard']],['Human Torch',['duelist']],['Invisible Woman',['strategist']],['Iron Fist',['duelist']],['Iron Man',['duelist']],['Jeff the Land Shark',['strategist']],['Jubilee',['strategist']],['Loki',['strategist']],['Luna Snow',['strategist']],['Magik',['duelist']],['Magneto',['vanguard']],['Mantis',['strategist']],['Mister Fantastic',['duelist']],['Moon Knight',['duelist']],['Namor',['duelist']],['Peni Parker',['vanguard']],['Phoenix',['duelist']],['Psylocke',['duelist']],['Rocket Raccoon',['strategist']],['Rogue',['vanguard']],['Scarlet Witch',['duelist']],['Spider-Man',['duelist']],['Squirrel Girl',['duelist']],['Star-Lord',['duelist']],['Storm',['duelist']],['The Hood',['vanguard']],['The Punisher',['duelist']],['The Thing',['vanguard']],['Thor',['vanguard']],['Ultron',['strategist']],['Venom',['vanguard']],['White Fox',['strategist']],['Winter Soldier',['duelist']],['Wolverine',['duelist']]
].map(([name,roles])=>({name,roles,id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}));

const $=s=>document.querySelector(s);
const els={wheel:$('#wheel'),center:$('#wheelCenter'),winnerName:$('#winnerName'),winnerRole:$('#winnerRole'),winnerMeta:$('#winnerMeta'),poolCount:$('#poolCount'),spin:$('#spinBtn'),spinHint:$('#spinHint'),remaining:$('#remainingText'),history:$('#history'),banCount:$('#banCount'),sheet:$('#sheet'),sheetBackdrop:$('#sheetBackdrop'),sheetTitle:$('#sheetTitle'),sheetContent:$('#sheetContent'),toast:$('#toast')};
let state=loadState();
let rotation=0;
let spinning=false;
let toastTimer;

function loadState(){
  const base={role:'all',noRepeat:true,banned:[],used:[],history:[],sound:false};
  try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY));return {...base,...raw,banned:Array.isArray(raw?.banned)?raw.banned:[],used:Array.isArray(raw?.used)?raw.used:[],history:Array.isArray(raw?.history)?raw.history:[]};}catch{return base;}
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
function cryptoIndex(max){if(max<=1)return 0;const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%max;}
function matchesRole(hero){return state.role==='all'||hero.roles.includes(state.role);}
function eligible(includeUsed=false){return heroes.filter(h=>matchesRole(h)&&!state.banned.includes(h.id)&&(includeUsed||!state.noRepeat||!state.used.includes(h.id)));}
function fullPool(){return heroes.filter(h=>matchesRole(h)&&!state.banned.includes(h.id));}
function activeRoleFor(hero){return state.role!=='all'&&hero.roles.includes(state.role)?state.role:hero.roles[0];}
function showToast(text){els.toast.textContent=text;els.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>els.toast.classList.remove('show'),1500);}
function vibrate(pattern=12){navigator.vibrate?.(pattern);}

function renderWheel(){
  const pool=fullPool();
  els.poolCount.textContent=pool.length;
  if(!pool.length){els.wheel.style.background='#bdb5aa';return;}
  const step=100/pool.length;
  const stops=pool.map((h,i)=>`${roleColor[activeRoleFor(h)]} ${(i*step).toFixed(3)}% ${((i+1)*step).toFixed(3)}%`).join(',');
  els.wheel.style.background=`conic-gradient(${stops})`;
}
function renderRoleButtons(){document.querySelectorAll('.role').forEach(b=>b.classList.toggle('active',b.dataset.role===state.role));}
function renderHistory(){
  if(!state.history.length){els.history.innerHTML='<p class="empty">Здесь появятся результаты колеса.</p>';return;}
  els.history.innerHTML=state.history.slice(0,12).map(x=>`<div class="history-chip"><i style="background:${roleColor[x.role]}"></i>${escapeHtml(x.name)}</div>`).join('');
}
function renderStatus(){
  const pool=fullPool(), left=eligible().length;
  els.remaining.textContent=state.noRepeat?`${left} осталось`:'повторы разрешены';
  els.banCount.textContent=`${state.banned.length} исключено`;
  $('#noRepeatBtn').classList.toggle('active',state.noRepeat);
  els.spin.disabled=!pool.length||spinning;
  els.spinHint.textContent=pool.length?`${pool.length} в пуле`:'пул пуст';
}
function render(){renderWheel();renderRoleButtons();renderHistory();renderStatus();}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function resetUsedForCurrentPool(){const ids=new Set(fullPool().map(h=>h.id));state.used=state.used.filter(id=>!ids.has(id));save();}
function pickHero(){
  let pool=eligible();
  if(!pool.length&&fullPool().length&&state.noRepeat){resetUsedForCurrentPool();pool=eligible();showToast('Пул пройден — начинаем заново');}
  if(!pool.length)return null;
  return pool[cryptoIndex(pool.length)];
}
function record(hero){
  const role=activeRoleFor(hero);
  if(state.noRepeat&&!state.used.includes(hero.id))state.used.push(hero.id);
  state.history.unshift({id:hero.id,name:hero.name,role,at:Date.now()});state.history=state.history.slice(0,30);save();return role;
}
function animateTo(hero,duration=1750){
  const pool=fullPool();const index=Math.max(0,pool.findIndex(h=>h.id===hero.id));const slice=360/Math.max(1,pool.length);const target=360-(index+.5)*slice;
  rotation+=1440+((target-(rotation%360)+360)%360);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  els.wheel.style.transition=reduced?'none':`transform ${duration}ms cubic-bezier(.12,.62,.12,1)`;
  els.wheel.style.transform=`rotate(${rotation}deg)`;
  return reduced?80:duration;
}
async function spinOnce({quick=false}={}){
  if(spinning)return null;const hero=pickHero();if(!hero){showToast('В пуле никого нет');return null;}
  spinning=true;renderStatus();vibrate(10);
  els.winnerRole.textContent='КОЛЕСО КРУТИТСЯ';els.winnerName.textContent='…';els.winnerMeta.textContent='без подстав и судьбоносного ИИ';
  const wait=animateTo(hero,quick?760:1750);
  await new Promise(r=>setTimeout(r,wait+40));
  const role=record(hero);
  els.winnerRole.textContent=roleLabel[role];els.winnerRole.style.color=roleColor[role];els.winnerName.textContent=hero.name;els.winnerMeta.textContent=hero.roles.length>1?'Deadpool подходит под выбранный ролевой пул':`выпал из ${fullPool().length} доступных`;
  els.center.querySelector('strong').textContent=hero.name[0].toUpperCase();vibrate([18,35,28]);
  spinning=false;render();return hero;
}
async function runSeries(){
  if(spinning)return;const results=[];
  for(let i=0;i<3;i++){const hero=await spinOnce({quick:true});if(!hero)break;results.push(hero.name);if(i<2)await new Promise(r=>setTimeout(r,180));}
  if(results.length)showToast(`Серия: ${results.join(' · ')}`);
}

function openSheet(mode){
  els.sheet.hidden=false;els.sheetBackdrop.hidden=false;document.body.style.overflow='hidden';
  if(mode==='ban'){els.sheetTitle.textContent='Бан-лист';renderBanSheet();}else{els.sheetTitle.textContent='Настройки';renderSettingsSheet();}
}
function closeSheet(){els.sheet.hidden=true;els.sheetBackdrop.hidden=true;document.body.style.overflow='';}
function renderBanSheet(){
  els.sheetContent.innerHTML=`<div class="ban-grid">${heroes.map(h=>{const banned=state.banned.includes(h.id), role=h.roles[0];return `<button class="ban-hero ${banned?'banned':''}" data-ban-id="${h.id}" data-native-press><span class="role-dot" style="background:${roleColor[role]}"></span><strong>${escapeHtml(h.name)}</strong></button>`}).join('')}</div>`;
  els.sheetContent.querySelectorAll('[data-ban-id]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.banId;state.banned=state.banned.includes(id)?state.banned.filter(x=>x!==id):[...state.banned,id];state.used=state.used.filter(x=>x!==id);save();render();renderBanSheet();vibrate(8);}));
}
function renderSettingsSheet(){
  els.sheetContent.innerHTML=`<div class="settings-stack">
    <div class="setting-row"><div><strong>Режим без повторов</strong><small>Герой не выпадет снова, пока пул не закончится.</small></div><button data-setting="repeat">${state.noRepeat?'ВКЛ':'ВЫКЛ'}</button></div>
    <div class="setting-row"><div><strong>Сбросить пройденный пул</strong><small>Вернуть всех уже выпавших героев.</small></div><button data-setting="reset">СБРОС</button></div>
    <div class="setting-row"><div><strong>Очистить бан-лист</strong><small>Снова разрешить всех ${heroes.length} героев.</small></div><button data-setting="unban">ОЧИСТИТЬ</button></div>
  </div>`;
  els.sheetContent.querySelector('[data-setting="repeat"]').onclick=()=>{state.noRepeat=!state.noRepeat;save();render();renderSettingsSheet();};
  els.sheetContent.querySelector('[data-setting="reset"]').onclick=()=>{state.used=[];save();render();showToast('Пул восстановлен');};
  els.sheetContent.querySelector('[data-setting="unban"]').onclick=()=>{state.banned=[];save();render();renderSettingsSheet();showToast('Бан-лист очищен');};
}

document.querySelectorAll('.role').forEach(btn=>btn.addEventListener('click',()=>{if(spinning)return;state.role=btn.dataset.role;save();render();vibrate(7);}));
els.spin.addEventListener('click',()=>spinOnce());
$('#noRepeatBtn').addEventListener('click',()=>{if(spinning)return;state.noRepeat=!state.noRepeat;save();render();showToast(state.noRepeat?'Повторы выключены':'Повторы разрешены');});
$('#seriesBtn').addEventListener('click',runSeries);
$('#banBtn').addEventListener('click',()=>openSheet('ban'));
$('#settingsBtn').addEventListener('click',()=>openSheet('settings'));
$('#closeSheetBtn').addEventListener('click',closeSheet);els.sheetBackdrop.addEventListener('click',closeSheet);
$('#clearHistoryBtn').addEventListener('click',()=>{state.history=[];save();renderHistory();showToast('История очищена');});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!els.sheet.hidden)closeSheet();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});window.addEventListener('pagehide',save);

render();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
